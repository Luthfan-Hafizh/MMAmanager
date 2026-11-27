// Making new fighters: name and country from the region, a martial arts
// background, a body for the weight class, attributes that fit the level, and
// the hidden things (potential, prime, how they age).

import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { countriesIn, countryOf, type RegionId } from "../data/countries";
import { DIVISIONS, typicalWalk, type DivisionId } from "../data/divisions";
import { makeName, makeNickname } from "../data/names";
import { ARTS, COUNTRY_ARTS, DEFAULT_ARTS, type BaseArt } from "../data/styles";
import { TECH_IDS, TECHNIQUES, type TechId } from "../data/techniques";
import { ATTRS, ovrOf, type AttrKey } from "../model/attributes";
import { bodyEffects, type Build } from "../data/body";
import { grantStyleTech, pickStyles } from "./fightstyle";
import type { AgingType, Attrs, CareerTotals, Fighter, FightRecord, Hidden, Personality, Stance } from "../model/types";

export const blankRecord = (): FightRecord => ({ w: 0, l: 0, d: 0, nc: 0, koW: 0, subW: 0, decW: 0, koL: 0, subL: 0, decL: 0 });
export const blankTotals = (): CareerTotals => ({
  fights: 0, secs: 0, sigL: 0, sigA: 0, sigAbs: 0, sigAbsA: 0, head: 0, body: 0, leg: 0, dist: 0, clinch: 0, ground: 0,
  kd: 0, kdAbs: 0, tdL: 0, tdA: 0, tdAbs: 0, tdAbsA: 0, subA: 0, ctrl: 0,
});

export interface GenOptions {
  id: string;
  region?: RegionId;
  country?: string;
  div: DivisionId;
  /** Target overall rating. */
  ovr: number;
  /** A chosen body (a created fighter): inches, the walking weight in lb, and a build. */
  height?: number;
  reach?: number;
  walk?: number;
  build?: Build;
  age: number;
  day: number;
  art?: BaseArt;
  pot?: number;
  amateur?: boolean;
  gym?: string;
}

export function pickCountry(rng: Rng, region: RegionId): string {
  const list = countriesIn(region);
  return rng.weighted(list, (c) => c.talent).code;
}

export function pickArt(rng: Rng, country: string): BaseArt {
  const table = COUNTRY_ARTS[country] ?? DEFAULT_ARTS;
  const r = rng.weighted(table, (x) => x[1]);
  return r[0];
}

function cultureFor(rng: Rng, country: string): string {
  const c = countryOf(country);
  if (c.alt && rng.chance(c.alt[1])) return c.alt[0];
  return c.culture;
}

/** Spread of a normal attribute around the fighter's level. */
const SPREAD = 1.7;

/** How attributes in each group tend to sit relative to the mean at a level. */
export const GROUP_BIAS: Partial<Record<AttrKey, number>> = {
  aggression: 0.6, heart: 0.8, workRate: 0, composure: -0.3, discipline: -0.2,
};

