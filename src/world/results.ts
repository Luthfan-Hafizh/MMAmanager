// Fight night: weigh-ins, the fights, and everything a result changes —
// records, ratings, belts, rankings, suspensions, injuries, bonuses and news.

import { storyAfterBout } from "./stories";
import type { Rng } from "../core/rng";
import { clamp, nth } from "../core/util";
import { fmtDate } from "../core/time";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import { ovr, ovrOf } from "../model/attributes";
import type { Bout, BoutResult, Fighter, MMAEvent, Reign, World } from "../model/types";
import { simulate, methodPhrase, type Condition, type FightInput, type FightOutcome, isFinish } from "../engine/sim";
import { addNews, fullName, isControlled, rankOf, ringRust, touch, touchRoster } from "./core";
import { fightStyle } from "./fightstyle";
import { packRounds } from "./report";
import { eloUpdate, entryElo, nameContenders, rankingNews, rankScore, updateP4P, updateRankings, unrank } from "./rankings";
import { markDone } from "./calendar";
import { orderCard, refreshCard } from "./matchmaking";
import { afterFightCareer, payControlled } from "../career/afterfight";
import { vacate } from "./titles";
import { mediaPrep } from "../career/fightweek";
import { legacyAfterFight } from "./legacy";
import { boutLimit, cutCheck, noticeHurt, sizeEdge } from "../career/shortnotice";
import { fightInjuryDef, hurtOnNight, makeInjury, type InjuryDef } from "../data/injuries";
import { lc, playerInjured } from "../career/injury";
import { handleBmf, isBeltFight, refreshDivision } from "./belts";
import { notify } from "../career/inbox";
import { arrivalTitleShot, promiseTitle } from "../career/standing";
import { drain, type Steps } from "../core/steps";
import { rtuResults } from "./roadtoufc";

export { ringRust } from "./core";

/** Weight cut drain for a fighter without a camp of their own (the AI). */
function aiCut(f: Fighter, limit: number, rng: Rng): number {
  const pct = (f.walk - limit) / limit;
  return clamp((pct - 0.07) / 0.12 + rng.normal(0, 0.12), 0, 0.9) * 0.55;
}

