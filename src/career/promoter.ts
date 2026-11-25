// The matchmaker remembers. Each of the player's fighters has a working
// relationship with every promotion (0-100, 50 to start). Taking fights builds it,
// saving a card on short notice most of all, and so do wins, finishes and bonuses;
// turning fights down for weak reasons wears it, as do missed weight and offers
// left unanswered. It moves how soon the next offer comes, how often the phone
// rings on short notice and where a new deal opens.
//
// Turning a fight down comes with a reason, and the matchmaker weighs it against
// what they can see: an injury they know about costs nothing, "no time" is fair
// on two weeks' notice and thin with a full camp, and passing on a better fighter
// because he's "not a big enough name" looks like ducking, and the fans hear about
// it. Whoever was turned down is off the table for a while: the next offer is
// someone else (a step up if you asked for a bigger name, a more even fight if the
// matchup was the problem). A fighter the promotion values can say no to the money
// once and hear back with more.

import type { Rng } from "../core/rng";
import { clamp, money } from "../core/util";
import { fmtDate } from "../core/time";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS, type PromoId } from "../data/promotions";
import type { Fact, FightOffer, Fighter, FighterCareer, World } from "../model/types";
import { addNews, fullName, isChampion, rankOf } from "../world/core";
import { cutCheck } from "./shortnotice";
import { addHeat, addPop } from "./rivals";

export type DeclineReason = "hurt" | "camp" | "weight" | "bigger" | "matchup" | "money" | "rest";

export const RAPPORT_START = 50;

export function rapport(w: World, fighter: string, promo: PromoId | null | undefined): number {
  if (!promo) return RAPPORT_START;
  return w.career.fc[fighter]?.rapport?.[promo] ?? RAPPORT_START;
}

export function rapportLabel(n: number): string {
  return n >= 80 ? "Excellent" : n >= 65 ? "Good" : n >= 45 ? "Fair" : n >= 30 ? "Strained" : "Poor";
}

export function rapportTone(n: number): "good" | "warn" | "bad" | undefined {
  return n >= 65 ? "good" : n < 30 ? "bad" : n < 45 ? "warn" : undefined;
}

/** Amateur circuits have no matchmaker to keep happy. */
function counts(promo: PromoId | null | undefined): promo is PromoId {
  return !!promo && PROMOTIONS[promo].tier !== "amateur";
}

export function adjustRapport(w: World, f: Fighter, promo: PromoId | null | undefined, delta: number, why: string): void {
  if (!counts(promo) || !delta) return;
  const fc = w.career.fc[f.id];
  if (!fc) return;
  const cur = fc.rapport?.[promo] ?? RAPPORT_START;
  const next = Math.round(clamp(cur + delta, 0, 100) * 10) / 10;
  if (next === cur) return;
  fc.rapport = { ...(fc.rapport ?? {}), [promo]: next };
  fc.rapportLog = [{ day: w.day, promo, d: Math.round((next - cur) * 10) / 10, why }, ...(fc.rapportLog ?? [])].slice(0, 12);
}

/** Weekly: memories fade, about a quarter of the way back to neutral in a year. */
export function driftRapport(w: World): void {
  for (const fc of Object.values(w.career.fc)) {
    if (!fc.rapport) continue;
    for (const k of Object.keys(fc.rapport) as PromoId[]) {
      const v = fc.rapport[k]!;
      fc.rapport[k] = Math.round((v + (RAPPORT_START - v) * 0.006) * 100) / 100;
    }
  }
}

/** The wait for the next offer after a no: shorter on good terms, longer on poor ones. */
export function waitFactor(r: number): number {
  return r >= 65 ? 0.7 : r < 30 ? 1.5 : r < 45 ? 1.2 : 1;
}

/** Short-notice calls go to the fighters the matchmaker trusts first. */
export function callFactor(r: number): number {
  return clamp(0.6 + r / 125, 0.6, 1.4);
}

/** Where a new deal opens: up to 6% better on excellent terms, up to 8% worse on poor ones. */
export function dealFactor(r: number): number {
  return 1 + clamp((r - RAPPORT_START) / 500, -0.08, 0.06);
}

/** On poor terms the matchmaker leaves you off some cards. */
export function snubbed(w: World, rng: Rng, f: Fighter, promo: PromoId): boolean {
  const r = rapport(w, f.id, promo);
  return r < 35 && rng.chance((35 - r) / 50);
}

/** The matchmaker moves on from an opponent the fighter said no to, for about four months. */
export function passOn(w: World, f: Fighter, opp: Fighter, promo: PromoId): void {
  const fc = w.career.fc[f.id];
  if (!fc) return;
  fc.passed = [...(fc.passed ?? []).filter((q) => q.until > w.day && q.opp !== opp.id), { opp: opp.id, promo, until: w.day + 120 }];
}

