// Fighting styles. Every fighter has a way of striking and a way of grappling,
// the way analysts describe real fighters: a technical boxer with a chain
// wrestler's takedowns, a Muay Thai knee fighter who scrambles. Each style has a
// mastery from 0 to 100. It shapes what a fighter chooses to do and, the better
// they know it, how well its moves work. Mastery grows with experience and with
// style coaching; a new style can be learned, but it starts from the bottom.

import type { AttrKey } from "../model/attributes";
import type { BaseArt } from "./styles";
import type { TechId } from "./techniques";
import type { PlanStyle } from "../engine/plan";

export type StrikeStyle = "outBoxer" | "pressure" | "counter" | "slugger" | "dutch" | "point" | "flash" | "khao" | "femur" | "volume" | "brawler" | "basic";
export type GrappleStyle = "chain" | "blast" | "grinder" | "scrambler" | "pounder" | "passer" | "guard" | "backTaker" | "legLocker" | "thrower" | "sprawl";
export type StyleId = StrikeStyle | GrappleStyle;

/** What a style does in the cage at full mastery. Each value scales an effect in the engine. */
export interface Traits {
  jab: number; // leads with the jab, and lands it
  headMove: number; // harder to hit with punches
  range: number; // wins the battle for range
  cage: number; // walks opponents onto the fence
  body: number; // invests in the body
  volume: number; // longer combinations, higher pace
  counter: number; // counters more often and harder
  power: number; // heavier punches, a little less accurate
  lowKick: number; // combinations end with a low kick
  blitz: number; // long-range entries land more
  flash: number; // head kicks and spinning attacks
  clinch: number; // seeks the clinch, knees inside
  teep: number; // teeps and body kicks
  read: number; // reads an opponent's patterns quickly
  mix: number; // hard to read: mixes levels and rhythms
  chain: number; // chains takedown attempts
  shot: number; // explosive takedowns from open space
  fence: number; // takedowns and control against the fence
  scramble: number; // gets up and wins scrambles
  gnp: number; // ground and pound
  pass: number; // passes and smothers on top
  guard: number; // attacks off the back
  back: number; // takes the back
  legs: number; // leg locks
  throw: number; // throws from the clinch
  sprawl: number; // stops takedowns and gets up
}
export type TraitKey = keyof Traits;

export interface StyleDef {
  id: StyleId;
  kind: "strike" | "grapple";
  name: string;
  /** The discipline it comes from. */
  from: string;
  /** Backgrounds that produce it. */
  arts: BaseArt[];
  desc: string;
  /** What it looks like in a fight, in plain words. */
  how: string[];
  /** The attributes it is built on: how well a fighter fits it, and what coaching it trains. */
  keys: AttrKey[];
  /** Signature techniques; style coaching drills them too. */
  tech: TechId[];
  plan: PlanStyle;
  t: Partial<Traits>;
}

const D = (d: StyleDef) => d;

