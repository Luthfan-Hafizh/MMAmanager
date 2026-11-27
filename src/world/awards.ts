// Year-end awards, every January for the year just gone, the way the UFC and the
// MMA press hand them out: the UFC's Fighter, Fight, Knockout, Submission, Upset and
// Newcomer of the Year, and a Fighter of the Year in every other ranked promotion
// (so a regional run can win one too). They go in the news, on the Legacy page and
// the winner's page, and to the player as a message.

import { dayOf, ymd } from "../core/time";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS, PROMO_IDS, type PromoId } from "../data/promotions";
import { isFinish, methodPhrase } from "../engine/sim";
import type { Award, AwardKind, Bout, World } from "../model/types";
import { addNews, fullName, stageFights } from "./core";
import { notify } from "../career/inbox";

export const AWARD_NAME: Record<AwardKind, string> = {
  fighter: "Fighter of the Year",
  fight: "Fight of the Year",
  ko: "Knockout of the Year",
  sub: "Submission of the Year",
  upset: "Upset of the Year",
  newcomer: "Newcomer of the Year",
};

const belt = (b: Bout) => b.kind === "title" || b.kind === "vacant" || b.kind === "interim";
const exc = (b: Bout) => (b.res as { exc?: number } | undefined)?.exc ?? 0;
const winnerOf = (b: Bout) => (b.res?.winner === "a" ? b.a : b.res?.winner === "b" ? b.b : null);
const loserOf = (b: Bout) => (b.res?.winner === "a" ? b.b : b.res?.winner === "b" ? b.a : null);
/** The loser's rank before the fight: 0 champion, 1-15, or null. */
const loserRank = (b: Bout) => (b.res?.winner === "a" ? b.rankB : b.rankA) ?? null;
const rankBonus = (r: number | null | undefined) => (r === 0 ? 5 : r ? (16 - r) * 0.25 : 0);

function list(n: number, word: string): string {
  const words = ["no", "one", "two", "three", "four", "five", "six"];
  const plural = /(s|sh|ch|x)$/.test(word) ? `${word}es` : `${word}s`;
  return `${words[n] ?? n} ${n === 1 ? word : plural}`;
}

/** The year's fights at one promotion. */
function boutsOf(w: World, promo: PromoId, year: number): Bout[] {
  const from = dayOf(year, 0, 1);
  const to = dayOf(year + 1, 0, 1);
  return Object.values(w.bouts).filter((b) => b.promo === promo && b.status === "done" && b.res && b.day >= from && b.day < to);
}

function fighterOfYear(w: World, bouts: Bout[]): { id: string; why: string } | null {
  const tally = new Map<string, { s: number; w: number; l: number; d: number; fin: number; belts: number; n: number }>();
  for (const b of bouts) {
    for (const id of [b.a, b.b]) {
      const t = tally.get(id) ?? { s: 0, w: 0, l: 0, d: 0, fin: 0, belts: 0, n: 0 };
      t.n++;
      if (winnerOf(b) === id) {
        t.w++;
        t.s += 3 + (isFinish(b.res!.method) ? 1.5 : 0) + (belt(b) ? 4 : 0) + rankBonus(loserRank(b));
        if (isFinish(b.res!.method)) t.fin++;
        if (belt(b)) t.belts++;
      } else if (loserOf(b) === id) {
        t.l++;
        t.s -= 3;
      } else t.d++;
      tally.set(id, t);
    }
  }
  const best = [...tally.entries()].filter(([, t]) => t.n >= 2 && t.w >= 2 && t.s > 0).sort((a, b) => b[1].s - a[1].s)[0];
  if (!best) return null;
  const [id, t] = best;
  const parts = [`${t.w}-${t.l}${t.d ? `-${t.d}` : ""} in the year`];
  if (t.fin) parts.push(list(t.fin, "finish"));
  if (t.belts) parts.push(`${list(t.belts, "title fight")} won`);
  return { id, why: parts.join(", ") };
}

