// The training week: ten sessions (Monday to Friday, morning and evening),
// an intensity, and a technique to drill. Growth depends on the coach who runs
// each session, the facilities, age, how much room is left to the fighter's
// potential and their professionalism. Load builds fatigue; fatigue and hard
// sparring cause injuries; sparring keeps a fighter sharp. The strength
// sessions include neck work, the one thing that builds a chin.

import { coachFor } from "./staff";
import { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { ageAt } from "../core/time";
import { ATTRS, ovrOf, type AttrKey } from "../model/attributes";
import type { Fighter, Gym, SessionId, TrainingPlan, World } from "../model/types";
import { TECHNIQUES, type TechId } from "../data/techniques";
import { growthRate, monthsToPeak } from "../world/development";
import { defOf, trainingInjury } from "../data/injuries";
import { FIGHT_STYLES, styleFit, type StyleId } from "../data/fightstyles";
import { fightStyle } from "../world/fightstyle";

export interface SessionDef {
  id: SessionId;
  name: string;
  short: string;
  area: "striking" | "grappling" | "wrestling" | "sc" | "head";
  attrs: Partial<Record<AttrKey, number>>;
  load: number;
  risk: number;
  sharp: number;
  color: string;
  /** How a session trains an attribute, when it isn't obvious (the strength session builds the chin through neck work). */
  how?: Partial<Record<AttrKey, string>>;
}

export const SESSIONS: Record<SessionId, SessionDef> = {
  boxing: { id: "boxing", name: "Boxing", short: "BOX", area: "striking", attrs: { boxing: 1, strikeDef: 0.7, counters: 0.5, footwork: 0.4, power: 0.2, speed: 0.15 }, load: 6, risk: 1, sharp: 1, color: "#e5484d" },
  kickboxing: { id: "kickboxing", name: "Kickboxing", short: "KBX", area: "striking", attrs: { kicks: 1, footwork: 0.5, boxing: 0.4, strikeDef: 0.3, power: 0.2 }, load: 7, risk: 1.2, sharp: 1, color: "#f76b15" },
  muaythai: { id: "muaythai", name: "Muay Thai & clinch", short: "MT", area: "striking", attrs: { clinchStrikes: 1, kicks: 0.6, clinchControl: 0.5, toughness: 0.2 }, load: 7, risk: 1.3, sharp: 1, color: "#ffb224" },
  wrestling: { id: "wrestling", name: "Wrestling", short: "WRS", area: "wrestling", attrs: { takedowns: 1, tdd: 0.9, clinchControl: 0.6, topControl: 0.4, scrambles: 0.3, strength: 0.2, cardio: 0.15 }, load: 8, risk: 1.4, sharp: 0.8, color: "#3e63dd" },
  bjj: { id: "bjj", name: "Jiu-jitsu", short: "BJJ", area: "grappling", attrs: { subs: 1, subDef: 0.9, bottomGame: 0.8, topControl: 0.4, scrambles: 0.4 }, load: 6, risk: 1.1, sharp: 0.6, color: "#8e4ec6" },
  sparring: { id: "sparring", name: "MMA sparring", short: "SPR", area: "head", attrs: { fightIQ: 0.7, composure: 0.6, groundStrikes: 0.4, scrambles: 0.3, boxing: 0.2, takedowns: 0.2, tdd: 0.3, heart: 0.2 }, load: 9, risk: 2.4, sharp: 3, color: "#d6409f" },
  drilling: { id: "drilling", name: "Technique drilling", short: "DRL", area: "head", attrs: { fightIQ: 0.15 }, load: 4, risk: 0.5, sharp: 0.5, color: "#12a594" },
  strength: { id: "strength", name: "Strength", short: "STR", area: "sc", attrs: { strength: 1, power: 0.5, toughness: 0.3, chin: 0.35 }, load: 7, risk: 0.9, sharp: 0, color: "#978365", how: { chin: "neck work" } },
  conditioning: { id: "conditioning", name: "Conditioning", short: "CON", area: "sc", attrs: { cardio: 1, recovery: 0.5, workRate: 0.4, speed: 0.2 }, load: 8, risk: 0.8, sharp: 0.5, color: "#30a46c" },
  film: { id: "film", name: "Film study", short: "FLM", area: "head", attrs: { fightIQ: 1, counters: 0.3, discipline: 0.3, composure: 0.2 }, load: 1, risk: 0, sharp: 0, color: "#0090ff" },
  recovery: { id: "recovery", name: "Recovery", short: "REC", area: "sc", attrs: {}, load: -8, risk: -0.4, sharp: 0, color: "#6b7280" },
  rest: { id: "rest", name: "Rest", short: "OFF", area: "head", attrs: {}, load: -12, risk: -0.8, sharp: -0.4, color: "#3f4651" },
};

export const SESSION_IDS = Object.keys(SESSIONS) as SessionId[];
export const SLOT_NAMES = ["Mon AM", "Mon PM", "Tue AM", "Tue PM", "Wed AM", "Wed PM", "Thu AM", "Thu PM", "Fri AM", "Fri PM"];

const W = (s: string): SessionId[] => s.split(" ") as SessionId[];

export const TEMPLATES: { id: string; name: string; desc: string; week: SessionId[]; intensity: 0 | 1 | 2 }[] = [
  { id: "balanced", name: "Balanced week", desc: "A bit of everything, with one sparring day.", week: W("boxing wrestling kickboxing bjj sparring recovery boxing strength bjj conditioning"), intensity: 1 },
  { id: "striking", name: "Striking focus", desc: "Hands, kicks and the clinch, and sparring.", week: W("boxing kickboxing muaythai strength boxing sparring kickboxing conditioning film recovery"), intensity: 1 },
  { id: "wrestling", name: "Wrestling focus", desc: "Shots, the fence and top control.", week: W("wrestling strength wrestling bjj sparring conditioning wrestling boxing film recovery"), intensity: 1 },
  { id: "grappling", name: "Grappling focus", desc: "Jiu-jitsu, scrambles and submissions.", week: W("bjj wrestling bjj strength sparring recovery bjj conditioning drilling film"), intensity: 1 },
  { id: "camp", name: "Fight camp", desc: "Hard sparring, conditioning and the game plan.", week: W("sparring conditioning boxing wrestling sparring film bjj conditioning drilling recovery"), intensity: 2 },
  { id: "taper", name: "Fight week taper", desc: "Light drilling, film and rest before the fight.", week: W("drilling film boxing recovery drilling rest film recovery rest rest"), intensity: 0 },
  { id: "conditioning", name: "Strength and conditioning", desc: "Build the engine and the body.", week: W("strength conditioning strength conditioning boxing recovery strength conditioning wrestling rest"), intensity: 1 },
  { id: "light", name: "Light week", desc: "Stay ticking over, recover from knocks.", week: W("boxing recovery bjj rest film recovery drilling rest conditioning rest"), intensity: 0 },
];

export function templatePlan(id: string): TrainingPlan {
  const t = TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];
  return { week: [...t.week], intensity: t.intensity, drill: null, template: t.id };
}

