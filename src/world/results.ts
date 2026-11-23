// Fight night: weigh-ins, the fights, and everything a result changes —
// records, ratings, belts, rankings, suspensions, injuries, bonuses and news.

import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import { ovr, ovrOf } from "../model/attributes";
import type { Bout, BoutResult, Fighter, MMAEvent, Reign, World } from "../model/types";
import { simulate, methodPhrase, type Condition, type FightInput, type FightOutcome } from "../engine/sim";
import { addNews, fullName, isControlled, rankOf, touch } from "./core";
import { eloUpdate, entryElo, nameContenders, rankingNews, updateP4P, updateRankings } from "./rankings";
import { markDone } from "./calendar";
import { orderCard } from "./matchmaking";
import { afterFightCareer, payControlled } from "../career/afterfight";
import { vacate } from "./titles";

export function ringRust(days: number): number {
  if (days < 270) return 0;
  return clamp(Math.sqrt((days - 270) / 530), 0, 1);
}

/** Weight cut drain for a fighter without a camp of their own (the AI). */
function aiCut(f: Fighter, limit: number, rng: Rng): number {
  const pct = (f.walk - limit) / limit;
  return clamp((pct - 0.07) / 0.12 + rng.normal(0, 0.12), 0, 0.9) * 0.55;
}

export function conditionFor(w: World, f: Fighter, b: Bout, rng: Rng): Partial<Condition> {
  const ev = w.events[b.ev];
  const layoff = f.lastFight === null ? 0 : b.day - f.lastFight;
  const c: Partial<Condition> = {
    rust: ringRust(layoff),
    home: !!ev && ev.country === f.country,
    shortNotice: !!b.shortNotice && b.replaced !== undefined && (b.a === f.id ? true : true),
  };
  const fc = w.career.fc[f.id];
  if (fc && fc.camp && fc.camp.bout === b.id) {
    // The player's camp decides the cut and the preparation (career/camp.ts).
    c.cut = fc.campCut ?? 0.15;
    c.prep = fc.campPrep ?? 0;
    c.injury = f.injury && f.injury.until > b.day ? 0.5 : 0;
  } else {
    c.cut = aiCut(f, DIVISIONS[b.div].limit, rng);
    c.prep = clamp(rng.normal(0, 0.3) - (b.shortNotice ? 0.45 : 0), -1, 0.6);
    c.injury = rng.chance(0.04) ? 0.3 : 0;
  }
  if (b.shortNotice && b.replaced) {
    // The fighter who stepped in had the short camp.
    c.shortNotice = true;
  }
  return c;
}

export function fightInputFor(w: World, b: Bout, rng: Rng, seed: number, log: boolean): FightInput {
  const a = w.fighters[b.a];
  const bb = w.fighters[b.b];
  const tierRank = { amateur: 0, local: 1, regional: 2, tryout: 3, league: 4, major: 5 }[PROMOTIONS[b.promo].tier];
  const fcA = w.career.fc[a.id];
  const fcB = w.career.fc[bb.id];
  return {
    a,
    b: bb,
    planA: fcA?.camp?.bout === b.id ? fcA.camp.plan : undefined,
    planB: fcB?.camp?.bout === b.id ? fcB.camp.plan : undefined,
    condA: conditionFor(w, a, b, rng),
    condB: conditionFor(w, bb, b, rng),
    rounds: b.rounds,
    roundSec: b.roundSec,
    div: b.div,
    title: b.kind === "title" || b.kind === "vacant" || b.kind === "interim",
    seed,
    log,
    tier: tierRank,
  };
}

