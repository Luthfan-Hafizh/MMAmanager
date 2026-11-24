// Fight reports: round-by-round statistics kept with a result, the records as
// they stood on the night, and the plain words that go with the numbers.

import { clock } from "../core/time";
import { PROMOTIONS } from "../data/promotions";
import type { Bout, BoutResult, FightRecord, Fighter, RoundStat, World } from "../model/types";
import { isBeltFight } from "./belts";

/** The order of the packed numbers for each fighter in a round. */
const KEYS = ["sigL", "sigA", "totL", "totA", "head", "body", "leg", "headA", "bodyA", "legA", "dist", "clinch", "ground", "kd", "tdL", "tdA", "subA", "rev", "ctrl", "hd", "bd", "lg", "st"] as const;
const W = KEYS.length + 3;

/** Rounds as plain number rows: compact enough to keep for every fight. */
export function packRounds(rounds: [RoundStat, RoundStat][]): number[][] {
  return rounds.map((pair) => pair.flatMap((r) => [...KEYS.map((k) => Math.round((r[k] as number | undefined) ?? -1)), ...(r.gd ?? [-1, -1, -1])]));
}

export function unpackRounds(rx: number[][]): [RoundStat, RoundStat][] {
  return rx.map((row) => {
    const side = (o: number): RoundStat => {
      const r = {} as RoundStat;
      KEYS.forEach((k, i) => {
        const v = row[o + i];
        if (v >= 0) (r as unknown as Record<string, number>)[k] = v;
        else if (!["hd", "bd", "lg", "st"].includes(k)) (r as unknown as Record<string, number>)[k] = 0;
      });
      const g = row.slice(o + KEYS.length, o + W);
      if (g.length === 3 && g[0] >= 0) r.gd = g as [number, number, number];
      return r;
    };
    return [side(0), side(W)];
  });
}

/** A result's round-by-round numbers, from whichever form they were kept in. */
export function roundsOf(r: BoutResult | undefined): [RoundStat, RoundStat][] | null {
  if (!r) return null;
  if (r.rounds?.length) return r.rounds;
  if (r.rx?.length) return unpackRounds(r.rx);
  return null;
}

export function totals(rounds: [RoundStat, RoundStat][]): [RoundStat, RoundStat] {
  const add = (i: 0 | 1): RoundStat => {
    const t = { sigL: 0, sigA: 0, totL: 0, totA: 0, head: 0, body: 0, leg: 0, headA: 0, bodyA: 0, legA: 0, dist: 0, clinch: 0, ground: 0, kd: 0, tdL: 0, tdA: 0, subA: 0, rev: 0, ctrl: 0 } as RoundStat;
    for (const pair of rounds) for (const k of Object.keys(t) as (keyof RoundStat)[]) (t as unknown as Record<string, number>)[k] += (pair[i][k] as number) ?? 0;
    const last = rounds[rounds.length - 1]?.[i];
    if (last) {
      t.hd = last.hd;
      t.bd = last.bd;
      t.lg = last.lg;
      t.st = last.st;
    }
    return t;
  };
  return [add(0), add(1)];
}

/** Who each judge gave a round to: [a, b, draw] counts. */
export function roundVerdict(cards: string[] | undefined): { a: number; b: number; even: number; text: string } {
  if (!cards?.length) return { a: 0, b: 0, even: 0, text: "" };
  let a = 0;
  let b = 0;
  let even = 0;
  for (const c of cards) {
    const [x, y] = c.split("-").map(Number);
    if (x > y) a++;
    else if (y > x) b++;
    else even++;
  }
  return { a, b, even, text: cards.join(", ") };
}

