// Fight plans, built like a tactic in a football management game: a style to
// start from and a dozen instructions the corner can change between rounds.

import type { Attrs } from "../model/types";
import { groupScore, styleOf } from "../model/attributes";
import { clamp } from "../core/util";

export type PlanStyle =
  | "balanced"
  | "boxer"
  | "pressure"
  | "counter"
  | "outfighter"
  | "kickboxer"
  | "muaythai"
  | "brawler"
  | "wrestleboxer"
  | "grinder"
  | "grappler"
  | "submission";

/** "mix" spreads the attacks so the opponent can't settle; "opening" goes wherever the defence isn't. */
export type Target = "head" | "balanced" | "body" | "legs" | "mix" | "opening";
export type TopMode = "gnp" | "balanced" | "control" | "subs";
export type BottomMode = "getup" | "balanced" | "guard";
export type DefMode = "normal" | "tdd" | "guard" | "move";

export interface FightPlan {
  style: PlanStyle;
  /** -2 slow and patient .. 2 relentless pace. */
  tempo: number;
  /** -2 safe volume .. 2 big power shots, taking risks. */
  risk: number;
  /** -2 long range .. 2 in the pocket. */
  range: number;
  /** -2 hands only .. 2 kick-heavy. */
  kicks: number;
  target: Target;
  /** -2 lead and press .. 2 wait and counter. */
  counter: number;
  /** 0 never .. 4 relentless. */
  takedowns: number;
  /** -2 avoid the clinch .. 2 seek it. */
  clinch: number;
  cage: boolean;
  top: TopMode;
  bottom: BottomMode;
  finish: boolean;
  defense: DefMode;
  /** Corner shouts only: lead with the jab, and lift the shin on the kicks. */
  jab?: boolean;
  checkLegs?: boolean;
}

export const STYLE_NAMES: Record<PlanStyle, string> = {
  balanced: "Balanced",
  boxer: "Boxer",
  pressure: "Pressure fighter",
  counter: "Counter-striker",
  outfighter: "Out-fighter",
  kickboxer: "Kickboxer",
  muaythai: "Muay Thai",
  brawler: "Brawler",
  wrestleboxer: "Wrestle-boxer",
  grinder: "Grinder",
  grappler: "Grappler",
  submission: "Submission hunter",
};

export const STYLE_DESC: Record<PlanStyle, string> = {
  balanced: "Take what the fight gives: strike, mix in takedowns, adapt.",
  boxer: "Jab, move the head and win the pocket with the hands.",
  pressure: "Walk them down, cut off the cage and never let them breathe.",
  counter: "Let them come, make them miss and punish every entry.",
  outfighter: "Stay long, move, score and get out before they can answer.",
  kickboxer: "Long combinations finished with kicks to every level.",
  muaythai: "Chop the legs, kick the body and knee them in the clinch.",
  brawler: "Every punch thrown to end it. High risk, high reward.",
  wrestleboxer: "Strike to set up the shot, shoot to set up the strikes.",
  grinder: "Fence, clinch, take down, hold down. Win every minute.",
  grappler: "Get it to the floor and advance: pass, mount, back.",
  submission: "Hunt the neck and the limbs from anywhere.",
};

const BASE: FightPlan = {
  style: "balanced", tempo: 0, risk: 0, range: 0, kicks: 0, target: "balanced", counter: 0,
  takedowns: 2, clinch: 0, cage: false, top: "balanced", bottom: "balanced", finish: true, defense: "normal",
};

