import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { clock, fmtDate } from "../../core/time";
import { DIVISIONS } from "../../data/divisions";
import type { Bout, FightLogLine, RoundStat, World } from "../../model/types";
import { FightSim, GPOS_NAME, methodText, type FightOutcome } from "../../engine/sim";
import { applyShout, SHOUT_GROUPS, SHOUTS, type Shout, type ShoutGroup } from "../../engine/plan";
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
import { FightReport } from "../report";
import { roundSummary } from "../../world/report";

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

type Speed = "watch" | "quick" | "fast" | "bell";
const SPEEDS: { v: Speed; label: string }[] = [
  { v: "watch", label: "Watch" },
  { v: "quick", label: "Quick" },
  { v: "fast", label: "Fast" },
  { v: "bell", label: "To the bell" },
];
const ZONES = ["Head", "Body", "Legs"] as const;

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
  const [speed, setSpeed] = useState<Speed>(() => {
    try {
      return (localStorage.getItem("mma.fightSpeed") as Speed) || "watch";
    } catch {
      return "watch";
    }
  });
  const [paused, setPaused] = useState(false);
  const [focus, setFocus] = useState<"recover" | "cut" | "tactics" | "head">("recover");
  const [used, setUsed] = useState<string[]>([]);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const pick = (s: Speed) => {
    setSpeed(s);
    try {
      localStorage.setItem("mma.fightSpeed", s);
    } catch {
      /* private mode */
    }
  };

  // The broadcast: in Watch, every line stays up long enough to read.
  useEffect(() => {
    if (paused || sim.over || sim.between) return;
    let timer = 0;
    const run = () => {
      if (sim.over || sim.between) return;
      if (speed === "bell") {
        let g = 0;
        while (!sim.over && !sim.between && g++ < 5000) sim.step();
        tick();
        return;
      }
      if (speed === "fast") {
        const target = sim.t + 4;
        let g = 0;
        while (!sim.over && !sim.between && sim.t < target && g++ < 400) sim.step();
        tick();
        timer = window.setTimeout(run, 100);
        return;
      }
      const n0 = sim.log.length;
      let g = 0;
      while (!sim.over && !sim.between && sim.log.length === n0 && g++ < 80) sim.step();
      tick();
      const fresh = sim.log.slice(n0);
      const chars = fresh.reduce((a, l) => a + l.text.length, 0);
      const big = fresh.some((l) => l.big);
      const delay = speed === "watch" ? Math.min(4400, 900 + chars * 26 + (big ? 1000 : 0)) : Math.min(1700, 320 + chars * 9 + (big ? 450 : 0));
      timer = window.setTimeout(run, delay);
    };
    timer = window.setTimeout(run, 300);
    return () => window.clearTimeout(timer);
  }, [speed, paused, sim, sim.round, sim.between, sim.over]);

  // Keep the play-by-play at the newest line, unless the reader scrolled back.
  useEffect(() => {
    const el = feedRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  });

  const out = sim.over ? sim.outcome() : null;
  const me = sim.s[mine];
  const opp = sim.s[1 - mine as 0 | 1];
  const st = (i: 0 | 1) => sim.s[i].rs.reduce((a, r) => ({ sigL: a.sigL + r.sigL, sigA: a.sigA + r.sigA, tdL: a.tdL + r.tdL, tdA: a.tdA + r.tdA, kd: a.kd + r.kd, ctrl: a.ctrl + r.ctrl, subA: a.subA + r.subA }), { sigL: 0, sigA: 0, tdL: 0, tdA: 0, kd: 0, ctrl: 0, subA: 0 });
  const posText =
    sim.pos === "ground"
      ? `${sim.s[sim.top].name} on top · ${GPOS_NAME[sim.gpos]}`
      : sim.pos === "clinch"
        ? `Clinch · ${sim.s[sim.ctrl].name} in control${sim.fence >= 0 ? " on the fence" : ""}`
        : sim.fence >= 0
          ? `${sim.s[sim.fence as 0 | 1].name} backed onto the fence`
          : ["Long range", "Mid range", "In the pocket"][sim.range];
  const shout = (s: Shout) => {
    const ok = sim.shout(mine, s);
    toast(ok ? "The message got through." : "Lost in the noise.", ok ? "good" : "bad");
    tick();
  };
  const clearShout = (g: ShoutGroup) => {
    sim.clearShout(mine, g);
    tick();
  };
  const nextRound = () => {
    sim.corner(mine, focus);
    sim.nextRound();
    setUsed([]);
    tick();
  };
  const useNote = (sh: Shout, text: string) => {
    sim.setPlan(mine, applyShout(me.base, sh));
    setUsed((u) => [...u, text]);
    tick();
  };
  const roundLead = sim.cards.length ? sim.scoreDiff(me) : 0;
  const A = st(0);
  const B = st(1);
  const stat = (k: string, a: number, bb: number, fa = String(a), fb = String(bb)) => {
    const t = a + bb || 1;
    return (
      <div className="bc-stat">
        <div className="k">{k}</div>
        <div className="v"><span>{fa}</span><span>{fb}</span></div>
        <div className="vbar"><div className="a" style={{ width: `${(a / t) * 100}%` }} /><div className="b" style={{ width: `${(bb / t) * 100}%` }} /></div>
      </div>
    );
  };
  const rounds = sim.s[0].rs.map((r, k) => [r, sim.s[1].rs[k]] as [RoundStat, RoundStat]);
  const rcards = sim.cards.map((r) => r.map(([x, y]) => `${x}-${y}`));
  const last = sim.log[sim.log.length - 1];
  const justEnded = sim.between ? sim.round : 0;
  const notes = sim.between && !sim.over ? sim.cornerNotes(mine) : [];
  const byRound = new Map<number, FightLogLine[]>();
  for (const l of sim.log) {
    const list = byRound.get(l.r) ?? [];
    list.push(l);
    byRound.set(l.r, list);
  }

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
        <div className={`bc-now${last?.side !== undefined ? ` s${last.side}` : ""}${last?.big ? " big" : ""}`} aria-live="polite">
          {last ? last.text : "The referee brings them to the centre. Touch gloves…"}
        </div>
        <div className="bc-stats">
          {stat("Sig. strikes", A.sigL, B.sigL, `${A.sigL}/${A.sigA}`, `${B.sigL}/${B.sigA}`)}
          {stat("Takedowns", A.tdL, B.tdL, `${A.tdL}/${A.tdA}`, `${B.tdL}/${B.tdA}`)}
          {stat("Knockdowns", A.kd, B.kd)}
          {stat("Sub attempts", A.subA, B.subA)}
          {stat("Control", A.ctrl, B.ctrl, clock(A.ctrl), clock(B.ctrl))}
        </div>
        <div className="bc-ctrl">
          <Seg value={speed} onChange={pick} options={SPEEDS} />
          <button className="btn sm" onClick={() => setPaused((p) => !p)} disabled={sim.over || sim.between}>{paused ? "Resume" : "Pause"}</button>
          <span className="small" style={{ color: "var(--band-ink-3)" }}>{speed === "watch" ? "Every line, at reading pace" : speed === "quick" ? "Every line, quickly" : speed === "fast" ? "Fast forward" : "Straight to the end of the round"}</span>
        </div>
      </section>

      {!sim.over && !sim.between && (
        <div className="grid">
          <div className="c8">
            <Panel title="Corner" hint="One instruction from each group, for the rest of the round. Discipline decides whether it's heard; click an active one to take it back.">
              <div className="shout-groups">
                {SHOUT_GROUPS.map((g) => (
                  <div className="shout-group" key={g.id}>
                    <div className="label">{g.label}</div>
                    <div className="row tight wrap">
                      {SHOUTS.filter((s) => s.group === g.id).map((s) => {
                        const on = me.shouts[g.id] === s.id;
                        return (
                          <button key={s.id} className={`btn sm${on ? " on" : ""}`} title={s.desc} aria-pressed={on} onClick={() => (on ? clearShout(g.id) : shout(s.id))}>{s.label}</button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
          <div className="c4">
            <ReadPanel sim={sim} mine={mine} />
          </div>
        </div>
      )}

      {sim.between && !sim.over && (
        <div className="grid">
          <div className="c5 stack">
            <Panel title={`After round ${justEnded}`} className="gold">
              <p className="small" style={{ marginBottom: 10 }}>{roundSummary(sim.s[0].f, sim.s[1].f, rounds[justEnded - 1], rcards[justEnded - 1])}</p>
              <p>
                {roundLead > 0.5 ? "The corner thinks you're ahead on the cards." : roundLead < -0.5 ? "The corner thinks you're behind on the cards." : "It's close on the cards."} Gas tank {Math.round(me.sta)}%, head {Math.round(me.head)}%, body {Math.round(me.body)}%, legs {Math.round(me.legs)}%{me.cut ? `, cut level ${me.cut}` : ""}.
              </p>
              <div className="label" style={{ margin: "12px 0 6px" }}>What the corner sees</div>
              <ul className="corner-notes">
                {notes.map((n, i) => (
                  <li key={i}>
                    <span>{n.text}</span>
                    {n.shout && (used.includes(n.text) ? <span className="badge">In the plan</span> : <button className="btn sm" onClick={() => useNote(n.shout!, n.text)}>Use it</button>)}
                  </li>
                ))}
              </ul>
              <div className="small dim" style={{ margin: "12px 0 6px" }}>Use the minute for</div>
              <Seg value={focus} onChange={setFocus} options={[{ v: "recover", label: "Breathing" }, { v: "cut", label: "The cut" }, { v: "head", label: "Clear the head" }, { v: "tactics", label: "Tactics" }]} />
              <div className="row" style={{ marginTop: 14 }}>
                <button className="btn primary lg" onClick={nextRound}>Round {sim.round + 1}</button>
              </div>
            </Panel>
            <ReadPanel sim={sim} mine={mine} />
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
            {out.cards ? `. ${out.method === "DEC" || out.method === "DRAW" ? "Judges" : "Cards at the stoppage"}: ${out.cards.map(([x, y]) => `${x}-${y}`).join(", ")}` : ""}.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary lg" onClick={() => onDone(out)}>Continue</button>
          </div>
        </Panel>
      )}

      {rounds.length > 0 && (sim.between || sim.over || rounds.some((r) => r[0].sigA + r[1].sigA > 0)) && (
        <div className="panel"><div className="panel-b">
          <FightReport data={{ a: sim.s[0].f, b: sim.s[1].f, rounds, rcards, log: out ? sim.log : undefined, winner: out?.winner, method: out?.method, detail: out?.detail, endRound: out?.round, endTime: out?.time }} title={out ? "Fight report" : "Live statistics, updated as they fight"} />
        </div></div>
      )}

      <Panel title="Play by play" flush>
        <div className="feed" ref={feedRef}>
          {[...byRound.entries()].map(([r, lines]) => (
            <div key={r} className="feed-round">
              <div className="feed-r">Round {r}</div>
              {lines.map((l, i) => (
                <div key={i} className={`line${l.big ? " big" : ""}${l.side !== undefined ? ` s${l.side}` : ""}${l.kind === "round" ? " round" : ""}${l.kind === "finish" ? " finish" : ""}${l.kind === "read" ? " read" : ""}${l.kind === "corner" ? " corner" : ""}${l.kind === "miss" ? " miss" : ""}`}>
                  <span className="t">{clock(l.t)}</span>
                  <span>{l.text}</span>
                </div>
              ))}
            </div>
          ))}
          {sim.log.length === 0 && <div className="empty">The referee brings them to the centre. Touch gloves…</div>}
        </div>
      </Panel>
    </div>
  );
}

/** Where both fighters are guarding, and what that leaves open. */
function ReadPanel({ sim, mine }: { sim: FightSim; mine: 0 | 1 }) {
  const me = sim.s[mine];
  const opp = sim.s[1 - mine as 0 | 1];
  const rows = (i: 0 | 1, who: string) => {
    const s = sim.s[i];
    const open = sim.openness(s);
    return (
      <div className="read-block">
        <div className="read-who">{who}</div>
        {ZONES.map((z, k) => (
          <div key={z} className="read-row">
            <span>{z}</span>
            <div className="bar thin"><i style={{ width: `${Math.round(s.read[k] * 100)}%` }} /></div>
            <b>{Math.round(s.read[k] * 100)}%</b>
            <em className={open[k] > 1.1 ? "open" : open[k] < 0.88 ? "shut" : ""}>{open[k] > 1.1 ? "Open" : open[k] < 0.88 ? "Covered" : ""}</em>
          </div>
        ))}
      </div>
    );
  };
  const open = sim.openness(opp);
  const best = [0, 1, 2].sort((x, y) => open[y] - open[x])[0];
  return (
    <Panel title="The read" hint="Where each fighter is guarding. The guard follows what they get hit with.">
      {rows((1 - mine) as 0 | 1, `${opp.name} is guarding`)}
      {rows(mine, `${me.name} is guarding`)}
      <p className="small" style={{ marginTop: 8 }}>
        {open[best] > 1.1 ? <>The <b>{ZONES[best].toLowerCase()}</b> {best === 2 ? "are" : "is"} open on {opp.name}. "Find the opening" goes there by itself.</> : `${opp.name}'s guard is balanced: mixing it up keeps it that way.`}
      </p>
    </Panel>
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
