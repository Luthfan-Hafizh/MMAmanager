// The market, month by month: deals that end, releases after losing runs,
// promotions signing the best from the level below, amateurs turning pro,
// new prospects, and retirements.

import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { ageAt, ymd } from "../core/time";
import { countryOf, REGION_IDS, type RegionId } from "../data/countries";
import { DIVISIONS, DIVISION_IDS, type DivisionId } from "../data/divisions";
import { PROMOTIONS, PROMO_IDS, TIER_RANK, promoFor, rosterTarget, type PromoId } from "../data/promotions";
import { ovrOf } from "../model/attributes";
import type { Fighter, FightRecord, World } from "../model/types";
import { addNews, freeAgents, fullName, isChampion, nextId, rankOf, rosterOf, stageFights, touch } from "./core";
import { contractFor, levelOf, pickGym } from "./create";
import { blankRecord, generateFighter, makeRecord } from "./generate";
import { entryElo, unrank } from "./rankings";
import { clockShift } from "./development";
import { signTo } from "./results";
import { vacate } from "./titles";

export function release(w: World, f: Fighter, why: string, text?: string): void {
  if (f.ctrl) return;
  const p = f.promo;
  if (!p) return;
  vacate(w, f, "vacated");
  if (f.booked) return; // let the booked fight happen first
  unrank(w, f, p);
  f.promo = null;
  f.contract = null;
  if (text) addNews(w, { kind: "release", promo: p, fighters: [f.id], big: true, text });
  else if (p === "ufc" && (f.pop > 35 || f.reigns > 0)) addNews(w, { kind: "release", promo: p, fighters: [f.id], text: `${fullName(f)} has been released by the UFC (${why}).` });
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
  if (f.promo) unrank(w, f, f.promo);
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
      // A champion's deal is almost always renewed: walking out as champion (Francis
      // Ngannou in 2023) is rare, where one in ten others moves on when a deal is done.
      const champ = isChampion(w, f);
      if (keep && rng.chance(champ ? 0.99 : 0.9)) {
        const rank = rankOf(w, f);
        const nc = contractFor(f.promo, f, w.day, rng, { rank, fights: p.tier === "major" ? rng.int(4, 6) : rng.int(3, 4) });
        nc.show = Math.max(nc.show, Math.round(c.show * (f.streak > 0 ? 1.15 : 0.95)));
        nc.win = rank === 0 && (f.promo === "ufc" || f.promo === "pfl") ? 0 : nc.show;
        f.contract = nc;
      } else {
        if (champ) release(w, f, "", `${fullName(f)} walks out on the ${PROMOTIONS[f.promo].short} as champion: no new deal was agreed, and the title is vacated.`);
        else release(w, f, "contract not renewed");
      }
      continue;
    }
    // Losing runs.
    if (isChampion(w, f) || f.booked) continue;
    const top = f.promo === "ufc" || f.promo === "pfl";
    // Fights on this stage, counting a real fighter's before the world began: a
    // ten-fight UFC veteran on a two-fight skid is not a newcomer who started 0-2.
    const fightsHere = stageFights(w, f, f.promo);
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


function candidateScore(w: World, f: Fighter): number {
  // Scouts look at the record as well as the tape.
  const record = clamp((f.rec.w - f.rec.l * 2) * 0.25, -3, 3);
  return ovrOf(f.attrs) + Math.max(0, f.streak) * 1.2 + (isChampion(w, f) ? 4 : 0) - (f.streak < 0 ? 3 : 0) + record;
}

/** A record a big promotion signs: enough wins, and far more of them than losses. */
function signable(f: Fighter, wins: number, ratio: number): boolean {
  return f.rec.w >= wins && f.rec.w >= f.rec.l * ratio;
}

/** The overall the UFC signs from. */
const UFC_LEVEL = 65;

/**
 * The regional shows the game doesn't run. Each region's regional promotion
 * stands for dozens of real ones, and the UFC signs over a hundred fighters a
 * year from all of them; the eight here can't raise that many from their own
 * local shows, and without help the top of the regional scene (and with it the
 * Contender Series and the UFC's signings) ran dry within two years. So a
 * regional division keeps about a quarter of its roster at UFC level (65 and
 * up, 33 or younger), about as many as when the world began, more at the
 * weights where the UFC carries more fighters (four lightweights, two
 * flyweights): with fewer, it fills an opening with one, from its local show
 * or free agency if anyone that good is there, otherwise a proven fighter from
 * a show the game doesn't run.
 */
const CONTENDER_SHARE = 0.25;

function isContender(w: World, f: Fighter): boolean {
  return ovrOf(f.attrs) >= UFC_LEVEL && ageAt(f.birth, w.day) <= 33;
}

/** The UFC's roster at this weight against the average of its divisions for the same sex. */
function ufcWeight(d: DivisionId): number {
  const same = DIVISION_IDS.filter((x) => DIVISIONS[x].sex === DIVISIONS[d].sex);
  return (DIVISIONS[d].ufc * same.length) / same.reduce((a, x) => a + DIVISIONS[x].ufc, 0);
}

function shortOfContenders(w: World, promo: PromoId, d: DivisionId, want: number): boolean {
  const keep = Math.round(want * CONTENDER_SHARE * ufcWeight(d));
  return rosterOf(w, promo, d).filter((f) => isContender(w, f)).length < keep;
}

