// The day-by-day loop. Continue moves the calendar until something needs the
// player: a decision in the inbox, a fight night, or the end of the week.

import { staffWeekly } from "../career/staff";
import { testingMonthly } from "../world/testing";
import { storiesMonthly } from "../world/stories";
import { gymMonthly, investMonthly } from "../career/business";
import { awardsMonthly } from "../world/awards";
import { Rng, hashString, mix } from "../core/rng";
import { isFirstOfMonth, isMonday, fmtDate } from "../core/time";
import { PROMOTIONS, PROMO_IDS } from "../data/promotions";
import { ovr } from "../model/attributes";
import type { Bout, MMAEvent, World } from "../model/types";
import { TECHNIQUES, type TechId } from "../data/techniques";
import { ensureSchedule, eventsOn } from "../world/calendar";
import { fullName, touch, withRng } from "../world/core";
import { monthlyDevelopmentSteps } from "../world/development";
import { monthlyMarket } from "../world/market";
import { bookingPass, campInjuries, fillGaps, withdraw } from "../world/matchmaking";
import { applyResult, finishEvent, fightInputFor, runEvent, runEventSteps } from "../world/results";
import { updateP4P, updateRankings } from "../world/rankings";
import { simulate, type FightOutcome } from "../engine/sim";
import { campWeek, fightEve } from "../career/camp";
import { blocking, notify } from "../career/inbox";
import { monthlyMoney } from "../career/money";
import { careerInterest, expireOffers, startSignedDeals } from "../career/offers";
import { trainingWeek } from "../career/training";
import { rankAchievements } from "../career/achievements";
import { monthlySponsors, weeklySponsors } from "../career/sponsors";
import { monthlyAgency } from "../career/agency";
import { fightWeekDaily } from "../career/fightweek";
import { pressDaily } from "../career/media";
import { lifeAfterEvent, lifeWeekly } from "../career/life";
import { coolHeat } from "../career/rivals";
import { driftRapport } from "../career/promoter";
import { walkMonthly } from "../career/moves";
import { legacyMonthly } from "../world/legacy";
import { retirementTalk } from "../career/retire";
import { injuryHealed, playerInjured } from "../career/injury";
import { bmfMonthly, stripMonthly } from "../world/belts";
import { pruneReports } from "../world/report";
import { INJURY } from "../data/injuries";
import { FIGHT_STYLES, masteryName } from "../data/fightstyles";
import { drain, type Steps } from "../core/steps";

export interface Stop {
  kind: "decision" | "fight" | "week" | "message" | "retired";
  text: string;
  ref?: string;
}

function heal(w: World): void {
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    if (!f) continue;
    if (f.injury && f.injury.until <= w.day) {
      const was = f.injury;
      notify(w, { kind: "injury", fighter: f.id, from: "Team doctor", subject: `${fullName(f)} is fit again`, body: `The ${was.name.toLowerCase()} has healed${was.start !== undefined ? `, ${Math.round((w.day - was.start) / 7)} weeks after it happened` : ""}. Cleared for full training and for fights.` });
      f.injury = null;
      injuryHealed(w, f);
    }
  }
  if (w.day % 7 === 3) {
    for (const f of Object.values(w.fighters)) if (f.injury && f.injury.until <= w.day) f.injury = null;
  }
}

