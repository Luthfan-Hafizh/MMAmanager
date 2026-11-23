// Martial arts backgrounds. Each one shapes the attributes a fighter starts with,
// the techniques they already know and the plan they like to fight.

import type { AttrKey } from "../model/attributes";
import type { TechId } from "./techniques";

export type BaseArt =
  | "wrestling"
  | "greco"
  | "sambo"
  | "judo"
  | "bjj"
  | "boxing"
  | "kickboxing"
  | "muaythai"
  | "karate"
  | "taekwondo"
  | "mma"
  | "brawler";

export interface ArtDef {
  id: BaseArt;
  name: string;
  desc: string;
  /** Additive attribute modifiers in attribute points. */
  mods: Partial<Record<AttrKey, number>>;
  tech: Partial<Record<TechId, number>>;
  plan: string; // style preset id
}

export const ARTS: Record<BaseArt, ArtDef> = {
  wrestling: {
    id: "wrestling", name: "Collegiate wrestling", plan: "grinder",
    desc: "Doubles, singles and the gas tank to keep shooting. The most proven road in MMA.",
    mods: { takedowns: 4, tdd: 4, topControl: 3, clinchControl: 2, scrambles: 2, cardio: 2, strength: 1.5, groundStrikes: 1, boxing: -2, kicks: -3, subs: -1, bottomGame: -2, workRate: 1 },
    tech: { doubleLeg: 2, singleLeg: 2, sprawl: 2, cageWrestling: 1, legRide: 1 },
  },
  greco: {
    id: "greco", name: "Greco-Roman wrestling", plan: "grinder",
    desc: "Upper-body throws and body locks; a monster against the fence.",
    mods: { clinchControl: 5, takedowns: 3, tdd: 3, strength: 2.5, topControl: 2, kicks: -3, boxing: -1.5, subs: -1.5, bottomGame: -2 },
    tech: { bodyLock: 2, judoThrow: 1, cageWrestling: 2, sprawl: 1 },
  },
  sambo: {
    id: "sambo", name: "Combat sambo", plan: "wrestleboxer",
    desc: "Throws, trips, relentless top pressure and leg locks, with strikes allowed.",
    mods: { takedowns: 3, topControl: 3.5, groundStrikes: 2.5, clinchControl: 2, subs: 1.5, tdd: 2, cardio: 2, strength: 1, kicks: -2, footwork: -1 },
    tech: { trip: 2, bodyLock: 1, legRide: 2, heelHook: 1, gnp: 1 },
  },
  judo: {
    id: "judo", name: "Judo", plan: "grappler",
    desc: "Throws from the clinch and strong top positions, but little from the outside.",
    mods: { clinchControl: 4, takedowns: 2.5, topControl: 2, subs: 1.5, strength: 1.5, tdd: 2, boxing: -2, kicks: -2.5, footwork: -1 },
    tech: { judoThrow: 2, trip: 2, armbar: 1, kimura: 1 },
  },
  bjj: {
    id: "bjj", name: "Brazilian jiu-jitsu", plan: "submission",
    desc: "Submissions from everywhere, a dangerous guard and calm on the bottom.",
    mods: { subs: 5, bottomGame: 4.5, subDef: 4, scrambles: 2, topControl: 1.5, takedowns: -1, tdd: -1.5, boxing: -2, kicks: -2, power: -1 },
    tech: { rnc: 2, triangle: 2, armbar: 2, guillotine: 1, backTake: 2, bodyTriangle: 1 },
  },
  boxing: {
    id: "boxing", name: "Boxing", plan: "boxer",
    desc: "Hands, head movement and the pocket. Kicks and grappling have to be learned.",
    mods: { boxing: 5, strikeDef: 3, footwork: 2.5, counters: 2.5, speed: 1, power: 1, kicks: -3, takedowns: -3, subs: -2.5, bottomGame: -2, tdd: -1 },
    tech: { counterRight: 2, liverShot: 2, checkHook: 2, uppercut: 1 },
  },
  kickboxing: {
    id: "kickboxing", name: "Kickboxing", plan: "kickboxer",
    desc: "Combinations finished with kicks, and comfortable at long range.",
    mods: { kicks: 4, boxing: 3, footwork: 2, strikeDef: 2, workRate: 1.5, takedowns: -2.5, topControl: -2, subs: -2, bottomGame: -2 },
    tech: { legKick: 2, headKick: 2, bodyKick: 2, switchKick: 1, spinningBackKick: 1 },
  },
  muaythai: {
    id: "muaythai", name: "Muay Thai", plan: "muaythai",
    desc: "Kicks that hurt, the plum clinch, knees and elbows.",
    mods: { kicks: 4, clinchStrikes: 5, toughness: 2, power: 1, clinchControl: 1, boxing: 1, takedowns: -2.5, subs: -2, bottomGame: -2, footwork: -0.5 },
    tech: { legKick: 2, plumKnees: 2, elbows: 2, teep: 2, bodyKick: 1, checkKicks: 2 },
  },
  karate: {
    id: "karate", name: "Karate", plan: "outfighter",
    desc: "Range, timing and blitzes from distance. Hard to hit, hard to read.",
    mods: { footwork: 4.5, kicks: 3, counters: 3, strikeDef: 2.5, speed: 1.5, boxing: 1, clinchControl: -2, takedowns: -2.5, topControl: -2, subs: -1.5 },
    tech: { headKick: 1, questionMark: 2, counterRight: 1, spinningBackKick: 1, superman: 1 },
  },
  taekwondo: {
    id: "taekwondo", name: "Taekwondo", plan: "outfighter",
    desc: "Fast, flashy kicks from every angle, and the spinning ones.",
    mods: { kicks: 5, speed: 2, footwork: 2.5, power: 0.5, boxing: -1, clinchControl: -2.5, takedowns: -2.5, tdd: -1.5, subs: -2 },
    tech: { headKick: 2, spinningBackKick: 2, questionMark: 2, switchKick: 2 },
  },
  mma: {
    id: "mma", name: "Raised in MMA", plan: "balanced",
    desc: "Grew up in an MMA gym: no gaping hole, the transitions come naturally.",
    mods: { fightIQ: 1.5, scrambles: 1.5, takedowns: 0.5, boxing: 0.5, kicks: 0.5, tdd: 0.5, subDef: 0.5, cardio: 0.5 },
    tech: { calfKick: 1, doubleLeg: 1, rnc: 1, wallWalk: 1 },
  },
  brawler: {
    id: "brawler", name: "Street fighting", plan: "brawler",
    desc: "Raw, hard to discourage and dangerous with every punch. Technique comes later.",
    mods: { power: 3, chin: 2, heart: 2.5, aggression: 3, toughness: 1.5, strikeDef: -2.5, fightIQ: -2, discipline: -2.5, footwork: -1.5, subDef: -1, takedowns: -1 },
    tech: { overhand: 2, gnp: 1 },
  },
};

