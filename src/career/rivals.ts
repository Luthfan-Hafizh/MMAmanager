// Bad blood and hype. Every call-out, press conference, face-off and comment
// leaves heat between the player's fighter and someone else, and heat sells a
// fight: the matchmaker wants to make it, it goes higher on the card, it pays
// more, and the stars of a UFC main event take a share of the pay-per-view.
// Heat fades when nobody keeps it going. Followers are popularity in the units
// the fans count them in.

import { clamp } from "../core/util";
import { PROMOTIONS } from "../data/promotions";
import type { Bout, Fighter, FighterCareer, Moment, Rivalry, World } from "../model/types";
import { isChampion, rankOf } from "../world/core";

const MAX_NOTES = 6;
const MAX_MOMENTS = 40;

export function fcOf(w: World, f: Fighter): FighterCareer | undefined {
  return w.career.fc[f.id];
}

/** The rivalry between a fighter and someone else, if the fighter is one of the player's. */
export function rivalry(w: World, a: string, b: string): Rivalry | undefined {
  return w.career.fc[a]?.rivals?.[b] ?? w.career.fc[b]?.rivals?.[a];
}

export function heatOf(w: World, a: string, b: string): number {
  return Math.round(rivalry(w, a, b)?.heat ?? 0);
}

/** Add heat (or take it away) between one of the player's fighters and another fighter. */
export function addHeat(w: World, me: Fighter, other: Fighter, amount: number, note?: string): number {
  const fc = fcOf(w, me);
  if (!fc || other.id === me.id) return 0;
  fc.rivals = fc.rivals ?? {};
  const r = fc.rivals[other.id] ?? { heat: 0, since: w.day, last: w.day, notes: [] };
  r.heat = clamp(r.heat + amount, 0, 100);
  r.last = w.day;
  if (note) {
    r.notes.unshift({ day: w.day, text: note });
    if (r.notes.length > MAX_NOTES) r.notes.length = MAX_NOTES;
  }
  if (r.heat < 1 && !r.notes.length) delete fc.rivals[other.id];
  else fc.rivals[other.id] = r;
  return Math.round(r.heat);
}

/** The player's fighter's rivals, hottest first. */
export function rivalsOf(w: World, f: Fighter): { f: Fighter; r: Rivalry }[] {
  const fc = fcOf(w, f);
  return Object.entries(fc?.rivals ?? {})
    .map(([id, r]) => ({ f: w.fighters[id], r }))
    .filter((x) => x.f && x.r.heat >= 1)
    .sort((a, b) => b.r.heat - a.r.heat);
}

/** Weekly: heat fades (about half in four months); a rival who retired cools fast. */
export function coolHeat(w: World): void {
  for (const id of w.career.fighters) {
    const fc = w.career.fc[id];
    if (!fc?.rivals) continue;
    for (const [oid, r] of Object.entries(fc.rivals)) {
      const o = w.fighters[oid];
      r.heat *= !o || o.status !== "active" ? 0.8 : 0.96;
      if (r.heat < 2) delete fc.rivals[oid];
    }
  }
}

/** Something said or done in public, for the media page. */
export function addMoment(w: World, f: Fighter, kind: Moment["kind"], text: string, withId?: string): void {
  const fc = fcOf(w, f);
  if (!fc) return;
  fc.moments = fc.moments ?? [];
  fc.moments.unshift({ day: w.day, kind, text, with: withId });
  if (fc.moments.length > MAX_MOMENTS) fc.moments.length = MAX_MOMENTS;
}

/** Popularity that scales with the stage: a big promotion's audience is bigger. */
export function stageMul(f: Fighter): number {
  const tier = f.promo ? PROMOTIONS[f.promo].tier : "amateur";
  return { amateur: 0.35, local: 0.55, regional: 0.8, tryout: 0.9, league: 1.1, major: 1.4 }[tier] ?? 0.6;
}

export function addPop(f: Fighter, amount: number): number {
  const before = f.pop;
  // Gains come slower near the top; losses are felt in full.
  const d = amount > 0 ? amount * (1 - f.pop / 140) : amount;
  f.pop = clamp(f.pop + d, 0, 100);
  return f.pop - before;
}

/** Followers across social media, from popularity: 800 at nothing, about 4.9 million at 80. */
export function followers(pop: number): number {
  return Math.round(800 * Math.pow(1.115, clamp(pop, 0, 100)));
}

export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

/** How much a fight sells, 0..100: the names, the stakes, the bad blood and the talk. */
export function fightHype(w: World, b: Bout): number {
  const A = w.fighters[b.a];
  const B = w.fighters[b.b];
  if (!A || !B) return 0;
  const tier = PROMOTIONS[b.promo].tier;
  const base = { amateur: 2, local: 8, regional: 14, tryout: 16, league: 22, major: 28 }[tier] ?? 10;
  const names = Math.max(A.pop, B.pop) * 0.35 + Math.min(A.pop, B.pop) * 0.2;
  const ranks = [rankOf(w, A), rankOf(w, B)].reduce<number>((s, r) => s + (r === null ? 0 : r === 0 ? 10 : Math.max(0, 7 - r * 0.45)), 0);
  const stakes = b.kind === "title" || b.kind === "vacant" ? 14 : b.kind === "bmf" ? 13 : b.kind === "interim" ? 10 : b.kind === "eliminator" ? 5 : 0;
  const main = b.order === 0 ? 5 : b.order === 1 ? 2 : 0;
  const heat = heatOf(w, A.id, B.id) * 0.3;
  const talk = [b.media?.a, b.media?.b].filter((t) => t === "trash").length * 3 + [b.faceoff?.a, b.faceoff?.b].filter((t) => t === "shove").length * 4;
  return Math.round(clamp((base + names + ranks + stakes + main + heat + talk) * (tier === "major" ? 0.85 : tier === "league" ? 0.8 : 0.7), 0, 100));
}

export function hypeLabel(h: number): string {
  return h >= 80 ? "Must-see" : h >= 62 ? "Big fight" : h >= 45 ? "Buzzing" : h >= 28 ? "Some interest" : "Quiet";
}

/** A grudge sells: the promotion adds to the purse of a fight with real heat. */
export function grudgeBonus(w: World, f: Fighter, opp: Fighter, show: number, win: number): number {
  const h = heatOf(w, f.id, opp.id);
  if (h < 30) return 0;
  return Math.round(((show + win) * (h / 260)) / 500) * 500;
}

/** The stars of a UFC numbered event's main event take a share of the pay-per-view. */
export function ppvShare(w: World, f: Fighter, b: Bout): number {
  if (b.promo !== "ufc") return 0;
  const ev = w.events[b.ev];
  if (!ev || ev.kind !== "numbered" || b.order !== 0) return 0;
  const champ = isChampion(w, f) || w.promos.ufc?.bmf?.holder === f.id;
  if (!champ && f.pop < 60) return 0;
  const hype = fightHype(w, b);
  if (hype <= 50) return 0;
  return Math.round(((hype - 50) * 14000 * (champ ? 1.5 : 1) * (0.6 + f.pop / 250)) / 1000) * 1000;
}