/** One sentence on a round, from the numbers. */
export function roundSummary(A: Fighter, B: Fighter, r: [RoundStat, RoundStat], cards?: string[], last?: { method: string; time: number }): string {
  const [x, y] = r;
  const nm = [A.surname, B.surname];
  const parts: string[] = [];
  const v = roundVerdict(cards);
  const lead = v.a > v.b ? 0 : v.b > v.a ? 1 : -1;
  const sig = [x.sigL, y.sigL];
  const kd = [x.kd, y.kd];
  const td = [x.tdL, y.tdL];
  const ctrl = [x.ctrl, y.ctrl];
  if (kd[0] || kd[1]) {
    const k = kd[0] >= kd[1] ? 0 : 1;
    parts.push(`${nm[k]} scored ${kd[k] === 1 ? "a knockdown" : `${kd[k]} knockdowns`}`);
  }
  const sw = sig[0] >= sig[1] ? 0 : 1;
  if (Math.abs(sig[0] - sig[1]) >= 4) parts.push(`${nm[sw]} out-landed ${nm[1 - sw]} ${sig[sw]} to ${sig[1 - sw]}`);
  else parts.push(`the striking was close, ${sig[0]} to ${sig[1]}`);
  const tw = td[0] >= td[1] ? 0 : 1;
  if (td[tw] > 0) parts.push(`${nm[tw]} landed ${td[tw] === 1 ? "a takedown" : `${td[tw]} takedowns`}${ctrl[tw] >= 60 ? ` and ${clock(ctrl[tw])} of control` : ""}`);
  else if (Math.max(...ctrl) >= 60) {
    const cw = ctrl[0] >= ctrl[1] ? 0 : 1;
    parts.push(`${nm[cw]} had ${clock(ctrl[cw])} of control`);
  }
  // Where the damage went.
  const legs = [x.leg, y.leg];
  const lw = legs[0] >= legs[1] ? 0 : 1;
  if (legs[lw] >= 6) parts.push(`${nm[lw]} chopped the legs (${legs[lw]} kicks landed)`);
  const body = [x.body, y.body];
  const bw = body[0] >= body[1] ? 0 : 1;
  if (body[bw] >= 7) parts.push(`${nm[bw]} worked the body (${body[bw]})`);
  const subs = [x.subA, y.subA];
  const sb = subs[0] >= subs[1] ? 0 : 1;
  if (subs[sb]) parts.push(`${nm[sb]} tried ${subs[sb] === 1 ? "a submission" : `${subs[sb]} submissions`}`);
  let s = parts.length ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "";
  if (parts.length > 1) s += `; ${parts.slice(1).join("; ")}`;
  if (last) s += `. It ended at ${clock(last.time)}: ${/^(KO|TKO)/.test(last.method) ? last.method : last.method.charAt(0).toLowerCase() + last.method.slice(1)}`;
  else if (lead >= 0) s += `. ${v.a === 3 || v.b === 3 ? "All three judges" : `${Math.max(v.a, v.b)} of 3 judges`} gave it to ${nm[lead]}`;
  else if (cards?.length) s += `. The judges split it`;
  return `${s}.`;
}

/** A fighter's record as it stood after a bout: amateur fights count on the amateur record. */
export function recordAfter(w: World, f: Fighter, b: Bout): FightRecord {
  const am = PROMOTIONS[b.promo]?.tier === "amateur";
  const rec = { ...(am ? f.am : f.rec) };
  // Take off every result that came later.
  for (const id of f.bouts) {
    const x = w.bouts[id];
    if (!x || x.id === b.id || x.status !== "done" || !x.res) continue;
    const later = x.day > b.day || (x.day === b.day && x.id > b.id);
    if (!later) continue;
    if ((PROMOTIONS[x.promo]?.tier === "amateur") !== am) continue;
    const side = x.a === f.id ? "a" : "b";
    const r = x.res;
    if (r.method === "NC") rec.nc = Math.max(0, rec.nc - 1);
    else if (!r.winner) rec.d = Math.max(0, rec.d - 1);
    else if (r.winner === side) rec.w = Math.max(0, rec.w - 1);
    else rec.l = Math.max(0, rec.l - 1);
  }
  return rec;
}

/** The fights a report is kept for, for good: the big stages, title fights and the player's. */
export function keepsReport(w: World, b: Bout): boolean {
  const tier = PROMOTIONS[b.promo]?.tier;
  return tier === "major" || tier === "league" || tier === "tryout" || isBeltFight(b) || !!w.fighters[b.a]?.ctrl || !!w.fighters[b.b]?.ctrl;
}

/** Monthly: round-by-round numbers for small shows are let go after six months. */
export function pruneReports(w: World): void {
  for (const b of Object.values(w.bouts)) {
    if (!b.res?.rx || b.day > w.day - 182) continue;
    if (!keepsReport(w, b)) delete b.res.rx;
  }
}