export const PRESETS: Record<PlanStyle, FightPlan> = {
  balanced: { ...BASE },
  boxer: { ...BASE, style: "boxer", range: 0, kicks: -2, counter: 0, takedowns: 0, clinch: -1, bottom: "getup", defense: "tdd" },
  pressure: { ...BASE, style: "pressure", tempo: 2, risk: 1, range: 1, kicks: -1, counter: -2, takedowns: 1, cage: true, bottom: "getup" },
  counter: { ...BASE, style: "counter", tempo: -1, risk: 0, range: -1, kicks: 0, counter: 2, takedowns: 1, clinch: -1, defense: "move", bottom: "getup" },
  outfighter: { ...BASE, style: "outfighter", tempo: 0, risk: -1, range: -2, kicks: 1, counter: 1, takedowns: 0, clinch: -2, defense: "move", bottom: "getup" },
  kickboxer: { ...BASE, style: "kickboxer", tempo: 1, range: -1, kicks: 2, target: "balanced", takedowns: 0, clinch: -1, defense: "tdd", bottom: "getup" },
  muaythai: { ...BASE, style: "muaythai", tempo: 1, risk: 1, range: 0, kicks: 2, target: "legs", takedowns: 0, clinch: 1, bottom: "getup", defense: "tdd" },
  brawler: { ...BASE, style: "brawler", tempo: 1, risk: 2, range: 2, kicks: -1, target: "head", counter: -1, takedowns: 0, clinch: 0, bottom: "getup" },
  wrestleboxer: { ...BASE, style: "wrestleboxer", tempo: 1, range: 0, kicks: -1, takedowns: 3, clinch: 1, cage: true, top: "gnp" },
  grinder: { ...BASE, style: "grinder", tempo: 1, risk: -1, range: 1, kicks: -2, takedowns: 4, clinch: 2, cage: true, top: "control" },
  grappler: { ...BASE, style: "grappler", tempo: 0, risk: -1, range: 0, kicks: -1, takedowns: 3, clinch: 1, top: "balanced", bottom: "guard" },
  submission: { ...BASE, style: "submission", tempo: 0, risk: 0, kicks: -1, takedowns: 3, clinch: 1, top: "subs", bottom: "guard" },
};

export function preset(style: PlanStyle): FightPlan {
  return { ...PRESETS[style] };
}

export const TAKEDOWN_TEXT = ["Never", "Rarely", "When open", "Often", "Relentless"];
export const SCALE_TEXT: Record<string, string[]> = {
  tempo: ["Very patient", "Patient", "Normal", "High", "Relentless"],
  risk: ["Very safe", "Safe", "Normal", "Power shots", "All-in"],
  range: ["Long range", "Outside", "Mixed", "Close", "In the pocket"],
  kicks: ["Hands only", "Mostly hands", "Mixed", "Kick often", "Kick-heavy"],
  counter: ["Lead always", "Lead", "Mixed", "Counter", "Counter only"],
  clinch: ["Avoid", "Break fast", "Neutral", "Welcome", "Seek it"],
};
export const TARGET_TEXT: Record<Target, string> = { head: "Head hunting", balanced: "All levels", body: "Body work", legs: "Attack the legs", mix: "Mix it up", opening: "Find the opening" };
export const TARGET_DESC: Record<Target, string> = {
  head: "Everything upstairs: the knockout, but easier to read.",
  balanced: "Take what is there.",
  body: "Drain the gas tank and bring the hands down.",
  legs: "Chop the legs: slows them down and takes the movement away.",
  mix: "Head, body and legs in turn: the defence can't settle on one.",
  opening: "Read the defence and hit what it leaves open.",
};
export const TOP_TEXT: Record<TopMode, string> = { gnp: "Ground and pound", balanced: "Balanced", control: "Hold position", subs: "Hunt submissions" };
export const BOTTOM_TEXT: Record<BottomMode, string> = { getup: "Get up at once", balanced: "Balanced", guard: "Work the guard" };
export const DEF_TEXT: Record<DefMode, string> = { normal: "Normal", tdd: "Stop the takedown", guard: "High guard", move: "Move and angle off" };

export function planName(p: FightPlan): string {
  return STYLE_NAMES[p.style];
}

