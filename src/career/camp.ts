// The fight camp: weeks to prepare, sparring partners who look like the
// opponent, a nutritionist for the cut, film study, and the game plan. On the
// day before the fight, the scale.

import { nutritionOf, siteCostPerWeek, sitePrep } from "./staff";
import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import type { Bout, Camp, Fighter, World } from "../model/types";
import { suggestPlan } from "../engine/plan";
import { fullName } from "../world/core";
import { notify } from "./inbox";
import { ledger } from "./money";
import { boutLimit, cutCheck, noticeHurt } from "./shortnotice";
import { scaleDay, type ScaleResult } from "./weighin";

export const SPARRING_NAMES = ["Gym partners", "Brought-in partners", "Elite partners"];
export const NUTRITION_NAMES = ["Do it yourself", "Nutritionist", "Full cut team"];
export const CUT_NAMES: Record<Camp["cut"], string> = { early: "Diet down early", standard: "Standard water cut", late: "Big late cut" };

export function campCost(c: Pick<Camp, "sparring" | "nutrition" | "weeks" | "site">, tier: string): number {
  const scale = tier === "major" || tier === "league" ? 1 : tier === "regional" || tier === "tryout" ? 0.55 : 0.3;
  const spar = [0, 900, 2600][c.sparring] * c.weeks * scale;
  const nut = [0, 1500, 4500][c.nutrition] * (scale < 0.5 ? 0.5 : 1);
  const away = siteCostPerWeek(c.site) * c.weeks * Math.max(0.6, scale);
  return Math.round((spar + nut + away) / 50) * 50;
}

export function startCamp(w: World, f: Fighter, b: Bout): Camp {
  const opp = w.fighters[b.a === f.id ? b.b : b.a];
  const weeks = clamp(Math.round((b.day - w.day) / 7), 1, 12);
  const tier = PROMOTIONS[b.promo].tier;
  const plan = suggestPlan(f.attrs, opp.attrs, f.reach - opp.reach);
  const camp: Camp = {
    bout: b.id,
    start: w.day,
    weeks,
    sparring: tier === "major" || tier === "league" ? 1 : 0,
    nutrition: tier === "amateur" || tier === "local" ? 0 : 1,
    cut: "standard",
    plan,
    study: 0,
    cost: 0,
    paid: false,
    site: "home",
  };
  camp.cost = campCost(camp, tier);
  const fc = w.career.fc[f.id];
  if (fc) {
    fc.camp = camp;
    fc.campBout = b.id;
    fc.weighed = undefined;
    fc.campCut = undefined;
    fc.campPrep = undefined;
  }
  return camp;
}

/** The weekly camp work: film study, and the bill for the camp at its start. */
export function campWeek(w: World, f: Fighter, filmSessions: number, sparSessions: number): void {
  const fc = w.career.fc[f.id];
  const camp = fc?.camp;
  if (!camp) return;
  const b = w.bouts[camp.bout];
  if (!b || b.status !== "booked") {
    fc!.camp = null;
    return;
  }
  camp.study = clamp(camp.study + filmSessions * 0.09 + sparSessions * 0.03 * camp.sparring, 0, 1);
  if (!camp.paid && camp.cost > 0) {
    camp.paid = true;
    if (w.career.mode === "fighter") ledger(w, { amount: -camp.cost, what: `Fight camp: ${SPARRING_NAMES[camp.sparring].toLowerCase()}, ${NUTRITION_NAMES[camp.nutrition].toLowerCase()}`, cat: "camp", fighter: f.id });
    else ledger(w, { amount: -Math.round(camp.cost * 0.35), what: `Share of ${fullName(f)}'s camp`, cat: "camp", fighter: f.id });
  }
}

