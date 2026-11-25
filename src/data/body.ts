// The body: height, reach, build and walking weight, and what each one does.
//
// Like the player builders in NBA 2K and the body types in EA UFC, the frame
// moves points between attributes rather than adding any: the overall stays the
// same, the fighter changes shape. Height trades strength for footwork; reach wins
// at range and costs a little in the pocket (in the fight engine); a build trades
// the gas tank against power, or speed against a chin and a base; and the walking
// weight is the oldest bargain in the sport, size on fight night against a harder
// cut, which drains the cardio and the chin and risks missing weight.

import { DIVISIONS, typicalWalk, type DivisionId } from "./divisions";
import type { AttrKey } from "../model/attributes";

export type Build = "lean" | "athletic" | "muscular" | "stocky";

export const BUILD_IDS: Build[] = ["lean", "athletic", "muscular", "stocky"];

export interface BuildDef {
  name: string;
  /** One line for the picker. */
  sub: string;
  desc: string;
  /** How the walking weight sits against the division's usual, as a share of the limit. */
  walk: number;
  /** Attribute points moved, before the overall is set (they sum to about zero). */
  mods: Partial<Record<AttrKey, number>>;
}

export const BUILDS: Record<Build, BuildDef> = {
  lean: {
    name: "Lean",
    sub: "Gas tank and speed",
    desc: "Wiry and light: a deep gas tank, quick hands and fast recovery between rounds, at the cost of strength in the clinch and some pop in the punches. Walks around lighter, so the cut is easy.",
    walk: -0.025,
    mods: { cardio: 1.2, recovery: 0.6, speed: 0.6, strength: -1.0, power: -0.8, toughness: -0.3, chin: -0.3 },
  },
  athletic: {
    name: "Athletic",
    sub: "Balanced",
    desc: "The usual fighter's frame: nothing given up, nothing extra.",
    walk: 0,
    mods: {},
  },
  muscular: {
    name: "Muscular",
    sub: "Power and strength",
    desc: "Dense muscle: heavy hands and strength on the fence and on top, but muscle burns oxygen, so the gas tank and the recovery suffer. Walks around heavier: a bigger cut.",
    walk: 0.025,
    mods: { strength: 1.2, power: 0.9, cardio: -1.1, recovery: -0.5, speed: -0.5 },
  },
  stocky: {
    name: "Stocky",
    sub: "Chin and base",
    desc: "Thick through the neck and the hips: a chin, a body that takes punishment and a base that's hard to take down, but slower feet and less snap in the kicks.",
    walk: 0.015,
    mods: { chin: 0.9, toughness: 0.6, tdd: 0.5, strength: 0.4, speed: -0.8, footwork: -0.8, kicks: -0.4, cardio: -0.4 },
  },
};

/** The walking weights a fighter can carry at this division (lb). Heavyweights walk under the limit. */
export function walkRange(d: DivisionId): [number, number] {
  const def = DIVISIONS[d];
  if (d === "HW") return [def.limit - 45, def.limit];
  return def.sex === "F" ? [Math.round(def.limit * 1.03), Math.round(def.limit * 1.17)] : [Math.round(def.limit * 1.04), Math.round(def.limit * 1.19)];
}

/** Where a build walks around at this division. */
export function defaultWalk(d: DivisionId, build: Build): number {
  const [lo, hi] = walkRange(d);
  return Math.round(Math.min(hi, Math.max(lo, typicalWalk(d) + BUILDS[build].walk * DIVISIONS[d].limit)));
}

/**
 * The attribute points the body moves, before the overall is set: what the
 * generator applies, and what the creation screen shows. Taller means more
 * footwork and less strength; every pound over the division's usual walking
 * weight is strength on the night; a build moves its own points.
 */
export function bodyEffects(d: DivisionId, height: number, walk: number, build?: Build): Partial<Record<AttrKey, number>> {
  const def = DIVISIONS[d];
  const tall = (height - def.height) / 3;
  const e: Partial<Record<AttrKey, number>> = {
    strength: -tall * 0.6 + (walk - typicalWalk(d)) / (def.limit * 0.03),
    footwork: tall * 0.3,
  };
  if (build) for (const [k, v] of Object.entries(BUILDS[build].mods) as [AttrKey, number][]) e[k] = (e[k] ?? 0) + v;
  return e;
}

/**
 * How hard the cut is from this walking weight over a full camp, as the weigh-in
 * reads it (career/camp.ts): the share over the limit, times ten, less the camp.
 */
export function cutDifficulty(d: DivisionId, walk: number): { lb: number; pct: number; label: "none" | "easy" | "normal" | "hard" | "brutal" } {
  const limit = DIVISIONS[d].limit;
  const lb = Math.max(0, walk - limit);
  const pct = lb / limit;
  // The usual cut is about 12% (11% for the women): a normal one. The weigh-in starts
  // to bite past 14%, and past 17% a miss or a drained night gets likely.
  const label = pct < 0.02 ? "none" : pct < 0.08 ? "easy" : pct < 0.14 ? "normal" : pct < 0.17 ? "hard" : "brutal";
  return { lb, pct, label };
}

/**
 * How a reach compares on the real UFC and PFL rosters (reach minus height: the
 * median is +1.5", nine in ten are between -1" and +5", the longest +9").
 */
export function apeBand(ape: number): { label: string; note: string; tone: "" | "good" | "gold" | "short" } {
  if (ape >= 7) return { label: "Freakish", note: 'Top 1%: Jon Jones is +8.5", Sergei Pavlovich +9".', tone: "gold" };
  if (ape >= 5.5) return { label: "Very long", note: 'Top 5%, like Kevin Holland (+6").', tone: "good" };
  if (ape >= 3.5) return { label: "Long", note: "Longer than most fighters of that height.", tone: "good" };
  if (ape >= 0) return { label: "Average", note: 'The UFC median is +1.5".', tone: "" };
  if (ape >= -1) return { label: "Short", note: "Shorter than most fighters of that height.", tone: "short" };
  return { label: "Very short", note: "The bottom 2% of the UFC.", tone: "short" };
}
