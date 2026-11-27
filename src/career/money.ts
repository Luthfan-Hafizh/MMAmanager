// Money as the sport pays it. Show and win money, the UFC's fight-week
// compliance pay, the 2026 bonuses ($100,000 for Fight and Performance of the
// Night, $25,000 for every finish), weight-miss fines; and what comes out of a
// purse: the gym and coach, the manager, licences and medicals, travel, tax.

import { clamp } from "../core/util";
import { ymd } from "../core/time";
import { PROMOTIONS, type PromoId } from "../data/promotions";
import type { Bout, Fighter, LedgerEntry, Purse, World } from "../model/types";
import { fullName, stageFights } from "../world/core";

export const UFC_BONUS = 100000;
export const UFC_FINISH_BONUS = 25000;

export function compliancePay(w: World, f: Fighter, b: Bout): number {
  if (b.promo !== "ufc") return 0;
  const champ = w.promos.ufc.champs[b.div] === f.id;
  if (b.kind === "title" || b.kind === "vacant") return champ ? 42000 : 32000;
  const n = stageFights(w, f, "ufc") + 1;
  if (n <= 3) return 4000;
  if (n <= 5) return 5000;
  if (n <= 10) return 10000;
  if (n <= 15) return 15000;
  if (n <= 20) return 20000;
  return 32000;
}

/** What a promotion pays a fighter for a fight it offers. */
export function fightOfferPay(w: World, f: Fighter, promo: PromoId, shortNotice: boolean): { show: number; win: number } {
  const c = f.contract && f.contract.promo === promo ? f.contract : null;
  const p = PROMOTIONS[promo];
  let show = c ? c.show : p.showLow;
  let win = c ? c.win : p.showLow;
  if (p.tier === "tryout") {
    show = 5000;
    win = 5000;
  }
  if (shortNotice && p.tier !== "amateur") {
    show = Math.round(show * 1.25);
    win = Math.round(win * 1.25);
  }
  return { show, win };
}

export function taxRate(yearIncome: number): number {
  // An effective rate that grows with the year's purses.
  if (yearIncome < 15000) return 0.06;
  if (yearIncome < 50000) return 0.12;
  if (yearIncome < 120000) return 0.2;
  if (yearIncome < 300000) return 0.27;
  if (yearIncome < 1000000) return 0.33;
  return 0.38;
}

export function yearPurses(w: World, fighter: string): number {
  const y = ymd(w.day).y;
  let s = 0;
  for (const e of w.career.ledger) {
    if (e.fighter !== fighter) continue;
    if (ymd(e.day).y !== y) continue;
    if (e.cat === "purse" || e.cat === "bonus") s += e.amount;
  }
  return s;
}

export function ledger(w: World, e: Omit<LedgerEntry, "day"> & { day?: number }): void {
  const entry: LedgerEntry = { day: e.day ?? w.day, ...e };
  w.career.ledger.unshift(entry);
  w.career.money += entry.amount;
  if (w.career.ledger.length > 1500) w.career.ledger.length = 1500;
}

export interface PurseBreakdown extends Purse {
  compliance: number;
  /** A share of the pay-per-view for the stars of a UFC main event. */
  ppv: number;
  gym: number;
  manager: number;
  fees: number;
  travel: number;
  tax: number;
  net: number;
}

/** Work out and pay a controlled fighter's purse after a fight. */
/** The fight fell through in fight week, through no fault of the fighter's: the promotion pays the show money. */
export function payShowOnly(w: World, f: Fighter, b: Bout, why: string): number {
  const pay = (b.purses && (b.a === f.id ? b.purses.a : b.purses.b)) ?? null;
  const show = pay?.show ?? f.contract?.show ?? 0;
  if (!show || PROMOTIONS[b.promo].tier === "amateur") return 0;
  const fc = w.career.fc[f.id];
  if (w.career.mode === "fighter") {
    ledger(w, { amount: show, what: `Show money (${why})`, cat: "purse", fighter: f.id });
    const mgr = fc?.manager ? Math.round((show * fc.manager.cut) / 100) : 0;
    if (mgr) ledger(w, { amount: -mgr, what: `Manager (${fc!.manager!.cut}%)`, cat: "manager", fighter: f.id });
  } else {
    const cut = w.career.agency?.cut ?? 15;
    ledger(w, { amount: Math.round((show * cut) / 100), what: `${cut}% of ${fullName(f)}'s show money`, cat: "commission", fighter: f.id });
  }
  return show;
}

