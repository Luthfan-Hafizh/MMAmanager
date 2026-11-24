import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { clock, fmtDate } from "../../core/time";
import { DIVISIONS } from "../../data/divisions";
import type { Bout, FightLogLine, RoundStat, World } from "../../model/types";
import { FightSim, GPOS_NAME, methodText, type CornerCall, type FightOutcome, type LiveAdvice } from "../../engine/sim";
import { clamp } from "../../core/util";
import { applyShout, SHOUT_BY_ID, SHOUT_GROUPS, SHOUTS, type Shout, type ShoutGroup } from "../../engine/plan";
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

/** What happens to the corner's calls: you choose, the corner decides, or the fighter's instinct does. */
type CallMode = "ask" | "follow" | "instinct";
const CALL_MODES: { v: CallMode; label: string }[] = [
  { v: "ask", label: "Ask me" },
  { v: "follow", label: "Follow the corner" },
  { v: "instinct", label: "Instinct" },
];
interface CallCard extends LiveAdvice {
  id: number;
  ttl: number;
  left: number;
  state: "open" | "done" | "missed" | "info";
  result?: string;
  good?: boolean;
}
/** How long a call stays up, urgent and normal, in milliseconds. */
const CALL_TTL: Record<Speed, [number, number]> = { watch: [7000, 11000], quick: [5000, 8000], fast: [2600, 3600], bell: [0, 0] };

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

  // ---------- the corner's calls during a round ----------
  const fighterMode = w.career.mode === "fighter";
  const coachQ = clamp((w.gyms[w.fighters[mine === 0 ? b.a : b.b]?.gym]?.coaches.head ?? 55) / 100, 0.2, 1);
  const [callMode, setCallMode] = useState<CallMode>(() => {
    try {
      return (localStorage.getItem("mma.cornerCalls") as CallMode) || "ask";
    } catch {
      return "ask";
    }
  });
  const pickMode = (m: CallMode) => {
    setCallMode(m);
    try {
      localStorage.setItem("mma.cornerCalls", m);
    } catch {
      /* private mode */
    }
  };
  const modeRef = useRef(callMode);
  modeRef.current = callMode;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [cards, setCards] = useState<CallCard[]>([]);
  const cardsRef = useRef<CallCard[]>([]);
  const cardId = useRef(1);
  const setCardList = (list: CallCard[]) => {
    cardsRef.current = list;
    setCards(list);
  };
  /** Acting on a call: as the fighter you just do it; as the manager you shout it and hope it's heard. */
  const actOn = (adv: LiveAdvice, k: number, by: CornerCall["by"]): { ok: boolean; label: string } => {
    const op = adv.options[k];
    if (fighterMode) return { ok: sim.act(mine, op.shout, { key: adv.key, text: adv.text, label: op.label, by }), label: op.label };
    const ok = op.shout ? sim.shout(mine, op.shout) : true;
    sim.calls.push({ i: mine, r: sim.round, t: Math.round(sim.t), key: adv.key, text: adv.text, choice: op.label, by, shout: op.shout, ok });
    return { ok, label: op.label };
  };
  const addCard = (c: Omit<CallCard, "id">) => {
    const keep = cardsRef.current.filter((x) => x.state === "open" || x.left > 0);
    setCardList([{ ...c, id: cardId.current++ }, ...keep].slice(0, 3));
  };
  /** After each exchange: does the corner call something, and is a follow-up due? */
  const poll = (auto: boolean) => {
    const adv = sim.liveAdvice(mine, coachQ);
    if (adv) {
      const mode = modeRef.current;
      if (auto || mode !== "ask") {
        const k = mode === "follow" ? 0 : adv.instinct;
        const r = actOn(adv, k, mode === "follow" ? "corner" : "instinct");
        if (!auto) addCard({ ...adv, ttl: 2800, left: 2800, state: "done", result: `${mode === "follow" ? "Following the corner" : "On instinct"}: ${r.label}` });
      } else {
        const [u, n] = CALL_TTL[speedRef.current];
        const ttl = adv.urgent ? u : n;
        addCard({ ...adv, ttl, left: ttl, state: "open" });
      }
    }
    const fb = sim.cornerFeedback(mine);
    if (fb && !auto) addCard({ key: "fb", text: fb.text, options: [], urgent: false, round: sim.round, t: Math.round(sim.t), until: sim.t + 12, instinct: 0, ttl: 5200, left: 5200, state: "info", good: fb.good });
  };
  const letGo = (c: CallCard): CallCard => {
    const r = actOn(c, c.instinct, "instinct");
    return { ...c, state: "missed", left: 2800, ttl: 2800, result: `${fighterMode ? "Your instinct" : "Instinct"}: ${r.label}` };
  };
  const choose = (c: CallCard, k: number) => {
    if (c.state !== "open") return;
    const r = actOn(c, k, "you");
    const why = r.ok ? "" : fighterMode ? " · the legs weren't there" : " · not heard";
    setCardList(cardsRef.current.map((x) => (x.id === c.id ? { ...x, state: "done", left: 2800, ttl: 2800, result: `${fighterMode ? "You" : "You shout"}: ${r.label}${why}` } : x)));
    tick();
  };
  // The countdowns run with the fight: paused with it, gone when the round ends.
  useEffect(() => {
    if (paused) return;
    const iv = window.setInterval(() => {
      if (!cardsRef.current.length) return;
      if (sim.over || sim.between) {
        setCardList([]);
        return;
      }
      const next: CallCard[] = [];
      for (const c of cardsRef.current) {
        let x: CallCard = { ...c, left: c.left - 200 };
        if (c.state === "open" && (x.left <= 0 || sim.round !== c.round || sim.t > c.until)) x = letGo(c);
        else if (x.state !== "open" && x.left <= 0) continue;
        next.push(x);
      }
      setCardList(next);
    }, 200);
    return () => window.clearInterval(iv);
  }, [paused]);
  // Keys 1 to 3 answer the newest call; Escape lets instinct take it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const open = cardsRef.current.find((c) => c.state === "open");
      if (!open) return;
      if (/^[1-3]$/.test(e.key) && open.options[Number(e.key) - 1]) {
        e.preventDefault();
        choose(open, Number(e.key) - 1);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setCardList(cardsRef.current.map((c) => (c.id === open.id ? letGo(c) : c)));
        tick();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // The broadcast: in Watch, every line stays up long enough to read.
  useEffect(() => {
    if (paused || sim.over || sim.between) return;
    let timer = 0;
    const run = () => {
      if (sim.over || sim.between) return;
      if (speed === "bell") {
        let g = 0;
        while (!sim.over && !sim.between && g++ < 5000) {
          sim.step();
          poll(true);
        }
        tick();
        return;
      }
      if (speed === "fast") {
        const target = sim.t + 4;
        let g = 0;
        while (!sim.over && !sim.between && sim.t < target && g++ < 400) sim.step();
        poll(false);
        tick();
        timer = window.setTimeout(run, 100);
        return;
      }
      const n0 = sim.log.length;
      let g = 0;
      while (!sim.over && !sim.between && sim.log.length === n0 && g++ < 80) sim.step();
      poll(false);
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
  const move = (s: Shout) => {
    if (fighterMode) {
      if (!sim.act(mine, s)) toast("Too dazed to do it yet.", "bad");
    } else {
      const ok = sim.shout(mine, s);
      toast(ok ? "The message got through." : "Lost in the noise.", ok ? "good" : "bad");
    }
    tick();
  };
  const doing = Object.entries(me.shouts) as [ShoutGroup, Shout][];
  const edge0 = sim.roundEdge(0);
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
            {!sim.over && !sim.between && (
              <div className="edge" title="Who is winning this round, as the corners see it">
                <div className="edge-bar"><i style={{ width: `${50 + edge0 * 50}%` }} /></div>
                <div className="edge-t">{Math.abs(edge0) < 0.15 ? "Round even" : `${sim.s[edge0 > 0 ? 0 : 1].name} winning the round`}</div>
              </div>
            )}
          </div>
          <FighterMeters sim={sim} i={1} />
        </div>
        <div className={`bc-now${last?.side !== undefined ? ` s${last.side}` : ""}${last?.big ? " big" : ""}`} aria-live="polite">
          {last ? last.text : "The referee brings them to the centre. Touch gloves…"}
        </div>
        {!sim.over && !sim.between && (
          <div className="bc-calls" aria-live="polite" aria-label="Corner calls">
            <div className="bc-calls-row">
              {cards.length ? (
                cards.map((c) => <CallView key={c.id} c={c} roundSec={sim.roundSec} fighterMode={fighterMode} onChoose={(k) => choose(c, k)} />)
              ) : (
                <div className="bc-calls-idle">
                  {callMode === "ask"
                    ? `${fighterMode ? "Your corner" : "Your assistant coach"} is watching. Calls show up here and the fight keeps going: pick one, or let ${fighterMode ? "your" : "the fighter's"} instinct decide. Keys 1 to 3 answer.`
                    : callMode === "follow"
                      ? "Following the corner: every call is acted on as it comes."
                      : `On instinct: ${fighterMode ? "you fight" : "the fighter fights"} the way ${fighterMode ? "you know" : "they know"}.`}
                </div>
              )}
            </div>
            {doing.length > 0 && (
              <div className="bc-doing">
                <span>Doing now</span>
                {doing.map(([g, sh]) => (
                  <button key={g} className="chip" onClick={() => clearShout(g)} title="Stop doing this">{SHOUT_BY_ID[sh].label.replace(/!$/, "")} <b aria-hidden="true">×</b></button>
                ))}
              </div>
            )}
          </div>
        )}
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
          <span className="bc-sep" aria-hidden="true" />
          <span className="small" style={{ color: "var(--band-ink-3)" }}>Corner calls</span>
          <Seg value={callMode} onChange={pickMode} options={CALL_MODES} />
          <span className="small" style={{ color: "var(--band-ink-3)" }}>{speed === "watch" ? "Every line, at reading pace" : speed === "quick" ? "Every line, quickly" : speed === "fast" ? "Fast forward" : "Straight to the end of the round"}</span>
        </div>
      </section>

      {!sim.over && !sim.between && (
        <div className="grid">
          <div className="c8">
            <Panel title={fighterMode ? "Your moves" : "Corner"} hint={fighterMode ? "Change what you do at any moment; the fight goes on. One from each group, for the rest of the round; click an active one to stop." : "One instruction from each group, for the rest of the round. Discipline decides whether it's heard; click an active one to take it back."}>
              <div className="shout-groups">
                {SHOUT_GROUPS.map((g) => (
                  <div className="shout-group" key={g.id}>
                    <div className="label">{g.label}</div>
                    <div className="row tight wrap">
                      {SHOUTS.filter((s) => s.group === g.id).map((s) => {
                        const on = me.shouts[g.id] === s.id;
                        return (
                          <button key={s.id} className={`btn sm${on ? " on" : ""}`} title={s.desc} aria-pressed={on} onClick={() => (on ? clearShout(g.id) : move(s.id))}>{s.label}</button>
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
                <div key={i} className={`line${l.big ? " big" : ""}${l.side !== undefined ? ` s${l.side}` : ""}${l.kind === "round" ? " round" : ""}${l.kind === "finish" ? " finish" : ""}${l.kind === "read" ? " read" : ""}${l.kind === "corner" ? " corner" : ""}${l.kind === "call" ? " mine" : ""}${l.kind === "miss" ? " miss" : ""}`}>
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

/** One call from the corner: what they see, the choices, and the time to answer. */
function CallView({ c, roundSec, fighterMode, onChoose }: { c: CallCard; roundSec: number; fighterMode: boolean; onChoose: (k: number) => void }) {
  return (
    <div className={`call ${c.state}${c.urgent ? " urgent" : ""}${c.good === true ? " good" : c.good === false ? " bad" : ""}`}>
      <div className="call-h">
        <span>{c.state === "info" ? "Corner" : fighterMode ? "Your corner" : "Assistant coach"}</span>
        {c.urgent && c.state === "open" && <b>Now</b>}
        <span className="t">{clock(Math.max(0, roundSec - c.t))}</span>
      </div>
      <div className="call-text">{c.text}</div>
      {c.state === "open" ? (
        <div className="call-opts">
          {c.options.map((o, k) => (
            <button key={k} className={`btn sm${o.primary ? " primary" : ""}`} onClick={() => onChoose(k)}>
              <kbd>{k + 1}</kbd>
              {o.label}
            </button>
          ))}
        </div>
      ) : c.result ? (
        <div className="call-res">{c.result}</div>
      ) : null}
      {c.state === "open" && <div className="call-timer" aria-hidden="true"><i style={{ width: `${Math.max(0, (c.left / c.ttl) * 100)}%` }} /></div>}
    </div>
  );
}
