// Twenty-eight attributes on the 1-20 scale management games use, in four groups.

import { clamp } from "../core/util";

export const ATTR_GROUPS = {
  striking: ["boxing", "kicks", "clinchStrikes", "groundStrikes", "power", "counters", "strikeDef", "footwork"],
  grappling: ["takedowns", "tdd", "clinchControl", "topControl", "bottomGame", "subs", "subDef", "scrambles"],
  physical: ["strength", "speed", "cardio", "chin", "recovery", "toughness"],
  mental: ["fightIQ", "composure", "aggression", "discipline", "heart", "workRate"],
} as const;

export type AttrGroup = keyof typeof ATTR_GROUPS;
export type AttrKey = (typeof ATTR_GROUPS)[AttrGroup][number];

export const ATTRS: AttrKey[] = [...ATTR_GROUPS.striking, ...ATTR_GROUPS.grappling, ...ATTR_GROUPS.physical, ...ATTR_GROUPS.mental];

export const GROUP_NAMES: Record<AttrGroup, string> = {
  striking: "Striking",
  grappling: "Grappling",
  physical: "Physical",
  mental: "Mental",
};

export const ATTR_INFO: Record<AttrKey, { name: string; short: string; desc: string }> = {
  boxing: { name: "Boxing", short: "Box", desc: "Punching technique and accuracy: jabs, crosses, hooks, uppercuts." },
  kicks: { name: "Kicking", short: "Kck", desc: "Leg, calf, body and head kicks, and the spinning ones." },
  clinchStrikes: { name: "Clinch striking", short: "ClS", desc: "Knees, elbows and dirty boxing in the clinch." },
  groundStrikes: { name: "Ground and pound", short: "GnP", desc: "Punches and elbows from on top, and posture to land them." },
  power: { name: "Power", short: "Pow", desc: "How much each clean shot hurts. Knockout power." },
  counters: { name: "Counter striking", short: "Ctr", desc: "Timing to punish an opponent as they come in." },
  strikeDef: { name: "Striking defence", short: "SDf", desc: "Head movement, guard and parries: how many shots slip by." },
  footwork: { name: "Footwork", short: "Ftw", desc: "Range control, angles, cutting off the cage and staying off the fence." },
  takedowns: { name: "Takedowns", short: "TD", desc: "Shots, trips and throws: getting the fight to the floor." },
  tdd: { name: "Takedown defence", short: "TDD", desc: "Sprawls, underhooks and balance on the feet." },
  clinchControl: { name: "Clinch control", short: "ClC", desc: "Winning the hand fight, pinning on the fence, body locks." },
  topControl: { name: "Top control", short: "Top", desc: "Riding, passing and holding position from on top." },
  bottomGame: { name: "Bottom game", short: "Bot", desc: "Guard work, sweeps, wall walks and getting back up." },
  subs: { name: "Submissions", short: "Sub", desc: "Chokes and joint locks, finding and finishing them." },
  subDef: { name: "Submission defence", short: "SbD", desc: "Defending chokes and locks and staying calm in them." },
  scrambles: { name: "Scrambling", short: "Scr", desc: "Winning the chaos between positions." },
  strength: { name: "Strength", short: "Str", desc: "Raw strength for the weight class: clinch, control and frames." },
  speed: { name: "Speed", short: "Spd", desc: "Hand speed and explosiveness: first to land, first to react." },
  cardio: { name: "Cardio", short: "Car", desc: "The gas tank: how long the pace can be held." },
  chin: { name: "Chin", short: "Chn", desc: "How well head shots are absorbed. Neck work in the strength sessions builds it slowly; knockouts and age wear it down, and a hard cut weakens it on the night." },
  recovery: { name: "Recovery", short: "Rec", desc: "Recovering when hurt, between rounds and between fights." },
  toughness: { name: "Toughness", short: "Tgh", desc: "Absorbing body and leg damage; resistance to injury." },
  fightIQ: { name: "Fight IQ", short: "IQ", desc: "Reading the fight, picking the right shot and the right moment." },
  composure: { name: "Composure", short: "Cmp", desc: "Staying calm when hurt, behind or in the biggest fights." },
  aggression: { name: "Aggression", short: "Agg", desc: "Willingness to engage and push forward." },
  discipline: { name: "Discipline", short: "Dis", desc: "Sticking to the game plan and to the corner's instructions." },
  heart: { name: "Heart", short: "Hrt", desc: "Fighting on when it is hard: comebacks and late rounds." },
  workRate: { name: "Work rate", short: "Wrk", desc: "Output: how much is thrown and attempted." },
};

