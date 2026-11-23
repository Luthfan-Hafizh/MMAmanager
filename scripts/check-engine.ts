// Calibration of the fight engine against the UFC's own numbers.
//   npm run check:engine            (2000 fights a division)
//   npm run check:engine -- --quick (500 fights a division, fails on big misses)
import { Rng } from "../src/core/rng";
import { DIVISIONS, DIVISION_IDS, type DivisionId } from "../src/data/divisions";
import { generateFighter } from "../src/world/generate";
import { simulate } from "../src/engine/sim";
import type { RoundStat } from "../src/model/types";
import { ART_IDS } from "../src/data/styles";

const quick = process.argv.includes("--quick");
const N = quick ? 500 : Number(process.argv.find((a: string) => /^\d+$/.test(a)) ?? 2000);
const tierArg = process.argv.find((a: string) => a.startsWith("--tier="));
const tier = tierArg ? Number(tierArg.split("=")[1]) : 5;
const LEVEL: Record<number, number> = { 0: 48, 1: 56, 2: 63, 3: 70, 4: 71, 5: 76 };

interface Acc {
  n: number;
  ko: number;
  sub: number;
  dec: number;
  draw: number;
  r1: number;
  fin: number;
  split: number;
  secs: number;
  sigL: number;
  sigA: number;
  tdL: number;
  tdA: number;
  subA: number;
  kd: number;
  head: number;
  body: number;
  leg: number;
  dist: number;
  clinch: number;
  ground: number;
  ctrl: number;
  favWins: number;
  favN: number;
  t0: number;
}

const blank = (): Acc => ({ n: 0, ko: 0, sub: 0, dec: 0, draw: 0, r1: 0, fin: 0, split: 0, secs: 0, sigL: 0, sigA: 0, tdL: 0, tdA: 0, subA: 0, kd: 0, head: 0, body: 0, leg: 0, dist: 0, clinch: 0, ground: 0, ctrl: 0, favWins: 0, favN: 0, t0: 0 });

const rng = new Rng(20261005);
const all = blank();
const rows: string[] = [];
let failures = 0;
const t0 = Date.now();

function addStats(a: Acc, s: RoundStat) {
  a.sigL += s.sigL;
  a.sigA += s.sigA;
  a.tdL += s.tdL;
  a.tdA += s.tdA;
  a.subA += s.subA;
  a.kd += s.kd;
  a.head += s.head;
  a.body += s.body;
  a.leg += s.leg;
  a.dist += s.dist;
  a.clinch += s.clinch;
  a.ground += s.ground;
  a.ctrl += s.ctrl;
}

for (const div of DIVISION_IDS) {
  const acc = blank();
  for (let k = 0; k < N; k++) {
    const spread = [7, 7, 6, 5, 5, 4][tier];
    const level = LEVEL[tier] + rng.normal(0, spread);
    const lvlB = level + rng.normal(0, spread);
    const mk = (id: string, lv: number) =>
      generateFighter(rng, { id, region: rng.pick(["na", "sa", "we", "ee", "ea"] as const), div, ovr: lv, age: rng.int(24, 35), day: 0, art: rng.pick(ART_IDS) });
    const a = mk("a", level);
    const b = mk("b", lvlB);
    const rounds = rng.chance(0.08) ? 5 : 3;
    const out = simulate({ a, b, rounds, roundSec: tier === 0 ? 180 : 300, div, seed: rng.int(1, 2 ** 31), tier });
    acc.n++;
    if (out.method === "KO" || out.method === "TKO") acc.ko++;
    else if (out.method === "SUB") acc.sub++;
    else if (out.method === "DEC") acc.dec++;
    else acc.draw++;
    if (out.method !== "DEC" && out.method !== "DRAW") {
      acc.fin++;
      if (out.round === 1) acc.r1++;
    }
    if (out.method === "DEC" && out.detail !== "Unanimous") acc.split++;
    const secs = (out.round - 1) * 300 + out.time;
    acc.secs += secs;
    addStats(acc, out.stats[0]);
    addStats(acc, out.stats[1]);
    const ovrA = level;
    const ovrB = lvlB;
    if (Math.abs(ovrA - ovrB) > 3 && out.winner) {
      acc.favN++;
      if ((ovrA > ovrB) === (out.winner === "a")) acc.favWins++;
    }
  }
  for (const k of Object.keys(all) as (keyof Acc)[]) all[k] += acc[k];
  const def = DIVISIONS[div];
  const koP = acc.ko / acc.n;
  const subP = acc.sub / acc.n;
  if (!quick || true) {
    rows.push(fmtRow(def.short, acc, def.ko, def.sub));
  }
  if (tier === 5 && (Math.abs(koP - def.ko) > 0.07 || Math.abs(subP - def.sub) > 0.07)) failures++;
}

function fmtRow(name: string, a: Acc, koT?: number, subT?: number): string {
  const mins = a.secs / 60;
  const per15 = (v: number) => ((v / (a.secs / 900)) / 2).toFixed(2);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`.padStart(6);
  const landed = a.head + a.body + a.leg;
  const pos = a.dist + a.clinch + a.ground;
  return [
    name.padEnd(5),
    `KO ${pct(a.ko / a.n)}${koT !== undefined ? ` (${(koT * 100).toFixed(0)})` : ""}`,
    `SUB ${pct(a.sub / a.n)}${subT !== undefined ? ` (${(subT * 100).toFixed(0)})` : ""}`,
    `DEC ${pct(a.dec / a.n)}`,
    `DRW ${pct(a.draw / a.n)}`,
    `R1 ${pct(a.r1 / Math.max(1, a.fin))}`,
    `split ${pct(a.split / Math.max(1, a.dec))}`,
    `SLpM ${(a.sigL / mins / 2).toFixed(2)}`,
    `acc ${pct(a.sigL / a.sigA)}`,
    `TD/15 ${per15(a.tdL)}`,
    `TDacc ${pct(a.tdL / Math.max(1, a.tdA))}`,
    `Sub/15 ${per15(a.subA)}`,
    `KD/f ${(a.kd / a.n).toFixed(2)}`,
    `H/B/L ${((a.head / landed) * 100).toFixed(0)}/${((a.body / landed) * 100).toFixed(0)}/${((a.leg / landed) * 100).toFixed(0)}`,
    `D/C/G ${((a.dist / pos) * 100).toFixed(0)}/${((a.clinch / pos) * 100).toFixed(0)}/${((a.ground / pos) * 100).toFixed(0)}`,
    `ctrl ${(a.ctrl / a.n / 60).toFixed(1)}m`,
    `time ${(a.secs / a.n / 60).toFixed(1)}m`,
    `fav ${pct(a.favWins / Math.max(1, a.favN))}`,
  ].join("  ");
}

console.log(`Engine check: ${N} fights per division at tier ${tier}`);
for (const r of rows) console.log(r);
console.log(fmtRow("ALL", all, 0.3, 0.19));
console.log(
  `Targets (UFC): KO ~30%, SUB ~19%, DEC ~50%, draws <1%, R1 ~45-50% of finishes, split+majority ~15-20% of decisions,`,
);
console.log(`  SLpM ~3.8-4.2, accuracy ~46-48%, TD/15 ~1.5, TD accuracy ~38-42%, Sub/15 ~0.5, KD ~0.5/fight, H/B/L 64/21/15, D/C/G 76/11/13`);
console.log(`Time ${((Date.now() - t0) / all.n).toFixed(2)} ms a fight`);
if (quick && failures > 0) {
  console.log(`${failures} division(s) more than 7 points off the UFC's finish rates`);
  process.exit(1);
}
