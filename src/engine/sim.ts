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
import { applyShout, dialsOf, suggestPlan, type Dials, type FightPlan, type Shout } from "./plan";
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
  shout: Shout | null;
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
}

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
      f, i, name: f.surname, n, plan, base: plan, d: dialsOf(plan), shout: null,
      sta: cap, cap, head: 100, body: 100, legs: 100, stun: 0, cut: 0, kd: 0, cond, chinRes,
      rs: [], imp: [], gimp: [], agg: [], ctl: [], dmgDealt: [], unanswered: 0, lastLanded: 0, wobbled: 0,
      night: 1 + this.rng.normal(0, 0.08 * (1.45 - f.hid.consistency / 20)),
      lvl: Math.max(0.15, ATTRS.reduce((a, k) => a + n[k], 0) / ATTRS.length),
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
    if (s.cond.injury > 0) v *= 1 - s.cond.injury * 0.12;
    if (s.cond.prep) v *= 1 + s.cond.prep * 0.025;
    if (s.cond.home && (k === "composure" || k === "heart")) v *= 1.04;
    if (k === "footwork" || k === "tdd" || k === "speed") v *= 0.72 + 0.28 * (s.legs / 100);
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

  private say(text: string, side?: 0 | 1, big = false, kind?: string) {
    if (!this.logOn) return;
    this.log.push({ r: this.round, t: Math.round(this.t), text, side, big, kind });
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
    }
  }

  // ---------- the loop ----------

  /** One exchange. Returns the seconds it took. */
  step(): number {
    if (this.over || this.between) return 0;
    let dt: number;
    if (this.pos === "dist") dt = this.distance();
    else if (this.pos === "clinch") dt = this.clinch();
    else dt = this.ground();
    if (this.over) return dt;
    const left = this.roundSec - this.t;
    if (dt > left) dt = left;
    this.t += dt;
    this.recover(dt);
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

  /** Corner time: AI corners adjust, then the next round starts. */
  nextRound() {
    if (!this.between || this.over) return;
    for (const s of this.s) if (this.aiCorner[s.i]) this.aiAdjust(s);
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
    const s = this.s[i];
    s.base = plan;
    s.plan = s.shout ? applyShout(plan, s.shout) : plan;
    s.d = dialsOf(s.plan);
  }

  /** A shout from the corner, followed or not depending on discipline and damage. */
  shout(i: 0 | 1, sh: Shout): boolean {
    const s = this.s[i];
    const listen = 0.45 + 0.45 * s.n.discipline - (s.stun > 0 ? 0.25 : 0) - (1 - s.head / 100) * 0.2;
    if (!this.rng.chance(clamp(listen, 0.15, 0.95))) {
      this.say(`${s.name}'s corner is shouting, but ${s.name} isn't listening.`, s.i, false, "corner");
      return false;
    }
    s.shout = sh;
    s.plan = applyShout(s.base, sh);
    s.d = dialsOf(s.plan);
    this.say(`${s.name} hears the corner and changes it up.`, s.i, false, "corner");
    return true;
  }

  private expireShouts() {
    // shouts last until the end of the round
  }

  /** Between rounds the corner gives water, works the cut, and fixes the plan. */
  corner(i: 0 | 1, focus: "recover" | "cut" | "tactics" | "head") {
    const s = this.s[i];
    if (focus === "recover") s.sta = clamp(s.sta + 6 + 6 * s.n.recovery, 0, s.cap);
    if (focus === "cut" && s.cut > 0) s.cut = Math.max(0, s.cut - (this.rng.chance(0.55) ? 1 : 0));
    if (focus === "head") s.head = clamp(s.head + 4 + 3 * s.n.recovery, 0, 100);
  }

  private aiAdjust(s: Side) {
    // Reset any shout, then tweak for the state of the fight.
    s.shout = null;
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
    s.plan = p;
    s.d = dialsOf(p);
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
    const fwA = this.e(A, "footwork") + A.d.defMove * 0.08;
    const fwB = this.e(B, "footwork") + B.d.defMove * 0.08;
    const winA = this.rng.chance(clamp(0.5 + (fwA - fwB) * 1.2, 0.15, 0.85));
    const pref = winA ? prefA : prefB;
    this.range = pref < -0.35 ? 0 : pref > 0.45 ? 2 : 1;
    if (this.rng.chance(0.25)) this.range = this.rng.int(0, 2) as Range;

    // The fence: a pressure fighter walks the other one back.
    if (this.fence === -1) {
      for (const s of this.s) {
        const o = this.other(s);
        const press = (0.25 + s.d.cage * 0.5 + (s.d.tempo - 1) * 1.2) * (0.6 + this.e(s, "footwork") - this.e(o, "footwork") * 0.8 - o.d.defMove * 0.12);
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
    let wClinch = att.d.clinchRate * 0.19 * (0.4 + this.ce(att, "clinchControl"));
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

  private pickStrike(att: Side, def: Side, counter: boolean): StrikeDef {
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
    const cont = clamp(0.33 + 0.22 * this.ce(att, "workRate") + 0.07 * att.d.tempo - 0.06 * att.d.risk + (def.stun > 0 ? 0.25 : 0), 0.12, 0.72);
    while (n < 5 && this.rng.chance(cont)) n++;
    let prevLanded = false;
    let dt = 1.5 + n * 0.6;
    for (let k = 0; k < n && !this.over; k++) {
      const sd = this.pickStrike(att, def, false);
      prevLanded = this.throwStrike(att, def, sd, k, prevLanded, false);
    }
    if (this.over) return dt;
    // The counter.
    const pc = clamp((0.1 + 0.34 * this.ce(def, "counters")) * (0.55 + 0.9 * def.d.counter) * (1 + 0.12 * att.d.risk) * (def.stun > 0 ? 0.3 : 1), 0, 0.62);
    if (this.rng.chance(pc)) {
      const m = this.rng.chance(0.3) ? 2 : 1;
      let pl = false;
      for (let k = 0; k < m && !this.over; k++) {
        const sd = this.pickStrike(def, att, true);
        pl = this.throwStrike(def, att, sd, k, pl, true);
      }
      dt += 1.2;
    }
    return dt + this.rng.range(0.5, 3);
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
    let p = sd.acc * 1.08 * Math.exp(1.55 * (off - defv)) * this.sloppy;
    // Reach matters at range for straight shots and kicks.
    const reach = att.f.reach - def.f.reach;
    if (this.range === 0) p *= 1 + clamp(reach, -8, 8) * 0.012;
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
      // Checked leg kick: the kicker eats the shin.
      if (sd.zone === "leg" && this.rng.chance(0.08 + techOf(def.f, "checkKicks") * 0.07)) {
        att.legs = clamp(att.legs - 1.6 * (1.1 - 0.4 * att.n.toughness), 0, 100);
        if (this.logOn && this.crng.chance(0.4)) this.say(`${def.name} checks the ${sd.name}.`, def.i);
      }
      return false;
    }
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
      this.say(this.pickText([`${def.name} is out cold! What a ${name}!`, `KNOCKOUT! The ${name} put ${def.name} down and out!`, `Lights out! ${att.name} lands the ${name} and ${def.name} is finished.`]), att.i, true, "finish");
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
      for (let k = 0; k < 2 && !this.over; k++) this.gnpStrike(att, def);
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
    this.over = true;
    this.winner = att.i;
    this.method = method;
    this.detail = detail;
    this.endRound = this.round;
    this.endTime = this.t;
  }

  private strikeText(att: Side, def: Side, name: string, zone: Zone, force: number, where: string) {
    if (force < 0.75 && !this.crng.chance(0.25)) return;
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

  private shoot(att: Side, def: Side, fromClinch: boolean): number {
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
    dfn += def.d.defTdd * 0.05 + techOf(def.f, "sprawl") * 0.015;
    let p = base * Math.exp(2.3 * (off - dfn)) * (1 + tech * 0.05) * this.sloppy;
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
      this.fence = -1;
      this.quiet = 0;
      const how = fromClinch
        ? this.pickText(["trips him to the mat", "drags him down off the fence", "finishes the body lock takedown", "hits a hip toss"])
        : this.pickText(["shoots a double leg and puts him down", "changes levels and finishes the single", "blasts through with a double", "times the shot perfectly"]);
      this.say(`${att.name} ${how.replace("him", def.f.sex === "F" ? "her" : "him")}. ${def.name} is in ${GPOS_NAME[this.gpos]}.`, att.i, false, "td");
      return 6 + this.rng.range(2, 6);
    }
    // Defended.
    this.say(this.pickText([`${def.name} stuffs the takedown.`, `${att.name} shoots, but ${def.name} sprawls.`, `Good takedown defence from ${def.name}.`]), def.i, false, "tdd");
    // Front headlock and a choke for a defender who knows it.
    if (!fromClinch) {
      const g = Math.max(techOf(def.f, "guillotine"), techOf(def.f, "darce"));
      if (this.rng.chance((0.012 + g * 0.03) * (0.4 + def.n.subs))) {
        this.subAttempt(def, att, techOf(def.f, "darce") > techOf(def.f, "guillotine") ? "darce" : "guillotine", "front headlock");
        if (this.over) return 4;
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
    const wStrike = 0.85 + this.ce(actor, "clinchStrikes") * 1.0 + techOf(actor.f, "plumKnees") * 0.15;
    const wTd = actor.d.tdRate * (0.25 + this.ce(actor, "clinchControl")) * (actor === c ? 1.25 : 0.4) * (this.fence === foe.i ? 1.3 : 1);
    const wBreak = (wantsOut ? 1.4 : 0.5) * (actor === o ? 1.5 : 0.8);
    const wHold = actor === c ? 0.45 * (0.5 + actor.d.cage) : 0.15;
    const wRev = actor === o ? 0.35 : 0;
    const r = this.rng.next() * (wStrike + wTd + wBreak + wHold + wRev);
    if (r < wStrike) {
      const n = 1 + (this.rng.chance(0.55) ? 1 : 0) + (this.rng.chance(0.2) ? 1 : 0);
      for (let k = 0; k < n && !this.over; k++) {
        const kind = this.rng.choose({
          kneeBody: 1.1 + techOf(actor.f, "plumKnees") * 0.3,
          kneeHead: 0.35 + techOf(actor.f, "plumKnees") * 0.25,
          elbow: 0.35 + techOf(actor.f, "elbows") * 0.35,
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
        const p = clamp(cs.acc * Math.exp(1.4 * (off - dfn)) * (actor === c ? 1.08 : 0.9) * this.sloppy, 0.08, 0.9);
        if (this.rng.chance(p)) this.landed(actor, foe, cs.zone, cs.dmg, cs.ko, cs.name, false, "clinch");
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
    const wGnp = 1.0 * T.d.topGnp * (0.35 + this.ce(T, "groundStrikes")) * this.posFactor(this.gpos) * (B.stun > 0 ? 2.2 : 1) * (1 + techOf(T.f, "gnp") * 0.1);
    const wPass = this.gpos === "mount" || this.gpos === "back" ? 0.06 : 0.55 * T.d.topPass * (0.4 + this.ce(T, "topControl"));
    const subs = SUB_TOP[this.gpos];
    const wSub = subs.length ? this.subMul * 0.075 * T.d.topSub * (0.45 + this.ce(T, "subs") * 1.0) * (this.gpos === "back" ? 2.2 : this.gpos === "mount" ? 1.3 : 1) * (B.stun > 0 ? 1.3 : 1) : 0;
    const wHold = 0.3 * T.d.topHold;
    const wUp = strikerTop ? 0.6 : 0.03;
    const r = this.rng.next() * (wGnp + wPass + wSub + wHold + wUp);
    T.gimp[this.round - 1] += 0.12 * this.posFactor(this.gpos);
    if (r < wGnp) {
      const n = 1 + (this.rng.chance(0.55) ? 1 : 0) + (this.rng.chance(0.3) ? 1 : 0) + (B.stun > 0 ? 2 : 0);
      for (let k = 0; k < n && !this.over; k++) this.gnpStrike(T, B);
      this.rs(T).totA += 2;
      this.rs(T).totL += 1;
      this.quiet = 0;
      return 5 + this.rng.range(1, 6);
    }
    if (r < wGnp + wPass) {
      this.spend(T, 1.2);
      const p = clamp(0.2 * Math.exp(2.1 * (this.e(T, "topControl") - this.e(B, "bottomGame"))) * this.sloppy, 0.04, 0.6);
      if (this.rng.chance(p)) {
        const prev = this.gpos;
        const backTake = techOf(T.f, "backTake");
        if (this.gpos === "guard") this.gpos = this.rng.chance(0.78) ? "half" : "side";
        else if (this.gpos === "half") this.gpos = this.rng.chance(0.66 - backTake * 0.05) ? "side" : this.rng.chance(0.55) ? "mount" : "back";
        else if (this.gpos === "side") this.gpos = this.rng.chance(0.58 - backTake * 0.06) ? "mount" : "back";
        T.gimp[this.round - 1] += this.gpos === "mount" || this.gpos === "back" ? 1.1 : 0.45;
        this.quiet = 0;
        this.say(`${T.name} ${this.gpos === "back" ? "takes the back" : this.gpos === "mount" ? "climbs to full mount" : "passes to " + GPOS_NAME[this.gpos]}${prev === "guard" && this.gpos !== "half" ? "" : ""}.`, T.i, this.gpos === "mount" || this.gpos === "back", "pass");
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
    if (this.rng.chance(p)) this.landed(T, B, kind === "body" ? "body" : "head", gs.dmg, gs.ko, gs.name, false, "ground");
  }

  private bottomMove(B: Side, T: Side): number {
    const esc: Record<GPos, number> = { guard: 1.25, half: 1, side: 0.65, mount: 0.38, back: 0.32 };
    const wUp = 1.25 * B.d.botUp * esc[this.gpos] * (0.5 + B.n.bottomGame * 0.3 + B.n.scrambles * 0.3);
    const wSweep = this.gpos === "guard" || this.gpos === "half" ? 0.28 * B.d.botSweep : 0.06;
    const subs = SUB_BOTTOM[this.gpos];
    const wSub = subs.length ? this.subMul * 0.065 * B.d.botSub * (0.35 + this.ce(B, "subs") * 1.2) : 0;
    const wStrike = this.gpos === "guard" ? 0.3 : 0.08;
    const wTie = 0.25;
    const r = this.rng.next() * (wUp + wSweep + wSub + wStrike + wTie);
    if (r < wUp) {
      this.spend(B, 2.2);
      const base: Record<GPos, number> = { guard: 0.56, half: 0.46, side: 0.3, mount: 0.15, back: 0.17 };
      const off = 0.4 * this.e(B, "bottomGame") + 0.3 * this.e(B, "scrambles") + 0.3 * this.e(B, "strength");
      const dfn = 0.7 * this.e(T, "topControl") + 0.3 * this.e(T, "strength");
      let p = base[this.gpos] * Math.exp(2.1 * (off - dfn)) * (1 + techOf(B.f, "wallWalk") * 0.08) * (B.stun > 0 ? 0.4 : 1) * (1 - techOf(T.f, "legRide") * 0.05);
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
      } else if ((this.gpos === "half" || this.gpos === "side" || this.gpos === "guard") && this.rng.chance(0.06 + techOf(T.f, "backTake") * 0.035 + this.e(T, "scrambles") * 0.04)) {
        this.gpos = "back";
        T.gimp[this.round - 1] += 1;
        this.say(`${B.name} turns to get up and ${T.name} takes the back!`, T.i, true, "pass");
      }
      return 6 + this.rng.range(1, 6);
    }
    if (r < wUp + wSweep) {
      this.spend(B, 1.8);
      const p = clamp(0.1 * Math.exp(2 * (0.55 * this.e(B, "bottomGame") + 0.45 * this.e(B, "scrambles") - this.e(T, "topControl"))), 0.02, 0.4);
      if (this.rng.chance(p)) {
        this.top = B.i;
        this.gpos = this.rng.chance(0.7) ? "guard" : "half";
        this.rs(B).rev++;
        B.gimp[this.round - 1] += 1.1;
        this.quiet = 0;
        this.say(`${B.name} sweeps and comes up on top!`, B.i, true, "sweep");
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
    return 7 + this.rng.range(2, 8);
  }

  private pickSub(s: Side, list: [string, number][]): string {
    const w: Record<string, number> = {};
    for (const [id, base] of list) w[id] = base * (1 + techOf(s.f, SUB_TECH[id]) * 0.6) * (s.f.tech[SUB_TECH[id]] === undefined && (id === "heelHook" || id === "darce") ? 0.15 : 1);
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

  private finishRound() {
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
    this.cards[r] = row;
  }

  private decide() {
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
    this.endRound = this.rounds;
    this.endTime = this.roundSec;
    if (aWins >= 2 || bWins >= 2) {
      this.winner = aWins >= 2 ? 0 : 1;
      this.method = "DEC";
      const verdict = aWins === 3 || bWins === 3 ? "Unanimous" : draws === 1 ? "Majority" : "Split";
      this.detail = verdict;
    } else {
      this.winner = null;
      this.method = "DRAW";
      this.detail = draws === 3 ? "Unanimous draw" : draws === 2 ? "Majority draw" : "Split draw";
    }
  }

  outcome(): FightOutcome {
    const [A, B] = this.s;
    const sum = (s: Side) => {
      const t = blankRound();
      for (const r of s.rs) for (const k of Object.keys(t) as (keyof RoundStat)[]) t[k] += r[k];
      return t;
    };
    const tA = sum(A);
    const tB = sum(B);
    tA.ctrl = Math.round(tA.ctrl);
    tB.ctrl = Math.round(tB.ctrl);
    for (const s of this.s) for (const r of s.rs) r.ctrl = Math.round(r.ctrl);
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
    if (this.method === "DEC") verdict = this.detail.toLowerCase() as BoutResult["verdict"];
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
      rounds: A.rs.map((r, k) => [r, B.rs[k]] as [RoundStat, RoundStat]),
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
  if (m === "NC") return "No contest";
  return m;
}

/** The method in a sentence: "knockout (head kick)", "submission (armbar)", "split decision". */
export function methodPhrase(m: Method, detail: string): string {
  const d = detail.toLowerCase();
  if (m === "KO") return `knockout (${d})`;
  if (m === "TKO") return `TKO (${d})`;
  if (m === "SUB") return `submission (${d})`;
  if (m === "DEC") return `${d} decision`;
  if (m === "DRAW") return d;
  if (m === "NC") return "no contest";
  return m;
}

export const STRIKE_IDS: StrikeId[] = Object.keys(STRIKES) as StrikeId[];
