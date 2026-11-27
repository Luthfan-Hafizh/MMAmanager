// What a career's money can do once there's more of it than the camps need: put it
// to work in the markets, open a gym of your own (no gym cut from the purses, coaches
// you pick, a room that grows with you), or buy your way out of a contract.

import { Rng } from "../core/rng";
import { money } from "../core/util";
import { countryOf } from "../data/countries";
import { makeName } from "../data/names";
import { PROMOTIONS } from "../data/promotions";
import type { Fighter, Gym, World } from "../model/types";
import { addNews, fullName, isChampion, isInterim, touch, touchRoster } from "../world/core";
import { notify } from "./inbox";
import { ledger } from "./money";
import { startSignedDeals, toFreeAgency } from "./offers";
import { adjustRapport } from "./promoter";

// ---------- investments ----------

/** Put cash to work: it rises with the markets, about 6% a year over the long run, and falls with them too. */
export function invest(w: World, amount: number): string {
  const c = w.career;
  const a = Math.floor(Math.min(amount, c.money));
  if (a <= 0) return "Nothing to put in.";
  c.invest = { balance: (c.invest?.balance ?? 0) + a, paidIn: (c.invest?.paidIn ?? 0) + a, last: c.invest?.last ?? 0 };
  ledger(w, { amount: -a, what: "Put into investments", cat: "invest" });
  touch(w);
  return `${money(a, { exact: true })} invested.`;
}

export function withdrawInvestment(w: World, amount: number): string {
  const inv = w.career.invest;
  if (!inv || inv.balance <= 0) return "Nothing invested.";
  const a = Math.floor(Math.min(amount, inv.balance));
  if (a <= 0) return "Nothing to take out.";
  takeOut(w, a, "Taken out of investments");
  touch(w);
  return `${money(a, { exact: true })} taken out.`;
}

function takeOut(w: World, a: number, what: string): void {
  const inv = w.career.invest!;
  // What comes out is part gain, part what went in, in proportion.
  const share = inv.balance > 0 ? a / inv.balance : 1;
  inv.paidIn = Math.max(0, Math.round(inv.paidIn * (1 - share)));
  inv.balance -= a;
  ledger(w, { amount: a, what, cat: "invest" });
}

/** The first of the month: the markets move, and an overdraft is covered from what's invested. */
export function investMonthly(w: World, rng: Rng): void {
  const inv = w.career.invest;
  if (!inv || inv.balance <= 0) return;
  const r = rng.normal(0.0057, 0.034);
  const before = inv.balance;
  inv.balance = Math.max(0, Math.round(inv.balance * (1 + r)));
  inv.last = inv.balance - before;
  if (w.career.money < 0 && inv.balance > 0) {
    const a = Math.min(inv.balance, Math.ceil(-w.career.money / 100) * 100);
    takeOut(w, a, "Investments sold to cover the overdraft");
    notify(w, { kind: "money", from: "Accountant", subject: "Investments sold", body: `The account was overdrawn, so ${money(a, { exact: true })} of the investments were sold to cover it. ${money(inv.balance)} is still invested.` });
  }
}

// ---------- a gym of your own ----------

export interface OwnGymTier {
  tier: number;
  name: string;
  cost: number;
  q: number;
  fac: number;
  rep: number;
  /** Wages and rent a month, and what the members pay. */
  run: number;
  income: number;
}

export const OWN_GYMS: OwnGymTier[] = [
  { tier: 0, name: "A small room", cost: 250000, q: 62, fac: 62, rep: 55, run: 6000, income: 4000 },
  { tier: 1, name: "A proper gym", cost: 800000, q: 74, fac: 76, rep: 68, run: 15000, income: 9000 },
  { tier: 2, name: "An elite academy", cost: 2500000, q: 86, fac: 90, rep: 82, run: 36000, income: 22000 },
];

export function ownGymOf(w: World, f: Fighter): Gym | null {
  for (const g of Object.values(w.gyms)) if (g.owner === f.id) return g;
  return null;
}

function applyTier(g: Gym, t: OwnGymTier): void {
  g.coaches = { head: t.q + 2, striking: t.q, grappling: t.q, wrestling: t.q, sc: t.q };
  g.facilities = t.fac;
  g.rep = t.rep;
  g.ownTier = t.tier;
  g.fee = 0;
}

function inCamp(w: World, f: Fighter): boolean {
  const b = f.booked ? w.bouts[f.booked] : null;
  return !!b && b.status === "booked" && !b.pending && b.day - w.day < 28;
}

/** Why the gym can't be opened now, or null when it can. */
export function cantOpen(w: World, f: Fighter, tier: number, name: string): string | null {
  const t = OWN_GYMS[tier];
  if (!t || w.career.mode !== "fighter" || f.status !== "active") return "Only a fighter's career can open a gym.";
  if (ownGymOf(w, f)) return "There's already a gym of your own.";
  const n = name.trim();
  if (n.length < 3) return "Give the gym a name.";
  if (Object.values(w.gyms).some((g) => g.name.toLowerCase() === n.toLowerCase())) return `There's already a gym called ${n}.`;
  if (inCamp(w, f)) return "Not in the middle of a camp: wait until after the fight.";
  if (w.career.money < t.cost) return `That takes ${money(t.cost)} in the bank.`;
  return null;
}

/** Where the gym would open: the city the fighter trains in now, so opening one doesn't mean moving. */
export function gymPlace(w: World, f: Fighter): { city: string; country: string } {
  const now = w.gyms[f.gym];
  return now ? { city: now.city, country: now.country } : { city: f.hometown, country: f.country };
}