export function defaultTraining(f: Fighter): TrainingPlan {
  const a = f.attrs;
  const st = (a.boxing + a.kicks) / 2;
  const gr = (a.takedowns + a.tdd + a.subs + a.bottomGame) / 4;
  // Train the weakness a little more than the strength.
  return templatePlan(st > gr + 2 ? "balanced" : gr > st + 2 ? "striking" : "balanced");
}

export const INTENSITY_NAMES = ["Light", "Normal", "Hard"];
const INT_GROWTH = [0.6, 1, 1.3];
const INT_LOAD = [0.65, 1, 1.4];
const INT_RISK = [0.5, 1, 1.75];

export function coachQuality(g: Gym | undefined, area: SessionDef["area"]): number {
  if (!g) return 45;
  if (area === "head") return g.coaches.head;
  return g.coaches[area];
}

/** How readily the body and the mind still take in new work. */
export function ageGrowth(age: number): number {
  if (age < 21) return 1.1;
  if (age < 24) return 1.05;
  if (age < 27) return 1;
  if (age < 29) return 0.95;
  if (age < 31) return 0.85;
  if (age < 33) return 0.7;
  if (age < 35) return 0.55;
  return 0.4;
}

/**
 * How much neck work still does for the chin, 0.25 to 1. A stronger neck takes
 * some of the snap out of a punch, but it can't undo the damage: every knockout
 * loss, and the wear of a long, hard career, leave less for it to build on.
 */