/** Weigh-ins for the AI: a few percent miss, more for big cutters. */
export function weighIns(w: World, rng: Rng, ev: MMAEvent): void {
  for (const id of ev.bouts) {
    const b = w.bouts[id];
    if (b.status !== "booked" || b.weighIn) continue;
    const limit = DIVISIONS[b.div].limit;
    const allow = b.kind === "title" || b.kind === "vacant" || b.kind === "interim" ? 0 : 1;
    const out: NonNullable<Bout["weighIn"]> = { a: limit + allow * 0.5, b: limit + allow * 0.5 };
    for (const side of ["a", "b"] as const) {
      const f = w.fighters[b[side]];
      if (f.ctrl && w.career.fc[f.id]?.weighed !== undefined && w.career.fc[f.id]?.campBout === b.id) {
        const wt = w.career.fc[f.id].weighed!;
        out[side] = wt;
        if (wt > limit + allow) out[side === "a" ? "missA" : "missB"] = true;
        continue;
      }
      const pct = (f.walk - limit) / limit;
      const p = clamp(0.012 + Math.max(0, pct - 0.1) * 0.35 + (b.shortNotice ? 0.04 : 0) + (DIVISIONS[b.div].sex === "F" ? 0.008 : 0), 0, 0.2);
      if (rng.chance(p)) {
        const over = Math.round((allow + 0.3 + rng.next() * rng.next() * 5) * 10) / 10;
        out[side] = limit + over;
        out[side === "a" ? "missA" : "missB"] = true;
      } else {
        out[side] = Math.round((limit - rng.next() * 0.8 + allow * 0.4) * 10) / 10;
      }
    }
    b.weighIn = out;
    if (out.missA || out.missB) {
      const f = w.fighters[out.missA ? b.a : b.b];
      b.catchweight = Math.ceil(Math.max(out.a, out.b));
      if (ev.promo === "ufc" || ev.promo === "pfl" || f.ctrl) {
        addNews(w, { kind: "booking", promo: ev.promo, ev: ev.id, fighters: [f.id], text: `${fullName(f)} missed weight for ${ev.name} (${(out.missA ? out.a : out.b).toFixed(1)} lb) and forfeits part of the purse. The fight goes ahead at a catchweight.` });
      }
    }
  }
}

export function toResult(o: FightOutcome, keep: boolean): BoutResult {
  const r: BoutResult = {
    winner: o.winner,
    method: o.method,
    detail: o.detail,
    round: o.round,
    time: o.time,
    cards: o.cards,
    verdict: o.verdict,
    perf: o.perf,
  };
  if (keep) {
    r.stats = o.stats;
    r.rounds = o.rounds;
    r.rcards = o.rcards;
    r.log = o.log;
  } else if (o.method === "DEC" || o.method === "DRAW") {
    r.rcards = o.rcards;
  }
  (r as BoutResult & { exc?: number }).exc = Math.round(o.excitement * 10) / 10;
  return r;
}

/** Run a card. Fights involving the player's fighters are held for fight night. */
export function runEvent(w: World, rng: Rng, ev: MMAEvent): { awaiting: Bout[] } {
  weighIns(w, rng, ev);
  const awaiting: Bout[] = [];
  // Early prelims first, main event last.
  const order = [...ev.bouts].reverse();
  for (const id of order) {
    const b = w.bouts[id];
    if (b.status !== "booked") continue;
    if (b.pending) {
      // An offer nobody answered: the fight never happened.
      b.status = "cancelled";
      b.why = "Not agreed";
      for (const fid of [b.a, b.b]) if (w.fighters[fid]?.booked === b.id) w.fighters[fid].booked = null;
      continue;
    }
    if (isControlled(w, b.a) || isControlled(w, b.b)) {
      b.awaiting = true;
      awaiting.push(b);
      continue;
    }
    const seed = rng.int(1, 2 ** 31 - 1);
    const out = simulate(fightInputFor(w, b, rng, seed, false));
    applyResult(w, rng, b, out);
  }
  if (!awaiting.length) finishEvent(w, rng, ev);
  return { awaiting };
}

function rec(f: Fighter, b: Bout) {
  return PROMOTIONS[b.promo].tier === "amateur" ? f.am : f.rec;
}

const SUSPENSION = { KO: [90, 120], TKO: [45, 60], SUB: [7, 21], DEC: [7, 14] } as const;