export const FIGHT_STYLES: Record<StyleId, StyleDef> = {
  // ---------- striking ----------
  outBoxer: D({
    id: "outBoxer", kind: "strike", name: "Technical boxer", from: "Boxing", arts: ["boxing", "mma", "karate"],
    desc: "Jab, footwork and defence: wins rounds on the outside and makes opponents miss.",
    how: ["Leads with an educated jab", "Head movement and angles: hard to hit clean", "Decides where the fight happens"],
    keys: ["boxing", "footwork", "strikeDef", "speed", "fightIQ"], tech: ["jab", "checkHook", "counterRight"], plan: "boxer",
    t: { jab: 0.7, headMove: 0.55, range: 0.5, read: 0.3 },
  }),
  pressure: D({
    id: "pressure", kind: "strike", name: "Pressure fighter", from: "Boxing", arts: ["boxing", "kickboxing", "brawler", "mma"],
    desc: "Walks opponents down, cuts off the cage and breaks them with volume and body shots.",
    how: ["Cuts off the cage", "Long combinations, high pace", "Invests in the body early"],
    keys: ["aggression", "workRate", "cardio", "boxing", "chin"], tech: ["liverShot", "uppercut", "jab"], plan: "pressure",
    t: { cage: 0.75, volume: 0.5, body: 0.5 },
  }),
  counter: D({
    id: "counter", kind: "strike", name: "Counter-puncher", from: "Boxing", arts: ["boxing", "karate", "kickboxing"],
    desc: "Patient and precise: lets the opponent lead, makes them miss and punishes every entry.",
    how: ["Waits for the opponent to commit", "Counters hard on the miss", "Reads patterns quickly"],
    keys: ["counters", "strikeDef", "speed", "fightIQ", "composure"], tech: ["counterRight", "checkHook"], plan: "counter",
    t: { counter: 0.85, headMove: 0.35, read: 0.55 },
  }),
  slugger: D({
    id: "slugger", kind: "strike", name: "Power puncher", from: "Boxing", arts: ["boxing", "brawler", "wrestling"],
    desc: "Every punch thrown to hurt: fewer shots, but any one of them can end it.",
    how: ["Loads up on power shots", "A knockout threat in every exchange", "Gives up some accuracy for it"],
    keys: ["power", "boxing", "chin", "aggression"], tech: ["overhand", "uppercut"], plan: "brawler",
    t: { power: 0.85 },
  }),
  dutch: D({
    id: "dutch", kind: "strike", name: "Dutch kickboxer", from: "Kickboxing", arts: ["kickboxing", "muaythai"],
    desc: "Punching combinations that finish with a hard low kick, thrown going forward.",
    how: ["Every combination ends with a low kick", "Chops the legs round after round", "Comes forward behind the hands"],
    keys: ["kicks", "boxing", "workRate", "power"], tech: ["legKick", "liverShot", "bodyKick"], plan: "kickboxer",
    t: { lowKick: 0.85, volume: 0.25, cage: 0.25 },
  }),
  point: D({
    id: "point", kind: "strike", name: "Point fighter", from: "Karate", arts: ["karate", "taekwondo"],
    desc: "Bladed stance and long range: blitzes in, scores and is gone before the answer comes.",
    how: ["Fights from the end of the range", "Blitzes in and out", "Hard to pin down and hard to read"],
    keys: ["footwork", "speed", "kicks", "counters"], tech: ["superman", "switchKick", "counterRight"], plan: "outfighter",
    t: { blitz: 0.75, range: 0.6, mix: 0.4, counter: 0.3 },
  }),
  flash: D({
    id: "flash", kind: "strike", name: "Flash kicker", from: "Taekwondo", arts: ["taekwondo", "karate", "kickboxing"],
    desc: "Spinning attacks and head kicks from every angle: unpredictable and dangerous at range.",
    how: ["Head kicks and spinning attacks", "Fast, flashy, unpredictable", "Uncomfortable in the clinch"],
    keys: ["kicks", "speed", "footwork"], tech: ["headKick", "spinningBackKick", "questionMark", "switchKick"], plan: "kickboxer",
    t: { flash: 1, mix: 0.5, range: 0.3 },
  }),
  khao: D({
    id: "khao", kind: "strike", name: "Muay Khao (knee fighter)", from: "Muay Thai", arts: ["muaythai"],
    desc: "Grabs the plum and knees the body and the head: breaks opponents in the clinch.",
    how: ["Seeks the plum clinch", "Knees and elbows in close", "Wears opponents down on the fence"],
    keys: ["clinchStrikes", "clinchControl", "strength", "cardio"], tech: ["plumKnees", "elbows"], plan: "muaythai",
    t: { clinch: 0.9, body: 0.3 },
  }),
  femur: D({
    id: "femur", kind: "strike", name: "Muay Femur (technician)", from: "Muay Thai", arts: ["muaythai", "kickboxing"],
    desc: "Timing and balance: teeps, kicks to every level and counters off the catch.",
    how: ["Teeps to keep pressure fighters off", "Kicks to every level, with timing", "Checks kicks and counters"],
    keys: ["kicks", "footwork", "counters", "fightIQ"], tech: ["teep", "bodyKick", "checkKicks", "legKick"], plan: "muaythai",
    t: { teep: 0.85, counter: 0.35, read: 0.45, lowKick: 0.3 },
  }),
  volume: D({
    id: "volume", kind: "strike", name: "Volume striker", from: "MMA", arts: ["mma", "kickboxing", "boxing"],
    desc: "Constant output to every level: wins rounds on numbers and never lets the opponent settle.",
    how: ["Very high output", "Mixes head, body and legs", "Wins rounds on volume"],
    keys: ["workRate", "cardio", "boxing", "kicks"], tech: ["jab", "calfKick", "bodyKick"], plan: "pressure",
    t: { volume: 0.85, mix: 0.6 },
  }),
  brawler: D({
    id: "brawler", kind: "strike", name: "Brawler", from: "Street fighting", arts: ["brawler"],
    desc: "Wild, durable and hard to discourage: trades in the pocket and dares the opponent to stay.",
    how: ["Swings big in the pocket", "Walks through shots", "Defence is an afterthought"],
    keys: ["power", "chin", "heart", "aggression"], tech: ["overhand"], plan: "brawler",
    t: { power: 0.55, cage: 0.35, volume: 0.25 },
  }),
  basic: D({
    id: "basic", kind: "strike", name: "Functional striker", from: "MMA", arts: ["wrestling", "greco", "sambo", "judo", "bjj"],
    desc: "Enough on the feet to get to the grappling: a jab, a right hand and a level change behind them.",
    how: ["Strikes to set up the takedown", "Simple, safe combinations"],
    keys: ["boxing", "aggression"], tech: ["jab", "overhand"], plan: "wrestleboxer",
    t: { jab: 0.25 },
  }),

  // ---------- grappling ----------
  chain: D({
    id: "chain", kind: "grapple", name: "Chain wrestler", from: "Collegiate wrestling", arts: ["wrestling", "mma"],
    desc: "Single into double into a trip: never stops chaining attempts until the takedown comes.",
    how: ["Chains shot after shot", "Rides and back takes on top", "A gas tank built for it"],
    keys: ["takedowns", "scrambles", "cardio", "topControl"], tech: ["singleLeg", "doubleLeg", "legRide", "backTake"], plan: "grinder",
    t: { chain: 0.85, back: 0.25 },
  }),
  blast: D({
    id: "blast", kind: "grapple", name: "Power wrestler", from: "Freestyle wrestling", arts: ["wrestling", "sambo", "mma"],
    desc: "Explosive level changes from open space: the double leg that comes out of nowhere.",
    how: ["Explosive doubles from range", "Times the shot under the punches", "Heavy on top after"],
    keys: ["takedowns", "speed", "strength"], tech: ["doubleLeg", "sprawl"], plan: "wrestleboxer",
    t: { shot: 0.85, gnp: 0.2 },
  }),
  grinder: D({
    id: "grinder", kind: "grapple", name: "Cage grinder", from: "Greco-Roman wrestling", arts: ["greco", "wrestling", "judo"],
    desc: "Pins opponents on the fence, wins the hand fight and drags them down: wins every minute.",
    how: ["Fence work and body locks", "Control time round after round", "Drains the gas tank"],
    keys: ["clinchControl", "strength", "cardio", "takedowns"], tech: ["bodyLock", "cageWrestling", "trip"], plan: "grinder",
    t: { fence: 0.85, cage: 0.4, pass: 0.15 },
  }),
  scrambler: D({
    id: "scrambler", kind: "grapple", name: "Scrambler", from: "MMA", arts: ["mma", "wrestling", "bjj"],
    desc: "Never settles on the bottom: wins the scramble, takes the back or gets up.",
    how: ["Gets back up fast", "Wins scrambles", "Turns defence into back takes"],
    keys: ["scrambles", "bottomGame", "speed", "cardio"], tech: ["wallWalk", "backTake"], plan: "balanced",
    t: { scramble: 0.85, back: 0.3 },
  }),
  pounder: D({
    id: "pounder", kind: "grapple", name: "Ground-and-pounder", from: "Wrestling", arts: ["wrestling", "sambo", "brawler"],
    desc: "Takes it down to hurt: posture, elbows and punches from the top until the referee steps in.",
    how: ["Heavy ground and pound", "Postures up in the guard", "Hunts the finish from on top"],
    keys: ["groundStrikes", "topControl", "power", "strength"], tech: ["gnp", "elbows"], plan: "wrestleboxer",
    t: { gnp: 0.9 },
  }),
  passer: D({
    id: "passer", kind: "grapple", name: "Pressure passer", from: "Sambo", arts: ["sambo", "bjj", "judo"],
    desc: "Heavy hips on top: passes the guard, smothers and finishes with arm-triangles and kimuras.",
    how: ["Passes the guard with pressure", "Smothers on top", "Arm-triangles and kimuras"],
    keys: ["topControl", "subs", "strength", "cardio"], tech: ["armTriangle", "kimura", "legRide"], plan: "grappler",
    t: { pass: 0.85, gnp: 0.2 },
  }),
  guard: D({
    id: "guard", kind: "grapple", name: "Guard player", from: "Brazilian jiu-jitsu", arts: ["bjj"],
    desc: "Dangerous off the back: triangles, armbars and sweeps the moment the opponent gets careless.",
    how: ["Attacks from the bottom", "Triangles, armbars and sweeps", "Happy to fight off the back"],
    keys: ["bottomGame", "subs", "scrambles"], tech: ["triangle", "armbar", "guillotine"], plan: "submission",
    t: { guard: 0.9 },
  }),
  backTaker: D({
    id: "backTaker", kind: "grapple", name: "Back-take specialist", from: "Brazilian jiu-jitsu", arts: ["bjj", "mma", "wrestling"],
    desc: "Every scramble ends the same way: hooks in, body triangle, an arm under the chin.",
    how: ["Takes the back in scrambles", "Body triangle and rear-naked choke", "Patient on top"],
    keys: ["scrambles", "subs", "topControl"], tech: ["backTake", "bodyTriangle", "rnc"], plan: "submission",
    t: { back: 0.9, scramble: 0.2 },
  }),
  legLocker: D({
    id: "legLocker", kind: "grapple", name: "Leg-locker", from: "Sambo", arts: ["sambo", "bjj"],
    desc: "Heel hooks and kneebars from scrambles and the guard: rare in MMA and very dangerous.",
    how: ["Dives on the legs", "Heel hooks from scrambles", "Risky: can give up position"],
    keys: ["subs", "scrambles", "bottomGame"], tech: ["heelHook"], plan: "submission",
    t: { legs: 1, guard: 0.3 },
  }),
  thrower: D({
    id: "thrower", kind: "grapple", name: "Thrower", from: "Judo", arts: ["judo", "sambo", "greco"],
    desc: "Trips and hip tosses from the clinch that land straight in side control.",
    how: ["Throws from the clinch", "Lands in dominant positions", "Strong grips and balance"],
    keys: ["clinchControl", "strength", "takedowns"], tech: ["judoThrow", "trip"], plan: "grappler",
    t: { throw: 0.9, fence: 0.2 },
  }),
  sprawl: D({
    id: "sprawl", kind: "grapple", name: "Sprawl-and-brawl", from: "Striking", arts: ["boxing", "kickboxing", "muaythai", "karate", "taekwondo", "brawler"],
    desc: "No interest in grappling: sprawls on the shot, stays off the fence and gets straight back up.",
    how: ["Sprawls on every shot", "Gets up fast", "Keeps the fight standing"],
    keys: ["tdd", "footwork", "strength", "scrambles"], tech: ["sprawl", "wallWalk"], plan: "balanced",
    t: { sprawl: 0.85 },
  }),
};

