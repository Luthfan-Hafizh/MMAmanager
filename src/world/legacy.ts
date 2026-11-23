// Legacy: what a career is worth when it is over. Belts and defences at the
// top count most, then wins over the best, finishes and time at the top of
// the pound-for-pound list. The Hall of Fame inducts a class every July, at
// International Fight Week.

import { ymd, dayOf, nextDow } from "../core/time";
import { clamp } from "../core/util";
import { PROMOTIONS } from "../data/promotions";
import type { Bout, Fighter, World } from "../model/types";
import { addNews, fullName, rankOf } from "./core";

const TIER_W: Record<string, number> = { amateur: 0.05, local: 0.15, regional: 0.3, tryout: 0.5, league: 0.6, major: 1 };
const TITLE_PTS: Record<string, [number, number]> = { major: [20, 7], league: [10, 3], regional: [3, 1], local: [1, 0.3], amateur: [0.5, 0], tryout: [0, 0] };

/**
 * UFC title history of champions on the roster before October 2026, as
 * [reigns, defences]. Approximate: the snapshot marks only current champions.
 */
export const KNOWN_TITLES: Record<string, [number, number]> = {
  "ufc-jon-jones": [3, 12], "ufc-valentina-shevchenko": [2, 8], "ufc-alexander-volkanovski": [2, 6], "ufc-islam-makhachev": [2, 4],
  "ufc-israel-adesanya": [2, 5], "ufc-kamaru-usman": [1, 5], "ufc-alex-pereira": [3, 3], "ufc-max-holloway": [1, 3],
  "ufc-alexandre-pantoja": [1, 4], "ufc-zhang-weili": [2, 4], "ufc-aljamain-sterling": [1, 3], "ufc-merab-dvalishvili": [1, 3],
  "ufc-charles-oliveira": [1, 1], "ufc-leon-edwards": [1, 2], "ufc-robert-whittaker": [1, 1], "ufc-ilia-topuria": [2, 1],
  "ufc-dricus-du-plessis": [1, 2], "ufc-sean-omalley": [1, 1], "ufc-rose-namajunas": [2, 1], "ufc-julianna-pena": [2, 0],
  "ufc-brandon-moreno": [2, 0], "ufc-deiveson-figueiredo": [2, 1], "ufc-tom-aspinall": [1, 1], "ufc-jiri-prochazka": [1, 0],
  "ufc-khamzat-chimaev": [1, 0], "ufc-belal-muhammad": [1, 0], "ufc-jack-della-maddalena": [1, 0], "ufc-magomed-ankalaev": [1, 0],
  "ufc-sean-strickland": [2, 0], "ufc-justin-gaethje": [1, 0], "ufc-petr-yan": [2, 0], "ufc-joshua-van": [1, 0],
  "ufc-kayla-harrison": [1, 0], "ufc-ciryl-gane": [1, 0], "ufc-carlos-ulberg": [1, 0],
};

/** Points a fighter brings into the world (real careers before October 2026). */
export function startingLegacy(f: Fighter, titleDefences: number): number {
  const big = f.promo === "ufc" || f.tags?.includes("ufc-alum");
  return Math.round((f.reigns * (big ? 22 : 9) + titleDefences * (big ? 7 : 3) + f.rec.w * (big ? 0.6 : 0.3) + (f.rec.koW + f.rec.subW) * 0.2) * 10) / 10;
}

/** Called once a result is in. */
export function legacyAfterFight(w: World, b: Bout, winner: Fighter | null, loser: Fighter | null, rankLoser: number | null, titleWon: boolean, defended: boolean): void {
  if (!winner || !loser) return;
  const tier = PROMOTIONS[b.promo].tier;
  const tw = TIER_W[tier];
  let pts = 0.6 * tw;
  if (b.res && b.res.method !== "DEC") pts += 0.4 * tw;
  if ((tier === "major" || tier === "league") && rankLoser !== null) pts += rankLoser === 0 ? 5 : rankLoser <= 5 ? 3 : 2;
  if (loser.reigns > 0 && (tier === "major" || tier === "league")) pts += 3;
  if (titleWon) pts += TITLE_PTS[tier][0];
  if (defended) pts += TITLE_PTS[tier][1];
  if (b.res?.bonus?.length) pts += 0.5;
  winner.legacy = Math.round(((winner.legacy ?? 0) + pts) * 10) / 10;
  winner.bestStreak = Math.max(winner.bestStreak ?? 0, winner.streak);
}