export function samePlan(a: FightPlan, b: FightPlan): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The plan a fighter's own camp would pick against this opponent. */
export function suggestPlan(me: Attrs, opp: Attrs, reachDiff: number): FightPlan {
  const myS = groupScore(me, "striking");
  const myG = groupScore(me, "grappling");
  const opS = groupScore(opp, "striking");
  const opG = groupScore(opp, "grappling");
  const myWrest = (me.takedowns + me.clinchControl + me.topControl) / 3;
  const opTdd = opp.tdd;
  const tag = styleOf(me);
  let style: PlanStyle;
  switch (tag) {
    case "Boxer": style = "boxer"; break;
    case "Kickboxer": style = "kickboxer"; break;
    case "Muay Thai": style = "muaythai"; break;
    case "Pressure striker": style = "pressure"; break;
    case "Counter striker": style = "counter"; break;
    case "Brawler": style = "brawler"; break;
    case "Wrestle-boxer": style = "wrestleboxer"; break;
    case "Wrestler": style = "grinder"; break;
    case "Grappler": style = "grappler"; break;
    case "Submission specialist": style = "submission"; break;
    default: style = "balanced";
  }
  const p = preset(style);
  // Matchup adjustments, as a camp would make them.
  const grapplingEdge = myWrest - opTdd;
  const strikingEdge = myS - opS;
  if (grapplingEdge > 2 && strikingEdge < 1) p.takedowns = clamp(p.takedowns + 1, 0, 4);
  if (grapplingEdge < -2.5 && p.takedowns > 1) p.takedowns -= 1;
  if (strikingEdge < -2 && myG > opG + 1.5) p.takedowns = clamp(p.takedowns + 1, 0, 4);
  if (opG > myG + 2) {
    p.defense = "tdd";
    p.bottom = me.bottomGame > 13 ? "balanced" : "getup";
    if (p.clinch > -1) p.clinch -= 1;
  }
  if (reachDiff >= 3 && p.range > -1 && myS >= opS - 1) p.range -= 1;
  if (reachDiff <= -3 && p.range < 2) p.range += 1;
  if (opp.power > 15 && opp.boxing > 14) p.defense = p.defense === "tdd" ? "tdd" : "guard";
  if (opp.cardio < 10 && me.cardio > 13) p.tempo = clamp(p.tempo + 1, -2, 2);
  if (me.cardio < 10) p.tempo = clamp(p.tempo - 1, -2, 2);
  if (opp.chin < 10 && me.power > 13) p.risk = clamp(p.risk + 1, -2, 2);
  if (opp.kicks > 15 && opp.boxing < 12) p.range = clamp(p.range + 1, -2, 2);
  // Go after the weak spot, as a camp would after watching the film.
  if (p.target === "balanced") {
    if (me.kicks >= 13 && opp.toughness < 11 && opp.footwork < 13) p.target = "legs";
    else if (opp.cardio < 10 && (me.boxing >= 12 || me.kicks >= 13)) p.target = "body";
    else if (opp.chin < 9 && me.power >= 13) p.target = "head";
    else if (me.fightIQ >= 15) p.target = "opening";
  }
  if (me.subs > 15 && myG > opG) p.top = "subs";
  else if (me.groundStrikes > 15) p.top = "gnp";
  return p;
}

/** The engine's view of a plan. */
export interface Dials {
  tempo: number;
  risk: number;
  rangePref: number; // -1 long .. 1 close
  kickShare: number;
  targetHead: number;
  targetBody: number;
  targetLegs: number;
  counter: number; // 0..1
  tdRate: number;
  clinchRate: number;
  cage: number;
  topGnp: number;
  topPass: number;
  topSub: number;
  topHold: number;
  botUp: number;
  botSub: number;
  botSweep: number;
  finish: boolean;
  defTdd: number;
  defGuard: number;
  defMove: number;
  /** Spread the attacks so the defence can't settle. */
  mix: boolean;
  /** Hit whatever the defence leaves open. */
  exploit: boolean;
  jab: boolean;
  checkLegs: boolean;
}

const TD_RATE = [0, 0.13, 0.4, 0.78, 1.25];

