// A fighter's own team, beyond the gym: a striking, a wrestling and a grappling
// coach, a strength and conditioning coach and a nutritionist, each paid by the
// week. A coach of your own counts where the gym's is weaker; the nutritionist
// works every camp at no extra cost. And the camp's location: at home, at altitude
// for the gas tank, or at a top gym with its coaches for the weeks before the fight.

import type { Camp, CampSite, Fighter, Gym, TeamRole, World } from "../model/types";
import { gymQuality } from "./moves";
import { ledger } from "./money";
import { notify } from "./inbox";
import { fullName } from "../world/core";
import type { SessionDef } from "./training";

export const STAFF_ROLES: { id: TeamRole; name: string; what: string }[] = [
  { id: "striking", name: "Striking coach", what: "Boxing, kickboxing and Muay Thai sessions, and striking styles" },
  { id: "wrestling", name: "Wrestling coach", what: "Wrestling sessions and takedown techniques" },
  { id: "grappling", name: "Grappling coach", what: "Jiu-jitsu sessions, submissions and grappling styles" },
  { id: "sc", name: "Strength and conditioning coach", what: "Strength, cardio and recovery sessions" },
  { id: "nutrition", name: "Nutritionist", what: "Every camp's weight cut, at no extra cost" },
];

export const STAFF_TIERS: { q: number; name: string; wage: number }[] = [
  { q: 60, name: "Good", wage: 250 },
  { q: 72, name: "Very good", wage: 600 },
  { q: 85, name: "Elite", wage: 1500 },
];

export function wageOf(q: number): number {
  return STAFF_TIERS.find((t) => t.q === q)?.wage ?? 0;
}

export function hireStaff(w: World, f: Fighter, role: TeamRole, q: number): string {
  const fc = w.career.fc[f.id];
  if (!fc) return "";
  fc.team = { ...(fc.team ?? {}), [role]: q };
  const r = STAFF_ROLES.find((x) => x.id === role)!;
  notify(w, { kind: "training", fighter: f.id, from: r.name, subject: `A ${r.name.toLowerCase()} of your own`, body: `${fullName(f)} hires a ${STAFF_TIERS.find((t) => t.q === q)?.name.toLowerCase()} ${r.name.toLowerCase()} (${q}) at $${wageOf(q).toLocaleString("en-US")} a week. ${r.what}: where the gym's coach is weaker, this one counts.` });
  return `${r.name} hired.`;
}

export function fireStaff(w: World, f: Fighter, role: TeamRole): string {
  const fc = w.career.fc[f.id];
  if (!fc?.team?.[role]) return "";
  const next = { ...fc.team };
  delete next[role];
  fc.team = next;
  return `${STAFF_ROLES.find((x) => x.id === role)!.name} let go.`;
}

/** Monday: the wages of the fighter's own team. */
export function staffWeekly(w: World): void {
  if (w.career.mode !== "fighter") return;
  for (const id of w.career.fighters) {
    const fc = w.career.fc[id];
    const f = w.fighters[id];
    if (!fc?.team || !f || f.status !== "active") continue;
    const total = Object.values(fc.team).reduce((a, q) => a + wageOf(q ?? 0), 0);
    if (total) ledger(w, { amount: -total, what: "Your own coaches and nutritionist", cat: "gym", fighter: id });
  }
}

/** The best camp away from home: the strongest room in the world, the home gym aside. */
export function topGymFor(w: World, f: Fighter): Gym | null {
  return Object.values(w.gyms).filter((g) => g.id !== f.gym).sort((a, b) => gymQuality(b) - gymQuality(a))[0] ?? null;
}

export const SITE_NAMES: Record<CampSite, string> = { home: "Home gym", altitude: "Altitude camp", topgym: "A top gym" };

/** The camp's location, by the week: altitude for the gas tank, a top gym for its coaches. */
export function siteCostPerWeek(site: CampSite | undefined): number {
  return site === "altitude" ? 1500 : site === "topgym" ? 2000 : 0;
}

export function sitePrep(camp: Camp | null | undefined): number {
  return camp?.site === "altitude" ? 0.07 : camp?.site === "topgym" ? 0.05 : 0;
}

type Area = SessionDef["area"];

/** The coach for a kind of session: the gym's, a top gym's during an away camp, or your own, whichever is best. */
export function coachFor(w: World, f: Fighter, area: Area, base: (g: Gym | undefined, a: Area) => number): number {
  const fc = w.career.fc[f.id];
  let q = base(w.gyms[f.gym], area);
  const camp = fc?.camp;
  if (camp?.site === "topgym" && camp.guest && w.gyms[camp.guest]) q = Math.max(q, base(w.gyms[camp.guest], area));
  const own = area === "head" ? undefined : fc?.team?.[area as TeamRole];
  if (own) q = Math.max(q, own);
  return q;
}

/** The weight-cut help in this camp: the camp's own, or the team's nutritionist. */
export function nutritionOf(w: World, f: Fighter): 0 | 1 | 2 {
  const fc = w.career.fc[f.id];
  const camp = fc?.camp?.nutrition ?? 0;
  const own = fc?.team?.nutrition ?? 0;
  const mine = own >= 72 ? 2 : own > 0 ? 1 : 0;
  return Math.max(camp, mine) as 0 | 1 | 2;
}