/** Monthly: time at the top of the pound-for-pound list. */
export function legacyMonthly(w: World): void {
  w.p4p.forEach((id, i) => {
    const f = w.fighters[id];
    if (!f) return;
    f.legacy = Math.round(((f.legacy ?? 0) + (i === 0 ? 1.2 : i < 5 ? 0.5 : 0.2)) * 10) / 10;
  });
  // International Fight Week: the first Saturday of July.
  const t = ymd(w.day);
  const ifw = nextDow(dayOf(t.y, 6, 1), 5);
  if (w.day === ifw) induct(w);
}

export function goatList(w: World, n = 30): Fighter[] {
  return Object.values(w.fighters)
    .filter((f) => (f.legacy ?? 0) > 0 && (f.promo === "ufc" || f.tags?.includes("ufc-alum") || f.reigns > 0))
    .sort((a, b) => (b.legacy ?? 0) - (a.legacy ?? 0))
    .slice(0, n);
}

export function goatRank(w: World, f: Fighter): number | null {
  const list = goatList(w, 100);
  const i = list.indexOf(f);
  return i >= 0 ? i + 1 : null;
}

function induct(w: World): void {
  const year = ymd(w.day).y;
  const done = new Set(w.hof.map((h) => h.fighter));
  const cands = Object.values(w.fighters)
    .filter((f) => f.status === "retired" && !done.has(f.id) && (f.retired ?? w.day) <= w.day - 300 && (f.legacy ?? 0) >= 45)
    .sort((a, b) => (b.legacy ?? 0) - (a.legacy ?? 0))
    .slice(0, 3);
  for (const f of cands) {
    w.hof.push({ fighter: f.id, year });
    addNews(w, { kind: "other", fighters: [f.id], big: true, text: `${fullName(f)} is inducted into the Hall of Fame at International Fight Week ${year}.` });
  }
}

export interface RecordRow {
  label: string;
  rows: { f: Fighter; v: number; text: string }[];
}

/** All-time numbers in this world (since October 2026) and career numbers for the active. */
export function records(w: World): RecordRow[] {
  const all = Object.values(w.fighters);
  const ufcWins = new Map<string, number>();
  const ufcFinishes = new Map<string, number>();
  for (const b of Object.values(w.bouts)) {
    if (b.promo !== "ufc" || b.status !== "done" || !b.res?.winner) continue;
    const id = b.res.winner === "a" ? b.a : b.b;
    ufcWins.set(id, (ufcWins.get(id) ?? 0) + 1);
    if (b.res.method !== "DEC") ufcFinishes.set(id, (ufcFinishes.get(id) ?? 0) + 1);
  }
  const top = (m: Map<string, number>, label: string, unit: string): RecordRow => ({
    label,
    rows: [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => ({ f: w.fighters[id], v, text: `${v} ${unit}` })),
  });
  const defences = new Map<string, number>();
  for (const r of w.promos.ufc.reigns) if (r.won >= w.start && !r.interim) defences.set(r.fighter, Math.max(defences.get(r.fighter) ?? 0, r.defenses));
  const streaks = all.filter((f) => (f.bestStreak ?? 0) > 0).sort((a, b) => (b.bestStreak ?? 0) - (a.bestStreak ?? 0)).slice(0, 10);
  const wins = all.filter((f) => f.rec.w > 0).sort((a, b) => b.rec.w - a.rec.w).slice(0, 10);
  return [
    top(ufcWins, "Most UFC wins since 2026", "wins"),
    top(ufcFinishes, "Most UFC finishes since 2026", "finishes"),
    { label: "Most defences in one UFC reign (since 2026)", rows: [...defences.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => ({ f: w.fighters[id], v, text: `${v} defences` })) },
    { label: "Longest win streaks", rows: streaks.map((f) => ({ f, v: f.bestStreak ?? 0, text: `${f.bestStreak} in a row` })) },
    { label: "Most professional wins (whole career)", rows: wins.map((f) => ({ f, v: f.rec.w, text: `${f.rec.w} wins` })) },
  ];
}

export function legacyText(v: number): string {
  if (v >= 150) return "All-time great";
  if (v >= 90) return "Hall of Famer";
  if (v >= 50) return "Champion's résumé";
  if (v >= 20) return "Notable career";
  if (v >= 5) return "Building a name";
  return "Starting out";
}

export function rankNowText(w: World, f: Fighter): string {
  const r = rankOf(w, f);
  return r === 0 ? "Champion" : r ? `#${r}` : "Unranked";
}

export { clamp };
