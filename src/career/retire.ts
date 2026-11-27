// Retirement on the fighter's own terms, and what comes after: the team raises
// it when the years or the knockouts say so; nobody forces it. A retired
// fighter can open a management company in the same world.

import type { Rng } from "../core/rng";
import { ageAt, fmtDate } from "../core/time";
import { clamp, money } from "../core/util";
import { PROMOTIONS } from "../data/promotions";
import type { Fighter, World } from "../model/types";
import { addNews, fullName, touch, touchRoster } from "../world/core";
import { vacate } from "../world/titles";
import { goatRank, legacyText } from "../world/legacy";
import { notify } from "./inbox";

export function retirementTalk(w: World, rng: Rng): void {
  void rng;
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    const fc = w.career.fc[id];
    if (!f || !fc || f.status !== "active") continue;
    const age = ageAt(f.birth, w.day);
    const last3 = f.bouts.slice(-3).map((b) => w.bouts[b]).filter((b) => b?.res);
    const koLosses = last3.filter((b) => b.res!.winner && b.res!.winner !== (b.a === f.id ? "a" : "b") && (b.res!.method === "KO" || b.res!.method === "TKO")).length;
    const talked = fc.goals.find((g) => g.startsWith("talk:"));
    if (talked && w.day - Number(talked.split(":")[1]) < 180) continue;
    if ((age >= 36 && f.streak <= -2) || koLosses >= 2 || (age >= 39 && f.streak <= 0)) {
      fc.goals = [...fc.goals.filter((g) => !g.startsWith("talk:")), `talk:${w.day}`];
      notify(w, {
        kind: "info",
        fighter: f.id,
        from: w.gyms[f.gym]?.headCoach ?? "Head coach",
        subject: "Time to talk about the future",
        body: `${f.first}, ${koLosses >= 2 ? `two knockout losses in your last three fights` : `${Math.floor(age)} and ${-f.streak > 0 ? `${-f.streak} losses in a row` : "slowing down"}`} — the team wants you to think about how this ends. It's your call. You can retire from your profile whenever you're ready.`,
      });
    }
  }
}

export interface Recap {
  lines: string[];
  legacy: number;
  goat: number | null;
}

export function careerRecap(w: World, f: Fighter): Recap {
  const reigns = Object.values(w.promos).flatMap((p) => p.reigns.filter((r) => r.fighter === f.id && !r.interim));
  const big = reigns.filter((r) => r.promo === "ufc" || r.promo === "pfl");
  const earned = w.career.ledger.filter((e) => e.fighter === f.id && (e.cat === "purse" || e.cat === "bonus") && e.amount > 0).reduce((a, e) => a + e.amount, 0);
  const lines = [
    `Professional record ${f.rec.w}-${f.rec.l}${f.rec.d ? `-${f.rec.d}` : ""}: ${f.rec.koW} knockouts, ${f.rec.subW} submissions.`,
    big.length ? `World champion: ${big.map((r) => `${PROMOTIONS[r.promo].short} ${r.div} (${r.defenses} defence${r.defenses === 1 ? "" : "s"})`).join(", ")}.` : reigns.length ? `Titles at ${[...new Set(reigns.map((r) => PROMOTIONS[r.promo].short))].join(", ")}.` : "No title, but a career fought on its own terms.",
    earned ? `Purses and bonuses earned in this career: ${money(earned)}.` : "",
    `Legacy: ${Math.round(f.legacy ?? 0)} points, ${legacyText(f.legacy ?? 0).toLowerCase()}.`,
  ].filter(Boolean);
  return { lines, legacy: f.legacy ?? 0, goat: goatRank(w, f) };
}

export function retirePlayer(w: World, f: Fighter): string {
  if (f.booked && w.bouts[f.booked]?.status === "booked") return "Fight the booked fight or pull out of it first.";
  vacate(w, f, "retired");
  f.status = "retired";
  f.retired = w.day;
  f.promo = null;
  touchRoster(w, f);
  f.contract = null;
  w.career.fighters = w.career.fighters.filter((x) => x !== f.id);
  w.career.retiredAt = w.day;
  w.career.retiredFighter = f.id;
  for (const o of w.career.fightOffers) if (o.fighter === f.id && o.status === "open") o.status = "withdrawn";
  for (const o of w.career.contractOffers) if (o.fighter === f.id && o.status === "open") o.status = "withdrawn";
  for (const m of w.inbox) if (m.fighter === f.id && m.needs && !m.done) {
    m.needs = false;
    m.done = "Retired";
  }
  const rc = careerRecap(w, f);
  addNews(w, { kind: "retire", fighters: [f.id], big: f.reigns > 0 || f.pop > 40, text: `${fullName(f)} retires from MMA at ${Math.floor(ageAt(f.birth, w.day))}, ${f.rec.w}-${f.rec.l}${f.rec.d ? `-${f.rec.d}` : ""}.` });
  notify(w, { kind: "info", fighter: f.id, from: "The team", subject: "The gloves come off", body: `${fullName(f)} retires on ${fmtDate(w.day)}. ${rc.lines.join(" ")} What's next is up to you: open a management company, or step away and watch the sport go on.` });
  touch(w);
  return `${fullName(f)} has retired.`;
}

export function becomeManager(w: World, agencyName: string): string {
  const c = w.career;
  const f = c.retiredFighter ? w.fighters[c.retiredFighter] : undefined;
  c.mode = "manager";
  c.name = f ? fullName(f) : c.name;
  c.agency = { name: agencyName || "Management", rep: Math.round(clamp(18 + (f?.legacy ?? 0) / 4 + (f?.pop ?? 0) / 6, 15, 70)), cut: 15, staff: 1, scouting: [] };
  c.living = 4500;
  notify(w, { kind: "info", from: "Agency office", subject: `${c.agency.name} opens its doors`, body: `${c.name} starts a management company with a reputation of ${c.agency.rep}${f ? ", built on a fighting career" : ""}. Sign clients from Scouting; you take your cut of their purses and 20% of their sponsorship.` });
  touch(w);
  return "The agency is open.";
}
