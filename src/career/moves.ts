// Moving camps and moving weight. Elite rooms pick who they take, moving
// costs money and a few weeks of settling in; a new weight class changes the
// cut, the strength of the opposition and the rankings.

import { clamp, money } from "../core/util";
import { ageAt } from "../core/time";
import { countryOf } from "../data/countries";
import { DIVISIONS, ladderOf, type DivisionId } from "../data/divisions";
import { PROMOTIONS, TIER_RANK } from "../data/promotions";
import { ovrOf } from "../model/attributes";
import type { Fighter, Gym, World } from "../model/types";
import { addNews, fullName, gymMembers, isChampion, rankOf, touch, withRng, touchRoster } from "../world/core";
import { vacate } from "../world/titles";
import { activityScore, updateRankings } from "../world/rankings";
import { notify } from "./inbox";
import { ledger } from "./money";
import { declineFight } from "./offers";

export function gymQuality(g: Gym): number {
  const c = g.coaches;
  return Math.round((c.head * 1.3 + c.striking + c.grappling + c.wrestling + c.sc * 0.8 + g.facilities * 0.9) / 6);
}

export function gymFee(g: Gym): number {
  if (g.owner) return 0;
  return g.rep >= 80 ? 15 : g.rep >= 70 ? 12 : 10;
}

export interface GymOption {
  g: Gym;
  quality: number;
  members: number;
  best: Fighter | null;
  /** Belt holders training there, and fighters ranked in the UFC or the PFL. */
  champs: number;
  ranked: number;
  /** What the coaching is best at, and how good. */
  known: { what: string; v: number };
  chance: number;
  cost: number;
  why: string;
}

/** The gym's best coaching, for picking a room: "Striking 83". */
export function gymStrength(g: Gym): { what: string; v: number } {
  const c = g.coaches;
  const list: [string, number][] = [["Striking", c.striking], ["Wrestling", c.wrestling], ["Grappling", c.grappling], ["Strength", c.sc]];
  const [what, v] = list.sort((a, b) => b[1] - a[1])[0];
  return { what, v };
}

/** Who a fighter trains with: the best of the room, the belt holders and the ranked first. */
export function trainingPartners(w: World, f: Fighter, n = 5): Fighter[] {
  return gymMembers(w, f.gym)
    .filter((x) => x.id !== f.id && x.status === "active")
    .sort((a, b) => Number(isChampion(w, b)) - Number(isChampion(w, a)) || ovrOf(b.attrs) - ovrOf(a.attrs))
    .slice(0, n);
}

export function moveCost(f: Fighter, g: Gym): number {
  const home = countryOf(f.country);
  if (g.country === f.country) return 1500;
  if (countryOf(g.country).region === home.region) return 4000;
  return 9000;
}

/** The career's own gym, for this fighter: the fighter's own, or the agency's for a client. */
function ownFor(w: World, f: Fighter, g: Gym): boolean {
  return g.owner === f.id || (g.owner === "agency" && w.career.mode === "manager" && w.career.fighters.includes(f.id));
}

export function gymOptions(w: World, f: Fighter): GymOption[] {
  const o = ovrOf(f.attrs);
  const tier = f.promo ? TIER_RANK[PROMOTIONS[f.promo].tier] : 1;
  return Object.values(w.gyms)
    .filter((g) => g.id !== f.gym && (!g.owner || ownFor(w, f, g)))
    .map((g) => {
      const own = ownFor(w, f, g);
      const members = gymMembers(w, g.id).filter((x) => x.status === "active");
      const best = members.slice().sort((a, b) => ovrOf(b.attrs) - ovrOf(a.attrs))[0] ?? null;
      const champs = members.filter((x) => isChampion(w, x)).length;
      const ranked = members.filter((x) => (x.promo === "ufc" || x.promo === "pfl") && (rankOf(w, x) ?? 0) > 0).length;
      // Elite rooms are choosy; everyone else takes paying members.
      const bar = (g.rep - 55) * 0.9;
      const pull = (o - 50) + tier * 4 + f.pop * 0.3;
      const chance = own ? 1 : g.rep < 60 ? 0.97 : clamp(0.5 + (pull - bar) / 25, 0.03, 0.97);
      const why = own ? (g.owner === "agency" ? "Your agency's gym" : "Your own gym") : g.rep >= 75 ? (chance > 0.6 ? "Interested: your level fits the room" : "An elite room: they want proven fighters") : "Open to new members";
      return { g, quality: gymQuality(g), members: members.length, best, champs, ranked, known: gymStrength(g), chance, cost: moveCost(f, g), why };
    })
    .sort((a, b) => b.quality - a.quality);
}

export function joinGym(w: World, f: Fighter, gymId: string): string {
  const g = w.gyms[gymId];
  const fc = w.career.fc[f.id];
  if (!g || !fc) return "";
  const b = f.booked ? w.bouts[f.booked] : null;
  if (b && b.status === "booked" && !b.pending && b.day - w.day < 28) return "Not in the middle of a camp: wait until after the fight.";
  const opt = gymOptions(w, f).find((x) => x.g.id === gymId);
  if (!opt) return "";
  const ok = withRng(w, (rng) => rng.chance(opt.chance));
  if (!ok) return `${g.name} passed for now. Win a couple more and ask again.`;
  const old = w.gyms[f.gym];
  f.gym = g.id;
  touchRoster(w, f);
  g.fee = gymFee(g);
  fc.adapt = 4;
  if (w.career.mode === "fighter") ledger(w, { amount: -opt.cost, what: `Moving to ${g.name}`, cat: "travel", fighter: f.id });
  else ledger(w, { amount: -Math.round(opt.cost * 0.3), what: `Share of ${fullName(f)}'s move to ${g.name}`, cat: "travel", fighter: f.id });
  notify(w, { kind: "training", fighter: f.id, from: g.headCoach, subject: `Welcome to ${g.name}`, body: `${fullName(f)} joins ${g.name} in ${g.city}${old ? `, leaving ${old.name}` : ""}. Expect a few weeks of settling in before training runs at full speed. The gym takes ${g.fee}% of purses.` });
  if (f.pop > 30) addNews(w, { kind: "signing", fighters: [f.id], text: `${fullName(f)} moves camps to ${g.name}.` });
  touch(w);
  return `Joined ${g.name}.`;
}

