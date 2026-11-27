// Short notice. When a fighter pulls out late, the matchmaker reaches for the
// phone: calls come from three weeks to a day out, at the weight, at a
// catchweight when the cut can't be made in time, or a division up; and from a
// bigger promotion when a card needs a name (the UFC has signed unbeaten
// regional champions on two days' notice). In the UFC, replacements win about
// four fights in ten: a short camp costs cardio and preparation, and a fast cut
// drains the body. Stepping up is rewarded all the same: the money, the
// exposure, and a loss that is forgiven more easily than most.

import { clamp } from "../core/util";
import { DIVISIONS, neighbourDivisions } from "../data/divisions";
import { PROMOTIONS, TIER_RANK, type PromoId } from "../data/promotions";
import { ovrOf } from "../model/attributes";
import type { Bout, Fighter, MMAEvent, World } from "../model/types";
import { rankOf } from "../world/core";
import { callFactor, passedOn, rapport } from "./promoter";
import { tryoutHold } from "./tryout";

/** The weight a bout is contracted at. */
export function boutLimit(b: Pick<Bout, "div" | "limit">): number {
  return b.limit ?? DIVISIONS[b.div].limit;
}

/**
 * Share of body weight a fighter can take off with this many days to go: the
 * water cut of fight week (about 4% in a day, 9% in a week), then the diet that
 * only a camp allows (about 12.5% with three weeks, 14.5% with six).
 */
export function maxCut(days: number): number {
  return 0.04 + 0.05 * clamp(days / 7, 0, 1) + 0.035 * clamp((days - 7) / 14, 0, 1) + 0.02 * clamp((days - 21) / 21, 0, 1);
}

export type CutRisk = "none" | "easy" | "normal" | "hard" | "too much";

export const CUT_TEXT: Record<CutRisk, string> = {
  none: "no cut to speak of",
  easy: "an easy cut",
  normal: "a normal cut",
  hard: "a hard cut",
  "too much": "a cut that can't be made safely",
};

/** How the cut to this limit looks with this many days to go. */
export function cutCheck(f: Fighter, limit: number, days: number): { lb: number; pct: number; risk: CutRisk } {
  const lb = Math.max(0, f.walk - limit);
  const pct = lb / f.walk;
  const can = maxCut(days);
  const risk: CutRisk = pct <= 0.02 ? "none" : pct <= can * 0.65 ? "easy" : pct <= can * 0.92 ? "normal" : pct <= can ? "hard" : "too much";
  return { lb: Math.round(lb * 10) / 10, pct, risk };
}

/** The size gap on the night, from the walking weights: positive for the bigger fighter. */
export function sizeEdge(me: Fighter, opp: Fighter, limit: number): number {
  return clamp((me.walk - opp.walk) / (limit * 0.12), -1, 1);
}

/** A catchweight on the 5 lb. */
function catchweight(lb: number): number {
  return Math.round(lb / 5) * 5;
}

export interface Call {
  f: Fighter;
  limit?: number;
  debut?: PromoId;
  chance: number;
}

/**
 * Which of the player's fighters the matchmaker would call to fill a spot, at
 * what weight, and how likely the call is. Fighters who said they'd take short
 * notice, healthy, cleared, three weeks clear of their last fight, and not
 * called in the last three weeks; at a level the opponent's camp will accept.
 */
