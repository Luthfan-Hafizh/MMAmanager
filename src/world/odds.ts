// Betting odds and fight previews. The line comes from what a bookmaker would
// look at: ratings, the record of the moment, the matchup of styles, reach,
// layoffs and age, with the bookmaker's margin added to the moneylines.

import { clamp } from "../core/util";
import { ageAt } from "../core/time";
import { groupScore, ovrOf, ATTR_INFO, type AttrKey } from "../model/attributes";
import type { Bout, Fighter, World } from "../model/types";
import { ringRust } from "./core";

/** Probability that A beats B. */
export function winProb(w: World, a: Fighter, b: Fighter, day = w.day): number {
  let d = (ovrOf(a.attrs) - ovrOf(b.attrs)) * 28 + (a.elo - b.elo) * 0.22;
  // Styles: a grappler who can get it down against a striker who can't stop it.
  const wrestleA = (a.attrs.takedowns + a.attrs.clinchControl) / 2 - b.attrs.tdd;
  const wrestleB = (b.attrs.takedowns + b.attrs.clinchControl) / 2 - a.attrs.tdd;
  d += clamp(wrestleA - wrestleB, -6, 6) * 6;
  d += clamp(a.reach - b.reach, -6, 6) * 3;
  // Momentum and ring rust.
  d += clamp(a.streak - b.streak, -5, 5) * 6;
  const layA = a.lastFight === null ? 0 : day - a.lastFight;
  const layB = b.lastFight === null ? 0 : day - b.lastFight;
  d -= (ringRust(layA) - ringRust(layB)) * 45;
  // Age past 34 worries the books.
  const ageA = ageAt(a.birth, day);
  const ageB = ageAt(b.birth, day);
  d -= (Math.max(0, ageA - 34) - Math.max(0, ageB - 34)) * 8;
  return clamp(1 / (1 + Math.pow(10, -d / 400)), 0.04, 0.96);
}

/** American moneyline with a bookmaker's margin of about 4.5%. */
export function moneyline(p: number): string {
  const q = clamp(p * 1.045, 0.02, 0.985);
  if (q >= 0.5) return `-${Math.round(((q / (1 - q)) * 100) / 5) * 5}`;
  return `+${Math.round((((1 - q) / q) * 100) / 5) * 5}`;
}

export function oddsOf(b: Bout): { a: string; b: string } | null {
  if (b.odds === undefined) return null;
  return { a: moneyline(b.odds), b: moneyline(1 - b.odds) };
}

export function setOdds(w: World, b: Bout): void {
  const a = w.fighters[b.a];
  const c = w.fighters[b.b];
  if (a && c) b.odds = Math.round(winProb(w, a, c, b.day) * 1000) / 1000;
}

export interface Preview {
  favourite: "a" | "b" | null;
  keys: [string[], string[]];
  summary: string;
}

const NAME = (k: AttrKey) => ATTR_INFO[k].name.toLowerCase();

/** Keys to victory for each side, the way a broadcast preview reads them. */
export function preview(w: World, b: Bout): Preview {
  const A = w.fighters[b.a];
  const B = w.fighters[b.b];
  const keys: [string[], string[]] = [[], []];
  const sides: [Fighter, Fighter, 0 | 1][] = [
    [A, B, 0],
    [B, A, 1],
  ];
  for (const [me, op, i] of sides) {
    const k = keys[i];
    const myS = groupScore(me.attrs, "striking");
    const opS = groupScore(op.attrs, "striking");
    const wrestle = (me.attrs.takedowns + me.attrs.clinchControl) / 2;
    if (wrestle - op.attrs.tdd > 2) k.push(`Take it down: ${NAME("takedowns")} ${Math.round(me.attrs.takedowns)} against ${op.surname}'s ${NAME("tdd")} ${Math.round(op.attrs.tdd)}.`);
    if (myS - opS > 1.5) k.push(`Win the striking: the better hands and feet on paper (${myS.toFixed(1)} to ${opS.toFixed(1)}).`);
    if (op.attrs.tdd - (op.attrs.takedowns + op.attrs.clinchControl) / 2 > 2 && myS > opS) k.push(`Keep it standing and make ${op.surname} strike.`);
    if (me.attrs.power - op.attrs.chin > 3) k.push(`Land the big one: power ${Math.round(me.attrs.power)} against a chin of ${Math.round(op.attrs.chin)}.`);
    if (me.attrs.cardio - op.attrs.cardio > 3) k.push(`Drag ${op.surname} into deep water: the better gas tank.`);
    if (me.attrs.subs - op.attrs.subDef > 3) k.push(`Hunt the neck: submissions ${Math.round(me.attrs.subs)} against ${NAME("subDef")} ${Math.round(op.attrs.subDef)}.`);
    if (me.reach - op.reach >= 3) k.push(`Use the ${me.reach - op.reach}" reach advantage at range.`);
    if (me.attrs.kicks - op.attrs.strikeDef > 3) k.push(`Chop the legs and kick the body.`);
    if (me.attrs.fightIQ - op.attrs.fightIQ > 3) k.push(`Out-think ${op.surname}: the smarter, more experienced fighter.`);
    if (k.length === 0) k.push(`Stay disciplined and win the minutes: little separates them on paper.`);
    keys[i] = k.slice(0, 3);
  }
  const p = b.odds ?? winProb(w, A, B, b.day);
  const fav = Math.abs(p - 0.5) < 0.04 ? null : p > 0.5 ? "a" : "b";
  const pf = fav === "a" ? A : fav === "b" ? B : null;
  const summary = pf
    ? `${pf.first} ${pf.surname} is the ${Math.abs(p - 0.5) > 0.25 ? "heavy" : Math.abs(p - 0.5) > 0.12 ? "clear" : "slight"} favourite (${moneyline(fav === "a" ? p : 1 - p)}).`
    : "The books can't separate them: a pick'em fight.";
  return { favourite: fav, keys, summary };
}

/** Every meeting between two fighters in this world, oldest first. */
export function headToHead(w: World, a: string, b: string): Bout[] {
  const f = w.fighters[a];
  if (!f) return [];
  return f.bouts.map((id) => w.bouts[id]).filter((x) => x && x.status === "done" && (x.a === b || x.b === b));
}
