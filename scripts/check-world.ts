// Play the world headlessly with a player career and check it stays healthy.
//   npm run check:world            (three years)
//   npm run check:world -- --quick (one year)
import rosterJson from "../public/data/roster.json";
import { createWorld } from "../src/world/create";
import type { RosterFile } from "../src/world/real";
import { advance, fightNight, openFightNight, quickSim, resolvePlayerBout } from "../src/sim/advance";
import { autoAnswer } from "../src/career/actions";
import { PROMOTIONS, PROMO_IDS } from "../src/data/promotions";
import { DIVISIONS } from "../src/data/divisions";
import { ovrOf } from "../src/model/attributes";
import { ageAt, fmtDate } from "../src/core/time";
import type { World } from "../src/model/types";
import { isBeltFight } from "../src/world/belts";
import { simulate } from "../src/engine/sim";
import { Rng } from "../src/core/rng";
import { packNow, unpack } from "../src/state/codec";

const quick = process.argv.includes("--quick");
const years = quick ? 1 : Number(process.argv.find((a: string) => /^\d+$/.test(a)) ?? 3);
const mode = process.argv.includes("--manager") ? "manager" : "fighter";
const roster = rosterJson as unknown as RosterFile;
const t0 = Date.now();
const w: World = createWorld(roster, {
  name: "Check",
  seed: 1234,
  mode,
  difficulty: "normal",
  created: mode === "fighter" ? { first: "Test", surname: "Fighter", sex: "M", country: "US", div: "LW", age: 21, height: 70, reach: 72, stance: "orthodox", art: "wrestling", talent: "phenom", start: "debut" } : undefined,
  agency: "Check Agency",
});
if (mode === "manager") {
  const pool = Object.values(w.fighters).filter((f) => f.promo && PROMOTIONS[f.promo].tier === "regional" && f.hid.pot > 75).slice(0, 3);
  for (const f of pool) {
    f.ctrl = true;
    w.career.fighters.push(f.id);
  }
}
console.log(`World created in ${Date.now() - t0} ms: ${Object.keys(w.fighters).length} fighters, ${Object.keys(w.events).length} events scheduled, ${(JSON.stringify(w).length / 1e6).toFixed(2)} MB`);

const errors: string[] = [];

// The PFL's real fighters, matched as the matchmaker matches them, end fights the way
// real PFL seasons do (26-36% by knockout): built from the source as it stands they
// used to manage about 20%, with the fights going to the mat (leagueBalance).
{
  const rng = new Rng("pfl-balance");
  let ko = 0;
  let sub = 0;
  let n = 0;
  for (const d of PROMOTIONS.pfl.divisions) {
    const list = Object.values(w.fighters).filter((f) => f.promo === "pfl" && f.div === d && f.status === "active" && f.real).sort((a, b) => ovrOf(b.attrs) - ovrOf(a.attrs));
    if (list.length < 6) continue;
    for (let k = 0; k < 80; k++) {
      const i = rng.int(0, list.length - 1);
      let j = Math.max(0, Math.min(list.length - 1, i + rng.pick([-3, -2, -1, 1, 2, 3])));
      if (j === i) j = i === 0 ? 1 : i - 1;
      const out = simulate({ a: list[i], b: list[j], rounds: 3, roundSec: 300, div: d, seed: rng.int(1, 2 ** 31), tier: 4 });
      n++;
      if (out.method === "KO" || out.method === "TKO") ko++;
      else if (out.method === "SUB") sub++;
    }
  }
  console.log(`PFL roster fights, matched: KO/TKO ${((ko / n) * 100).toFixed(1)}%, SUB ${((sub / n) * 100).toFixed(1)}% over ${n}`);
  if (ko / n < 0.24 || ko / n > 0.37) errors.push(`PFL roster fights end by knockout ${((ko / n) * 100).toFixed(1)}% of the time (real seasons 26-36%)`);
  if (sub / n > 0.3) errors.push(`PFL roster fights end by submission ${((sub / n) * 100).toFixed(1)}% of the time`);
}

const t1 = Date.now();
const startDay = w.day;
let guard = 0;
while (w.day < startDay + years * 365 && guard++ < 5000) {
  const r = advance(w, 7);
  if (r.stop?.kind === "decision") autoAnswer(w);
  const ev = fightNight(w);
  if (ev) {
    const waiting = openFightNight(w, ev);
    for (const b of waiting) resolvePlayerBout(w, b, quickSim(w, b));
  }
  if (r.stop?.kind === "retired") break;
}
const ms = Date.now() - t1;