function fightOfYear(bouts: Bout[]): Bout | null {
  return bouts.filter((b) => b.res!.method !== "NC").sort((x, y) => exc(y) + (belt(y) ? 2 : 0) - (exc(x) + (belt(x) ? 2 : 0)))[0] ?? null;
}

function finishOfYear(bouts: Bout[], ko: boolean): Bout | null {
  const rare = (d: string) => (/head kick|spinning|flying|elbow|knee/i.test(d) ? 2 : /calf|twister|gogo|ezekiel|heel|bulldog|anaconda|von flue/i.test(d) ? 2 : /rear-naked/i.test(d) ? 0 : 1);
  const score = (b: Bout) => exc(b) * 0.6 + rare(b.res!.detail) + (b.res!.round === 1 ? 1 : 0) + (b.res!.round === 1 && b.res!.time < 60 ? 2 : 0) + rankBonus(loserRank(b)) + (belt(b) ? 2 : 0);
  // A stoppage from the corner or the doctor is no highlight knockout.
  const stoppage = (b: Bout) => /corner|doctor/i.test(b.res!.detail);
  return bouts.filter((b) => (ko ? (b.res!.method === "KO" || b.res!.method === "TKO") && !stoppage(b) : b.res!.method === "SUB") && b.res!.winner).sort((x, y) => score(y) - score(x))[0] ?? null;
}

function upsetOfYear(bouts: Bout[]): { b: Bout; p: number } | null {
  let best: { b: Bout; p: number } | null = null;
  for (const b of bouts) {
    if (b.odds === undefined || !b.res!.winner || b.res!.method === "NC" || b.res!.method === "DQ") continue;
    const p = b.res!.winner === "a" ? b.odds : 1 - b.odds;
    if (p < 0.4 && (!best || p < best.p)) best = { b, p };
  }
  return best;
}

function newcomerOfYear(w: World, bouts: Bout[], year: number): { id: string; why: string } | null {
  const from = dayOf(year, 0, 1);
  const tally = new Map<string, { w: number; l: number; fin: number; s: number }>();
  for (const b of bouts) {
    for (const id of [b.a, b.b]) {
      const f = w.fighters[id];
      if (!f) continue;
      // A newcomer: no fights on this stage before the year (in this world or before it began).
      const before = (f.prior?.promo === b.promo ? f.prior.n : 0) + f.bouts.filter((x) => w.bouts[x]?.promo === b.promo && w.bouts[x].status === "done" && w.bouts[x].day < from).length;
      if (before > 0 || stageFights(w, f, b.promo) < 2) continue;
      const t = tally.get(id) ?? { w: 0, l: 0, fin: 0, s: 0 };
      if (winnerOf(b) === id) {
        t.w++;
        t.s += 3 + (isFinish(b.res!.method) ? 1.5 : 0) + rankBonus(loserRank(b));
        if (isFinish(b.res!.method)) t.fin++;
      } else if (loserOf(b) === id) {
        t.l++;
        t.s -= 3;
      }
      tally.set(id, t);
    }
  }
  const best = [...tally.entries()].filter(([, t]) => t.w >= 2 && t.s > 0).sort((a, b) => b[1].s - a[1].s)[0];
  if (!best) return null;
  const [id, t] = best;
  return { id, why: `${t.w}-${t.l} in a first year in the UFC${t.fin ? `, ${list(t.fin, "finish")}` : ""}` };
}

function vs(w: World, b: Bout): string {
  const x = w.fighters[winnerOf(b) ?? b.a];
  const y = w.fighters[loserOf(b) ?? b.b];
  return `${fullName(x)} ${b.res?.winner ? "over" : "and"} ${fullName(y)}`;
}

