// The fight engine. A fight is played exchange by exchange: on the feet at range
// or against the fence, in the clinch, and on the ground position by position.
// Damage is kept for the head, body and legs; stamina drains with work and body
// shots; knockdowns, referee stoppages, submissions and cuts end fights; three
// judges score every round on the ten-point must system.
//
// Two random streams: `rng` decides everything that happens, `crng` only picks
// commentary wording, so the text never changes a result.

import { Rng } from "../core/rng";
import { clamp } from "../core/util";
import type { AttrKey } from "../model/attributes";
import { ATTRS } from "../model/attributes";
import type { BoutResult, Fighter, FightLogLine, Method, RoundStat } from "../model/types";
import { DIVISIONS, type DivisionId } from "../data/divisions";
import type { TechId } from "../data/techniques";
import { SUB_NAMES } from "../data/techniques";
import { applyShouts, dialsOf, suggestPlan, SHOUT_BY_ID, type Dials, type FightPlan, type Shout, type ShoutGroup } from "./plan";
import { traitsOf } from "../world/fightstyle";
import type { Traits } from "../data/fightstyles";
import { CLINCH_STRIKES, GROUND_STRIKES, STRIKE_LIST, STRIKES, type StrikeDef, type StrikeId, type Zone } from "./strikes";

export interface Condition {
  rust: number; // 0..1, ring rust
  cut: number; // 0..1, weight cut drain
  injury: number; // 0..1, carried into the fight
  prep: number; // -1..1, camp preparation
  home: boolean;
  shortNotice: boolean;
  /** Days' notice for a fighter who stepped in. */
  notice?: number;
  /** The size gap on the night, -1..1, when someone fights outside their division. */
  size?: number;
  /** Where an injury a fighter carries into the fight is: it hurts what that part does. */
  injuryArea?: string;
}

/** How a short camp tells: 1 with a day's notice, 0 with three weeks. */
const snHurt = (days?: number) => 1 - clamp(days ?? 21, 0, 21) / 21;

export interface FightInput {
  a: Fighter;
  b: Fighter;
  planA?: FightPlan;
  planB?: FightPlan;
  condA?: Partial<Condition>;
  condB?: Partial<Condition>;
  rounds: number;
  roundSec: number;
  div: DivisionId;
  title?: boolean;
  seed: number;
  log?: boolean;
  /** 0 amateur .. 5 the UFC: lower levels are sloppier and finish more. */
  tier?: number;
  /** AI corners adjust plans between rounds. Off for a side the player corners. */
  aiCorner?: [boolean, boolean];
}

type Pos = "dist" | "clinch" | "ground";
export type GPos = "guard" | "half" | "side" | "mount" | "back";
type Range = 0 | 1 | 2; // long, mid, close

export const GPOS_NAME: Record<GPos, string> = {
  guard: "full guard",
  half: "half guard",
  side: "side control",
  mount: "full mount",
  back: "back control",
};

export interface Side {
  f: Fighter;
  i: 0 | 1;
  name: string;
  n: Record<AttrKey, number>;
  plan: FightPlan;
  base: FightPlan;
  d: Dials;
  /** The corner's shouts this round, one from each group. */
  shouts: Partial<Record<ShoutGroup, Shout>>;
  /** What the fighter's styles add up to, scaled by mastery. */
  tr: Traits;
  /** Where the fighter is guarding: head, body, legs, adding up to 1. It follows what they get hit with. */
  read: [number, number, number];
  /** Things the commentary has already pointed out. */
  noted: Record<string, boolean>;
  /** A call acted on this instant: the fighter does it in the next exchange. */
  now?: Shout | null;
  sta: number;
  cap: number;
  head: number;
  body: number;
  legs: number;
  stun: number;
  cut: number;
  kd: number;
  cond: Condition;
  chinRes: number;
  rs: RoundStat[];
  imp: number[]; // judging: effective striking
  gimp: number[]; // judging: effective grappling
  agg: number[];
  ctl: number[];
  dmgDealt: number[];
  unanswered: number;
  lastLanded: number;
  wobbled: number;
  night: number;
  /** Average attribute level, so choices follow a fighter's own strengths at any level. */
  lvl: number;
  /** Fouls committed this fight, and points taken away by round. */
  fouls: number;
  ded: number[];
  /** Seconds left seeing badly after an eye poke. */
  poked: number;
}

/** Where a fighter guards on average: measured over thousands of fights, so a normal fight is neutral. */
export const BASE_READ: [number, number, number] = [0.752, 0.139, 0.109];
const ZI: Record<Zone, 0 | 1 | 2> = { head: 0, body: 1, leg: 2 };
export const ZONE_WORD = ["head", "body", "legs"] as const;

interface Hit {
  name: string;
  zone: Zone;
  landed: boolean;
  /** Landed: how hard ("", "glancing", "hard", "clean"). Missed: why ("slipped", "blocked", "checked", "short", "parried", "missed"). */
  how: string;
}

const NUM = ["no", "one", "two", "three", "four", "five", "six"];
const MISS_TEXT: Record<string, string> = {
  slipped: "is slipped", blocked: "is blocked", parried: "is parried", short: "falls short", checked: "is checked", evaded: "misses", missed: "misses",
};
const FLASHY = new Set(["headKick", "spinKick", "questionMark", "spinFist"]);

