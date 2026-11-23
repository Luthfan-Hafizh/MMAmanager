// Signature techniques. Mastery runs 0 (does not know it) to 3 (second nature).
// The engine reads them: a technique raises how often a move is chosen and how
// well it works, and a few moves can only be thrown by fighters who know them.

import type { AttrKey } from "../model/attributes";

export type TechId =
  | "jab"
  | "counterRight"
  | "checkHook"
  | "uppercut"
  | "overhand"
  | "liverShot"
  | "superman"
  | "spinningBackfist"
  | "legKick"
  | "calfKick"
  | "bodyKick"
  | "headKick"
  | "switchKick"
  | "questionMark"
  | "spinningBackKick"
  | "teep"
  | "flyingKnee"
  | "checkKicks"
  | "plumKnees"
  | "elbows"
  | "doubleLeg"
  | "singleLeg"
  | "bodyLock"
  | "trip"
  | "judoThrow"
  | "sprawl"
  | "cageWrestling"
  | "wallWalk"
  | "gnp"
  | "legRide"
  | "backTake"
  | "bodyTriangle"
  | "rnc"
  | "guillotine"
  | "darce"
  | "armTriangle"
  | "triangle"
  | "armbar"
  | "kimura"
  | "heelHook";

export type TechGroup = "Boxing" | "Kicks" | "Clinch" | "Wrestling" | "Top game" | "Submissions" | "Defence";

export interface TechDef {
  id: TechId;
  name: string;
  group: TechGroup;
  /** Attributes that make it work, and the minimum average for each mastery level to count. */
  uses: AttrKey[];
  /** Weeks of focused drilling for one level (scaled by talent). */
  weeks: number;
  /** Only fighters who know it throw it. */
  exclusive?: boolean;
  desc: string;
}

const T = (id: TechId, name: string, group: TechGroup, uses: AttrKey[], weeks: number, desc: string, exclusive = false): TechDef => ({
  id, name, group, uses, weeks, desc, exclusive,
});

