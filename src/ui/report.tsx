// The fight report: round by round, the way a broadcast stats page shows it.
// Used after a live fight and on every finished bout.

import { useState } from "react";
import { clock } from "../core/time";
import type { Bout, FightLogLine, Fighter, RoundStat, World } from "../model/types";
import { roundsOf, roundSummary, roundVerdict, totals } from "../world/report";
import { methodText } from "../engine/sim";

export interface ReportData {
  a: Fighter;
  b: Fighter;
  rounds: [RoundStat, RoundStat][];
  rcards?: string[][];
  log?: FightLogLine[];
  winner?: "a" | "b" | null;
  method?: string;
  detail?: string;
  endRound?: number;
  endTime?: number;
}

export function reportOf(w: World, b: Bout): ReportData | null {
  const r = b.res;
  const rounds = roundsOf(r);
  const A = w.fighters[b.a];
  const B = w.fighters[b.b];
  if (!r || !rounds || !A || !B) return null;
  return { a: A, b: B, rounds, rcards: r.rcards, log: r.log, winner: r.winner, method: r.method, detail: r.detail, endRound: r.round, endTime: r.time };
}

const pct = (l: number, a: number) => (a ? `${Math.round((l / a) * 100)}%` : "–");

function Row({ k, a, b, fa, fb, sub }: { k: string; a: number; b: number; fa?: string; fb?: string; sub?: boolean }) {
  const t = a + b || 1;
  return (
    <div className={`fr-row${sub ? " sub" : ""}`}>
      <div className="v a">{fa ?? a}</div>
      <div className="k">{k}</div>
      <div className="v b">{fb ?? b}</div>
      <div className="bars"><i className="a" style={{ width: `${(a / t) * 100}%` }} /><i className="b" style={{ width: `${(b / t) * 100}%` }} /></div>
    </div>
  );
}

export function StatTable({ A, B }: { A: RoundStat; B: RoundStat }) {
  return (
    <div className="fr-stats">
      <Row k="Significant strikes" a={A.sigL} b={B.sigL} fa={`${A.sigL}/${A.sigA}`} fb={`${B.sigL}/${B.sigA}`} />
      <Row k="Accuracy" a={A.sigA ? A.sigL / A.sigA : 0} b={B.sigA ? B.sigL / B.sigA : 0} fa={pct(A.sigL, A.sigA)} fb={pct(B.sigL, B.sigA)} sub />
      <Row k="Head" a={A.head} b={B.head} fa={`${A.head}/${A.headA}`} fb={`${B.head}/${B.headA}`} sub />
      <Row k="Body" a={A.body} b={B.body} fa={`${A.body}/${A.bodyA}`} fb={`${B.body}/${B.bodyA}`} sub />
      <Row k="Legs" a={A.leg} b={B.leg} fa={`${A.leg}/${A.legA}`} fb={`${B.leg}/${B.legA}`} sub />
      <Row k="At distance" a={A.dist} b={B.dist} sub />
      <Row k="In the clinch" a={A.clinch} b={B.clinch} sub />
      <Row k="On the ground" a={A.ground} b={B.ground} sub />
      <Row k="Total strikes" a={A.totL} b={B.totL} fa={`${A.totL}/${A.totA}`} fb={`${B.totL}/${B.totA}`} />
      <Row k="Knockdowns" a={A.kd} b={B.kd} />
      <Row k="Takedowns" a={A.tdL} b={B.tdL} fa={`${A.tdL}/${A.tdA}`} fb={`${B.tdL}/${B.tdA}`} />
      <Row k="Submission attempts" a={A.subA} b={B.subA} />
      <Row k="Reversals" a={A.rev} b={B.rev} />
      <Row k="Control time" a={A.ctrl} b={B.ctrl} fa={clock(A.ctrl)} fb={clock(B.ctrl)} />
    </div>
  );
}

function tone(v: number): string {
  return v < 35 ? "red" : v < 60 ? "warn" : "info";
}

function Condition({ r, name, side }: { r: RoundStat; name: string; side: "a" | "b" }) {
  if (r.hd === undefined) return null;
  const m = (label: string, v: number | undefined) =>
    v === undefined ? null : (
      <div className="fr-meter">
        <span>{label}</span>
        <div className={`bar thin ${tone(v)}`}><i style={{ width: `${v}%` }} /></div>
        <b>{v}</b>
      </div>
    );
  return (
    <div className={`fr-cond ${side}`}>
      <div className="nm">{name}</div>
      {m("Head", r.hd)}
      {m("Body", r.bd)}
      {m("Legs", r.lg)}
      {m("Gas tank", r.st)}
      {r.gd && (
        <div className="fr-guard" title="Where the fighter was defending at the end of the round">
          Guarding: head {r.gd[0]}% · body {r.gd[1]}% · legs {r.gd[2]}%
        </div>
      )}
    </div>
  );
}

