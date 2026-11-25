import { useEffect, useMemo, useState } from "react";
import { COUNTRY_LIST, REGIONS, countryOf } from "../../data/countries";
import { DIVISIONS, DIVISION_IDS, typicalWalk, type DivisionId, type Sex } from "../../data/divisions";
import { apeBand, bodyEffects, BUILD_IDS, BUILDS, cutDifficulty, defaultWalk, walkRange, type Build } from "../../data/body";
import { ATTR_INFO, type AttrKey } from "../../model/attributes";
import { ARTS, ART_IDS, type BaseArt } from "../../data/styles";
import { PROMOTIONS, promoFor } from "../../data/promotions";
import { ovr } from "../../model/attributes";
import type { Stance, World } from "../../model/types";
import { createWorld, starterClients, addControlled, type CreatedFighter, type NewGameOptions, type StartLevel, type Talent } from "../../world/create";
import { realFighter, type RosterFile } from "../../world/real";
import { potentialText } from "../../world/development";
import { loadRoster, newGame, setBusy, setWorld, toast } from "../../state/store";
import { saveWorld } from "../../state/persist";
import { clamp, heightText } from "../../core/util";
import { go } from "../router";
import { Flag, Ovr, Panel, Seg } from "../components";
import { Logo } from "../icons";
import { fullName, recordText } from "../../world/core";
import { FIGHT_STYLES, GRAPPLE_STYLES, STRIKE_STYLES, stylesForArt, type GrappleStyle, type StrikeStyle } from "../../data/fightstyles";

/** The styles a background offers first: its own, then the common ones. */
function styleChoices(art: BaseArt, kind: "strike" | "grapple"): string[] {
  const own = stylesForArt(art, kind);
  const common = kind === "strike" ? ["volume", "pressure", "counter", "basic"] : ["scrambler", "sprawl", "chain", "backTaker"];
  return [...new Set([...own, ...common])].slice(0, 5);
}

type Step = "mode" | "origin" | "create" | "real" | "review" | "agency" | "clients";

/** The home town as it will be saved: what was chosen or typed, or the country's first city. */
function townOf(cf: CreatedFighter): string {
  return cf.hometown?.replace(/\s+/g, " ").trim() || countryOf(cf.country).cities[0];
}

const OTHER_TOWN = "__other";

const TALENT: { v: Talent; label: string; sub: string; desc: string }[] = [
  { v: "average", label: "Hard worker", sub: "Potential about 72", desc: "A limited ceiling and a grinder's career." },
  { v: "prospect", label: "Prospect", sub: "Potential about 82", desc: "Real talent: a UFC fighter if it goes right." },
  { v: "phenom", label: "Phenom", sub: "Potential about 90", desc: "Once in a generation: built to be champion." },
];
const START: { v: StartLevel; label: string; record: string; desc: string }[] = [
  { v: "amateur", label: "Amateur", record: "0-0", desc: "0-0 on your region's IMMAF circuit. No purses; turn pro when a promoter calls." },
  { v: "debut", label: "Pro debut", record: "0-0", desc: "0-0 as a pro at your region's local show, after a 4-1 amateur career." },
  { v: "regional", label: "Regional prospect", record: "5-1", desc: "5-1 and signed to your region's regional promotion." },
];

/** Where a created fighter starts: the region's amateur circuit, local show or regional promotion. */
function startPromo(cf: CreatedFighter, start: StartLevel = cf.start) {
  return promoFor(countryOf(cf.country).region, start === "amateur" ? "amateur" : start === "debut" ? "local" : "regional") ?? PROMOTIONS.cffc;
}

