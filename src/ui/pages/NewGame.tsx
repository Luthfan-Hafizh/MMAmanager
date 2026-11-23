import { useEffect, useMemo, useState } from "react";
import { COUNTRY_LIST, REGIONS, countryOf } from "../../data/countries";
import { DIVISIONS, DIVISION_IDS, type DivisionId, type Sex } from "../../data/divisions";
import { ARTS, ART_IDS, type BaseArt } from "../../data/styles";
import { PROMOTIONS, promoFor } from "../../data/promotions";
import { ovr } from "../../model/attributes";
import type { Stance, World } from "../../model/types";
import { createWorld, starterClients, addControlled, type CreatedFighter, type NewGameOptions, type StartLevel, type Talent } from "../../world/create";
import { realFighter, type RosterFile } from "../../world/real";
import { loadRoster, newGame, setBusy, setWorld, toast } from "../../state/store";
import { saveWorld } from "../../state/persist";
import { heightText } from "../../core/util";
import { go } from "../router";
import { Flag, Ovr, Panel, Seg } from "../components";
import { Logo } from "../icons";
import { fullName, recordText } from "../../world/core";

type Step = "mode" | "origin" | "create" | "real" | "review" | "agency" | "clients";

const TALENT: { v: Talent; label: string; desc: string }[] = [
  { v: "average", label: "Hard worker", desc: "Limited ceiling (potential around 72). A grinder's career." },
  { v: "prospect", label: "Prospect", desc: "Real talent (potential around 82): a UFC fighter if it goes right." },
  { v: "phenom", label: "Phenom", desc: "Once in a generation (potential around 90): built to be champion." },
];
const START: { v: StartLevel; label: string; desc: string }[] = [
  { v: "amateur", label: "Amateur", desc: "0-0 on your region's IMMAF circuit. No purses; turn pro when a promoter calls." },
  { v: "debut", label: "Pro debut", desc: "0-0 as a pro at your region's local show, after a 4-1 amateur career." },
  { v: "regional", label: "Regional prospect", desc: "5-1 and signed to your region's regional promotion." },
];

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

  const start = async () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    if (mode === "fighter") {
      if (takeover) {
        await newGame({ name: "Career", seed, mode, difficulty, takeover });
      } else {
        if (!cf.first.trim() || !cf.surname.trim()) {
          toast("Give your fighter a name.", "bad");
          setStep("create");
          return;
        }
        await newGame({ name: "Career", seed, mode, difficulty, created: { ...cf, first: cf.first.trim(), surname: cf.surname.trim(), nick: cf.nick?.trim() || undefined } });
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
              <span>Name, country, weight class, martial arts background, body and talent. Start as an amateur, a debutant or a regional prospect.</span>
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
        <RealPicker roster={roster} value={takeover} onPick={setTakeover} onBack={() => { setTakeover(null); setStep("origin"); }} onNext={() => takeover && setStep("review")} />
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
                , {cf.age}, {countryOf(cf.country).name}, {DIVISIONS[cf.div].name.toLowerCase()}, {ARTS[cf.art].name.toLowerCase()} background. Starts as a{" "}
                {START.find((s) => s.v === cf.start)?.label.toLowerCase()} at {(promoFor(countryOf(cf.country).region, cf.start === "amateur" ? "amateur" : cf.start === "debut" ? "local" : "regional") ?? PROMOTIONS.cffc).name}.
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

function CreateForm({ cf, setCf, onBack, onNext }: { cf: CreatedFighter; setCf: (c: CreatedFighter) => void; onBack: () => void; onNext: () => void }) {
  const set = <K extends keyof CreatedFighter>(k: K, v: CreatedFighter[K]) => setCf({ ...cf, [k]: v });
  const divs = DIVISION_IDS.filter((d) => DIVISIONS[d].sex === cf.sex);
  const d = DIVISIONS[cf.div];
  const setSex = (s: Sex) => {
    const div = DIVISION_IDS.find((x) => DIVISIONS[x].sex === s && (s === "F" ? x === "WFLY" : x === "LW"))!;
    setCf({ ...cf, sex: s, div, height: Math.round(DIVISIONS[div].height), reach: Math.round(DIVISIONS[div].reach) });
  };
  const setDiv = (div: DivisionId) => setCf({ ...cf, div, height: Math.round(DIVISIONS[div].height), reach: Math.round(DIVISIONS[div].reach) });
  const regions = Object.values(REGIONS);
  return (
    <div className="grid">
      <div className="c7 stack">
        <Panel title="Identity">
          <div className="grid">
            <label className="field c4">First name<input className="input" value={cf.first} onChange={(e) => set("first", e.target.value)} placeholder="First name" /></label>
            <label className="field c4">Surname<input className="input" value={cf.surname} onChange={(e) => set("surname", e.target.value)} placeholder="Surname" /></label>
            <label className="field c4">Nickname<input className="input" value={cf.nick} onChange={(e) => set("nick", e.target.value)} placeholder="Optional" /></label>
            <label className="field c6">
              Country
              <select className="input" value={cf.country} onChange={(e) => set("country", e.target.value)}>
                {regions.map((r) => (
                  <optgroup key={r.id} label={r.name}>
                    {COUNTRY_LIST.filter((c) => c.region === r.id).map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field c3">
              Sex
              <Seg value={cf.sex} onChange={setSex} options={[{ v: "M", label: "Men" }, { v: "F", label: "Women" }]} />
            </label>
            <label className="field c3">
              Age: {cf.age}
              <input type="range" min={cf.start === "amateur" ? 16 : 18} max={34} value={cf.age} onChange={(e) => set("age", Number(e.target.value))} />
            </label>
          </div>
        </Panel>
        <Panel title="Weight class and body">
          <div className="row" style={{ marginBottom: 12 }}>
            {divs.map((x) => (
              <button key={x} className={`btn sm${cf.div === x ? " on" : ""}`} onClick={() => setDiv(x)}>
                {DIVISIONS[x].name.replace("Women's ", "")} <span className="dim">{DIVISIONS[x].limit}</span>
              </button>
            ))}
          </div>
          <div className="grid">
            <label className="field c4">
              Height: {heightText(cf.height)} ({Math.round(cf.height * 2.54)} cm)
              <input type="range" min={Math.round(d.height - 6)} max={Math.round(d.height + 6)} value={cf.height} onChange={(e) => set("height", Number(e.target.value))} />
            </label>
            <label className="field c4">
              Reach: {cf.reach}"
              <input type="range" min={cf.height - 3} max={cf.height + 6} value={cf.reach} onChange={(e) => set("reach", Number(e.target.value))} />
            </label>
            <label className="field c4">
              Stance
              <Seg<Stance> value={cf.stance} onChange={(v) => set("stance", v)} options={[{ v: "orthodox", label: "Orthodox" }, { v: "southpaw", label: "Southpaw" }, { v: "switch", label: "Switch" }]} />
            </label>
          </div>
          <p className="small dim" style={{ marginTop: 10 }}>
            The {d.name.toLowerCase()} average in the UFC is {heightText(d.height)} with a {Math.round(d.reach)}" reach. Reach helps at range; a shorter, denser fighter is stronger in the clinch.
          </p>
        </Panel>
      </div>
      <div className="c5 stack">
        <Panel title="Background">
          <select className="input" style={{ width: "100%" }} value={cf.art} onChange={(e) => set("art", e.target.value as BaseArt)}>
            {ART_IDS.map((a) => (
              <option key={a} value={a}>{ARTS[a].name}</option>
            ))}
          </select>
          <p className="small muted" style={{ marginTop: 8 }}>{ARTS[cf.art].desc}</p>
        </Panel>
        <Panel title="Talent">
          <div className="stack">
            {TALENT.map((t) => (
              <button key={t.v} className={`choice${cf.talent === t.v ? " on" : ""}`} onClick={() => set("talent", t.v)}>
                <b>{t.label}</b>
                <span>{t.desc}</span>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Start">
          <div className="stack">
            {START.map((t) => (
              <button key={t.v} className={`choice${cf.start === t.v ? " on" : ""}`} onClick={() => setCf({ ...cf, start: t.v, age: t.v !== "amateur" && cf.age < 18 ? 18 : cf.age })}>
                <b>{t.label}</b>
                <span>{t.desc}</span>
              </button>
            ))}
          </div>
        </Panel>
        <div className="row">
          <button className="btn" onClick={onBack}>Back</button>
          <div style={{ flex: 1 }} />
          <button className="btn primary" onClick={onNext} disabled={!cf.first.trim() || !cf.surname.trim()}>Next</button>
        </div>
      </div>
    </div>
  );
}

function RealPicker({ roster, value, onPick, onBack, onNext }: { roster: RosterFile; value: string | null; onPick: (id: string) => void; onBack: () => void; onNext: () => void }) {
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
    const ctx = { rankOf: (id: string) => rank.get(id) ?? null, p4p: () => null, day: 0 };
    return roster.fighters
      .filter((f) => f.p === promo && (div === "all" || f.d === div) && (!q || f.n.toLowerCase().includes(q.toLowerCase())))
      .map((rf) => ({ rf, f: realFighter(rf, ctx, 1), rank: rank.get(rf.id) ?? null }))
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || ovr(b.f.attrs) - ovr(a.f.attrs));
  }, [roster, promo, div, q]);
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
            <tr><th>Rank</th><th>Fighter</th><th>Division</th><th className="r">Record</th><th className="r">Age</th><th className="c">Overall</th></tr>
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
            <td className="small">{f.hid.pot - ovr(f.attrs) > 12 ? "Could be special" : f.hid.pot - ovr(f.attrs) > 6 ? "Room to grow" : "Near the ceiling"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