export function FightReport({ data, title = "Fight report" }: { data: ReportData; title?: string }) {
  const { a: A, b: B, rounds } = data;
  const [sel, setSel] = useState<number>(-1);
  const tot = totals(rounds);
  const cur = sel < 0 ? tot : rounds[sel];
  const cards = sel >= 0 ? data.rcards?.[sel] : undefined;
  const ended = (i: number) => data.method && data.method !== "DEC" && data.method !== "DRAW" && data.endRound === i + 1;
  const moments = (data.log ?? []).filter((l) => l.big || l.kind === "read" || l.kind === "kd" || l.kind === "rock" || l.kind === "finish" || l.kind === "call");
  return (
    <section className="fr" aria-label={title}>
      <div className="fr-head">
        <div className="label">{title}</div>
        <div className="pills" role="tablist" aria-label="Rounds">
          <button role="tab" aria-selected={sel < 0} className={`pill${sel < 0 ? " on" : ""}`} onClick={() => setSel(-1)}>All rounds</button>
          {rounds.map((_, i) => (
            <button key={i} role="tab" aria-selected={sel === i} className={`pill${sel === i ? " on" : ""}`} onClick={() => setSel(i)}>Round {i + 1}</button>
          ))}
        </div>
      </div>
      <div className="fr-names">
        <span className="a">{A.surname}</span>
        <span className="m">{sel < 0 ? `${rounds.length} round${rounds.length === 1 ? "" : "s"}` : `Round ${sel + 1}`}</span>
        <span className="b">{B.surname}</span>
      </div>
      <div className="fr-grid">
        <StatTable A={cur[0]} B={cur[1]} />
        <div className="fr-side">
          {sel >= 0 ? (
            <>
              <div className="fr-box">
                <div className="label">Judges</div>
                {cards?.length ? (
                  <div className="fr-cards">{cards.map((c, j) => <span key={j}>{c}</span>)}</div>
                ) : (
                  <div className="small dim">{ended(sel) ? "Not scored: the fight ended in this round." : "No scores kept for this round."}</div>
                )}
                <p className="small" style={{ marginTop: 8 }}>{roundSummary(A, B, rounds[sel], cards, ended(sel) ? { method: methodText(data.method as never, data.detail ?? ""), time: data.endTime ?? 0 } : undefined)}</p>
              </div>
              <div className="fr-box">
                <div className="label">At the end of the round</div>
                <Condition r={rounds[sel][0]} name={A.surname} side="a" />
                <Condition r={rounds[sel][1]} name={B.surname} side="b" />
                {rounds[sel][0].hd === undefined && <div className="small dim">Condition is kept for fights from this version on.</div>}
              </div>
            </>
          ) : (
            <div className="fr-box">
              <div className="label">Round by round</div>
              <ol className="fr-rounds">
                {rounds.map((r, i) => {
                  const v = roundVerdict(data.rcards?.[i]);
                  return (
                    <li key={i}>
                      <button className="fr-rlink" onClick={() => setSel(i)}>
                        <b>R{i + 1}</b>
                        <span className={`fr-who ${v.a > v.b ? "a" : v.b > v.a ? "b" : ""}`}>{ended(i) ? "Finish" : v.a > v.b ? A.surname : v.b > v.a ? B.surname : data.rcards?.[i] ? "Even" : "–"}</span>
                        <span className="dim">{r[0].sigL}–{r[1].sigL} sig.{r[0].tdL + r[1].tdL ? ` · TD ${r[0].tdL}–${r[1].tdL}` : ""}{r[0].kd + r[1].kd ? ` · KD ${r[0].kd}–${r[1].kd}` : ""}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="small dim" style={{ marginTop: 8 }}>Pick a round for the judges' scores, a summary and how both fighters finished it.</p>
            </div>
          )}
        </div>
      </div>
      {moments.length > 0 && (
        <div className="fr-moments">
          <div className="label">Key moments</div>
          {rounds.map((_, i) => {
            const lines = moments.filter((l) => l.r === i + 1 && (sel < 0 || sel === i));
            if (!lines.length) return null;
            return (
              <div key={i} className="fr-mround">
                <div className="r">Round {i + 1}</div>
                {lines.map((l, k) => (
                  <div key={k} className={`fr-moment${l.side !== undefined ? ` s${l.side}` : ""}${l.kind === "finish" ? " finish" : ""}`}>
                    <span className="t">{clock(l.t)}</span>
                    <span>{l.text}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