export const ART_IDS = Object.keys(ARTS) as BaseArt[];

/** Typical fighting cultures of a few countries, for generated fighters. */
export const COUNTRY_ARTS: Record<string, [BaseArt, number][]> = {
  US: [["wrestling", 4], ["mma", 4], ["boxing", 2], ["bjj", 2], ["kickboxing", 1], ["brawler", 1]],
  CA: [["mma", 4], ["wrestling", 2], ["kickboxing", 2], ["bjj", 1]],
  MX: [["boxing", 5], ["mma", 3], ["bjj", 1], ["brawler", 2]],
  BR: [["bjj", 6], ["muaythai", 3], ["mma", 3], ["judo", 1], ["brawler", 1]],
  RU: [["sambo", 6], ["wrestling", 4], ["mma", 2], ["boxing", 1], ["judo", 1]],
  KZ: [["sambo", 3], ["wrestling", 3], ["boxing", 2], ["mma", 2]],
  KG: [["wrestling", 3], ["sambo", 3], ["mma", 2]],
  UZ: [["wrestling", 3], ["judo", 2], ["sambo", 2], ["boxing", 2]],
  GE: [["wrestling", 4], ["judo", 3], ["sambo", 2], ["mma", 1]],
  AM: [["wrestling", 3], ["boxing", 2], ["mma", 2], ["sambo", 1]],
  AZ: [["wrestling", 3], ["sambo", 2], ["judo", 2]],
  TJ: [["sambo", 3], ["wrestling", 3], ["mma", 1]],
  JP: [["judo", 2], ["karate", 3], ["mma", 3], ["kickboxing", 2], ["bjj", 1]],
  KR: [["taekwondo", 3], ["mma", 3], ["judo", 2], ["boxing", 1]],
  CN: [["kickboxing", 3], ["wrestling", 2], ["mma", 3], ["judo", 1]],
  MN: [["wrestling", 4], ["judo", 2], ["sambo", 2]],
  TH: [["muaythai", 8], ["mma", 1]],
  PH: [["kickboxing", 3], ["mma", 3], ["karate", 1]],
  NL: [["kickboxing", 6], ["mma", 2], ["judo", 1]],
  GB: [["mma", 4], ["kickboxing", 2], ["boxing", 2], ["bjj", 1]],
  "GB-ENG": [["mma", 4], ["kickboxing", 2], ["boxing", 2], ["bjj", 1]],
  "GB-SCT": [["mma", 4], ["boxing", 2], ["kickboxing", 1]],
  "GB-WLS": [["mma", 4], ["boxing", 2], ["kickboxing", 1]],
  IE: [["mma", 4], ["boxing", 3], ["bjj", 1]],
  FR: [["kickboxing", 3], ["mma", 3], ["judo", 2], ["boxing", 1]],
  DE: [["mma", 3], ["kickboxing", 2], ["boxing", 2], ["wrestling", 1]],
  PL: [["mma", 3], ["wrestling", 2], ["judo", 2], ["boxing", 2]],
  CZ: [["mma", 3], ["kickboxing", 2], ["wrestling", 1]],
  SE: [["mma", 3], ["kickboxing", 2], ["wrestling", 1]],
  CU: [["boxing", 4], ["wrestling", 4], ["judo", 1]],
  IR: [["wrestling", 6], ["mma", 1]],
  TR: [["wrestling", 3], ["kickboxing", 2], ["mma", 2]],
  NG: [["wrestling", 2], ["boxing", 2], ["mma", 3], ["kickboxing", 1]],
  CM: [["wrestling", 2], ["boxing", 2], ["mma", 3]],
  SN: [["wrestling", 5], ["mma", 2]],
  ZA: [["mma", 3], ["kickboxing", 2], ["wrestling", 1], ["bjj", 1]],
  AU: [["mma", 4], ["kickboxing", 2], ["boxing", 2], ["bjj", 1]],
  NZ: [["kickboxing", 4], ["mma", 3], ["boxing", 1]],
  AE: [["bjj", 4], ["mma", 2], ["wrestling", 1]],
  IN: [["wrestling", 3], ["mma", 2], ["boxing", 1]],
  PK: [["wrestling", 2], ["mma", 2], ["boxing", 1]],
};

export const DEFAULT_ARTS: [BaseArt, number][] = [["mma", 5], ["wrestling", 2], ["kickboxing", 2], ["boxing", 2], ["bjj", 2], ["muaythai", 1], ["judo", 1], ["brawler", 1]];
