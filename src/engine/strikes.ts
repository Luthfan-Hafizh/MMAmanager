// The strikes the engine throws. Accuracies are for two equal fighters; damage
// and knockout factor are relative to a straight right hand.

import type { AttrKey } from "../model/attributes";
import type { TechId } from "../data/techniques";

export type StrikeId =
  | "jab"
  | "cross"
  | "hook"
  | "uppercut"
  | "overhand"
  | "bodyPunch"
  | "legKick"
  | "calfKick"
  | "bodyKick"
  | "headKick"
  | "switchKick"
  | "teep"
  | "spinKick"
  | "spinFist"
  | "superman"
  | "flyKnee"
  | "questionMark"
  | "elbow";

export type Zone = "head" | "body" | "leg";

export interface StrikeDef {
  id: StrikeId;
  name: string;
  zone: Zone;
  kick: boolean;
  acc: number;
  dmg: number;
  ko: number;
  cost: number;
  skill: AttrKey;
  w: number;
  /** Weight multipliers at long, mid and close range. */
  range: [number, number, number];
  tech?: TechId;
  exclusive?: boolean;
  power: boolean;
}

const S = (d: StrikeDef) => d;

export const STRIKES: Record<StrikeId, StrikeDef> = {
  jab: S({ id: "jab", name: "jab", zone: "head", kick: false, acc: 0.3, dmg: 0.42, ko: 0.18, cost: 0.4, skill: "boxing", w: 29, range: [1.3, 1, 0.65], tech: "jab", power: false }),
  cross: S({ id: "cross", name: "right hand", zone: "head", kick: false, acc: 0.33, dmg: 1, ko: 1, cost: 0.75, skill: "boxing", w: 18, range: [0.75, 1.1, 1.05], tech: "counterRight", power: true }),
  hook: S({ id: "hook", name: "hook", zone: "head", kick: false, acc: 0.3, dmg: 1, ko: 1.15, cost: 0.8, skill: "boxing", w: 13, range: [0.35, 1, 1.5], tech: "checkHook", power: true }),
  uppercut: S({ id: "uppercut", name: "uppercut", zone: "head", kick: false, acc: 0.29, dmg: 0.95, ko: 1.05, cost: 0.8, skill: "boxing", w: 4, range: [0.15, 0.7, 2.1], tech: "uppercut", power: true }),
  overhand: S({ id: "overhand", name: "overhand", zone: "head", kick: false, acc: 0.27, dmg: 1.15, ko: 1.3, cost: 0.95, skill: "power", w: 4.5, range: [0.5, 1.25, 0.9], tech: "overhand", power: true }),
  bodyPunch: S({ id: "bodyPunch", name: "punch to the body", zone: "body", kick: false, acc: 0.55, dmg: 0.82, ko: 0, cost: 0.7, skill: "boxing", w: 7.5, range: [0.25, 0.9, 1.75], tech: "liverShot", power: true }),
  legKick: S({ id: "legKick", name: "leg kick", zone: "leg", kick: true, acc: 0.72, dmg: 0.88, ko: 0, cost: 1.0, skill: "kicks", w: 8.6, range: [1, 1.15, 0.45], tech: "legKick", power: true }),
  calfKick: S({ id: "calfKick", name: "calf kick", zone: "leg", kick: true, acc: 0.66, dmg: 0.86, ko: 0, cost: 0.8, skill: "kicks", w: 6.6, range: [0.9, 1.2, 0.55], tech: "calfKick", power: true }),
  bodyKick: S({ id: "bodyKick", name: "body kick", zone: "body", kick: true, acc: 0.58, dmg: 1.15, ko: 0, cost: 1.15, skill: "kicks", w: 6.5, range: [1.45, 0.9, 0.3], tech: "bodyKick", power: true }),
  headKick: S({ id: "headKick", name: "head kick", zone: "head", kick: true, acc: 0.22, dmg: 1.4, ko: 1.35, cost: 1.4, skill: "kicks", w: 2.4, range: [1.4, 0.85, 0.2], tech: "headKick", power: true }),
  switchKick: S({ id: "switchKick", name: "switch kick", zone: "body", kick: true, acc: 0.55, dmg: 1.05, ko: 0, cost: 1.05, skill: "kicks", w: 1.2, range: [1.3, 0.9, 0.3], tech: "switchKick", power: true }),
  teep: S({ id: "teep", name: "teep", zone: "body", kick: true, acc: 0.5, dmg: 0.5, ko: 0, cost: 0.75, skill: "kicks", w: 3, range: [1.5, 0.9, 0.3], tech: "teep", exclusive: true, power: false }),
  spinKick: S({ id: "spinKick", name: "spinning back kick", zone: "body", kick: true, acc: 0.36, dmg: 1.45, ko: 0, cost: 1.6, skill: "kicks", w: 1.1, range: [1.4, 0.8, 0.2], tech: "spinningBackKick", exclusive: true, power: true }),
  spinFist: S({ id: "spinFist", name: "spinning backfist", zone: "head", kick: false, acc: 0.26, dmg: 1.0, ko: 1.25, cost: 1.1, skill: "power", w: 0.8, range: [0.6, 1.2, 0.6], tech: "spinningBackfist", exclusive: true, power: true }),
  superman: S({ id: "superman", name: "superman punch", zone: "head", kick: false, acc: 0.3, dmg: 1.0, ko: 1.0, cost: 1.1, skill: "speed", w: 1, range: [1.5, 0.9, 0.2], tech: "superman", exclusive: true, power: true }),
  flyKnee: S({ id: "flyKnee", name: "flying knee", zone: "head", kick: true, acc: 0.24, dmg: 1.5, ko: 1.6, cost: 1.8, skill: "speed", w: 0.6, range: [0.9, 1.2, 0.4], tech: "flyingKnee", exclusive: true, power: true }),
  // A slashing elbow in the pocket: rare, except for the elbow fighters, and the cuts come with it.
  elbow: S({ id: "elbow", name: "elbow", zone: "head", kick: false, acc: 0.31, dmg: 0.95, ko: 0.9, cost: 0.7, skill: "clinchStrikes", w: 0.45, range: [0.02, 0.55, 1.5], tech: "elbows", power: true }),
  questionMark: S({ id: "questionMark", name: "question mark kick", zone: "head", kick: true, acc: 0.26, dmg: 1.3, ko: 1.3, cost: 1.4, skill: "kicks", w: 0.8, range: [1.4, 0.8, 0.2], tech: "questionMark", exclusive: true, power: true }),
};

export const STRIKE_LIST = Object.values(STRIKES);

/** Clinch and ground strikes are simpler: accuracy, damage and knockout factor. */
export const CLINCH_STRIKES = {
  kneeBody: { name: "knee to the body", zone: "body" as Zone, acc: 0.62, dmg: 1.0, ko: 0, cost: 0.9 },
  kneeHead: { name: "knee to the head", zone: "head" as Zone, acc: 0.42, dmg: 1.2, ko: 1.25, cost: 1.0 },
  elbow: { name: "elbow", zone: "head" as Zone, acc: 0.48, dmg: 0.95, ko: 0.9, cost: 0.7 },
  dirty: { name: "short punch", zone: "head" as Zone, acc: 0.5, dmg: 0.6, ko: 0.55, cost: 0.5 },
};

export const GROUND_STRIKES = {
  punch: { name: "punch", acc: 0.6, dmg: 0.72, ko: 0.55, cost: 0.55 },
  elbow: { name: "elbow", acc: 0.52, dmg: 0.95, ko: 0.7, cost: 0.6 },
  body: { name: "shot to the body", acc: 0.68, dmg: 0.6, ko: 0, cost: 0.5 },
};
