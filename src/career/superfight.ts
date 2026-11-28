// Champion against champion: a champion calls for the belt a weight up (or down),
// the promotion makes it when the names are big enough, and a double champion
// keeps one belt and gives the other up, as the UFC's have (Conor McGregor was
// stripped at featherweight; Henry Cejudo, Daniel Cormier and Amanda Nunes held
// two for a while). Only the player's champions make these calls: the world's
// champions defend at home, which keeps the belts moving.

import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { DIVISIONS, neighbourDivisions, type DivisionId } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import type { Bout, Fighter, Message, MMAEvent, World } from "../model/types";
import { addNews, fullName, touch } from "../world/core";
import { currentReign } from "../world/belts";
import { readyFor } from "../world/matchmaking";
import { vacateOne } from "../world/titles";
import { notify } from "./inbox";
import { shiftWeight } from "./moves";
import { addHeat, addMoment } from "./rivals";

/** The champion one weight up (else down) that a champion could fight for a second belt. */
export function superfightTarget(w: World, f: Fighter): { t: Fighter; div: DivisionId } | null {
  if (!f.promo || f.status !== "active") return null;
  const p = PROMOTIONS[f.promo];
  const ps = w.promos[f.promo];
  if (!p.rankSize || p.tier === "amateur" || ps.champs[f.div] !== f.id) return null;
  const n = neighbourDivisions(f.div);
  for (const d of [n.up, n.down]) {
    if (!d || !p.divisions.includes(d)) continue;
    const id = ps.champs[d];
    const t = id ? w.fighters[id] : null;
    if (!t || t.id === f.id || t.status !== "active" || t.ctrl || t.gym === f.gym) continue;
    // Down a weight only when the cut can be made.
    if (d === n.down && f.walk > DIVISIONS[d].limit * 1.16) continue;
    return { t, div: d };
  }
  return null;
}

/** A champion with a name can make the call: a defence behind them, or a star already. */
export function canCallSuperfight(w: World, f: Fighter): boolean {
  if (!f.promo || !superfightTarget(w, f)) return false;
  const r = currentReign(w, f.promo, f.div, f.id);
  return (r?.defenses ?? 0) >= 1 || f.pop >= 55;
}

/** How keen the promotion is: stars sell it, so do defences; a waiting division doesn't. */
export function superfightOdds(w: World, f: Fighter, t: Fighter): number {
  const r = f.promo ? currentReign(w, f.promo, f.div, f.id) : undefined;
  const defs = Math.min(3, r?.defenses ?? 0);
  return clamp(0.3 + (f.pop >= 65 ? 0.25 : f.pop >= 50 ? 0.12 : 0) + (t.pop >= 60 ? 0.12 : 0) + defs * 0.08, 0.2, 0.85);
}

/** The call, from the cage or the press conference. */
export function callSuperfight(w: World, f: Fighter): string {
  const sf = superfightTarget(w, f);
  const fc = w.career.fc[f.id];
  if (!sf || !fc || !f.promo) return "";
  const { t, div } = sf;
  const dn = DIVISIONS[div].name.toLowerCase();
  fc.superfight = { target: t.id, div, until: w.day + 240 };
  f.pop = clamp(f.pop + 1.2, 0, 100);
  addHeat(w, f, t, 10, "Called for the champion-versus-champion fight");
  addMoment(w, f, "callout", `"${t.surname}, champion against champion, at ${dn}. Let's make history."`, t.id);
  addNews(w, { kind: "booking", promo: f.promo, fighters: [f.id, t.id], big: PROMOTIONS[f.promo].tier !== "local", text: `${fullName(f)} calls for a champion-versus-champion fight with ${fullName(t)}, the ${PROMOTIONS[f.promo].short} ${dn} champion.` });
  const odds = superfightOdds(w, f, t);
  const mood = odds >= 0.6 ? "The promotion loves the idea" : odds >= 0.4 ? "The promotion will think about it" : "The promotion is lukewarm: another defence or two would help";
  return `${f.surname} calls out ${fullName(t)}, the ${dn} champion. ${mood}; when the next fight is due, it could be for the ${dn} belt.`;
}

/**
 * When the champion's next fight is due: the champion-versus-champion fight, if it was
 * called, both are free, and the promotion says yes. Used by the matchmaker.
 */