/** The relationship as message facts: where it stands and what moved it last. */
export function rapportFacts(w: World, f: Fighter, promo: PromoId): Fact[] {
  const r = rapport(w, f.id, promo);
  const last = (w.career.fc[f.id]?.rapportLog ?? []).find((e) => e.promo === promo);
  const facts: Fact[] = [{ k: `${PROMOTIONS[promo].short} matchmaker`, v: `${rapportLabel(r)} terms (${Math.round(r)})`, tone: rapportTone(r) }];
  if (last && last.day === w.day) facts.push({ k: "This time", v: `${last.d > 0 ? "+" : ""}${Math.round(last.d)}`, tone: last.d < 0 ? "bad" : "good" });
  return facts;
}

/** Opponents turned down recently: the matchmaker has moved on from them. */
export function passedOn(w: World, f: Fighter, promo: PromoId): Set<string> {
  const fc = w.career.fc[f.id];
  return new Set((fc?.passed ?? []).filter((p) => p.promo === promo && p.until > w.day).map((p) => p.opp));
}

/** What the next offer should look like after a no: a step up, a more even fight, or no preference. */
export function nextWant(w: World, f: Fighter, promo: PromoId): "up" | "even" | null {
  const want = w.career.fc[f.id]?.want;
  return want && want.promo === promo && want.until > w.day ? want.kind : null;
}

export function clearWant(w: World, f: Fighter): void {
  const fc = w.career.fc[f.id];
  if (fc) fc.want = undefined;
}

// ---------- the reasons ----------

export interface DeclineChoice {
  id: DeclineReason;
  /** What the fighter tells the matchmaker. */
  label: string;
  /** How the matchmaker will take it, as things stand. */
  take: string;
  tone: "good" | "warn" | "bad";
  /** Relationship points it costs. */
  cost: number;
  /** The fans and the opponent will hear about it. */
  ducking?: boolean;
  /** A valuable fighter's "not for this money": the matchmaker comes back with more. */
  raise?: boolean;
  /** The cheapest reason that's true. */
  best?: boolean;
}

interface Read {
  f: Fighter;
  opp: Fighter;
  fc: FighterCareer | undefined;
  days: number;
  hurt: boolean;
  short: boolean;
  weight: boolean;
  oppBetter: boolean;
  stepUp: boolean;
  outmatched: boolean;
  notable: boolean;
  valuable: boolean;
  title: boolean;
  r: number;
}

function readOffer(w: World, o: FightOffer): Read {
  const f = w.fighters[o.fighter];
  const opp = w.fighters[o.opp];
  const fc = w.career.fc[f.id];
  const days = Math.max(0, o.day - w.day);
  const hurt = (!!f.injury && f.injury.until > w.day) || !!fc?.week?.injury;
  const limit = o.limit ?? DIVISIONS[o.div].limit;
  const cut = cutCheck(f, limit, Math.max(1, days));
  const weight = cut.risk === "hard" || cut.risk === "too much" || o.div !== f.div || !!o.limit;
  const gap = opp.elo - f.elo;
  const rf = rankOf(w, f);
  const ro = rankOf(w, opp);
  const oppBetter = gap > 40 || (ro !== null && (rf === null || ro < rf));
  const stepUp = !oppBetter && (f.streak >= 3 || (rf !== null && (ro === null || ro > rf + 3)));
  const outmatched = gap > 60 || (ro !== null && ro <= 5 && (rf === null || rf > ro + 5));
  const notable = ro !== null || opp.pop >= 35;
  const valuable = (rf !== null && rf <= 10) || isChampion(w, f) || f.pop >= 45 || (f.streak >= 3 && rf !== null);
  const title = o.kind === "title" || o.kind === "interim" || o.kind === "vacant";
  return { f, opp, fc, days, hurt, short: o.shortNotice || days < 35, weight, oppBetter, stepUp, outmatched, notable, valuable, title, r: rapport(w, f.id, o.promo) };
}