/** Open the gym, and train there from now on: no gym cut from the purses, no membership. */
export function openGym(w: World, f: Fighter, tier: number, name: string): string {
  const no = cantOpen(w, f, tier, name);
  if (no) return no;
  const t = OWN_GYMS[tier];
  const at = gymPlace(w, f);
  const head = makeName(new Rng(`${w.id}:${f.id}:gym`), countryOf(at.country).culture, "M");
  const g: Gym = {
    id: `gym-own-${f.id}`,
    name: name.trim(),
    country: at.country,
    city: at.city,
    rep: t.rep,
    facilities: t.fac,
    coaches: { head: t.q + 2, striking: t.q, grappling: t.q, wrestling: t.q, sc: t.q },
    headCoach: `${head.first} ${head.last}`,
    fee: 0,
    owner: f.id,
    ownTier: t.tier,
  };
  w.gyms[g.id] = g;
  ledger(w, { amount: -t.cost, what: `Opening ${g.name}`, cat: "gym", fighter: f.id });
  f.gym = g.id;
  touchRoster(w, f);
  // Settling in takes less time in a room you built.
  const fc = w.career.fc[f.id];
  if (fc) fc.adapt = 2;
  if (f.pop > 30) addNews(w, { kind: "other", fighters: [f.id], text: `${fullName(f)} opens a gym: ${g.name}, in ${g.city}.` });
  notify(w, {
    kind: "training",
    fighter: f.id,
    from: g.headCoach,
    subject: `${g.name} opens`,
    body: `${fullName(f)} trains at a gym of their own now: ${t.name.toLowerCase()} in ${g.city}, coaches at ${t.q}, head coach ${g.headCoach}. No gym cut from the purses and no membership; the running costs (${money(t.run)} a month, less ${money(t.income)} from the members) come out on the first of each month.`,
  });
  touch(w);
  return `${g.name} is open.`;
}

/** A bigger room: better coaches and facilities, for the difference. */
export function upgradeGym(w: World, f: Fighter): string {
  const g = ownGymOf(w, f);
  if (!g) return "";
  const t = OWN_GYMS[(g.ownTier ?? 0) + 1];
  if (!t) return "It's as good as it gets.";
  const cost = t.cost - OWN_GYMS[g.ownTier ?? 0].cost;
  if (w.career.money < cost) return `That takes ${money(cost)} in the bank.`;
  ledger(w, { amount: -cost, what: `${g.name}: ${t.name.toLowerCase()}`, cat: "gym", fighter: f.id });
  applyTier(g, t);
  touch(w);
  return `${g.name} is ${t.name.toLowerCase()} now.`;
}

/** The first of the month: wages and rent, less the memberships. */
export function gymMonthly(w: World): void {
  if (w.career.mode !== "fighter") return;
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    const g = f ? ownGymOf(w, f) : null;
    if (!g) continue;
    const t = OWN_GYMS[g.ownTier ?? 0];
    ledger(w, { amount: t.income - t.run, what: `${g.name}: wages and rent, less memberships`, cat: "gym", fighter: id });
  }
}

// ---------- buying out a contract ----------

/** What it costs to walk away from the deal now: most of what the fights left would have paid. */
export function buyoutCost(f: Fighter): number | null {
  const c = f.contract;
  if (!c || !f.promo || PROMOTIONS[f.promo].tier === "amateur" || c.left <= 0) return null;
  const big = PROMOTIONS[f.promo].tier === "major" || PROMOTIONS[f.promo].tier === "league";
  return Math.max(5000, Math.round((c.left * (c.show + c.win * 0.5) * (big ? 0.8 : 0.6)) / 1000) * 1000);
}

/** Why the contract can't be bought out now, or null when it can. */
export function cantBuyOut(w: World, f: Fighter): string | null {
  const cost = buyoutCost(f);
  if (cost === null || w.career.mode !== "fighter") return "There's no contract to buy out.";
  if (f.booked && w.bouts[f.booked]?.status === "booked") return "Not with a fight booked: finish it first.";
  if (w.career.money < cost) return `That takes ${money(cost)} in the bank.`;
  return null;
}

/** Pay to leave now: a free agent, or straight into the deal already signed for later. */
export function buyOut(w: World, f: Fighter): string {
  const no = cantBuyOut(w, f);
  if (no) return no;
  const cost = buyoutCost(f)!;
  const promo = f.promo!;
  const short = PROMOTIONS[promo].short;
  const next = w.career.fc[f.id]?.next;
  const held = isChampion(w, f) || isInterim(w, f);
  ledger(w, { amount: -cost, what: `Buying out the ${short} contract`, cat: "fees", fighter: f.id });
  adjustRapport(w, f, promo, -12, "Bought out of the contract");
  toFreeAgency(w, f);
  if (next) startSignedDeals(w);
  if (f.pop > 30 && !held) addNews(w, { kind: "release", promo, fighters: [f.id], text: `${fullName(f)} buys out the rest of the ${short} contract${next ? "" : " and is a free agent"}.` });
  notify(w, {
    kind: "contract",
    fighter: f.id,
    from: "Manager",
    subject: next ? `Out of the ${short} deal` : "A free agent",
    body: next
      ? `${fullName(f)} paid ${money(cost, { exact: true })} to leave the ${short} early, and the ${PROMOTIONS[next.promo].short} deal starts now.`
      : `${fullName(f)} paid ${money(cost, { exact: true })} to leave the ${short} and is free to sign anywhere${held ? "; the title is vacated" : ""}. Offers come at the start of each month.`,
  });
  touch(w);
  return next ? `Bought out: ${fullName(f)} joins the ${PROMOTIONS[next.promo].short} now.` : `Bought out: ${fullName(f)} is a free agent.`;
}
