// The market, month by month: deals that end, releases after losing runs,
// promotions signing the best from the level below, amateurs turning pro,
// new prospects, and retirements.

import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { ageAt, ymd } from "../core/time";
import { countryOf, REGION_IDS, type RegionId } from "../data/countries";
import { DIVISIONS, type DivisionId } from "../data/divisions";
import { PROMOTIONS, PROMO_IDS, TIER_RANK, promoFor, type PromoId } from "../data/promotions";
import { ovrOf } from "../model/attributes";
import type { Fighter, World } from "../model/types";
import { addNews, freeAgents, fullName, isChampion, nextId, rankOf, rosterOf, touch } from "./core";
import { contractFor, pickGym } from "./create";
import { generateFighter, makeRecord } from "./generate";
import { entryElo } from "./rankings";
import { clockShift } from "./development";
import { signTo } from "./results";
import { vacate } from "./titles";

export function release(w: World, f: Fighter, why: string): void {
  if (f.ctrl) return;
  const p = f.promo;
  if (!p) return;
  vacate(w, f, "vacated");
  if (f.booked) return; // let the booked fight happen first
  f.promo = null;
  f.contract = null;
  if (p === "ufc" && (f.pop > 35 || f.reigns > 0)) addNews(w, { kind: "release", promo: p, fighters: [f.id], text: `${fullName(f)} has been released by the UFC (${why}).` });
  touch(w);
}

function retire(w: World, f: Fighter, why: string): void {
  if (f.ctrl || f.booked) return;
  vacate(w, f, "retired");
  f.status = "retired";
  f.retired = w.day;
  const notable = f.reigns > 0 || f.pop > 45 || (f.promo === "ufc" && rankOf(w, f) !== null);
  if (notable) addNews(w, { kind: "retire", promo: f.promo ?? undefined, fighters: [f.id], big: f.reigns > 0, text: `${fullName(f)} retires from MMA at ${Math.floor(ageAt(f.birth, w.day))}, finishing ${f.rec.w}-${f.rec.l}${f.rec.d ? `-${f.rec.d}` : ""}${why ? ` (${why})` : ""}.` });
  if (f.reigns > 0 && f.rec.w >= 18) w.hof.push({ fighter: f.id, year: ymd(w.day).y });
  f.promo = null;
  f.contract = null;
  touch(w);
}

/** Retirement odds a month, on the body's age rather than the calendar's. */
function retireOdds(w: World, f: Fighter): number {
  const age = ageAt(f.birth, w.day) - clockShift(f);
  let yearly: number;
  if (age < 30) yearly = 0.005;
  else if (age < 33) yearly = 0.02 + (age - 30) * 0.01;
  else if (age < 36) yearly = 0.05 + (age - 33) * 0.02;
  else yearly = 0.11 + (age - 36) * 0.08;
  if (f.streak <= -3) yearly *= 2.2;
  else if (f.streak <= -2) yearly *= 1.5;
  if (!f.promo) yearly *= 2;
  if (rankOf(w, f) !== null && f.streak >= 1) yearly *= 0.4;
  if (isChampion(w, f)) yearly *= 0.3;
  yearly *= 1 + clamp((f.dmg - 150) / 200, 0, 1.5);
  return clamp(yearly / 12, 0, 0.5);
}