export function superfightOpp(w: World, rng: Rng, f: Fighter, ev: MMAEvent): { t: Fighter; div: DivisionId } | null {
  const fc = w.career.fc[f.id];
  const c = fc?.superfight;
  if (!c) return null;
  const sf = superfightTarget(w, f);
  if (c.until < w.day || !sf || sf.t.id !== c.target || sf.div !== c.div) {
    // The call went stale, or the other belt changed hands.
    fc.superfight = undefined;
    return null;
  }
  if (!readyFor(w, sf.t, ev) || !rng.chance(superfightOdds(w, f, sf.t))) return null;
  fc.superfight = undefined;
  return sf;
}

/** The belts a fighter holds in a promotion, outright. */
function beltsHeld(w: World, f: Fighter): DivisionId[] {
  if (!f.promo) return [];
  const ps = w.promos[f.promo];
  return (Object.keys(ps.champs) as DivisionId[]).filter((d) => ps.champs[d] === f.id);
}

/** After a second belt is won: keep one, give the other up. */
export function offerTwoBelts(w: World, f: Fighter, b: Bout): void {
  const held = beltsHeld(w, f);
  if (held.length < 2 || !f.promo) return;
  if (w.inbox.some((m) => m.fighter === f.id && m.data?.kind === "twobelts" && m.needs && !m.done)) return;
  const home = f.div;
  const other = held.find((d) => d !== home)!;
  const p = PROMOTIONS[f.promo];
  const up = DIVISIONS[other].order > DIVISIONS[home].order;
  const name = (d: DivisionId) => DIVISIONS[d].name.toLowerCase();
  notify(w, {
    kind: "title",
    fighter: f.id,
    ref: b.id,
    from: `${p.short} matchmaker`,
    subject: "Two belts: which one do you keep?",
    body: `${fullName(f)} holds the ${p.short} ${name(home)} and ${name(other)} titles. Two divisions can't wait on one champion, so the promotion wants a decision. Keep the ${name(other)} belt and ${f.surname} fights at ${name(other)} (${DIVISIONS[other].limit} lb) from now on, with the ${name(home)} title vacated; keep the ${name(home)} belt and the ${name(other)} title is vacant again.`,
    needs: true,
    actions: [
      { id: `belts:keep:${other}`, label: `Keep the ${name(other)} belt`, primary: up },
      { id: `belts:keep:${home}`, label: `Keep the ${name(home)} belt`, primary: !up },
    ],
    facts: [
      { k: "Holds", v: `${p.short} ${DIVISIONS[home].name} and ${DIVISIONS[other].name}`, tone: "good" },
      { k: `Keep ${DIVISIONS[other].name}`, v: `Move to ${DIVISIONS[other].limit} lb; ${name(home)} vacated` },
      { k: `Keep ${DIVISIONS[home].name}`, v: `Stay at ${DIVISIONS[home].limit} lb; ${name(other)} vacated` },
    ],
    data: { kind: "twobelts" },
  });
}

/** "belts:keep:<division>": the other belt is given up, and the fighter fights where the kept one is. */
export function answerTwoBelts(w: World, m: Message, action: string): string {
  const f = m.fighter ? w.fighters[m.fighter] : undefined;
  const keep = action.split(":")[2] as DivisionId;
  if (!f || !f.promo || !DIVISIONS[keep]) return "";
  const promo = f.promo;
  const held = beltsHeld(w, f);
  if (!held.includes(keep)) return "";
  const gone = held.filter((d) => d !== keep);
  for (const d of gone) vacateOne(w, f, promo, d, "vacated");
  if (keep !== f.div) shiftWeight(w, f, keep);
  const name = (d: DivisionId) => DIVISIONS[d].name.toLowerCase();
  for (const d of gone) addNews(w, { kind: "title", promo, fighters: [f.id], big: true, text: `${fullName(f)} gives up the ${PROMOTIONS[promo].short} ${name(d)} title to stay the ${name(keep)} champion.` });
  touch(w);
  return `${f.surname} keeps the ${name(keep)} belt; the ${gone.map(name).join(" and ")} title is vacant. ${f.surname} fights at ${name(keep)} (${DIVISIONS[keep].limit} lb).`;
}