/** Weight on the morning of the weigh-in, and how hard the cut was. */
export function weighInPlayer(w: World, rng: Rng, f: Fighter, b: Bout): { weight: number; made: boolean; drain: number; text: string } {
  const fc = w.career.fc[f.id];
  const camp = fc?.camp;
  const limit = boutLimit(b);
  const title = b.kind === "title" || b.kind === "interim" || b.kind === "vacant";
  const allow = title ? 0 : 1;
  const over = (f.walk - limit) / limit; // how far the walking weight is above the limit
  const weeks = camp ? (b.day - camp.start) / 7 : 2;
  const nut = nutritionOf(w, f);
  const style = camp?.cut ?? "standard";
  // On short notice the clock matters most: what can come off in the days there were.
  const sub = !!b.shortNotice && b.sub === f.id;
  const rush = sub ? { none: -0.4, easy: 0, normal: 0.5, hard: 1.3, "too much": 2.4 }[cutCheck(f, limit, b.notice ?? Math.round(weeks * 7)).risk] + 0.4 * noticeHurt(b.notice) : 0;
  // The bigger the cut, the shorter the camp and the worse the support, the harder it is.
  let difficulty = over * 10 - (nut * 0.5) - Math.min(weeks, 10) * 0.07 + rush + (style === "late" ? 0.25 : style === "early" ? -0.2 : 0);
  difficulty = clamp(difficulty, -1, 4);
  const pMiss = clamp(0.015 + Math.max(0, difficulty - 0.6) * 0.09, 0.005, 0.6) * (1 - f.pers.professionalism / 60);
  const miss = rng.chance(pMiss);
  const weight = miss ? Math.round((limit + allow + 0.2 + rng.next() * rng.next() * 4) * 10) / 10 : Math.round((limit - rng.next() * 0.6 + allow * 0.3) * 10) / 10;
  // Drain on fight night: a hard late cut costs cardio and the chin.
  let drain = clamp(0.08 + difficulty * 0.12 + (style === "late" ? 0.06 : style === "early" ? -0.04 : 0) - nut * 0.05, 0, 0.75);
  if (miss) drain *= 0.7;
  const text = miss
    ? `${fullName(f)} came in at ${weight.toFixed(1)} lb, ${(weight - limit - allow).toFixed(1)} lb over the ${title ? "title " : ""}limit. ${title ? "Only the opponent can win the belt now. " : ""}The fight goes ahead at a catchweight; part of the purse goes to the opponent.`
    : `${fullName(f)} made weight at ${weight.toFixed(1)} lb.${drain > 0.35 ? " It was a hard cut: expect the gas tank to suffer." : drain < 0.12 ? " An easy cut: fresh for fight night." : ""}`;
  return { weight, made: !miss, drain, text };
}

/** Preparation on fight night, -1..1: camp length, sharpness, freshness, partners, film. */
export function campPrep(w: World, f: Fighter, b: Bout): number {
  const camp = w.career.fc[f.id]?.camp;
  const weeks = camp ? (b.day - camp.start) / 7 : 1;
  const full = clamp(Math.sqrt(weeks / 8), 0, 1);
  const sharp = (f.sharp - 50) / 100;
  const fresh = f.fatigue > 60 ? -0.35 : f.fatigue > 45 ? -0.15 : f.fatigue < 25 ? 0.1 : 0;
  const spar = camp ? [0, 0.12, 0.22][camp.sparring] : 0;
  const study = camp ? camp.study * 0.25 : 0;
  return clamp(-0.45 + full * 0.55 + sharp * 0.5 + fresh + spar + study + sitePrep(camp), -1, 1);
}

/** Day before the fight: both fighters on the scale, the final numbers for the engine, then a decision. */
export function fightEve(w: World, rng: Rng, b: Bout): void {
  if (b.weighIn) return;
  const mine: Partial<Record<"a" | "b", ScaleResult>> = {};
  for (const side of ["a", "b"] as const) {
    const id = b[side];
    const f = w.fighters[id];
    const fc = w.career.fc[id];
    if (!f?.ctrl || !fc) continue;
    if (!fc.camp || fc.camp.bout !== b.id) startCamp(w, f, b);
    const r = weighInPlayer(w, rng, f, b);
    fc.weighed = r.weight;
    fc.campCut = r.drain;
    fc.campPrep = campPrep(w, f, b);
    fc.campBout = b.id;
    mine[side] = r;
  }
  if (mine.a || mine.b) scaleDay(w, rng, b, mine);
}

export function prepText(p: number): string {
  if (p > 0.45) return "Peaking";
  if (p > 0.15) return "Well prepared";
  if (p > -0.15) return "Ready";
  if (p > -0.45) return "Underprepared";
  return "Badly underprepared";
}