function weekly(w: World, rng: Rng): void {
  staffWeekly(w);
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    const fc = w.career.fc[id];
    if (!f || !fc || f.status !== "active") continue;
    const plan = { ...fc.plan, week: [...fc.plan.week] };
    if (fc.dayJob) for (let k = 6; k < 10; k++) plan.week[k] = "rest";
    const r = trainingWeek(w, f, plan, rng, true, fc.adapt ? 0.75 : 1);
    if (fc.adapt) fc.adapt--;
    fc.week = { growth: r.growth, fatigue: r.fatigue, injury: r.injury?.name };
    // Technique drilling.
    if (r.drilled) {
      const prog = (fc as unknown as { drill?: Partial<Record<TechId, number>> });
      prog.drill = prog.drill ?? {};
      const cur = (prog.drill[r.drilled.tech] ?? 0) + r.drilled.progress;
      if (cur >= 1) {
        prog.drill[r.drilled.tech] = 0;
        f.tech[r.drilled.tech] = Math.min(3, (f.tech[r.drilled.tech] ?? 0) + 1);
        const lvl = f.tech[r.drilled.tech]!;
        notify(w, { kind: "training", fighter: f.id, from: "Technique coach", subject: `${TECHNIQUES[r.drilled.tech].name}: ${["", "working", "sharp", "second nature"][lvl]}`, body: `${fullName(f)}'s ${TECHNIQUES[r.drilled.tech].name.toLowerCase()} is now ${["", "a working technique", "sharp", "second nature"][lvl]}.${lvl >= 3 ? " Pick a new technique to drill." : ""}` });
        if (lvl >= 3) fc.plan.drill = null;
      } else prog.drill[r.drilled.tech] = cur;
    }
    if (r.styled) {
      const sd = FIGHT_STYLES[r.styled.id];
      const was = masteryName(r.styled.before);
      const now = masteryName(r.styled.after);
      if (now !== was && r.styled.after > r.styled.before) {
        notify(w, {
          kind: "training", fighter: f.id, from: "Head coach",
          subject: `${sd.name}: ${now.toLowerCase()} now`,
          body: `${fullName(f)}'s ${sd.name.toLowerCase()} game has moved up a level: ${now.toLowerCase()} (${Math.round(r.styled.after)}). ${sd.how[0]}, and it shows in sparring.`,
          facts: [{ k: "Style", v: sd.name }, { k: "Mastery", v: `${Math.round(r.styled.before)} → ${Math.round(r.styled.after)}`, tone: "good" }, { k: "Level", v: now }],
        });
      }
      if (r.styled.tech && r.styled.progress) {
        const prog = (fc as unknown as { drill?: Partial<Record<TechId, number>> });
        prog.drill = prog.drill ?? {};
        const t = r.styled.tech;
        const cur = (prog.drill[t] ?? 0) + r.styled.progress;
        if (cur >= 1) {
          prog.drill[t] = 0;
          f.tech[t] = Math.min(3, (f.tech[t] ?? 0) + 1);
          const lvl = f.tech[t]!;
          notify(w, { kind: "training", fighter: f.id, from: "Technique coach", subject: `${TECHNIQUES[t].name}: ${["", "working", "sharp", "second nature"][lvl]}`, body: `Style coaching paid off: ${fullName(f)}'s ${TECHNIQUES[t].name.toLowerCase()} is now ${["", "a working technique", "sharp", "second nature"][lvl]}.` });
        } else prog.drill[t] = cur;
      }
    }
    if (r.injury) playerInjured(w, rng, f, INJURY[r.injury.id], "training");
    const films = plan.week.filter((s) => s === "film").length;
    const spars = plan.week.filter((s) => s === "sparring").length;
    campWeek(w, f, films, spars);
    if (f.fatigue >= 80) notify(w, { kind: "training", fighter: f.id, from: "Strength coach", subject: `${fullName(f)} is overtrained`, body: `Fatigue is at ${f.fatigue}. Growth is suffering and the injury risk is high. Take a light week.` });
  }
  weeklySponsors(w);
  coolHeat(w);
  driftRapport(w);
  lifeWeekly(w, rng);
}

function* monthlySteps(w: World, rng: Rng): Steps<void> {
  yield* monthlyDevelopmentSteps(w, rng);
  yield;
  monthlyMarket(w, rng);
  yield;
  for (const id of PROMO_IDS) if (PROMOTIONS[id].rankSize) updateRankings(w, id);
  yield;
  updateP4P(w);
  monthlyMoney(w);
  careerInterest(w, rng);
  monthlySponsors(w, rng);
  if (w.career.mode === "manager") monthlyAgency(w, rng);
  rankAchievements(w);
  walkMonthly(w);
  legacyMonthly(w);
  awardsMonthly(w);
  testingMonthly(w, rng);
  storiesMonthly(w, rng);
  gymMonthly(w);
  investMonthly(w, rng);
  stripMonthly(w);
  bmfMonthly(w);
  pruneReports(w);
  retirementTalk(w, rng);
  for (const id of w.career.fighters) {
    const fc = w.career.fc[id];
    const f = w.fighters[id];
    if (fc && f) {
      fc.progress.push({ day: w.day, ovr: ovr(f.attrs) });
      if (fc.progress.length > 240) fc.progress.shift();
    }
  }
}

/** Fight nights waiting for the player today. */
export function fightNight(w: World): MMAEvent | null {
  for (const ev of eventsOn(w, w.day)) {
    if (ev.status === "done") continue;
    if (ev.bouts.some((id) => {
      const b = w.bouts[id];
      return (b.status === "booked" || b.awaiting) && !b.pending && (w.fighters[b.a]?.ctrl || w.fighters[b.b]?.ctrl);
    })) return ev;
  }
  return null;
}

/** Start a fight night: the undercard is fought, the player's fights wait. Opening it again changes nothing. */
export function openFightNight(w: World, ev: MMAEvent): Bout[] {
  const fresh = ev.status !== "done" && ev.bouts.some((id) => w.bouts[id].status === "booked" && !w.bouts[id].awaiting);
  if (fresh) withRng(w, (rng) => runEvent(w, rng, ev));
  return ev.bouts.map((id) => w.bouts[id]).filter((b) => b.awaiting);
}

/**
 * The player's fight goes in the books. Once: a fight already decided keeps its
 * result, so no second simulation can replace the one that was watched.
 */