export function neckWork(f: Fighter): number {
  const kos = f.rec.koL + f.am.koL;
  return clamp(1 - kos * 0.12 - Math.max(0, f.dmg - 80) / 400, 0.25, 1);
}

/** Why neck work does less than it would, or null when the chin is fresh. */
export function neckNote(f: Fighter): string | null {
  const n = neckWork(f);
  if (n >= 0.995) return null;
  const kos = f.rec.koL + f.am.koL;
  const losses = `${kos} knockout loss${kos === 1 ? "" : "es"}`;
  const why = kos && f.dmg > 80 ? `${losses} and years of wear` : kos ? losses : "years of wear";
  return `After ${why}, neck work does ${Math.round(n * 100)}% of what it would for a fresh chin.`;
}

/** Converts the world's monthly growth rate into the training pace (over a real career, with camps, injuries and light weeks, a pace of 1 is worth about 1.4 overall a year). */
export const PACE_SCALE = 8.5;

export interface WeekResult {
  growth: Partial<Record<AttrKey, number>>;
  fatigue: number;
  sharp: number;
  injury?: { id: string; name: string; days: number; severity: number; area: string };
  drilled?: { tech: TechId; level: number; progress: number };
  /** Style coaching: the style's mastery before and after the week, and a signature move worked on. */
  styled?: { id: StyleId; before: number; after: number; tech?: TechId; progress?: number };
  load: number;
}

/** Which sessions build a style, and how much each counts. */
export function styleSessions(id: StyleId): Partial<Record<SessionId, number>> {
  switch (id) {
    case "outBoxer": case "pressure": case "counter": case "slugger": case "peekaboo": case "boxerPuncher": return { boxing: 1, sparring: 0.6, kickboxing: 0.3, drilling: 0.5, film: 0.3 };
    case "dutch": case "k1": return { kickboxing: 1, boxing: 0.6, muaythai: 0.4, sparring: 0.6, drilling: 0.5 };
    case "sniper": return { kickboxing: 1, muaythai: 0.5, sparring: 0.5, drilling: 0.6, film: 0.3 };
    case "kyokushin": return { kickboxing: 1, boxing: 0.5, sparring: 0.7, conditioning: 0.3, drilling: 0.4 };
    case "sanda": return { kickboxing: 1, wrestling: 0.5, sparring: 0.6, drilling: 0.5 };
    case "point": case "flash": return { kickboxing: 1, sparring: 0.6, boxing: 0.3, drilling: 0.6, film: 0.3 };
    case "khao": case "femur": case "tae": case "mat": case "sok": case "bouk": case "lak": return { muaythai: 1, kickboxing: 0.5, sparring: 0.6, drilling: 0.5 };
    case "volume": return { boxing: 0.7, kickboxing: 0.7, sparring: 0.8, conditioning: 0.3, drilling: 0.4 };
    case "brawler": return { sparring: 1, boxing: 0.6, drilling: 0.3 };
    case "basic": return { boxing: 0.6, sparring: 0.8, drilling: 0.4 };
    case "chain": case "blast": case "grinder": case "pounder": case "rider": case "wrestleBoxer": case "clincher": return { wrestling: 1, sparring: 0.5, bjj: 0.3, drilling: 0.5 };
    case "catchWrestler": return { wrestling: 0.9, bjj: 0.6, sparring: 0.4, drilling: 0.5 };
    case "scrambler": return { wrestling: 0.8, bjj: 0.8, sparring: 0.5, drilling: 0.4 };
    case "passer": case "guard": case "backTaker": case "legLocker": case "subHunter": return { bjj: 1, wrestling: 0.3, sparring: 0.4, drilling: 0.5 };
    case "thrower": return { wrestling: 0.8, bjj: 0.5, sparring: 0.4, drilling: 0.5 };
    case "sprawl": return { wrestling: 0.8, sparring: 0.6, drilling: 0.3 };
  }
}