export function dialsOf(p: FightPlan): Dials {
  const target = p.target;
  return {
    tempo: 1 + 0.13 * p.tempo,
    risk: p.risk,
    rangePref: p.range / 2,
    kickShare: clamp(0.27 + 0.11 * p.kicks, 0.03, 0.55),
    targetHead: target === "head" ? 1.35 : target === "balanced" || target === "opening" ? 1 : target === "mix" ? 0.86 : 0.85,
    targetBody: target === "body" ? 2.0 : target === "balanced" || target === "opening" ? 1 : target === "mix" ? 1.3 : 0.8,
    targetLegs: target === "legs" ? 2.1 : target === "balanced" || target === "opening" ? 1 : target === "mix" ? 1.35 : 0.7,
    counter: clamp(0.5 + p.counter * 0.22, 0.05, 0.95),
    tdRate: TD_RATE[clamp(Math.round(p.takedowns), 0, 4)],
    clinchRate: clamp(0.5 + 0.3 * p.clinch, 0.05, 1.3),
    cage: p.cage ? 1 : 0,
    topGnp: p.top === "gnp" ? 1.7 : p.top === "subs" ? 0.7 : p.top === "control" ? 0.8 : 1,
    topPass: p.top === "control" ? 0.8 : p.top === "subs" ? 1.3 : 1,
    topSub: p.top === "subs" ? 2.4 : p.top === "gnp" ? 0.6 : p.top === "control" ? 0.4 : 1,
    topHold: p.top === "control" ? 2.2 : p.top === "gnp" ? 0.7 : 1,
    botUp: p.bottom === "getup" ? 1.8 : p.bottom === "guard" ? 0.45 : 1,
    botSub: p.bottom === "guard" ? 2.2 : p.bottom === "getup" ? 0.4 : 1,
    botSweep: p.bottom === "guard" ? 1.5 : 1,
    finish: p.finish,
    defTdd: p.defense === "tdd" ? 1 : 0,
    defGuard: p.defense === "guard" ? 1 : 0,
    defMove: p.defense === "move" ? 1 : 0,
    mix: target === "mix",
    exploit: target === "opening",
    jab: !!p.jab,
    checkLegs: !!p.checkLegs,
  };
}

/** Corner shouts: instructions for the rest of the round, one from each group. */
export type Shout =
  | "push" | "calm"
  | "head" | "body" | "legs" | "mix" | "opening"
  | "jab" | "pressure" | "circle" | "counter" | "clinch"
  | "takedown" | "stand" | "getup" | "control" | "gnp" | "subs"
  | "power" | "finish" | "defend" | "check";

export type ShoutGroup = "pace" | "target" | "range" | "ground" | "risk";

export const SHOUT_GROUPS: { id: ShoutGroup; label: string }[] = [
  { id: "pace", label: "Pace" },
  { id: "target", label: "Target" },
  { id: "range", label: "Range" },
  { id: "ground", label: "Grappling" },
  { id: "risk", label: "Risk and defence" },
];