export function applyResult(w: World, rng: Rng, b: Bout, o: FightOutcome): void {
  const A = w.fighters[b.a];
  const B = w.fighters[b.b];
  const keep = !!(A.ctrl || B.ctrl);
  b.res = toResult(o, keep);
  b.status = "done";
  b.awaiting = false;
  const winner = o.winner === "a" ? A : o.winner === "b" ? B : null;
  const loser = winner === A ? B : winner === B ? A : null;
  b.rankA = rankOf(w, A);
  b.rankB = rankOf(w, B);
  for (const f of [A, B]) {
    f.booked = null;
    f.lastFight = b.day;
    if (!f.bouts.includes(b.id)) f.bouts.push(b.id);
  }
  const m = o.method;
  if (winner && loser) {
    const rw = rec(winner, b);
    const rl = rec(loser, b);
    rw.w++;
    rl.l++;
    if (m === "KO" || m === "TKO") {
      rw.koW++;
      rl.koL++;
    } else if (m === "SUB") {
      rw.subW++;
      rl.subL++;
    } else {
      rw.decW++;
      rl.decL++;
    }
    winner.streak = winner.streak > 0 ? winner.streak + 1 : 1;
    loser.streak = loser.streak < 0 ? loser.streak - 1 : -1;
  } else {
    if (m === "NC") {
      A.rec.nc++;
      B.rec.nc++;
    } else {
      rec(A, b).d++;
      rec(B, b).d++;
      A.streak = 0;
      B.streak = 0;
    }
  }
  if (m !== "NC") eloUpdate(w, b, winner, A, B);

  // Contracts count the fight; a win lifts the next purse.
  for (const f of [A, B]) {
    const c = f.contract;
    if (c && c.promo === b.promo && PROMOTIONS[b.promo].tier !== "amateur") {
      c.left = Math.max(0, c.left - 1);
      if (f === winner && c.win > 0) {
        c.show += c.escal;
        c.win += c.escal;
      }
    }
  }

  // Popularity.
  const tierPop = { amateur: 0.4, local: 0.7, regional: 1, tryout: 1.4, league: 1.5, major: 2 }[PROMOTIONS[b.promo].tier];
  const title = b.kind === "title" || b.kind === "vacant" || b.kind === "interim";
  if (winner && loser) {
    const finish = m !== "DEC";
    winner.pop = clamp(winner.pop + tierPop * (finish ? 2.6 : 1.3) * (title ? 2 : 1) * (1 - winner.pop / 130), 0, 100);
    loser.pop = clamp(loser.pop - tierPop * 0.9, 0, 100);
  }

  // Career numbers.
  for (const [f, mine, theirs] of [
    [A, o.stats[0], o.stats[1]],
    [B, o.stats[1], o.stats[0]],
  ] as const) {
    const s = f.stats;
    s.fights++;
    s.secs += (o.round - 1) * b.roundSec + o.time;
    s.sigL += mine.sigL;
    s.sigA += mine.sigA;
    s.sigAbs += theirs.sigL;
    s.sigAbsA += theirs.sigA;
    s.head += mine.head;
    s.body += mine.body;
    s.leg += mine.leg;
    s.dist += mine.dist;
    s.clinch += mine.clinch;
    s.ground += mine.ground;
    s.kd += mine.kd;
    s.kdAbs += theirs.kd;
    s.tdL += mine.tdL;
    s.tdA += mine.tdA;
    s.tdAbs += theirs.tdL;
    s.tdAbsA += theirs.tdA;
    s.subA += mine.subA;
    s.ctrl += Math.round(mine.ctrl);
  }

  // Damage, wear, suspensions and injuries.
  const sides = o.sides;
  for (const [f, side] of [
    [A, sides[0]],
    [B, sides[1]],
  ] as const) {
    const taken = 100 - side.head;
    f.dmg += taken * 0.18 + (100 - side.body) * 0.04;
    let susp = 7 + rng.int(0, 7);
    if (f === loser && (m === "KO" || m === "TKO")) {
      const detail = o.detail.toLowerCase();
      if (m === "KO") {
        f.dmg += 14;
        f.attrs.chin = clamp(f.attrs.chin - rng.range(0.25, 0.6), 1, 20);
        susp = rng.int(SUSPENSION.KO[0], SUSPENSION.KO[1]);
      } else if (detail.includes("doctor")) susp = 45;
      else if (detail.includes("corner") || detail.includes("leg")) susp = 30;
      else {
        f.attrs.chin = clamp(f.attrs.chin - rng.range(0.08, 0.25), 1, 20);
        susp = rng.int(SUSPENSION.TKO[0], SUSPENSION.TKO[1]);
        f.dmg += 6;
      }
    } else if (side.kd >= 2 || side.head < 40) susp = Math.max(susp, 30);
    else if (f === loser && m === "SUB") susp = rng.int(7, 21);
    f.susp = Math.max(f.susp, b.day + susp);
    const worst = Math.min(side.head, side.body, side.legs);
    const pInj = 0.035 + 0.3 * Math.pow(1 - worst / 100, 2) + (side.cut >= 2 ? 0.15 : 0);
    if (rng.chance(pInj)) {
      const which = side.cut >= 2 ? "cut" : side.legs < 45 ? "leg" : side.head < 45 ? "head" : rng.pick(["hand", "knee", "shoulder", "rib"]);
      const names: Record<string, [string, number, number]> = {
        cut: ["Deep cut", 21, 42],
        leg: ["Leg damage", 21, 45],
        head: ["Orbital fracture", 45, 90],
        hand: ["Broken hand", 45, 100],
        knee: ["Knee injury", 30, 120],
        shoulder: ["Shoulder injury", 28, 70],
        rib: ["Cracked rib", 28, 49],
      };
      const [name, lo, hi] = names[which];
      const days = rng.int(lo, hi);
      f.injury = { name, area: which === "cut" ? "head" : (which as "head"), until: b.day + days, severity: days > 60 ? 2 : 1, from: "fight" };
    }
  }

  // Belts.
  handleTitle(w, rng, b, winner, loser);

  for (const f of [A, B]) {
    const o2 = ovr(f.attrs);
    if (o2 > f.best) f.best = o2;
  }

  // News for the fights people talk about.
  const ev = w.events[b.ev];
  const big = PROMOTIONS[b.promo].tier === "major" || PROMOTIONS[b.promo].tier === "league" || title;
  if (ev && winner && loser && (title || (big && b.order === 0) || keep)) {
    const how = methodPhrase(m, o.detail);
    const where = m === "DEC" ? "" : ` in round ${o.round}`;
    addNews(w, {
      kind: "result",
      promo: b.promo,
      ev: ev.id,
      fighters: [winner.id, loser.id],
      big: title || b.order === 0,
      text: `${fullName(winner)} beat ${fullName(loser)} by ${how}${where} at ${ev.name}.`,
    });
  }
  if (ev && winner && loser && big && !title && b.odds !== undefined) {
    const p = winner === A ? b.odds : 1 - b.odds;
    if (p < 0.28) addNews(w, { kind: "upset", promo: b.promo, ev: ev.id, fighters: [winner.id, loser.id], text: `Upset at ${ev.name}: ${fullName(winner)} beat the favourite ${fullName(loser)}.` });
  }
  if (keep) afterFightCareer(w, rng, b, o);
  touch(w);
}