export function findCall(w: World, ev: MMAEvent, b: Bout, stay: Fighter, days: number): Call | null {
  if (days < 1 || days > 21) return null;
  const p = PROMOTIONS[ev.promo];
  if (p.tier === "amateur" || p.tier === "tryout") return null;
  const title = b.kind === "title" || b.kind === "interim" || b.kind === "vacant";
  const divLimit = DIVISIONS[b.div].limit;
  let best: Call | null = null;
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    const fc = w.career.fc[id];
    if (!f || !fc || f.status !== "active" || !fc.shortNotice || f.booked || id === stay.id) continue;
    if (w.career.fightOffers.some((o) => o.fighter === id && o.status === "open")) continue;
    if (fc.lastCall !== undefined && w.day - fc.lastCall < 21) continue;
    // A Contender Series week accepted: no calls around it.
    if (tryoutHold(w, f, ev.day)) continue;
    if ((f.injury && f.injury.until > ev.day - 2) || f.susp > ev.day) continue;
    if (f.lastFight !== null && ev.day - f.lastFight < 21) continue;
    if (DIVISIONS[f.div].sex !== DIVISIONS[b.div].sex) continue;
    // Champions don't step in on short notice.
    const ps = w.promos[ev.promo];
    if (ps.champs[b.div] === id || ps.interim[b.div] === id || ps.champs[f.div] === id) continue;
    // The weight.
    let limit: number | undefined;
    if (f.div !== b.div) {
      const nb = neighbourDivisions(f.div);
      if (nb.up === b.div) limit = undefined; // up a division, at that limit
      else if (nb.down === b.div && !title) limit = catchweight((DIVISIONS[f.div].limit + divLimit) / 2); // down, at a catchweight
      else continue;
    }
    let cut = cutCheck(f, limit ?? divLimit, days);
    if (cut.risk === "too much" && !title && f.div === b.div) {
      // Can't make the weight in time: the other camp may take a catchweight.
      limit = catchweight(divLimit + Math.max(5, divLimit * 0.04));
      cut = cutCheck(f, limit, days);
    }
    if (cut.risk === "too much") continue;
    // The level, and whose roster.
    let debut: PromoId | undefined;
    const o = ovrOf(f.attrs);
    if (f.promo !== ev.promo) {
      const mine = f.promo ? TIER_RANK[PROMOTIONS[f.promo].tier] : 1;
      const theirs = TIER_RANK[p.tier];
      // Big-promotion deals are exclusive; regional and local ones let the bigger shows call.
      if (f.promo && (PROMOTIONS[f.promo].tier === "major" || PROMOTIONS[f.promo].tier === "league") && f.contract && f.contract.left > 0) continue;
      if (theirs <= mine || theirs - mine > 3 || title) continue;
      if (ev.promo === "ufc" && (o < 64 || f.rec.w < 5 || f.rec.w < f.rec.l * 2)) continue;
      if (ev.promo === "pfl" && (o < 60 || f.rec.w < 4 || f.rec.w < f.rec.l * 1.5)) continue;
      if (p.tier === "regional" && (o < 52 || f.rec.w < 2)) continue;
      if (p.tier === "regional" && p.region !== "global" && PROMOTIONS[ev.promo].region !== (f.promo ? PROMOTIONS[f.promo].region : p.region)) continue;
      debut = ev.promo;
    }
    // Credible against this opponent?
    const gap = ovrOf(stay.attrs) - o;
    if (gap > 10) continue;
    if (title) {
      const r = f.promo === ev.promo ? rankOf(w, f) : null;
      if (r === null || r > 6) continue;
    }
    let chance = 0.4 + (f.promo === ev.promo ? 0.15 : 0) + (f.div === b.div ? 0.1 : 0) + (title ? 0.25 : 0) - (debut ? 0.1 : 0);
    chance *= clamp(1 - (gap - 3) / 12, 0.3, 1);
    // Late in the week the weight decides it: a fighter with no cut to make (a
    // division up, a catchweight, or walking near the limit) can be called days
    // out; one facing a hard cut rarely gets the call.
    if (days <= 7) chance *= cut.risk === "none" || cut.risk === "easy" ? 1.35 : cut.risk === "hard" ? 0.45 : 0.85;
    // The matchmaker rings the fighters it trusts first, and not about an opponent you just turned down.
    if (passedOn(w, f, ev.promo).has(stay.id)) continue;
    chance *= callFactor(rapport(w, f.id, ev.promo));
    if (!best || chance > best.chance) best = { f, limit, debut, chance };
  }
  return best;
}

/** How a short camp tells on fight night: 1 with a day's notice, 0 with three weeks. */
export function noticeHurt(days: number | undefined): number {
  return 1 - clamp(days ?? 21, 0, 21) / 21;
}