export function conditionFor(w: World, f: Fighter, b: Bout, rng: Rng): Partial<Condition> {
  const ev = w.events[b.ev];
  const layoff = f.lastFight === null ? 0 : b.day - f.lastFight;
  // Only the fighter who stepped in had the short camp.
  const sub = !!b.shortNotice && b.sub === f.id;
  const c: Partial<Condition> = {
    rust: ringRust(layoff),
    home: !!ev && ev.country === f.country,
    shortNotice: sub,
    notice: sub ? b.notice : undefined,
  };
  const opp = w.fighters[b.a === f.id ? b.b : b.a];
  // Outside the usual division, the size gap tells.
  if (opp && (f.div !== b.div || opp.div !== b.div)) c.size = sizeEdge(f, opp, boutLimit(b));
  const fc = w.career.fc[f.id];
  const hurt = f.injury && f.injury.until > b.day ? f.injury : null;
  if (fc && fc.camp && fc.camp.bout === b.id) {
    // The player's camp decides the cut and the preparation (career/camp.ts).
    c.cut = fc.campCut ?? 0.15;
    c.prep = fc.campPrep ?? 0;
    // Partners who fought like the opponent, unless the opponent changed.
    if (fc.camp.drill && !(b.shortNotice && b.sub && b.sub !== f.id)) c.drill = fc.camp.drill;
    // Fighting on an injury: it hurts what that part of the body does.
    c.injury = hurt ? hurtOnNight(hurt, b.day) : 0;
    if (hurt) c.injuryArea = hurt.area;
  } else {
    c.cut = aiCut(f, boutLimit(b), rng);
    if (sub) {
      // A fast cut drains more.
      const risk = cutCheck(f, boutLimit(b), b.notice ?? 14).risk;
      c.cut = clamp(c.cut + (risk === "hard" ? 0.15 : risk === "normal" ? 0.05 : 0) + 0.05 * noticeHurt(b.notice), 0, 0.9);
    }
    c.prep = clamp(rng.normal(0, 0.3) - (sub ? 0.1 + 0.2 * noticeHurt(b.notice) : 0), -1, 0.6);
    if (hurt) {
      c.injury = hurtOnNight(hurt, b.day);
      c.injuryArea = hurt.area;
    } else if (rng.chance(0.04)) {
      // Most fighters carry something into a fight.
      c.injury = 0.3;
      c.injuryArea = rng.pick(["hand", "knee", "body", "shoulder", "back"]);
    } else c.injury = 0;
  }
  // The fighter whose opponent changed prepared for somebody else.
  if (b.shortNotice && b.sub && b.sub !== f.id) c.prep = (c.prep ?? 0) - 0.08 * noticeHurt(b.notice);
  c.prep = clamp((c.prep ?? 0) + mediaPrep(b, b.a === f.id ? "a" : "b", f), -1, 1);
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

/** The allowance over the limit: a pound, none in a title fight. */
export function weightAllowance(b: Bout): number {
  return b.kind === "title" || b.kind === "vacant" || b.kind === "interim" ? 0 : 1;
}

/** One AI fighter on the scale: a few percent miss, more for big cutters and late replacements. */
export function aiScale(rng: Rng, b: Bout, f: Fighter): { weight: number; miss: boolean } {
  const limit = boutLimit(b);
  const allow = weightAllowance(b);
  const pct = (f.walk - limit) / limit;
  const sub = b.shortNotice && b.sub === f.id;
  const risk = sub ? cutCheck(f, limit, b.notice ?? 14).risk : "normal";
  const p = clamp(0.012 + Math.max(0, pct - 0.1) * 0.35 + (sub ? (risk === "hard" ? 0.12 : risk === "normal" ? 0.04 : 0.01) : 0) + (DIVISIONS[b.div].sex === "F" ? 0.008 : 0), 0, 0.3);
  if (rng.chance(p)) return { weight: Math.round((limit + allow + 0.3 + rng.next() * rng.next() * 5) * 10) / 10, miss: true };
  return { weight: Math.round((limit - rng.next() * 0.8 + allow * 0.4) * 10) / 10, miss: false };
}

/**
 * A champion who misses weight is stripped on the scale; the fight goes ahead
 * and only the opponent can win the belt (the title is vacant).
 */
export function stripAtScale(w: World, b: Bout, f: Fighter): boolean {
  const ps = w.promos[b.promo];
  const d = b.div;
  const opp = w.fighters[b.a === f.id ? b.b : b.a];
  const ev = w.events[b.ev];
  const belt = `${PROMOTIONS[b.promo].short} ${DIVISIONS[d].name.toLowerCase()} title`;
  const end = (interim: boolean) => {
    const r = [...ps.reigns].reverse().find((x) => x.fighter === f.id && x.div === d && x.lost === undefined && !!x.interim === interim);
    if (r) {
      r.lost = w.day;
      r.ended = "stripped";
    }
  };
  if (b.kind === "title" && ps.champs[d] === f.id) {
    end(false);
    ps.champs[d] = null;
    b.kind = "vacant";
    b.stake = undefined;
  } else if (b.kind === "interim" && ps.interim[d] === f.id) {
    end(true);
    ps.interim[d] = null;
    b.stake = undefined;
  } else return false;
  addNews(w, { kind: "title", promo: b.promo, ev: b.ev, fighters: [f.id, opp.id], big: bigStage(b.promo), text: `${fullName(f)} misses weight and is stripped of the ${b.kind === "interim" ? "interim " : ""}${belt}. Only ${fullName(opp)} can win it${ev ? ` at ${ev.name}` : ""}.` });
  return true;
}

/** Weigh-ins for the AI: a few percent miss, more for big cutters. */
export function weighIns(w: World, rng: Rng, ev: MMAEvent): void {
  for (const id of ev.bouts) {
    const b = w.bouts[id];
    if (b.status !== "booked" || b.weighIn) continue;
    const limit = boutLimit(b);
    const allow = weightAllowance(b);
    const out: NonNullable<Bout["weighIn"]> = { a: limit + allow * 0.5, b: limit + allow * 0.5 };
    for (const side of ["a", "b"] as const) {
      const f = w.fighters[b[side]];
      if (f.ctrl && w.career.fc[f.id]?.weighed !== undefined && w.career.fc[f.id]?.campBout === b.id) {
        const wt = w.career.fc[f.id].weighed!;
        out[side] = wt;
        if (wt > limit + allow) out[side === "a" ? "missA" : "missB"] = true;
        continue;
      }
      const r = aiScale(rng, b, f);
      out[side] = r.weight;
      if (r.miss) out[side === "a" ? "missA" : "missB"] = true;
    }
    b.weighIn = out;
    if (out.missA || out.missB) {
      const f = w.fighters[out.missA ? b.a : b.b];
      b.catchweight = Math.ceil(Math.max(out.a, out.b));
      if (!stripAtScale(w, b, f) && (ev.promo === "ufc" || ev.promo === "pfl" || f.ctrl)) {
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
  } else {
    // Every fight keeps its round-by-round numbers in compact form (small shows for six months).
    if (o.rounds?.length) r.rx = packRounds(o.rounds);
    if (o.rcards?.length) r.rcards = o.rcards;
  }
  (r as BoutResult & { exc?: number }).exc = Math.round(o.excitement * 10) / 10;
  return r;
}

/** Run a card. Fights involving the player's fighters are held for fight night. */
export function runEvent(w: World, rng: Rng, ev: MMAEvent): { awaiting: Bout[] } {
  return drain(runEventSteps(w, rng, ev));
}

/** The event, a fight at a step. */
export function* runEventSteps(w: World, rng: Rng, ev: MMAEvent): Steps<{ awaiting: Bout[] }> {
  // What each fight is for, as the belts stand tonight.
  refreshCard(w, ev);
  weighIns(w, rng, ev);
  const awaiting: Bout[] = [];
  // Early prelims first, main event last. The card stops at the player's fight: what comes after
  // it (the co-main, the main event) is fought after it, not in the results while it waits.
  const order = [...ev.bouts].reverse();
  let held = false;
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
      held = true;
      continue;
    }
    if (held) continue;
    const seed = rng.int(1, 2 ** 31 - 1);
    const out = simulate(fightInputFor(w, b, rng, seed, false));
    applyResult(w, rng, b, out);
    yield;
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
  delete b.awaiting;
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
    } else if (m === "DEC") {
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
  // A fight at another weight counts in that division's rankings too (world/rankings.ts):
  // the winner takes the place the beaten fighter held there before the fight.
  const cross = m !== "NC" && PROMOTIONS[b.promo].rankSize > 0 && (A.div !== b.div || B.div !== b.div);
  const before = cross ? { a: rankScore(w, A), b: rankScore(w, B) } : null;
  if (m !== "NC") eloUpdate(w, b, winner, A, B);
  if (before) {
    if (A.div !== b.div) crossWeight(w, A, b, winner === A ? { id: B.id, score: before.b } : null, !!winner && winner !== A);
    if (B.div !== b.div) crossWeight(w, B, b, winner === B ? { id: A.id, score: before.a } : null, !!winner && winner !== B);
  }

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
    const finish = isFinish(m);
    // Winning on short notice makes a name; losing on it costs little.
    const snWin = b.shortNotice && b.sub === winner.id ? 1.5 : 1;
    const snLoss = b.shortNotice && b.sub === loser.id ? 0.4 : 1;
    winner.pop = clamp(winner.pop + tierPop * (finish ? 2.6 : 1.3) * (title ? 2 : 1) * snWin * (1 - winner.pop / 130), 0, 100);
    loser.pop = clamp(loser.pop - tierPop * 0.9 * snLoss, 0, 100);
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
    // A fight deepens a style: the striking always, the grappling when there was some.
    const st = fightStyle(f);
    const grappled = mine.tdA + mine.subA + theirs.tdL > 0 || mine.ctrl > 30;
    st.sm = Math.min(95, Math.round((st.sm + 0.4 * (1 - st.sm / 110)) * 10) / 10);
    if (grappled) st.gm = Math.min(95, Math.round((st.gm + 0.4 * (1 - st.gm / 110)) * 10) / 10);
  }

  // Damage, wear, suspensions and injuries. The chin before, for the player's report.
  const chinBefore: Record<string, number> = { [A.id]: A.attrs.chin, [B.id]: B.attrs.chin };
  const sides = o.sides;
  const hurtNow: [Fighter, InjuryDef][] = [];
  const worse: [Fighter, string, number][] = [];
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
        f.attrs.chin = clamp(f.attrs.chin - rng.range(0.1, 0.25), 1, 20);
        susp = rng.int(SUSPENSION.KO[0], SUSPENSION.KO[1]);
      } else if (detail.includes("doctor")) susp = 45;
      else if (detail.includes("corner") || detail.includes("leg")) susp = 30;
      else {
        f.attrs.chin = clamp(f.attrs.chin - rng.range(0.03, 0.1), 1, 20);
        susp = rng.int(SUSPENSION.TKO[0], SUSPENSION.TKO[1]);
        f.dmg += 6;
      }
    } else if (side.kd >= 2 || side.head < 40) susp = Math.max(susp, 30);
    else if (f === loser && m === "SUB") susp = rng.int(7, 21);
    f.susp = Math.max(f.susp, b.day + susp);
    if (f.susp === b.day + susp) f.suspWhy = undefined;
    // Fought on an injury: it can come out worse.
    const carried = f.injury && f.injury.until > b.day ? f.injury : null;
    if (carried && rng.chance(0.4)) {
      const extra = Math.round((carried.until - (carried.start ?? carried.until - 28)) * 0.5 + 14);
      carried.until += extra;
      carried.aggravated = true;
      if (f.ctrl) worse.push([f, carried.name, extra]);
    }
    // New injuries, from what happened in the fight.
    const def = fightInjuryDef(rng, side, f === loser && m === "SUB" ? o.detail : null);
    if (def && !(carried && carried.until > b.day + def.weeks[1] * 7)) {
      if (f.ctrl) hurtNow.push([f, def]);
      else f.injury = makeInjury(rng, def, b.day, "fight");
    }
  }

  // Belts, and what the result does for a legacy.
  const champBefore = w.promos[b.promo].champs[b.div] ?? null;
  // A belt fight is told once, as a title story (world/belts.ts for the BMF).
  let told = handleTitle(w, rng, b, winner, loser);
  storyAfterBout(w, rng, b);
  if (b.kind === "bmf") told = handleBmf(w, b, winner, loser) || told;
  // Fights already booked in the division are for whatever the belts are now.
  if (isBeltFight(b)) refreshDivision(w, b.promo, b.div);
  const champAfter = w.promos[b.promo].champs[b.div] ?? null;
  // The player's injuries are reported once the belt is settled (a champion may have a decision to make).
  for (const [f, def] of hurtNow) playerInjured(w, rng, f, def, "fight", "in the fight");
  for (const [f, name, extra] of worse) {
    notify(w, { kind: "injury", fighter: f.id, from: "Team doctor", subject: `Made worse: ${lc(name)}`, body: `Fighting on the ${lc(name)} made it worse: another ${Math.round(extra / 7)} weeks before ${fullName(f)} is fight-ready.`, facts: [{ k: "Injury", v: `${name} (made worse)` }, { k: "Extra time out", v: `${Math.round(extra / 7)} weeks`, tone: "bad" }, { k: "Fight-ready", v: f.injury ? fmtDate(f.injury.until) : "now" }] });
  }
  if (winner && loser) {
    const rankLoser = loser === A ? b.rankA ?? null : b.rankB ?? null;
    legacyAfterFight(w, b, winner, loser, rankLoser, champAfter === winner.id && champBefore !== winner.id, champBefore === winner.id && b.kind === "title");
  }

  for (const f of [A, B]) {
    const o2 = ovr(f.attrs);
    if (o2 > f.best) f.best = o2;
  }

  // News for the fights people talk about.
  const ev = w.events[b.ev];
  const big = PROMOTIONS[b.promo].tier === "major" || PROMOTIONS[b.promo].tier === "league" || title;
  if (!told && ev && winner && loser && (title || (big && b.order === 0) || keep)) {
    const how = methodPhrase(m, o.detail);
    const where = m === "DEC" ? "" : ` in round ${o.round}`;
    addNews(w, {
      kind: "result",
      promo: b.promo,
      ev: ev.id,
      fighters: [winner.id, loser.id],
      big: bigStage(b.promo) && (title || b.order === 0),
      text: `${fullName(winner)} beat ${fullName(loser)} by ${how}${where} at ${ev.name}.`,
    });
  }
  if (ev && winner && loser && big && !title && b.odds !== undefined) {
    const p = winner === A ? b.odds : 1 - b.odds;
    if (p < 0.28) addNews(w, { kind: "upset", promo: b.promo, ev: ev.id, fighters: [winner.id, loser.id], text: `Upset at ${ev.name}: ${fullName(winner)} beat the favourite ${fullName(loser)}.` });
  }
  if (keep) afterFightCareer(w, rng, b, o, chinBefore);
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
  settleAtWeight(w, f, b);
}