function endReign(w: World, f: Fighter, b: Bout, how: Reign["ended"]): void {
  const ps = w.promos[b.promo];
  const r = [...ps.reigns].reverse().find((x) => x.fighter === f.id && x.div === b.div && x.lost === undefined);
  if (r) {
    r.lost = b.day;
    r.ended = how;
  }
}

function startReign(w: World, f: Fighter, b: Bout, how: string, interim = false): void {
  const ps = w.promos[b.promo];
  ps.reigns.push({ fighter: f.id, promo: b.promo, div: b.div, won: b.day, defenses: 0, how, interim });
  if (!interim && (PROMOTIONS[b.promo].tier === "major" || PROMOTIONS[b.promo].tier === "league")) f.reigns++;
}

function handleTitle(w: World, rng: Rng, b: Bout, winner: Fighter | null, loser: Fighter | null): void {
  if (b.kind !== "title" && b.kind !== "vacant" && b.kind !== "interim") return;
  const ps = w.promos[b.promo];
  const d = b.div;
  const p = PROMOTIONS[b.promo];
  const champId = ps.champs[d] ?? null;
  const missed = (f: Fighter) => (b.weighIn?.missA && f.id === b.a) || (b.weighIn?.missB && f.id === b.b);
  const ev = w.events[b.ev];
  const belt = `${p.short} ${DIVISIONS[d].name.toLowerCase()} title`;
  if (b.kind === "interim") {
    if (winner && !missed(winner)) {
      ps.interim[d] = winner.id;
      startReign(w, winner, b, "interim", true);
      addNews(w, { kind: "title", promo: b.promo, ev: b.ev, fighters: [winner.id], big: true, text: `${fullName(winner)} is the interim ${belt.replace("title", "champion")}.` });
    }
    return;
  }
  if (b.kind === "vacant") {
    if (winner && !missed(winner)) {
      ps.champs[d] = winner.id;
      if (ps.interim[d] === winner.id) ps.interim[d] = null;
      startReign(w, winner, b, "vacant");
      addNews(w, { kind: "title", promo: b.promo, ev: b.ev, fighters: [winner.id], big: true, text: `${fullName(winner)} wins the vacant ${belt}${ev ? ` at ${ev.name}` : ""}.` });
    }
    updateRankings(w, b.promo, [d]);
    return;
  }
  // A title defence (or unification).
  if (!winner || !loser) {
    const r = [...ps.reigns].reverse().find((x) => x.fighter === champId && x.lost === undefined);
    if (r) r.defenses++;
    if (champId) ps.contender[d] = champId === b.a ? b.b : b.a; // a draw: run it back
    return;
  }
  if (winner.id === champId) {
    const r = [...ps.reigns].reverse().find((x) => x.fighter === champId && x.lost === undefined && !x.interim);
    if (r) r.defenses++;
    if (ps.interim[d] === loser.id) {
      ps.interim[d] = null;
      endReign(w, loser, b, "unified");
    }
    if (rng.chance(0.25) && b.res?.verdict === "split") ps.contender[d] = loser.id;
    return;
  }
  if (missed(winner)) return; // cannot win the belt on the scale
  if (champId) {
    const old = w.fighters[champId];
    endReign(w, old, b, "lost");
    const r = [...ps.reigns].reverse().find((x) => x.fighter === champId && x.div === d);
    // Close fights and long reigns earn the immediate rematch.
    if (b.res && (b.res.verdict === "split" || b.res.verdict === "majority" || (r && r.defenses >= 2))) ps.contender[d] = champId;
  }
  ps.champs[d] = winner.id;
  if (ps.interim[d] === winner.id) {
    ps.interim[d] = null;
    endReign(w, winner, b, "unified");
  }
  startReign(w, winner, b, "won");
  addNews(w, { kind: "title", promo: b.promo, ev: b.ev, fighters: [winner.id, loser.id], big: true, text: `NEW CHAMPION: ${fullName(winner)} beats ${fullName(loser)} for the ${belt}${ev ? ` at ${ev.name}` : ""}.` });
}