/** Weights for the overall rating. */
const W: Record<AttrKey, number> = {
  boxing: 1.3, kicks: 0.9, clinchStrikes: 0.6, groundStrikes: 0.6, power: 1.1, counters: 0.7, strikeDef: 1.2, footwork: 0.8,
  takedowns: 1.1, tdd: 1.2, clinchControl: 0.7, topControl: 0.8, bottomGame: 0.6, subs: 0.9, subDef: 0.8, scrambles: 0.6,
  strength: 0.7, speed: 0.9, cardio: 1.0, chin: 0.9, recovery: 0.5, toughness: 0.6,
  fightIQ: 1.0, composure: 0.7, aggression: 0.3, discipline: 0.5, heart: 0.5, workRate: 0.6,
};

export function groupScore(a: Record<AttrKey, number>, g: AttrGroup): number {
  let s = 0;
  let w = 0;
  for (const k of ATTR_GROUPS[g]) {
    s += a[k] * W[k];
    w += W[k];
  }
  return s / w;
}

/**
 * Overall rating 1-100. A weighted average of all attributes, then a lift for
 * real specialists: a world-class striker with a hole on the mat is still a
 * dangerous fighter.
 */
export function ovrOf(a: Record<AttrKey, number>): number {
  let s = 0;
  let w = 0;
  for (const k of ATTRS) {
    s += a[k] * W[k];
    w += W[k];
  }
  const avg = s / w;
  const st = groupScore(a, "striking");
  const gr = groupScore(a, "grappling");
  const spec = Math.max(0, Math.max(st, gr) - avg) * 0.35;
  return clamp(Math.round((20 + (avg + spec) * 4) * 10) / 10, 1, 99);
}

export function ovr(a: Record<AttrKey, number>): number {
  return Math.round(ovrOf(a));
}

/** Attribute colour band, as management games show them. */
export function attrBand(v: number): "poor" | "weak" | "fair" | "good" | "great" | "elite" {
  if (v < 6) return "poor";
  if (v < 10) return "weak";
  if (v < 13) return "fair";
  if (v < 15.5) return "good";
  if (v < 17.5) return "great";
  return "elite";
}

export function ovrBand(o: number): string {
  if (o >= 88) return "World class";
  if (o >= 82) return "Elite";
  if (o >= 76) return "Top level";
  if (o >= 70) return "Major league";
  if (o >= 64) return "Regional standout";
  if (o >= 57) return "Regional";
  if (o >= 50) return "Local";
  return "Novice";
}

export function stars(o: number): number {
  // half stars from 0.5 to 5
  return clamp(Math.round(((o - 40) / 55) * 10) / 2, 0.5, 5);
}

export type StyleTag =
  | "Boxer"
  | "Kickboxer"
  | "Muay Thai"
  | "Pressure striker"
  | "Counter striker"
  | "Wrestler"
  | "Wrestle-boxer"
  | "Grappler"
  | "Submission specialist"
  | "All-rounder"
  | "Brawler";

export function styleOf(a: Record<AttrKey, number>): StyleTag {
  const st = groupScore(a, "striking");
  const gr = groupScore(a, "grappling");
  const wrest = (a.takedowns + a.tdd + a.clinchControl + a.topControl) / 4;
  const bjj = (a.subs + a.bottomGame + a.subDef) / 3;
  if (Math.abs(st - gr) < 1.1 && st > 12) {
    return wrest > bjj + 1 && a.boxing > a.kicks ? "Wrestle-boxer" : "All-rounder";
  }
  if (st > gr) {
    if (a.power > 15 && a.strikeDef < 11 && a.aggression > 13) return "Brawler";
    if (a.counters > a.aggression + 2 && a.counters > 13) return "Counter striker";
    if (a.clinchStrikes > a.boxing && a.kicks > a.boxing - 1) return "Muay Thai";
    if (a.kicks > a.boxing + 1) return "Kickboxer";
    if (a.aggression > 14 && a.workRate > 14) return "Pressure striker";
    return gr > st - 2.5 && wrest > 12 ? "Wrestle-boxer" : "Boxer";
  }
  if (bjj > wrest + 1.2) return a.subs > 15 ? "Submission specialist" : "Grappler";
  if (st > gr - 2.2) return "Wrestle-boxer";
  return "Wrestler";
}

export function blankAttrs(v = 10): Record<AttrKey, number> {
  const out = {} as Record<AttrKey, number>;
  for (const k of ATTRS) out[k] = v;
  return out;
}

export function clampAttrs(a: Record<AttrKey, number>): void {
  for (const k of ATTRS) a[k] = clamp(a[k], 1, 20);
}
