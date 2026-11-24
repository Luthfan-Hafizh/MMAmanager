import { isBeltFight, stakeLabel } from "../../world/belts";
import { useState } from "react";
import { ageAt, fmtDate, weeksText, durationText } from "../../core/time";
import { heightText, money, pct } from "../../core/util";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS } from "../../data/promotions";
import { ATTR_INFO, groupScore, ovr, styleOf, type AttrKey } from "../../model/attributes";
import type { Bout, Camp, Fighter, World } from "../../model/types";
import {
  BOTTOM_TEXT, DEF_TEXT, PRESETS, SCALE_TEXT, STYLE_DESC, STYLE_NAMES, TAKEDOWN_TEXT, TARGET_TEXT, TOP_TEXT, preset, suggestPlan,
  type BottomMode, type DefMode, type FightPlan, type PlanStyle, type Target, type TopMode,
} from "../../engine/plan";
import { winChance } from "../../engine/sim";
import { CUT_NAMES, NUTRITION_NAMES, SPARRING_NAMES, campCost, campPrep, prepText, startCamp } from "../../career/camp";
import { fightInputFor, ringRust } from "../../world/results";
import { fullName, rankLabel, recordText, withRng } from "../../world/core";
import { changed, useWorld } from "../../state/store";
import { Link } from "../router";
import { Empty, FighterLink, Flag, Ovr, Panel, Seg, Versus } from "../components";
import { FighterSwitch } from "./Training";
import { NextFightCard } from "./Home";
import { Band } from "../art";
import { BoutPreview } from "./Events";
import { oddsOf } from "../../world/odds";

export function NextFight({ id }: { id?: string }) {
  const w = useWorld();
  const fid = id && w.career.fc[id] ? id : w.career.fighters[0];
  const f = w.fighters[fid];
  const fc = w.career.fc[fid];
  if (!f || !fc) return <div className="wrap page-body"><Empty title="No fighter" /></div>;
  const b = f.booked ? w.bouts[f.booked] : null;
  if (!b || b.status !== "booked" || b.pending) {
    return (
      <>
        <Band eyebrow="Fight camp" title="Next fight" sub="When a fight is signed, the camp starts here: the opponent, the cut, the partners and the game plan." />
        <div className="wrap page-body">
          <div className="row" style={{ marginBottom: 16 }}><FighterSwitch w={w} id={fid} base="/fight" /></div>
          <div className="grid"><div className="c8"><NextFightCard w={w} f={f} /></div></div>
        </div>
      </>
    );
  }
  if (!fc.camp || fc.camp.bout !== b.id) startCamp(w, f, b);
  const camp = fc.camp!;
  const opp = w.fighters[b.a === f.id ? b.b : b.a];
  return (
    <>
      <FightHeader w={w} b={b} f={f} opp={opp} />
      <div className="wrap page-body">
        <div className="row" style={{ marginBottom: 16 }}><FighterSwitch w={w} id={fid} base="/fight" /></div>
        <div className="panel" style={{ marginBottom: 18 }}><BoutPreview w={w} b={b} /></div>
        <div className="grid">
          <div className="c5 stack">
            <TaleOfTheTape w={w} f={f} opp={opp} b={b} />
            <Scouting w={w} opp={opp} me={f} />
          </div>
          <div className="c7 stack">
            <CampPanel w={w} f={f} b={b} camp={camp} />
            <PlanEditor plan={camp.plan} onChange={(p) => { camp.plan = p; changed(); }} suggest={() => suggestPlan(f.attrs, opp.attrs, f.reach - opp.reach)} me={f} opp={opp} />
            <Odds w={w} b={b} f={f} />
          </div>
        </div>
      </div>
    </>
  );
}