/** A proven fighter from elsewhere: drawn like the promotion's roster at the start, from the part at UFC level. */
function fromElsewhere(w: World, rng: Rng, promo: PromoId, d: DivisionId): Fighter {
  const [mean, sd] = levelOf(promo)!;
  let o = rng.normal(mean, sd);
  for (let k = 0; k < 40 && o < UFC_LEVEL; k++) o = rng.normal(mean, sd);
  o = clamp(o, UFC_LEVEL, 80);
  const age = Math.round(clamp(rng.normal(27, 3.2), 21, 33));
  return newcomer(w, rng, promo, d, o, age, false);
}

/** A fighter from a show the game doesn't run, signed to a regional promotion. */
function newcomer(w: World, rng: Rng, promo: PromoId, d: DivisionId, o: number, age: number, prospect: boolean): Fighter {
  const p = PROMOTIONS[promo];
  const f = generateFighter(rng, { id: nextId(w, "f"), region: p.region as RegionId, div: d, ovr: o, age, day: w.day });
  f.gym = pickGym(w, rng, f.country, o).id;
  f.rec = prospect ? prospectRecord(rng) : makeRecord(rng, o, age, 2, false);
  f.am = makeRecord(rng, o, Math.min(age, 22), 0, true);
  f.promo = promo;
  f.contract = contractFor(promo, f, w.day, rng);
  f.elo = entryElo(promo, ovrOf(f.attrs), 1500) + (f.rec.w - f.rec.l) * 6;
  f.lastFight = w.day - rng.int(prospect ? 60 : 30, 150);
  f.streak = prospect ? rng.int(2, 5) : rng.chance(0.6) ? rng.int(1, 3) : -rng.int(1, 2);
  f.pop = Math.round(clamp((o - 40) * 0.6 + rng.normal(0, 5), 1, 40));
  f.joined = w.day;
  w.fighters[f.id] = f;
  touch(w);
  return f;
}

/** A prospect's record: five to eleven wins, the finishes a scout notices, and no more than two losses. */
function prospectRecord(rng: Rng): FightRecord {
  const r = blankRecord();
  const wins = rng.int(5, 11);
  const losses = rng.chance(0.3) ? 0 : rng.int(1, 2);
  for (let k = 0; k < wins; k++) {
    r.w++;
    const m = rng.next();
    if (m < 0.42) r.koW++;
    else if (m < 0.68) r.subW++;
    else r.decW++;
  }
  for (let k = 0; k < losses; k++) {
    r.l++;
    const m = rng.next();
    if (m < 0.33) r.koL++;
    else if (m < 0.58) r.subL++;
    else r.decL++;
  }
  return r;
}

/** Where Contender Series hopefuls come from: the Americas most, then Europe, then the rest. */
const TRYOUT_REGIONS: Record<RegionId, number> = { na: 4, sa: 2.5, we: 1.2, ee: 1.5, ea: 0.6, af: 0.5, wa: 0.5, oc: 0.6 };

/**
 * A prospect for the Contender Series from a show the game doesn't run (the real
 * one scouts the whole world, not eight regional promotions): 21 to 31, at the
 * level of a UFC newcomer, on a run. Signed to the regional promotion of the
 * region, so whatever happens on the night there is a career to go back to.
 */
export function tryoutProspect(w: World, rng: Rng, d: DivisionId): Fighter {
  const regions = REGION_IDS.filter((r) => promoFor(r, "regional")?.divisions.includes(d));
  const region = rng.weighted(regions, (r) => TRYOUT_REGIONS[r]);
  const o = clamp(rng.normal(65.5, 1.8), 64, 70);
  const age = Math.round(clamp(rng.normal(26, 2.4), 21, 31));
  return newcomer(w, rng, promoFor(region, "regional")!.id, d, o, age, true);
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
      if (p.tier === "regional" && shortOfContenders(w, promo, d, want)) {
        // A contender already on hand (from its local show, or a free agent) first, then one from elsewhere.
        const own = cands.find((f) => isContender(w, f));
        if (own) cands.unshift(...cands.splice(cands.indexOf(own), 1));
        else {
          fromElsewhere(w, rng, promo, d);
          need--;
        }
      }
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
      // A regional division never runs dry (its rankings with it): with nobody to sign
      // from its local show or free agency, someone from a show the game doesn't run.
      if (p.tier === "regional") {
        while (need > 0 && rosterOf(w, promo, d).length < want - 1) {
          fromTheScene(w, rng, promo, d);
          need--;
        }
      }
    }
  }
}

/** A fighter at the promotion's usual level from a show the game doesn't run. */
function fromTheScene(w: World, rng: Rng, promo: PromoId, d: DivisionId): Fighter {
  const [mean, sd] = levelOf(promo)!;
  const o = clamp(rng.normal(mean, sd), 48, UFC_LEVEL + 3);
  const age = Math.round(clamp(rng.normal(27, 3.6), 21, 34));
  return newcomer(w, rng, promo, d, o, age, false);
}

function candidatesFor(w: World, promo: PromoId, d: DivisionId): Fighter[] {
  const p = PROMOTIONS[promo];
  const out: Fighter[] = [];
  const consider = (f: Fighter) => {
    if (f.ctrl || f.status !== "active" || f.div !== d || f.booked) return;
    const age = ageAt(f.birth, w.day);
    const o = ovrOf(f.attrs);
    if (promo === "ufc") {
      if (o < UFC_LEVEL || age > 34) return;
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