export function monthlyMarket(w: World, rng: Rng): void {
  // Deals done, releases, retirements.
  for (const f of Object.values(w.fighters)) {
    if (f.status !== "active" || f.ctrl) continue;
    const age = ageAt(f.birth, w.day);
    if (!f.booked && (rng.chance(retireOdds(w, f)) || age > 44)) {
      retire(w, f, f.streak <= -3 ? "after a run of losses" : "");
      continue;
    }
    if (!f.promo) {
      // Free agents fade away if nobody calls.
      if (f.lastFight !== null && w.day - f.lastFight > 900 && rng.chance(0.25)) retire(w, f, "");
      continue;
    }
    const p = PROMOTIONS[f.promo];
    if (p.tier === "amateur") continue;
    const c = f.contract;
    if (c && (c.left <= 0 || w.day > c.end) && !f.booked) {
      const keep = f.streak >= -1 || isChampion(w, f) || rankOf(w, f) !== null;
      if (keep && rng.chance(0.9)) {
        const rank = rankOf(w, f);
        const nc = contractFor(f.promo, f, w.day, rng, { rank, fights: p.tier === "major" ? rng.int(4, 6) : rng.int(3, 4) });
        nc.show = Math.max(nc.show, Math.round(c.show * (f.streak > 0 ? 1.15 : 0.95)));
        nc.win = rank === 0 && (f.promo === "ufc" || f.promo === "pfl") ? 0 : nc.show;
        f.contract = nc;
      } else {
        release(w, f, "contract not renewed");
      }
      continue;
    }
    // Losing runs.
    if (isChampion(w, f) || f.booked) continue;
    const top = f.promo === "ufc" || f.promo === "pfl";
    const fightsHere = f.bouts.filter((id) => w.bouts[id]?.promo === f.promo && w.bouts[id]?.status === "done").length;
    let pCut = 0;
    if (f.streak <= -3) pCut = top ? 0.6 : 0.3;
    else if (f.streak <= -2 && top && fightsHere <= 4 && rankOf(w, f) === null) pCut = 0.28;
    else if (f.streak <= -2 && top && age >= 35 && rankOf(w, f) === null) pCut = 0.25;
    if (pCut && rng.chance(pCut)) release(w, f, `${-f.streak} losses in a row`);
  }
  touch(w);
  signings(w, rng);
  prospects(w, rng);
  touch(w);
}

function rosterTarget(promo: PromoId, d: DivisionId): number {
  const p = PROMOTIONS[promo];
  if (promo === "ufc") return DIVISIONS[d].ufc;
  if (promo === "pfl") return DIVISIONS[d].sex === "F" ? 14 : 22;
  return Math.round(p.rosterPerDiv * (DIVISIONS[d].sex === "F" ? 0.6 : 1));
}

function candidateScore(w: World, f: Fighter): number {
  // Scouts look at the record as well as the tape.
  const record = clamp((f.rec.w - f.rec.l * 2) * 0.25, -3, 3);
  return ovrOf(f.attrs) + Math.max(0, f.streak) * 1.2 + (isChampion(w, f) ? 4 : 0) - (f.streak < 0 ? 3 : 0) + record;
}

/** A record a big promotion signs: enough wins, and far more of them than losses. */
function signable(f: Fighter, wins: number, ratio: number): boolean {
  return f.rec.w >= wins && f.rec.w >= f.rec.l * ratio;
}

/** Promotions fill their divisions from the level below and from free agents. */
function signings(w: World, rng: Rng): void {
  const order: PromoId[] = ["ufc", "pfl", ...PROMO_IDS.filter((id) => PROMOTIONS[id].tier === "regional"), ...PROMO_IDS.filter((id) => PROMOTIONS[id].tier === "local")];
  for (const promo of order) {
    const p = PROMOTIONS[promo];
    for (const d of p.divisions) {
      const have = rosterOf(w, promo, d).length;
      const want = rosterTarget(promo, d);
      let need = Math.min(want - have, want - have > 6 ? 3 : 2);
      if (need <= 0) continue;
      const cands = candidatesFor(w, promo, d);
      cands.sort((a, b) => candidateScore(w, b) - candidateScore(w, a));
      for (const f of cands) {
        if (need <= 0) break;
        if (f.booked) continue;
        const old = f.promo;
        vacate(w, f, "moved");
        signTo(w, f, promo, rng);
        f.contract = contractFor(promo, f, w.day, rng, { rank: null, fights: promo === "ufc" ? 4 : rng.int(2, 4) });
        if (promo === "ufc") f.contract.show = f.contract.win = 12000 + Math.round(Math.max(0, ovrOf(f.attrs) - 72) * 1500 / 1000) * 1000;
        f.elo = entryElo(promo, ovrOf(f.attrs), f.elo);
        need--;
        if (promo === "ufc" || (promo === "pfl" && f.pop > 25)) {
          addNews(w, { kind: "signing", promo, fighters: [f.id], text: `${p.short} signs ${fullName(f)} (${f.rec.w}-${f.rec.l}${f.rec.d ? `-${f.rec.d}` : ""})${old ? ` from ${PROMOTIONS[old].short}` : ""}.` });
        }
      }
    }
  }
}

