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

export type StrikeStyle =
  | "outBoxer" | "pressure" | "counter" | "slugger" | "peekaboo" | "boxerPuncher"
  | "dutch" | "k1" | "sniper"
  | "khao" | "femur" | "tae" | "mat" | "sok" | "bouk" | "lak"
  | "point" | "kyokushin" | "flash" | "sanda"
  | "volume" | "brawler" | "basic";
export type GrappleStyle =
  | "chain" | "blast" | "grinder" | "rider" | "wrestleBoxer" | "clincher" | "catchWrestler" | "pounder"
  | "scrambler" | "passer" | "guard" | "backTaker" | "subHunter" | "legLocker" | "thrower" | "sprawl";
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
  elbow: number; // elbows in the pocket and the clinch
  kick: number; // heavy roundhouse kicks to the body and the head
  catch: number; // catches kicks: sweeps the standing leg or punishes
}
export type TraitKey = keyof Traits;

/** What each trait looks like, in plain words, for the pickers and the fighter page. */
export const TRAIT_NAMES: Record<TraitKey, string> = {
  jab: "Jab", headMove: "Head movement", range: "Range control", cage: "Cutting off the cage", body: "Body work",
  volume: "Volume", counter: "Counters", power: "Power punching", lowKick: "Low kicks", blitz: "Blitzing in",
  flash: "Head kicks and spinning", clinch: "Clinch knees", teep: "Teeps", read: "Reading the opponent", mix: "Mixing it up",
  chain: "Chain wrestling", shot: "Explosive shots", fence: "Fence work", scramble: "Scrambles", gnp: "Ground and pound",
  pass: "Top pressure", guard: "Guard attacks", back: "Back takes", legs: "Leg locks", throw: "Throws", sprawl: "Sprawl",
  elbow: "Elbows", kick: "Roundhouse kicks", catch: "Catching kicks",
};

export type StyleGroup = "Boxing" | "Kickboxing" | "Muay Thai" | "Karate" | "Taekwondo" | "Sanda" | "MMA" | "Wrestling" | "Brazilian jiu-jitsu" | "Sambo" | "Judo" | "Striking";

/** The families in the order the picker shows them. */
export const STRIKE_GROUPS: StyleGroup[] = ["Boxing", "Kickboxing", "Muay Thai", "Karate", "Taekwondo", "Sanda", "MMA"];
export const GRAPPLE_GROUPS: StyleGroup[] = ["Wrestling", "Brazilian jiu-jitsu", "Sambo", "Judo", "MMA", "Striking"];

