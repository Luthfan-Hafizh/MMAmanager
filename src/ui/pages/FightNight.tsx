import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { clock, fmtDate } from "../../core/time";
import { DIVISIONS } from "../../data/divisions";
import type { Bout, World } from "../../model/types";
import { FightSim, GPOS_NAME, methodText, type FightOutcome } from "../../engine/sim";
import { SHOUTS, type Shout } from "../../engine/plan";
import { cardSection } from "../../world/calendar";
import { fightInputFor } from "../../world/results";
import { fullName, recordText } from "../../world/core";
import { boutRng, fightNight, openFightNight, quickSim, resolvePlayerBout } from "../../sim/advance";
import { changed, save, toast, useWorld } from "../../state/store";
import { go, Link } from "../router";
import { Bar, Empty, FighterLink, Panel, Seg } from "../components";
import { Band } from "../art";
import { PlanEditor } from "./NextFight";
import { stakeLabel } from "../../world/belts";

export function FightNight() {
  const w = useWorld();
  const ev = fightNight(w);
  const [opened, setOpened] = useState(false);
  const [live, setLive] = useState<Bout | null>(null);
  const [finished, setFinished] = useState<string | null>(null);
  useEffect(() => {
    if (ev && !opened) {
      const anyAwaiting = ev.bouts.some((id) => w.bouts[id].awaiting);
      if (!anyAwaiting) openFightNight(w, ev);
      setOpened(true);
      changed();
    }
  }, [ev?.id]);
  if (!ev) {
    if (finished) {
      const e = w.events[finished];
      return (
        <>
          <Band eyebrow="Fight night" title="In the books" sub={`${e?.name} is over. The results, the bonuses and the new rankings are in.`} />
          <div className="wrap page-body">
            <div className="row">
              <Link to={`/event/${finished}`} className="btn">See the results</Link>
              <button className="btn primary" onClick={() => go("/home")}>Back to work</button>
            </div>
          </div>
        </>
      );
    }
    return (
      <>
        <Band eyebrow="Fight night" title="No fight tonight" sub="Fight nights open here on the day of the event." />
        <div className="wrap page-body" />
      </>
    );
  }
  const awaiting = ev.bouts.map((id) => w.bouts[id]).filter((b) => b.awaiting);
  if (live) {
    return (
      <div className="wrap page-body">
      <LiveFight
        w={w}
        b={live}
        onDone={(out) => {
          resolvePlayerBout(w, live, out);
          setLive(null);
          if (w.events[ev.id].status === "done") setFinished(ev.id);
          void save();
          changed();
        }}
      />
      </div>
    );
  }
  const done = ev.bouts.map((id) => w.bouts[id]).filter((b) => b.status === "done");
  return (
    <>
    <Band eyebrow={<><span className="tag red">Live</span><span>{fmtDate(ev.day, { dow: true })}</span></>} title={ev.name} sub={`${ev.venue}, ${ev.city}. The undercard is under way; your fight is waiting.`} />
    <div className="wrap page-body">
    <div className="grid">
      <div className="c6 stack">
        {awaiting.map((b) => {
          const a = w.fighters[b.a];
          const c = w.fighters[b.b];
          return (
            <Panel key={b.id} title={stakeLabel(b) && stakeLabel(b) !== "Title eliminator" ? stakeLabel(b)! : "Your fight"} className="accent">
              <div className="vs-card">
                <div><div className="who">{a.surname}</div><div className="small dim">{recordText(a)}</div></div>
                <div className="vs">VS</div>
                <div className="r2"><div className="who">{c.surname}</div><div className="small dim">{recordText(c)}</div></div>
              </div>
              {b.weighIn && (
                <p className="small dim" style={{ marginTop: 8 }}>
                  Weigh-in: {a.surname} {b.weighIn.a.toFixed(1)} lb{b.weighIn.missA ? " (missed)" : ""}, {c.surname} {b.weighIn.b.toFixed(1)} lb{b.weighIn.missB ? " (missed)" : ""}. {b.rounds} rounds, {DIVISIONS[b.div].name.toLowerCase()}{b.catchweight ? `, catchweight ${b.catchweight} lb` : ""}.
                </p>
              )}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn primary lg" onClick={() => setLive(b)}>Watch live</button>
                <button
                  className="btn"
                  onClick={() => {
                    const out = quickSim(w, b);
                    resolvePlayerBout(w, b, out);
                    toast(`${out.winner ? fullName(w.fighters[out.winner === "a" ? b.a : b.b]) + " wins" : "Draw"}: ${methodText(out.method, out.detail)}`, "info");
                    if (w.events[ev.id].status === "done") setFinished(ev.id);
                    void save();
                    changed();
                  }}
                >
                  Simulate
                </button>
              </div>
            </Panel>
          );
        })}
      </div>
      <div className="c6">
        <Panel title="Results so far" flush>
          {done.length === 0 && <Empty title="The prelims are about to start" />}
          {done.slice().reverse().map((b) => (
            <div className="list-row" key={b.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <FighterLink w={w} id={b.res?.winner === "b" ? b.b : b.a} /> <span className="dim small">def.</span> <FighterLink w={w} id={b.res?.winner === "b" ? b.a : b.b} />
                <div className="tiny dim">{b.res ? methodText(b.res.method, b.res.detail) : ""}{b.res && b.res.method !== "DEC" ? `, R${b.res.round} ${clock(b.res.time)}` : ""} · {cardSection(ev, b.order)}</div>
              </div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
    </div>
    </>
  );
}

const SPEEDS = [
  { v: 6, label: "Slow" },
  { v: 15, label: "Normal" },
  { v: 40, label: "Fast" },
  { v: 400, label: "Instant" },
];

function LiveFight({ w, b, onDone }: { w: World; b: Bout; onDone: (o: FightOutcome) => void }) {
  const mine: 0 | 1 = w.fighters[b.a].ctrl ? 0 : 1;
  const simRef = useRef<FightSim | null>(null);
  if (!simRef.current) {
    const rng = boutRng(w, b);
    const input = fightInputFor(w, b, rng, rng.int(1, 2 ** 31 - 1), true);
    input.aiCorner = mine === 0 ? [false, true] : [true, false];
    simRef.current = new FightSim(input);
  }
  const sim = simRef.current;
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const [speed, setSpeed] = useState(15);
  const [paused, setPaused] = useState(false);
  const [focus, setFocus] = useState<"recover" | "cut" | "tactics" | "head">("recover");
  useEffect(() => {
    const t = setInterval(() => {
      if (paused || sim.over || sim.between) return;
      const target = sim.t + speed * 0.1;
      let guard = 0;
      while (!sim.over && !sim.between && sim.t < target && guard++ < 400) sim.step();
      tick();
    }, 100);
    return () => clearInterval(t);
  }, [speed, paused, sim]);
  const out = sim.over ? sim.outcome() : null;
  const me = sim.s[mine];
  const st = (i: 0 | 1) => sim.s[i].rs.reduce((a, r) => ({ sigL: a.sigL + r.sigL, sigA: a.sigA + r.sigA, tdL: a.tdL + r.tdL, tdA: a.tdA + r.tdA, kd: a.kd + r.kd, ctrl: a.ctrl + r.ctrl, subA: a.subA + r.subA }), { sigL: 0, sigA: 0, tdL: 0, tdA: 0, kd: 0, ctrl: 0, subA: 0 });
  const posText =
    sim.pos === "ground"
      ? `${sim.s[sim.top].name} on top · ${GPOS_NAME[sim.gpos]}`
      : sim.pos === "clinch"
        ? `Clinch · ${sim.s[sim.ctrl].name} in control${sim.fence >= 0 ? " on the fence" : ""}`
        : sim.fence >= 0
          ? `${sim.s[sim.fence as 0 | 1].name} backed onto the fence`
          : ["Long range", "Mid range", "In the pocket"][sim.range];
  const feed = useMemo(() => sim.log.slice(-60), [sim.log.length]);
  const shout = (s: Shout) => {
    const ok = sim.shout(mine, s);
    toast(ok ? "The message got through." : "Lost in the noise.", ok ? "good" : "bad");
    tick();
  };
  const nextRound = () => {
    sim.corner(mine, focus);
    sim.nextRound();
    tick();
  };
  const roundLead = sim.cards.length ? sim.scoreDiff(me) : 0;
  const A = st(0);
  const B = st(1);
  const stat = (k: string, a: number, b: number, fa = String(a), fb = String(b)) => {
    const t = a + b || 1;
    return (
      <div className="bc-stat">
        <div className="k">{k}</div>
        <div className="v"><span>{fa}</span><span>{fb}</span></div>
        <div className="vbar"><div className="a" style={{ width: `${(a / t) * 100}%` }} /><div className="b" style={{ width: `${(b / t) * 100}%` }} /></div>
      </div>
    );
  };
  return (
    <div className="stack">
      <section className="broadcast" aria-label="Live fight">
        <div className="scorebug">
          <FighterMeters sim={sim} i={0} />
          <div className="mid">
            <div className="rd">Round {sim.round} of {sim.rounds}</div>
            <div className="clock">{clock(Math.max(0, sim.roundSec - sim.t))}</div>
            <div className="pos">{sim.over ? "Fight over" : sim.between ? "Between rounds" : posText}</div>
          </div>
          <FighterMeters sim={sim} i={1} />
        </div>
        <div className="bc-stats">
          {stat("Sig. strikes", A.sigL, B.sigL, `${A.sigL}/${A.sigA}`, `${B.sigL}/${B.sigA}`)}
          {stat("Takedowns", A.tdL, B.tdL, `${A.tdL}/${A.tdA}`, `${B.tdL}/${B.tdA}`)}
          {stat("Knockdowns", A.kd, B.kd)}
          {stat("Sub attempts", A.subA, B.subA)}
          {stat("Control", A.ctrl, B.ctrl, clock(A.ctrl), clock(B.ctrl))}
        </div>
        <div className="bc-ctrl">
          <Seg value={speed} onChange={setSpeed} options={SPEEDS} />
          <button className="btn sm" onClick={() => setPaused((p) => !p)} disabled={sim.over || sim.between}>{paused ? "Resume" : "Pause"}</button>
          <button className="btn sm" disabled={sim.over || sim.between} onClick={() => { let g = 0; while (!sim.over && !sim.between && g++ < 5000) sim.step(); tick(); }}>End of round</button>
        </div>
      </section>

      {!sim.over && !sim.between && (
        <Panel title="Corner" hint="Shouts last until the end of the round. Discipline decides if they're heard.">
          <div className="row">
            {SHOUTS.map((s) => (
              <button key={s.id} className={`btn sm${me.shout === s.id ? " on" : ""}`} title={s.desc} onClick={() => shout(s.id)}>{s.label}</button>
            ))}
          </div>
        </Panel>
      )}

      {sim.between && !sim.over && (
        <div className="grid">
          <div className="c5 stack">
            <Panel title={`After round ${sim.round}`} className="gold">
              <p>
                {roundLead > 0.5 ? "The corner thinks you're ahead on the cards." : roundLead < -0.5 ? "The corner thinks you're behind on the cards." : "It's close on the cards."} Gas tank {Math.round(me.sta)}%, head {Math.round(me.head)}%, body {Math.round(me.body)}%, legs {Math.round(me.legs)}%{me.cut ? `, cut level ${me.cut}` : ""}.
              </p>
              <div className="small dim" style={{ marginBottom: 6 }}>Use the minute for</div>
              <Seg value={focus} onChange={setFocus} options={[{ v: "recover", label: "Breathing" }, { v: "cut", label: "The cut" }, { v: "head", label: "Clear the head" }, { v: "tactics", label: "Tactics" }]} />
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn primary lg" onClick={nextRound}>Round {sim.round + 1}</button>
              </div>
            </Panel>
          </div>
          <div className="c7">
            <PlanEditor compact plan={me.base} onChange={(p) => { sim.setPlan(mine, p); tick(); }} />
          </div>
        </div>
      )}

      {out && (
        <Panel title="Result" className="gold">
          <div className="big" style={{ fontSize: 30 }}>
            {out.winner ? `${fullName(out.winner === "a" ? w.fighters[b.a] : w.fighters[b.b])} wins` : "Draw"}
          </div>
          <p className="muted" style={{ marginTop: 6 }}>
            {methodText(out.method, out.detail)}
            {out.method !== "DEC" && out.method !== "DRAW" ? `, round ${out.round} at ${clock(out.time)}` : ""}
            {out.cards ? `. Judges: ${out.cards.map(([x, y]) => `${x}-${y}`).join(", ")}` : ""}.
          </p>
          {out.rcards && out.rcards.length > 0 && (
            <table className="tbl compact" style={{ maxWidth: 520, marginTop: 8 }}>
              <thead><tr><th>Round</th><th className="c">Judge 1</th><th className="c">Judge 2</th><th className="c">Judge 3</th></tr></thead>
              <tbody>
                {out.rcards.map((r, i) => (
                  <tr key={i}><td>{i + 1}</td>{r.map((c, j) => <td key={j} className="c">{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary lg" onClick={() => onDone(out)}>Continue</button>
          </div>
        </Panel>
      )}

      <Panel title="Play by play" flush>
        <div className="feed">
          {feed.map((l, i) => (
            <div key={i} className={`line${l.big ? " big" : ""}${l.side !== undefined ? ` s${l.side}` : ""}${l.kind === "round" ? " round" : ""}${l.kind === "finish" ? " finish" : ""}`}>
              <span className="t">R{l.r} {clock(l.t)}</span>
              <span>{l.text}</span>
            </div>
          ))}
          {feed.length === 0 && <div className="empty">The referee brings them to the centre. Touch gloves…</div>}
        </div>
      </Panel>
    </div>
  );
}

function FighterMeters({ sim, i }: { sim: FightSim; i: 0 | 1 }) {
  const s = sim.s[i];
  const m = (label: string, v: number, kind?: "red" | "gold" | "info" | "warn") => (
    <div className="meter">
      <div className="lbl"><span>{label}</span><span>{Math.round(v)}</span></div>
      <Bar v={v} kind={kind} />
    </div>
  );
  const kd = s.rs.reduce((a, r) => a + r.kd, 0);
  return (
    <div className={`side ${i === 0 ? "a" : "b"}`}>
      <div className="nm">{s.name}</div>
      <div className="rec">{recordText(s.f)} {s.stun > 0 && <span className="hurt">Hurt</span>}</div>
      <div className="meters">
        {m("Gas tank", s.sta, s.sta < 35 ? "red" : s.sta < 55 ? "warn" : undefined)}
        {m("Head", s.head, s.head < 40 ? "red" : s.head < 65 ? "warn" : "info")}
      </div>
      <div className="bodymap">
        <span>Body {Math.round(s.body)}</span>
        <span>Legs {Math.round(s.legs)}</span>
        {kd > 0 && <span>KD {kd}</span>}
        {s.cut > 0 && <span>Cut {s.cut}</span>}
      </div>
    </div>
  );
}