function candidatesFor(w: World, promo: PromoId, d: DivisionId): Fighter[] {
  const p = PROMOTIONS[promo];
  const out: Fighter[] = [];
  const consider = (f: Fighter) => {
    if (f.ctrl || f.status !== "active" || f.div !== d || f.booked) return;
    const age = ageAt(f.birth, w.day);
    const o = ovrOf(f.attrs);
    if (promo === "ufc") {
      if (o < 65 || age > 34) return;
      if (f.promo && PROMOTIONS[f.promo].tier === "league" && f.contract && f.contract.left > 0) return;
      // From the regional scene: a champion, a fighter on a run, or a proven record and the talent.
      if (f.promo && PROMOTIONS[f.promo].tier === "regional" && !(isChampion(w, f) || (f.streak >= 2 && signable(f, 5, 1.5)) || (f.streak >= 0 && signable(f, 7, 2.5) && o >= 66))) return;
      // Free agents: a winning record, or a proven veteran of real quality.
      if (!f.promo && !((o >= 68 && signable(f, 6, 2)) || (o >= 72 && signable(f, 5, 1.3)))) return;
    } else if (promo === "pfl") {
      if (o < 62 || age > 36) return;
      if (f.promo === "ufc") return;
      if (f.promo && PROMOTIONS[f.promo].tier === "regional" && !(isChampion(w, f) || (f.streak >= 3 && signable(f, 4, 1.3)))) return;
      if (!f.promo && !signable(f, 5, 1.5)) return;
    } else if (p.tier === "regional") {
      if (o < 55 || age > 36) return;
      if (f.promo && TIER_RANK[PROMOTIONS[f.promo].tier] >= TIER_RANK.regional) return;
      if (countryOf(f.country).region !== p.region && rng0(f) > 0.15) return;
      if (f.promo && PROMOTIONS[f.promo].tier === "local" && !(isChampion(w, f) || f.streak >= 2 || f.rec.w >= 6)) return;
    } else if (p.tier === "local") {
      if (age > 37) return;
      if (f.promo && TIER_RANK[PROMOTIONS[f.promo].tier] >= TIER_RANK.local) return;
      if (countryOf(f.country).region !== p.region) return;
      if (f.promo && PROMOTIONS[f.promo].tier === "amateur" && (age < 18 || f.am.w < 3)) return;
    }
    out.push(f);
  };
  for (const f of freeAgents(w)) consider(f);
  if (promo === "ufc") {
    for (const id of PROMO_IDS) if (PROMOTIONS[id].tier === "regional" || id === "pfl") for (const f of rosterOf(w, id, d)) consider(f);
  } else if (promo === "pfl") {
    for (const id of PROMO_IDS) if (PROMOTIONS[id].tier === "regional") for (const f of rosterOf(w, id, d)) consider(f);
  } else if (p.tier === "regional") {
    const local = promoFor(p.region as RegionId, "local");
    if (local) for (const f of rosterOf(w, local.id, d)) consider(f);
  } else if (p.tier === "local") {
    const am = promoFor(p.region as RegionId, "amateur");
    if (am) for (const f of rosterOf(w, am.id, d)) consider(f);
  }
  return out;
}

function rng0(f: Fighter): number {
  return (f.id.charCodeAt(f.id.length - 1) % 10) / 10;
}

/** New fighters: amateur hopefuls every month, and debutants for the local shows. */
function prospects(w: World, rng: Rng): void {
  for (const region of REGION_IDS) {
    const am = promoFor(region, "amateur");
    const local = promoFor(region, "local");
    for (const promo of [am, local]) {
      if (!promo) continue;
      for (const d of promo.divisions) {
        const have = rosterOf(w, promo.id, d).length;
        const want = rosterTarget(promo.id, d);
        const n = Math.min(2, want - have);
        for (let k = 0; k < n; k++) {
          const amateur = promo.tier === "amateur";
          const age = amateur ? rng.int(17, 22) : rng.int(19, 26);
          const o = clamp(rng.normal(amateur ? 45 : 52, 4.5), 33, 66);
          const f = generateFighter(rng, { id: nextId(w, "f"), region, div: d, ovr: o, age, day: w.day, amateur });
          f.gym = pickGym(w, rng, f.country, o).id;
          if (!amateur) f.am = makeRecord(rng, o, Math.min(age, 22), 0, true);
          f.promo = promo.id;
          f.contract = contractFor(promo.id, f, w.day, rng, { fights: amateur ? 99 : 3 });
          f.elo = entryElo(promo.id, o, 1100);
          f.lastFight = null;
          f.joined = w.day;
          f.pop = 1;
          w.fighters[f.id] = f;
        }
      }
    }
  }
  touch(w);
}

export { retire };