export function resolvePlayerBout(w: World, b: Bout, out: FightOutcome): boolean {
  if (b.status !== "booked") return false;
  const ev = w.events[b.ev];
  // A fight picked up after a reload can end before the undercard has been run again.
  if (ev && !b.awaiting) openFightNight(w, ev);
  withRng(w, (rng) => {
    applyResult(w, rng, b, out);
    if (ev && !ev.bouts.some((id) => w.bouts[id].awaiting)) finishEvent(w, rng, ev);
  });
  touch(w);
  return true;
}

/** The fight's own random stream: the same bout always plays out the same way for the same plans. */
export function boutRng(w: World, b: Bout): Rng {
  return new Rng(mix(w.seed, hashString(b.id)));
}

export function quickSim(w: World, b: Bout): FightOutcome {
  const rng = boutRng(w, b);
  const seed = rng.int(1, 2 ** 31 - 1);
  return simulate(fightInputFor(w, b, rng, seed, true));
}

export function advanceDay(w: World): Stop[] {
  return drain(advanceDaySteps(w));
}

/**
 * A day, in steps: the morning's work, the month's (development, the market, the
 * rankings), and each event fight by fight. Continue runs it a few milliseconds at a
 * time; the day is the same either way.
 */
export function* advanceDaySteps(w: World): Steps<Stop[]> {
  const stops: Stop[] = [];
  const rng = new Rng(w.rng);
  try {
    w.day += 1;
    heal(w);
    expireOffers(w);
    startSignedDeals(w);
    campInjuries(w, rng);
    bookingPass(w, rng);
    if (w.day % 3 === 0) fillGaps(w, rng);
    fightWeekDaily(w, rng);
    pressDaily(w, rng);
    if (isMonday(w.day)) weekly(w, rng);
    yield;
    if (isFirstOfMonth(w.day)) yield* monthlySteps(w, rng);
    for (const ev of eventsOn(w, w.day)) {
      if (ev.status === "done") continue;
      // A card that never came together isn't held with nobody on it: it comes off the calendar.
      if (!ev.bouts.length) {
        w.upcoming = w.upcoming.filter((id) => id !== ev.id);
        delete w.events[ev.id];
        continue;
      }
      const mine = ev.bouts.some((id) => {
        const b = w.bouts[id];
        return b.status === "booked" && !b.pending && (w.fighters[b.a]?.ctrl || w.fighters[b.b]?.ctrl);
      });
      if (mine) {
        stops.push({ kind: "fight", text: `Fight night: ${ev.name}`, ref: ev.id });
        continue;
      }
      yield* runEventSteps(w, rng, ev);
      lifeAfterEvent(w, ev);
    }
    // The day before a player's fight: the weigh-in.
    for (const ev of eventsOn(w, w.day + 1)) {
      for (const id of ev.bouts) {
        const b = w.bouts[id];
        if (b.status === "booked" && !b.pending && (w.fighters[b.a]?.ctrl || w.fighters[b.b]?.ctrl)) fightEve(w, rng, b);
      }
    }
    ensureSchedule(w, rng);
  } finally {
    w.rng = rng.s;
  }
  touch(w);
  return stops;
}

export interface AdvanceResult {
  days: number;
  stop: Stop | null;
}

/** Continue: up to `max` days, stopping for decisions and fight nights. */
export function advance(w: World, max = 7, onDay?: (w: World) => void): AdvanceResult {
  return drain(advanceSteps(w, max, onDay));
}

/** Continue in steps (see advanceDaySteps). */
export function* advanceSteps(w: World, max = 7, onDay?: (w: World) => void): Steps<AdvanceResult> {
  let days = 0;
  const before = new Set(w.inbox.slice(0, 40).map((m) => m.id));
  for (; days < max; ) {
    const block = blocking(w);
    if (block.length) return { days, stop: { kind: "decision", text: block[0].subject, ref: block[0].id } };
    const fn = fightNight(w);
    if (fn) return { days, stop: { kind: "fight", text: `Fight night: ${fn.name}`, ref: fn.id } };
    if (w.career.mode === "fighter" && !w.career.fighters.some((id) => w.fighters[id]?.status === "active") && !w.career.retiredAt) return { days, stop: { kind: "retired", text: "No active fighters." } };
    const stops = yield* advanceDaySteps(w);
    days++;
    onDay?.(w);
    yield;
    if (stops.length) return { days, stop: stops[0] };
    const fresh = w.inbox.filter((m) => !before.has(m.id) && !m.read && (m.needs || m.kind === "result" || m.kind === "injury" || m.kind === "contract"));
    if (fresh.length) return { days, stop: { kind: fresh[0].needs ? "decision" : "message", text: fresh[0].subject, ref: fresh[0].id } };
  }
  return { days, stop: { kind: "week", text: "A week has passed." } };
}