// Invariants.
const booked = new Map<string, string>();
for (const b of Object.values(w.bouts)) {
  if (b.status !== "booked") continue;
  for (const id of [b.a, b.b]) {
    if (booked.has(id)) errors.push(`${id} booked twice (${booked.get(id)} and ${b.id})`);
    booked.set(id, b.id);
    if (w.fighters[id].booked !== b.id) errors.push(`${id} booked field ${w.fighters[id].booked} != ${b.id}`);
  }
}
for (const f of Object.values(w.fighters)) {
  if (f.booked && w.bouts[f.booked]?.status !== "booked") errors.push(`${f.id} stale booking ${f.booked}`);
  // A fighter suspended for a failed test isn't booked to fight before the suspension ends.
  const bk = f.booked ? w.bouts[f.booked] : null;
  if (f.suspWhy && bk && bk.status === "booked" && !bk.pending && bk.day < f.susp) errors.push(`${f.first} ${f.surname} is booked on day ${bk.day} while suspended to day ${f.susp}`);
}
// Storylines name fighters who exist.
for (const st of w.stories ?? []) if (!w.fighters[st.a] || !w.fighters[st.b]) errors.push(`a storyline names a fighter who doesn't exist`);
for (const id of PROMO_IDS) {
  const ps = w.promos[id];
  for (const [d, c] of Object.entries(ps.champs)) {
    if (!c) continue;
    const f = w.fighters[c];
    if (!f || f.status !== "active") errors.push(`${id} ${d} champion ${c} not active`);
    else if (f.promo !== id) errors.push(`${id} ${d} champion ${f.first} ${f.surname} is in ${f.promo}`);
    else if (f.div !== d && ps.champs[f.div] !== f.id) errors.push(`${id} ${d} champion ${f.first} ${f.surname} fights at ${f.div}`);
  }
  for (const [d, ic] of Object.entries(ps.interim)) if (ic && !ps.champs[d as keyof typeof ps.champs]) errors.push(`${id} ${d} has an interim champion and no champion`);
  for (const [d, list] of Object.entries(ps.ranks)) {
    if (new Set(list).size !== list!.length) errors.push(`${id} ${d} ranking has duplicates`);
    if (ps.champs[d as keyof typeof ps.champs] && list!.includes(ps.champs[d as keyof typeof ps.champs]!)) errors.push(`${id} ${d} champion is also ranked`);
    // Off the list the moment they leave (signed elsewhere, released, retired).
    for (const r of list ?? []) {
      const f = w.fighters[r];
      if (!f || f.status !== "active" || f.promo !== id) errors.push(`${id} ${d} still ranks ${f ? `${f.first} ${f.surname} (${f.status === "active" ? f.promo ?? "free agent" : "retired"})` : r}`);
    }
  }
}
// Every event held had fights on it (a new world's first weeks used to run empty cards).
for (const ev of Object.values(w.events)) {
  if (ev.status === "done" && !ev.bouts.some((id) => w.bouts[id]?.status === "done")) errors.push(`${ev.name} (day ${ev.day}) was held with no fights`);
}

// Champions and interim champions fight only for belts at their weight (as in the
// UFC, where a champion doesn't take a non-title fight and an interim champion
// defends the interim belt), and every open reign belongs to the holder.
for (const id of PROMO_IDS) {
  const ps = w.promos[id];
  const held = (f: string, d: string, day: number) => ps.reigns.some((r) => r.fighter === f && r.div === d && r.won < day && (r.lost === undefined || r.lost >= day));
  for (const b of Object.values(w.bouts)) {
    if (b.promo !== id || b.status !== "done" || b.day < startDay || isBeltFight(b)) continue;
    for (const f of [b.a, b.b]) if (held(f, b.div, b.day)) errors.push(`${id} ${b.div}: belt holder ${w.fighters[f].first} ${w.fighters[f].surname} fought with no belt on the line (${b.kind}, day ${b.day})`);
  }
  for (const r of ps.reigns) {
    if (r.lost === undefined && (r.interim ? ps.interim[r.div] : ps.champs[r.div]) !== r.fighter) errors.push(`${id} ${r.div}: an open ${r.interim ? "interim " : ""}reign for ${r.fighter}, who doesn't hold the belt`);
  }
}

