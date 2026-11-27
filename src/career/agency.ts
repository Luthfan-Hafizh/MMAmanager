// Manager mode: the agency. Sign fighters as clients, take a cut of their
// purses (10-20% is the norm in MMA) and 20% of their sponsorship, and build a
// reputation that lands better deals and better clients.

import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { ageAt } from "../core/time";
import { PROMOTIONS, TIER_RANK } from "../data/promotions";
import { ovrOf } from "../model/attributes";
import type { Fighter, World } from "../model/types";
import { addControlled } from "../world/create";
import { fullName, isChampion, rankOf, touch } from "../world/core";
import { notify } from "./inbox";

export const MAX_CLIENTS_BASE = 4;

export function clientCapacity(w: World): number {
  const a = w.career.agency;
  if (!a) return 1;
  return MAX_CLIENTS_BASE + a.staff * 2 + Math.floor(a.rep / 25);
}

/** How likely a fighter is to sign with the agency, 0-1, with the reasons for and against. */
export function pitchChance(w: World, f: Fighter, cut: number): { p: number; why: string[]; tones: ("good" | "bad")[] } {
  const a = w.career.agency!;
  const why: string[] = [];
  const tones: ("good" | "bad")[] = [];
  const add = (text: string, tone: "good" | "bad") => {
    why.push(text);
    tones.push(tone);
  };
  const tier = f.promo ? TIER_RANK[PROMOTIONS[f.promo].tier] : 1;
  const star = clamp((ovrOf(f.attrs) - 55) / 30 + tier * 0.08 + f.pop / 150, 0, 1.4);
  let p = 0.55 + (a.rep - 30) / 100 - star * 0.45 - (cut - 15) * 0.035;
  if (a.rep >= 50) add("The agency's name opens doors", "good");
  else add("A young agency without much of a name", "bad");
  if (star > 0.8) add("A big name expects a big agency", "bad");
  if (cut < 15) add(`A low cut (${cut}%) is attractive`, "good");
  if (cut > 18) add(`${cut}% is a lot`, "bad");
  const clients = w.career.fighters.map((id) => w.fighters[id]).filter(Boolean);
  const champs = clients.filter((c) => isChampion(w, c)).length;
  if (champs) {
    p += 0.08 * champs;
    add(`${champs} champion${champs > 1 ? "s" : ""} in the stable`, "good");
  }
  const sameDiv = clients.filter((c) => c.div === f.div && c.promo === f.promo).length;
  if (sameDiv) {
    p -= 0.1 * sameDiv;
    add("You already manage someone in the same division", "bad");
  }
  if (f.pers.loyalty > 14) {
    p -= 0.1;
    add("Loyal to the current team", "bad");
  }
  if (f.pers.greed > 14 && cut > 12) {
    p -= 0.08;
    add(`Wants more of the purse than a ${cut}% cut leaves`, "bad");
  }
  return { p: clamp(p, 0.02, 0.95), why, tones };
}

export function pitch(w: World, rng: Rng, f: Fighter, cut: number): string {
  const c = w.career;
  if (c.fighters.length >= clientCapacity(w)) return "The agency is full. Hire staff to take on more clients.";
  if (c.pitches.some((x) => x.fighter === f.id && w.day - x.day < 60)) return `${fullName(f)} said no recently. Try again later.`;
  const { p } = pitchChance(w, f, cut);
  const ok = rng.chance(p);
  c.pitches.push({ fighter: f.id, day: w.day, ok });
  if (c.pitches.length > 200) c.pitches.shift();
  if (!ok) return `${fullName(f)} has decided to stay with the current team.`;
  addControlled(w, f);
  notify(w, { kind: "client", fighter: f.id, from: fullName(f), subject: `${fullName(f)} signs with the agency`, body: `${fullName(f)} joins ${c.agency?.name} at ${cut}% of purses.` });
  touch(w);
  return `${fullName(f)} signs with the agency.`;
}

export function dropClient(w: World, f: Fighter): void {
  const c = w.career;
  c.fighters = c.fighters.filter((id) => id !== f.id);
  delete c.fc[f.id];
  f.ctrl = false;
  c.fightOffers.filter((o) => o.fighter === f.id && o.status === "open").forEach((o) => (o.status = "withdrawn"));
  c.contractOffers.filter((o) => o.fighter === f.id && o.status === "open").forEach((o) => (o.status = "withdrawn"));
  if (c.agency) c.agency.rep = clamp(c.agency.rep - 1, 0, 100);
  touch(w);
}

export function hireStaff(w: World): string {
  const a = w.career.agency;
  if (!a) return "";
  if (a.staff >= 6) return "The office is full.";
  a.staff++;
  return `Hired a new agent. Staff: ${a.staff}. Each costs $3,200 a month.`;
}

/** Monthly: reputation follows the stable's results; unhappy clients leave. */
export function monthlyAgency(w: World, rng: Rng): void {
  const a = w.career.agency;
  if (!a) return;
  let score = 0;
  for (const id of [...w.career.fighters]) {
    const f = w.fighters[id];
    if (!f) continue;
    if (f.status !== "active") {
      w.career.fighters = w.career.fighters.filter((x) => x !== id);
      continue;
    }
    const tier = f.promo ? TIER_RANK[PROMOTIONS[f.promo].tier] : 0;
    score += tier * 4 + (rankOf(w, f) !== null ? 6 : 0) + (isChampion(w, f) ? 12 : 0) + Math.max(-2, Math.min(4, f.streak));
    const fc = w.career.fc[id];
    const unhappy = (fc?.morale ?? 60) < 25 || (f.streak <= -3 && rng.chance(0.3));
    if (unhappy && rng.chance(0.25) && ageAt(f.birth, w.day) < 38) {
      dropClient(w, f);
      notify(w, { kind: "client", fighter: f.id, from: fullName(f), subject: `${fullName(f)} leaves the agency`, body: `${fullName(f)} wants a fresh start with new management.` });
    }
  }
  const target = clamp(15 + score * 1.2, 0, 100);
  a.rep = clamp(a.rep + (target - a.rep) * 0.08, 0, 100);
}