/** The end of a card: bonuses, rankings, contenders, the pound-for-pound list. */
export function finishEvent(w: World, rng: Rng, ev: MMAEvent): void {
  if (ev.status === "done") return;
  const done = ev.bouts.map((id) => w.bouts[id]).filter((b) => b.status === "done" && b.res);
  if (ev.promo === "ufc" && done.length) {
    const exc = (b: Bout) => (b.res as BoutResult & { exc?: number }).exc ?? 0;
    const fotn = done.slice().sort((x, y) => exc(y) - exc(x))[0];
    fotn.res!.bonus = ["fotn"];
    const finishes = done
      .filter((b) => b.res!.winner && b.res!.method !== "DEC" && b !== fotn)
      .map((b) => ({ b, s: (b.res!.method === "KO" ? 3 : b.res!.method === "SUB" ? 2.6 : 2) + (4 - b.res!.round) * 0.6 + b.res!.perf[b.res!.winner === "a" ? 0 : 1] * 0.3 + rng.next() }))
      .sort((x, y) => y.s - x.s)
      .slice(0, 2);
    for (const { b } of finishes) {
      b.res!.bonus = [...(b.res!.bonus ?? []), b.res!.winner === "a" ? "potn-a" : "potn-b"];
    }
  }
  // Pay the player's fighters now the bonuses are known.
  for (const b of done) if (isControlled(w, b.a) || isControlled(w, b.b)) payControlled(w, b);
  if (ev.promo === "dwcs") dwcsContracts(w, rng, ev);
  markDone(w, ev);
  const p = PROMOTIONS[ev.promo];
  if (p.rankSize) {
    const divs = [...new Set(done.map((b) => b.div))];
    updateRankings(w, ev.promo, divs);
    nameContenders(w, ev.promo);
    for (const d of divs) rankingNews(w, ev.promo, d);
  }
  if (ev.promo === "ufc") updateP4P(w);
  orderCard(w, ev);
  touch(w);
}