/** Exposure of each attribute in a week: how much of the week trains it. */
export function exposure(plan: TrainingPlan): Partial<Record<AttrKey, number>> {
  const out: Partial<Record<AttrKey, number>> = {};
  for (const s of plan.week) {
    for (const [k, v] of Object.entries(SESSIONS[s].attrs) as [AttrKey, number][]) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

export function weekLoad(plan: TrainingPlan): number {
  return plan.week.reduce((a, s) => a + SESSIONS[s].load, 0) * INT_LOAD[plan.intensity];
}

export function weekRisk(f: Fighter, plan: TrainingPlan, age: number): number {
  const r = plan.week.reduce((a, s) => a + Math.max(0, SESSIONS[s].risk), 0) * INT_RISK[plan.intensity];
  const fat = 1 + Math.max(0, f.fatigue - 40) / 45;
  const ageF = age > 32 ? 1 + (age - 32) * 0.08 : 1;
  return clamp(0.0011 * r * (f.hid.injuryProne / 9) * fat * fat * ageF, 0, 0.25);
}


export function trainingWeek(w: World, f: Fighter, plan: TrainingPlan, rng: Rng, apply: boolean, mul = 1): WeekResult {
  const age = ageAt(f.birth, w.day);
  const gym = w.gyms[f.gym];
  const cur = ovrOf(f.attrs);
  // The pace of development: the room to the potential spread over the years to
  // the peak (and a year past it, for what training still teaches), as for the
  // world's fighters but without their late slow-down: a fighter who keeps doing
  // the work can reach the ceiling. Good weeks, coaches and habits beat the pace.
  const room = clamp((f.hid.pot - cur) * growthRate(monthsToPeak(f, age) + 12, age, false) * PACE_SCALE, 0.05, 2.8);
  const pro = 0.75 + f.pers.professionalism / 40;
  const fatPenalty = f.fatigue > 70 ? 0.65 : f.fatigue > 55 ? 0.85 : 1;
  const injured = f.injury && f.injury.until > w.day;
  // While it heals, only what the injury allows still counts.
  const hurtTrain = injured ? defOf(f.injury!).train : 1;
  const growth: Partial<Record<AttrKey, number>> = {};
  const fac = gym ? 0.8 + gym.facilities / 250 : 0.9;
  // Weak attributes improve faster than strong ones; the pace sets the overall rate.
  const topOf = (k: AttrKey) => clamp((20.6 - f.attrs[k]) / 8, 0.05, 1.3);
  let tw = 0;
  let tv = 0;
  for (const s of plan.week) for (const [k, v] of Object.entries(SESSIONS[s].attrs) as [AttrKey, number][]) {
    tw += v * topOf(k);
    tv += v;
  }
  const meanTop = tv > 0 ? Math.max(0.2, tw / tv) : 1;
  const neck = neckWork(f);
  for (const s of plan.week) {
    const sd = SESSIONS[s];
    const q = 0.55 + coachFor(w, f, sd.area, coachQuality) / 110;
    for (const [k, v] of Object.entries(sd.attrs) as [AttrKey, number][]) {
      const top = topOf(k) / meanTop;
      const g = 0.0105 * mul * v * q * fac * INT_GROWTH[plan.intensity] * ageGrowth(age) * room * pro * fatPenalty * top * hurtTrain * (k === "chin" ? neck : 1);
      growth[k] = (growth[k] ?? 0) + g;
    }
  }
  const load = weekLoad(plan);
  const fatigue = clamp(f.fatigue * 0.45 + Math.max(0, load) * 0.85 + Math.min(0, load) * 0.5, 0, 100);
  const sharpGain = plan.week.reduce((a, s) => a + SESSIONS[s].sharp, 0) * (plan.intensity === 2 ? 1.2 : plan.intensity === 0 ? 0.7 : 1);
  const sharp = clamp(f.sharp * 0.93 + sharpGain * 0.9, 0, 100);
  let injury: WeekResult["injury"];
  if (!injured && rng.chance(weekRisk(f, plan, age))) {
    const pick = trainingInjury(rng, new Set(plan.week));
    injury = { id: pick.id, name: pick.name, days: Math.round(((pick.weeks[0] + pick.weeks[1]) / 2) * 7), severity: pick.sev, area: pick.area };
  }
  let drilled: WeekResult["drilled"];
  if (plan.drill) {
    const n = plan.week.filter((s) => s === "drilling").length + plan.week.filter((s) => SESSIONS[s].area !== "sc" && s !== "film" && s !== "rest" && s !== "recovery").length * 0.15;
    const def = TECHNIQUES[plan.drill];
    const lvl = f.tech[plan.drill] ?? 0;
    if (lvl < 3 && n > 0) {
      const uses = def.uses.reduce((a, k) => a + f.attrs[k], 0) / def.uses.length;
      const talent = 0.6 + uses / 25;
      const step = (n / 2) * talent * (0.6 + coachFor(w, f, "head", coachQuality) / 120) / (def.weeks * (1 + lvl * 0.6));
      drilled = { tech: plan.drill, level: lvl, progress: step };
    }
  }
  // Style coaching: the coaches build one of the fighter's two styles.
  let styled: WeekResult["styled"];
  if (plan.style) {
    const def = FIGHT_STYLES[plan.style];
    const st = fightStyle(f);
    const active = def.kind === "strike" ? st.s === plan.style : st.g === plan.style;
    if (active) {
      const cur = def.kind === "strike" ? st.sm : st.gm;
      const weights = styleSessions(plan.style);
      const rel = plan.week.reduce((a, s) => a + (weights[s] ?? 0), 0);
      const coach = coachFor(w, f, def.kind === "strike" ? "striking" : def.group === "Wrestling" || def.id === "sprawl" ? "wrestling" : "grappling", coachQuality);
      const step = rel * 0.3 * (0.5 + styleFit(f.attrs, plan.style) / 100) * (0.55 + coach / 110) * (0.75 + f.attrs.fightIQ / 40) * INT_GROWTH[plan.intensity] * (1 - cur / 125) * hurtTrain * fatPenalty;
      const after = clamp(cur + step, 0, 99);
      styled = { id: plan.style, before: cur, after };
      // A signature move gets worked on too, the least known first.
      const tech = def.tech.filter((t) => (f.tech[t] ?? 0) < 3).sort((a, b) => (f.tech[a] ?? 0) - (f.tech[b] ?? 0))[0];
      if (tech && tech !== plan.drill && rel > 0) {
        styled.tech = tech;
        styled.progress = (rel / 10) * 0.5 / (TECHNIQUES[tech].weeks * (1 + (f.tech[tech] ?? 0) * 0.6));
      }
      if (apply) {
        if (def.kind === "strike") st.sm = Math.round(after * 10) / 10;
        else st.gm = Math.round(after * 10) / 10;
      }
    }
  }
  if (apply) {
    for (const k of ATTRS) if (growth[k]) f.attrs[k] = clamp(Math.round((f.attrs[k] + growth[k]!) * 1000) / 1000, 1, 20);
    f.fatigue = Math.round(fatigue);
    f.sharp = Math.round(sharp);
  }
  return { growth, fatigue, sharp, injury, drilled, styled, load };
}

/** Rough weekly overall change this plan would give. */
export function planPreview(w: World, f: Fighter, plan: TrainingPlan): { ovr: number; fatigue: number; risk: number; top: [AttrKey, number][]; chin: number } {
  const clone: Fighter = { ...f, attrs: { ...f.attrs }, style: f.style ? { ...f.style } : undefined };
  const r = trainingWeek(w, clone, plan, new Rng(1), true);
  // The chin has its own line on the training page.
  const top = (Object.entries(r.growth) as [AttrKey, number][]).filter(([k]) => k !== "chin").sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { ovr: ovrOf(clone.attrs) - ovrOf(f.attrs), fatigue: r.fatigue, risk: weekRisk(f, plan, ageAt(f.birth, w.day)), top, chin: r.growth.chin ?? 0 };
}
