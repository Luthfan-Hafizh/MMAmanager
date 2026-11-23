// The real UFC and PFL fighters of the snapshot, turned into the game's
// attributes. Records, physicals, rankings and the official statistics are
// sourced; the 1-20 attributes are derived from them and the snapshot's
// ratings and tendencies.

import { Rng, hashString } from "../core/rng";
import { clamp } from "../core/util";
import { countryOf } from "../data/countries";
import { DIVISIONS, typicalWalk, type DivisionId } from "../data/divisions";
import type { PromoId } from "../data/promotions";
import type { BaseArt } from "../data/styles";
import { ATTRS, ovrOf } from "../model/attributes";
import type { AgingType, Attrs, Fighter, Gym, Stance } from "../model/types";
import { blankRecord, blankTotals, makeTechniques } from "./generate";
import { KNOWN_TITLES, startingLegacy } from "./legacy";

export interface RealFighter {
  id: string;
  n: string;
  k?: string;
  c: string;
  cn: string;
  h?: string;
  a: number;
  ht: number;
  rc: number;
  b: string;
  d: DivisionId;
  p: "ufc" | "pfl";
  lg?: string;
  r: [number, number, number];
  m: [number, number, number, number, number, number];
  ws: number;
  ls: number;
  rt: [number, number, number, number, number, number];
  t: number[];
  ps: number[];
  dv: [number, number, number];
  pot: number | null;
  pop: number;
  g?: string;
  td: number;
  tr: number;
  s?: number[];
}

export interface RealGym {
  id: string;
  n: string;
  c: string;
  city?: string;
  rep: number;
  fac: number;
  q: [number, number, number, number, number];
  hc: string;
}

export interface RosterFile {
  date: string;
  sources: string[];
  fighters: RealFighter[];
  gyms: RealGym[];
  ufc: { ranks: Partial<Record<DivisionId, { c: string | null; e: string[] }>>; p4p: string[] };
  pfl: { champs: Partial<Record<DivisionId, string>>; interim: Partial<Record<DivisionId, string>>; ranks: Partial<Record<DivisionId, string[]>> };
}

const SOUTHPAWS = new Set(["ufc-islam-makhachev", "ufc-leon-edwards", "ufc-valentina-shevchenko", "ufc-magomed-ankalaev", "ufc-dustin-poirier", "ufc-brandon-royval"]);
const SWITCH = new Set(["ufc-sean-omalley", "ufc-israel-adesanya", "ufc-petr-yan", "ufc-dricus-du-plessis"]);

const A = (r: number) => clamp(1 + ((r - 30) * 19) / 68, 1, 20);

// Tendency indexes in the compact file.
const T = { pressure: 0, counter: 1, range: 2, pocket: 3, kicking: 4, clinch: 5, tdEntry: 6, top: 7, subHunt: 8, scramble: 9, pace: 10, starter: 11, risk: 12, finish: 13, chin: 14, lkd: 15 };

function guessArt(rf: RealFighter): BaseArt {
  const [S, , W, U] = rf.rt;
  const t = rf.t;
  const c = rf.c;
  const caucasus = ["RU", "KZ", "KG", "TJ", "UZ", "AZ"].includes(c);
  if (W > S + 4 && W >= U) return caucasus ? "sambo" : c === "GE" || c === "AM" ? "wrestling" : "wrestling";
  if (U > S + 4 && U > W) return c === "JP" ? "judo" : "bjj";
  if (S > W + 4 && S > U) {
    if (c === "TH" || (t[T.clinch] > 0.5 && t[T.kicking] > 0.55)) return "muaythai";
    if (t[T.kicking] > 0.58) return c === "KR" ? "taekwondo" : t[T.range] > 0.65 ? "karate" : "kickboxing";
    return "boxing";
  }
  return "mma";
}

export interface RealContext {
  rankOf: (id: string) => number | null; // 0 champion
  p4p: (id: string) => number | null;
  day: number;
}