/** One of a few options as small tiles: a name and a short line each (the full text goes under the tiles). */
function Tiles<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { v: T; label: string; sub?: string; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tiles" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" className={`tile${o.v === value ? " on" : ""}`} role="radio" aria-checked={o.v === value} aria-label={o.sub ? `${o.label}, ${o.sub}` : o.label} title={o.title} onClick={() => onChange(o.v)}>
          <b>{o.label}</b>
          {o.sub && <span>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function NewGame() {
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<"fighter" | "manager">("fighter");
  const [difficulty, setDifficulty] = useState<NewGameOptions["difficulty"]>("normal");
  const [cf, setCf] = useState<CreatedFighter>({
    first: "",
    surname: "",
    nick: "",
    sex: "M",
    country: "US",
    div: "LW",
    age: 20,
    height: 70,
    reach: 72,
    stance: "orthodox",
    art: "wrestling",
    talent: "prospect",
    start: "debut",
  });
  const [takeover, setTakeover] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterFile | null>(null);
  const [agency, setAgency] = useState("Apex Fight Management");
  const [managerName, setManagerName] = useState("");
  const [draft, setDraft] = useState<World | null>(null);
  const [picks, setPicks] = useState<string[]>([]);

  useEffect(() => {
    loadRoster().then(setRoster).catch((e) => toast(String(e), "bad"));
  }, []);

  const steps: Step[] = mode === "fighter" ? ["mode", "origin", takeover !== null || step === "real" ? "real" : "create", "review"] : ["mode", "agency", "clients"];
  const stepName: Record<Step, string> = { mode: "Career", origin: "Fighter", create: "Create", real: "Real fighter", review: "Start", agency: "Agency", clients: "Clients" };

  // Chosen up front so the real-fighter list shows the potential this world will have.
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));

  const start = async () => {
    if (mode === "fighter") {
      if (takeover) {
        await newGame({ name: "Career", seed, mode, difficulty, takeover });
      } else {
        if (!cf.first.trim() || !cf.surname.trim()) {
          toast("Give your fighter a name.", "bad");
          setStep("create");
          return;
        }
        const strike = (cf.strike ?? styleChoices(cf.art, "strike")[0]) as StrikeStyle;
        const grapple = (cf.grapple ?? styleChoices(cf.art, "grapple")[0]) as GrappleStyle;
        await newGame({ name: "Career", seed, mode, difficulty, created: { ...cf, strike, grapple, build: cf.build ?? "athletic", walk: bodyWalk(cf), first: cf.first.trim(), surname: cf.surname.trim(), nick: cf.nick?.trim() || undefined, hometown: townOf(cf) } });
      }
      go("/home");
    } else if (draft) {
      for (const id of picks) addControlled(draft, draft.fighters[id]);
      draft.inbox[0].body = draft.inbox[0].body.replace(/You manage \d+ fighters?/, `You manage ${picks.length} fighter${picks.length === 1 ? "" : "s"}`);
      setWorld(draft);
      void saveWorld(draft);
      go("/home");
    }
  };

  const buildDraft = async () => {
    setBusy("Building the world…");
    await new Promise((r) => setTimeout(r, 30));
    try {
      const ros = await loadRoster();
      const w = createWorld(ros, { name: "Career", seed: Math.floor(Math.random() * 2 ** 31), mode: "manager", difficulty, agency, managerName: managerName || "You" });
      setDraft(w);
      setPicks([]);
      setStep("clients");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <header className="band">
        <div className="wrap" style={{ paddingTop: 26, paddingBottom: 0 }}>
          <div className="spread">
            <div className="row"><Logo size={32} /><span className="label" style={{ color: "var(--band-ink-3)" }}>MMA Manager</span></div>
            <button className="btn sm" onClick={() => go("/")}>Back to the title screen</button>
          </div>
          <h1 style={{ marginTop: 22 }}>New career</h1>
          <div className="steps">
            {steps.map((s, i) => (
              <div key={s} className={s === step ? "on" : steps.indexOf(step) > i ? "done" : ""}>
                {i + 1}. {stepName[s]}
              </div>
            ))}
          </div>
        </div>
      </header>
      <div className="wrap page-body">

      {step === "mode" && (
        <Panel title="What kind of career?">
          <div className="choice-grid">
            <button className={`choice${mode === "fighter" ? " on" : ""}`} onClick={() => setMode("fighter")}>
              <b>Fighter career</b>
              <span>You are the fighter. Train, cut weight, take fights, negotiate, corner yourself round by round, and chase the belt.</span>
            </button>
            <button className={`choice${mode === "manager" ? " on" : ""}`} onClick={() => setMode("manager")}>
              <b>Manager</b>
              <span>Run an MMA management company. Sign clients, take 10-20% of their purses, negotiate their deals, plan their camps and build a stable of champions.</span>
            </button>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <span className="small dim">Difficulty</span>
            <Seg value={difficulty} onChange={setDifficulty} options={[{ v: "easy", label: "Easy" }, { v: "normal", label: "Normal" }, { v: "hard", label: "Hard" }]} />
            <div style={{ flex: 1 }} />
            <button className="btn primary" onClick={() => setStep(mode === "fighter" ? "origin" : "agency")}>Next</button>
          </div>
        </Panel>
      )}

      {step === "origin" && (
        <Panel title="Your fighter">
          <div className="choice-grid">
            <button className="choice" onClick={() => { setTakeover(null); setStep("create"); }}>
              <b>Create a fighter</b>
              <span>Name, home town, weight class, martial arts background, body and talent. Start as an amateur, a debutant or a regional prospect.</span>
            </button>
            <button className="choice" onClick={() => setStep("real")}>
              <b>Take over a real fighter</b>
              <span>Any fighter on the UFC or PFL roster of autumn 2026: their record, ranking, contract and rivals.</span>
            </button>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => setStep("mode")}>Back</button>
          </div>
        </Panel>
      )}

      {step === "create" && <CreateForm cf={cf} setCf={setCf} onBack={() => setStep("origin")} onNext={() => setStep("review")} />}

      {step === "real" && roster && (
        <RealPicker roster={roster} seed={seed} value={takeover} onPick={setTakeover} onBack={() => { setTakeover(null); setStep("origin"); }} onNext={() => takeover && setStep("review")} />
      )}

      {step === "review" && (
        <Panel title="Ready">
          <div className="prose" style={{ maxWidth: 760 }}>
            {takeover && roster ? (
              <p>
                You take over <b>{roster.fighters.find((f) => f.id === takeover)?.n}</b> on the {roster.fighters.find((f) => f.id === takeover)?.p.toUpperCase()} roster, on 5 October 2026.
              </p>
            ) : (
              <p>
                <b>
                  {cf.first} {cf.nick ? `"${cf.nick}" ` : ""}
                  {cf.surname}
                </b>
                , {cf.age}, from {townOf(cf)}, {countryOf(cf.country).name}; {DIVISIONS[cf.div].name.toLowerCase()}, {heightText(cf.height)} with a {inches(cf.reach)} reach, a {BUILDS[cf.build ?? "athletic"].name.toLowerCase()} build walking at {bodyWalk(cf)} lb, {ARTS[cf.art].name.toLowerCase()} background ({FIGHT_STYLES[(cf.strike ?? styleChoices(cf.art, "strike")[0]) as StrikeStyle].name.toLowerCase()}, {FIGHT_STYLES[(cf.grapple ?? styleChoices(cf.art, "grapple")[0]) as GrappleStyle].name.toLowerCase()}). Starts as a{" "}
                {START.find((s) => s.v === cf.start)?.label.toLowerCase()} at {startPromo(cf).name}.
              </p>
            )}
            <p>Difficulty: {difficulty}. The game saves itself in this browser after every step of the calendar; export a save file from Settings to keep a copy.</p>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setStep(takeover ? "real" : "create")}>Back</button>
            <button className="btn primary lg" onClick={start}>Start career</button>
          </div>
        </Panel>
      )}

      {step === "agency" && (
        <Panel title="Your agency">
          <div className="grid">
            <label className="field c6">
              Agency name
              <input className="input" value={agency} onChange={(e) => setAgency(e.target.value)} />
            </label>
            <label className="field c6">
              Your name
              <input className="input" value={managerName} onChange={(e) => setManagerName(e.target.value)} placeholder="Manager" />
            </label>
          </div>
          <p className="small dim" style={{ marginTop: 12 }}>
            You start with $60,000, one agent and a small office. Next you choose up to three clients from the prospects on the regional scene and the PFL.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setStep("mode")}>Back</button>
            <button className="btn primary" onClick={buildDraft} disabled={!agency.trim()}>Next</button>
          </div>
        </Panel>
      )}

      {step === "clients" && draft && (
        <Panel title="Choose your first clients" hint={`${picks.length} of 3`}>
          <ClientPicker w={draft} picks={picks} setPicks={setPicks} />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setStep("agency")}>Back</button>
            <button className="btn primary lg" onClick={start} disabled={!picks.length}>Open the agency</button>
          </div>
        </Panel>
      )}
      </div>
    </div>
  );
}