export function generateFighter(rng: Rng, o: GenOptions): Fighter {
  const region = o.region ?? countryOf(o.country ?? "US").region;
  const country = o.country ?? pickCountry(rng, region);
  const def = DIVISIONS[o.div];
  const sex = def.sex;
  const culture = cultureFor(rng, country);
  const { first, last } = makeName(rng, culture, sex);
  const art = o.art ?? pickArt(rng, country);
  const artDef = ARTS[art];

  // Body: height and reach around the division's real averages, or the ones chosen
  // for a created fighter (the same draws either way, so the world doesn't change).
  // Reach runs from five inches under the height to nine over, as on the real
  // rosters (Jon Jones is 6'4" with an 84.5" reach).
  const rolled = Math.round(clamp(def.height + rng.normal(0, 2), def.height - 6, def.height + 6));
  const ape = rng.normal(1.5, 1.6);
  const height = o.height ?? rolled;
  const reach = o.reach ?? Math.round(clamp(height + ape, height - 5, height + 9));
  const stance: Stance = rng.chance(0.07) ? "switch" : rng.chance(0.22) ? "southpaw" : "orthodox";
  const rolledWalk = Math.round(typicalWalk(o.div) + rng.normal(0, def.limit * 0.025));
  const walk = o.walk ?? rolledWalk;

  // Attributes: level, background, a personal profile, and the body.
  const mean = (o.ovr - 20) / 4;
  const a = {} as Attrs;
  const talentStrike = rng.normal(0, 1.1);
  const talentGrapple = rng.normal(0, 1.1);
  for (const k of ATTRS) {
    let v = mean + rng.normal(0, SPREAD) + (artDef.mods[k] ?? 0) * 0.85 + (GROUP_BIAS[k] ?? 0);
    if (["boxing", "kicks", "clinchStrikes", "power", "counters", "strikeDef", "footwork"].includes(k)) v += talentStrike;
    if (["takedowns", "tdd", "clinchControl", "topControl", "bottomGame", "subs", "subDef", "scrambles"].includes(k)) v += talentGrapple;
    a[k] = v;
  }
  // Body effects (data/body.ts): taller is footwork, shorter and heavier is
  // strength, and a chosen build moves its own points. The overall is set below,
  // so the body changes the shape of a fighter, not the level.
  for (const [k, v] of Object.entries(bodyEffects(o.div, height, walk, o.build)) as [AttrKey, number][]) a[k] += v;
  a.power += sex === "F" ? -0.6 : 0;
  // Age: young fighters are faster and fitter, older ones wiser.
  const ageAdj = (o.age - 28) / 6;
  a.speed -= ageAdj * 0.8;
  a.recovery -= ageAdj * 0.6;
  a.fightIQ += ageAdj * 0.9;
  a.composure += ageAdj * 0.8;
  for (const k of ATTRS) a[k] = clamp(a[k], 1, 20);
  // Hit the target overall.
  for (let pass = 0; pass < 3; pass++) {
    const cur = ovrOf(a);
    const shift = (o.ovr - cur) / 4;
    for (const k of ATTRS) a[k] = clamp(a[k] + shift, 1, 20);
  }
  for (const k of ATTRS) a[k] = Math.round(a[k] * 10) / 10;

  const cur = ovrOf(a);
  const hid = makeHidden(rng, o.age, cur, o.pot);
  const pers = makePersonality(rng);
  const tech = makeTechniques(rng, art, a, o.ovr);

  const f: Fighter = {
    id: o.id,
    first,
    surname: last,
    nick: rng.chance(o.ovr > 70 ? 0.45 : 0.18) ? makeNickname(rng) : undefined,
    sex,
    country,
    hometown: rng.pick(countryOf(country).cities),
    birth: Math.round(o.day - o.age * 365.25 - rng.int(0, 364)),
    div: o.div,
    height,
    reach,
    stance,
    walk,
    attrs: a,
    hid,
    pers,
    base: art,
    tech,
    rec: blankRecord(),
    am: blankRecord(),
    amateur: !!o.amateur,
    promo: null,
    contract: null,
    gym: o.gym ?? "",
    pop: 0,
    elo: 1000 + (cur - 50) * 16,
    bouts: [],
    lastFight: null,
    streak: 0,
    injury: null,
    susp: 0,
    booked: null,
    status: "active",
    reigns: 0,
    dmg: 0,
    stats: blankTotals(),
    fatigue: 10,
    sharp: 60,
    morale: 60,
    joined: 0,
    best: Math.round(cur),
  };
  f.style = pickStyles(f, rng, null, cur);
  grantStyleTech(f);
  return f;
}