export const STRIKE_STYLES = Object.values(FIGHT_STYLES).filter((s) => s.kind === "strike").map((s) => s.id as StrikeStyle);
export const GRAPPLE_STYLES = Object.values(FIGHT_STYLES).filter((s) => s.kind === "grapple").map((s) => s.id as GrappleStyle);

/** A fighter's styles: how they strike and grapple, and how well they know each. */
export interface FighterStyle {
  s: StrikeStyle;
  sm: number;
  g: GrappleStyle;
  gm: number;
  /** Styles learned before and set aside, with the mastery they had. */
  known?: Partial<Record<StyleId, number>>;
}

export const MASTERY_BANDS: [number, string][] = [
  [85, "Master"],
  [70, "Expert"],
  [50, "Skilled"],
  [30, "Developing"],
  [0, "Novice"],
];
export function masteryName(m: number): string {
  return MASTERY_BANDS.find(([min]) => m >= min)?.[1] ?? "Novice";
}

/**
 * How well a style suits a fighter, 0..100: mostly whether it is built on their
 * strengths (its attributes against their own average), a little on how good
 * those attributes are. A young fighter can fit a style well before mastering it.
 */
export function styleFit(attrs: Record<AttrKey, number>, id: StyleId): number {
  const st = FIGHT_STYLES[id];
  const keys = st.keys.reduce((a, k) => a + attrs[k], 0) / st.keys.length;
  const vals = Object.values(attrs);
  const all = vals.reduce((a, v) => a + v, 0) / vals.length;
  return Math.round(Math.max(0, Math.min(100, 50 + (keys - all) * 10 + (keys - 12) * 2)));
}

/** Styles a background produces, in order of how natural they are. */
export function stylesForArt(art: BaseArt, kind: "strike" | "grapple"): StyleId[] {
  return Object.values(FIGHT_STYLES)
    .filter((s) => s.kind === kind && s.arts.includes(art))
    .sort((a, b) => a.arts.indexOf(art) - b.arts.indexOf(art))
    .map((s) => s.id);
}