export function realFighter(rf: RealFighter, ctx: RealContext, seed: number): Fighter {
  const rng = new Rng(hashString(rf.id) ^ seed);
  const [S, G, W, U, Cd, D] = rf.rt.map(A);
  const t = rf.t;
  const s = rf.s;
  const slpm = s?.[0] ?? 3.5;
  const sapm = s?.[1] ?? 3.5;
  const acc = s?.[2] ?? 47;
  const def = s?.[3] ?? 54;
  const td = s?.[4] ?? 1.5;
  const tdDef = s?.[5] ?? 66;
  const sub = s?.[6] ?? 0.5;
  const kd = s?.[7] ?? 0.5;
  const legShare = s?.[10] ?? 15;
  const bodyShare = s?.[9] ?? 21;
  const clinchShare = s?.[12] ?? 11;
  const groundShare = s?.[13] ?? 13;
  const [koW, subW, decW, koL, subL] = rf.m;
  const wins = Math.max(1, koW + subW + decW);
  const fights = rf.r[0] + rf.r[1] + rf.r[2];
  const exp = clamp((fights - 14) / 12, -1, 1.5);
  const n = () => rng.normal(0, 0.55);
  const a = {} as Attrs;
  const skill = (S + G + W + U) / 4;
  a.boxing = S - 1.6 + (t[T.pocket] - 0.5) * 2.2 + clamp((acc - 47) / 7, -1.4, 1.4) + n();
  a.kicks = S - 1.7 + (t[T.kicking] - 0.42) * 6 + clamp((legShare + bodyShare - 36) / 10, -1.2, 1.5) + n();
  a.clinchStrikes = S - 1 + (t[T.clinch] - 0.4) * 4.5 + clamp((clinchShare - 11) / 6, -1, 1.5) + n();
  a.groundStrikes = (W + G) / 2 - 0.4 + (t[T.top] - 0.4) * 3 + clamp((groundShare - 13) / 8, -1.2, 2) + n();
  a.power = S - 0.7 + clamp((kd - 0.6) / 0.35, -2, 2.4) + clamp((koW / wins - 0.4) * 4, -1.6, 2) + n();
  a.counters = S - 1 + (t[T.counter] - 0.4) * 5 + n();
  a.strikeDef = S - 0.7 + clamp((def - 54) / 4.5, -2.2, 2.4) + clamp((3.8 - sapm) / 2.2, -1.5, 1.2) + n();
  a.footwork = S - 0.5 + (t[T.range] - 0.5) * 4 + clamp((def - 54) / 8, -1, 1.2) + n();
  a.takedowns = W + (t[T.tdEntry] - 0.3) * 4 + clamp((td - 1.6) / 1.1, -2, 2.4) + n();
  a.tdd = W - 0.5 + clamp((tdDef - 66) / 7, -2.4, 2.4) + n();
  a.clinchControl = (W + G) / 2 + (t[T.clinch] - 0.4) * 3 + n();
  a.topControl = (W + G) / 2 + (t[T.top] - 0.4) * 4 + n();
  a.bottomGame = (G + U) / 2 - 0.5 + (t[T.scramble] - 0.5) * 2 + n();
  a.subs = U + (t[T.subHunt] - 0.3) * 3 + clamp((sub - 0.5) / 0.4, -1.5, 2.2) + clamp((subW / wins - 0.25) * 4, -1, 1.6) + n();
  a.subDef = (G + U) / 2 + 0.1 - subL * 0.3 + n();
  a.scrambles = G - 0.5 + (t[T.scramble] - 0.5) * 4 + n();
  const build = rf.b;
  a.strength = (W + D) / 2 + (build === "stocky" ? 1.6 : build === "compact" ? 1 : build === "rangy" || build === "long" ? -1.2 : 0) + n();
  a.speed = (S + Cd) / 2 - 0.5 + (t[T.starter] - 0.5) * 2 - (rf.a - 29) * 0.12 + n();
  a.cardio = Cd - 0.6 + (t[T.pace] - 0.6) * 2 + n();
  a.chin = D + 0.9 + (t[T.chin] - 0.6) * 2 - Math.max(0, koL - 1) * 0.5 + n();
  a.recovery = (Cd + D) / 2 + 0.1 - (rf.a - 30) * 0.15 + n();
  a.toughness = D + 0.4 + n();
  a.fightIQ = skill - 0.6 + exp * 1.1 + n();
  a.composure = skill - 1 + (rf.ps[0] - 50) / 15 + exp * 0.8 + n();
  a.aggression = skill - 0.3 + (t[T.pressure] - 0.45) * 7 + (t[T.finish] - 0.5) * 3 + (t[T.risk] - 0.5) * 2 + n();
  a.discipline = skill - 0.6 + (rf.ps[0] - 50) / 12 + n();
  a.heart = D + 0.4 + (rf.ps[4] - 50) / 20 + n();
  a.workRate = skill - 0.2 + (t[T.pace] - 0.6) * 6 + clamp((slpm - 3.8) / 1.2, -1.5, 2.2) + n();
  for (const k of ATTRS) a[k] = clamp(a[k], 1, 20);

  // Quality on the day of the snapshot, from where the fighter stands.
  const derived = ovrOf(a);
  const rank = ctx.rankOf(rf.id);
  const p4p = ctx.p4p(rf.id);
  let target: number;
  if (rf.p === "ufc") {
    if (rank === 0) target = 88.5 + (p4p !== null ? Math.max(0, (10 - p4p) * 0.25) : 0);
    else if (rank !== null) target = 86.5 - (rank - 1) * 0.5 + (p4p !== null ? 0.8 : 0);
    else target = clamp(derived, 66, 79);
    if (rank !== null) target = 0.3 * clamp(derived, target - 6, target + 6) + 0.7 * target;
  } else {
    const main = rf.lg !== "africa" && rf.lg !== "mena";
    if (rank === 0) target = main ? 84 : 72;
    else if (rank !== null) target = (main ? 80 : 68) - (rank - 1) * 0.6;
    else target = main ? clamp(derived - 4, 61, 75) : clamp(derived - 10, 53, 66);
    if (rank !== null) target = 0.3 * clamp(derived, target - 6, target + 6) + 0.7 * target;
  }
  for (let pass = 0; pass < 3; pass++) {
    const shift = (target - ovrOf(a)) / 4;
    for (const k of ATTRS) a[k] = clamp(a[k] + shift, 1, 20);
  }
  for (const k of ATTRS) a[k] = Math.round(a[k] * 10) / 10;
  const cur = ovrOf(a);

  const parts = rf.n.trim().split(/\s+/);
  const first = parts.length > 1 ? parts[0] : "";
  const surname = parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
  const def0 = DIVISIONS[rf.d];
  const stance: Stance = SOUTHPAWS.has(rf.id) ? "southpaw" : SWITCH.has(rf.id) ? "switch" : rng.chance(0.06) ? "switch" : rng.chance(0.21) ? "southpaw" : "orthodox";
  const decline = rf.dv[2];
  let aging: AgingType = decline > 1.12 ? "early" : decline < 0.92 ? "late" : "normal";
  if (rf.a >= 34 && rank !== null) aging = "late";
  const youth = clamp((27 - rf.a) / 7, 0, 1);
  const pot = Math.round(clamp(Math.max(cur, cur + youth * rng.range(2, 9) + (rf.a < 31 ? rng.range(0, 2) : 0)), cur, 96));
  const ps = rf.ps;
  const art = guessArt(rf);
  const rec = blankRecord();
  rec.w = rf.r[0];
  rec.l = rf.r[1];
  rec.d = rf.r[2];
  [rec.koW, rec.subW, rec.decW, rec.koL, rec.subL, rec.decL] = rf.m;
  const country = countryOf(rf.c);
  const f: Fighter = {
    id: rf.id,
    first,
    surname,
    nick: rf.k,
    sex: def0.sex,
    country: rf.c,
    hometown: rf.h || rng.pick(country.cities),
    birth: Math.round(ctx.day - rf.a * 365.25 - rng.int(0, 364)),
    div: rf.d,
    height: rf.ht,
    reach: rf.rc || rf.ht,
    stance,
    walk: Math.round(typicalWalk(rf.d) + rng.normal(0, def0.limit * 0.02) + (build === "stocky" ? 3 : 0)),
    attrs: a,
    hid: {
      pot,
      peak: clamp(rf.dv[0], 25, 34),
      aging,
      consistency: Math.round(clamp(8 + (rf.ps[0] - 30) / 6 + rng.normal(0, 2), 1, 20)),
      injuryProne: Math.round(clamp(rng.normal(8, 3), 1, 20)),
      bigFight: Math.round(clamp(9 + (rank !== null ? 3 : 0) + rng.normal(0, 2.5), 1, 20)),
    },
    pers: {
      professionalism: Math.round(clamp(ps[0] / 5, 1, 20)),
      ambition: Math.round(clamp(ps[4] / 5, 1, 20)),
      loyalty: Math.round(clamp(ps[6] / 5, 1, 20)),
      temperament: Math.round(clamp(20 - ps[1] / 5.5, 1, 20)),
      controversy: Math.round(clamp((ps[2] + ps[3]) / 10 - 3, 1, 20)),
      greed: Math.round(clamp(ps[5] / 5, 1, 20)),
    },
    base: art,
    tech: makeTechniques(rng, art, a, cur),
    rec,
    am: blankRecord(),
    amateur: false,
    promo: rf.p as PromoId,
    contract: null,
    gym: rf.g ?? "",
    pop: rf.pop,
    elo: 1500,
    bouts: [],
    lastFight: null,
    streak: rf.ws > 0 ? rf.ws : -rf.ls,
    injury: null,
    susp: 0,
    booked: null,
    status: "active",
    reigns: rf.tr,
    dmg: clamp(koL * 10 + fights * 1.2 + Math.max(0, rf.a - 30) * 2, 0, 130),
    stats: blankTotals(),
    official: s ? { slpm, sapm, acc, def, td, tdDef, sub, kd, head: s[8], body: s[9], leg: s[10], stand: s[11], clinch: s[12], ground: s[13] } : undefined,
    real: true,
    fatigue: 10,
    sharp: 70,
    morale: 65,
    joined: 0,
    best: Math.round(cur),
  };
  const known = KNOWN_TITLES[rf.id];
  if (known) f.reigns = Math.max(f.reigns, known[0]);
  f.legacy = startingLegacy(f, known ? known[1] : rf.td);
  f.bestStreak = Math.max(rf.ws, 0);
  return f;
}

export function realGym(g: RealGym): Gym {
  return {
    id: g.id,
    name: g.n,
    country: g.c,
    city: g.city ?? countryOf(g.c).cities[0],
    rep: g.rep,
    facilities: g.fac,
    coaches: { head: g.q[0], striking: g.q[1], grappling: g.q[2], wrestling: g.q[3], sc: g.q[4] },
    headCoach: g.hc || "Head coach",
    fee: g.rep >= 80 ? 15 : g.rep >= 70 ? 12 : 10,
    real: true,
  };
}