export function makeHidden(rng: Rng, age: number, ovr: number, pot?: number): Hidden {
  // Most fighters have a little room left; some young ones a lot.
  const youth = clamp((27 - age) / 8, 0, 1.2);
  let room = Math.max(0, rng.normal(3 + youth * 9, 3 + youth * 4.5));
  // Now and then a generational talent: young, already decent, and with a ceiling
  // among the very best (growth closes about two thirds of the gap by the prime, so
  // the ceiling sits well above where they end up). Without them the stars of the
  // real roster retire and nobody replaces them.
  if (pot === undefined && age <= 25 && ovr >= 50 && rng.chance(0.09)) room = Math.max(room, rng.range(90, 96) - ovr);
  const r = rng.next();
  const aging: AgingType = r < 0.25 ? "early" : r > 0.875 ? "late" : "normal";
  return {
    pot: Math.round(clamp(pot ?? ovr + room, ovr, 96)),
    peak: Math.round(clamp(rng.normal(29.3, 1.8), 25, 34) * 10) / 10,
    aging,
    consistency: Math.round(clamp(rng.normal(12, 3.5), 1, 20)),
    injuryProne: Math.round(clamp(rng.normal(8, 3.5), 1, 20)),
    bigFight: Math.round(clamp(rng.normal(11, 3.5), 1, 20)),
  };
}

export function makePersonality(rng: Rng): Personality {
  const v = (m = 11, sd = 3.8) => Math.round(clamp(rng.normal(m, sd), 1, 20));
  return { professionalism: v(12), ambition: v(13), loyalty: v(11), temperament: v(11), controversy: v(8, 4.5), greed: v(10) };
}

export function makeTechniques(rng: Rng, art: BaseArt, a: Attrs, ovr: number): Partial<Record<TechId, number>> {
  const tech: Partial<Record<TechId, number>> = {};
  for (const [id, lvl] of Object.entries(ARTS[art].tech) as [TechId, number][]) {
    tech[id] = clamp(lvl + (ovr > 72 && rng.chance(0.4) ? 1 : 0) - (ovr < 50 && rng.chance(0.5) ? 1 : 0), 1, 3);
  }
  // A few more picked up along the way, more for better fighters.
  const extra = Math.round(clamp(rng.normal((ovr - 45) / 9, 1.2), 0, 6));
  for (let k = 0; k < extra; k++) {
    const id = rng.weighted(TECH_IDS, (t) => {
      const d = TECHNIQUES[t];
      const fit = d.uses.reduce((s, u) => s + a[u], 0) / d.uses.length;
      return Math.pow(Math.max(0, fit - 8), 2) * (d.exclusive ? 0.3 : 1);
    });
    if (!tech[id]) tech[id] = 1;
    else if (tech[id]! < 3 && rng.chance(0.35)) tech[id] = tech[id]! + 1;
  }
  return tech;
}

/** A pre-world record that fits a fighter's level and age. */
export function makeRecord(rng: Rng, ovr: number, age: number, tierLevel: number, amateur: boolean): FightRecord {
  const r = blankRecord();
  const years = Math.max(0, age - (amateur ? 17 : 21));
  const fights = Math.round(clamp(rng.normal(amateur ? 3 + years * 1.2 : 2 + years * 2.1 + tierLevel * 1.5, 3), 0, amateur ? 14 : 40));
  const winRate = clamp(0.45 + (ovr - (40 + tierLevel * 9)) * 0.022 + rng.normal(0, 0.08), 0.2, 0.95);
  for (let k = 0; k < fights; k++) {
    const u = rng.next();
    if (u < winRate) {
      r.w++;
      const m = rng.next();
      if (m < 0.38) r.koW++;
      else if (m < 0.62) r.subW++;
      else r.decW++;
    } else if (u < winRate + 0.015) r.d++;
    else {
      r.l++;
      const m = rng.next();
      if (m < 0.33) r.koL++;
      else if (m < 0.58) r.subL++;
      else r.decL++;
    }
  }
  return r;
}

export function nameOf(f: { first: string; surname: string }): string {
  return `${f.first} ${f.surname}`;
}
