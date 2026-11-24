// Picking a fighter's styles, and what those styles add up to in the cage.
// Real fighters get theirs from how they actually fight (their tendencies and
// official statistics); everyone else from their background and attributes.

import { Rng, hashString } from "../core/rng";
import { clamp } from "../core/util";
import { ovrOf, type AttrKey } from "../model/attributes";
import type { Fighter } from "../model/types";
import {
  FIGHT_STYLES, GRAPPLE_STYLES, STRIKE_STYLES, styleFit,
  type FighterStyle, type GrappleStyle, type StrikeStyle, type StyleId, type TraitKey, type Traits,
} from "../data/fightstyles";

/** Tendencies from the real-fighter snapshot, 0..1, and official numbers. */
export interface RealSignals {
  pressure: number; counter: number; range: number; pocket: number; kicking: number; clinch: number;
  tdEntry: number; top: number; subHunt: number; scramble: number; pace: number; risk: number; finish: number;
  slpm: number; sapm: number; acc: number; def: number; td: number; tdDef: number; sub: number; kd: number;
  leg: number; body: number; clinchShare: number; groundShare: number;
}

const STRIKER_ARTS = new Set(["boxing", "kickboxing", "muaythai", "karate", "taekwondo", "brawler"]);
const GRAPPLER_ARTS = new Set(["wrestling", "greco", "sambo", "judo", "bjj"]);

function avg(a: Record<AttrKey, number>, keys: AttrKey[]): number {
  return keys.reduce((s, k) => s + a[k], 0) / keys.length;
}

/** How natural a style is for a background: its first background most of all. */
function artBonus(f: Fighter, id: StyleId): number {
  // The fallbacks don't come from a background: they are what's left without a real style.
  if (id === "basic" || id === "sprawl") return 0;
  const i = FIGHT_STYLES[id].arts.indexOf(f.base);
  return i < 0 ? 0 : [26, 18, 12, 8, 6, 5][i] ?? 4;
}

function realBonus(id: StyleId, r: RealSignals): number {
  switch (id) {
    case "outBoxer": return (r.range - 0.5) * 40 + (r.acc - 47) * 1.1 + (r.def - 54) * 0.9 - (r.pressure - 0.5) * 30 - (r.kicking - 0.45) * 22;
    case "pressure": return (r.pressure - 0.5) * 50 + (r.pace - 0.6) * 30 + (r.pocket - 0.5) * 20 - (r.kicking - 0.5) * 10;
    case "counter": return (r.counter - 0.4) * 60 - (r.pressure - 0.5) * 22;
    case "slugger": return (r.risk - 0.5) * 30 + (r.finish - 0.5) * 30 + (r.kd - 0.45) * 30 - (r.kicking - 0.45) * 22;
    case "dutch": return (r.kicking - 0.45) * 40 + (r.leg - 18) * 1.4 + (r.pressure - 0.5) * 15;
    case "point": return (r.range - 0.6) * 45 + (r.kicking - 0.45) * 12 + (r.counter - 0.4) * 10;
    case "flash": return (r.kicking - 0.62) * 70 + (r.range - 0.55) * 15;
    case "khao": return (r.clinch - 0.45) * 50 + (r.clinchShare - 11) * 1.4 + (r.kicking - 0.45) * 10;
    case "femur": return (r.kicking - 0.5) * 30 + (r.counter - 0.4) * 25 + (r.body - 18) * 0.8;
    case "volume": return (r.slpm - 4.6) * 12 + (r.pace - 0.65) * 40;
    case "brawler": return (r.risk - 0.6) * 30 + (r.sapm - 4.2) * 6 - (r.def - 50) * 0.8;
    case "basic": return 0;
    case "chain": return (r.td - 2) * 9 + (r.tdEntry - 0.5) * 40 + (r.top - 0.5) * 15;
    case "blast": return (r.td - 1.6) * 6 + (r.tdEntry - 0.5) * 30 - (r.clinch - 0.45) * 15;
    case "grinder": return (r.clinch - 0.45) * 35 + (r.clinchShare - 11) * 1 + (r.tdEntry - 0.4) * 20;
    case "scrambler": return (r.scramble - 0.5) * 40 + (r.tdEntry - 0.35) * 15;
    case "pounder": return (r.top - 0.5) * 30 + (r.finish - 0.5) * 25 + (r.groundShare - 15) * 0.9;
    case "passer": return (r.top - 0.55) * 40 + (r.sub - 0.5) * 15;
    case "guard": return (r.subHunt - 0.4) * 40 - (r.top - 0.5) * 25;
    case "backTaker": return (r.subHunt - 0.35) * 30 + (r.scramble - 0.5) * 25 + (r.sub - 0.5) * 15;
    case "legLocker": return (r.subHunt - 0.6) * 40 - 10;
    case "thrower": return (r.clinch - 0.45) * 25 + (r.tdEntry - 0.4) * 10;
    case "sprawl": return (r.tdDef - 65) * 1.2 - (r.tdEntry - 0.3) * 40 + (r.td < 1 ? 8 : 0);
  }
}