export interface StyleDef {
  id: StyleId;
  kind: "strike" | "grapple";
  /** Where it sits in the picker: the discipline family. */
  group: StyleGroup;
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
    id: "outBoxer", kind: "strike", group: "Boxing", name: "Technical boxer", from: "Boxing", arts: ["boxing", "mma", "karate"],
    desc: "Jab, footwork and defence: wins rounds on the outside and makes opponents miss.",
    how: ["Leads with an educated jab", "Head movement and angles: hard to hit clean", "Decides where the fight happens"],
    keys: ["boxing", "footwork", "strikeDef", "speed", "fightIQ"], tech: ["jab", "checkHook", "counterRight"], plan: "boxer",
    t: { jab: 0.7, headMove: 0.55, range: 0.5, read: 0.3 },
  }),
  pressure: D({
    id: "pressure", kind: "strike", group: "Boxing", name: "Pressure fighter", from: "Boxing", arts: ["boxing", "kickboxing", "brawler", "mma"],
    desc: "Walks opponents down, cuts off the cage and breaks them with volume and body shots.",
    how: ["Cuts off the cage", "Long combinations, high pace", "Invests in the body early"],
    keys: ["aggression", "workRate", "cardio", "boxing", "chin"], tech: ["liverShot", "uppercut", "jab"], plan: "pressure",
    t: { cage: 0.75, volume: 0.5, body: 0.5 },
  }),
  counter: D({
    id: "counter", kind: "strike", group: "Boxing", name: "Counter-puncher", from: "Boxing", arts: ["boxing", "karate", "kickboxing"],
    desc: "Patient and precise: lets the opponent lead, makes them miss and punishes every entry.",
    how: ["Waits for the opponent to commit", "Counters hard on the miss", "Reads patterns quickly"],
    keys: ["counters", "strikeDef", "speed", "fightIQ", "composure"], tech: ["counterRight", "checkHook"], plan: "counter",
    t: { counter: 0.85, headMove: 0.35, read: 0.55 },
  }),
  slugger: D({
    id: "slugger", kind: "strike", group: "Boxing", name: "Power puncher", from: "Boxing", arts: ["boxing", "brawler", "wrestling"],
    desc: "Every punch thrown to hurt: fewer shots, but any one of them can end it.",
    how: ["Loads up on power shots", "A knockout threat in every exchange", "Gives up some accuracy for it"],
    keys: ["power", "boxing", "chin", "aggression"], tech: ["overhand", "uppercut"], plan: "brawler",
    t: { power: 0.85 },
  }),
  dutch: D({
    id: "dutch", kind: "strike", group: "Kickboxing", name: "Dutch kickboxer", from: "Kickboxing", arts: ["kickboxing", "muaythai"],
    desc: "Punching combinations that finish with a hard low kick, thrown going forward.",
    how: ["Every combination ends with a low kick", "Chops the legs round after round", "Comes forward behind the hands"],
    keys: ["kicks", "boxing", "workRate", "power"], tech: ["legKick", "liverShot", "bodyKick"], plan: "kickboxer",
    t: { lowKick: 0.85, volume: 0.25, cage: 0.25 },
  }),
  point: D({
    id: "point", kind: "strike", group: "Karate", name: "Point fighter", from: "Karate", arts: ["karate", "taekwondo"],
    desc: "Bladed stance and long range: blitzes in, scores and is gone before the answer comes.",
    how: ["Fights from the end of the range", "Blitzes in and out", "Hard to pin down and hard to read"],
    keys: ["footwork", "speed", "kicks", "counters"], tech: ["superman", "switchKick", "counterRight"], plan: "outfighter",
    t: { blitz: 0.75, range: 0.6, mix: 0.4, counter: 0.3 },
  }),
  flash: D({
    id: "flash", kind: "strike", group: "Taekwondo", name: "Flash kicker", from: "Taekwondo", arts: ["taekwondo", "kickboxing"],
    desc: "Spinning attacks and head kicks from every angle: unpredictable and dangerous at range.",
    how: ["Head kicks and spinning attacks", "Fast, flashy, unpredictable", "Uncomfortable in the clinch"],
    keys: ["kicks", "speed", "footwork"], tech: ["headKick", "spinningBackKick", "questionMark", "switchKick"], plan: "kickboxer",
    t: { flash: 1, mix: 0.5, range: 0.3 },
  }),
  khao: D({
    id: "khao", kind: "strike", group: "Muay Thai", name: "Muay Khao (knee fighter)", from: "Muay Thai", arts: ["muaythai"],
    desc: "Grabs the plum and knees the body and the head: breaks opponents in the clinch.",
    how: ["Seeks the plum clinch", "Knees and elbows in close", "Wears opponents down on the fence"],
    keys: ["clinchStrikes", "clinchControl", "strength", "cardio"], tech: ["plumKnees", "elbows"], plan: "muaythai",
    t: { clinch: 0.9, body: 0.3 },
  }),
  femur: D({
    id: "femur", kind: "strike", group: "Muay Thai", name: "Muay Femur (technician)", from: "Muay Thai", arts: ["muaythai", "kickboxing"],
    desc: "Timing and balance: teeps, kicks to every level and counters off the catch.",
    how: ["Teeps to keep pressure fighters off", "Kicks to every level, with timing", "Checks kicks and counters"],
    keys: ["kicks", "footwork", "counters", "fightIQ"], tech: ["teep", "bodyKick", "checkKicks", "legKick"], plan: "muaythai",
    t: { teep: 0.85, counter: 0.35, read: 0.45, lowKick: 0.3, catch: 0.25 },
  }),
  volume: D({
    id: "volume", kind: "strike", group: "MMA", name: "Volume striker", from: "MMA", arts: ["mma", "kickboxing", "boxing"],
    desc: "Constant output to every level: wins rounds on numbers and never lets the opponent settle.",
    how: ["Very high output", "Mixes head, body and legs", "Wins rounds on volume"],
    keys: ["workRate", "cardio", "boxing", "kicks"], tech: ["jab", "calfKick", "bodyKick"], plan: "pressure",
    t: { volume: 0.85, mix: 0.6 },
  }),
  brawler: D({
    id: "brawler", kind: "strike", group: "MMA", name: "Brawler", from: "Street fighting", arts: ["brawler"],
    desc: "Wild, durable and hard to discourage: trades in the pocket and dares the opponent to stay.",
    how: ["Swings big in the pocket", "Walks through shots", "Defence is an afterthought"],
    keys: ["power", "chin", "heart", "aggression"], tech: ["overhand"], plan: "brawler",
    t: { power: 0.55, cage: 0.35, volume: 0.25 },
  }),
  basic: D({
    id: "basic", kind: "strike", group: "MMA", name: "Functional striker", from: "MMA", arts: ["wrestling", "greco", "sambo", "judo", "bjj"],
    desc: "Enough on the feet to get to the grappling: a jab, a right hand and a level change behind them.",
    how: ["Strikes to set up the takedown", "Simple, safe combinations"],
    keys: ["boxing", "aggression"], tech: ["jab", "overhand"], plan: "wrestleboxer",
    t: { jab: 0.25 },
  }),

  peekaboo: D({
    id: "peekaboo", kind: "strike", group: "Boxing", name: "Peek-a-boo", from: "Boxing", arts: ["boxing", "brawler"],
    desc: "High guard, constant head movement and explosive hooks: slips inside and does the damage in the pocket.",
    how: ["Bobs and weaves behind a high guard", "Explodes inside with hooks and uppercuts", "Hard to hit clean, dangerous up close"],
    keys: ["strikeDef", "speed", "power", "boxing"], tech: ["checkHook", "uppercut", "liverShot"], plan: "pressure",
    t: { headMove: 0.6, power: 0.4, cage: 0.35, counter: 0.2 },
  }),
  boxerPuncher: D({
    id: "boxerPuncher", kind: "strike", group: "Boxing", name: "Boxer-puncher", from: "Boxing", arts: ["boxing", "mma", "kickboxing"],
    desc: "The complete boxer: a sharp jab to set the range, and the power to end it when the opening comes.",
    how: ["Jabs to set up the right hand", "Sits down on the power shots", "Comfortable at any range"],
    keys: ["boxing", "power", "footwork", "fightIQ"], tech: ["jab", "counterRight", "checkHook"], plan: "boxer",
    t: { jab: 0.45, power: 0.45, counter: 0.3, range: 0.2 },
  }),
  k1: D({
    id: "k1", kind: "strike", group: "Kickboxing", name: "K-1 kickboxer", from: "Kickboxing", arts: ["kickboxing", "karate", "muaythai"],
    desc: "Fast, flowing punch-kick combinations and knees up the middle: no wasted time, always attacking.",
    how: ["Long punch-kick combinations", "Knees up the middle", "A relentless pace in the pocket"],
    keys: ["kicks", "boxing", "speed", "workRate"], tech: ["legKick", "headKick", "liverShot", "flyingKnee"], plan: "kickboxer",
    t: { volume: 0.55, mix: 0.4, kick: 0.3, lowKick: 0.25 },
  }),
  sniper: D({
    id: "sniper", kind: "strike", group: "Kickboxing", name: "Leg-kick sniper", from: "Kickboxing", arts: ["kickboxing", "muaythai", "mma"],
    desc: "Stays at the end of the range and chops the calf and the thigh until the opponent can't stand on that leg.",
    how: ["Calf kicks from the outside", "Takes the lead leg away", "Gone before the counter comes"],
    keys: ["kicks", "footwork", "speed", "fightIQ"], tech: ["calfKick", "legKick", "checkKicks"], plan: "outfighter",
    t: { lowKick: 0.95, range: 0.45, counter: 0.15 },
  }),
  tae: D({
    id: "tae", kind: "strike", group: "Muay Thai", name: "Muay Tae (kicker)", from: "Muay Thai", arts: ["muaythai", "kickboxing"],
    desc: "The kicker: heavy roundhouse kicks to the body, the head and the legs, thrown through with the whole hip.",
    how: ["Roundhouse kicks to every level", "Kicks hard enough to break the guard", "Teeps to keep the distance"],
    keys: ["kicks", "power", "cardio", "footwork"], tech: ["bodyKick", "headKick", "legKick", "teep"], plan: "muaythai",
    t: { kick: 0.85, lowKick: 0.3, teep: 0.3, range: 0.15 },
  }),
  mat: D({
    id: "mat", kind: "strike", group: "Muay Thai", name: "Muay Mat (puncher)", from: "Muay Thai", arts: ["muaythai", "boxing"],
    desc: "The puncher: walks through the kicks with heavy hands, hooks to the body and the head, and a low kick to close the combination.",
    how: ["Heavy punches behind a tight guard", "Hooks to the body and the head", "A low kick to close every combination"],
    keys: ["boxing", "power", "chin", "aggression"], tech: ["liverShot", "checkHook", "legKick", "overhand"], plan: "pressure",
    t: { power: 0.55, body: 0.4, lowKick: 0.3, cage: 0.3 },
  }),
  sok: D({
    id: "sok", kind: "strike", group: "Muay Thai", name: "Muay Sok (elbow fighter)", from: "Muay Thai", arts: ["muaythai"],
    desc: "The elbow fighter: closes the distance and slices with elbows from every angle, in the pocket and the clinch. Opens cuts.",
    how: ["Elbows from every angle", "Cuts opponents open", "Lives in the pocket and the clinch"],
    keys: ["clinchStrikes", "aggression", "footwork", "strength"], tech: ["elbows", "plumKnees"], plan: "muaythai",
    t: { elbow: 0.95, clinch: 0.4, cage: 0.3 },
  }),
  bouk: D({
    id: "bouk", kind: "strike", group: "Muay Thai", name: "Muay Bouk (aggressor)", from: "Muay Thai", arts: ["muaythai"],
    desc: "The aggressor: marches forward, takes a shot to give one and drags the fight into a war against the fence and in the clinch.",
    how: ["Always walking forward", "Trades to land the heavier shot", "Knees and punches against the fence"],
    keys: ["aggression", "chin", "cardio", "power"], tech: ["plumKnees", "legKick", "overhand"], plan: "pressure",
    t: { cage: 0.7, power: 0.3, clinch: 0.3, volume: 0.2 },
  }),
  lak: D({
    id: "lak", kind: "strike", group: "Muay Thai", name: "Muay Lak (the wall)", from: "Muay Thai", arts: ["muaythai", "kickboxing"],
    desc: "The solid one: patient, balanced and hard to hurt. Takes the opponent's best, catches the kicks and sweeps, and fires back.",
    how: ["Patient and composed", "Catches kicks and sweeps the standing leg", "Counters after absorbing"],
    keys: ["chin", "composure", "counters", "toughness"], tech: ["checkKicks", "teep", "counterRight"], plan: "counter",
    t: { counter: 0.55, catch: 0.5, read: 0.35, teep: 0.2 },
  }),
  kyokushin: D({
    id: "kyokushin", kind: "strike", group: "Karate", name: "Kyokushin (full contact)", from: "Karate", arts: ["karate", "kickboxing"],
    desc: "Full-contact karate: hammering punches to the body, low kicks in close, and a body hardened to take the same back.",
    how: ["Punches to the body, round after round", "Low kicks in close", "Stands in the pocket and grinds"],
    keys: ["kicks", "boxing", "toughness", "cardio"], tech: ["liverShot", "legKick", "bodyKick"], plan: "kickboxer",
    t: { body: 0.65, lowKick: 0.45, cage: 0.3, volume: 0.25 },
  }),
  sanda: D({
    id: "sanda", kind: "strike", group: "Sanda", name: "Sanda (kick, catch, throw)", from: "Sanda", arts: ["kickboxing"],
    desc: "Chinese kickboxing: kicks and punches from range, catches the kick coming back and throws the kicker to the floor.",
    how: ["Kicks and punches from range", "Catches kicks and sweeps", "Throws from the clinch"],
    keys: ["kicks", "speed", "clinchControl", "takedowns"], tech: ["bodyKick", "judoThrow", "switchKick"], plan: "kickboxer",
    t: { catch: 0.8, kick: 0.3, throw: 0.4, range: 0.2 },
  }),

  // ---------- grappling ----------
  chain: D({
    id: "chain", kind: "grapple", group: "Wrestling", name: "Chain wrestler", from: "Collegiate wrestling", arts: ["wrestling", "mma"],
    desc: "Single into double into a trip: never stops chaining attempts until the takedown comes.",
    how: ["Chains shot after shot", "Rides and back takes on top", "A gas tank built for it"],
    keys: ["takedowns", "scrambles", "cardio", "topControl"], tech: ["singleLeg", "doubleLeg", "legRide", "backTake"], plan: "grinder",
    t: { chain: 0.85, back: 0.25 },
  }),
  blast: D({
    id: "blast", kind: "grapple", group: "Wrestling", name: "Power wrestler", from: "Freestyle wrestling", arts: ["wrestling", "sambo", "mma"],
    desc: "Explosive level changes from open space: the double leg that comes out of nowhere.",
    how: ["Explosive doubles from range", "Times the shot under the punches", "Heavy on top after"],
    keys: ["takedowns", "speed", "strength"], tech: ["doubleLeg", "sprawl"], plan: "wrestleboxer",
    t: { shot: 0.85, gnp: 0.2 },
  }),
  grinder: D({
    id: "grinder", kind: "grapple", group: "Wrestling", name: "Cage grinder", from: "Greco-Roman wrestling", arts: ["greco", "wrestling", "judo"],
    desc: "Pins opponents on the fence, wins the hand fight and drags them down: wins every minute.",
    how: ["Fence work and body locks", "Control time round after round", "Drains the gas tank"],
    keys: ["clinchControl", "strength", "cardio", "takedowns"], tech: ["bodyLock", "cageWrestling", "trip"], plan: "grinder",
    t: { fence: 0.85, cage: 0.4, pass: 0.15 },
  }),
  scrambler: D({
    id: "scrambler", kind: "grapple", group: "MMA", name: "Scrambler", from: "MMA", arts: ["mma", "wrestling", "bjj"],
    desc: "Never settles on the bottom: wins the scramble, takes the back or gets up.",
    how: ["Gets back up fast", "Wins scrambles", "Turns defence into back takes"],
    keys: ["scrambles", "bottomGame", "speed", "cardio"], tech: ["wallWalk", "backTake"], plan: "balanced",
    t: { scramble: 0.85, back: 0.3 },
  }),
  pounder: D({
    id: "pounder", kind: "grapple", group: "Wrestling", name: "Ground-and-pounder", from: "Wrestling", arts: ["wrestling", "sambo", "brawler"],
    desc: "Takes it down to hurt: posture, elbows and punches from the top until the referee steps in.",
    how: ["Heavy ground and pound", "Postures up in the guard", "Hunts the finish from on top"],
    keys: ["groundStrikes", "topControl", "power", "strength"], tech: ["gnp", "elbows"], plan: "wrestleboxer",
    t: { gnp: 0.9 },
  }),
  passer: D({
    id: "passer", kind: "grapple", group: "Sambo", name: "Pressure passer", from: "Sambo", arts: ["sambo", "bjj", "judo"],
    desc: "Heavy hips on top: passes the guard, smothers and finishes with arm-triangles and kimuras.",
    how: ["Passes the guard with pressure", "Smothers on top", "Arm-triangles and kimuras"],
    keys: ["topControl", "subs", "strength", "cardio"], tech: ["armTriangle", "kimura", "legRide"], plan: "grappler",
    t: { pass: 0.85, gnp: 0.2 },
  }),
  guard: D({
    id: "guard", kind: "grapple", group: "Brazilian jiu-jitsu", name: "Guard player", from: "Brazilian jiu-jitsu", arts: ["bjj"],
    desc: "Dangerous off the back: triangles, armbars and sweeps the moment the opponent gets careless.",
    how: ["Attacks from the bottom", "Triangles, armbars and sweeps", "Happy to fight off the back"],
    keys: ["bottomGame", "subs", "scrambles"], tech: ["triangle", "armbar", "guillotine"], plan: "submission",
    t: { guard: 0.9 },
  }),
  backTaker: D({
    id: "backTaker", kind: "grapple", group: "Brazilian jiu-jitsu", name: "Back-take specialist", from: "Brazilian jiu-jitsu", arts: ["bjj", "mma", "wrestling"],
    desc: "Every scramble ends the same way: hooks in, body triangle, an arm under the chin.",
    how: ["Takes the back in scrambles", "Body triangle and rear-naked choke", "Patient on top"],
    keys: ["scrambles", "subs", "topControl"], tech: ["backTake", "bodyTriangle", "rnc"], plan: "submission",
    t: { back: 0.9, scramble: 0.2 },
  }),
  legLocker: D({
    id: "legLocker", kind: "grapple", group: "Sambo", name: "Leg-locker", from: "Sambo", arts: ["sambo", "bjj"],
    desc: "Heel hooks and kneebars from scrambles and the guard: rare in MMA and very dangerous.",
    how: ["Dives on the legs", "Heel hooks from scrambles", "Risky: can give up position"],
    keys: ["subs", "scrambles", "bottomGame"], tech: ["heelHook"], plan: "submission",
    t: { legs: 1, guard: 0.3 },
  }),
  thrower: D({
    id: "thrower", kind: "grapple", group: "Judo", name: "Thrower", from: "Judo", arts: ["judo", "sambo", "greco"],
    desc: "Trips and hip tosses from the clinch that land straight in side control.",
    how: ["Throws from the clinch", "Lands in dominant positions", "Strong grips and balance"],
    keys: ["clinchControl", "strength", "takedowns"], tech: ["judoThrow", "trip"], plan: "grappler",
    t: { throw: 0.9, fence: 0.2 },
  }),
  sprawl: D({
    id: "sprawl", kind: "grapple", group: "Striking", name: "Sprawl-and-brawl", from: "Striking", arts: ["boxing", "kickboxing", "muaythai", "karate", "taekwondo", "brawler"],
    desc: "No interest in grappling: sprawls on the shot, stays off the fence and gets straight back up.",
    how: ["Sprawls on every shot", "Gets up fast", "Keeps the fight standing"],
    keys: ["tdd", "footwork", "strength", "scrambles"], tech: ["sprawl", "wallWalk"], plan: "balanced",
    t: { sprawl: 0.85 },
  }),
  rider: D({
    id: "rider", kind: "grapple", group: "Wrestling", name: "Top-control rider", from: "Wrestling", arts: ["wrestling", "sambo", "mma"],
    desc: "The Dagestani way: takes it down, rides the hips, mat-returns every escape and wears the opponent out on top until something gives.",
    how: ["Rides the hips and mat-returns every escape", "Smothering pressure on top", "Ground and pound to break the will"],
    keys: ["topControl", "takedowns", "strength", "cardio"], tech: ["legRide", "singleLeg", "gnp", "cageWrestling"], plan: "grinder",
    t: { pass: 0.55, chain: 0.4, gnp: 0.3, fence: 0.2 },
  }),
  wrestleBoxer: D({
    id: "wrestleBoxer", kind: "grapple", group: "Wrestling", name: "Wrestle-boxer", from: "Wrestling", arts: ["wrestling", "mma"],
    desc: "The threat of the takedown makes the hands work: level changes behind the punches, and nobody takes this fighter down either.",
    how: ["Shoots behind the punches", "Stuffs takedowns and stays up", "Chooses where the fight happens"],
    keys: ["takedowns", "tdd", "boxing", "speed"], tech: ["doubleLeg", "sprawl", "overhand"], plan: "wrestleboxer",
    t: { shot: 0.45, sprawl: 0.45, chain: 0.2 },
  }),
  clincher: D({
    id: "clincher", kind: "grapple", group: "Wrestling", name: "Dirty boxer (clinch)", from: "Greco-Roman wrestling", arts: ["greco", "wrestling"],
    desc: "Ties up, pins the opponent on the fence and punches, elbows and knees from the underhooks: the clinch as a weapon, not a rest.",
    how: ["Underhooks and the fence", "Short punches, elbows and knees inside", "Trips when the opponent pushes back"],
    keys: ["clinchControl", "clinchStrikes", "strength", "cardio"], tech: ["cageWrestling", "elbows", "trip"], plan: "grinder",
    t: { fence: 0.55, clinch: 0.45, elbow: 0.2 },
  }),
  catchWrestler: D({
    id: "catchWrestler", kind: "grapple", group: "Wrestling", name: "Catch wrestler", from: "Catch wrestling", arts: ["wrestling", "sambo"],
    desc: "Catch-as-catch-can: wrestles to the top, then hunts the neck and the legs from there: cranks, kimuras and heel hooks.",
    how: ["Wrestles to the top", "Kimuras and cranks from on top", "Heel hooks when the legs come up"],
    keys: ["subs", "topControl", "takedowns", "strength"], tech: ["kimura", "heelHook", "singleLeg"], plan: "grappler",
    t: { pass: 0.45, legs: 0.45, chain: 0.25 },
  }),
  subHunter: D({
    id: "subHunter", kind: "grapple", group: "Brazilian jiu-jitsu", name: "Submission hunter", from: "Brazilian jiu-jitsu", arts: ["bjj", "mma", "judo"],
    desc: "Attacks a submission from everywhere: off the back, from the top, in the scramble. Gives up position to get the tap.",
    how: ["A submission attempt in every exchange", "Guillotines, chokes and arm locks from anywhere", "Scrambles into the back"],
    keys: ["subs", "scrambles", "bottomGame", "aggression"], tech: ["guillotine", "rnc", "armbar", "triangle"], plan: "submission",
    t: { guard: 0.5, back: 0.45, scramble: 0.35, pass: 0.2 },
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