/** The walking weight the fighter will have: the one chosen, or the build's usual at the division. */
function bodyWalk(cf: CreatedFighter): number {
  const [lo, hi] = walkRange(cf.div);
  return clamp(cf.walk ?? defaultWalk(cf.div, cf.build ?? "athletic"), lo, hi);
}

/** Inches, with the half when there is one: 84.5". */
function inches(x: number): string {
  return `${Number.isInteger(x) ? x : x.toFixed(1)}"`;
}

/** What the height does, against the division's average in the UFC. */
function frameText(h: number, avg: number, div: string): string {
  const d = Math.round((h - avg) * 2) / 2;
  if (Math.abs(d) < 1) return `Right on the ${div} average.`;
  return d > 0 ? `${inches(d)} over the ${div} average: lighter on the feet at range, a little less strength in the clinch.` : `${inches(-d)} under the ${div} average: stronger in the clinch, a little slower on the feet.`;
}


export function CreateForm({ cf, setCf, onBack, onNext }: { cf: CreatedFighter; setCf: (c: CreatedFighter) => void; onBack: () => void; onNext: () => void }) {
  const set = <K extends keyof CreatedFighter>(k: K, v: CreatedFighter[K]) => setCf({ ...cf, [k]: v });
  // Home town: the country's cities to pick from, or any town typed in.
  const cities = countryOf(cf.country).cities;
  const [otherTown, setOtherTown] = useState(() => !!cf.hometown && !cities.includes(cf.hometown));
  const setCountry = (country: string) => {
    setOtherTown(false);
    setCf({ ...cf, country, hometown: countryOf(country).cities[0] });
  };
  const pickTown = (v: string) => {
    setOtherTown(v === OTHER_TOWN);
    set("hometown", v === OTHER_TOWN ? "" : v);
  };
  const townMissing = otherTown && !cf.hometown?.trim();
  const divs = DIVISION_IDS.filter((d) => DIVISIONS[d].sex === cf.sex);
  const d = DIVISIONS[cf.div];
  const setSex = (s: Sex) => {
    const div = DIVISION_IDS.find((x) => DIVISIONS[x].sex === s && (s === "F" ? x === "WFLY" : x === "LW"))!;
    setCf({ ...cf, sex: s, div, height: Math.round(DIVISIONS[div].height), reach: Math.round(DIVISIONS[div].reach), walk: defaultWalk(div, cf.build ?? "athletic") });
  };
  const build: Build = cf.build ?? "athletic";
  const setDiv = (div: DivisionId) => setCf({ ...cf, div, height: Math.round(DIVISIONS[div].height), reach: Math.round(DIVISIONS[div].reach), walk: defaultWalk(div, build) });
  // Changing the height keeps the arms: the reach moves with it.
  const setHeight = (h: number) => setCf({ ...cf, height: h, reach: clamp(h + (cf.reach - cf.height), h - 5, h + 9) });
  const ape = Math.round((cf.reach - cf.height) * 2) / 2;
  const band = apeBand(ape);
  const [walkLo, walkHi] = walkRange(cf.div);
  const walk = clamp(cf.walk ?? defaultWalk(cf.div, build), walkLo, walkHi);
  // A new build carries its usual walking weight with it.
  const setBuild = (b: Build) => setCf({ ...cf, build: b, walk: clamp(walk + Math.round((BUILDS[b].walk - BUILDS[build].walk) * d.limit), walkLo, walkHi) });
  const cut = cutDifficulty(cf.div, walk);
  const cutText =
    cut.lb === 0
      ? `Fights at ${walk} lb, under the ${d.limit} lb limit: no cut at all, but giving size away to the big men.`
      : `Cuts ${cut.lb} lb (${Math.round(cut.pct * 100)}%) to make ${d.limit}: ${cut.label === "brutal" ? "a brutal cut" : `${cut.label === "easy" ? "an" : "a"} ${cut.label} cut`}. Heavier is stronger on fight night; a harder cut drains the gas tank and the chin and makes missing weight likelier.`;
  // What the frame does, as the generator applies it, biggest first.
  const fx = (Object.entries(bodyEffects(cf.div, cf.height, walk, build)) as [AttrKey, number][]).filter(([, v]) => Math.abs(v) >= 0.15).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const reachEdge = cf.reach - d.reach;
  const regions = Object.values(REGIONS);
  const styleOf = (kind: "strike" | "grapple") => (kind === "strike" ? cf.strike : cf.grapple) ?? styleChoices(cf.art, kind)[0];
  const talent = TALENT.find((t) => t.v === cf.talent)!;
  const start = START.find((t) => t.v === cf.start)!;
  const name = [cf.first.trim(), cf.nick?.trim() ? `"${cf.nick.trim()}"` : "", cf.surname.trim()].filter(Boolean).join(" ");
  const missing = !cf.first.trim() || !cf.surname.trim() ? "Give your fighter a first name and a surname." : townMissing ? "Type your home town, or pick one from the list." : null;
  return (
    <div className="create">
    <div className="grid">
      <div className="c7 stack">
        <Panel title="Identity">
          <div className="grid">
            <label className="field c4">First name<input className="input" value={cf.first} onChange={(e) => set("first", e.target.value)} placeholder="First name" /></label>
            <label className="field c4">Surname<input className="input" value={cf.surname} onChange={(e) => set("surname", e.target.value)} placeholder="Surname" /></label>
            <label className="field c4">Nickname<input className="input" value={cf.nick} onChange={(e) => set("nick", e.target.value)} placeholder="Optional" /></label>
            <label className="field c6">
              Country
              <select className="input" value={cf.country} onChange={(e) => setCountry(e.target.value)}>
                {regions.map((r) => (
                  <optgroup key={r.id} label={r.name}>
                    {COUNTRY_LIST.filter((c) => c.region === r.id).map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field c6">
              Home town
              <select className="input" value={otherTown ? OTHER_TOWN : cf.hometown || cities[0]} onChange={(e) => pickTown(e.target.value)}>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value={OTHER_TOWN}>Somewhere else…</option>
              </select>
              {otherTown && (
                <input className="input" value={cf.hometown ?? ""} maxLength={40} autoFocus aria-label="Your home town" placeholder={`A town in ${countryOf(cf.country).name}`} onChange={(e) => set("hometown", e.target.value)} />
              )}
            </label>
            <p className="tiny dim c12 town-note">Where the fans back home are: the home-town fan club, the hospital visit and the parade after a title all happen there.</p>
            <label className="field c6">
              Sex
              <Seg value={cf.sex} onChange={setSex} options={[{ v: "M", label: "Men" }, { v: "F", label: "Women" }]} />
            </label>
            <label className="field c6">
              Age: {cf.age}
              <input type="range" min={cf.start === "amateur" ? 16 : 18} max={34} value={cf.age} onChange={(e) => set("age", Number(e.target.value))} />
            </label>
          </div>
        </Panel>
        <Panel title="Weight class and body" hint="The frame moves points between attributes: the overall stays the same">
          <div className="row" style={{ marginBottom: 14 }}>
            {divs.map((x) => (
              <button key={x} className={`btn sm${cf.div === x ? " on" : ""}`} onClick={() => setDiv(x)}>
                {DIVISIONS[x].name.replace("Women's ", "")} <span className="dim">{DIVISIONS[x].limit}</span>
              </button>
            ))}
          </div>
          <div className="tape" aria-label="Tale of the tape">
            <div><span>Height</span><b>{heightText(cf.height)}</b><i>{Math.round(cf.height * 2.54)} cm</i></div>
            <div><span>Reach</span><b>{inches(cf.reach)}</b><i>{Math.round(cf.reach * 2.54)} cm</i></div>
            <div className={band.tone}><span>Ape index</span><b>{ape > 0 ? "+" : ape < 0 ? "−" : ""}{inches(Math.abs(ape))}</b><i>{band.label}</i></div>
            <div className={cut.label === "hard" || cut.label === "brutal" ? "hot" : ""}><span>Walks at</span><b>{walk} lb</b><i>{cut.lb > 0 ? `cuts ${cut.lb} lb · ${cut.label}` : "no cut"}</i></div>
            <div><span>Build</span><b>{BUILDS[build].name}</b><i>{BUILDS[build].sub}</i></div>
          </div>
          <div className="grid body-grid">
            <label className="field c6">
              <span className="body-h"><span>Height</span><b>{heightText(cf.height)} · {Math.round(cf.height * 2.54)} cm</b></span>
              <input type="range" min={Math.round(d.height - 6)} max={Math.round(d.height + 6)} value={cf.height} onChange={(e) => setHeight(Number(e.target.value))} />
              <span className="field-note">{frameText(cf.height, d.height, d.name.toLowerCase())}</span>
            </label>
            <label className="field c6">
              <span className="body-h"><span>Reach</span><b>{inches(cf.reach)} · {Math.round(cf.reach * 2.54)} cm</b></span>
              <input type="range" min={cf.height - 5} max={cf.height + 9} step={0.5} value={cf.reach} onChange={(e) => set("reach", Number(e.target.value))} />
              <span className="field-note">{band.note} Long arms win at range and give a little back in the pocket, where the shorter man wants to be.</span>
            </label>
            <div className="field c12">
              <span className="body-h"><span>Build</span><b>{BUILDS[build].name}</b></span>
              <Tiles label="Build" value={build} onChange={setBuild} options={BUILD_IDS.map((b) => ({ v: b, label: BUILDS[b].name, sub: BUILDS[b].sub }))} />
              <span className="field-note">{BUILDS[build].desc}</span>
            </div>
            <label className="field c6">
              <span className="body-h"><span>Walking weight</span><b>{walk} lb · {Math.round(walk * 0.4536)} kg</b></span>
              <input type="range" min={walkLo} max={walkHi} value={walk} onChange={(e) => set("walk", Number(e.target.value))} />
              <span className="field-note">{cutText}</span>
            </label>
            <label className="field c6">
              Stance
              <Seg<Stance> value={cf.stance} onChange={(v) => set("stance", v)} options={[{ v: "orthodox", label: "Orthodox" }, { v: "southpaw", label: "Southpaw" }, { v: "switch", label: "Switch" }]} />
              <span className="field-note">{cf.stance === "southpaw" ? "Lefties are one fighter in five: awkward to prepare for." : cf.stance === "switch" ? "Both stances: the angles change mid-fight." : "Four fighters in five lead with the left foot."}</span>
            </label>
          </div>
          <div className="body-fx" aria-label="What the body does">
            <div className="label">What your body does</div>
            <div className="fx-chips">
              {fx.map(([k, v]) => (
                <span key={k} className={`fx ${v > 0 ? "gain" : "cost"}`}>{ATTR_INFO[k].name} {v > 0 ? "+" : "−"}{Math.abs(v).toFixed(1)}</span>
              ))}
              {Math.abs(reachEdge) >= 1 && (
                <span className={`fx ${reachEdge > 0 ? "gain" : "cost"}`}>At range {reachEdge > 0 ? "+" : "−"}{(Math.min(8, Math.abs(reachEdge)) * 1.2).toFixed(1)}% accuracy</span>
              )}
              {Math.abs(reachEdge) >= 1 && (
                <span className={`fx ${reachEdge > 0 ? "cost" : "gain"}`}>In the pocket {reachEdge > 0 ? "−" : "+"}{(Math.min(8, Math.abs(reachEdge)) * 0.5).toFixed(1)}%</span>
              )}
              {fx.length === 0 && Math.abs(reachEdge) < 1 && <span className="fx">A standard frame: nothing given up, nothing extra</span>}
            </div>
            <p className="small dim" style={{ marginTop: 8 }}>
              Against an average {d.name.toLowerCase()} ({heightText(d.height)}, a {inches(Math.round(d.reach * 2) / 2)} reach, walking at {typicalWalk(cf.div)} lb). Attribute points are on the 20-point scale, before the overall is set; the reach numbers are the fight engine's, for punches and kicks.
            </p>
          </div>
        </Panel>
      </div>
      <div className="c5 stack">
        <Panel title="Background">
          <select className="input" style={{ width: "100%" }} value={cf.art} onChange={(e) => setCf({ ...cf, art: e.target.value as BaseArt, strike: undefined, grapple: undefined })} aria-label="Martial arts background">
            {ART_IDS.map((a) => (
              <option key={a} value={a}>{ARTS[a].name}</option>
            ))}
          </select>
          <p className="small muted" style={{ marginTop: 8 }}>{ARTS[cf.art].desc}</p>
          {(["strike", "grapple"] as const).map((kind) => {
            const opts = styleChoices(cf.art, kind);
            const cur = styleOf(kind);
            const all: string[] = kind === "strike" ? STRIKE_STYLES : GRAPPLE_STYLES;
            const what = kind === "strike" ? "How you strike" : "How you grapple";
            return (
              <div key={kind} className="style-pick">
                <div className="label">{what}</div>
                <Tiles
                  label={what}
                  value={cur}
                  onChange={(id) => setCf({ ...cf, [kind]: id })}
                  options={opts.map((id) => {
                    const s = FIGHT_STYLES[id as StrikeStyle];
                    return { v: id, label: s.name, sub: s.arts.includes(cf.art) ? "Your background" : s.from, title: s.desc };
                  })}
                />
                <p className="tile-desc">
                  {!opts.includes(cur) && <b>{FIGHT_STYLES[cur as StrikeStyle].name}: </b>}
                  {FIGHT_STYLES[cur as StrikeStyle].desc}
                </p>
                <select className="input" style={{ width: "100%" }} value={opts.includes(cur) ? "" : cur} onChange={(e) => e.target.value && setCf({ ...cf, [kind]: e.target.value })} aria-label={`Other ${kind === "strike" ? "striking" : "grappling"} styles`}>
                  <option value="">Other styles…</option>
                  {all.filter((id) => !opts.includes(id)).map((id) => (
                    <option key={id} value={id}>{FIGHT_STYLES[id as StrikeStyle].name} ({FIGHT_STYLES[id as StrikeStyle].from})</option>
                  ))}
                </select>
              </div>
            );
          })}
          <p className="tiny dim" style={{ marginTop: 12 }}>A style from your own background starts deeper; any style can be built later with style coaching.</p>
        </Panel>
      </div>
      <div className="c6">
        <Panel title="Talent">
          <Tiles label="Talent" value={cf.talent} onChange={(v) => set("talent", v)} options={TALENT.map((t) => ({ v: t.v, label: t.label, sub: t.sub }))} />
          <p className="tile-desc">{talent.desc}</p>
        </Panel>
      </div>
      <div className="c6">
        <Panel title="Start">
          <Tiles
            label="Start"
            value={cf.start}
            onChange={(v) => setCf({ ...cf, start: v, age: v !== "amateur" && cf.age < 18 ? 18 : cf.age })}
            options={START.map((t) => ({ v: t.v, label: t.label, sub: `${t.record} · ${startPromo(cf, t.v).short}` }))}
          />
          <p className="tile-desc">{start.desc}</p>
        </Panel>
      </div>
    </div>
    {/* The way on stays in view: who you are making, and Back / Next. */}
    <div className="create-bar">
      <div className="cb-who">
        <b>{name || "Your fighter"}</b>
        <span>
          {cf.age}, {DIVISIONS[cf.div].name.toLowerCase()} · {ARTS[cf.art].name} · {FIGHT_STYLES[styleOf("strike") as StrikeStyle].name}, {FIGHT_STYLES[styleOf("grapple") as GrappleStyle].name.toLowerCase()} · {talent.label} · {start.label}, {startPromo(cf).short}
        </span>
      </div>
      {missing && <span className="cb-hint">{missing}</span>}
      <div className="cb-acts">
        <button className="btn" onClick={onBack}>Back</button>
        <button className="btn primary" onClick={onNext} disabled={!!missing}>Next</button>
      </div>
    </div>
    </div>
  );
}

function RealPicker({ roster, seed, value, onPick, onBack, onNext }: { roster: RosterFile; seed: number; value: string | null; onPick: (id: string) => void; onBack: () => void; onNext: () => void }) {
  const [promo, setPromo] = useState<"ufc" | "pfl">("ufc");
  const [div, setDiv] = useState<DivisionId | "all">("all");
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    const rank = new Map<string, number>();
    for (const r of Object.values(roster.ufc.ranks)) {
      if (!r) continue;
      if (r.c) rank.set(r.c, 0);
      r.e.forEach((id, i) => rank.set(id, i + 1));
    }
    for (const id of Object.values(roster.pfl.champs)) if (id) rank.set(id, 0);
    for (const l of Object.values(roster.pfl.ranks)) l?.forEach((id, i) => rank.set(id, i + 1));
    const p4p = new Map(roster.ufc.p4p.map((id, i) => [id, i + 1] as const));
    const ctx = { rankOf: (id: string) => rank.get(id) ?? null, p4p: (id: string) => p4p.get(id) ?? null, day: 0 };
    return roster.fighters
      .filter((f) => f.p === promo && (div === "all" || f.d === div) && (!q || f.n.toLowerCase().includes(q.toLowerCase())))
      .map((rf) => ({ rf, f: realFighter(rf, ctx, seed), rank: rank.get(rf.id) ?? null }))
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || ovr(b.f.attrs) - ovr(a.f.attrs));
  }, [roster, seed, promo, div, q]);
  return (
    <Panel title="Pick a real fighter" hint={`${rows.length} fighters`} acts={<button className="btn sm" onClick={onBack}>Back</button>}>
      <div className="row" style={{ marginBottom: 12 }}>
        <Seg value={promo} onChange={setPromo} options={[{ v: "ufc", label: "UFC" }, { v: "pfl", label: "PFL" }]} />
        <select className="input" value={div} onChange={(e) => setDiv(e.target.value as DivisionId | "all")}>
          <option value="all">All weight classes</option>
          {DIVISION_IDS.map((d) => <option key={d} value={d}>{DIVISIONS[d].name}</option>)}
        </select>
        <input className="input" placeholder="Search a name" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ flex: 1 }} />
        <button className="btn primary" disabled={!value} onClick={onNext}>Next</button>
      </div>
      <div style={{ maxHeight: 520, overflowY: "auto" }}>
        <table className="tbl compact">
          <thead>
            <tr><th>Rank</th><th>Fighter</th><th>Division</th><th className="r">Record</th><th className="r">Age</th><th className="c">Overall</th><th>Outlook</th></tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map(({ rf, f, rank }) => (
              <tr key={rf.id} className={`click${value === rf.id ? " me" : ""}`} onClick={() => onPick(rf.id)}>
                <td>{rank === 0 ? <span className="rank c">C</span> : rank ? <span className="rank">{rank}</span> : <span className="dim">-</span>}</td>
                <td><span className="row tight"><Flag code={rf.c} /> <b>{rf.n}</b>{rf.k && <span className="dim small">"{rf.k}"</span>}</span></td>
                <td>{DIVISIONS[rf.d].name}</td>
                <td className="r">{rf.r[0]}-{rf.r[1]}{rf.r[2] ? `-${rf.r[2]}` : ""}</td>
                <td className="r">{rf.a}</td>
                <td className="c"><Ovr v={ovr(f.attrs)} sm /></td>
                <td className="small">{potentialText(f, 0, 0.7)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ClientPicker({ w, picks, setPicks }: { w: World; picks: string[]; setPicks: (p: string[]) => void }) {
  const list = useMemo(() => starterClients(w, 30), [w]);
  const toggle = (id: string) => setPicks(picks.includes(id) ? picks.filter((x) => x !== id) : picks.length >= 3 ? picks : [...picks, id]);
  return (
    <table className="tbl compact">
      <thead>
        <tr><th></th><th>Fighter</th><th>Promotion</th><th>Division</th><th className="r">Record</th><th className="r">Age</th><th className="c">Overall</th><th>Ceiling</th></tr>
      </thead>
      <tbody>
        {list.map((f) => (
          <tr key={f.id} className={`click${picks.includes(f.id) ? " me" : ""}`} onClick={() => toggle(f.id)}>
            <td>{picks.includes(f.id) ? "✔" : ""}</td>
            <td><span className="row tight"><Flag code={f.country} /> <b>{fullName(f)}</b></span></td>
            <td>{f.promo ? PROMOTIONS[f.promo].short : ""}</td>
            <td>{DIVISIONS[f.div].name}</td>
            <td className="r">{recordText(f)}</td>
            <td className="r">{Math.floor((w.day - f.birth) / 365.25)}</td>
            <td className="c"><Ovr v={ovr(f.attrs)} sm /></td>
            <td className="small">{potentialText(f, w.day, 0.7)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
