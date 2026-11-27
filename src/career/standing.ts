// What a fighter has done that the market and the matchmakers remember: the
// belts won and defended anywhere, and what the last deal paid. A promotion
// signing a champion from elsewhere pays for the name and books a ranked
// opponent for the first fight, the way the UFC put Bellator's champions in with
// top-ten names (Michael Chandler against Dan Hooker, Eddie Alvarez against
// Donald Cerrone) rather than at the bottom of the roster.

import { PROMOTIONS, PROMO_IDS, TIER_RANK, type PromoId } from "../data/promotions";
import type { DivisionId } from "../data/divisions";
import { ovrOf } from "../model/attributes";
import type { Fighter, World } from "../model/types";
import { stageFights } from "../world/core";

/** A fighter's title reigns at one promotion, taken together. */
export interface TitleRun {
  promo: PromoId;
  div: DivisionId;
  /** Defences across every reign there. */
  defences: number;
  reigns: number;
  /** Still the champion. */
  current: boolean;
  /** The last reign ended in a loss (or was stripped), not by leaving. */
  lostIt: boolean;
}

/**
 * The fighter's best title run that still counts: held now, or ended within two
 * years. The bigger stage first, then the longer run.
 */
export function bestReign(w: World, f: Fighter, within = 730): TitleRun | null {
  let best: TitleRun | null = null;
  let bestScore = -1;
  for (const id of PROMO_IDS) {
    const ps = w.promos[id];
    const tier = PROMOTIONS[id].tier;
    if (!ps || tier === "amateur" || tier === "tryout") continue;
    let defences = 0;
    let reigns = 0;
    let current = false;
    let lastEnd = -1;
    let lostIt = false;
    let div: DivisionId | null = null;
    for (const r of ps.reigns) {
      if (r.fighter !== f.id || r.interim) continue;
      reigns++;
      defences += r.defenses;
      div = r.div;
      if (r.lost === undefined) current = current || ps.champs[r.div] === f.id;
      else if (r.lost > lastEnd) {
        lastEnd = r.lost;
        lostIt = r.ended === "lost" || r.ended === "stripped";
      }
    }
    if (!reigns || !div) continue;
    if (!current && (lastEnd < 0 || w.day - lastEnd > within)) continue;
    const score = TIER_RANK[tier] * 100 + defences + reigns * 2;
    if (score > bestScore) {
      bestScore = score;
      best = { promo: id, div, defences, reigns, current, lostIt: current ? false : lostIt };
    }
  }
  return best;
}

/**
 * A reign long enough to skip the Contender Series: four defences, or three
 * across two reigns or two divisions. Salahdine Parnasse (two KSW belts, seven
 * defences) was signed straight to a ranked opponent; Bilal Hasan (three Cage
 * Fury defences) went through the Contender Series first.
 */
export function longReign(r: TitleRun): boolean {
  return r.defences >= 4 || (r.reigns >= 2 && r.defences >= 3);
}

/** "PFL champion, 11 title defences", "two-time PFL champion". */
export function reignText(r: TitleRun): string {
  const s = PROMOTIONS[r.promo].short;
  const who = r.reigns > 1 ? `${r.reigns === 2 ? "two" : r.reigns === 3 ? "three" : r.reigns}-time ${s} champion` : `${s} champion`;
  return r.defences ? `${who}, ${r.defences} title defence${r.defences === 1 ? "" : "s"}` : who;
}

export interface DebutBand {
  lo: number;
  hi: number;
  why: string;
}

/**
 * Who a newcomer with a name made elsewhere meets first: a band of the rankings,
 * and why. At the UFC a PFL champion with a long reign meets a top-ten fighter,
 * a newer champion someone at the foot of the fifteen; a regional champion who
 * has defended for years gets the bottom of the list too. At the PFL a UFC
 * champion or a ranked UFC name meets its best. Everyone else starts among the
 * unranked and wins a way in.
 */
export function debutBand(w: World, f: Fighter, promo: PromoId): DebutBand | null {
  const p = PROMOTIONS[promo];
  if (!p.rankSize || (p.tier !== "major" && p.tier !== "league")) return null;
  // A debut: no fights on this stage, in this world or before it began.
  if (f.joined <= w.start || stageFights(w, f, promo) > 0) return null;
  const o = ovrOf(f.attrs);
  if (o < 66) return null;
  const run = bestReign(w, f);
  const n = p.rankSize;
  if (promo === "ufc") {
    if (run && run.promo !== "ufc") {
      const there = PROMOTIONS[run.promo].tier;
      const d = run.lostIt ? Math.max(0, run.defences - 2) : run.defences;
      if (there === "league") {
        if (d >= 5) return { lo: 5, hi: 10, why: reignText(run) };
        if (d >= 2) return { lo: 7, hi: 12, why: reignText(run) };
        return { lo: 10, hi: n, why: reignText(run) };
      }
      // A long reign on the regional scene: Salahdine Parnasse's KSW years earned Dan Hooker first time out.
      if (there === "regional" && longReign(run) && o >= 70) return { lo: 9, hi: n, why: reignText(run) };
    }
    if (f.streak >= 10 && o >= 76) return { lo: 11, hi: n, why: `a ${f.streak}-fight win streak` };
    return null;
  }
  // The PFL: a champion or a ranked name from the UFC is its best.
  if (run && run.promo === "ufc") return { lo: 1, hi: 4, why: reignText(run) };
  if (f.peakRank !== undefined && f.peakRank > 0 && f.peakRank <= 15 && f.tags?.includes("ufc-alum")) {
    return f.peakRank <= 8 ? { lo: 1, hi: 5, why: `ranked #${f.peakRank} in the UFC` } : { lo: 3, hi: 8, why: `ranked #${f.peakRank} in the UFC` };
  }
  if (run && PROMOTIONS[run.promo].tier === "regional" && run.defences >= 2) return { lo: 5, hi: n, why: reignText(run) };
  return null;
}

/**
 * What the market has been paying the fighter: the current deal, or the last
 * one, remembered through free agency for two years.
 */
export function marketPay(w: World, f: Fighter): { promo: PromoId; show: number; win: number; current: boolean } | null {
  const c = f.contract;
  if (c && PROMOTIONS[c.promo].tier !== "amateur" && c.show > 0) return { promo: c.promo, show: c.show, win: c.win, current: true };
  const last = w.career.fc[f.id]?.lastDeal;
  if (last && w.day - last.ended <= 730 && last.show > 0) return { promo: last.promo, show: last.show, win: last.win, current: false };
  return null;
}

/** What a purse is worth a fight, the win money counted at the odds of winning; a flat purse is all show. */
export function perFight(show: number, win: number): number {
  return show + win * 0.6;
}
