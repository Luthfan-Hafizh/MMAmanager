// Growth and aging. Young fighters close the gap to their potential; past the
// prime the body goes first (speed, cardio, recovery) while fight IQ holds.
// The decline is tuned to the UFC's win rate by age (about 58% for fighters
// under 25, falling to 38% at 37 and older), with personal clocks: one in four
// ages early, one in eight late, and heavier fighters peak later.

import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { ageAt } from "../core/time";
import { DIVISIONS, type DivisionId } from "../data/divisions";
import { ATTRS, ovrOf, type AttrKey } from "../model/attributes";
import type { Fighter, World } from "../model/types";

const WEIGHT_SHIFT: Record<DivisionId, number> = { FLY: -0.8, BW: -0.5, FW: -0.3, LW: 0, WW: 0.3, MW: 0.6, LHW: 0.9, HW: 1.5, WSW: 0.6, WFLY: 0.7, WBW: 0.8 };

export function clockShift(f: Fighter): number {
  const t = f.hid.aging === "early" ? -1.5 : f.hid.aging === "late" ? 2 : 0;
  return WEIGHT_SHIFT[f.div] + t;
}

export function fadeStart(f: Fighter): number {
  return 0.5 * f.hid.peak + 0.5 * 29.5 + clockShift(f);
}

/** Overall points lost per year at this age. */
export function yearlyDecline(f: Fighter, age: number): number {
  const t = age - fadeStart(f);
  if (t < 0) return 0;
  let d = 0.35 + 0.5 * t;
  const rate = f.hid.aging === "early" ? 1.25 : f.hid.aging === "late" ? 0.75 : 1;
  d *= rate;
  // Veterans who are still around have bodies that hold up: the fade eases.
  const vet = clamp((age - (33 + clockShift(f))) / 4, 0, 1);
  d *= 1 - 0.3 * vet;
  // Wear: a long, hard career ages a fighter faster.
  d *= 1 + clamp((f.dmg - 120) / 400, 0, 0.5);
  return d;
}

/** Monthly catch-up toward potential for fighters the world develops. */
export function monthlyGrowth(f: Fighter, age: number, gymRep: number): number {
  const cur = ovrOf(f.attrs);
  const room = f.hid.pot - cur;
  if (room <= 0) return 0;
  const rate = age < 21 ? 0.05 : age < 23 ? 0.042 : age < 25 ? 0.034 : age < 27 ? 0.024 : age < 29 ? 0.012 : age < 31 ? 0.005 : 0;
  const coach = 0.8 + gymRep / 250;
  const pro = 0.75 + f.pers.professionalism / 40;
  return room * rate * coach * pro;
}

const DECLINE_W: Partial<Record<AttrKey, number>> = {
  speed: 1.7, cardio: 1.4, recovery: 1.5, chin: 0.9, strength: 0.55, toughness: 0.8,
  footwork: 1.0, power: 0.55, workRate: 1.0, scrambles: 0.9, takedowns: 0.75, tdd: 0.8,
  boxing: 0.45, kicks: 0.6, clinchStrikes: 0.35, groundStrikes: 0.35, counters: 0.25, strikeDef: 0.75,
  clinchControl: 0.35, topControl: 0.3, bottomGame: 0.35, subs: 0.2, subDef: 0.3,
  fightIQ: -0.25, composure: -0.1, aggression: 0.3, discipline: -0.1, heart: 0.2,
};

/** Spread a change in overall across the attributes. */
export function applyOvrChange(f: Fighter, delta: number, rng: Rng): void {
  if (Math.abs(delta) < 1e-4) return;
  const perAttr = (delta / 4) * ATTRS.length;
  const weights: Partial<Record<AttrKey, number>> = {};
  let sum = 0;
  for (const k of ATTRS) {
    let wgt: number;
    if (delta > 0) wgt = Math.pow(Math.max(0.2, 20.4 - f.attrs[k]), 1.1) * (0.6 + rng.next() * 0.8);
    else wgt = (DECLINE_W[k] ?? 0.5) * (0.7 + rng.next() * 0.6);
    weights[k] = wgt;
    if (wgt > 0) sum += wgt;
  }
  if (sum <= 0) return;
  for (const k of ATTRS) {
    const share = (weights[k] ?? 0) / sum;
    f.attrs[k] = clamp(Math.round((f.attrs[k] + perAttr * share) * 1000) / 1000, 1, 20);
  }
}

/** The monthly pass for every active fighter. */
export function monthlyDevelopment(w: World, rng: Rng): void {
  for (const f of Object.values(w.fighters)) {
    if (f.status !== "active") continue;
    const age = ageAt(f.birth, w.day);
    const decline = yearlyDecline(f, age) / 12;
    // The player's fighters grow from their training week, not from this catch-up.
    const growth = f.ctrl ? 0 : monthlyGrowth(f, age, w.gyms[f.gym]?.rep ?? 40);
    const injured = f.injury && f.injury.until > w.day ? 0.4 : 1;
    const delta = growth * injured - decline;
    if (delta !== 0) applyOvrChange(f, delta, rng);
    if (decline > 0 && growth > 0) {
      // Old fighters still learn the game while the body goes.
      f.attrs.fightIQ = clamp(f.attrs.fightIQ + 0.01, 1, 20);
    }
    // Ratings drift with how good a fighter really is now.
    const o = ovrOf(f.attrs);
    if (o > f.best) f.best = Math.round(o);
    // Training fatigue and sharpness drift for the world's fighters.
    if (!f.ctrl) {
      f.sharp = clamp(f.sharp + (f.booked ? 6 : -4), 30, 85);
    }
  }
}

export function potentialText(f: Fighter, scouted = 0.7): string {
  const cur = ovrOf(f.attrs);
  const room = f.hid.pot - cur;
  const fuzz = Math.round((1 - scouted) * 6);
  if (room > 14) return fuzz > 2 ? "Huge potential" : "Could be special";
  if (room > 8) return "Plenty of room to grow";
  if (room > 3) return "Still improving";
  return "At or near the ceiling";
}

export function primeText(f: Fighter, day: number): string {
  const age = ageAt(f.birth, day);
  const fs = fadeStart(f);
  if (age < fs - 4) return "Developing";
  if (age < fs) return "Entering the prime";
  if (age < fs + 2.5) return "In the prime";
  if (age < fs + 5) return "Past the prime";
  return "Veteran";
}

export { DIVISIONS };