/** Contender Series: the boss hands out contracts to the winners who impressed. */
function dwcsContracts(w: World, rng: Rng, ev: MMAEvent): void {
  for (const id of ev.bouts) {
    const b = w.bouts[id];
    if (b.status !== "done" || !b.res?.winner) continue;
    const f = w.fighters[b.res.winner === "a" ? b.a : b.b];
    const perf = b.res.perf[b.res.winner === "a" ? 0 : 1];
    const p = b.res.method !== "DEC" ? 0.72 : perf >= 7.2 ? 0.4 : 0.12;
    if (!rng.chance(p)) continue;
    f.tags = [...(f.tags ?? []), "dwcs"];
    if (f.ctrl) {
      // The player's fighter gets the offer in the inbox (career/offers.ts).
      w.career.pendingUfcOffer = f.id;
      continue;
    }
    signTo(w, f, "ufc", rng);
    addNews(w, { kind: "signing", promo: "ufc", fighters: [f.id], text: `${fullName(f)} earns a UFC contract on the Contender Series.` });
  }
}

export function signTo(w: World, f: Fighter, promo: "ufc" | "pfl" | string, rng: Rng, opts: { fights?: number; show?: number } = {}): void {
  const id = promo as keyof typeof PROMOTIONS;
  const p = PROMOTIONS[id];
  if (f.promo && f.promo !== id) vacate(w, f, "moved");
  f.promo = id;
  f.joined = w.day;
  f.elo = entryElo(id, ovrOf(f.attrs), f.elo);
  const show = opts.show ?? (id === "ufc" ? 12000 : id === "pfl" ? Math.round(clamp(15000 + (ovrOf(f.attrs) - 66) * 2500, 12000, 80000)) : Math.round(p.showLow + (p.showHigh - p.showLow) * 0.15));
  f.contract = {
    promo: id,
    fights: opts.fights ?? (id === "ufc" ? 4 : 3),
    left: opts.fights ?? (id === "ufc" ? 4 : 3),
    show,
    win: show,
    escal: id === "ufc" ? 2000 : Math.round(show * 0.1),
    start: w.day,
    end: w.day + 365 * 2,
    champClause: p.tier === "major" || p.tier === "league",
    signBonus: 0,
  };
  if (id === "ufc") f.tags = [...new Set([...(f.tags ?? []), "ufc-alum"])];
  void rng;
  touch(w);
}

export { orderCard };