/** Pick a striking and a grappling style, and how well they are known. */
export function pickStyles(f: Fighter, rng: Rng, real: RealSignals | null, level?: number): FighterStyle {
  const a = f.attrs;
  const strike = avg(a, ["boxing", "kicks", "clinchStrikes", "counters", "strikeDef"]);
  const grapple = avg(a, ["takedowns", "topControl", "subs", "bottomGame", "clinchControl"]);
  const noise = real ? 3 : 9;
  const score = (id: StyleId): number => {
    let v = styleFit(a, id) * 0.6 + artBonus(f, id) + rng.normal(0, noise);
    if (real) v += clamp(realBonus(id, real), -35, 40);
    // Who reaches for what.
    if (id === "basic") v += grapple > strike + 1.5 ? 12 : GRAPPLER_ARTS.has(f.base) ? 2 : -30;
    if (id === "sprawl") v += strike > grapple + 1.5 ? 10 : STRIKER_ARTS.has(f.base) ? 2 : -30;
    if (id === "brawler" && f.base !== "brawler") v += a.aggression > 14 && a.strikeDef < 11 ? 0 : -25;
    if (id === "legLocker" && f.base !== "sambo" && f.base !== "bjj") v -= 30;
    if ((id === "flash" || id === "point") && !["karate", "taekwondo", "kickboxing"].includes(f.base) && (!real || real.kicking < 0.6)) v -= 14;
    if ((id === "khao" || id === "femur") && f.base !== "muaythai" && (!real || real.kicking < 0.55)) v -= 12;
    return v;
  };
  const best = <T extends StyleId>(list: T[]): T => {
    let pick = list[0];
    let top = -Infinity;
    for (const id of list) {
      const v = score(id);
      if (v > top) {
        top = v;
        pick = id;
      }
    }
    return pick;
  };
  const s = best(STRIKE_STYLES) as StrikeStyle;
  const g = best(GRAPPLE_STYLES) as GrappleStyle;
  const lvl = level ?? ovrOf(a);
  const fights = f.rec.w + f.rec.l + f.rec.d + (f.am.w + f.am.l) * 0.4;
  const mastery = (id: StyleId): number => {
    const fit = styleFit(a, id);
    const base = 18 + (lvl - 45) * 1.15 + Math.min(fights, 30) * 0.7 + rng.normal(0, 6);
    return Math.round(clamp(base * (0.62 + 0.38 * (fit / 100)), 8, 96));
  };
  return { s, sm: mastery(s), g, gm: mastery(g) };
}

/** A fighter's styles: worked out (and kept) for fighters from older saves and tests. */
export function fightStyle(f: Fighter): FighterStyle {
  if (!f.style) f.style = pickStyles(f, new Rng(hashString(f.id) ^ 0x5f1e), null);
  return f.style;
}

export function styleLabel(f: Fighter): string {
  const st = fightStyle(f);
  return `${FIGHT_STYLES[st.s].name} · ${FIGHT_STYLES[st.g].name}`;
}

const curve = (m: number) => Math.pow(clamp(m, 0, 100) / 100, 0.9);

/** What the styles add up to in a fight, each trait scaled by mastery. */
export function traitsOf(f: Fighter): Traits {
  const st = fightStyle(f);
  const t = {} as Traits;
  const S = FIGHT_STYLES[st.s].t;
  const G = FIGHT_STYLES[st.g].t;
  const ms = curve(st.sm);
  const mg = curve(st.gm);
  for (const k of TRAIT_KEYS) t[k] = (S[k] ?? 0) * ms + (G[k] ?? 0) * mg;
  return t;
}

export const TRAIT_KEYS: TraitKey[] = [
  "jab", "headMove", "range", "cage", "body", "volume", "counter", "power", "lowKick", "blitz", "flash", "clinch", "teep",
  "read", "mix", "chain", "shot", "fence", "scramble", "gnp", "pass", "guard", "back", "legs", "throw", "sprawl",
];

/** Change one of a fighter's styles. What they knew is kept, in case they come back to it. */
export function switchStyle(f: Fighter, id: StyleId): void {
  const st = fightStyle(f);
  const kind = FIGHT_STYLES[id].kind;
  const cur = kind === "strike" ? st.s : st.g;
  if (cur === id) return;
  st.known = { ...(st.known ?? {}), [cur]: kind === "strike" ? st.sm : st.gm };
  // A new style starts from what carries over: the attributes that suit it.
  const start = st.known[id] ?? Math.round(clamp(6 + styleFit(f.attrs, id) * 0.22, 6, 30));
  delete st.known[id];
  if (kind === "strike") {
    st.s = id as StrikeStyle;
    st.sm = start;
  } else {
    st.g = id as GrappleStyle;
    st.gm = start;
  }
}

/** A fighter who knows a style knows its signature techniques, more of them the deeper the style goes. */
export function grantStyleTech(f: Fighter): void {
  const st = fightStyle(f);
  for (const [id, m] of [[st.s, st.sm], [st.g, st.gm]] as [StyleId, number][]) {
    const lvl = m >= 80 ? 2 : m >= 45 ? 1 : 0;
    if (!lvl) continue;
    FIGHT_STYLES[id].tech.forEach((t, i) => {
      // The first signature move goes deepest.
      const want = Math.max(0, lvl - (i >= 2 ? 1 : 0));
      if (want > (f.tech[t] ?? 0)) f.tech[t] = want;
    });
  }
}