// ---------- weight classes ----------

export interface MoveCheck {
  ok: boolean;
  why: string;
  vacates?: boolean;
}

export function canMove(w: World, f: Fighter, to: DivisionId): MoveCheck {
  if (to === f.div) return { ok: false, why: "That is the current division." };
  const ladder = ladderOf(f.div);
  const i = ladder.indexOf(f.div);
  const j = ladder.indexOf(to);
  if (j < 0) return { ok: false, why: "Not a division for this fighter." };
  if (Math.abs(i - j) !== 1) return { ok: false, why: "One division at a time." };
  if (f.booked && w.bouts[f.booked]?.status === "booked") return { ok: false, why: "Finish the booked fight first." };
  if (f.promo && !PROMOTIONS[f.promo].divisions.includes(to)) return { ok: false, why: `${PROMOTIONS[f.promo].short} doesn't run that division.` };
  const limit = DIVISIONS[to].limit;
  if (j < i && f.walk > limit * 1.16) return { ok: false, why: `Too heavy: walking at ${f.walk} lb, the cut to ${limit} would be dangerous. Get under ${Math.floor(limit * 1.16)} lb first.` };
  return { ok: true, why: j > i ? "Bigger opponents, an easier cut." : "Smaller opponents, a harder cut.", vacates: isChampion(w, f) };
}

export function moveDivision(w: World, f: Fighter, to: DivisionId): string {
  const chk = canMove(w, f, to);
  if (!chk.ok) return chk.why;
  const from = f.div;
  const up = DIVISIONS[to].order > DIVISIONS[from].order;
  if (chk.vacates) vacate(w, f, "moved");
  for (const o of w.career.fightOffers) if (o.fighter === f.id && o.status === "open") declineFight(w, o.id, true, "moved");
  f.div = to;
  touchRoster(w, f);
  // Results at the new weight were kept as a second place there; now it is the fighter's own,
  // and the place earned there is kept.
  const earned = f.xw?.find((x) => x.promo === f.promo && x.div === to && x.score !== undefined && x.beat.length > x.lost);
  if (f.xw) f.xw = f.xw.filter((x) => x.div !== to);
  const a = f.attrs;
  if (up) {
    a.strength = clamp(a.strength - 0.9, 1, 20);
    a.power = clamp(a.power - 0.4, 1, 20);
    a.speed = clamp(a.speed + 0.3, 1, 20);
    a.cardio = clamp(a.cardio + 0.3, 1, 20);
  } else {
    a.strength = clamp(a.strength + 0.7, 1, 20);
    a.power = clamp(a.power + 0.3, 1, 20);
    a.speed = clamp(a.speed - 0.2, 1, 20);
    a.cardio = clamp(a.cardio - 0.5, 1, 20);
    a.chin = clamp(a.chin - 0.2, 1, 20);
  }
  f.elo = Math.round(f.elo - 30);
  if (earned?.score !== undefined) f.elo = Math.max(f.elo, Math.round(earned.score - activityScore(w, f)));
  touch(w);
  if (f.promo && PROMOTIONS[f.promo].rankSize) updateRankings(w, f.promo, [from, to]);
  const r = rankOf(w, f);
  notify(w, { kind: "info", fighter: f.id, from: "Head coach", subject: `${up ? "Up" : "Down"} to ${DIVISIONS[to].name.toLowerCase()}`, body: `${fullName(f)} now fights at ${DIVISIONS[to].name.toLowerCase()} (${DIVISIONS[to].limit} lb).${chk.vacates ? " The belt at the old weight is vacated." : ""} ${r ? `The win here already counts: #${r} in the rankings.` : "The rankings start again: win here to climb."}` });
  if (f.pop > 25 || chk.vacates) addNews(w, { kind: "other", promo: f.promo ?? undefined, fighters: [f.id], text: `${fullName(f)} moves ${up ? "up" : "down"} to ${DIVISIONS[to].name.toLowerCase()}.` });
  return `Moved to ${DIVISIONS[to].name}.`;
}

/** The walking weight drifts toward the target: about 1.5 lb a month up, 2.5 down. */
export function walkMonthly(w: World): void {
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    const fc = w.career.fc[id];
    if (!f || !fc?.walkTarget) continue;
    const d = fc.walkTarget - f.walk;
    if (Math.abs(d) < 0.5) continue;
    const age = ageAt(f.birth, w.day);
    const step = d > 0 ? (age > 33 ? 1 : 1.5) : 2.5;
    f.walk = Math.round((f.walk + clamp(d, -step, step)) * 10) / 10;
    // Bulking adds a little strength; slimming down costs a little.
    f.attrs.strength = clamp(f.attrs.strength + (d > 0 ? 0.05 : -0.04), 1, 20);
  }
}

export function walkRange(div: DivisionId): [number, number] {
  const limit = DIVISIONS[div].limit;
  return [Math.round(limit * 1.02), Math.round(limit * (div === "HW" ? 1.05 : 1.2))];
}

export { money };
