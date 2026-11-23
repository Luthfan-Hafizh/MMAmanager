// Sponsorship. Since the UFC's kit deal, fighters can't wear most logos in the
// Octagon, so the money comes from social media, gyms, supplements and local
// businesses; it follows popularity and fades when a fighter is out of sight.

import type { Rng } from "../core/rng";
import { clamp, money } from "../core/util";
import { PROMOTIONS } from "../data/promotions";
import type { World } from "../model/types";
import { fullName, nextId } from "../world/core";
import { notify } from "./inbox";
import { ledger } from "./money";

const BRANDS = [
  "IronFuel Nutrition", "Southpaw Apparel", "Clinch Coffee Co.", "Apex Recovery Clinic", "Northside Motors", "Hydra Electrolytes", "GrapplePro Mats",
  "Fightwear Union", "BlueLine CBD", "Titan Supplements", "Cornerman Mouthguards", "Lionheart Gym Chain", "Bunker Energy Drink", "Vector Sports Betting",
  "Kingdom Watches", "Redline Barbers", "Summit Physio", "Octane Protein", "Harbor Bank", "City Auto Repair",
];

export function weeklySponsors(w: World): void {
  const c = w.career;
  c.sponsors = c.sponsors.filter((s) => s.until > w.day);
}

export function sponsorIncomeFor(w: World, fighter: string): number {
  return w.career.sponsors.filter((s) => s.fighter === fighter).reduce((a, s) => a + s.monthly, 0);
}

export function monthlySponsors(w: World, rng: Rng): void {
  const c = w.career;
  for (const s of c.sponsors) {
    if (s.until <= w.day) continue;
    if (c.mode === "fighter") ledger(w, { amount: s.monthly, what: `${s.brand} sponsorship`, cat: "sponsor", fighter: s.fighter });
    else ledger(w, { amount: Math.round(s.monthly * 0.2), what: `20% of ${s.brand} deal`, cat: "commission", fighter: s.fighter });
  }
  for (const id of c.fighters) {
    const f = w.fighters[id];
    if (!f || f.status !== "active") continue;
    const deals = c.sponsors.filter((s) => s.fighter === id && s.until > w.day).length;
    const tier = f.promo ? PROMOTIONS[f.promo].tier : "local";
    const tierMul = { amateur: 0.15, local: 0.35, regional: 0.7, tryout: 0.9, league: 1.6, major: 2.6 }[tier];
    const idle = f.lastFight === null ? 999 : w.day - f.lastFight;
    const draw = f.pop * tierMul * (idle > 300 ? 0.5 : 1) * (1 + f.pers.controversy / 40);
    const slots = f.pop > 70 ? 4 : f.pop > 40 ? 3 : f.pop > 15 ? 2 : 1;
    if (deals >= slots) continue;
    const fc = c.fc[id];
    const mgr = c.mode === "manager" ? 1 + (c.agency?.rep ?? 20) / 120 : fc?.manager ? 1 + fc.manager.quality / 200 : 0.8;
    if (!rng.chance(clamp(0.08 + draw / 220, 0.05, 0.6) * mgr)) continue;
    const monthly = Math.round(clamp(draw * 38 * (0.6 + rng.next()) * mgr, 150, 250000) / 50) * 50;
    const months = rng.int(6, 18);
    const brand = rng.pick(BRANDS);
    const deal = { id: nextId(w, "sp"), fighter: id, brand, perFight: 0, monthly, until: w.day + months * 30 };
    c.sponsors.push(deal);
    notify(w, {
      kind: "sponsor",
      fighter: id,
      from: brand,
      subject: `Sponsor: ${brand}, ${money(monthly)} a month`,
      body: `${brand} signs ${fullName(f)} for ${months} months at ${money(monthly)} a month: social posts, a few appearances, the logo on the walkout gear where the promotion allows it.${c.mode === "manager" ? " The agency takes 20%." : ""}`,
    });
  }
}