export const SHOUTS: { id: Shout; group: ShoutGroup; label: string; desc: string }[] = [
  { id: "push", group: "pace", label: "Push the pace!", desc: "More output and pressure for the rest of the round. Costs gas." },
  { id: "calm", group: "pace", label: "Slow down, breathe", desc: "Lower the pace, pick the shots, save the gas tank." },
  { id: "head", group: "target", label: "Head hunting", desc: "Everything upstairs: looking for the knockout." },
  { id: "body", group: "target", label: "Go to the body", desc: "Body shots drain the gas tank and bring the hands down." },
  { id: "legs", group: "target", label: "Chop the legs", desc: "Low kicks: slow them down and take the movement away." },
  { id: "mix", group: "target", label: "Mix it up", desc: "Head, body, legs in turn: the defence can't settle on one." },
  { id: "opening", group: "target", label: "Find the opening", desc: "Read the defence and hit whatever it leaves open." },
  { id: "jab", group: "range", label: "Use the jab, stay long", desc: "Long range, jab first, take no risks." },
  { id: "pressure", group: "range", label: "Walk him down", desc: "Close the distance, cut off the cage, pin him on the fence." },
  { id: "circle", group: "range", label: "Circle off the fence", desc: "Move, take angles, don't get pinned." },
  { id: "counter", group: "range", label: "Make him miss, counter", desc: "Let him lead and punish the misses." },
  { id: "clinch", group: "range", label: "Tie him up", desc: "Clinch to slow the fight down or to recover." },
  { id: "takedown", group: "ground", label: "Take him down!", desc: "Shoot often." },
  { id: "stand", group: "ground", label: "Keep it standing", desc: "No shooting: defend the takedown and get up." },
  { id: "getup", group: "ground", label: "Get up now!", desc: "Off the back at once, whatever it costs." },
  { id: "control", group: "ground", label: "Hold him down", desc: "On top: keep the position and bank the round." },
  { id: "gnp", group: "ground", label: "Ground and pound", desc: "On top: posture up and punish." },
  { id: "subs", group: "ground", label: "Hunt the submission", desc: "Attack the neck and the arms from anywhere." },
  { id: "power", group: "risk", label: "Load up", desc: "Power shots: more damage, less accuracy." },
  { id: "finish", group: "risk", label: "Finish it!", desc: "All-in to end it now." },
  { id: "defend", group: "risk", label: "Hands up, survive", desc: "Defence first: high guard, safe shots." },
  { id: "check", group: "risk", label: "Check the kicks", desc: "Lift the shin: leg kicks hurt the kicker. Leaves a little less upstairs." },
];

export const SHOUT_BY_ID = Object.fromEntries(SHOUTS.map((s) => [s.id, s])) as Record<Shout, (typeof SHOUTS)[number]>;

export function applyShout(p: FightPlan, s: Shout): FightPlan {
  const q = { ...p };
  switch (s) {
    case "push": q.tempo = clamp(q.tempo + 2, -2, 2); q.counter = clamp(q.counter - 1, -2, 2); break;
    case "calm": q.tempo = clamp(q.tempo - 2, -2, 2); q.risk = clamp(q.risk - 1, -2, 2); break;
    case "head": q.target = "head"; break;
    case "body": q.target = "body"; break;
    case "legs": q.target = "legs"; q.kicks = clamp(q.kicks + 1, -2, 2); break;
    case "mix": q.target = "mix"; break;
    case "opening": q.target = "opening"; break;
    case "jab": q.range = -2; q.risk = clamp(q.risk - 1, -2, 2); q.jab = true; q.clinch = Math.min(q.clinch, -1); break;
    case "pressure": q.range = clamp(q.range + 1, -2, 2); q.cage = true; q.tempo = clamp(q.tempo + 1, -2, 2); q.counter = clamp(q.counter - 1, -2, 2); break;
    case "circle": q.defense = "move"; q.range = clamp(q.range - 1, -2, 2); q.cage = false; break;
    case "counter": q.counter = 2; q.tempo = clamp(q.tempo - 1, -2, 2); break;
    case "clinch": q.clinch = 2; break;
    case "takedown": q.takedowns = 4; break;
    case "stand": q.takedowns = 0; q.bottom = "getup"; q.defense = "tdd"; break;
    case "getup": q.bottom = "getup"; break;
    case "control": q.top = "control"; break;
    case "gnp": q.top = "gnp"; break;
    case "subs": q.top = "subs"; q.bottom = "guard"; break;
    case "power": q.risk = 2; break;
    case "finish": q.risk = 2; q.tempo = 2; q.finish = true; q.counter = -2; break;
    case "defend": q.defense = "guard"; q.risk = -2; q.tempo = clamp(q.tempo - 1, -2, 2); q.clinch = 1; break;
    case "check": q.checkLegs = true; break;
  }
  return q;
}

/** Every active shout on top of the plan, in group order. */
export function applyShouts(p: FightPlan, shouts: Partial<Record<ShoutGroup, Shout>>): FightPlan {
  let q = p;
  for (const g of SHOUT_GROUPS) {
    const sh = shouts[g.id];
    if (sh) q = applyShout(q, sh);
  }
  return q;
}