function FightHeader({ w, b, f, opp }: { w: World; b: Bout; f: Fighter; opp: Fighter }) {
  const ev = w.events[b.ev];
  const title = isBeltFight(b);
  const days = b.day - w.day;
  const odds = oddsOf(b);
  const mine = b.a === f.id ? "a" : "b";
  const myP = b.odds === undefined ? 0.5 : mine === "a" ? b.odds : 1 - b.odds;
  return (
    <Band
      eyebrow={<>{title && <span className={`tag ${b.kind === "bmf" ? "bmf" : "gold"}`}>{stakeLabel(b)}</span>}<span>{ev?.name}</span><span className="dim">·</span><span>{fmtDate(b.day, { dow: true })}</span></>}
      first={`${f.surname} vs`}
      title={opp.surname}
      sub={`${ev?.venue}, ${ev?.city} · ${b.rounds} × ${b.roundSec / 60} min · ${b.limit ? `${b.limit} lb catchweight` : `${DIVISIONS[b.div].name} (${DIVISIONS[b.div].limit} lb)`}${b.shortNotice && b.sub === f.id ? ` · stepped in on ${b.notice ?? "short"} days' notice` : b.shortNotice ? " · new opponent on short notice" : ""}`}
      word={opp.surname}
      right={
        odds ? (
          <div className="duo">
            <div><div className={`odds ${myP >= 0.5 ? "fav" : "dog"}`}>{mine === "a" ? odds.a : odds.b}</div><div className="k">{f.surname}</div></div>
            <div className="vs">VS</div>
            <div><div className={`odds ${myP < 0.5 ? "fav" : "dog"}`}>{mine === "a" ? odds.b : odds.a}</div><div className="k">{opp.surname}</div></div>
          </div>
        ) : undefined
      }
    >
      <div className="bignums">
        <div><div className="n">{days}</div><div className="k">{days === 1 ? "Day to go" : "Days to go"}</div></div>
        <div><div className="n">{recordText(f)}</div><div className="k">{rankLabel(w, f) || "Unranked"} · you</div></div>
        <div><div className="n">{recordText(opp)}</div><div className="k">{rankLabel(w, opp) || "Unranked"} · <Link to={`/fighter/${opp.id}`} className="link">profile</Link></div></div>
      </div>
    </Band>
  );
}

function TaleOfTheTape({ w, f, opp, b }: { w: World; f: Fighter; opp: Fighter; b: Bout }) {
  const age = (x: Fighter) => ageAt(x.birth, w.day);
  const layoff = (x: Fighter) => (x.lastFight === null ? 0 : b.day - x.lastFight);
  return (
    <Panel title="Tale of the tape">
      <div className="versus" style={{ marginBottom: 6 }}>
        <div className="l row tight" style={{ justifyContent: "flex-end" }}><Flag code={f.country} /> {f.surname}</div>
        <div className="m" />
        <div className="r row tight"><Flag code={opp.country} /> {opp.surname}</div>
      </div>
      <Versus label="Overall" a={ovr(f.attrs)} b={ovr(opp.attrs)} />
      <Versus label="Age" a={age(f)} b={age(opp)} fmt={(v) => v.toFixed(0)} higher="bad" />
      <Versus label="Height" a={f.height} b={opp.height} fmt={heightText} higher="none" />
      <Versus label="Reach (in)" a={f.reach} b={opp.reach} />
      <Versus label="Wins" a={f.rec.w} b={opp.rec.w} />
      <Versus label="Losses" a={f.rec.l} b={opp.rec.l} higher="bad" />
      <Versus label="Finish rate" a={f.rec.w ? (f.rec.koW + f.rec.subW) / f.rec.w : 0} b={opp.rec.w ? (opp.rec.koW + opp.rec.subW) / opp.rec.w : 0} fmt={(v) => pct(v)} />
      <Versus label="Striking" a={groupScore(f.attrs, "striking")} b={groupScore(opp.attrs, "striking")} fmt={(v) => v.toFixed(1)} />
      <Versus label="Grappling" a={groupScore(f.attrs, "grappling")} b={groupScore(opp.attrs, "grappling")} fmt={(v) => v.toFixed(1)} />
      <Versus label="Power" a={f.attrs.power} b={opp.attrs.power} fmt={(v) => v.toFixed(0)} />
      <Versus label="Chin" a={f.attrs.chin} b={opp.attrs.chin} fmt={(v) => v.toFixed(0)} />
      <Versus label="Cardio" a={f.attrs.cardio} b={opp.attrs.cardio} fmt={(v) => v.toFixed(0)} />
      <Versus label="Takedown defence" a={f.attrs.tdd} b={opp.attrs.tdd} fmt={(v) => v.toFixed(0)} />
      <Versus label="Since last fight" a={layoff(f)} b={layoff(opp)} fmt={(v) => (v ? durationText(v) : "debut")} higher="none" />
      {(ringRust(layoff(f)) > 0 || ringRust(layoff(opp)) > 0) && <p className="small warn" style={{ marginTop: 8 }}>Ring rust: a fighter back after nine months or more has the timing off early, worst in round one.</p>}
    </Panel>
  );
}

function Scouting({ w, opp, me }: { w: World; opp: Fighter; me: Fighter }) {
  const sorted = (Object.entries(opp.attrs) as [AttrKey, number][]).sort((a, b) => b[1] - a[1]);
  const likely = suggestPlan(opp.attrs, me.attrs, opp.reach - me.reach);
  const r = opp.rec;
  const fin = r.w ? Math.round(((r.koW + r.subW) / r.w) * 100) : 0;
  return (
    <Panel title="Scouting report" acts={<Link to={`/fighter/${opp.id}`} className="btn sm">Profile</Link>}>
      <p>
        <b>{styleOf(opp.attrs)}</b> out of {w.gyms[opp.gym]?.name ?? "an unknown gym"}. Finishes {fin}% of wins ({r.koW} by KO/TKO, {r.subW} by submission); lost {r.koL} by KO and {r.subL} by submission.
      </p>
      <div className="grid" style={{ gap: 8 }}>
        <div className="c6">
          <div className="tiny up disp good">Dangerous</div>
          {sorted.slice(0, 4).map(([k, v]) => (
            <div key={k} className="spread small"><span>{ATTR_INFO[k].name}</span><b>{Math.round(v)}</b></div>
          ))}
        </div>
        <div className="c6">
          <div className="tiny up disp bad">Holes</div>
          {sorted.slice(-4).reverse().map(([k, v]) => (
            <div key={k} className="spread small"><span>{ATTR_INFO[k].name}</span><b>{Math.round(v)}</b></div>
          ))}
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        Expected game plan: <b>{STYLE_NAMES[likely.style]}</b>, takedowns {TAKEDOWN_TEXT[likely.takedowns].toLowerCase()}, {TARGET_TEXT[likely.target].toLowerCase()}.
      </p>
    </Panel>
  );
}

function CampPanel({ w, f, b, camp }: { w: World; f: Fighter; b: Bout; camp: Camp }) {
  const tier = PROMOTIONS[b.promo].tier;
  const set = <K extends keyof Camp>(k: K, v: Camp[K]) => {
    if (camp.paid && (k === "sparring" || k === "nutrition")) return;
    (camp as Camp)[k] = v;
    camp.cost = campCost(camp, tier);
    changed();
  };
  const limit = DIVISIONS[b.div].limit;
  const cut = ((f.walk - limit) / f.walk) * 100;
  const prep = campPrep(w, f, b);
  return (
    <Panel title="Fight camp" hint={camp.paid ? "paid" : `${money(camp.cost)}, paid when the camp week starts`}>
      <div className="grid" style={{ gap: 12 }}>
        <div className="c6">
          <div className="small dim" style={{ marginBottom: 4 }}>Sparring partners</div>
          <Seg value={camp.sparring} onChange={(v) => set("sparring", v)} options={SPARRING_NAMES.map((n, i) => ({ v: i as 0 | 1 | 2, label: n }))} />
          <p className="tiny dim" style={{ marginTop: 4 }}>Partners who move like the opponent: sharper on the night, better film work.</p>
        </div>
        <div className="c6">
          <div className="small dim" style={{ marginBottom: 4 }}>Weight cut support</div>
          <Seg value={camp.nutrition} onChange={(v) => set("nutrition", v)} options={NUTRITION_NAMES.map((n, i) => ({ v: i as 0 | 1 | 2, label: n }))} />
          <p className="tiny dim" style={{ marginTop: 4 }}>A nutritionist makes the cut safer; a full team makes a big cut possible.</p>
        </div>
        <div className="c6">
          <div className="small dim" style={{ marginBottom: 4 }}>The cut</div>
          <Seg value={camp.cut} onChange={(v) => set("cut", v)} options={(Object.keys(CUT_NAMES) as Camp["cut"][]).map((k) => ({ v: k, label: CUT_NAMES[k] }))} />
        </div>
        <div className="c6">
          <dl className="kv">
            <dt>Walking weight</dt><dd>{f.walk} lb</dd>
            <dt>Limit</dt><dd>{limit} lb{b.kind === "title" || b.kind === "vacant" || b.kind === "interim" ? " (no allowance)" : " (+1 lb allowed)"}</dd>
            <dt>The cut</dt><dd className={cut > 12 ? "bad" : cut > 9 ? "warn" : "good"}>{cut.toFixed(1)}% of body weight</dd>
            <dt>Opponent studied</dt><dd>{Math.round(camp.study * 100)}%</dd>
            <dt>Preparation now</dt><dd>{prepText(prep)}</dd>
          </dl>
        </div>
      </div>
      <p className="tiny dim" style={{ marginTop: 10 }}>
        Fight-night preparation comes from the camp's length (eight weeks is a full camp), sharpness from sparring, arriving fresh (fatigue under 45), the partners and the film study. Weight is checked the day before; a miss costs 20-30% of the purse.
      </p>
    </Panel>
  );
}

function scaleRow(label: string, key: "tempo" | "risk" | "range" | "kicks" | "counter" | "clinch", plan: FightPlan, set: (p: FightPlan) => void) {
  const text = SCALE_TEXT[key];
  return (
    <div className="c6" key={key}>
      <div className="spread small"><span className="dim">{label}</span><b>{text[plan[key] + 2]}</b></div>
      <input type="range" min={-2} max={2} step={1} value={plan[key]} onChange={(e) => set({ ...plan, [key]: Number(e.target.value) })} aria-label={label} />
    </div>
  );
}

export function PlanEditor({ plan, onChange, suggest, me, opp, compact }: { plan: FightPlan; onChange: (p: FightPlan) => void; suggest?: () => FightPlan; me?: Fighter; opp?: Fighter; compact?: boolean }) {
  const set = (p: FightPlan) => onChange(p);
  return (
    <Panel
      title="Game plan"
      hint={STYLE_DESC[plan.style]}
      acts={suggest && <button className="btn sm" onClick={() => set(suggest())}>Coach's suggestion</button>}
    >
      <div className="row" style={{ marginBottom: 12 }}>
        <select className="input" value={plan.style} onChange={(e) => set(preset(e.target.value as PlanStyle))}>
          {(Object.keys(PRESETS) as PlanStyle[]).map((s) => <option key={s} value={s}>{STYLE_NAMES[s]}</option>)}
        </select>
        <span className="small dim">Pick a style, then fine-tune the instructions.</span>
      </div>
      <div className="grid" style={{ gap: "10px 18px" }}>
        {scaleRow("Tempo", "tempo", plan, set)}
        {scaleRow("Risk", "risk", plan, set)}
        {scaleRow("Range", "range", plan, set)}
        {scaleRow("Kicks", "kicks", plan, set)}
        {scaleRow("Lead or counter", "counter", plan, set)}
        {scaleRow("Clinch", "clinch", plan, set)}
        <div className="c6">
          <div className="spread small"><span className="dim">Takedowns</span><b>{TAKEDOWN_TEXT[plan.takedowns]}</b></div>
          <input type="range" min={0} max={4} step={1} value={plan.takedowns} onChange={(e) => set({ ...plan, takedowns: Number(e.target.value) })} aria-label="Takedowns" />
        </div>
        <div className="c6">
          <div className="small dim" style={{ marginBottom: 4 }}>Target</div>
          <Seg<Target> value={plan.target} onChange={(v) => set({ ...plan, target: v })} options={(Object.keys(TARGET_TEXT) as Target[]).map((k) => ({ v: k, label: TARGET_TEXT[k] }))} />
        </div>
        <div className="c6">
          <div className="small dim" style={{ marginBottom: 4 }}>On top</div>
          <Seg<TopMode> value={plan.top} onChange={(v) => set({ ...plan, top: v })} options={(Object.keys(TOP_TEXT) as TopMode[]).map((k) => ({ v: k, label: TOP_TEXT[k] }))} />
        </div>
        <div className="c6">
          <div className="small dim" style={{ marginBottom: 4 }}>On the bottom</div>
          <Seg<BottomMode> value={plan.bottom} onChange={(v) => set({ ...plan, bottom: v })} options={(Object.keys(BOTTOM_TEXT) as BottomMode[]).map((k) => ({ v: k, label: BOTTOM_TEXT[k] }))} />
        </div>
        <div className="c6">
          <div className="small dim" style={{ marginBottom: 4 }}>Defence</div>
          <Seg<DefMode> value={plan.defense} onChange={(v) => set({ ...plan, defense: v })} options={(Object.keys(DEF_TEXT) as DefMode[]).map((k) => ({ v: k, label: DEF_TEXT[k] }))} />
        </div>
        <div className="c6 row">
          <label className="row small"><input type="checkbox" checked={plan.cage} onChange={(e) => set({ ...plan, cage: e.target.checked })} /> Press them against the fence</label>
          <label className="row small"><input type="checkbox" checked={plan.finish} onChange={(e) => set({ ...plan, finish: e.target.checked })} /> Go for the finish when they're hurt</label>
        </div>
      </div>
      {!compact && me && opp && <PlanAdvice plan={plan} me={me} opp={opp} />}
    </Panel>
  );
}

function PlanAdvice({ plan, me, opp }: { plan: FightPlan; me: Fighter; opp: Fighter }) {
  const notes: { t: string; good: boolean }[] = [];
  const wrestleEdge = (me.attrs.takedowns + me.attrs.clinchControl) / 2 - opp.attrs.tdd;
  if (plan.takedowns >= 3 && wrestleEdge < -2) notes.push({ t: `${opp.surname}'s takedown defence (${Math.round(opp.attrs.tdd)}) will stuff a lot of shots.`, good: false });
  if (plan.takedowns >= 3 && wrestleEdge > 2) notes.push({ t: `Your wrestling is well ahead of ${opp.surname}'s defence: the shot is there.`, good: true });
  if (plan.range >= 1 && opp.attrs.power > 15 && opp.attrs.boxing > 13) notes.push({ t: `In the pocket with a puncher like ${opp.surname} is dangerous.`, good: false });
  if (plan.range <= -1 && me.reach - opp.reach >= 3) notes.push({ t: `A ${me.reach - opp.reach}" reach edge: staying long suits you.`, good: true });
  if (plan.tempo >= 1 && me.attrs.cardio < 11) notes.push({ t: "A high pace with your cardio could empty the tank by round three.", good: false });
  if (plan.tempo >= 1 && opp.attrs.cardio < 10 && me.attrs.cardio > 13) notes.push({ t: `${opp.surname} fades: pace will break them late.`, good: true });
  if (plan.target === "legs" && opp.tech.checkKicks) notes.push({ t: `${opp.surname} checks kicks: the legs are a hard target.`, good: false });
  if (plan.top === "subs" && me.attrs.subs < 11) notes.push({ t: "Hunting submissions without the skills gives up position.", good: false });
  if (plan.bottom === "guard" && opp.attrs.groundStrikes > 15) notes.push({ t: `On your back under ${opp.surname}'s ground and pound is a bad place to be.`, good: false });
  if (plan.risk >= 1 && opp.attrs.counters > 15) notes.push({ t: `${opp.surname} counters well: big swings get punished.`, good: false });
  if (plan.risk >= 1 && opp.attrs.chin < 10) notes.push({ t: `${opp.surname}'s chin has cracked before: power shots could end it.`, good: true });
  if (!notes.length) return <p className="small dim" style={{ marginTop: 10 }}>The coaches have no big concerns with this plan.</p>;
  return (
    <div style={{ marginTop: 12 }} className="stack">
      {notes.map((n, i) => (
        <div key={i} className={`small ${n.good ? "good" : "warn"}`}>{n.good ? "✔" : "!"} {n.t}</div>
      ))}
    </div>
  );
}

function Odds({ w, b, f }: { w: World; b: Bout; f: Fighter }) {
  const [p, setP] = useState<number | null>(null);
  const run = () => {
    const input = withRng(w, (rng) => fightInputFor(w, b, rng, rng.int(1, 1e9), false));
    const raw = winChance(input, 60);
    setP(b.a === f.id ? raw : 1 - raw);
  };
  return (
    <Panel title="The odds" hint="from 60 simulated fights with this plan">
      {p === null ? (
        <button className="btn" onClick={run}>Simulate the matchup</button>
      ) : (
        <div className="row">
          <div className="big">{Math.round(p * 100)}%</div>
          <div className="small muted">chance to win for {f.surname}, with the camp as it stands today. Bookmakers would price it around {p > 0.5 ? `-${Math.round((p / (1 - p)) * 100)}` : `+${Math.round(((1 - p) / Math.max(0.01, p)) * 100)}`}.</div>
          <button className="btn sm ghost" onClick={run}>Again</button>
        </div>
      )}
    </Panel>
  );
}

export { FighterLink };