export const TECHNIQUES: Record<TechId, TechDef> = {
  jab: T("jab", "Educated jab", "Boxing", ["boxing", "speed"], 4, "A jab that measures, scores and sets up everything behind it."),
  counterRight: T("counterRight", "Counter right hand", "Boxing", ["counters", "boxing"], 6, "Slip and fire the right hand over the top as they come in."),
  checkHook: T("checkHook", "Check hook", "Boxing", ["counters", "footwork"], 6, "Pivot out and hook an opponent who rushes in."),
  uppercut: T("uppercut", "Uppercut", "Boxing", ["boxing", "power"], 5, "Splits a high guard and punishes level changes."),
  overhand: T("overhand", "Overhand right", "Boxing", ["power", "aggression"], 4, "Looping, wild, and the most common knockout punch in MMA."),
  liverShot: T("liverShot", "Liver shot", "Boxing", ["boxing", "power"], 6, "A left hook to the body that folds people."),
  superman: T("superman", "Superman punch", "Boxing", ["speed", "kicks"], 6, "Fake the kick, fly in with the punch.", true),
  spinningBackfist: T("spinningBackfist", "Spinning backfist", "Boxing", ["speed", "power"], 7, "High risk, high reward, out of nowhere.", true),
  legKick: T("legKick", "Low kick", "Kicks", ["kicks", "power"], 4, "The thigh kick that slows a fighter down round by round."),
  calfKick: T("calfKick", "Calf kick", "Kicks", ["kicks", "speed"], 5, "The modern leg kick: quick, low, and it takes the stance away."),
  bodyKick: T("bodyKick", "Body kick", "Kicks", ["kicks", "power"], 5, "A round kick to the ribs that drains the gas tank."),
  headKick: T("headKick", "Head kick", "Kicks", ["kicks", "speed"], 7, "The highlight finish. Hard to land, devastating when it does."),
  switchKick: T("switchKick", "Switch kick", "Kicks", ["kicks", "footwork"], 6, "A quick switch of the feet to kick hard with the lead leg."),
  questionMark: T("questionMark", "Question mark kick", "Kicks", ["kicks", "fightIQ"], 8, "Looks like a body kick, lands on the head.", true),
  spinningBackKick: T("spinningBackKick", "Spinning back kick", "Kicks", ["kicks", "speed"], 8, "To the body or the head, when they least expect it.", true),
  teep: T("teep", "Teep", "Kicks", ["kicks", "footwork"], 4, "The push kick: keeps pressure fighters at the end of the leg.", true),
  flyingKnee: T("flyingKnee", "Flying knee", "Kicks", ["speed", "clinchStrikes"], 8, "Against a level change or a backing-up opponent.", true),
  checkKicks: T("checkKicks", "Checking kicks", "Defence", ["strikeDef", "footwork"], 5, "Lift the shin: leg kicks hurt the kicker instead."),
  plumKnees: T("plumKnees", "Plum and knees", "Clinch", ["clinchStrikes", "clinchControl"], 6, "Muay Thai neck clinch and knees to the head and body."),
  elbows: T("elbows", "Elbows", "Clinch", ["clinchStrikes", "groundStrikes"], 5, "Short, sharp and they cut."),
  doubleLeg: T("doubleLeg", "Double leg", "Wrestling", ["takedowns", "speed"], 5, "The power double: change levels, drive through."),
  singleLeg: T("singleLeg", "Single leg", "Wrestling", ["takedowns", "scrambles"], 5, "Chain the single, run the pipe, finish on the fence."),
  bodyLock: T("bodyLock", "Body lock takedown", "Wrestling", ["clinchControl", "strength"], 5, "Lock the hands, mat return, trip on the fence."),
  trip: T("trip", "Trips and sweeps", "Wrestling", ["clinchControl", "takedowns"], 5, "Outside and inside trips from the clinch."),
  judoThrow: T("judoThrow", "Judo throws", "Wrestling", ["clinchControl", "strength"], 7, "Hip tosses and harai goshi straight to side control."),
  sprawl: T("sprawl", "Sprawl", "Defence", ["tdd", "speed"], 4, "Hips back, heavy, and make them pay for shooting."),
  cageWrestling: T("cageWrestling", "Cage wrestling", "Wrestling", ["clinchControl", "takedowns"], 6, "Pin them on the fence, wear them down, take them down."),
  wallWalk: T("wallWalk", "Wall walk", "Defence", ["bottomGame", "scrambles"], 5, "Back to the fence, feet under, and back up."),
  gnp: T("gnp", "Ground and pound", "Top game", ["groundStrikes", "topControl"], 5, "Posture up and punish from on top."),
  legRide: T("legRide", "Leg rides", "Top game", ["topControl", "strength"], 6, "Ride with the legs in, flatten them out, take the back."),
  backTake: T("backTake", "Back takes", "Top game", ["scrambles", "topControl"], 6, "Take the back in a scramble and stay there."),
  bodyTriangle: T("bodyTriangle", "Body triangle", "Top game", ["topControl", "subs"], 6, "Lock the legs, there is no escaping the back."),
  rnc: T("rnc", "Rear-naked choke", "Submissions", ["subs", "topControl"], 5, "The most common submission in MMA."),
  guillotine: T("guillotine", "Guillotine", "Submissions", ["subs", "strength"], 5, "Punishes every lazy shot."),
  darce: T("darce", "D'Arce and anaconda", "Submissions", ["subs", "strength"], 7, "Arm-in chokes from the front headlock.", true),
  armTriangle: T("armTriangle", "Arm-triangle choke", "Submissions", ["subs", "topControl"], 6, "Head and arm from half guard or side control."),
  triangle: T("triangle", "Triangle choke", "Submissions", ["subs", "bottomGame"], 6, "Off the back, legs locked around head and arm."),
  armbar: T("armbar", "Armbar", "Submissions", ["subs", "scrambles"], 6, "From mount, the guard or a scramble."),
  kimura: T("kimura", "Kimura", "Submissions", ["subs", "strength"], 6, "Shoulder lock from everywhere, and a great control grip."),
  heelHook: T("heelHook", "Heel hook", "Submissions", ["subs", "scrambles"], 8, "Leg locks: fast, dangerous and rare in MMA.", true),
};

export const TECH_IDS = Object.keys(TECHNIQUES) as TechId[];

export const MASTERY_NAMES = ["Unknown", "Working", "Sharp", "Second nature"];

export const SUB_NAMES: Record<string, string> = {
  rnc: "rear-naked choke",
  guillotine: "guillotine choke",
  darce: "d'Arce choke",
  anaconda: "anaconda choke",
  armTriangle: "arm-triangle choke",
  triangle: "triangle choke",
  armbar: "armbar",
  kimura: "kimura",
  heelHook: "heel hook",
  kneebar: "kneebar",
  neckCrank: "neck crank",
  americana: "americana",
};
