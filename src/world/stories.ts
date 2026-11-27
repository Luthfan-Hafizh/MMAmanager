// Storylines between the fighters the world runs, not only around the player: a
// rematch after a split decision, a draw, a no contest or a disqualification; a
// trilogy when a series stands at one each; a grudge when two contenders near each
// other trade words. The matchmaker leans toward booking them, the bout is billed
// as the rematch or the trilogy, and the news follows.

import type { Rng } from "../core/rng";
import { PROMOTIONS, PROMO_IDS } from "../data/promotions";
import { DIVISIONS } from "../data/divisions";
import type { Bout, Fighter, MMAEvent, Story, World } from "../model/types";
import { addNews, fullName, rankOf } from "./core";

const KEEP = 540;

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** An open storyline between two fighters. */
export function storyOf(w: World, a: string, b: string): Story | null {
  const k = pairKey(a, b);
  return (w.stories ?? []).find((s) => !s.done && pairKey(s.a, s.b) === k) ?? null;
}

/** How many times they've met, and how the series stands. */
function series(w: World, a: Fighter, b: Fighter): { n: number; aw: number; bw: number } {
  let n = 0;
  let aw = 0;
  let bw = 0;
  for (const id of a.bouts) {
    const x = w.bouts[id];
    if (!x || x.status !== "done" || !x.res || (x.a !== b.id && x.b !== b.id)) continue;
    n++;
    const win = x.res.winner === "a" ? x.a : x.res.winner === "b" ? x.b : null;
    if (win === a.id) aw++;
    else if (win === b.id) bw++;
  }
  return { n, aw, bw };
}

const big = (w: World, b: Bout) => b.promo === "ufc" || b.promo === "pfl";

function open(w: World, s: Omit<Story, "since">, text: string, news: boolean): void {
  w.stories ??= [];
  if (storyOf(w, s.a, s.b)) return;
  w.stories.push({ ...s, since: w.day });
  if (news) addNews(w, { kind: "other", promo: s.promo, fighters: [s.a, s.b], text });
}

/** After a fight between two of the world's fighters: does it start a storyline, or finish one? */
export function storyAfterBout(w: World, rng: Rng, b: Bout): void {
  const A = w.fighters[b.a];
  const B = w.fighters[b.b];
  if (!A || !B || A.ctrl || B.ctrl || !b.res) return;
  // Storylines live where there are rankings: the UFC, the PFL and the regional promotions.
  if (!PROMOTIONS[b.promo].rankSize) return;
  const st = storyOf(w, A.id, B.id);
  if (st) st.done = true;
  if (A.promo !== b.promo || B.promo !== b.promo || A.status !== "active" || B.status !== "active") return;
  const s = series(w, A, B);
  const r = b.res;
  const ranked = rankOf(w, A) !== null || rankOf(w, B) !== null;
  const where = w.events[b.ev]?.name ?? "the last card";
  // One each: the decider.
  if (s.n >= 2 && s.aw === 1 && s.bw === 1 && rng.chance(0.8)) {
    open(w, { a: A.id, b: B.id, kind: "trilogy", promo: b.promo, why: `one win each, the second at ${where}` }, `One each: ${fullName(A)} and ${fullName(B)} are headed for a trilogy.`, big(w, b));
    return;
  }
  if (s.n >= 2) return;
  // A close or unfinished first fight: run it back.
  const close = r.method === "DRAW" ? 0.7 : r.method === "DEC" && r.verdict === "split" ? 0.35 : r.method === "NC" ? 0.85 : r.method === "DQ" ? 0.6 : 0;
  // Only when it matters: a ranked fighter, or a belt.
  const p = ranked || b.kind !== "regular" ? close : 0;
  if (p > 0 && rng.chance(p)) {
    const how = r.method === "NC" ? "a no contest" : r.method === "DQ" ? "a disqualification" : r.method === "DRAW" ? "a draw" : "a split decision";
    open(w, { a: A.id, b: B.id, kind: "rematch", promo: b.promo, why: `${how} at ${where}` }, `After ${how} at ${where}, a rematch between ${fullName(A)} and ${fullName(B)} is wanted.`, big(w, b));
  }
}

/** A storyline pair booked: billed as the rematch, the trilogy or the grudge match. */
export function storyBooked(w: World, ev: MMAEvent, bout: Bout): void {
  const st = storyOf(w, bout.a, bout.b);
  if (!st || st.booked === bout.id) return;
  st.booked = bout.id;
  bout.story = st.kind;
  const A = w.fighters[bout.a];
  const B = w.fighters[bout.b];
  const n = series(w, A, B).n + 1;
  const what = st.kind === "trilogy" ? "The trilogy" : st.kind === "grudge" ? "The grudge match" : "The rematch";
  if (bout.promo === "ufc" || bout.promo === "pfl" || bout.kind !== "regular") addNews(w, { kind: "booking", promo: bout.promo, ev: ev.id, fighters: [A.id, B.id], text: `${what} is set: ${fullName(A)} vs ${fullName(B)}${n > 1 ? ` ${n}` : ""} at ${ev.name}.` });
}

/** How much a matchmaker wants this pair: a negative cost for an open storyline. */
export function storyPull(w: World, a: string, b: string): number {
  const st = storyOf(w, a, b);
  return st ? (st.kind === "trilogy" ? -10 : -8) : 0;
}

/** Monthly: storylines that went nowhere fade; now and then two contenders near each other start a grudge. */
export function storiesMonthly(w: World, rng: Rng): void {
  w.stories ??= [];
  for (const s of w.stories) {
    if (s.done) continue;
    const A = w.fighters[s.a];
    const B = w.fighters[s.b];
    const gone = !A || !B || A.status !== "active" || B.status !== "active" || A.promo !== s.promo || B.promo !== s.promo || A.div !== B.div;
    const booked = s.booked && w.bouts[s.booked]?.status === "booked";
    if (!booked && (gone || w.day - s.since > KEEP)) s.done = true;
  }
  // Keep the list short: the closed ones go after a while.
  w.stories = w.stories.filter((s) => !s.done || w.day - s.since < 900);
  for (const promo of PROMO_IDS) {
    const p = PROMOTIONS[promo];
    if (promo !== "ufc" && promo !== "pfl") continue;
    if (!rng.chance(0.35)) continue;
    const d = rng.pick(p.divisions);
    const ranks = (w.promos[promo].ranks[d] ?? []).map((id) => w.fighters[id]).filter((f) => f && !f.ctrl && f.status === "active" && f.div === d);
    const loud = ranks.filter((f) => f.pers.controversy >= 13);
    if (!loud.length) continue;
    const x = rng.pick(loud);
    const i = ranks.indexOf(x);
    const near = ranks.filter((f, k) => f !== x && Math.abs(k - i) <= 4 && f.gym !== x.gym && !storyOf(w, x.id, f.id));
    if (!near.length) continue;
    const y = rng.pick(near);
    open(w, { a: x.id, b: y.id, kind: "grudge", promo, why: `words traded at ${DIVISIONS[d].name.toLowerCase()}` }, `${fullName(x)} and ${fullName(y)} trade insults online, and the ${p.short} ${DIVISIONS[d].name.toLowerCase()} division has a grudge match in the making.`, true);
  }
}

/** For the event page: what the bout is billed as. */
export function storyLabel(b: Bout): string | null {
  return b.story === "trilogy" ? "Trilogy" : b.story === "rematch" ? "Rematch" : b.story === "grudge" ? "Grudge match" : null;
}