/** The awards for a year, once. Called in January for the year just gone. */
export function yearEndAwards(w: World, year: number): void {
  w.awards ??= [];
  if (w.awards.some((a) => a.year === year)) return;
  // Only a whole year: the months before the world began aren't in it.
  if (dayOf(year, 0, 1) < w.start - 31) return;
  const out: Award[] = [];
  for (const promo of PROMO_IDS) {
    const p = PROMOTIONS[promo];
    if (!p.rankSize) continue;
    const bouts = boutsOf(w, promo, year);
    if (bouts.length < 10) continue;
    const foy = fighterOfYear(w, bouts);
    if (foy) out.push({ year, promo, kind: "fighter", fighters: [foy.id], why: foy.why });
    if (promo !== "ufc") continue;
    const fight = fightOfYear(bouts);
    if (fight) out.push({ year, promo, kind: "fight", fighters: [fight.a, fight.b], bout: fight.id, why: `${vs(w, fight)}, ${methodPhrase(fight.res!.method, fight.res!.detail)}${belt(fight) ? `, for the ${DIVISIONS[fight.div].name.toLowerCase()} title` : ""}` });
    const ko = finishOfYear(bouts, true);
    if (ko) out.push({ year, promo, kind: "ko", fighters: [winnerOf(ko)!], bout: ko.id, why: `${vs(w, ko)}: ${ko.res!.detail.toLowerCase()} in round ${ko.res!.round}` });
    const sub = finishOfYear(bouts, false);
    if (sub) out.push({ year, promo, kind: "sub", fighters: [winnerOf(sub)!], bout: sub.id, why: `${vs(w, sub)}: ${sub.res!.detail.toLowerCase()} in round ${sub.res!.round}` });
    const up = upsetOfYear(bouts);
    if (up) {
      const line = up.p > 0.5 ? "" : `+${Math.round(((1 - up.p) / Math.max(0.01, up.p)) * 100)}`;
      out.push({ year, promo, kind: "upset", fighters: [winnerOf(up.b)!], bout: up.b.id, why: `${vs(w, up.b)}${line ? ` as a ${line} underdog` : ""}` });
    }
    const nc = newcomerOfYear(w, bouts, year);
    if (nc) out.push({ year, promo, kind: "newcomer", fighters: [nc.id], why: nc.why });
  }
  w.awards.push(...out);
  for (const a of out) {
    const who = w.fighters[a.fighters[0]];
    if (!who) continue;
    const name = a.kind === "fight" ? `${fullName(w.fighters[a.fighters[0]])} and ${fullName(w.fighters[a.fighters[1]])}` : fullName(who);
    if (a.promo === "ufc" || a.promo === "pfl") addNews(w, { kind: "other", promo: a.promo, fighters: a.fighters, big: a.kind === "fighter", text: `${PROMOTIONS[a.promo].short} ${year} awards: ${AWARD_NAME[a.kind]} to ${name} (${a.why}).` });
    for (const id of a.fighters) {
      const f = w.fighters[id];
      if (!f?.ctrl) continue;
      notify(w, {
        kind: "info",
        fighter: id,
        from: `${PROMOTIONS[a.promo].short} awards`,
        subject: `${AWARD_NAME[a.kind]} ${year}`,
        body: `${fullName(f)} is the ${PROMOTIONS[a.promo].short}'s ${AWARD_NAME[a.kind].toLowerCase()} for ${year}: ${a.why}. It goes on the record, on the Legacy page and on the fighter's page.`,
        facts: [
          { k: "Award", v: AWARD_NAME[a.kind], tone: "good" },
          { k: "Year", v: String(year) },
        ],
      });
    }
  }
}

/** January: the awards for the year just gone. */
export function awardsMonthly(w: World): void {
  const t = ymd(w.day);
  if (t.m === 0) yearEndAwards(w, t.y - 1);
}

/** A fighter's awards, newest first. */
export function awardsOf(w: World, id: string): Award[] {
  return (w.awards ?? []).filter((a) => a.fighters.includes(id)).sort((a, b) => b.year - a.year);
}