/**
 * A belt won at another weight (a vacant title a division up, after a win there): the
 * fighter now fights at that weight, where the belt is, unless a belt at the old
 * weight is held too (a double champion keeps both until one is given up).
 */
function settleAtWeight(w: World, f: Fighter, b: Bout): void {
  const from = f.div;
  const d = b.div;
  if (from === d) return;
  const ps = w.promos[b.promo];
  if (ps.champs[from] === f.id || ps.interim[from] === f.id) return;
  f.div = d;
  touchRoster(w, f);
  if (f.xw) f.xw = f.xw.filter((x) => x.div !== d);
  updateRankings(w, b.promo, [from, d]);
  if (f.ctrl) {
    notify(w, {
      kind: "info",
      fighter: f.id,
      from: `${PROMOTIONS[b.promo].short} matchmaker`,
      subject: `Champion at ${DIVISIONS[d].name.toLowerCase()}`,
      body: `${fullName(f)} won the belt at ${DIVISIONS[d].name.toLowerCase()} and now fights there: the defences are at ${DIVISIONS[d].limit} lb, and the rankings at ${DIVISIONS[from].name.toLowerCase()} let go. Set the walking weight on the Training page for the new limit.`,
      facts: [
        { k: "Now fights at", v: DIVISIONS[d].name, tone: "good" },
        { k: "Limit", v: `${DIVISIONS[d].limit} lb` },
      ],
    });
  }
}

