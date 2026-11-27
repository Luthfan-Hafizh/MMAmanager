// Legacy: what a career is worth when it is over. Belts and defences at the
// top count most, then wins over the best, finishes and time at the top of
// the pound-for-pound list. The Hall of Fame inducts a class every July, at
// International Fight Week.

import { isFinish } from "../engine/sim";
import { ymd, dayOf, nextDow } from "../core/time";
import { clamp } from "../core/util";
import { PROMOTIONS, type PromoId } from "../data/promotions";
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
  if (b.res && isFinish(b.res.method)) pts += 0.4 * tw;
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
/** Records since the world began at one promotion, or over whole careers ("all"). */
export function records(w: World, promo: PromoId | "all" = "ufc"): RecordRow[] {
  const all = Object.values(w.fighters);
  const top = (m: Map<string, number>, label: string, unit: string, n = 10): RecordRow => ({
    label,
    rows: [...m.entries()].filter(([id, v]) => v > 0 && w.fighters[id]).sort((a, b) => b[1] - a[1]).slice(0, n).map(([id, v]) => ({ f: w.fighters[id], v, text: `${v} ${unit}` })),
  });
  if (promo === "all") {
    const by = (k: (f: Fighter) => number) => new Map(all.map((f) => [f.id, k(f)] as [string, number]));
    const streaks = all.filter((f) => (f.bestStreak ?? 0) > 0).sort((a, b) => (b.bestStreak ?? 0) - (a.bestStreak ?? 0)).slice(0, 10);
    return [
      top(by((f) => f.rec.w), "Most professional wins", "wins"),
      top(by((f) => f.rec.koW + f.rec.subW), "Most finishes", "finishes"),
      top(by((f) => f.rec.koW), "Most knockouts", "KO/TKO"),
      top(by((f) => f.rec.subW), "Most submissions", "submissions"),
      { label: "Longest win streaks", rows: streaks.map((f) => ({ f, v: f.bestStreak ?? 0, text: `${f.bestStreak} in a row` })) },
      top(by((f) => f.reigns), "Most title reigns (UFC and PFL)", "reigns"),
    ];
  }
  const inc = (m: Map<string, number>, id: string, n = 1) => m.set(id, (m.get(id) ?? 0) + n);
  const wins = new Map<string, number>();
  const fin = new Map<string, number>();
  const kos = new Map<string, number>();
  const subs = new Map<string, number>();
  const titles = new Map<string, number>();
  const bonuses = new Map<string, number>();
  const fights = new Map<string, number>();
  const fastest: { id: string; secs: number; b: Bout }[] = [];
  const mine = new Map<string, Bout[]>();
  for (const b of Object.values(w.bouts)) {
    if (b.promo !== promo || b.status !== "done" || !b.res) continue;
    for (const id of [b.a, b.b]) {
      inc(fights, id);
      (mine.get(id) ?? mine.set(id, []).get(id)!).push(b);
    }
    for (const x of b.res.bonus ?? []) {
      if (x === "fotn") {
        inc(bonuses, b.a);
        inc(bonuses, b.b);
      } else if (x === "potn-a") inc(bonuses, b.a);
      else if (x === "potn-b") inc(bonuses, b.b);
    }
    const id = b.res.winner === "a" ? b.a : b.res.winner === "b" ? b.b : null;
    if (!id || b.res.method === "NC") continue;
    inc(wins, id);
    if (isFinish(b.res.method)) {
      inc(fin, id);
      fastest.push({ id, secs: (b.res.round - 1) * b.roundSec + b.res.time, b });
    }
    if (b.res.method === "KO" || b.res.method === "TKO") inc(kos, id);
    if (b.res.method === "SUB") inc(subs, id);
    if (b.kind === "title" || b.kind === "vacant" || b.kind === "interim") inc(titles, id);
  }
  // The longest run of wins on this stage.
  const streak = new Map<string, number>();
  for (const [id, list] of mine) {
    let run = 0;
    let best = 0;
    for (const b of list.sort((x, y) => x.day - y.day)) {
      const won = (b.res!.winner === "a" ? b.a : b.res!.winner === "b" ? b.b : null) === id;
      if (b.res!.method === "NC") continue;
      run = won ? run + 1 : 0;
      best = Math.max(best, run);
    }
    if (best > 1) streak.set(id, best);
  }
  const defences = new Map<string, number>();
  for (const r of w.promos[promo]?.reigns ?? []) if (r.won >= w.start && !r.interim) defences.set(r.fighter, Math.max(defences.get(r.fighter) ?? 0, r.defenses));
  const clockOf = (t: number) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, "0")}`;
  return [
    top(wins, "Most wins", "wins"),
    top(fin, "Most finishes", "finishes"),
    top(kos, "Most knockouts", "KO/TKO"),
    top(subs, "Most submissions", "submissions"),
    top(titles, "Most title-fight wins", "title-fight wins"),
    { label: "Most defences in one reign", rows: [...defences.entries()].filter(([id, v]) => v > 0 && w.fighters[id]).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id, v]) => ({ f: w.fighters[id], v, text: `${v} defence${v === 1 ? "" : "s"}` })) },
    top(streak, "Longest win streak", "in a row"),
    top(bonuses, "Most bonuses", "bonuses"),
    {
      label: "Fastest finishes",
      rows: fastest
        .filter((x) => w.fighters[x.id])
        .sort((a, b) => a.secs - b.secs)
        .slice(0, 10)
        .map((x) => {
          const opp = w.fighters[x.b.a === x.id ? x.b.b : x.b.a];
          return { f: w.fighters[x.id], v: x.secs, text: `${clockOf(x.secs)} · ${x.b.res!.method === "SUB" ? "SUB" : "KO"} v ${opp?.surname ?? ""}` };
        }),
    },
    top(fights, "Most fights", "fights"),
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