function plural(name: string): string {
  const i = name.indexOf(" to the ");
  if (i > 0) return plural(name.slice(0, i)) + name.slice(i);
  return /(ch|sh|s)$/.test(name) ? `${name}es` : `${name}s`;
}
function article(phrase: string): string {
  return /^[aeiou]/i.test(phrase) ? `an ${phrase}` : `a ${phrase}`;
}
/** "a jab, two right hands and a leg kick" */
function listOf(names: string[]): string {
  const counts: [string, number][] = [];
  for (const n of names) {
    const c = counts.find((x) => x[0] === n);
    if (c) c[1]++;
    else counts.push([n, 1]);
  }
  const parts = counts.map(([n, c]) => (c === 1 ? article(n) : `${NUM[c] ?? c} ${plural(n)}`));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
/** "the jab and one of the leg kicks" */
function landedOf(hits: Hit[]): string {
  const groups: { name: string; c: number; k: number }[] = [];
  for (const h of hits) {
    let g = groups.find((x) => x.name === h.name);
    if (!g) groups.push((g = { name: h.name, c: 0, k: 0 }));
    g.c++;
    if (h.landed) g.k++;
  }
  const parts = groups.filter((g) => g.k > 0).map((g) =>
    g.c === 1 ? `the ${g.name}` : g.k === g.c ? (g.c === 2 ? `both ${plural(g.name)}` : `all ${NUM[g.c]} ${plural(g.name)}`) : `${g.k === 1 ? "one" : NUM[g.k]} of the ${plural(g.name)}`,
  );
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The counted statistics, without the end-of-round condition. */
type StatKey = Exclude<keyof RoundStat, "hd" | "bd" | "lg" | "st" | "gd">;

const blankRound = (): RoundStat => ({
  sigL: 0, sigA: 0, totL: 0, totA: 0, head: 0, body: 0, leg: 0, headA: 0, bodyA: 0, legA: 0,
  dist: 0, clinch: 0, ground: 0, kd: 0, tdL: 0, tdA: 0, subA: 0, rev: 0, ctrl: 0,
});

function norm(v: number): number {
  return clamp((v - 1) / 19, 0, 1);
}

function techOf(f: Fighter, id: TechId): number {
  return f.tech[id] ?? 0;
}

const SUB_BASE: Record<string, number> = {
  rnc: 0.33, armTriangle: 0.22, guillotine: 0.15, darce: 0.19, anaconda: 0.17, triangle: 0.16,
  armbar: 0.16, kimura: 0.11, heelHook: 0.15, kneebar: 0.1, americana: 0.1, neckCrank: 0.12,
};
const SUB_TECH: Record<string, TechId> = {
  rnc: "rnc", armTriangle: "armTriangle", guillotine: "guillotine", darce: "darce", anaconda: "darce", triangle: "triangle",
  armbar: "armbar", kimura: "kimura", heelHook: "heelHook", kneebar: "heelHook", americana: "kimura", neckCrank: "rnc",
};
const SUB_TOP: Record<GPos, [string, number][]> = {
  guard: [["guillotine", 0.15], ["kneebar", 0.04]],
  half: [["armTriangle", 0.75], ["kimura", 0.35], ["darce", 0.35]],
  side: [["armTriangle", 0.7], ["kimura", 0.3], ["americana", 0.2], ["darce", 0.25]],
  mount: [["armbar", 1], ["armTriangle", 0.7], ["americana", 0.2]],
  back: [["rnc", 2.6], ["neckCrank", 0.25], ["armbar", 0.15]],
};
const SUB_BOTTOM: Record<GPos, [string, number][]> = {
  guard: [["triangle", 1.1], ["armbar", 0.9], ["guillotine", 0.9], ["kimura", 0.35], ["heelHook", 0.25]],
  half: [["kimura", 0.8], ["guillotine", 0.4], ["heelHook", 0.25]],
  side: [["kimura", 0.2]],
  mount: [],
  back: [],
};

/** One choice on a corner call: what to do, or nothing (keep the plan). */
export interface AdviceOption {
  label: string;
  shout: Shout | null;
  primary?: boolean;
}

/** A call from the corner during a round. The fight doesn't stop for it. */
export interface LiveAdvice {
  key: string;
  text: string;
  /** The first option is the corner's call. */
  options: AdviceOption[];
  urgent: boolean;
  round: number;
  t: number;
  /** The clock time it stops applying. */
  until: number;
  /** What the fighter does with it if nobody chooses. */
  instinct: number;
}

/** A foul: what it's called, the line, the damage, and how likely a point, a stoppage and a ruling of intent are. */
interface Foul {
  what: string;
  line: string;
  hurt: number;
  flagrant: number;
  out: number;
  intent: number;
  poke?: boolean;
  low?: boolean;
}

/** A call and what was done with it. */
export interface CornerCall {
  /** Whose corner it was. */
  i: 0 | 1;
  r: number;
  t: number;
  key: string;
  text: string;
  choice: string;
  by: "you" | "instinct" | "corner";
  shout: Shout | null;
  ok: boolean;
}

/** What the corner does with the minute between rounds. */
export type CornerFocus = "recover" | "cut" | "tactics" | "head";

/** An input from outside the fight: a call answered, a shout, a plan change, the minute in the corner. */
export type TapeOp =
  | ["act", 0 | 1, Shout | null, { key: string; text: string; label: string; by: CornerCall["by"] } | null]
  | ["shout", 0 | 1, Shout]
  | ["clear", 0 | 1, ShoutGroup]
  | ["plan", 0 | 1, FightPlan]
  | ["corner", 0 | 1, CornerFocus]
  | ["next"]
  | ["advice", 0 | 1, number]
  | ["feedback", 0 | 1]
  | ["call", CornerCall];

/** One input and the exchange it came after. */
export interface TapeEntry {
  n: number;
  op: TapeOp;
}

/**
 * A watched fight on tape: every input, with the exchange it came after, and how
 * many exchanges have been fought. The fight is seeded, so playing the tape back
 * (`FightSim.replay`) rebuilds it exactly: same punches, same clock, same lines.
 */
export interface Tape {
  steps: number;
  ops: TapeEntry[];
}

const AGGRESSIVE = new Set<Shout>(["push", "finish", "power", "pressure", "takedown", "gnp", "head"]);
/** Calls a fighter acts on in the very next exchange. */
const IMMEDIATE = new Set<Shout>(["finish", "power", "push", "pressure", "takedown", "clinch", "circle", "getup", "gnp", "subs"]);
const CAREFUL = new Set<Shout>(["calm", "defend", "clinch", "jab", "circle", "counter", "control", "stand", "check"]);
const FOLLOW_UP = new Set<Shout>(["legs", "body", "head", "opening", "mix", "push", "pressure", "takedown", "finish", "jab", "circle", "defend", "counter", "subs", "gnp"]);
/** "Velasquez ___." */
const ACTION_3RD: Record<Shout, string> = {
  push: "ups the pace", calm: "slows it down to breathe", head: "starts head hunting", body: "goes to the body", legs: "goes after the legs",
  mix: "mixes up the levels", opening: "looks for the opening", jab: "goes back to the jab and stays long", pressure: "walks {him} down",
  circle: "circles off the fence", counter: "sits back to counter", clinch: "ties {him} up", takedown: "changes levels, looking for the takedown",
  stand: "keeps it standing", getup: "fights to get back up", control: "settles in on top", gnp: "postures up to ground and pound",
  subs: "hunts for a submission", power: "loads up on the power shots", finish: "goes for the finish", defend: "puts the hands up to survive",
  check: "starts lifting the shin to check the kicks",
};
/** "...wants to ___, but..." */
const ACTION_INF: Record<Shout, string> = {
  push: "push the pace", calm: "slow it down", head: "go upstairs", body: "go to the body", legs: "chop the legs", mix: "mix it up",
  opening: "find the opening", jab: "use the jab", pressure: "walk {him} down", circle: "circle off the fence", counter: "counter",
  clinch: "tie {him} up", takedown: "shoot", stand: "keep it standing", getup: "get up", control: "hold {him} down", gnp: "ground and pound",
  subs: "hunt the submission", power: "load up", finish: "finish it", defend: "cover up", check: "check the kicks",
};

export interface FightOutcome extends BoutResult {
  stats: [RoundStat, RoundStat];
  sides: [Side, Side];
  excitement: number;
}

export class FightSim {
  readonly input: FightInput;
  readonly rng: Rng;
  readonly crng: Rng;
  readonly s: [Side, Side];
  readonly rounds: number;
  readonly roundSec: number;
  readonly punch: number;
  readonly sloppy: number;
  readonly defMul: number;
  readonly paceMul: number;
  readonly subMul: number;
  readonly subDefMul: number;
  readonly logOn: boolean;
  readonly judges: { lean: number; noise: number }[];
  round = 1;
  t = 0;
  pos: Pos = "dist";
  top: 0 | 1 = 0;
  gpos: GPos = "guard";
  ctrl: 0 | 1 = 0;
  fence: -1 | 0 | 1 = -1;
  range: Range = 0;
  between = false;
  over = false;
  quiet = 0;
  winner: 0 | 1 | null = null;
  method: Method = "DEC";
  detail = "";
  endRound = 0;
  endTime = 0;
  log: FightLogLine[] = [];
  cards: [number, number][][] = []; // [round][judge] scores
  private aiCorner: [boolean, boolean];
  /** Live corner calls: when each kind was last given, the calls made, and the follow-ups waiting. */
  private adviceAt: [Record<string, number>, Record<string, number>] = [{}, {}];
  private lastAdvice: [number, number] = [-9999, -9999];
  calls: CornerCall[] = [];
  private checks: { i: 0 | 1; sh: Shout; at: number; base: Record<string, number>; done?: boolean }[] = [];
  private aiReactAt: [number, number] = [-9999, -9999];
  /** Exchanges fought: the clock a tape runs on. */
  steps = 0;
  /** A watched fight records every input from outside it, so it can be rebuilt exactly. Null: not recorded. */
  tape: TapeEntry[] | null = null;
  /** Inside an exchange: the other corner's calls are part of the fight, not inputs. */
  private inside = 0;

  constructor(input: FightInput) {
    this.input = input;
    this.rng = new Rng(input.seed);
    this.crng = new Rng(input.seed ^ 0x5bd1e995);
    this.rounds = input.rounds;
    this.roundSec = input.roundSec;
    this.punch = DIVISIONS[input.div].punch;
    const tier = input.tier ?? 5;
    // Lower levels: wider skill gaps already, plus sloppier defence.
    this.sloppy = [1.16, 1.1, 1.06, 1.03, 1.02, 1][clamp(tier, 0, 5)];
    this.defMul = [0.8, 0.82, 0.88, 0.93, 0.95, 1][clamp(tier, 0, 5)];
    this.paceMul = [1.28, 1.17, 1.09, 1.04, 1.03, 1][clamp(tier, 0, 5)];
    this.subMul = [1.3, 1.25, 1.15, 1.05, 1.03, 1][clamp(tier, 0, 5)];
    this.subDefMul = [0.86, 0.88, 0.9, 0.96, 0.97, 1][clamp(tier, 0, 5)];
    this.logOn = !!input.log;
    this.aiCorner = input.aiCorner ?? [true, true];
    const reachDiff = input.a.reach - input.b.reach;
    const planA = input.planA ?? suggestPlan(input.a.attrs, input.b.attrs, reachDiff);
    const planB = input.planB ?? suggestPlan(input.b.attrs, input.a.attrs, -reachDiff);
    this.s = [this.side(input.a, 0, planA, input.condA), this.side(input.b, 1, planB, input.condB)];
    if (this.s[0].name === this.s[1].name) {
      this.s[0].name = `${input.a.first} ${input.a.surname}`;
      this.s[1].name = `${input.b.first} ${input.b.surname}`;
    }
    this.judges = [0, 1, 2].map(() => ({ lean: this.rng.normal(0, 0.14), noise: 0.85 + this.rng.next() * 0.5 }));
    this.startRoundStats();
  }

  private side(f: Fighter, i: 0 | 1, plan: FightPlan, c?: Partial<Condition>): Side {
    const n = {} as Record<AttrKey, number>;
    for (const k of ATTRS) n[k] = norm(f.attrs[k]);
    const cond: Condition = { rust: 0, cut: 0, injury: 0, prep: 0, home: false, shortNotice: false, ...c };
    const wear = clamp((f.dmg - 60) / 500, 0, 0.3);
    const chinRes = (0.5 + 0.9 * n.chin) * (1 - cond.cut * 0.18) * (1 - wear * 0.5) * (1 + 0.05 * (cond.size ?? 0));
    // A short camp: the gas tank isn't built, more so the later the call.
    const cap = 100 - cond.cut * 22 - (cond.shortNotice ? 1 + 3 * snHurt(cond.notice) : 0) + cond.prep * 3;
    return {
      f, i, name: f.surname, n, plan, base: plan, d: dialsOf(plan), shouts: {}, tr: traitsOf(f), read: [...BASE_READ] as [number, number, number], noted: {},
      sta: cap, cap, head: 100, body: 100, legs: 100, stun: 0, cut: 0, kd: 0, cond, chinRes,
      rs: [], imp: [], gimp: [], agg: [], ctl: [], dmgDealt: [], unanswered: 0, lastLanded: 0, wobbled: 0,
      night: 1 + this.rng.normal(0, 0.08 * (1.45 - f.hid.consistency / 20)),
      lvl: Math.max(0.15, ATTRS.reduce((a, k) => a + n[k], 0) / ATTRS.length),
      fouls: 0,
      ded: [],
      poked: 0,
    };
  }

  private startRoundStats() {
    for (const s of this.s) {
      s.rs.push(blankRound());
      s.imp.push(0);
      s.gimp.push(0);
      s.agg.push(0);
      s.ctl.push(0);
      s.dmgDealt.push(0);
      s.ded.push(0);
    }
  }

  // ---------- helpers ----------

  private rs(s: Side): RoundStat {
    return s.rs[this.round - 1];
  }

  private other(s: Side): Side {
    return this.s[1 - s.i];
  }

  /** Effective attribute 0..1 after fatigue, damage, rust and injury. */
  e(s: Side, k: AttrKey): number {
    let v = s.n[k] * s.night;
    const fat = 0.55 + 0.45 * Math.pow(clamp(s.sta, 0, 100) / 100, 0.75);
    const hurt = 1 - 0.22 * Math.pow(1 - s.head / 100, 1.6) - (s.stun > 0 ? 0.32 : 0);
    v *= fat * hurt;
    if (s.cond.rust > 0) {
      const fade = this.round === 1 ? 1 : this.round === 2 ? 0.65 : 0.4;
      v *= 1 - s.cond.rust * 0.11 * fade;
    }
    if (s.cond.injury > 0) {
      v *= 1 - s.cond.injury * 0.05;
      // What the injured part does suffers most.
      const area = s.cond.injuryArea;
      const hit =
        area === "hand" ? k === "boxing" || k === "power" || k === "clinchStrikes" || k === "groundStrikes" || k === "counters"
        : area === "knee" || area === "leg" ? k === "kicks" || k === "footwork" || k === "takedowns" || k === "tdd" || k === "speed" || k === "scrambles"
        : area === "shoulder" || area === "arm" ? k === "takedowns" || k === "clinchControl" || k === "subs" || k === "boxing" || k === "topControl"
        : area === "body" || area === "back" ? k === "cardio" || k === "strength" || k === "toughness" || k === "takedowns"
        : area === "head" ? k === "chin" || k === "composure"
        : false;
      if (hit) v *= 1 - s.cond.injury * 0.22;
    }
    if (s.cond.prep) v *= 1 + s.cond.prep * 0.025;
    if (s.cond.home && (k === "composure" || k === "heart")) v *= 1.04;
    if (k === "footwork" || k === "tdd" || k === "speed") v *= 0.72 + 0.28 * (s.legs / 100);
    // A poked eye: the shots coming in are harder to see.
    if (s.poked > 0 && (k === "strikeDef" || k === "counters")) v *= 0.85;
    if (k === "cardio") v *= 1 - s.cond.cut * 0.25;
    if (k === "strikeDef" || k === "subDef" || k === "tdd") v *= this.defMul;
    if (k === "subDef") v *= this.subDefMul;
    if (k === "strength") v *= 1 - s.cond.cut * 0.08;
    if (k === "cardio" && s.cond.shortNotice) v *= 1 - 0.02 * snHurt(s.cond.notice);
    const z = s.cond.size;
    if (z) {
      // Up a weight class: the bigger man is stronger and hits harder; the smaller one is a touch quicker.
      if (k === "strength") v *= 1 + 0.1 * z;
      else if (k === "power") v *= 1 + 0.06 * z;
      else if (k === "takedowns" || k === "tdd" || k === "clinchControl" || k === "topControl") v *= 1 + 0.05 * z;
      else if (k === "speed") v *= 1 - 0.03 * z;
    }
    return v;
  }

  /** The attribute as it matters for choosing what to do: relative to the fighter's own level. */
  ce(s: Side, k: AttrKey): number {
    return this.e(s, k) * (0.66 / s.lvl);
  }

  /** While a combination is thrown, big moments wait here so the summary line comes first. */
  private buf: FightLogLine[] | null = null;
  private hits: Hit[] | null = null;

  private say(text: string, side?: 0 | 1, big = false, kind?: string) {
    if (!this.logOn) return;
    const line: FightLogLine = { r: this.round, t: Math.round(this.t), text, side, big, kind };
    if (this.buf) this.buf.push(line);
    else this.log.push(line);
  }

  private pickText(opts: string[]): string {
    return opts[Math.floor(this.crng.next() * opts.length)];
  }

  private spend(s: Side, cost: number) {
    s.sta = clamp(s.sta - cost * (1.32 - 0.62 * s.n.cardio) * (1 + s.cond.cut * 0.3), 0, s.cap);
  }

  private recover(dt: number) {
    for (const s of this.s) {
      const r = 0.075 * (0.45 + 0.8 * s.n.cardio) * (0.55 + 0.45 * s.body / 100);
      let gain = r * dt;
      if (this.pos === "ground" && this.top !== s.i) gain *= 0.35;
      if (this.pos === "clinch" && this.ctrl !== s.i) gain *= 0.6;
      s.sta = clamp(s.sta + gain, 0, s.cap);
      if (s.stun > 0) {
        s.stun = Math.max(0, s.stun - dt * (0.7 + 0.6 * s.n.recovery));
      }
      if (s.poked > 0) s.poked = Math.max(0, s.poked - dt);
    }
  }

  // ---------- the loop ----------

  /** One exchange. Returns the seconds it took. */
  step(): number {
    if (this.over || this.between) return 0;
    this.steps++;
    this.inside++;
    const dt = this.exchange();
    this.inside--;
    return dt;
  }

  private exchange(): number {
    let dt: number;
    const urgent = this.s.find((x) => x.now);
    const forced = urgent ? this.immediate(urgent) : null;
    if (forced !== null) dt = forced;
    else if (this.pos === "dist") dt = this.distance();
    else if (this.pos === "clinch") dt = this.clinch();
    else dt = this.ground();
    if (this.over) return dt;
    const left = this.roundSec - this.t;
    if (dt > left) dt = left;
    this.t += dt;
    this.recover(dt);
    this.maybeFoul();
    if (this.over) return dt;
    if (this.logOn) this.cues();
    this.aiReactAll();
    if (this.pos === "ground") this.s[this.top].ctl[this.round - 1] += dt;
    if (this.pos === "clinch") this.s[this.ctrl].ctl[this.round - 1] += dt * 0.5;
    if (this.pos === "ground") this.rs(this.s[this.top]).ctrl += dt;
    if (this.pos === "clinch") this.rs(this.s[this.ctrl]).ctrl += dt * 0.7;
    this.expireShouts();
    if (this.t >= this.roundSec - 0.01) this.finishRound();
    return dt;
  }

  run(): FightOutcome {
    let guard = 0;
    while (!this.over && guard++ < 20000) {
      if (this.between) this.nextRound();
      else this.step();
    }
    return this.outcome();
  }

  // ---------- a watched fight: on tape, rebuilt from it, finished without the player ----------

  private rec(op: TapeOp) {
    if (this.tape && !this.inside) this.tape.push({ n: this.steps, op });
  }

  /** The tape so far (null when the fight isn't recorded). */
  tapeOf(): Tape | null {
    return this.tape ? { steps: this.steps, ops: this.tape } : null;
  }

  /** Rebuild a watched fight from its tape: the same exchanges, every input at the moment it came. Recording goes on from there. */
  static replay(input: FightInput, tape: Tape): FightSim {
    const sim = new FightSim(input);
    for (const e of tape.ops) {
      sim.runTo(e.n);
      sim.apply(e.op);
    }
    sim.runTo(tape.steps);
    sim.tape = tape.ops.slice();
    return sim;
  }

  private runTo(n: number) {
    let g = 0;
    while (this.steps < n && !this.over && !this.between && g++ < 50000) this.step();
  }

  private apply(op: TapeOp) {
    switch (op[0]) {
      case "act":
        this.act(op[1], op[2], op[3] ?? undefined);
        break;
      case "shout":
        this.shout(op[1], op[2]);
        break;
      case "clear":
        this.clearShout(op[1], op[2]);
        break;
      case "plan":
        this.setPlan(op[1], op[2]);
        break;
      case "corner":
        this.corner(op[1], op[2]);
        break;
      case "next":
        this.nextRound();
        break;
      case "advice":
        this.liveAdvice(op[1], op[2]);
        break;
      case "feedback":
        this.cornerFeedback(op[1]);
        break;
      case "call":
        this.noteCall(op[1]);
        break;
    }
  }

  /** A call answered by shouting it from the corner: what was called, and whether it was heard. */
  noteCall(c: CornerCall) {
    this.rec(["call", c]);
    this.calls.push(c);
  }

  /** Answer a corner call. The fighter acts on it; a manager shouts it, and it may go unheard. */
  answer(i: 0 | 1, adv: LiveAdvice, k: number, by: CornerCall["by"], asFighter: boolean): boolean {
    const op = adv.options[k];
    if (asFighter) return this.act(i, op.shout, { key: adv.key, text: adv.text, label: op.label, by });
    const ok = op.shout ? this.shout(i, op.shout) : true;
    this.noteCall({ i, r: this.round, t: Math.round(this.t), key: adv.key, text: adv.text, choice: op.label, by, shout: op.shout, ok });
    return ok;
  }

  /**
   * The rest of a watched fight, played out at once: side `i` answers the corner's calls
   * on instinct (or does what the corner says), and the corner spends each minute on the
   * breathing. Recorded like the rest of the fight.
   */
  playOut(i: 0 | 1, quality: number, follow: boolean, asFighter: boolean): FightOutcome {
    let g = 0;
    while (!this.over && g++ < 20000) {
      if (this.between) {
        this.corner(i, "recover");
        this.nextRound();
        continue;
      }
      this.step();
      const adv = this.liveAdvice(i, quality);
      if (adv) this.answer(i, adv, follow ? 0 : adv.instinct, follow ? "corner" : "instinct", asFighter);
      this.cornerFeedback(i);
    }
    return this.outcome();
  }

  /** Corner time: AI corners adjust, then the next round starts. */
  nextRound() {
    if (!this.between || this.over) return;
    this.rec(["next"]);
    for (const s of this.s) {
      // Shouts were for that round; a new round starts from the plan.
      s.shouts = {};
      if (this.aiCorner[s.i]) this.aiAdjust(s);
      else {
        s.plan = s.base;
        s.d = dialsOf(s.base);
      }
      s.noted.up = false;
      s.noted.down = false;
      // In the corner they reset their guard a little.
      for (let k = 0; k < 3; k++) s.read[k] = s.read[k] * 0.65 + BASE_READ[k] * 0.35;
    }
    this.between = false;
    this.round += 1;
    this.t = 0;
    this.pos = "dist";
    this.fence = -1;
    this.range = 0;
    this.quiet = 0;
    this.startRoundStats();
    this.say(`Round ${this.round} begins.`, undefined, true, "round");
  }

  setPlan(i: 0 | 1, plan: FightPlan) {
    this.rec(["plan", i, { ...plan }]);
    const s = this.s[i];
    s.base = plan;
    s.plan = applyShouts(plan, s.shouts);
    s.d = dialsOf(s.plan);
  }

  /** A shout from the corner, followed or not depending on discipline and damage. */
  shout(i: 0 | 1, sh: Shout): boolean {
    this.rec(["shout", i, sh]);
    const s = this.s[i];
    const def = SHOUT_BY_ID[sh];
    const listen = 0.45 + 0.45 * s.n.discipline - (s.stun > 0 ? 0.25 : 0) - (1 - s.head / 100) * 0.2;
    if (!this.rng.chance(clamp(listen, 0.15, 0.95))) {
      this.say(`${s.name}'s corner is shouting "${def.label.replace(/[!.]$/, "")}", but ${s.name} isn't listening.`, s.i, false, "corner");
      return false;
    }
    s.shouts = { ...s.shouts, [def.group]: sh };
    s.plan = applyShouts(s.base, s.shouts);
    s.d = dialsOf(s.plan);
    if (sh === "check") s.read[2] = Math.min(0.5, s.read[2] + 0.1);
    if (sh === "defend") s.read[0] = Math.min(0.8, s.read[0] + 0.08);
    this.normRead(s);
    this.say(`${s.name} hears the corner: "${def.label.replace(/[!.]$/, "")}".`, s.i, false, "corner");
    return true;
  }

  /** Take a shout back: the plan for that part of the fight returns. */
  clearShout(i: 0 | 1, g: ShoutGroup) {
    const s = this.s[i];
    if (!s.shouts[g]) return;
    this.rec(["clear", i, g]);
    const next = { ...s.shouts };
    delete next[g];
    s.shouts = next;
    s.plan = applyShouts(s.base, s.shouts);
    s.d = dialsOf(s.plan);
  }

  private normRead(s: Side) {
    const t = s.read[0] + s.read[1] + s.read[2];
    for (let k = 0; k < 3; k++) s.read[k] /= t;
  }

  /** How open each level is: above 1 the guard has moved away from it, below 1 it is covered. */
  openness(s: Side): [number, number, number] {
    return [0, 1, 2].map((k) => clamp(Math.pow(BASE_READ[k] / s.read[k], 0.45), 0.62, 1.35)) as [number, number, number];
  }

  /** The defender learns from what comes at them: the guard drifts towards it. */
  private adapt(def: Side, att: Side, zone: Zone, landed: boolean) {
    const z = ZI[zone];
    let a = (0.02 + 0.045 * this.e(def, "fightIQ")) * (1 + 0.8 * def.tr.read) * (1 - 0.45 * att.tr.mix) * (landed ? 1.6 : 1);
    if (att.d.mix) a *= 0.55;
    if (def.d.checkLegs && z === 2) a *= 1.3;
    const r = def.read;
    for (let k = 0; k < 3; k++) r[k] = r[k] * (1 - a) + (k === z ? a : 0);
    if (!this.logOn) return;
    const ratio = r[z] / BASE_READ[z];
    const key = `read${z}`;
    if (ratio > (z === 0 ? 1.25 : 1.65) && !def.noted[key]) {
      def.noted[key] = true;
      const she = def.f.sex === "F";
      this.say(
        z === 2
          ? `${def.name} has read the low kicks: ${she ? "she's" : "he's"} lifting the shin early now.`
          : z === 1
            ? `${def.name} is keeping the elbows tight: the body shots have been noticed.`
            : `${def.name} shells up high: ${she ? "she's" : "he's"} had enough of the head shots.`,
        def.i, false, "read",
      );
    } else if (ratio < (z === 0 ? 1.1 : 1.35)) def.noted[key] = false;
  }

  private expireShouts() {
    // shouts last until the end of the round
  }

  /** Between rounds the corner gives water, works the cut, and fixes the plan. */
  corner(i: 0 | 1, focus: CornerFocus) {
    this.rec(["corner", i, focus]);
    const s = this.s[i];
    if (focus === "recover") s.sta = clamp(s.sta + 6 + 6 * s.n.recovery, 0, s.cap);
    if (focus === "cut" && s.cut > 0) s.cut = Math.max(0, s.cut - (this.rng.chance(0.55) ? 1 : 0));
    if (focus === "head") s.head = clamp(s.head + 4 + 3 * s.n.recovery, 0, 100);
  }

  private aiAdjust(s: Side) {
    // Reset any shout, then tweak for the state of the fight.
    s.shouts = {};
    const o = this.other(s);
    const p = { ...s.base };
    const behind = this.scoreDiff(s) < -0.5;
    const ahead = this.scoreDiff(s) > 1;
    const last = this.round + 1 === this.rounds;
    if (s.sta < 45) p.tempo = clamp(p.tempo - 1, -2, 2);
    if (behind && last) {
      p.tempo = clamp(p.tempo + 1, -2, 2);
      p.risk = clamp(p.risk + 1, -2, 2);
      p.counter = clamp(p.counter - 1, -2, 2);
    }
    if (ahead && last && s.n.discipline > 0.5) p.risk = clamp(p.risk - 1, -2, 2);
    // A striker being taken down keeps the fight standing.
    const tdAgainst = o.rs.reduce((a, r) => a + r.tdL, 0);
    if (tdAgainst >= 2 && p.takedowns <= 1) p.defense = "tdd";
    // A grappler losing on the feet shoots more.
    if (behind && s.n.takedowns > o.n.tdd + 0.08) p.takedowns = clamp(p.takedowns + 1, 0, 4);
    // Legs chopped: stop kicking, move in.
    if (s.legs < 55 && p.range < 1) p.range += 1;
    if (o.legs < 60 && s.n.kicks > 0.55) p.target = "legs";
    // A smart corner sees where the guard has gone and sends the shots elsewhere.
    const open = this.openness(o);
    const t: 0 | 1 | 2 | null = p.target === "legs" ? 2 : p.target === "body" ? 1 : p.target === "head" ? 0 : null;
    if (t !== null && open[t] < 0.85 && s.n.fightIQ > 0.45) p.target = "opening";
    s.plan = p;
    s.d = dialsOf(p);
  }

  /** What the corner sees between rounds: plain advice from the state of the fight. */
  cornerNotes(i: 0 | 1): { text: string; shout?: Shout }[] {
    const me = this.s[i];
    const o = this.other(me);
    const notes: { text: string; shout?: Shout }[] = [];
    const he = o.f.sex === "F" ? "she" : "he";
    const his = o.f.sex === "F" ? "her" : "his";
    const open = this.openness(o);
    const covered = [0, 1, 2].filter((z) => open[z] < 0.85);
    const opens = [0, 1, 2].filter((z) => open[z] > 1.1).sort((a, b) => open[b] - open[a]);
    if (covered.length && opens.length) {
      notes.push({ text: `${o.name} is guarding the ${ZONE_WORD[covered[0]]} now. The ${ZONE_WORD[opens[0]]} ${opens[0] === 2 ? "are" : "is"} open: go there.`, shout: opens[0] === 0 ? "head" : opens[0] === 1 ? "body" : "legs" });
    }
    if (o.legs < 55 && open[2] >= 0.9) notes.push({ text: `${his.charAt(0).toUpperCase() + his.slice(1)} lead leg is hurt (${Math.round(o.legs)}%). Keep chopping it.`, shout: "legs" });
    if (o.body < 60) notes.push({ text: `The body shots are working: ${he}'s slowing down.`, shout: "body" });
    if (o.sta < 45 && me.sta > o.sta + 10) notes.push({ text: `${o.name} is tired. Push the pace now.`, shout: "push" });
    if (me.sta < 40) notes.push({ text: `You're running on fumes. Slow it down and pick your shots.`, shout: "calm" });
    if (me.head < 55) notes.push({ text: `You're getting hit clean too often. Hands up, move the head.`, shout: "defend" });
    if (me.legs < 60 && o.rs.reduce((a, r) => a + r.leg, 0) >= 8) notes.push({ text: `${he.charAt(0).toUpperCase() + he.slice(1)}'s chopping your leg. Check the kicks.`, shout: "check" });
    const tdAgainst = o.rs.reduce((a, r) => a + r.tdL, 0);
    const myTd = me.rs.reduce((a, r) => a + r.tdL, 0);
    if (tdAgainst >= 2) notes.push({ text: `${he.charAt(0).toUpperCase() + he.slice(1)}'s taking you down. Stay off the fence and keep it standing.`, shout: "stand" });
    else if (myTd >= 2) notes.push({ text: `The wrestling is working. Keep taking ${o.f.sex === "F" ? "her" : "him"} down.`, shout: "takedown" });
    const lead = this.scoreDiff(me);
    const left = this.rounds - this.round;
    if (lead < -0.4) notes.push({ text: left <= 1 ? `You're behind on the cards. You need a finish or a big round.` : `You're behind on the cards. You need this round.`, shout: left <= 1 ? "finish" : "push" });
    else if (lead > 1 && left <= 1) notes.push({ text: `You're ahead. Stay safe, don't give it away.` });
    if (!notes.length) notes.push({ text: `It's going to plan. Same again.` });
    return notes.slice(0, 4);
  }

  // ---------- live corner calls ----------

  /** Fight time from the first bell, in seconds. */
  private clockAll(): number {
    return (this.round - 1) * this.roundSec + this.t;
  }

  /** Who is winning the round so far, from this side's view: -1 losing it clearly .. 1 winning it clearly. */
  roundEdge(i: 0 | 1): number {
    const r = this.round - 1;
    const me = this.s[i];
    const o = this.other(me);
    const a = (me.imp[r] ?? 0) + (me.gimp[r] ?? 0);
    const b = (o.imp[r] ?? 0) + (o.gimp[r] ?? 0);
    return clamp((a - b) / (4 + 0.25 * (a + b)), -1, 1);
  }

  /**
   * The corner reads the fight and calls something: urgent calls when someone
   * is hurt or pinned, strategic ones about the pace, the opening, the cards.
   * A better head coach (quality 0..1) notices sooner and reads the guard.
   * Uses no randomness: asking never changes the fight.
   */
  liveAdvice(i: 0 | 1, quality = 0.6): LiveAdvice | null {
    const a = this.advise(i, quality);
    // A call given starts its cooldown: that's a change to the fight, so it goes on the tape.
    if (a) this.rec(["advice", i, quality]);
    return a;
  }

  private advise(i: 0 | 1, quality: number): LiveAdvice | null {
    if (this.over || this.between) return null;
    const me = this.s[i];
    const o = this.other(me);
    const now = this.clockAll();
    if (now - this.lastAdvice[i] < 14) return null;
    const she = o.f.sex === "F";
    const he = she ? "she" : "he";
    const him = she ? "her" : "him";
    const his = she ? "her" : "his";
    const He = he.charAt(0).toUpperCase() + he.slice(1);
    const His = his.charAt(0).toUpperCase() + his.slice(1);
    const left = this.roundSec - this.t;
    const r = this.round - 1;
    const active = (sh: Shout | null) => !!sh && Object.values(me.shouts).includes(sh);
    const make = (key: string, cooldown: number, urgent: boolean, lasts: number, text: string, options: AdviceOption[]): LiveAdvice | null => {
      if (now - (this.adviceAt[i][key] ?? -9999) < cooldown) return null;
      if (active(options[0].shout)) return null;
      this.adviceAt[i][key] = now;
      this.lastAdvice[i] = now;
      options[0].primary = true;
      const a: LiveAdvice = { key, text, options, urgent, round: this.round, t: Math.round(this.t), until: Math.min(this.roundSec, this.t + lasts), instinct: 0 };
      a.instinct = this.instinctFor(me, a);
      return a;
    };
    const open = this.openness(o);
    const myRound = me.rs[r];
    const oRound = o.rs[r];

    // Urgent: someone is hurt.
    if (me.stun > 0) return make("hurt", 25, true, 8, "You're hurt! Survive this!", [
      { label: `Tie ${him} up`, shout: "clinch" }, { label: "Hands up, survive", shout: "defend" }, { label: "Fire back", shout: "power" },
    ]);
    if (o.stun > 0) return make("finish", 20, true, 7, `${He}'s hurt! Finish ${him}!`, [
      { label: "Finish it!", shout: "finish" }, { label: "Stay composed", shout: null },
    ]);
    // On the ground.
    if (this.pos === "ground" && this.top === o.i) {
      const guard = me.tr.guard > 0.3 || me.n.subs > 0.62;
      return make("bottom", 55, false, 25, guard ? `Attack from the bottom: ${he}'s leaving an arm in!` : "Don't stay on your back! Get up!", guard
        ? [{ label: "Hunt the submission", shout: "subs" }, { label: "Get up now!", shout: "getup" }]
        : [{ label: "Get up now!", shout: "getup" }, { label: "Hunt the submission", shout: "subs" }]);
    }
    if (this.pos === "ground" && this.top === me.i) {
      const neck = me.n.subs > me.n.groundStrikes + 0.08 || o.sta < 40;
      return make("top", 55, false, 25, neck ? `${He}'s tired underneath. Look for the neck!` : "Posture up and let the hands go!", neck
        ? [{ label: "Hunt the submission", shout: "subs" }, { label: "Ground and pound", shout: "gnp" }, { label: `Hold ${him} down`, shout: "control" }]
        : [{ label: "Ground and pound", shout: "gnp" }, { label: "Hunt the submission", shout: "subs" }, { label: `Hold ${him} down`, shout: "control" }]);
    }
    // The fence.
    if (this.pos === "dist" && this.fence === me.i && this.quiet === 0) return make("fence", 75, true, 12, "You're on the fence! Get off it!", [
      { label: "Circle off the fence", shout: "circle" }, { label: `Tie ${him} up`, shout: "clinch" },
    ]);
    if (this.pos === "dist" && this.fence === o.i && this.e(me, "takedowns") > this.e(o, "tdd") - 0.02) return make("tdChance", 70, true, 10, `${He}'s on the fence. Take ${him} down!`, [
      { label: `Take ${him} down!`, shout: "takedown" }, { label: "Keep striking", shout: null },
    ]);
    // The end of the round and the cards.
    const edge = this.roundEdge(i);
    if (left < 40 && left > 5 && Math.abs(edge) < 0.35) return make(`steal${this.round}`, 9999, false, 35, "Thirty seconds! Steal the round!", [
      { label: "Push the pace!", shout: "push" }, { label: `Take ${him} down!`, shout: "takedown" }, { label: "Stay safe", shout: null },
    ]);
    if (this.round === this.rounds && this.scoreDiff(me) < -0.5 && this.t > this.roundSec * 0.3) return make("behind", 9999, false, 45, "You're down on the cards. You need a finish!", [
      { label: "Finish it!", shout: "finish" }, { label: `Take ${him} down!`, shout: "takedown" }, { label: "Push the pace!", shout: "push" },
    ]);
    if (this.round === this.rounds && this.scoreDiff(me) > 1 && this.t > this.roundSec * 0.3) return make("ahead", 9999, false, 45, "You're winning this. Stay smart, don't get caught.", [
      { label: "Use the jab, stay long", shout: "jab" }, { label: "Hands up, survive", shout: "defend" }, { label: "Keep pushing", shout: null },
    ]);
    // The gas tanks.
    if (o.sta < 50 + 10 * quality && me.sta > o.sta + 8) return make("oppTired", 90, false, 25, `${He}'s breathing hard. Push the pace!`, [
      { label: "Push the pace!", shout: "push" }, { label: "Keep it steady", shout: null },
    ]);
    if (me.sta < 42) return make("meTired", 90, false, 25, "You're gassing. Slow it down and breathe.", [
      { label: "Slow down, breathe", shout: "calm" }, { label: "Push through", shout: null },
    ]);
    // The guard: a good coach sees where it has gone.
    const best = [0, 1, 2].sort((a, b) => open[b] - open[a])[0];
    const covered = [0, 1, 2].filter((z) => open[z] < 0.88);
    if (quality >= 0.35 && covered.length && open[best] > 1.25 - 0.15 * quality) {
      const words = ["head", "body", "legs"];
      const go: Shout = best === 0 ? "head" : best === 1 ? "body" : "legs";
      return make("opening", 70, false, 30, `${He}'s covering the ${words[covered[0]]}. The ${words[best]} ${best === 2 ? "are" : "is"} open!`, [
        { label: best === 0 ? "Go upstairs" : best === 1 ? "Go to the body" : "Chop the legs", shout: go }, { label: "Find the opening", shout: "opening" }, { label: "Mix it up", shout: "mix" },
      ]);
    }
    // Damage that shows.
    if (o.legs < 72 && (myRound?.leg ?? 0) >= 4 && open[2] >= 0.9) return make("legHurt", 80, false, 30, `${His} lead leg is going. Chop it down!`, [
      { label: "Chop the legs", shout: "legs" }, { label: "Go upstairs", shout: "head" },
    ]);
    if (o.body < 72 && (myRound?.body ?? 0) >= 4) return make("bodyHurt", 80, false, 30, `The body shots are hurting ${him}. Dig to the body!`, [
      { label: "Go to the body", shout: "body" }, { label: "Head hunting", shout: "head" },
    ]);
    if (me.legs < 75 && (oRound?.leg ?? 0) >= 4) return make("myLeg", 80, false, 30, `${He}'s chopping your leg. Check the kicks!`, [
      { label: "Check the kicks", shout: "check" }, { label: `Walk ${him} down`, shout: "pressure" },
    ]);
    // The wrestling and the range.
    if ((oRound?.tdL ?? 0) >= 2) return make("tdAgainst", 90, false, 30, `${He}'s taking you down at will. Keep it standing!`, [
      { label: "Keep it standing", shout: "stand" }, { label: "Circle off the fence", shout: "circle" },
    ]);
    if (this.pos === "dist" && (oRound?.dist ?? 0) >= (myRound?.dist ?? 0) + 6) {
      const reach = me.f.reach - o.f.reach >= 2;
      return make("range", 90, false, 30, reach ? `Use your reach! Keep ${him} on the end of the jab.` : `${He}'s winning at range. Close the distance!`, reach
        ? [{ label: "Use the jab, stay long", shout: "jab" }, { label: `Walk ${him} down`, shout: "pressure" }]
        : [{ label: `Walk ${him} down`, shout: "pressure" }, { label: `Take ${him} down!`, shout: "takedown" }, { label: "Make them miss, counter", shout: "counter" }]);
    }
    return null;
  }

  /** What a fighter does with a call when nobody chooses: the disciplined and clever follow the corner, the rest follow their nature. */
  private instinctFor(s: Side, a: LiveAdvice): number {
    let best = 0;
    let top = -Infinity;
    a.options.forEach((op, k) => {
      let v = k === 0 ? 0.1 + 0.35 * s.n.discipline + 0.25 * s.n.fightIQ : 0;
      if (op.shout === null) v += 0.3 * (1 - s.n.aggression);
      if (op.shout && AGGRESSIVE.has(op.shout)) v += 0.6 * s.n.aggression + 0.3 * s.tr.volume + 0.3 * s.tr.power;
      if (op.shout && CAREFUL.has(op.shout)) v += 0.5 * s.n.composure + 0.2 * s.n.discipline;
      if (op.shout === "takedown" || op.shout === "subs" || op.shout === "gnp" || op.shout === "control") v += 0.45 * Math.max(s.n.takedowns, s.n.subs);
      if (v > top) {
        top = v;
        best = k;
      }
    });
    return best;
  }

  /**
   * The fighter acts on a call (fighter mode: you are the fighter, so it isn't
   * a shout that may go unheard). Dazed, the body may not answer.
   */
  act(i: 0 | 1, sh: Shout | null, call?: { key: string; text: string; label: string; by: CornerCall["by"] }): boolean {
    this.rec(["act", i, sh, call ? { ...call } : null]);
    const s = this.s[i];
    const o = this.other(s);
    const him = o.f.sex === "F" ? "her" : "him";
    const record = (ok: boolean) => {
      if (call) this.calls.push({ i, r: this.round, t: Math.round(this.t), key: call.key, text: call.text, choice: call.label, by: call.by, shout: sh, ok });
    };
    if (!sh) {
      this.say(`${s.name} sticks with the plan.`, s.i, false, call?.by === "you" ? "call" : "corner");
      record(true);
      return true;
    }
    if (s.stun > 0 && !this.rng.chance(clamp(0.35 + 0.5 * s.n.composure, 0.3, 0.85))) {
      this.say(`${s.name} wants to ${ACTION_INF[sh].replace("{him}", him)}, but the legs aren't there yet.`, s.i, false, call?.by === "you" ? "call" : "corner");
      record(false);
      return false;
    }
    const def = SHOUT_BY_ID[sh];
    s.shouts = { ...s.shouts, [def.group]: sh };
    s.plan = applyShouts(s.base, s.shouts);
    s.d = dialsOf(s.plan);
    if (sh === "check") s.read[2] = Math.min(0.5, s.read[2] + 0.1);
    if (sh === "defend") s.read[0] = Math.min(0.85, s.read[0] + 0.06);
    this.normRead(s);
    const by = call?.by === "instinct" ? " on instinct" : call?.by === "corner" ? ", as the corner says" : "";
    this.say(`${s.name} ${ACTION_3RD[sh].replace("{him}", him)}${by}.`, s.i, false, call?.by === "you" ? "call" : "corner");
    record(true);
    // The corner will say whether it's working.
    if (FOLLOW_UP.has(sh)) this.checks.push({ i, sh, at: this.clockAll(), base: this.snapshotFor(i) });
    // Some calls are done on the spot, in the next exchange.
    if (IMMEDIATE.has(sh)) s.now = sh;
    return true;
  }

  /** A call acted on this instant: the swarm, the shot, the escape, the tie-up. Null when it doesn't fit the position. */
  private immediate(s: Side): number | null {
    const sh = s.now;
    s.now = null;
    const o = this.other(s);
    if (!sh || s.stun > 0) return null;
    if (this.pos === "dist") {
      if (sh === "circle" && this.fence === s.i) {
        if (this.rng.chance(clamp(0.45 + 0.4 * this.e(s, "footwork") - 0.2 * this.e(o, "footwork"), 0.2, 0.9))) {
          this.fence = -1;
          this.say(`${s.name} angles off and gets back to the centre.`, s.i);
        } else this.say(`${s.name} tries to circle out, but ${o.name} cuts the angle off.`, o.i);
        return 2.5;
      }
      if (sh === "takedown") return this.shoot(s, o, false);
      if (sh === "clinch") return this.enterClinch(s, o);
      if (sh === "finish" || sh === "power" || sh === "push" || sh === "pressure") return this.combo(s, o);
      return null;
    }
    if (this.pos === "clinch") {
      if (sh === "takedown") return this.shoot(s, o, true);
      if (sh === "circle" || sh === "getup") {
        this.pos = "dist";
        this.fence = -1;
        this.say(`${s.name} breaks the clinch and resets.`, s.i);
        return 3;
      }
      return null;
    }
    if (this.top === s.i && (sh === "gnp" || sh === "finish" || sh === "subs")) return this.topMove(s, o);
    if (this.top !== s.i && (sh === "getup" || sh === "subs")) return this.bottomMove(s, o);
    return null;
  }

  private snapshotFor(i: 0 | 1): Record<string, number> {
    const me = this.s[i];
    const o = this.other(me);
    const sum = (s: Side, k: StatKey) => s.rs.reduce((a, r) => a + r[k], 0);
    return {
      head: sum(me, "head"), body: sum(me, "body"), leg: sum(me, "leg"), sig: sum(me, "sigL"), abs: sum(o, "sigL"),
      tdL: sum(me, "tdL"), tdA: sum(me, "tdA"), subA: sum(me, "subA"), kd: sum(me, "kd"), oStun: o.stun > 0 ? 1 : 0,
    };
  }

  /** Twenty-odd seconds after a call was acted on, the corner says whether it's working. */
  cornerFeedback(i: 0 | 1): { text: string; good: boolean } | null {
    const done = () => this.checks.reduce((a, c) => a + (c.done ? 1 : 0), 0);
    const before = this.tape ? done() : 0;
    const out = this.feedback(i);
    if (this.tape && done() !== before) this.rec(["feedback", i]);
    return out;
  }

  private feedback(i: 0 | 1): { text: string; good: boolean } | null {
    const now = this.clockAll();
    const me = this.s[i];
    const o = this.other(me);
    const he = o.f.sex === "F" ? "she" : "he";
    const He = he.charAt(0).toUpperCase() + he.slice(1);
    for (const c of this.checks) {
      if (c.i !== i || c.done || now - c.at < 22) continue;
      c.done = true;
      const n = this.snapshotFor(i);
      const d = (k: string) => n[k] - c.base[k];
      let out: { text: string; good: boolean } | null = null;
      switch (c.sh) {
        case "legs":
          out = this.openness(o)[2] < 0.85 ? { text: `${He}'s checking the kicks now. Go upstairs!`, good: false }
            : d("leg") >= 3 ? { text: `It's working: ${d("leg")} leg kicks in and ${he}'s favouring the leg.`, good: true }
            : { text: "The kicks aren't landing. Set them up with the hands first!", good: false };
          break;
        case "body":
          out = d("body") >= 3 ? { text: `It's working: ${d("body")} to the body, ${he}'s slowing down.`, good: true }
            : this.openness(o)[1] < 0.85 ? { text: `${He}'s covering the body now. Switch it up!`, good: false }
            : { text: "Nothing's getting to the body. Go upstairs first, then dig.", good: false };
          break;
        case "head": case "opening": case "mix":
          out = d("head") + d("body") + d("leg") >= 5 ? { text: `That's it! ${d("head") + d("body") + d("leg")} clean shots since.`, good: true } : { text: "Nothing's landing clean. Change something!", good: false };
          break;
        case "push": case "pressure":
          out = me.sta < 35 ? { text: "Careful, you're running out of gas!", good: false }
            : d("sig") - d("abs") >= 3 ? { text: `You're winning the exchanges, ${d("sig")} to ${d("abs")}. Keep it up!`, good: true }
            : d("abs") > d("sig") + 3 ? { text: `${He}'s countering you coming in. Be smarter!`, good: false } : null;
          break;
        case "takedown":
          out = d("tdL") >= 1 ? { text: "Got the takedown! Now work from there.", good: true } : d("tdA") >= 2 ? { text: `${He}'s stuffing the shots. Strike first, then shoot!`, good: false } : null;
          break;
        case "finish":
          out = d("kd") > 0 ? { text: "Down! Stay on top of it!", good: true } : o.stun <= 0 && !this.over ? { text: `${He} survived it. Settle down or you'll gas out.`, good: false } : null;
          break;
        case "jab": case "circle": case "defend": case "counter":
          out = d("abs") <= d("sig") ? { text: `Good, ${he}'s not finding you now.`, good: true } : { text: "Still getting hit. Move your head!", good: false };
          break;
        case "subs": case "gnp":
          out = d("subA") > 0 || d("sig") >= 4 ? { text: "Good work on top. Keep the pressure on.", good: true } : null;
          break;
      }
      if (out) {
        this.say(`${me.name}'s corner: "${out.text}"`, me.i, false, "corner");
        return out;
      }
    }
    return null;
  }

  /**
   * In a live fight the other corner calls too, and its fighter acts on the
   * calls by instinct: the same rules on both sides, so your choices are a
   * chess match. The world's AI-against-AI fights don't do this.
   */
  private aiReactAll() {
    for (const s of this.s) {
      if (!this.aiCorner[s.i] || this.aiCorner[1 - s.i] || this.over || this.between) continue;
      const adv = this.liveAdvice(s.i, 0.55);
      if (!adv) continue;
      const op = adv.options[adv.instinct];
      this.act(s.i, op.shout, { key: adv.key, text: adv.text, label: op.label, by: adv.instinct === 0 ? "corner" : "instinct" });
    }
  }

  /** Rough round-by-round lead from this side's view, in rounds. */
  scoreDiff(s: Side): number {
    let d = 0;
    for (const r of this.cards) {
      const mine = r.reduce((a, j) => a + j[s.i], 0);
      const theirs = r.reduce((a, j) => a + j[1 - s.i], 0);
      d += (mine - theirs) / 3;
    }
    return d;
  }

  // ---------- on the feet ----------

  private initiative(s: Side): number {
    const o = this.other(s);
    let v = (0.42 + 0.62 * this.ce(s, "aggression") + 0.28 * this.ce(s, "workRate") + 0.12 * this.ce(s, "speed")) * s.d.tempo * this.paceMul;
    v *= 1.12 - 0.5 * (s.d.counter - 0.5);
    v *= 1 + 0.08 * s.tr.volume - 0.06 * s.tr.counter + (this.range === 0 ? 0.08 * s.tr.blitz : 0);
    if (s.stun > 0) v *= 0.35;
    if (o.stun > 0) v *= s.d.finish ? 2.3 : 1.5;
    if (s.sta < 30) v *= 0.75;
    return Math.max(0.05, v);
  }

  private distance(): number {
    const [A, B] = this.s;
    // Range: each side pulls the fight to its range; footwork and reach decide.
    const prefA = A.d.rangePref + (A.f.reach - B.f.reach) * -0.04;
    const prefB = B.d.rangePref + (B.f.reach - A.f.reach) * -0.04;
    const fwA = this.e(A, "footwork") + A.d.defMove * 0.08 + A.tr.range * 0.08;
    const fwB = this.e(B, "footwork") + B.d.defMove * 0.08 + B.tr.range * 0.08;
    const winA = this.rng.chance(clamp(0.5 + (fwA - fwB) * 1.2, 0.15, 0.85));
    const pref = winA ? prefA : prefB;
    this.range = pref < -0.35 ? 0 : pref > 0.45 ? 2 : 1;
    if (this.rng.chance(0.25)) this.range = this.rng.int(0, 2) as Range;

    // The fence: a pressure fighter walks the other one back.
    if (this.fence === -1) {
      for (const s of this.s) {
        const o = this.other(s);
        const press = (0.25 + s.d.cage * 0.5 + (s.d.tempo - 1) * 1.2 + s.tr.cage * 0.35) * (0.6 + this.e(s, "footwork") - this.e(o, "footwork") * 0.8 - o.d.defMove * 0.12);
        if (press > 0 && this.rng.chance(clamp(press * 0.18, 0, 0.3))) {
          this.fence = o.i;
          break;
        }
      }
    } else if (this.rng.chance(0.25 + this.e(this.s[this.fence], "footwork") * 0.35)) {
      this.fence = -1;
    }

    const iA = this.initiative(A);
    const iB = this.initiative(B);
    const pace = (iA + iB) / 2;
    const idle = clamp(0.23 - 0.3 * (pace - 0.9), 0.05, 0.45);
    if (this.rng.chance(idle)) {
      this.quiet += 1;
      if (this.logOn && this.crng.chance(0.6)) this.idleText();
      return this.rng.range(2.5, 6.5) / Math.max(0.6, pace);
    }
    this.quiet = 0;
    const att = this.rng.chance(iA / (iA + iB)) ? A : B;
    const def = this.other(att);
    this.agg(att, 0.06);

    // Choose the action.
    const st = (this.ce(att, "boxing") + this.ce(att, "kicks")) / 2;
    const tdSkill = this.ce(att, "takedowns");
    const wStrike = 1.0 * (0.7 + st);
    let wTd = 0.24 * att.d.tdRate * (0.3 + tdSkill) * (0.55 + Math.max(0, this.e(att, "takedowns") - this.e(def, "tdd")) * 1.5);
    if (this.fence === def.i) wTd *= 1.35;
    if (def.stun > 0) wTd *= 0.6;
    if (this.range === 0) wTd *= 0.8;
    wTd *= (1 + 0.3 * att.tr.shot) * (1 - 0.35 * att.tr.sprawl);
    if (this.fence === def.i) wTd *= 1 + 0.4 * att.tr.fence;
    let wClinch = att.d.clinchRate * 0.19 * (0.4 + this.ce(att, "clinchControl"));
    wClinch *= Math.max(0.3, 1 + 0.8 * att.tr.clinch - 0.3 * att.tr.flash + (att.d.jab ? -0.4 : 0));
    if (this.fence === def.i) wClinch *= 1.6;
    if (this.range === 2) wClinch *= 1.5;
    if (att.sta < 35 && att.n.clinchControl > 0.5) wClinch *= 1.6;
    const r = this.rng.next() * (wStrike + wTd + wClinch);
    let dt: number;
    if (r < wTd) dt = this.shoot(att, def, false);
    else if (r < wTd + wClinch) dt = this.enterClinch(att, def);
    else dt = this.combo(att, def);
    return dt;
  }

  private agg(s: Side, v: number) {
    s.agg[this.round - 1] += v;
  }

  private pickStrike(att: Side, def: Side, counter: boolean, k = 0): StrikeDef {
    const kickShare = att.d.kickShare * (0.55 + att.n.kicks) / (0.55 + att.n.boxing * 0.9);
    let best: StrikeDef = STRIKES.jab;
    let total = 0;
    const weights: number[] = [];
    for (const sd of STRIKE_LIST) {
      let w = sd.w * sd.range[this.range];
      if (sd.exclusive) {
        const m = techOf(att.f, sd.tech!);
        if (m <= 0) {
          weights.push(0);
          continue;
        }
        w *= 0.55 + m * 0.45;
      } else if (sd.tech) {
        w *= 1 + techOf(att.f, sd.tech) * 0.16;
      }
      w *= sd.kick ? kickShare * 3.3 : (1 - kickShare) * 1.35;
      if (sd.zone === "head") w *= att.d.targetHead;
      else if (sd.zone === "body") w *= att.d.targetBody;
      else w *= att.d.targetLegs;
      if (sd.id === "jab") w *= 1.25 - att.d.risk * 0.22 + att.n.boxing * 0.3;
      else if (sd.power) w *= 1 + att.d.risk * 0.1;
      if (sd.id === "overhand") w *= 1 + att.d.risk * 0.3 + (att.n.power - 0.5);
      if (sd.id === "calfKick") w *= 1 + techOf(att.f, "calfKick") * 0.3;
      if (counter && sd.kick) w *= 0.25;
      if (counter && (sd.id === "cross" || sd.id === "hook")) w *= 1.6;
      if (att.legs < 50 && sd.kick) w *= att.legs / 50;
      if (def.legs < 55 && sd.zone === "leg") w *= 1.3;
      // Styles.
      const t = att.tr;
      if (sd.id === "jab") w *= 1 + 0.8 * t.jab + (att.d.jab ? 0.9 : 0) - 0.2 * t.power;
      else if (!sd.kick && sd.power) w *= (1 + 0.25 * t.power) * (att.d.jab ? 0.7 : 1);
      if (sd.zone === "body") w *= 1 + 0.6 * t.body;
      if (sd.zone === "leg") w *= k >= 1 ? 1 + 1.4 * t.lowKick : 1 - 0.3 * t.lowKick;
      if (FLASHY.has(sd.id)) w *= 1 + 1.4 * t.flash;
      if (sd.id === "teep") w *= 1 + 1.2 * t.teep;
      else if (sd.id === "bodyKick") w *= 1 + 0.5 * t.teep;
      if (sd.id === "superman") w *= 1 + t.blitz;
      if (sd.id === "bodyKick" || sd.id === "switchKick") w *= 1 + 1.0 * t.kick;
      else if (sd.id === "headKick") w *= 1 + 0.6 * t.kick;
      if (sd.id === "elbow") w *= 1 + 8 * t.elbow;
      // The guard: a smart fighter hits what's left open, and told to, anyone tries.
      // Told to stay on one target, they mostly do.
      const z = ZI[sd.zone];
      const forced = (z === 0 && att.d.targetHead > 1.2) || (z !== 0 && (att.d.targetLegs > 1.5 || att.d.targetBody > 1.5));
      const iq = att.d.exploit ? 1.1 : att.d.mix ? 0.15 : 0.6 * this.e(att, "fightIQ") * (forced ? 0.35 : 1);
      w *= Math.pow(clamp(BASE_READ[z] / def.read[z], 0.4, 2.5), iq);
      // Damage invites more: a hurt body gets hit again by someone who notices.
      if (sd.zone === "body" && def.body < 60) w *= 1 + 0.3 * this.e(att, "fightIQ");
      weights.push(w);
      total += w;
    }
    let x = this.rng.next() * total;
    for (let k = 0; k < STRIKE_LIST.length; k++) {
      x -= weights[k];
      if (x <= 0 && weights[k] > 0) {
        best = STRIKE_LIST[k];
        break;
      }
    }
    return best;
  }

  private combo(att: Side, def: Side): number {
    let n = 1;
    const cont = clamp(0.33 + 0.22 * this.ce(att, "workRate") + 0.07 * att.d.tempo - 0.06 * att.d.risk + 0.07 * att.tr.volume + (def.stun > 0 ? 0.25 : 0), 0.12, 0.76);
    while (n < 5 && this.rng.chance(cont)) n++;
    let prevLanded = false;
    let dt = 1.5 + n * 0.6;
    const log = this.logOn;
    const lead: Hit[] = [];
    const back: Hit[] = [];
    if (log) {
      this.buf = [];
      this.hits = lead;
    }
    let caught = false;
    for (let k = 0; k < n && !this.over; k++) {
      const sd = this.pickStrike(att, def, false, k);
      if (this.catches(def, att, sd)) {
        dt += this.caughtKick(def, att, sd);
        caught = true;
        break;
      }
      prevLanded = this.throwStrike(att, def, sd, k, prevLanded, false);
    }
    if (!this.over && !caught) {
      // The counter.
      const pc = clamp((0.1 + 0.34 * this.ce(def, "counters")) * (0.55 + 0.9 * def.d.counter) * (1 + 0.12 * att.d.risk) * (1 + 0.5 * def.tr.counter) * (def.stun > 0 ? 0.3 : 1), 0, 0.66);
      if (this.rng.chance(pc)) {
        if (log) this.hits = back;
        const m = this.rng.chance(0.3) ? 2 : 1;
        let pl = false;
        for (let k = 0; k < m && !this.over; k++) {
          const sd = this.pickStrike(def, att, true, k);
          pl = this.throwStrike(def, att, sd, k, pl, true);
        }
        dt += 1.2;
      }
    }
    if (log) {
      const held = this.buf ?? [];
      this.buf = null;
      this.hits = null;
      this.tellCombo(att, def, lead, back);
      for (const l of held) this.log.push(l);
    }
    return this.over ? dt : dt + this.rng.range(0.5, 3);
  }

  /** A kick the defender can catch: the body kick, the switch kick, the teep, less often the head kick. */
  private catches(def: Side, att: Side, sd: StrikeDef): boolean {
    if (!def.tr.catch || this.range === 2) return false;
    if (sd.id !== "bodyKick" && sd.id !== "switchKick" && sd.id !== "teep" && sd.id !== "headKick") return false;
    const read = 0.5 * this.e(def, "clinchControl") + 0.5 * this.e(def, "speed") - 0.6 * this.e(att, "kicks") - 0.4 * this.e(att, "speed");
    const p = 0.11 * def.tr.catch * Math.exp(1.2 * read) * (sd.id === "headKick" ? 0.45 : 1) * (def.stun > 0 ? 0.2 : 1);
    return this.rng.chance(clamp(p, 0, 0.35));
  }

  /** The kick is caught: the catcher sweeps the standing leg (a takedown), or holds it and punishes. */
  private caughtKick(c: Side, k: Side, sd: StrikeDef): number {
    const sk = this.rs(k);
    sk.sigA++;
    sk.totA++;
    if (sd.zone === "head") sk.headA++;
    else sk.bodyA++;
    this.spend(k, sd.cost);
    const sc = this.rs(c);
    const kick = sd.name;
    const sweep = clamp(0.5 * Math.exp(1.6 * (0.5 * this.e(c, "takedowns") + 0.5 * this.e(c, "strength") - 0.6 * this.e(k, "tdd") - 0.4 * this.e(k, "footwork"))) * (1 + 0.3 * c.tr.throw), 0.12, 0.8);
    if (this.rng.chance(sweep)) {
      sc.tdA++;
      sc.tdL++;
      c.gimp[this.round - 1] += 1.1;
      this.pos = "ground";
      this.top = c.i;
      const adv = this.e(c, "topControl") - this.e(k, "bottomGame");
      this.gpos = this.rng.chance(0.55 - adv * 0.3) ? "guard" : "half";
      this.fence = -1;
      this.quiet = 0;
      this.say(`${c.name} catches the ${kick} and sweeps the standing leg. ${k.name} is in ${GPOS_NAME[this.gpos]}.`, c.i, false, "td");
      return 3 + this.rng.range(1, 3);
    }
    // Holds the leg and fires a right hand while the kicker hops.
    sc.sigA++;
    sc.totA++;
    sc.headA++;
    this.spend(c, STRIKES.cross.cost);
    const p = clamp(0.62 * Math.exp(1.2 * (this.e(c, "boxing") - this.e(k, "strikeDef"))), 0.25, 0.85);
    if (this.rng.chance(p)) {
      this.say(`${c.name} catches the ${kick} and fires a right hand while ${k.name} hops on one leg.`, c.i, false, "land");
      this.landed(c, k, "head", STRIKES.cross.dmg, STRIKES.cross.ko, "right hand", true, "dist");
    } else this.say(`${c.name} catches the ${kick}, but ${k.name} pulls the leg free.`, c.i, false, "miss");
    return 2;
  }

  /** One line for a combination and one for the counter, then anything big. */
  private tellCombo(att: Side, def: Side, lead: Hit[], back: Hit[]) {
    if (lead.length) this.say(this.comboLine(att, lead, false), att.i, false, lead.some((h) => h.landed) ? "land" : "miss");
    if (back.length) this.say(this.comboLine(def, back, true), def.i, false, back.some((h) => h.landed) ? "land" : "miss");
    // Going where the guard isn't.
    const up = lead.find((h) => h.landed && h.zone === "head");
    if (up && def.read[2] / BASE_READ[2] > 1.55 && !def.noted.up && this.crng.chance(0.7)) {
      def.noted.up = true;
      this.say(`With ${def.name} guarding low, ${att.name} goes upstairs.`, att.i, false, "read");
    }
    const low = lead.find((h) => h.landed && h.zone !== "head");
    if (low && def.read[0] / BASE_READ[0] > 1.22 && !def.noted.down && this.crng.chance(0.7)) {
      def.noted.down = true;
      this.say(`${def.name} is covering up high, so ${att.name} goes ${low.zone === "leg" ? "low" : "to the body"}.`, att.i, false, "read");
    }
  }

  private comboLine(a: Side, hits: Hit[], counter: boolean): string {
    const nm = a.name;
    if (hits.length === 1) {
      const h = hits[0];
      if (h.landed) {
        const what = article(`${h.how ? `${h.how} ` : ""}${h.name}`);
        if (counter) return `${nm} counters with ${what}.`;
        return this.pickText([`${nm} lands ${what}.`, `${nm} connects with ${what}.`, `${nm} finds the target with ${what}.`]);
      }
      const miss = MISS_TEXT[h.how] ?? "misses";
      return counter ? `${nm} tries to counter with ${article(h.name)}, but it ${miss}.` : this.pickText([`${nm}'s ${h.name} ${miss}.`, `${nm} throws ${article(h.name)}; it ${miss}.`]);
    }
    const list = listOf(hits.map((h) => h.name));
    const head = counter ? `${nm} fires back with ${list}` : this.pickText([`${nm} throws ${list}`, `${nm} puts together ${list}`, `${nm} lets go with ${list}`]);
    const landed = hits.filter((h) => h.landed);
    if (!landed.length) return `${head}, but nothing lands clean.`;
    if (landed.length === hits.length) return `${head}, and ${hits.length === 2 ? "both land" : `all ${NUM[hits.length] ?? hits.length} land`}.`;
    return `${head}: ${landedOf(hits)} ${landed.length === 1 ? "lands" : "land"}.`;
  }

  /** Why a strike missed, for the commentary only. */
  private missWhy(def: Side, sd: StrikeDef): string {
    const r = this.crng.next();
    if (sd.zone === "leg") return r < 0.5 ? "short" : "evaded";
    if (sd.kick) return r < 0.55 ? "blocked" : "short";
    if (this.range === 0 && r < 0.35) return "short";
    if (def.d.defGuard || def.read[0] > 0.7) return r < 0.7 ? "blocked" : "slipped";
    if (def.tr.headMove > 0.3 || def.n.strikeDef > 0.6) return r < 0.6 ? "slipped" : r < 0.8 ? "blocked" : "parried";
    return r < 0.4 ? "blocked" : r < 0.75 ? "slipped" : "missed";
  }

  /** The quiet moments: feints, footwork, the fence. */
  private idleText() {
    const [x, y] = this.crng.chance(0.5) ? [this.s[0], this.s[1]] : [this.s[1], this.s[0]];
    if (this.fence >= 0) {
      const wall = this.s[this.fence as 0 | 1];
      const pin = this.other(wall);
      this.say(this.pickText([`${pin.name} keeps ${wall.name} near the fence, looking for the opening.`, `${wall.name} is circling along the fence, trying to get back to the centre.`, `${pin.name} cuts off the exit; ${wall.name} is stuck on the fence.`]));
      return;
    }
    const press = this.s.find((q) => q.d.cage || q.d.tempo > 1.1);
    if (press && this.crng.chance(0.35)) {
      this.say(`${press.name} walks forward; ${this.other(press).name} circles away.`);
      return;
    }
    this.say(this.pickText(
      this.range === 0
        ? [`They circle at long range, both looking for the distance.`, `${x.name} flicks out a feint; ${y.name} doesn't bite.`, `${x.name} pumps the lead hand, measuring the distance.`, `A quiet moment: ${x.name} and ${y.name} reset in the centre.`]
        : [`${x.name} feints, ${y.name} flinches. Nothing thrown.`, `They're standing in range, both waiting for the other to commit.`, `${x.name} changes levels with a feint.`, `${x.name} switches stance to give a different look.`],
    ));
  }

  /** The state of the fighters, said once when it shows. */
  private cues() {
    for (const s of this.s) {
      const she = s.f.sex === "F";
      const cue = (key: string, cond: boolean, text: string) => {
        if (cond && !s.noted[key]) {
          s.noted[key] = true;
          this.say(text, (1 - s.i) as 0 | 1, false, "state");
        }
      };
      cue("sta45", s.sta < 45, `${s.name} is breathing through the mouth now.`);
      cue("sta25", s.sta < 25, `${s.name} is exhausted: the hands are dropping.`);
      cue("leg55", s.legs < 55, `${s.name}'s lead leg is reddening from the kicks.`);
      cue("leg35", s.legs < 35, `${s.name} is limping: the leg is badly hurt.`);
      cue("body55", s.body < 55, `${s.name} winces every time ${she ? "she" : "he"} is hit to the body.`);
      cue("head50", s.head < 50, `${s.name} is badly marked up.`);
    }
  }

  private throwStrike(att: Side, def: Side, sd: StrikeDef, k: number, prevLanded: boolean, counter: boolean): boolean {
    const st = this.rs(att);
    st.sigA++;
    st.totA++;
    if (sd.zone === "head") st.headA++;
    else if (sd.zone === "body") st.bodyA++;
    else st.legA++;
    this.spend(att, sd.cost);
    const off = 0.55 * this.e(att, sd.skill) + 0.25 * this.e(att, "speed") + 0.2 * this.e(att, "fightIQ");
    let defv: number;
    if (sd.zone === "leg") defv = 0.45 * this.e(def, "strikeDef") + 0.35 * this.e(def, "footwork") + 0.2 * this.e(def, "speed");
    else defv = 0.55 * this.e(def, "strikeDef") + 0.25 * this.e(def, "speed") + 0.2 * this.e(def, "footwork");
    defv += def.d.defMove * 0.025 + techOf(def.f, "checkKicks") * (sd.zone === "leg" ? 0.012 : 0);
    if (!sd.kick) defv += 0.035 * def.tr.headMove;
    if (sd.zone === "leg" && def.d.checkLegs) defv += 0.02;
    let p = sd.acc * 1.1 * Math.exp(1.55 * (off - defv)) * this.sloppy;
    // Where the guard is: the level it has moved to is covered, the others are open.
    const z = ZI[sd.zone];
    p *= clamp(Math.pow(BASE_READ[z] / def.read[z], 0.45), 0.62, 1.35);
    const t = att.tr;
    if (sd.id === "jab") p *= 1 + 0.1 * t.jab;
    if (sd.power && !sd.kick) p *= 1 - 0.05 * t.power;
    if (this.range === 0 && !sd.kick) p *= 1 + 0.1 * t.blitz;
    if (FLASHY.has(sd.id)) p *= 1 + 0.08 * t.flash;
    if (counter) p *= 1 + 0.08 * t.counter;
    // Reach wins at range for the straight shots and the kicks; inside, in the
    // pocket, the shorter arms throw the tighter punches and the longer fighter
    // gives some of it back, which is why the shorter man wants to close the gap.
    const reach = att.f.reach - def.f.reach;
    if (this.range === 0) p *= 1 + clamp(reach, -8, 8) * 0.012;
    else if (this.range === 1) p *= 1 - clamp(reach, -8, 8) * 0.005;
    if (sd.tech && !sd.exclusive) p *= 1 + techOf(att.f, sd.tech) * 0.035;
    if (sd.exclusive) p *= 0.85 + techOf(att.f, sd.tech!) * 0.07;
    if (def.d.defGuard) p *= sd.zone === "head" ? 0.84 : 1.1;
    if (this.fence === def.i) p *= 1.08;
    if (def.stun > 0) p *= 1.55;
    if (k > 0) p *= prevLanded ? 1.06 : 0.95;
    if (counter) p *= 1.1;
    // Opponent pressure on a counter-striker makes him miss less... counter fighters read leads.
    if (!counter && def.d.counter > 0.6) p *= 1 - (def.d.counter - 0.6) * 0.18 * def.n.counters;
    p = clamp(p, 0.04, 0.93);
    if (!this.rng.chance(p)) {
      let how = "";
      // Checked leg kick: the kicker eats the shin. More often when the defender is waiting for it.
      if (sd.zone === "leg" && this.rng.chance((0.08 + techOf(def.f, "checkKicks") * 0.07) * clamp(def.read[2] / BASE_READ[2], 0.7, 2.2) * (def.d.checkLegs ? 1.4 : 1))) {
        att.legs = clamp(att.legs - 1.6 * (1.1 - 0.4 * att.n.toughness), 0, 100);
        how = "checked";
      }
      this.adapt(def, att, sd.zone, false);
      if (this.hits) this.hits.push({ name: sd.name, zone: sd.zone, landed: false, how: how || this.missWhy(def, sd) });
      return false;
    }
    this.adapt(def, att, sd.zone, true);
    if (this.hits) this.hits.push({ name: sd.name, zone: sd.zone, landed: true, how: "" });
    this.landed(att, def, sd.zone, sd.dmg, sd.ko, sd.name, counter, "dist");
    return true;
  }

  /** A strike that landed: damage, stats, judging, and the knockout check. */
  private landed(att: Side, def: Side, zone: Zone, dmg: number, ko: number, name: string, counter: boolean, where: "dist" | "clinch" | "ground") {
    const st = this.rs(att);
    st.sigL++;
    st.totL++;
    st[zone === "leg" ? "leg" : zone]++;
    st[where]++;
    att.unanswered = 0;
    def.unanswered++;
    att.lastLanded = this.t;
    const q = 0.55 + 0.75 * Math.pow(this.rng.next(), 2.2);
    const power = (0.5 + 0.9 * this.e(att, "power")) * (0.95 + 0.2 * (att.n.strength - 0.5));
    let force = dmg * power * q * (counter ? 1.18 : 1);
    if (where === "ground") force *= 0.92;
    const t = att.tr;
    if (where !== "ground" && !/kick|knee|teep/.test(name)) force *= 1 + 0.12 * t.power;
    if (zone === "body") force *= 1 + 0.08 * t.body;
    else if (zone === "leg") force *= 1 + 0.1 * t.lowKick;
    if (zone !== "leg" && /kick/.test(name)) force *= 1 + 0.12 * t.kick;
    if (name === "elbow") force *= 1 + 0.08 * t.elbow;
    if (counter) force *= 1 + 0.08 * t.counter;
    if (where === "ground") force *= 1 + 0.1 * t.gnp;
    if (this.hits?.length) {
      const h = this.hits[this.hits.length - 1];
      if (h.landed && h.name === name) h.how = force < 0.55 ? "glancing" : force > 1.25 ? "clean" : force > 0.95 ? "hard" : "";
    }
    if (zone === "head") {
      const absorb = 1.18 - 0.36 * def.n.chin;
      def.head = clamp(def.head - force * 2.15 * absorb, 0, 100);
      // Cuts.
      const cutP = (where === "ground" ? 0.012 : 0.004) * force * (name.includes("elbow") ? 4 : 1);
      if (this.rng.chance(cutP)) this.cutOpen(def);
    } else if (zone === "body") {
      const absorb = 1.15 - 0.35 * def.n.toughness;
      def.body = clamp(def.body - force * 2.0 * absorb, 0, 100);
      this.spend(def, force * 1.7);
      def.cap = Math.min(def.cap, 100 - 0.42 * (100 - def.body));
    } else {
      const absorb = 1.15 - 0.35 * def.n.toughness;
      def.legs = clamp(def.legs - force * 2.35 * absorb, 0, 100);
    }
    const weight = zone === "head" ? 1 : zone === "body" ? 0.8 : 0.62;
    att.imp[this.round - 1] += force * weight;
    att.dmgDealt[this.round - 1] += force;
    if (this.logOn) this.strikeText(att, def, name, zone, force, where);

    // The knockout check.
    if (zone === "head" && ko > 0) {
      const fresh = this.round === 1 ? 1.22 : this.round === 2 ? 1.0 : 0.92;
      const impact = fresh * ko * force * this.punch * (1 + 0.7 * Math.pow(1 - def.head / 100, 1.3)) * (def.stun > 0 ? 1.45 : 1) * (counter ? 1.2 : 1);
      const x = impact / def.chinRes;
      const pKD = clamp(0.0086 * Math.pow(x, 3.4) * (this.sloppy * this.sloppy), 0, 0.6);
      if (this.rng.chance(pKD)) {
        this.knockdown(att, def, name, x, where);
        return;
      }
      const pRock = clamp(0.02 * Math.pow(x, 2.6), 0, 0.45);
      if (def.stun <= 0 && this.rng.chance(pRock)) {
        def.stun = 5 + this.rng.next() * 8;
        def.wobbled++;
        att.imp[this.round - 1] += 2.2;
        this.say(this.pickText([`${def.name} is rocked by the ${name}!`, `${def.name} is hurt! The ${name} landed flush.`, `Big ${name}! ${def.name}'s legs dip.`]), att.i, true, "rock");
        return;
      }
    }
    // Body shots can fold a fighter.
    if (zone === "body" && def.body < 38 && force > 0.85) {
      const pFold = clamp(0.03 * force * (1 - def.body / 38) * (1.3 - def.n.toughness), 0, 0.25);
      if (this.rng.chance(pFold)) {
        this.finish(att, "TKO", where === "clinch" ? "Knee to the body" : name.includes("kick") ? "Body kick" : "Punches to the body");
        this.say(`${def.name} folds from the ${name}! The referee waves it off.`, att.i, true, "finish");
        return;
      }
    }
    // Leg kicks can take the legs away.
    if (zone === "leg" && def.legs < 12) {
      if (this.rng.chance(0.22 * (1 - def.legs / 12))) {
        this.finish(att, "TKO", "Leg kicks");
        this.say(`${def.name}'s leg gives out! It's over by leg kicks.`, att.i, true, "finish");
        return;
      }
    }
    // A stunned fighter taking unanswered shots gets saved by the referee.
    if (def.stun > 0 || def.head < 18) {
      const danger = (def.stun > 0 ? 0.03 : 0.009) * Math.min(def.unanswered, 6) * (1.4 - def.head / 100) * (where === "ground" ? 1.3 : 1);
      if (this.rng.chance(clamp(danger * (1.25 - def.n.heart * 0.5), 0, 0.6))) {
        const what = where === "ground" ? (name.includes("elbow") ? "Elbows" : "Punches") : name.includes("kick") || name.includes("knee") ? "Strikes" : "Punches";
        this.finish(att, "TKO", what);
        this.say(`${def.name} can't defend himself and the referee steps in! TKO.`.replace("himself", def.f.sex === "F" ? "herself" : "himself"), att.i, true, "finish");
      }
    }
  }

  private cutOpen(s: Side) {
    if (s.cut >= 3) return;
    s.cut++;
    this.say(s.cut === 1 ? `${s.name} is cut.` : s.cut === 2 ? `That cut on ${s.name} is getting worse.` : `${s.name} is bleeding badly.`, 1 - s.i as 0 | 1, s.cut >= 2, "cut");
  }

  private knockdown(att: Side, def: Side, name: string, x: number, where: "dist" | "clinch" | "ground") {
    def.kd++;
    this.rs(att).kd++;
    att.imp[this.round - 1] += 6.5;
    // Out cold?
    const pOut = clamp(0.14 + 0.2 * (x - 1) - def.n.chin * 0.08 + (def.kd - 1) * 0.12, 0.06, 0.7);
    if (this.rng.chance(pOut)) {
      const what = this.koName(name);
      this.finish(att, "KO", what);
      this.say(this.pickText([`${def.name} is out cold! What ${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}!`, `KNOCKOUT! The ${name} put ${def.name} down and out!`, `Lights out! ${att.name} lands the ${name} and ${def.name} is finished.`]), att.i, true, "finish");
      return;
    }
    def.stun = 6 + this.rng.next() * 7;
    def.head = clamp(def.head - 6, 0, 100);
    this.say(this.pickText([`${def.name} goes down from the ${name}!`, `KNOCKDOWN! ${att.name}'s ${name} drops ${def.name}!`, `Down goes ${def.name}! The ${name} landed clean.`]), att.i, true, "kd");
    // Follow him down?
    const follow = att.d.finish ? 0.8 : 0.5;
    if (where !== "ground" && this.rng.chance(follow * (0.6 + att.n.aggression * 0.5))) {
      this.pos = "ground";
      this.top = att.i;
      this.gpos = this.rng.chance(0.5) ? "half" : this.rng.chance(0.5) ? "guard" : "side";
      this.fence = -1;
      // Immediate ground and pound.
      const h = this.hits;
      this.hits = null;
      this.say(`${att.name} follows ${def.name} down, looking to finish.`, att.i, false, "pass");
      for (let k = 0; k < 2 && !this.over; k++) this.gnpStrike(att, def);
      this.hits = h;
    }
  }

  private koName(name: string): string {
    if (name.includes("head kick") || name.includes("question")) return "Head kick";
    if (name.includes("flying knee")) return "Flying knee";
    if (name.includes("knee")) return "Knee";
    if (name.includes("spinning")) return "Spinning backfist";
    if (name.includes("elbow")) return "Elbow";
    if (name.includes("superman")) return "Superman punch";
    return this.rng.chance(0.55) ? "Punch" : "Punches";
  }

  private finish(att: Side, method: Method, detail: string) {
    this.recordCondition();
    this.over = true;
    this.winner = att.i;
    this.method = method;
    this.detail = detail;
    this.endRound = this.round;
    this.endTime = this.t;
  }

  private strikeText(att: Side, def: Side, name: string, zone: Zone, force: number, where: string) {
    // In a combination the summary line tells the ordinary shots; only the big ones get their own.
    if (this.hits && force <= 1.25) return;
    if (!this.hits && force < 0.75 && !this.crng.chance(0.25)) return;
    const big = force > 1.25;
    let t: string;
    if (where === "ground") {
      t = big ? this.pickText([`${att.name} drops a heavy ${name} from the top.`, `Hard ${name} from ${att.name} on the ground.`]) : `${att.name} lands a ${name} from on top.`;
    } else if (zone === "leg") {
      t = big ? `${att.name} chops the lead leg with a hard ${name}.` : `${att.name} lands a ${name}.`;
    } else if (zone === "body") {
      t = big ? this.pickText([`${att.name} digs a hard ${name} in.`, `Thudding ${name} from ${att.name}.`]) : `${att.name} goes to the body.`;
    } else {
      t = big ? this.pickText([`${att.name} lands a clean ${name}!`, `Big ${name} from ${att.name}!`, `${att.name} snaps ${def.name}'s head back with a ${name}.`]) : this.pickText([`${att.name} lands a ${name}.`, `${att.name} finds the target with a ${name}.`]);
    }
    this.say(t, att.i, big);
  }

  // ---------- takedowns and the clinch ----------

  private shoot(att: Side, def: Side, fromClinch: boolean, chained = false): number {
    const st = this.rs(att);
    st.tdA++;
    this.spend(att, fromClinch ? 2.2 : 3.1);
    this.spend(def, 1.5);
    this.agg(att, 0.12);
    let off: number;
    let dfn: number;
    let base: number;
    let tech: number;
    if (fromClinch) {
      off = 0.45 * this.e(att, "clinchControl") + 0.3 * this.e(att, "takedowns") + 0.25 * this.e(att, "strength");
      dfn = 0.5 * this.e(def, "tdd") + 0.3 * this.e(def, "clinchControl") + 0.2 * this.e(def, "strength");
      base = 0.37;
      tech = Math.max(techOf(att.f, "bodyLock"), techOf(att.f, "trip"), techOf(att.f, "judoThrow"), techOf(att.f, "cageWrestling"));
    } else {
      off = 0.6 * this.e(att, "takedowns") + 0.22 * this.e(att, "speed") + 0.18 * this.e(att, "strength");
      dfn = 0.6 * this.e(def, "tdd") + 0.2 * this.e(def, "strength") + 0.2 * this.e(def, "footwork");
      base = 0.3;
      tech = Math.max(techOf(att.f, "doubleLeg"), techOf(att.f, "singleLeg"));
    }
    dfn += def.d.defTdd * 0.05 + techOf(def.f, "sprawl") * 0.015 + def.tr.sprawl * 0.04;
    let p = base * Math.exp(2.3 * (off - dfn)) * (1 + tech * 0.05) * this.sloppy;
    p *= fromClinch ? 1 + 0.1 * att.tr.throw + 0.08 * att.tr.fence : 1 + 0.12 * att.tr.shot;
    if (chained) p *= 1.06;
    if (this.fence === def.i) p *= 1.2;
    if (def.stun > 0) p *= 1.5;
    if (def.sta < 30) p *= 1.15;
    p = clamp(p, 0.04, 0.88);
    if (this.rng.chance(p)) {
      st.tdL++;
      att.gimp[this.round - 1] += 1.35;
      this.pos = "ground";
      this.top = att.i;
      const adv = this.e(att, "topControl") - this.e(def, "bottomGame");
      const r = this.rng.next();
      this.gpos = r < 0.48 - adv * 0.4 ? "guard" : r < 0.8 - adv * 0.2 ? "half" : r < 0.93 ? "side" : this.rng.chance(0.5) ? "back" : "mount";
      // A thrower lands in side control.
      if (fromClinch && att.tr.throw > 0 && this.gpos !== "back" && this.gpos !== "mount" && this.rng.chance(0.45 * att.tr.throw)) this.gpos = "side";
      this.fence = -1;
      this.quiet = 0;
      const how = fromClinch
        ? att.tr.throw > 0.3 || techOf(att.f, "judoThrow") >= 2
          ? this.pickText(["hits a beautiful hip toss", "throws him with a harai goshi", "turns the body lock into a throw"])
          : att.tr.fence > 0.3
            ? this.pickText(["drags him down off the fence", "finishes the body lock against the cage", "mat-returns him off the fence"])
            : this.pickText(["trips him to the mat", "drags him down off the fence", "finishes the body lock takedown", "hits a hip toss"])
        : chained
          ? this.pickText(["switches to the single and finishes", "runs the pipe on the single and gets it", "keeps chaining and finally gets him down"])
          : att.tr.shot > 0.3
            ? this.pickText(["explodes through a double leg from the outside", "times the double under the punches", "blasts through with a double"])
            : this.pickText(["shoots a double leg and puts him down", "changes levels and finishes the single", "blasts through with a double", "times the shot perfectly"]);
      this.say(`${att.name} ${how.replace("him", def.f.sex === "F" ? "her" : "him")}. ${def.name} is in ${GPOS_NAME[this.gpos]}.`, att.i, false, "td");
      return 6 + this.rng.range(2, 6);
    }
    // Defended.
    this.say(
      def.tr.sprawl > 0.3
        ? this.pickText([`${def.name} sprawls hard and stuffs it.`, `${att.name} shoots; ${def.name}'s hips are already back.`])
        : fromClinch
          ? this.pickText([`${def.name} defends the takedown against the fence.`, `${def.name} keeps the underhooks and stays up.`])
          : this.pickText([`${def.name} stuffs the takedown.`, `${att.name} shoots, but ${def.name} sprawls.`, `Good takedown defence from ${def.name}.`]),
      def.i, false, "tdd",
    );
    // Front headlock and a choke for a defender who knows it.
    if (!fromClinch) {
      const g = Math.max(techOf(def.f, "guillotine"), techOf(def.f, "darce"));
      if (this.rng.chance((0.012 + g * 0.03) * (0.4 + def.n.subs))) {
        this.subAttempt(def, att, techOf(def.f, "darce") > techOf(def.f, "guillotine") ? "darce" : "guillotine", "front headlock");
        if (this.over) return 4;
      }
      // A chain wrestler doesn't stop at one.
      if (!chained && att.tr.chain > 0 && att.sta > 25 && this.rng.chance(0.42 * att.tr.chain)) {
        this.say(`${att.name} doesn't let go: ${att.f.sex === "F" ? "she" : "he"} chains straight into another attempt.`, att.i, false, "td");
        return 2 + this.shoot(att, def, false, true);
      }
      if (this.rng.chance(0.2)) {
        this.pos = "clinch";
        this.ctrl = this.rng.chance(0.5) ? att.i : def.i;
        this.fence = this.rng.chance(0.6) ? def.i : -1;
      }
    }
    return 4 + this.rng.range(1, 5);
  }

  private enterClinch(att: Side, def: Side): number {
    this.spend(att, 1.2);
    const p = clamp(0.48 + 0.75 * (this.e(att, "clinchControl") - 0.5 * this.e(def, "footwork") - 0.5 * this.e(def, "clinchControl")) - (def.d.clinchRate < 0.4 ? 0.12 : 0), 0.15, 0.85);
    if (!this.rng.chance(p)) {
      this.say(`${def.name} circles away from the clinch.`, def.i);
      return 3 + this.rng.range(0, 3);
    }
    this.pos = "clinch";
    const cc = this.e(att, "clinchControl") + 0.05 - this.e(def, "clinchControl");
    this.ctrl = this.rng.chance(clamp(0.55 + cc, 0.2, 0.85)) ? att.i : def.i;
    if (this.fence === -1 && this.rng.chance(0.45 + att.d.cage * 0.25)) this.fence = (1 - this.ctrl) as 0 | 1;
    this.say(this.fence >= 0 ? `${this.s[this.ctrl].name} pins ${this.s[1 - this.ctrl].name} against the fence.` : `They clinch up in the centre.`, this.ctrl);
    return 3 + this.rng.range(1, 4);
  }

  private clinch(): number {
    const c = this.s[this.ctrl];
    const o = this.other(c);
    const cAct = this.rng.chance(clamp(0.6 + (this.e(c, "clinchControl") - this.e(o, "clinchControl")) * 0.6, 0.35, 0.82));
    const actor = cAct ? c : o;
    const foe = this.other(actor);
    this.spend(c, 0.6);
    this.spend(o, 1.0);
    // Wants out?
    const wantsOut = actor.d.clinchRate < 0.45 || (actor === o && actor.d.clinchRate < 0.8);
    const wStrike = (0.85 + this.ce(actor, "clinchStrikes") * 1.0 + techOf(actor.f, "plumKnees") * 0.15) * (1 + 0.6 * actor.tr.clinch);
    const wTd = actor.d.tdRate * (0.25 + this.ce(actor, "clinchControl")) * (actor === c ? 1.25 : 0.4) * (this.fence === foe.i ? 1.3 : 1)
      * (1 + (this.fence === foe.i ? 0.6 : 0.25) * actor.tr.fence + 0.4 * actor.tr.throw) * (1 - 0.35 * actor.tr.sprawl);
    const wBreak = (wantsOut ? 1.4 : 0.5) * (actor === o ? 1.5 : 0.8);
    const wHold = actor === c ? 0.45 * (0.5 + actor.d.cage) : 0.15;
    const wRev = actor === o ? 0.35 : 0;
    const r = this.rng.next() * (wStrike + wTd + wBreak + wHold + wRev);
    if (r < wStrike) {
      const n = 1 + (this.rng.chance(0.55) ? 1 : 0) + (this.rng.chance(0.2) ? 1 : 0);
      const hits: Hit[] = [];
      if (this.logOn) {
        this.buf = [];
        this.hits = hits;
      }
      for (let k = 0; k < n && !this.over; k++) {
        const kind = this.rng.choose({
          kneeBody: (1.1 + techOf(actor.f, "plumKnees") * 0.3) * (1 + 0.6 * actor.tr.clinch),
          kneeHead: (0.35 + techOf(actor.f, "plumKnees") * 0.25) * (1 + 0.6 * actor.tr.clinch),
          elbow: (0.35 + techOf(actor.f, "elbows") * 0.35) * (1 + 2.5 * actor.tr.elbow),
          dirty: 1.0,
        });
        const cs = CLINCH_STRIKES[kind];
        const st = this.rs(actor);
        st.sigA++;
        st.totA++;
        if (cs.zone === "head") st.headA++;
        else st.bodyA++;
        this.spend(actor, cs.cost);
        const off = 0.6 * this.e(actor, "clinchStrikes") + 0.25 * this.e(actor, "clinchControl") + 0.15 * this.e(actor, "fightIQ");
        const dfn = 0.45 * this.e(foe, "clinchControl") + 0.35 * this.e(foe, "strikeDef") + 0.2 * this.e(foe, "strength");
        const p = clamp(cs.acc * Math.exp(1.4 * (off - dfn)) * (actor === c ? 1.08 : 0.9) * (1 + 0.06 * actor.tr.clinch) * this.sloppy, 0.08, 0.9);
        if (this.rng.chance(p)) {
          this.hits?.push({ name: cs.name, zone: cs.zone, landed: true, how: "" });
          this.landed(actor, foe, cs.zone, cs.dmg, cs.ko, cs.name, false, "clinch");
        } else this.hits?.push({ name: cs.name, zone: cs.zone, landed: false, how: "blocked" });
      }
      if (this.logOn) {
        const held = this.buf ?? [];
        this.buf = null;
        this.hits = null;
        const landed = hits.filter((h) => h.landed);
        if (hits.length) {
          this.say(
            landed.length
              ? `In the clinch, ${actor.name} lands ${listOf(landed.map((h) => h.name))}${landed.length < hits.length ? `; ${foe.name} blocks the rest` : ""}.`
              : `${actor.name} works for ${listOf(hits.map((h) => h.name))} in the clinch, but ${foe.name} blocks ${hits.length === 1 ? "it" : "them"}.`,
            actor.i, false, landed.length ? "land" : "miss",
          );
        }
        for (const l of held) this.log.push(l);
      }
      // A little dirty work that isn't significant.
      this.rs(actor).totA += 2;
      this.rs(actor).totL += 1;
      return 5 + this.rng.range(1, 6);
    }
    if (r < wStrike + wTd) return this.shoot(actor, foe, true);
    if (r < wStrike + wTd + wBreak) {
      const p = clamp(0.5 + 0.6 * (this.e(actor, "footwork") * 0.4 + this.e(actor, "clinchControl") * 0.6 - this.e(foe, "clinchControl") * 0.8) + (actor === c ? 0.35 : 0), 0.2, 0.95);
      if (this.rng.chance(p)) {
        this.pos = "dist";
        this.fence = -1;
        this.say(this.pickText([`${actor.name} breaks free.`, `They separate.`, `${actor.name} pushes off and resets.`]), actor.i);
      }
      return 3 + this.rng.range(1, 4);
    }
    if (r < wStrike + wTd + wBreak + wHold) {
      this.quiet++;
      if (this.quiet >= 2 && this.rng.chance(0.35)) {
        this.pos = "dist";
        this.fence = -1;
        this.quiet = 0;
        this.say(`The referee separates them.`);
      }
      return 6 + this.rng.range(2, 8);
    }
    // Reversal of position on the fence.
    const p = clamp(0.32 + 0.8 * (this.e(actor, "clinchControl") - this.e(foe, "clinchControl")), 0.08, 0.7);
    if (this.rng.chance(p)) {
      this.ctrl = actor.i;
      if (this.fence >= 0) this.fence = foe.i;
      this.say(`${actor.name} turns ${foe.name} onto the fence.`, actor.i);
    }
    return 4 + this.rng.range(1, 4);
  }

  // ---------- the ground ----------

  private ground(): number {
    const T = this.s[this.top];
    const B = this.other(T);
    const pTop = clamp(0.55 + (this.e(T, "topControl") - this.e(B, "bottomGame")) * 0.5 + (B.stun > 0 ? 0.2 : 0), 0.35, 0.85);
    this.spend(T, 0.75);
    this.spend(B, 1.05);
    if (this.rng.chance(pTop)) return this.topMove(T, B);
    return this.bottomMove(B, T);
  }

  private posFactor(g: GPos): number {
    return g === "mount" ? 1.55 : g === "back" ? 1.3 : g === "side" ? 1.2 : g === "half" ? 1 : 0.75;
  }

  private topMove(T: Side, B: Side): number {
    const strikerTop = T.plan.takedowns <= 1 && (T.n.boxing + T.n.kicks) / 2 > T.n.topControl + 0.08;
    const wGnp = 1.0 * T.d.topGnp * (0.35 + this.ce(T, "groundStrikes")) * this.posFactor(this.gpos) * (B.stun > 0 ? 2.2 : 1) * (1 + techOf(T.f, "gnp") * 0.1) * (1 + 0.6 * T.tr.gnp);
    const wPass = this.gpos === "mount" || this.gpos === "back" ? 0.06 : 0.55 * T.d.topPass * (0.4 + this.ce(T, "topControl"));
    const subs = SUB_TOP[this.gpos];
    const wSub = subs.length ? this.subMul * 0.075 * T.d.topSub * (0.45 + this.ce(T, "subs") * 1.0) * (this.gpos === "back" ? 2.2 * (1 + 0.5 * T.tr.back) : this.gpos === "mount" ? 1.3 : 1) * (B.stun > 0 ? 1.3 : 1) * (1 + 0.4 * T.tr.pass) : 0;
    const wHold = 0.3 * T.d.topHold;
    const wUp = strikerTop ? 0.6 : 0.03;
    const r = this.rng.next() * (wGnp + wPass + wSub + wHold + wUp);
    T.gimp[this.round - 1] += 0.12 * this.posFactor(this.gpos);
    if (r < wGnp) {
      const n = 1 + (this.rng.chance(0.55) ? 1 : 0) + (this.rng.chance(0.3) ? 1 : 0) + (B.stun > 0 ? 2 : 0);
      const hits: Hit[] = [];
      const where = GPOS_NAME[this.gpos];
      if (this.logOn) {
        this.buf = [];
        this.hits = hits;
      }
      for (let k = 0; k < n && !this.over; k++) this.gnpStrike(T, B);
      if (this.logOn) {
        const held = this.buf ?? [];
        this.buf = null;
        this.hits = null;
        const landed = hits.filter((h) => h.landed).length;
        if (hits.length) {
          this.say(
            landed
              ? `${T.name} drops ${listOf(hits.map((h) => h.name))} from ${where}: ${landed === hits.length ? (hits.length === 1 ? "it lands" : hits.length === 2 ? "both land" : "all of them land") : `${NUM[landed]} ${landed === 1 ? "lands" : "land"}`}.`
              : `${T.name} rains down shots from ${where}, but ${B.name} covers up.`,
            T.i, false, landed ? "land" : "miss",
          );
        }
        for (const l of held) this.log.push(l);
      }
      this.rs(T).totA += 2;
      this.rs(T).totL += 1;
      this.quiet = 0;
      return 5 + this.rng.range(1, 6);
    }
    if (r < wGnp + wPass) {
      this.spend(T, 1.2);
      const p = clamp(0.2 * Math.exp(2.1 * (this.e(T, "topControl") - this.e(B, "bottomGame"))) * (1 + 0.3 * T.tr.pass) * this.sloppy, 0.04, 0.6);
      if (this.rng.chance(p)) {
        const prev = this.gpos;
        const backTake = techOf(T.f, "backTake");
        if (this.gpos === "guard") this.gpos = this.rng.chance(0.78) ? "half" : "side";
        else if (this.gpos === "half") this.gpos = this.rng.chance(0.66 - backTake * 0.05 - T.tr.back * 0.12) ? "side" : this.rng.chance(0.55 - T.tr.back * 0.2) ? "mount" : "back";
        else if (this.gpos === "side") this.gpos = this.rng.chance(0.58 - backTake * 0.06 - T.tr.back * 0.15) ? "mount" : "back";
        T.gimp[this.round - 1] += this.gpos === "mount" || this.gpos === "back" ? 1.1 : 0.45;
        this.quiet = 0;
        this.say(`${T.name} ${this.gpos === "back" ? "takes the back" : this.gpos === "mount" ? "climbs to full mount" : "passes to " + GPOS_NAME[this.gpos]}${prev === "guard" && this.gpos !== "half" ? "" : ""}.`, T.i, this.gpos === "mount" || this.gpos === "back", "pass");
      } else if (this.logOn && this.crng.chance(0.35)) {
        this.say(this.pickText([`${T.name} works to pass, but ${B.name} keeps ${T.f.sex === "F" ? "her" : "him"} in ${GPOS_NAME[this.gpos]}.`, `${B.name} recovers the guard as ${T.name} tries to pass.`]), B.i);
      }
      return 5 + this.rng.range(2, 7);
    }
    if (r < wGnp + wPass + wSub) {
      const sub = this.pickSub(T, subs);
      this.subAttempt(T, B, sub, GPOS_NAME[this.gpos]);
      return 7 + this.rng.range(2, 8);
    }
    if (r < wGnp + wPass + wSub + wHold) {
      this.quiet++;
      if (this.logOn && this.crng.chance(0.35)) this.say(this.pickText([`${T.name} keeps heavy pressure in ${GPOS_NAME[this.gpos]}.`, `${T.name} holds ${B.name} down, controlling the wrists.`, `${B.name} is stuck under ${T.name} in ${GPOS_NAME[this.gpos]}.`]), T.i);
      this.rs(T).totA += 2;
      this.rs(T).totL += 1;
      if (this.quiet >= 5 && this.rng.chance(0.18)) this.standUp("The referee stands them up for inactivity.");
      return 6 + this.rng.range(2, 8);
    }
    this.standUp(`${T.name} lets ${B.name} back up.`);
    return 3;
  }

  private standUp(text: string) {
    this.pos = "dist";
    this.fence = -1;
    this.quiet = 0;
    this.say(text);
  }

  private gnpStrike(T: Side, B: Side) {
    const kind = this.rng.choose({ punch: 1.3, elbow: 0.35 + techOf(T.f, "elbows") * 0.3, body: 0.35 });
    const gs = GROUND_STRIKES[kind];
    const st = this.rs(T);
    st.sigA++;
    st.totA++;
    if (kind === "body") st.bodyA++;
    else st.headA++;
    this.spend(T, gs.cost);
    const off = 0.65 * this.e(T, "groundStrikes") + 0.35 * this.e(T, "topControl");
    const dfn = 0.55 * this.e(B, "bottomGame") + 0.45 * this.e(B, "strikeDef");
    const p = clamp(gs.acc * Math.exp(1.3 * (off - dfn)) * (0.75 + 0.25 * this.posFactor(this.gpos)) * (B.stun > 0 ? 1.35 : 1) * this.sloppy, 0.12, 0.95);
    if (this.rng.chance(p)) {
      this.hits?.push({ name: gs.name, zone: kind === "body" ? "body" : "head", landed: true, how: "" });
      this.landed(T, B, kind === "body" ? "body" : "head", gs.dmg, gs.ko, gs.name, false, "ground");
    } else this.hits?.push({ name: gs.name, zone: kind === "body" ? "body" : "head", landed: false, how: "blocked" });
  }

  private bottomMove(B: Side, T: Side): number {
    const esc: Record<GPos, number> = { guard: 1.25, half: 1, side: 0.65, mount: 0.38, back: 0.32 };
    const wUp = 1.25 * B.d.botUp * esc[this.gpos] * (0.5 + B.n.bottomGame * 0.3 + B.n.scrambles * 0.3) * Math.max(0.2, 1 + 0.3 * B.tr.scramble + 0.3 * B.tr.sprawl - 0.4 * B.tr.guard);
    const wSweep = (this.gpos === "guard" || this.gpos === "half" ? 0.28 * B.d.botSweep : 0.06) * (1 + 0.4 * B.tr.guard + 0.2 * B.tr.scramble);
    const subs = SUB_BOTTOM[this.gpos];
    const wSub = subs.length ? this.subMul * 0.065 * B.d.botSub * (0.35 + this.ce(B, "subs") * 1.2) * (1 + 0.8 * B.tr.guard + 0.6 * B.tr.legs) : 0;
    const wStrike = this.gpos === "guard" ? 0.3 : 0.08;
    const wTie = 0.25;
    const r = this.rng.next() * (wUp + wSweep + wSub + wStrike + wTie);
    if (r < wUp) {
      this.spend(B, 2.2);
      const base: Record<GPos, number> = { guard: 0.56, half: 0.46, side: 0.3, mount: 0.15, back: 0.17 };
      const off = 0.4 * this.e(B, "bottomGame") + 0.3 * this.e(B, "scrambles") + 0.3 * this.e(B, "strength");
      const dfn = 0.7 * this.e(T, "topControl") + 0.3 * this.e(T, "strength");
      let p = base[this.gpos] * Math.exp(2.1 * (off - dfn)) * (1 + techOf(B.f, "wallWalk") * 0.08) * (B.stun > 0 ? 0.4 : 1) * (1 - techOf(T.f, "legRide") * 0.05)
        * (1 + 0.25 * B.tr.scramble + 0.15 * B.tr.sprawl) * (1 - 0.12 * T.tr.pass);
      if (this.gpos === "back") p *= 1 - techOf(T.f, "bodyTriangle") * 0.12;
      p = clamp(p, 0.02, 0.75);
      if (this.rng.chance(p)) {
        if (this.rng.chance(0.25)) {
          this.pos = "clinch";
          this.ctrl = this.rng.chance(0.6) ? T.i : B.i;
          this.fence = this.rng.chance(0.65) ? B.i : -1;
          this.say(`${B.name} gets back to the feet, but ${this.s[this.ctrl].name} keeps hold.`, B.i);
        } else {
          this.pos = "dist";
          this.fence = -1;
          this.say(this.pickText([`${B.name} scrambles back to the feet.`, `${B.name} wall-walks up.`, `${B.name} gets up.`]), B.i);
        }
        this.quiet = 0;
        return 5 + this.rng.range(1, 5);
      }
      if (this.gpos === "mount" && this.rng.chance(0.2)) {
        this.gpos = "back";
        this.say(`${B.name} gives up the back trying to escape.`, T.i);
      } else if ((this.gpos === "half" || this.gpos === "side" || this.gpos === "guard") && this.rng.chance(0.06 + techOf(T.f, "backTake") * 0.035 + this.e(T, "scrambles") * 0.04 + T.tr.back * 0.06)) {
        this.gpos = "back";
        T.gimp[this.round - 1] += 1;
        this.say(`${B.name} turns to get up and ${T.name} takes the back!`, T.i, true, "pass");
      } else if (this.logOn && this.crng.chance(0.5)) {
        this.say(this.pickText([`${B.name} tries to stand, but ${T.name} drags ${B.f.sex === "F" ? "her" : "him"} back down.`, `${B.name} gets to a knee; ${T.name} flattens ${B.f.sex === "F" ? "her" : "him"} out again.`]), T.i);
      }
      return 6 + this.rng.range(1, 6);
    }
    if (r < wUp + wSweep) {
      this.spend(B, 1.8);
      const p = clamp(0.1 * Math.exp(2 * (0.55 * this.e(B, "bottomGame") + 0.45 * this.e(B, "scrambles") - this.e(T, "topControl"))) * (1 + 0.15 * B.tr.guard + 0.15 * B.tr.scramble), 0.02, 0.4);
      if (this.rng.chance(p)) {
        this.top = B.i;
        this.gpos = this.rng.chance(0.7) ? "guard" : "half";
        this.rs(B).rev++;
        B.gimp[this.round - 1] += 1.1;
        this.quiet = 0;
        this.say(`${B.name} sweeps and comes up on top!`, B.i, true, "sweep");
      } else if (this.logOn && this.crng.chance(0.4)) {
        this.say(`${B.name} looks for a sweep, but ${T.name} stays heavy.`, T.i);
      }
      return 6 + this.rng.range(1, 5);
    }
    if (r < wUp + wSweep + wSub) {
      const sub = this.pickSub(B, subs);
      this.subAttempt(B, T, sub, `bottom ${GPOS_NAME[this.gpos]}`);
      return 6 + this.rng.range(2, 7);
    }
    if (r < wUp + wSweep + wSub + wStrike) {
      const st = this.rs(B);
      st.sigA++;
      st.totA++;
      st.headA++;
      const p = clamp(0.35 * Math.exp(1.2 * (this.e(B, "groundStrikes") - this.e(T, "strikeDef"))), 0.1, 0.6);
      if (this.rng.chance(p)) this.landed(B, T, "head", techOf(B.f, "elbows") > 0 ? 0.65 : 0.45, 0.2, "elbow off the back", false, "ground");
      return 4 + this.rng.range(1, 4);
    }
    this.quiet++;
    if (this.logOn && this.crng.chance(0.3)) this.say(`${B.name} ties up ${T.name}'s arms from the bottom.`, B.i);
    return 7 + this.rng.range(2, 8);
  }

  private pickSub(s: Side, list: [string, number][]): string {
    const w: Record<string, number> = {};
    for (const [id, base] of list) w[id] = base * (1 + techOf(s.f, SUB_TECH[id]) * 0.6) * (s.f.tech[SUB_TECH[id]] === undefined && (id === "heelHook" || id === "darce") ? 0.15 : 1) * (id === "heelHook" || id === "kneebar" ? 1 + 2.5 * s.tr.legs : 1);
    return this.rng.choose(w);
  }

  private subAttempt(att: Side, def: Side, sub: string, from: string) {
    const st = this.rs(att);
    st.subA++;
    this.spend(att, 2.6);
    this.spend(def, 2.1);
    this.quiet = 0;
    const subName = SUB_NAMES[sub] ?? sub;
    const posSkill = this.pos === "ground" && this.top === att.i ? this.e(att, "topControl") : this.e(att, "bottomGame");
    const off = 0.6 * this.e(att, "subs") + 0.25 * posSkill + 0.15 * this.e(att, "strength");
    const dfn = 0.65 * this.e(def, "subDef") + 0.2 * this.e(def, "scrambles") + 0.15 * this.e(def, "strength");
    const mastery = techOf(att.f, SUB_TECH[sub]);
    let p = 0.82 * (SUB_BASE[sub] ?? 0.12) * Math.exp(2.7 * (off - dfn)) * (1 + mastery * 0.14) * this.sloppy;
    if (def.stun > 0) p *= 1.6;
    if (def.sta < 25) p *= 1.25;
    if (sub === "rnc" && techOf(att.f, "bodyTriangle") > 0) p *= 1.08;
    if (sub === "rnc") p *= 1 + 0.08 * att.tr.back;
    if (sub === "heelHook" || sub === "kneebar") p *= 1 + 0.1 * att.tr.legs;
    p *= this.pos === "ground" && this.top === att.i ? 1 + 0.06 * att.tr.pass : 1 + 0.08 * att.tr.guard;
    p = clamp(p, 0.02, 0.82);
    att.gimp[this.round - 1] += 0.6;
    const deep = this.rng.chance(clamp(p * 1.6, 0, 0.95));
    this.say(`${att.name} attacks with a ${subName} from ${from}${deep ? " and it looks tight!" : "."}`, att.i, deep, "sub");
    if (deep) att.gimp[this.round - 1] += 1.4;
    if (this.rng.chance(p)) {
      const label = subName.charAt(0).toUpperCase() + subName.slice(1);
      this.finish(att, "SUB", label);
      this.say(this.pickText([`${def.name} taps! ${att.name} wins by ${subName}.`, `It's over! ${def.name} taps to the ${subName}.`, `${def.name} has to tap. A beautiful ${subName}.`]), att.i, true, "finish");
      return;
    }
    // Defended: the position may change.
    this.say(this.pickText([`${def.name} defends and escapes.`, `${def.name} survives the ${subName}.`, `${def.name} pops free.`]), def.i);
    if (this.pos === "ground") {
      if (this.top === att.i) {
        if (this.rng.chance(0.28)) {
          this.top = def.i;
          this.gpos = "guard";
          this.say(`${def.name} ends up on top after the scramble.`, def.i);
        } else if (this.gpos === "mount" || this.gpos === "back") {
          if (this.rng.chance(0.35)) this.gpos = this.rng.chance(0.5) ? "half" : "guard";
        }
      } else if (this.rng.chance(0.15)) {
        this.pos = "dist";
      }
    } else {
      if (this.rng.chance(0.5)) {
        this.pos = "ground";
        this.top = def.i;
        this.gpos = "guard";
      }
    }
  }

  // ---------- rounds and judging ----------

  /** The state of both fighters, kept with the round's statistics. */
  private recordCondition() {
    for (const s of this.s) {
      const st = this.rs(s);
      st.hd = Math.round(s.head);
      st.bd = Math.round(s.body);
      st.lg = Math.round(s.legs);
      st.st = Math.round(s.sta);
      st.gd = s.read.map((x) => Math.round(x * 100)) as [number, number, number];
    }
  }

  private finishRound() {
    this.recordCondition();
    const r = this.round - 1;
    // Doctor check on a bad cut.
    for (const s of this.s) {
      if (s.cut >= 3 && this.rng.chance(0.38)) {
        this.t = this.roundSec;
        this.finish(this.other(s), "TKO", "Doctor stoppage");
        this.endTime = this.roundSec;
        this.say(`The doctor has seen enough of ${s.name}'s cut. The fight is stopped between rounds.`, this.other(s).i, true, "finish");
        this.scoreRound(r);
        return;
      }
    }
    this.scoreRound(r);
    const [A, B] = this.s;
    if (this.logOn) {
      const ja = this.cards[r].filter((j) => j[0] > j[1]).length;
      const jb = this.cards[r].filter((j) => j[1] > j[0]).length;
      this.say(`End of round ${this.round}. ${ja > jb ? A.name : jb > ja ? B.name : "Nobody"} probably took it.`, undefined, true, "round");
    }
    if (this.round >= this.rounds) {
      this.decide();
      return;
    }
    // A corner can save a badly beaten fighter.
    for (const s of this.s) {
      const losing = this.scoreDiff(s) <= -2;
      if (s.head < 14 && losing && this.rng.chance(0.35)) {
        this.finish(this.other(s), "TKO", "Corner stoppage");
        this.endTime = this.roundSec;
        this.say(`${s.name}'s corner throws in the towel.`, this.other(s).i, true, "finish");
        return;
      }
    }
    // Rest between rounds.
    for (const s of this.s) {
      s.sta = clamp(s.sta + (s.cap - s.sta) * (0.42 + 0.35 * s.n.recovery), 0, s.cap);
      s.cap = Math.max(40, s.cap - 3.5 * (1.25 - s.n.cardio));
      s.head = clamp(s.head + 3 + 5 * s.n.recovery, 0, 100);
      s.stun = 0;
      s.unanswered = 0;
    }
    this.between = true;
  }

  private scoreRound(r: number) {
    const [A, B] = this.s;
    const row: [number, number][] = [];
    for (const j of this.judges) {
      const effA = A.imp[r] * (1 - j.lean) + A.gimp[r] * (1 + j.lean * 2) + (A.cond.home ? 0.3 : 0);
      const effB = B.imp[r] * (1 - j.lean) + B.gimp[r] * (1 + j.lean * 2) + (B.cond.home ? 0.3 : 0);
      const sd = (0.75 + 0.055 * (effA + effB)) * j.noise * (this.sloppy > 1 ? 1.15 : 1);
      let diff = effA - effB + this.rng.normal(0, sd);
      if (Math.abs(diff) < 0.35) {
        diff += (A.agg[r] - B.agg[r]) * 0.6 + (A.ctl[r] - B.ctl[r]) / 120 + this.rng.normal(0, 0.12);
      }
      if (Math.abs(diff) < 0.02) {
        row.push([10, 10]);
        continue;
      }
      const w = diff > 0 ? A : B;
      const l = diff > 0 ? B : A;
      const we = diff > 0 ? effA : effB;
      const le = diff > 0 ? effB : effA;
      // 10-8: impact, dominance and duration.
      const kd = this.rs(w).kd;
      let p108 = 0;
      if (we > 2.8 * le + 8) p108 = 0.2 + Math.min(0.45, (we - 2.8 * le - 8) * 0.05);
      if (kd >= 2) p108 = Math.max(p108, 0.55);
      if (kd >= 1 && we > 2 * le + 6) p108 = Math.max(p108, 0.35);
      const loser = this.rng.chance(p108) ? (we > 4 * le + 16 && kd >= 2 && this.rng.chance(0.3) ? 7 : 8) : 9;
      row.push(w === A ? [10, loser] : [loser, 10]);
    }
    // A point taken away comes off every card.
    for (const j of row) {
      j[0] -= A.ded[r] ?? 0;
      j[1] -= B.ded[r] ?? 0;
    }
    this.cards[r] = row;
  }

  /** The scorecards: after the last round, or a technical decision when an accidental foul ends the fight late on. */
  private decide(technical = false) {
    const totals: [number, number][] = [0, 1, 2].map((j) => {
      let a = 0;
      let b = 0;
      for (const r of this.cards) {
        a += r[j][0];
        b += r[j][1];
      }
      return [a, b];
    });
    const aWins = totals.filter(([a, b]) => a > b).length;
    const bWins = totals.filter(([a, b]) => b > a).length;
    const draws = 3 - aWins - bWins;
    this.over = true;
    this.endRound = technical ? this.round : this.rounds;
    this.endTime = technical ? this.t : this.roundSec;
    const tech = technical ? "Technical " : "";
    if (aWins >= 2 || bWins >= 2) {
      this.winner = aWins >= 2 ? 0 : 1;
      this.method = "DEC";
      const verdict = aWins === 3 || bWins === 3 ? "Unanimous" : draws === 1 ? "Majority" : "Split";
      this.detail = technical ? `${tech}${verdict.toLowerCase()}` : verdict;
    } else {
      this.winner = null;
      this.method = "DRAW";
      const d = draws === 3 ? "Unanimous draw" : draws === 2 ? "Majority draw" : "Split draw";
      this.detail = technical ? `${tech}${d.toLowerCase()}` : d;
    }
  }

  /** How likely a fighter is to foul: the aggressive, the undisciplined and the tired. */
  private foulRisk(s: Side): number {
    return clamp(0.55 + 0.7 * s.n.aggression - 0.55 * s.n.discipline + 0.35 * (1 - s.sta / 100), 0.15, 1.6);
  }

  /**
   * A foul in this exchange, about one fight in eight: an eye poke or a low blow on the
   * feet, a knee to the groin or a grab of the fence in the clinch, shots to the back of
   * the head or an illegal knee on the mat. The referee warns first and takes a point for
   * a repeat or a flagrant foul (three points and you're out). A fighter who can't go on
   * after an accidental foul ends the fight: a no contest before the halfway mark, the
   * scorecards after it; a deliberate foul is a disqualification.
   */
  private maybeFoul() {
    if (this.over || this.between) return;
    const rate = this.pos === "ground" ? 0.001 : this.pos === "clinch" ? 0.0011 : 0.0014;
    if (!this.rng.chance(rate)) return;
    const [A, B] = this.s;
    const ra = this.foulRisk(A);
    const rb = this.foulRisk(B);
    const att = this.pos === "ground" ? this.s[this.top] : this.rng.chance(ra / (ra + rb)) ? A : B;
    const def = this.other(att);
    const kinds: [Foul, number][] =
      this.pos === "dist"
        ? [
            [{ what: "Eye poke", line: `${att.name}'s fingers go into ${def.name}'s eye, and the referee calls time.`, hurt: 2, flagrant: 0.1, out: 0.035, intent: 0.05, poke: true }, 0.6],
            [{ what: "Low blow", line: `A kick from ${att.name} lands low. ${def.name} goes down holding the groin, and the referee calls time.`, hurt: 0, flagrant: 0.1, out: 0.02, intent: 0.03, low: true }, 0.4],
          ]
        : this.pos === "clinch"
          ? [
              [{ what: "Knee to the groin", line: `A knee in the clinch from ${att.name} lands low, and time is called.`, hurt: 0, flagrant: 0.1, out: 0.02, intent: 0.03, low: true }, 0.6],
              [{ what: "Grabbing the fence", line: `${att.name} grabs the fence to stay up. The referee steps in.`, hurt: 0, flagrant: 0.15, out: 0, intent: 0 }, 0.4],
            ]
          : [
              [{ what: "Strikes to the back of the head", line: `${att.name} is landing on the back of ${def.name}'s head. The referee stops the action.`, hurt: 3, flagrant: 0.1, out: 0.01, intent: 0.2 }, 0.55],
              [{ what: "Illegal knee", line: `${att.name} drives a knee into the head of a grounded ${def.name}! That's illegal.`, hurt: 14, flagrant: 0.55, out: 0.22, intent: 0.6 }, 0.45],
            ];
    let x = this.rng.next() * kinds.reduce((a, [, wt]) => a + wt, 0);
    let foul = kinds[0][0];
    for (const [k, wt] of kinds) {
      x -= wt;
      if (x <= 0) {
        foul = k;
        break;
      }
    }
    att.fouls++;
    this.say(foul.line, att.i, true, "foul");
    if (foul.hurt) def.head = clamp(def.head - foul.hurt, 0, 100);
    if (foul.hurt >= 10) def.stun = Math.max(def.stun, 4 + this.rng.next() * 4);
    if (foul.poke) def.poked = 25 + this.rng.next() * 40;
    if (foul.out && this.rng.chance(foul.out)) {
      this.foulStop(att, def, foul);
      return;
    }
    if (foul.poke || foul.low) this.say(`${def.name} takes the time to recover${foul.low ? ", up to the five minutes allowed" : ""}, and they go again.`, def.i, false, "foul");
    // The referee: a warning first, a point for a repeat or a flagrant foul, out after three points.
    const point = this.rng.chance(foul.flagrant) || (att.fouls >= 2 && this.rng.chance(0.8)) || att.fouls >= 3;
    if (!point) {
      this.say(`The referee warns ${att.name}${att.fouls >= 2 ? ": the next one costs a point" : ""}.`, def.i, false, "foul");
      return;
    }
    att.ded[this.round - 1] = (att.ded[this.round - 1] ?? 0) + 1;
    const total = att.ded.reduce((a, b) => a + b, 0);
    this.say(`The referee takes a point from ${att.name}${total > 1 ? `, the ${total === 2 ? "second" : "third"} of the fight` : ""}.`, def.i, true, "foul");
    if (total >= 3) {
      this.finish(def, "DQ", "Repeated fouls");
      this.say(`${att.name} is disqualified for repeated fouls. ${def.name} wins.`, def.i, true, "finish");
    }
  }

  /** A fighter can't go on after a foul: a disqualification if it was deliberate; if not, a no contest early, the scorecards late. */
  private foulStop(att: Side, def: Side, foul: Foul) {
    if (this.rng.chance(foul.intent)) {
      this.finish(def, "DQ", foul.what);
      this.say(`${def.name} can't continue, and the referee rules it deliberate: ${att.name} is disqualified.`, def.i, true, "finish");
      return;
    }
    // Before two rounds of three (three of five) are done it's a no contest; after that, the cards.
    const half = this.rounds >= 5 ? 3 : 2;
    const what = foul.what.toLowerCase();
    if (this.round - 1 < half) {
      this.recordCondition();
      this.over = true;
      this.winner = null;
      this.method = "NC";
      this.detail = `Accidental ${what}`;
      this.endRound = this.round;
      this.endTime = this.t;
      this.say(`${def.name} can't continue after the accidental ${what}. The fight is a no contest.`, undefined, true, "finish");
      return;
    }
    this.recordCondition();
    this.scoreRound(this.round - 1);
    this.decide(true);
    this.say(`${def.name} can't continue after the accidental ${what}. It goes to the scorecards: a technical decision.`, undefined, true, "finish");
  }

  outcome(): FightOutcome {
    const [A, B] = this.s;
    const sum = (s: Side) => {
      const t = blankRound();
      for (const r of s.rs) for (const k of Object.keys(t) as StatKey[]) t[k] += r[k];
      return t;
    };
    const tA = sum(A);
    const tB = sum(B);
    tA.ctrl = Math.round(tA.ctrl);
    tB.ctrl = Math.round(tB.ctrl);
    // Whole seconds of control in the record; the fight itself is left as it is (reading the result changes nothing).
    const whole = (r: RoundStat): RoundStat => ({ ...r, ctrl: Math.round(r.ctrl) });
    const cards: [number, number][] | undefined = this.cards.length
      ? [0, 1, 2].map((j) => {
          let a = 0;
          let b = 0;
          for (const r of this.cards) {
            if (!r) continue;
            a += r[j][0];
            b += r[j][1];
          }
          return [a, b] as [number, number];
        })
      : undefined;
    const rcards = this.cards.map((r) => r.map(([a, b]) => `${a}-${b}`));
    const impA = A.imp.reduce((x, y) => x + y, 0) + A.gimp.reduce((x, y) => x + y, 0);
    const impB = B.imp.reduce((x, y) => x + y, 0) + B.gimp.reduce((x, y) => x + y, 0);
    const share = impA + impB > 0 ? impA / (impA + impB) : 0.5;
    const perf = (s: 0 | 1): number => {
      const sh = s === 0 ? share : 1 - share;
      let v = 3 + sh * 5;
      if (this.winner === s) v += this.method === "DEC" ? 1 : 2.2 - (this.endRound - 1) * 0.25;
      if (this.winner === 1 - s) v -= 0.6;
      return Math.round(clamp(v, 1, 10) * 10) / 10;
    };
    const kdTot = tA.kd + tB.kd;
    const excitement =
      (tA.sigL + tB.sigL) / (this.endRound * 5 + 4) + kdTot * 2.5 + (tA.subA + tB.subA) * 0.8 +
      (this.method === "DEC" ? (1 - Math.abs(share - 0.5) * 2) * 4 : 3) + A.wobbled + B.wobbled;
    let verdict: BoutResult["verdict"];
    if (this.method === "DEC") verdict = this.detail.toLowerCase().replace("technical ", "") as BoutResult["verdict"];
    else if (this.method === "DRAW") verdict = "draw";
    return {
      winner: this.winner === null ? null : this.winner === 0 ? "a" : "b",
      method: this.method,
      detail: this.detail,
      round: this.endRound,
      time: Math.round(this.endTime),
      cards,
      rcards,
      verdict,
      stats: [tA, tB],
      rounds: A.rs.map((r, k) => [whole(r), whole(B.rs[k])] as [RoundStat, RoundStat]),
      log: this.logOn ? this.log : undefined,
      perf: [perf(0), perf(1)],
      sides: this.s,
      excitement,
    };
  }
}

/** Play a whole fight. */
export function simulate(input: FightInput): FightOutcome {
  return new FightSim(input).run();
}

/** Chance for A to win, estimated by playing the fight several times. */
export function winChance(input: FightInput, n = 24): number {
  let w = 0;
  for (let k = 0; k < n; k++) {
    const r = simulate({ ...input, seed: (input.seed + k * 7919) >>> 0, log: false });
    if (r.winner === "a") w += 1;
    else if (r.winner === null) w += 0.5;
  }
  return w / n;
}

export function methodText(m: Method, detail: string): string {
  if (m === "DEC") return `${detail} decision`;
  if (m === "DRAW") return detail;
  if (m === "SUB") return `Submission (${detail.toLowerCase()})`;
  if (m === "KO" || m === "TKO") return `${m} (${detail.toLowerCase()})`;
  if (m === "NC") return detail ? `No contest (${detail.toLowerCase()})` : "No contest";
  if (m === "DQ") return `Disqualification (${detail.toLowerCase()})`;
  return m;
}

/** A finish: a knockout or a submission (not a decision, a draw, a no contest or a disqualification). */
export function isFinish(m: Method | undefined): boolean {
  return m === "KO" || m === "TKO" || m === "SUB";
}

/** The method in a sentence: "knockout (head kick)", "submission (armbar)", "split decision". */
export function methodPhrase(m: Method, detail: string): string {
  const d = detail.toLowerCase();
  if (m === "KO") return `knockout (${d})`;
  if (m === "TKO") return `TKO (${d})`;
  if (m === "SUB") return `submission (${d})`;
  if (m === "DEC") return `${d} decision`;
  if (m === "DRAW") return d;
  if (m === "NC") return d ? `no contest (${d})` : "no contest";
  if (m === "DQ") return `disqualification (${d})`;
  return m;
}

export const STRIKE_IDS: StrikeId[] = Object.keys(STRIKES) as StrikeId[];