export function declineChoices(w: World, o: FightOffer): DeclineChoice[] {
  const x = readOffer(w, o);
  const s = x.opp.surname;
  const raise = x.valuable && !o.raised && x.r >= 40 && !o.stay;
  const list: DeclineChoice[] = [
    x.hurt
      ? { id: "hurt", label: "I'm carrying an injury", take: "They know: get healthy and they'll come back to you.", tone: "good", cost: 0 }
      : { id: "hurt", label: "I'm carrying an injury", take: "They aren't convinced: you've been training at full tilt.", tone: "bad", cost: 6 },
    x.short
      ? { id: "camp", label: "Not enough time to get ready", take: `Fair on ${x.days} days' notice; it happens.`, tone: "good", cost: x.days <= 14 ? 0 : 1 }
      : { id: "camp", label: "Not enough time to get ready", take: `${Math.round(x.days / 7)} weeks is a full camp. What's the real reason?`, tone: "bad", cost: 5 },
    x.weight
      ? { id: "weight", label: "I can't make that weight safely", take: "Understood: they'd rather you make weight.", tone: "good", cost: 1 }
      : { id: "weight", label: "I can't make that weight safely", take: "You make that weight every time.", tone: "bad", cost: 5 },
    x.stepUp
      ? { id: "bigger", label: `I want a bigger name than ${s}`, take: "Fair: you've earned a step up, and the next offer will be one.", tone: "warn", cost: 2 }
      : { id: "bigger", label: `I want a bigger name than ${s}`, take: `${s} is the step up. It looks like ducking, and the fans will hear about it.`, tone: "bad", cost: 9, ducking: x.notable },
    x.outmatched
      ? { id: "matchup", label: "The styles are wrong for us", take: `Understandable against ${s}: they'll find a more even fight.`, tone: "warn", cost: 3 }
      : { id: "matchup", label: "The styles are wrong for us", take: `Against ${s}? It looks like ducking${x.notable ? ", and the fans will hear about it" : ""}.`, tone: "bad", cost: 8, ducking: x.notable },
    raise
      ? { id: "money", label: "Not for this money", take: "You're worth it to them: expect a better number for the same fight.", tone: "warn", cost: 1, raise: true }
      : { id: "money", label: "Not for this money", take: o.raised ? "That was their best number: they'll move on." : "That's the number: they'll find someone who wants it.", tone: "bad", cost: 4 },
    { id: "rest", label: "I need some time off", take: "Fine: no offers for about two months, unless you ask for a fight.", tone: "warn", cost: 2 },
  ];
  // A title fight turned down costs twice as much, unless the fighter is hurt.
  if (x.title) for (const c of list) if (c.cost && !(c.id === "hurt" && x.hurt)) c.cost *= 2;
  const honest = list.filter((c) => c.tone !== "bad");
  const pool = honest.length ? honest : list;
  const best = pool.reduce((a, c) => (c.cost < a.cost ? c : a), pool[0]);
  best.best = true;
  return list;
}

export interface DeclineOutcome {
  /** The matchmaker's answer. */
  reply: string;
  /** The offer stands with a better purse (the money reason, for a fighter worth it). */
  raised?: boolean;
  cost: number;
}

/** The consequences of saying no, for the reason given. The caller cancels the bout unless the offer was raised. */
export function applyDecline(w: World, rng: Rng, o: FightOffer, reason: DeclineReason): DeclineOutcome {
  const choice = declineChoices(w, o).find((c) => c.id === reason)!;
  const x = readOffer(w, o);
  const { f, opp, fc } = x;
  const p = PROMOTIONS[o.promo];
  const before = rapport(w, f.id, o.promo);
  adjustRapport(w, f, o.promo, -choice.cost, `Turned down ${opp.surname}: ${choice.label.charAt(0).toLowerCase()}${choice.label.slice(1)}`);
  if (choice.raise) {
    // The same fight, a better number, a few days to answer.
    const k = 1.15 + rng.next() * 0.1;
    o.show = Math.round((o.show * k) / 100) * 100;
    o.win = Math.round((o.win * k) / 100) * 100;
    o.raised = true;
    o.expires = Math.max(w.day, Math.min(o.day - 7, w.day + 3));
    return { reply: `${p.short} comes back with ${money(o.show)} to show${o.win ? ` and ${money(o.win)} to win` : ""} for the same fight. Answer by ${fmtDate(o.expires)}.`, raised: true, cost: choice.cost };
  }
  if (fc) {
    // The matchmaker moves on from this opponent for a while.
    passOn(w, f, opp, o.promo);
    if (reason === "bigger" && choice.cost <= 4) fc.want = { promo: o.promo, kind: "up", until: w.day + 180 };
    else if (reason === "matchup" && choice.cost <= 6) fc.want = { promo: o.promo, kind: "even", until: w.day + 180 };
    const base = reason === "rest" ? 60 : reason === "hurt" ? 21 : reason === "camp" ? 10 : reason === "bigger" || reason === "matchup" ? 21 : 14;
    const wait = Math.round(base * waitFactor(rapport(w, f.id, o.promo)));
    if (reason === "rest" || !o.shortNotice) fc.lastAsk = w.day + (reason === "hurt" && f.injury ? Math.max(wait, f.injury.until - 21 - w.day) : wait);
    if (reason === "rest") fc.asked = false;
  }
  if (choice.ducking) {
    // Turning down a name gets out, and the other side makes the most of it.
    addPop(f, -1.5);
    addHeat(w, f, opp, 8, `${f.surname} turned down the fight`);
    if (p.tier !== "amateur") addNews(w, { kind: "booking", promo: o.promo, fighters: [f.id, opp.id], text: `${fullName(f)} has turned down a fight with ${fullName(opp)}, and ${opp.surname}'s team says so.` });
  }
  const after = rapport(w, f.id, o.promo);
  const terms = before === after ? "" : ` Relations with ${p.short}: ${rapportLabel(after).toLowerCase()} (${after < before ? "" : "+"}${Math.round(after - before)}).`;
  const next = fc?.lastAsk && fc.lastAsk > w.day ? ` No new offer before ${fmtDate(fc.lastAsk)}, and it won't be ${opp.surname}.` : ` The next offer won't be ${opp.surname}.`;
  return { reply: `${choice.take}${terms}${next}`, cost: choice.cost };
}
