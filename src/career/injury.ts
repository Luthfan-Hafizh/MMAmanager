// Injuries in a career: what the doctor says, and the decisions that follow.
// Hurt in camp, a fighter can fight through it (if it's the kind that can be
// fought through, and nearly healed), ask the promotion to postpone (it moves
// most main events, about half the rest), or pull out. A champion facing
// months out decides whether to keep the belt, and the promotion makes an
// interim title, or to vacate it, with a title shot waiting when fit.

import type { Rng } from "../core/rng";
import { fmtDate } from "../core/time";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import { defOf, hurtOnNight, makeInjury, SEVERITY_TEXT, type InjuryDef } from "../data/injuries";
import type { Bout, Fact, Fighter, Injury, World } from "../model/types";
import { addNews, fullName, isChampion } from "../world/core";
import { orderCard, withdraw } from "../world/matchmaking";
import { setOdds } from "../world/odds";
import { vacate } from "../world/titles";
import { notify } from "./inbox";
import { adjustRapport } from "./promoter";

/** "Torn ACL" in a sentence: "torn ACL". */
export function lc(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

function weeksOf(days: number): string {
  const wk = Math.max(0, Math.round(days / 7));
  if (wk >= 9) {
    const mo = Math.round(days / 30.4);
    return `${mo} month${mo === 1 ? "" : "s"}`;
  }
  return `${wk || 1} week${wk === 1 || wk === 0 ? "" : "s"}`;
}

/** The doctor's facts about an injury. */
export function injuryFacts(w: World, inj: Injury): Fact[] {
  const d = defOf(inj);
  const left = inj.until - w.day;
  return [
    { k: "Injury", v: inj.name + (inj.aggravated ? " (made worse)" : "") },
    { k: "Severity", v: `${SEVERITY_TEXT[d.sev]}${inj.surgery ? ", needs surgery" : ""}`, tone: d.sev >= 3 ? "bad" : d.sev === 2 ? "warn" : undefined },
    { k: "Treatment", v: d.treat },
    { k: "Fight-ready", v: `${fmtDate(inj.until)} (${weeksOf(left)})`, tone: left > 112 ? "bad" : left > 42 ? "warn" : undefined },
    { k: "Training meanwhile", v: `${d.limits} About ${Math.round(d.train * 100)}% of a normal week counts.` },
  ];
}

const AREA_TEXT: Record<string, string> = {
  hand: "the hands: punching power and the boxing",
  knee: "the knee: kicks, footwork and wrestling",
  leg: "the legs: kicks, movement and takedowns",
  shoulder: "the shoulder: wrestling, grappling and the jab",
  arm: "the arm: grappling and clinch work",
  body: "the body: cardio, strength and toughness",
  back: "the back: strength, cardio and wrestling",
  head: "the head: the chin and composure",
};

/** A player's fighter is hurt: tell them everything, and ask what needs asking. */
export function playerInjured(w: World, rng: Rng, f: Fighter, def: InjuryDef, from: Injury["from"], where = "in training"): Injury {
  const inj = makeInjury(rng, def, w.day, from);
  if (f.injury && f.injury.until > inj.until) {
    // Already out longer with something else: this only adds to it.
    f.injury.until += Math.round((inj.until - w.day) * 0.3);
    notify(w, { kind: "injury", fighter: f.id, from: "Team doctor", subject: `Another setback: ${lc(def.name)}`, body: `${fullName(f)} picked up a ${lc(def.name)} ${where} on top of the ${lc(f.injury.name)}. Fight-ready now ${fmtDate(f.injury.until)}.`, facts: injuryFacts(w, f.injury) });
    return f.injury;
  }
  f.injury = inj;
  const facts = injuryFacts(w, inj);
  const fc = w.career.fc[f.id];
  const b = f.booked ? w.bouts[f.booked] : undefined;
  const bout = b && b.status === "booked" && !b.pending ? b : undefined;
  const longOut = inj.until - w.day >= 110;
  if (bout && inj.until > bout.day - 3) {
    const ev = w.events[bout.ev];
    const days = bout.day - w.day;
    const late = inj.until - bout.day;
    const canFight = def.fightable !== undefined && late <= 21;
    const canPostpone = late <= 84 && !longOut;
    const hurt = hurtOnNight(inj, bout.day);
    if (!canFight && !canPostpone) {
      notify(w, {
        kind: "injury",
        fighter: f.id,
        from: "Team doctor",
        subject: `Out of the fight: ${lc(def.name)}`,
        body: `${fullName(f)} suffered a ${lc(def.name)} ${where}, ${days} days before ${ev?.name}. ${def.treat} There's no fighting on this and no point asking to postpone: the fight is off, and the promotion will find your opponent someone else.`,
        facts: [...facts, { k: "The fight", v: `Off: ${ev?.name}, ${fmtDate(bout.day)}`, tone: "bad" }],
      });
      withdraw(w, rng, bout, f.id, lc(def.name));
      if (fc) fc.camp = null;
    } else {
      const actions = [];
      if (canFight) actions.push({ id: "fight-hurt", label: "Fight through it", primary: true });
      if (canPostpone) actions.push({ id: "postpone", label: "Ask to postpone", primary: !canFight });
      actions.push({ id: "pull-out", label: "Pull out", danger: true });
      const night = late <= 0 ? `healed ${-late} days before fight night, though the camp suffers` : `still ${weeksOf(late)} from fit on fight night`;
      notify(w, {
        kind: "injury",
        fighter: f.id,
        ref: bout.id,
        from: "Team doctor",
        subject: `Hurt in camp: ${lc(def.name)}`,
        body: `${fullName(f)} suffered a ${lc(def.name)} ${where}, ${days} days before ${ev?.name}. ${def.treat} You'd be ${night}. ${canFight ? "You can fight through it, " : ""}${canPostpone ? `${canFight ? "ask" : "Ask"} the promotion to move the fight to a later date, ` : ""}or pull out.`,
        facts: [
          ...facts,
          { k: "Fight night", v: `${ev?.name}, ${fmtDate(bout.day)} (${days} days)` },
          { k: "If you fight", v: canFight ? (hurt > 0 ? `About ${Math.round(hurt * 22)}% down in ${AREA_TEXT[inj.area] ?? "the injured area"}, and it may get worse.` : "Healed by then; only the camp suffers.") : "The doctors won't clear it.", tone: canFight ? (hurt > 0.3 ? "warn" : undefined) : "bad" },
          { k: "If you postpone", v: canPostpone ? "The promotion looks for a later card: it moves most title fights and main events, about half the rest." : "Out too long for a postponement.", tone: canPostpone ? undefined : "bad" },
        ],
        needs: true,
        actions,
      });
    }
  } else if (bout) {
    notify(w, {
      kind: "injury",
      fighter: f.id,
      from: "Team doctor",
      subject: `Injury in camp: ${lc(def.name)}`,
      body: `${fullName(f)} picked up a ${lc(def.name)} ${where}. It will heal ${Math.round((bout.day - inj.until) / 7) || 1} week${Math.round((bout.day - inj.until) / 7) === 1 ? "" : "s"} before the fight; the camp loses some work.`,
      facts,
    });
  } else {
    notify(w, { kind: "injury", fighter: f.id, from: "Team doctor", subject: `Injury: ${lc(def.name)}`, body: `${fullName(f)} picked up a ${lc(def.name)} ${where}. ${def.treat}`, facts });
  }
  if (longOut && isChampion(w, f)) champDecision(w, f, inj);
  return inj;
}

/** A champion out for months: keep the belt, or vacate it. */
function champDecision(w: World, f: Fighter, inj: Injury): void {
  if (!f.promo) return;
  const p = PROMOTIONS[f.promo];
  const months = Math.round((inj.until - w.day) / 30.4);
  notify(w, {
    kind: "injury",
    fighter: f.id,
    ref: `belt:${f.promo}:${f.div}`,
    from: `${p.short} matchmaker`,
    subject: "The belt: keep it, or vacate?",
    body: `${fullName(f)} is out until about ${fmtDate(inj.until)}, ${months} months. ${p.short} needs to know what happens to the ${DIVISIONS[f.div].name.toLowerCase()} title. Keep it, and the promotion makes an interim title fight between the contenders; when you're fit, you face the interim champion to unify the belts. Vacate it, and the belt goes to a fight for the vacant title; you'll be first in line for a title shot when you're back.`,
    facts: [
      { k: "Out", v: `${months} months, to ${fmtDate(inj.until)}`, tone: "bad" },
      { k: "Keep the belt", v: "An interim title is fought meanwhile; your first fight back unifies the belts.", tone: "good" },
      { k: "Vacate", v: "Two contenders fight for the vacant title; you're first in line when you're fit.", tone: "warn" },
      { k: "History", v: "Champions have done both: some held the belt through a year out, others gave it up rather than wait." },
    ],
    needs: true,
    actions: [
      { id: "hold", label: "Keep the belt", primary: true },
      { id: "vacate", label: "Vacate the belt", danger: true },
    ],
  });
}

/** The answers to the injury decisions. */
export function answerInjury(w: World, rng: Rng, f: Fighter, action: string, ref?: string): string {
  const fc = w.career.fc[f.id];
  if (action === "hold" || action === "vacate") {
    const [, promo, div] = (ref ?? "").split(":");
    if (!f.promo || f.promo !== promo || w.promos[f.promo].champs[f.div] !== f.id) return "The belt is no longer yours to keep.";
    const p = PROMOTIONS[f.promo];
    if (action === "hold") {
      if (fc) fc.hold = { promo: f.promo, div: f.div, since: w.day };
      addNews(w, { kind: "title", promo: f.promo, fighters: [f.id], big: p.tier === "major" || p.tier === "league", text: `${fullName(f)} keeps the ${p.short} ${DIVISIONS[f.div].name.toLowerCase()} title while injured; an interim title will be fought.` });
      return "You keep the belt. The promotion will make an interim title fight.";
    }
    vacate(w, f, "injury");
    if (fc) fc.promise = { promo: f.promo, div: f.div, until: w.day + 540 };
    addNews(w, { kind: "title", promo: f.promo, fighters: [f.id], big: p.tier === "major" || p.tier === "league", text: `${fullName(f)} vacates the ${p.short} ${DIVISIONS[f.div].name.toLowerCase()} title through injury.` });
    return `The belt is vacant. You're first in line for a title shot when you're fit${div ? "" : ""}.`;
  }
  const b = ref ? w.bouts[ref] : undefined;
  if (!b || b.status !== "booked") return "That fight is no longer on.";
  if (action === "pull-out") {
    // Hurt is hurt, but a hole in the card still costs the matchmaker a little.
    adjustRapport(w, f, b.promo, -2, `Pulled out of the ${w.fighters[b.a === f.id ? b.b : b.a]?.surname ?? ""} fight hurt`.replace("the  fight", "a fight"));
    withdraw(w, rng, b, f.id, lc(f.injury?.name ?? "injury"));
    if (fc) fc.camp = null;
    return "Pulled out of the fight. The promotion will find your opponent someone else.";
  }
  if (action === "postpone") return postponeBout(w, rng, b, f);
  return "Fighting through it. The doctors will look again in fight week.";
}

/** Ask the promotion to move the fight to a later card. */
export function postponeBout(w: World, rng: Rng, b: Bout, f: Fighter): string {
  const ev = w.events[b.ev];
  const opp = w.fighters[b.a === f.id ? b.b : b.a];
  const heal = f.injury?.until ?? w.day;
  const title = b.kind === "title" || b.kind === "interim" || b.kind === "vacant";
  const main = ev ? ev.bouts.filter((id) => w.bouts[id]?.status === "booked").sort((x, y) => w.bouts[y].order - w.bouts[x].order).slice(0, 2).includes(b.id) : false;
  const chance = title ? 0.9 : main ? 0.75 : b.kind === "eliminator" ? 0.7 : 0.5;
  const target = w.upcoming
    .map((id) => w.events[id])
    .filter((e) => e && e.promo === b.promo && e.status !== "done" && e.id !== b.ev && e.day >= heal + 21 && e.day <= Math.max(heal + 70, (ev?.day ?? w.day) + 120))
    .sort((x, y) => x.day - y.day)[0];
  const fc = w.career.fc[f.id];
  const p = PROMOTIONS[b.promo];
  if (ev && target && !opp.ctrl && rng.chance(chance)) {
    const from = ev.day;
    ev.bouts = ev.bouts.filter((x) => x !== b.id);
    target.bouts.push(b.id);
    b.ev = target.id;
    b.day = target.day;
    setOdds(w, b);
    orderCard(w, ev);
    orderCard(w, target);
    if (p.tier === "major" || p.tier === "league" || title) addNews(w, { kind: "booking", promo: b.promo, ev: target.id, fighters: [f.id, opp.id], text: `${fullName(f)} vs. ${fullName(opp)} moves from ${ev.name} to ${target.name} after ${fullName(f)}'s ${lc(f.injury?.name ?? "injury")}.` });
    notify(w, {
      kind: "camp",
      fighter: f.id,
      ref: b.id,
      from: `${p.short} matchmaker`,
      subject: `Postponed: ${opp.surname} on ${fmtDate(target.day)}`,
      body: `${p.short} has moved the fight. ${fullName(opp)} agreed to wait: it's now at ${target.name} on ${fmtDate(target.day)}. Heal first, then build the camp back up.`,
      facts: [
        { k: "Was", v: `${ev.name}, ${fmtDate(from)}` },
        { k: "Now", v: `${target.name}, ${fmtDate(target.day)}`, tone: "good" },
        { k: "Fit by", v: fmtDate(heal) },
        { k: "Camp after healing", v: `${Math.round((target.day - heal) / 7)} weeks` },
      ],
    });
    return `Postponed to ${target.name}, ${fmtDate(target.day)}.`;
  }
  withdraw(w, rng, b, f.id, lc(f.injury?.name ?? "injury"));
  if (fc) fc.camp = null;
  notify(w, {
    kind: "camp",
    fighter: f.id,
    from: `${p.short} matchmaker`,
    subject: "No postponement: the card goes on",
    body: `${p.short} couldn't move the fight${target ? "" : ": there's no card at the right time"}. ${fullName(opp)} will fight someone else on ${fmtDate(ev?.day ?? w.day)}; the matchmaker will be in touch when you're fit.`,
    facts: [{ k: "Fit by", v: fmtDate(heal) }],
  });
  return "The promotion couldn't move the fight. You're out of it.";
}

/** The day the injury heals: a vacated champion gets the promised title shot. */
export function injuryHealed(w: World, f: Fighter): void {
  const fc = w.career.fc[f.id];
  if (!fc) return;
  if (fc.hold) fc.hold = undefined;
  const pr = fc.promise;
  if (pr && pr.until >= w.day && f.promo === pr.promo && f.div === pr.div) {
    const ps = w.promos[pr.promo];
    if (ps.champs[pr.div] && ps.champs[pr.div] !== f.id) {
      ps.contender[pr.div] = f.id;
      notify(w, { kind: "info", fighter: f.id, from: `${PROMOTIONS[pr.promo].short} matchmaker`, subject: "First in line for the title", body: `${fullName(f)} is fit again. As promised when the belt was vacated, the next title fight is yours: expect the offer when the next card is made.` });
    }
  }
  fc.promise = undefined;
}

export { defOf, hurtOnNight };