// Fight frequency by tier over the run.
const span = (w.day - startDay) / 365;
const byTier: Record<string, { fights: number; fighters: Set<string> }> = {};
const methods: Record<string, Record<string, number>> = {};
for (const b of Object.values(w.bouts)) {
  if (b.status !== "done" || !b.res) continue;
  const t = PROMOTIONS[b.promo].tier;
  (byTier[t] ||= { fights: 0, fighters: new Set() }).fights++;
  byTier[t].fighters.add(b.a);
  byTier[t].fighters.add(b.b);
  const m = b.res.method === "TKO" ? "KO" : b.res.method;
  (methods[t] ||= {})[m] = ((methods[t] ||= {})[m] ?? 0) + 1;
}
console.log(`Simulated ${span.toFixed(1)} years in ${(ms / 1000).toFixed(1)} s (${(ms / span / 1000).toFixed(1)} s a year). Save ${(JSON.stringify(w).length / 1e6).toFixed(2)} MB.`);
for (const [t, v] of Object.entries(byTier)) {
  const m = methods[t];
  const n = v.fights;
  const pct = (k: string) => `${(((m[k] ?? 0) / n) * 100).toFixed(0)}%`;
  console.log(`  ${t.padEnd(9)} ${String(Math.round(n / span)).padStart(5)} fights a year; KO/TKO ${pct("KO")}, SUB ${pct("SUB")}, DEC ${pct("DEC")}`);
}
const ufcRoster = Object.values(w.fighters).filter((f) => f.promo === "ufc" && f.status === "active");
const ufcFights = Object.values(w.bouts).filter((b) => b.promo === "ufc" && b.status === "done").length;
console.log(`  UFC roster ${ufcRoster.length} (start 663); ${(ufcFights * 2 / ufcRoster.length / span).toFixed(2)} fights per fighter a year; mean overall ${(ufcRoster.reduce((a, f) => a + ovrOf(f.attrs), 0) / ufcRoster.length).toFixed(1)}; mean age ${(ufcRoster.reduce((a, f) => a + ageAt(f.birth, w.day), 0) / ufcRoster.length).toFixed(1)}`);
console.log(`  Active fighters ${Object.values(w.fighters).filter((f) => f.status === "active").length}, retired ${Object.values(w.fighters).filter((f) => f.status === "retired").length}`);
const champs = Object.entries(w.promos.ufc.champs).map(([d, id]) => `${DIVISIONS[d as keyof typeof DIVISIONS].short}: ${id ? `${w.fighters[id].first} ${w.fighters[id].surname}` : "vacant"}`);
console.log(`  UFC champions on ${fmtDate(w.day)}: ${champs.join("; ")}`);
const reigns = w.promos.ufc.reigns.filter((r) => r.won >= startDay).length;
console.log(`  New UFC champions crowned: ${reigns}`);
for (const id of w.career.fighters) {
  const f = w.fighters[id];
  console.log(`  Player: ${f.first} ${f.surname}, ${f.rec.w}-${f.rec.l}-${f.rec.d} (am ${f.am.w}-${f.am.l}), ${f.promo ?? "free agent"}, overall ${ovrOf(f.attrs).toFixed(1)}, money $${Math.round(w.career.money).toLocaleString()}`);
}
const news = w.news.slice(0, 6).map((n) => `    ${fmtDate(n.day)}: ${n.text}`);
console.log(news.join("\n"));
// The world mustn't drift: chins wearing faster than power, styles mastered ever deeper, or
// knockouts creeping up year on year (34% to 40% over ten years before the aging and the
// style learning were rebalanced).
{
  const ufcNow = Object.values(w.fighters).filter((f) => f.status === "active" && f.promo === "ufc");
  const avg = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
  const pc = avg(ufcNow.map((f) => f.attrs.power - f.attrs.chin));
  const mastery = avg(ufcNow.map((f) => f.style?.sm ?? 0));
  const ufcBouts = Object.values(w.bouts).filter((b) => b.promo === "ufc" && b.status === "done" && b.day >= startDay && b.res);
  const ko = ufcBouts.filter((b) => b.res!.method === "KO" || b.res!.method === "TKO").length / Math.max(1, ufcBouts.length);
  console.log(`Drift: UFC power-chin ${pc.toFixed(2)} (start -0.24), striking mastery ${mastery.toFixed(1)} (start 52), UFC KO/TKO ${(ko * 100).toFixed(1)}% over ${ufcBouts.length} fights`);
  if (pc > 0.35) errors.push(`UFC fighters' power has run ahead of their chins (${pc.toFixed(2)})`);
  if (mastery > 60) errors.push(`style mastery has drifted up to ${mastery.toFixed(1)}`);
  if (ko > 0.39 || ko < 0.27) errors.push(`UFC knockouts at ${(ko * 100).toFixed(1)}% over the run`);
}

// Saves are written as tables (src/state/codec.ts): read back, it is the same world.
{
  const canon = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon((v as Record<string, unknown>)[k])])) : v;
  const plain = JSON.stringify(w);
  const packed = packNow(w);
  const back = unpack(JSON.parse(packed));
  if (JSON.stringify(canon(back)) !== JSON.stringify(canon(JSON.parse(plain)))) errors.push("a save written as tables doesn't read back as the same world");
  console.log(`Save as tables: ${(packed.length / 1e6).toFixed(2)} MB against ${(plain.length / 1e6).toFixed(2)} MB plain (${Math.round((1 - packed.length / plain.length) * 100)}% smaller)`);
}

if (errors.length) {
  console.log(`${errors.length} problems:`);
  for (const e of errors.slice(0, 20)) console.log("  " + e);
  process.exit(1);
}
console.log("World check passed.");