/** How a fight ended, for a news story: "by TKO (punches) in round 4", "by unanimous decision". */
function endedBy(b: Bout): string {
  const r = b.res;
  if (!r) return "";
  const how = methodPhrase(r.method, r.detail);
  return r.method === "DEC" ? `by ${how}` : `by ${how} in round ${r.round}`;
}

/**
 * The belts after a title fight, and one story for it in the news: a defence reads
 * as a defence (with the count), a new champion as a new champion. Returns true
 * when the story was written, so the plain result isn't told a second time.
 */
function handleTitle(w: World, rng: Rng, b: Bout, winner: Fighter | null, loser: Fighter | null): boolean {
  if (b.kind !== "title" && b.kind !== "vacant" && b.kind !== "interim") return false;
  const ps = w.promos[b.promo];
  const d = b.div;
  const p = PROMOTIONS[b.promo];
  const champId = ps.champs[d] ?? null;
  const missed = (f: Fighter) => (b.weighIn?.missA && f.id === b.a) || (b.weighIn?.missB && f.id === b.b);
  const ev = w.events[b.ev];
  const at = ev ? ` at ${ev.name}` : "";
  const by = endedBy(b);
  const belt = `${p.short} ${DIVISIONS[d].name.toLowerCase()} title`;
  const big = bigStage(b.promo);
  const story = (text: string, fighters: string[]) => addNews(w, { kind: "title", promo: b.promo, ev: b.ev, fighters, big, text });
  // What the fight did to each side's belts, for the records.
  const note = (f: Fighter, text: string) => {
    if (b.res) b.res.belt = { ...(b.res.belt ?? {}), [b.a === f.id ? "a" : "b"]: text };
  };
  const reignOf = (id: string, interim: boolean) => [...ps.reigns].reverse().find((x) => x.fighter === id && x.div === d && x.lost === undefined && !!x.interim === interim);
  if (b.kind === "interim") {
    const holder = ps.interim[d] ?? null;
    // With an interim champion who isn't in this fight, it can't be for the interim belt.
    if (holder && b.a !== holder && b.b !== holder) return false;
    if (winner && loser && holder === winner.id) {
      // An interim champion defending the interim belt.
      const r = reignOf(winner.id, true);
      if (r) r.defenses++;
      note(winner, "Defended the interim title");
      story(`${fullName(winner)} defends the interim ${belt}, beating ${fullName(loser)} ${by}${at}.`, [winner.id, loser.id]);
      return true;
    }
    if (winner && loser && !missed(winner)) {
      if (holder && holder === loser.id) {
        endReign(w, loser, b, "lost");
        note(loser, "Lost the interim title");
      }
      ps.interim[d] = winner.id;
      startReign(w, winner, b, "interim", true);
      note(winner, "Won the interim title");
      story(`${fullName(winner)} beats ${fullName(loser)} ${by} for the interim ${belt}${at}.`, [winner.id, loser.id]);
      return true;
    }
    if (winner && loser) {
      note(winner, "Missed weight: not eligible for the belt");
      story(`${fullName(winner)} beats ${fullName(loser)} ${by}${at}, but missed weight: the interim ${belt} can't be won over the limit.`, [winner.id, loser.id]);
      return true;
    }
    return false;
  }
  if (b.kind === "vacant") {
    if (winner && loser && !missed(winner)) {
      ps.champs[d] = winner.id;
      if (ps.interim[d] === winner.id) {
        ps.interim[d] = null;
        endReign(w, winner, b, "unified");
      }
      startReign(w, winner, b, "vacant");
      note(winner, "Won the vacant title");
      story(`NEW CHAMPION: ${fullName(winner)} wins the vacant ${belt}, beating ${fullName(loser)} ${by}${at}.`, [winner.id, loser.id]);
    } else if (winner && loser) {
      note(winner, "Missed weight: not eligible for the belt");
      story(`${fullName(winner)} beats ${fullName(loser)} ${by}${at}, but missed weight: the ${belt} stays vacant.`, [winner.id, loser.id]);
    }
    updateRankings(w, b.promo, [d]);
    return !!(winner && loser);
  }
  // A title defence (or a unification).
  if (!winner || !loser) {
    const r = champId ? reignOf(champId, false) : undefined;
    if (r) r.defenses++;
    if (champId) {
      const other = w.fighters[champId === b.a ? b.b : b.a];
      note(w.fighters[champId], b.res?.method === "NC" ? "Kept the title (no contest)" : "Kept the title (draw)");
      ps.contender[d] = other?.id ?? null; // a draw: run it back
      if (other) story(`${fullName(w.fighters[champId])} keeps the ${belt}: ${b.res ? methodPhrase(b.res.method, b.res.detail) : "no result"} with ${fullName(other)}${at}.`, [champId, other.id]);
      return !!other;
    }
    return false;
  }
  if (winner.id === champId) {
    const r = reignOf(champId, false);
    if (r) r.defenses++;
    if (ps.interim[d] === loser.id) {
      ps.interim[d] = null;
      endReign(w, loser, b, "unified");
      note(winner, "Unified the titles");
      note(loser, "Lost the interim title");
      story(`${fullName(winner)} unifies the ${belt}, beating the interim champion ${fullName(loser)} ${by}${at}.`, [winner.id, loser.id]);
    } else {
      note(winner, `Defended the title${r && r.defenses > 1 ? ` (${r.defenses})` : ""}`);
      note(loser, "Lost the title shot");
      const n = r?.defenses ?? 0;
      story(`${fullName(winner)} defends the ${belt}, beating ${fullName(loser)} ${by}${at}${n ? ` (${nth(n)} defence)` : ""}.`, [winner.id, loser.id]);
    }
    if (rng.chance(0.25) && b.res?.verdict === "split") ps.contender[d] = loser.id;
    return true;
  }
  if (missed(winner)) {
    note(winner, "Missed weight: not eligible for the belt");
    story(`${fullName(winner)} beats the champion ${fullName(loser)} ${by}${at}, but missed weight: ${loser.surname} keeps the ${belt}.`, [winner.id, loser.id]);
    return true; // cannot win the belt on the scale
  }
  if (champId) {
    const old = w.fighters[champId];
    endReign(w, old, b, "lost");
    note(old, "Lost the title");
    const r = [...ps.reigns].reverse().find((x) => x.fighter === champId && x.div === d);
    // Close fights and long reigns earn the immediate rematch.
    // A rematch clause in the contract makes it certain.
    if (b.res && (b.res.verdict === "split" || b.res.verdict === "majority" || (r && r.defenses >= 2) || old.contract?.rematch)) ps.contender[d] = champId;
    if (old.contract?.rematch) note(old, "Lost the title: the rematch clause holds");
  }
  ps.champs[d] = winner.id;
  const wasInterim = ps.interim[d] === winner.id;
  if (wasInterim) {
    ps.interim[d] = null;
    endReign(w, winner, b, "unified");
  }
  startReign(w, winner, b, "won");
  note(winner, wasInterim ? "Unified the titles" : "Won the title");
  story(
    wasInterim
      ? `NEW CHAMPION: ${fullName(winner)}, the interim champion, beats ${fullName(loser)} ${by} to unify the ${belt}${at}.`
      : `NEW CHAMPION: ${fullName(winner)} beats ${fullName(loser)} ${by} for the ${belt}${at}.`,
    [winner.id, loser.id],
  );
  return true;
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
      .filter((b) => b.res!.winner && isFinish(b.res!.method) && b !== fotn)
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
  rtuResults(w, rng, ev);
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

/**
 * A result at another weight, kept for that division's rankings: who was beaten
 * there and the place it earned (just above them, as they stood before the
 * fight), the losses there, and when.
 */
function crossWeight(w: World, f: Fighter, b: Bout, beat: { id: string; score: number } | null, lost: boolean): void {
  const list = (f.xw ??= []);
  let x = list.find((e) => e.promo === b.promo && e.div === b.div);
  if (!x) {
    x = { promo: b.promo, div: b.div, beat: [], lost: 0, last: b.day };
    list.push(x);
  }
  if (beat) {
    x.beat = [...x.beat.filter((id) => id !== beat.id), beat.id].slice(-4);
    x.score = Math.max(x.score ?? -1e9, beat.score + 4);
  }
  if (lost) {
    x.lost++;
    x.score = (x.score ?? rankScore(w, f)) - 40;
  }
  x.last = b.day;
}

/** Contender Series: the boss hands out contracts to the winners who impressed. */
function dwcsContracts(w: World, rng: Rng, ev: MMAEvent): void {
  for (const id of ev.bouts) {
    const b = w.bouts[id];
    if (b.status !== "done" || !b.res?.winner) continue;
    const f = w.fighters[b.res.winner === "a" ? b.a : b.b];
    const perf = b.res.perf[b.res.winner === "a" ? 0 : 1];
    // Most winners who impress get the call, as in recent seasons: about 30 contracts from 50 fights.
    const p = isFinish(b.res.method) ? 0.9 : perf >= 7.2 ? 0.7 : 0.35;
    if (!rng.chance(p)) {
      if (f.ctrl) {
        notify(w, {
          kind: "contract",
          fighter: f.id,
          from: "Dana White's Contender Series",
          subject: "A win, but no contract yet",
          body: `${fullName(f)} won, but Dana White wants to see more before handing out a UFC contract: a decision on the Contender Series has to be dominant. Back to the regional scene; keep winning and the scouts will be back next summer.`,
        });
      }
      continue;
    }
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

/** A story big enough to lead: the regional promotions and up, not an amateur or local show. */
function bigStage(promo: string): boolean {
  const t = PROMOTIONS[promo as keyof typeof PROMOTIONS].tier;
  return t !== "amateur" && t !== "local";
}

export function signTo(w: World, f: Fighter, promo: "ufc" | "pfl" | string, rng: Rng, opts: { fights?: number; show?: number } = {}): void {
  const id = promo as keyof typeof PROMOTIONS;
  const p = PROMOTIONS[id];
  if (f.promo && f.promo !== id) {
    vacate(w, f, "moved");
    unrank(w, f, f.promo);
  }
  f.promo = id;
  touchRoster(w, f);
  // Signing with a pro promotion makes a pro (a short-notice debut, a signing from the level below).
  f.amateur = p.tier === "amateur";
  f.joined = w.day;
  f.elo = entryElo(id, ovrOf(f.attrs), f.elo);
  // A champion from a bigger stage goes straight to a title fight here.
  const shot = arrivalTitleShot(w, f, id);
  if (shot) promiseTitle(w, f, id, shot);
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