export function payPurse(w: World, f: Fighter, b: Bout, won: boolean, bonusCount: number, finishBonus: boolean, fined: number, fineFrom: number, ppvShare = 0): PurseBreakdown {
  const p = PROMOTIONS[b.promo];
  const pay = (b.purses && (b.a === f.id ? b.purses.a : b.purses.b)) ?? null;
  const show = pay?.show ?? f.contract?.show ?? p.showLow;
  const winMoney = won ? pay?.win ?? f.contract?.win ?? show : 0;
  const compliance = compliancePay(w, f, b);
  const bonus = b.promo === "ufc" ? bonusCount * UFC_BONUS : 0;
  const finish = b.promo === "ufc" && finishBonus ? UFC_FINISH_BONUS : 0;
  const fine = Math.round((show + winMoney) * fined);
  const fineIn = Math.round(fineFrom);
  const ppv = Math.round(ppvShare);
  const gross = show + winMoney + compliance + bonus + finish + ppv - fine + fineIn;
  const gym = w.gyms[f.gym];
  const gymCut = Math.round((show + winMoney + bonus + finish + ppv) * ((gym?.fee ?? 10) / 100));
  const fc = w.career.fc[f.id];
  const manager = fc?.manager ? Math.round((show + winMoney + bonus + finish + ppv) * (fc.manager.cut / 100)) : 0;
  const fees = p.tier === "amateur" ? 150 : p.tier === "local" ? 450 : p.tier === "regional" ? 900 : 1800;
  const travel = p.tier === "amateur" ? 400 : p.tier === "local" ? 600 : p.tier === "regional" ? 700 : 0;
  const before = yearPurses(w, f.id);
  const tax = Math.round(Math.max(0, gross - gymCut - manager) * taxRate(before + gross));
  const net = gross - gymCut - manager - fees - travel - tax;
  const out: PurseBreakdown = { show, win: winMoney, bonus, finish, fine, total: gross, compliance, ppv, gym: gymCut, manager, fees, travel, tax, net };
  if (w.career.mode === "fighter") {
    ledger(w, { amount: show, what: `Show money, ${w.events[b.ev]?.name ?? ""}`, cat: "purse", fighter: f.id });
    if (winMoney) ledger(w, { amount: winMoney, what: "Win money", cat: "purse", fighter: f.id });
    if (compliance) ledger(w, { amount: compliance, what: "UFC fight-week compliance pay", cat: "purse", fighter: f.id });
    if (bonus) ledger(w, { amount: bonus, what: bonusCount > 1 ? "Two performance bonuses" : "Performance bonus", cat: "bonus", fighter: f.id });
    if (finish) ledger(w, { amount: finish, what: "UFC finish bonus", cat: "bonus", fighter: f.id });
    if (ppv) ledger(w, { amount: ppv, what: "Pay-per-view share", cat: "purse", fighter: f.id });
    if (fine) ledger(w, { amount: -fine, what: "Fine for missing weight", cat: "fine", fighter: f.id });
    if (fineIn) ledger(w, { amount: fineIn, what: "Opponent's weight-miss fine", cat: "purse", fighter: f.id });
    if (gymCut) ledger(w, { amount: -gymCut, what: `${gym?.name ?? "Gym"} and head coach`, cat: "gym", fighter: f.id });
    if (manager) ledger(w, { amount: -manager, what: `Manager (${fc!.manager!.cut}%)`, cat: "manager", fighter: f.id });
    ledger(w, { amount: -fees, what: "Licence, medicals and fees", cat: "fees", fighter: f.id });
    if (travel) ledger(w, { amount: -travel, what: "Travel and hotel", cat: "travel", fighter: f.id });
    if (tax) ledger(w, { amount: -tax, what: "Tax on the purse", cat: "tax", fighter: f.id });
  } else {
    // The manager takes the agency's cut of the gross.
    const cut = w.career.agency?.cut ?? 15;
    const comm = Math.round((show + winMoney + bonus + finish + ppv) * (cut / 100));
    if (comm) ledger(w, { amount: comm, what: `${cut}% of ${fullName(f)}'s purse`, cat: "commission", fighter: f.id });
    // The bookkeeping of the fighter's own purse is shown on their page only.
    w.career.ledger.unshift({ day: w.day, amount: 0, what: `${fullName(f)} earned ${gross.toLocaleString("en-US")} gross`, cat: "other", fighter: f.id });
  }
  return out;
}

/** Monthly costs: living, the gym membership for those without a deal, and the agency's office. */
export function monthlyMoney(w: World): void {
  const c = w.career;
  if (c.mode === "fighter") {
    ledger(w, { amount: -c.living, what: "Living costs", cat: "living" });
    for (const id of c.fighters) {
      const fc = c.fc[id];
      if (fc?.dayJob) ledger(w, { amount: 2100, what: "Day job", cat: "salary", fighter: id });
      const f = w.fighters[id];
      const tier = f?.promo ? PROMOTIONS[f.promo].tier : "local";
      const own = !!f && w.gyms[f.gym]?.owner === f.id;
      const dues = own ? 0 : tier === "amateur" ? 160 : tier === "local" ? 220 : tier === "regional" ? 320 : 0;
      if (dues) ledger(w, { amount: -dues, what: "Gym membership", cat: "gym", fighter: id });
    }
  } else {
    const a = c.agency!;
    ledger(w, { amount: -(c.living + a.staff * 3200), what: "Office, staff and travel", cat: "salary" });
  }
  // Interest on debt.
  if (c.money < 0) ledger(w, { amount: Math.round(c.money * 0.015), what: "Overdraft interest", cat: "fees" });
  const m = ymd(w.day);
  const key = `${m.y}-${String(m.m + 1).padStart(2, "0")}`;
  let inc = 0;
  let out = 0;
  for (const e of c.ledger) {
    const t = ymd(e.day);
    // the previous month
    const prevM = m.m === 0 ? 11 : m.m - 1;
    const prevY = m.m === 0 ? m.y - 1 : m.y;
    if (t.y !== prevY || t.m !== prevM) {
      if (t.y < prevY || (t.y === prevY && t.m < prevM)) break;
      continue;
    }
    if (e.amount > 0) inc += e.amount;
    else out -= e.amount;
  }
  c.monthly.push({ m: key, inc, out, bal: c.money });
  if (c.monthly.length > 240) c.monthly.shift();
}

export function runwayMonths(w: World): number {
  const c = w.career;
  const burn = c.living + (c.mode === "manager" ? (c.agency?.staff ?? 0) * 3200 : 0);
  return burn > 0 ? clamp(c.money / burn, -99, 999) : 999;
}
