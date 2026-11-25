// Offers to the player's fighters: fights to accept or turn down, and
// contracts to negotiate. Promotions value a fighter by level, ranking,
// popularity and momentum; they have a ceiling they will not go past and a
// limited patience for counter offers. Rival bids raise the ceiling.

import type { Rng } from "../core/rng";
import { clamp, money } from "../core/util";
import { fmtDate } from "../core/time";
import { PROMOTIONS, TIER_RANK, promoFor, type PromoId } from "../data/promotions";
import { countryOf } from "../data/countries";
import { ovr, ovrOf } from "../model/attributes";
import type { ContractOffer, FightOffer, Fighter, World } from "../model/types";
import { addNews, fullName, nextId, rankOf, touch, isChampion, isInterim, withRng } from "../world/core";
import { dropInterim, vacate } from "../world/titles";
import { refreshDivision } from "../world/belts";
import { callOff, cancelBout, withdraw } from "../world/matchmaking";
import { signTo } from "../world/results";
import { managerPerson } from "./advisor";
import { entryElo } from "../world/rankings";
import { startCamp } from "./camp";
import { closeMessages, notify } from "./inbox";
import { ledger } from "./money";

// ---------- fights ----------

export function acceptFight(w: World, offerId: string): string {
  const o = w.career.fightOffers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return "This offer is no longer open.";
  const f = w.fighters[o.fighter];
  const b = Object.values(w.bouts).find((x) => x.pending === o.id);
  if (!b || b.status !== "booked") {
    o.status = "withdrawn";
    closeMessages(w, o.id, "Withdrawn");
    return "The promotion has moved on: the fight is gone.";
  }
  o.status = "accepted";
  b.pending = undefined;
  // A bigger promotion's short-notice call comes with its contract.
  if (o.debut && f.promo !== o.debut) {
    const from = f.promo;
    withRng(w, (rng) => signTo(w, f, o.debut!, rng));
    if (o.debut === "ufc") f.tags = [...new Set([...(f.tags ?? []), "ufc-alum"])];
    addNews(w, { kind: "signing", promo: o.debut, fighters: [f.id], text: `${PROMOTIONS[o.debut].short} signs ${fullName(f)}${from ? ` from ${PROMOTIONS[from].short}` : ""} to step in on short notice.` });
  }
  b.purses = { ...(b.purses ?? {}), [b.a === f.id ? "a" : "b"]: { show: o.show, win: o.win, bonus: 0, finish: 0, fine: 0, total: 0 } };
  const fc = w.career.fc[f.id];
  const opp = w.fighters[o.opp];
  const ev = w.events[o.ev];
  const days = o.day - w.day;
  if (o.stay && fc?.camp && fc.camp.bout === b.id) {
    // The camp goes on; the film on the old opponent is wasted.
    fc.camp.study *= 0.5;
  } else startCamp(w, f, b);
  if (fc) {
    fc.asked = false;
    fc.lastAsk = undefined;
  }
  closeMessages(w, o.id, "Accepted");
  if (o.shortNotice && !o.stay) {
    // Stepping up wins friends: the fans and the matchmaker remember it.
    f.pop = clamp(f.pop + 1.5, 0, 100);
    notify(w, {
      kind: "camp",
      fighter: f.id,
      ref: b.id,
      from: "Head coach",
      subject: `Short-notice camp: ${fullName(opp)}, ${days <= 1 ? "tomorrow" : `${days} days`}`,
      body: `We're in: ${fullName(f)} vs ${fullName(opp)} at ${ev?.name}. There's no time for a real camp, so forget the long game plan: make the weight safely, stay sharp, and keep the gas tank in mind. Check the cut and the plan on the Next fight page.`,
    });
  } else if (o.stay) {
    notify(w, {
      kind: "camp",
      fighter: f.id,
      ref: b.id,
      from: "Head coach",
      subject: `New opponent: ${fullName(opp)}`,
      body: `It's on against ${fullName(opp)} instead. We prepared for someone else, so look at the game plan again on the Next fight page: ${days} days to adjust.`,
    });
  } else {
    notify(w, {
      kind: "camp",
      fighter: f.id,
      ref: b.id,
      from: "Head coach",
      subject: `Camp starts: ${fullName(opp)}, ${fmtDate(o.day)}`,
      body: `It's signed: ${fullName(f)} vs ${fullName(opp)} at ${ev?.name}. ${Math.round(days / 7)} weeks to get ready. Set the camp (sparring partners, the cut, the game plan) on the Next fight page, and switch the training week to a fight camp.`,
    });
  }
  if (PROMOTIONS[o.promo].tier === "major" || PROMOTIONS[o.promo].tier === "league" || o.kind === "title") {
    addNews(w, { kind: "booking", promo: o.promo, ev: o.ev, fighters: [f.id, opp.id], text: `${fullName(f)} vs. ${fullName(opp)} is set for ${ev?.name}${o.kind === "title" ? ", with the title on the line" : ""}.` });
  }
  touch(w);
  return "Fight accepted.";
}

export function declineFight(w: World, offerId: string, auto = false): string {
  const o = w.career.fightOffers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return "This offer is no longer open.";
  o.status = auto ? "expired" : "declined";
  const f = w.fighters[o.fighter];
  const b = Object.values(w.bouts).find((x) => x.pending === o.id);
  if (b && b.status === "booked") {
    b.pending = undefined;
    const days = (w.events[b.ev]?.day ?? w.day) - w.day;
    if (o.stay) {
      // No to the new opponent: the fight is off.
      cancelBout(w, b, "The replacement was turned down");
      callOff(w, b, f, auto ? "There was no answer about the new opponent, so the fight is off." : `You turned down ${fullName(w.fighters[o.opp])}.`, days);
    } else if (o.replaced) {
      // The spot goes to somebody else.
      withRng(w, (rng) => withdraw(w, rng, b, f.id, "turned it down", { quiet: true }));
    } else cancelBout(w, b, "Declined");
  }
  const fc = w.career.fc[o.fighter];
  if (fc && !o.shortNotice) fc.lastAsk = w.day + (o.kind === "title" ? 10 : 14);
  closeMessages(w, o.id, auto ? "Expired" : "Declined");
  // A champion turning down defences, or an interim champion the fights for the belts, loses the belt on the second.
  const holder = o.kind === "title" && isChampion(w, f) ? "champ" : (o.kind === "title" || o.kind === "interim") && isInterim(w, f) ? "interim" : null;
  if (holder === "interim") {
    fc && (fc.goals = [...fc.goals.filter((g) => !g.startsWith("refused:")), `refused:${(Number(fc.goals.find((g) => g.startsWith("refused:"))?.split(":")[1] ?? 0) + 1)}`]);
    const n = Number(fc?.goals.find((g) => g.startsWith("refused:"))?.split(":")[1] ?? 0);
    if (n >= 2) {
      dropInterim(w, o.promo, f.div, "stripped");
      refreshDivision(w, o.promo, f.div);
      if (fc) fc.goals = fc.goals.filter((g) => !g.startsWith("refused:"));
      notify(w, { kind: "info", fighter: f.id, from: PROMOTIONS[o.promo].short, subject: "Stripped of the interim title", body: `${fullName(f)} turned down a second fight for the belts. The interim title has been taken away.` });
      addNews(w, { kind: "title", promo: o.promo, fighters: [f.id], big: true, text: `${fullName(f)} has been stripped of the ${PROMOTIONS[o.promo].short} interim title after turning down two fights for the belts.` });
    } else if (!auto) {
      notify(w, { kind: "info", fighter: f.id, from: PROMOTIONS[o.promo].short, subject: "A warning from the matchmaker", body: `The promotion expects its interim champion to fight for the belts. Turn down the next one and the interim title will be taken.` });
    }
  }
  if (holder === "champ") {
    fc && (fc.goals = [...fc.goals.filter((g) => !g.startsWith("refused:")), `refused:${(Number(fc.goals.find((g) => g.startsWith("refused:"))?.split(":")[1] ?? 0) + 1)}`]);
    const n = Number(fc?.goals.find((g) => g.startsWith("refused:"))?.split(":")[1] ?? 0);
    if (n >= 2) {
      // Refuse the defence twice and the promotion takes the belt.
      const ps = w.promos[o.promo];
      ps.champs[f.div] = null;
      const r = [...ps.reigns].reverse().find((x) => x.fighter === f.id && x.lost === undefined);
      if (r) {
        r.lost = w.day;
        r.ended = "stripped";
      }
      if (fc) fc.goals = fc.goals.filter((g) => !g.startsWith("refused:"));
      refreshDivision(w, o.promo, f.div);
      notify(w, { kind: "info", fighter: f.id, from: PROMOTIONS[o.promo].short, subject: "Stripped of the title", body: `${fullName(f)} turned down a second title defence. The belt has been vacated.` });
      addNews(w, { kind: "title", promo: o.promo, fighters: [f.id], big: true, text: `${fullName(f)} has been stripped of the ${PROMOTIONS[o.promo].short} title after refusing to defend it.` });
    } else if (!auto) {
      notify(w, { kind: "info", fighter: f.id, from: PROMOTIONS[o.promo].short, subject: "A warning from the matchmaker", body: `The promotion expects its champion to defend. Turn down the next defence and the belt will be taken.` });
    }
  }
  touch(w);
  return auto ? "The offer expired." : "Fight declined.";
}

export function expireOffers(w: World): void {
  for (const o of w.career.fightOffers) if (o.status === "open" && w.day > o.expires) declineFight(w, o.id, true);
  for (const o of w.career.contractOffers) if (o.status === "open" && w.day > o.expires) {
    o.status = "expired";
    closeMessages(w, o.id, "Expired");
  }
  // Keep the lists short.
  if (w.career.fightOffers.length > 80) w.career.fightOffers = w.career.fightOffers.filter((o) => o.status === "open" || w.day - o.made < 120);
  if (w.career.contractOffers.length > 60) w.career.contractOffers = w.career.contractOffers.filter((o) => o.status === "open" || w.day - o.made < 200);
}

export function askForFight(w: World, f: Fighter): string {
  const fc = w.career.fc[f.id];
  if (!fc) return "";
  if (f.booked) return "There is already a fight booked.";
  if (w.career.fightOffers.some((o) => o.fighter === f.id && o.status === "open")) return "There is an offer waiting in the inbox.";
  fc.asked = true;
  fc.lastAsk = undefined;
  return "The matchmaker knows you want a fight. Expect an offer when the next card is being made.";
}

// ---------- contracts ----------

/** What a promotion thinks a fighter is worth per fight (show money). */
export function valueOf(w: World, f: Fighter, promo: PromoId): number {
  const p = PROMOTIONS[promo];
  const o = ovrOf(f.attrs);
  const rank = f.promo === promo ? rankOf(w, f) : null;
  const pop = f.pop;
  if (p.tier === "amateur") return 0;
  if (promo === "ufc") {
    let v = 12000 + Math.max(0, o - 72) * 2600 + pop * 900 + Math.max(0, f.streak) * 1500;
    if (rank === 0) v = Math.max(v, 450000 + pop * 6000);
    else if (rank !== null) v = Math.max(v, 160000 - rank * 7000 + pop * 1200);
    if (f.contract?.promo === "ufc") v = Math.max(v, f.contract.show * 1.05);
    return Math.round(clamp(v, 12000, 3000000) / 1000) * 1000;
  }
  if (promo === "pfl") {
    let v = 12000 + Math.max(0, o - 64) * 3000 + pop * 1100 + Math.max(0, f.streak) * 1500;
    if (rank === 0) v = Math.max(v, 300000);
    if (f.promo === "ufc" && rankOf(w, f) !== null) v *= 1.6; // a ranked UFC name is a coup
    if (f.contract?.promo === "pfl") v = Math.max(v, f.contract.show * 1.05);
    return Math.round(clamp(v, 10000, 2500000) / 1000) * 1000;
  }
  const q = clamp((o - (p.tier === "regional" ? 56 : 48)) / 22, 0, 1);
  let v = p.showLow + (p.showHigh - p.showLow) * (q * 0.6 + Math.min(1, pop / 60) * 0.4);
  if (rank === 0 || isChampion(w, f)) v *= 1.5;
  return Math.round(v / 100) * 100;
}

export function makeContractOffer(w: World, rng: Rng, f: Fighter, promo: PromoId, opts: { renewal?: boolean; note?: string; rivals?: number } = {}): ContractOffer | null {
  if (w.career.contractOffers.some((o) => o.fighter === f.id && o.promo === promo && o.status === "open")) return null;
  const p = PROMOTIONS[promo];
  const value = valueOf(w, f, promo);
  const fc = w.career.fc[f.id];
  const mgr = w.career.mode === "manager" ? 0.08 + (w.career.agency?.rep ?? 20) / 800 : fc?.manager ? 0.06 + fc.manager.quality / 1000 : 0;
  const opening = Math.round((value * (0.82 + rng.next() * 0.1) * (1 + mgr)) / 100) * 100;
  const limit = Math.round(value * (1.12 + mgr + (opts.rivals ?? 0) * 0.08 + rng.next() * 0.12));
  const champ = isChampion(w, f) && f.promo === promo;
  const fights = p.tier === "major" ? (opts.renewal ? rng.int(4, 6) : 4) : p.tier === "league" ? rng.int(3, 4) : rng.int(2, 4);
  const big = promo === "ufc" || promo === "pfl";
  const offer: ContractOffer = {
    id: nextId(w, "co"),
    fighter: f.id,
    promo,
    fights,
    show: opening,
    win: champ && big ? 0 : opening,
    escal: big ? 2000 : Math.round(opening * 0.1),
    signBonus: big && value > 150000 ? Math.round(value * 0.5 / 1000) * 1000 : 0,
    champClause: big,
    termDays: big ? 365 * 3 : 365 * 2,
    made: w.day,
    expires: w.day + 14,
    status: "open",
    rounds: 0,
    limit,
    patience: rng.int(1, 3),
    note: opts.note,
    renewal: opts.renewal,
  };
  w.career.contractOffers.push(offer);
  const who = w.career.mode === "manager" ? fullName(f) : "you";
  notify(w, {
    kind: "contract",
    fighter: f.id,
    ref: offer.id,
    from: p.name,
    subject: `${opts.renewal ? "New deal" : "Contract offer"}: ${p.short}`,
    body: `${opts.note ? opts.note + " " : ""}${p.name} offers ${who} ${fights} fights at ${money(offer.show)} to show${offer.win ? ` and ${money(offer.win)} to win` : " (a flat purse)"}, rising ${money(offer.escal)} with each win${offer.signBonus ? `, plus a ${money(offer.signBonus)} signing bonus` : ""}. Negotiate on the Contracts page.`,
    needs: true,
    actions: [
      { id: "sign", label: "Sign", primary: true },
      { id: "negotiate", label: "Negotiate" },
      { id: "reject", label: "Reject", danger: true },
    ],
  });
  return offer;
}

export type CounterResult = { outcome: "accepted" | "countered" | "final" | "walked"; text: string };

export function counterOffer(w: World, rng: Rng, offerId: string, ask: { show: number; win: number; fights: number }): CounterResult {
  const o = w.career.contractOffers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return { outcome: "walked", text: "That offer is gone." };
  o.rounds++;
  const wantTotal = ask.show + ask.win * 0.6;
  const limitTotal = o.limit * (o.win ? 1.6 : 1);
  const curTotal = o.show + o.win * 0.6;
  // More fights on the deal is worth a little to the promotion.
  const fightsFactor = 1 + (ask.fights - o.fights) * 0.03;
  if (wantTotal <= limitTotal * fightsFactor) {
    o.show = ask.show;
    o.win = o.win ? ask.win : 0;
    o.fights = clamp(ask.fights, 1, 8);
    return { outcome: "accepted", text: `${PROMOTIONS[o.promo].short} agrees to those terms. Sign when you're ready.` };
  }
  if (o.patience <= 0) {
    o.status = "withdrawn";
    closeMessages(w, o.id, "Withdrawn");
    return { outcome: "walked", text: `${PROMOTIONS[o.promo].short} has had enough and pulled the offer.` };
  }
  o.patience--;
  const step = (limitTotal - curTotal) * (0.45 + rng.next() * 0.3);
  const newShow = Math.round(Math.min(o.limit, o.show + step / (o.win ? 1.6 : 1)) / 100) * 100;
  o.show = Math.max(o.show, newShow);
  if (o.win) o.win = o.show;
  o.fights = Math.round((o.fights + ask.fights) / 2);
  const final = o.patience === 0;
  return {
    outcome: final ? "final" : "countered",
    text: `${PROMOTIONS[o.promo].short} ${final ? "makes its final offer" : "comes back"}: ${o.fights} fights, ${money(o.show)}${o.win ? ` + ${money(o.win)}` : " flat"}.`,
  };
}

export function signContract(w: World, rng: Rng, offerId: string): string {
  const o = w.career.contractOffers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return "That offer is no longer open.";
  const f = w.fighters[o.fighter];
  if (f.booked && f.promo !== o.promo) return "Finish the fight that is booked first.";
  const old = f.promo;
  if (old && old !== o.promo) {
    // A champion leaving vacates the belt (an interim champion is promoted); an interim champion leaves the interim belt.
    const ps = w.promos[old];
    if (ps.champs[f.div] === f.id || ps.interim[f.div] === f.id) {
      addNews(w, { kind: "title", promo: old, fighters: [f.id], text: `${fullName(f)} vacates the ${PROMOTIONS[old].short} ${ps.champs[f.div] === f.id ? "" : "interim "}title to sign with ${PROMOTIONS[o.promo].short}.` });
      vacate(w, f, "vacated");
    }
  }
  o.status = "accepted";
  f.promo = o.promo;
  f.amateur = PROMOTIONS[o.promo].tier === "amateur";
  if (old !== o.promo) {
    f.joined = w.day;
    f.elo = entryElo(o.promo, ovrOf(f.attrs), f.elo);
  }
  f.contract = {
    promo: o.promo,
    fights: o.fights,
    left: o.fights,
    show: o.show,
    win: o.win,
    escal: o.escal,
    start: w.day,
    end: w.day + o.termDays,
    champClause: o.champClause,
    signBonus: o.signBonus,
  };
  if (o.signBonus) {
    if (w.career.mode === "fighter") ledger(w, { amount: o.signBonus, what: `${PROMOTIONS[o.promo].short} signing bonus`, cat: "bonus", fighter: f.id });
    else ledger(w, { amount: Math.round(o.signBonus * (w.career.agency!.cut / 100)), what: `Commission on ${fullName(f)}'s signing bonus`, cat: "commission", fighter: f.id });
  }
  if (o.promo === "ufc") f.tags = [...new Set([...(f.tags ?? []), "ufc-alum"])];
  // Other offers for the same fighter lapse.
  for (const x of w.career.contractOffers) if (x.fighter === f.id && x.status === "open" && x.id !== o.id) {
    x.status = "withdrawn";
    closeMessages(w, x.id, "Withdrawn");
  }
  closeMessages(w, o.id, "Signed");
  if (PROMOTIONS[o.promo].tier === "major" || PROMOTIONS[o.promo].tier === "league") {
    addNews(w, { kind: "signing", promo: o.promo, fighters: [f.id], text: `${fullName(f)} signs with the ${PROMOTIONS[o.promo].short}${old && old !== o.promo ? ` from ${PROMOTIONS[old].short}` : ""}.` });
  }
  if (w.career.mode === "manager" && w.career.agency) w.career.agency.rep = clamp(w.career.agency.rep + TIER_RANK[PROMOTIONS[o.promo].tier] * 0.6, 0, 100);
  touch(w);
  return `Signed with ${PROMOTIONS[o.promo].name}.`;
}

export function rejectContract(w: World, offerId: string): string {
  const o = w.career.contractOffers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return "";
  o.status = "declined";
  closeMessages(w, o.id, "Rejected");
  const f = w.fighters[o.fighter];
  if (o.renewal && f.promo === o.promo && f.contract && f.contract.left <= 0) {
    // Walking away from the promotion: free agency.
    notify(w, { kind: "contract", fighter: f.id, from: "Manager", subject: "Free agent", body: `${fullName(f)} turned down ${PROMOTIONS[o.promo].short}'s new deal and is a free agent. Other promotions can now make offers.` });
    f.promo = null;
    f.contract = null;
    touch(w);
  }
  return "Offer rejected.";
}

/** Monthly: who wants the player's fighters, and renewals of finished deals. */
export function careerInterest(w: World, rng: Rng): void {
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    if (!f || f.status !== "active") continue;
    if (f.booked) continue;
    const open = w.career.contractOffers.some((o) => o.fighter === f.id && o.status === "open");
    if (open) continue;
    const o = ovr(f.attrs);
    const region = countryOf(f.country).region;
    const tier = f.promo ? PROMOTIONS[f.promo].tier : null;
    const age = (w.day - f.birth) / 365.25;
    // A deal that is done: the promotion's renewal, or free agency.
    if (f.promo && f.contract && f.contract.left <= 0 && tier !== "amateur") {
      const losing = f.streak <= -3 || (f.promo === "ufc" && f.streak <= -2 && f.rec.l > f.rec.w * 0.6);
      if (losing) {
        notify(w, { kind: "contract", fighter: f.id, from: PROMOTIONS[f.promo].name, subject: "Released", body: `${PROMOTIONS[f.promo].short} has decided not to renew ${fullName(f)}'s contract after the recent results. ${fullName(f)} is a free agent.` });
        f.promo = null;
        f.contract = null;
        touch(w);
      } else {
        makeContractOffer(w, rng, f, f.promo, { renewal: true, note: "The contract is done and the promotion wants to keep you." });
        continue;
      }
    }
    // Releases mid-contract after a bad run at the top.
    if (f.promo === "ufc" && f.streak <= -3 && rng.chance(0.6)) {
      notify(w, { kind: "contract", fighter: f.id, from: "UFC", subject: "Released by the UFC", body: `Three losses in a row: the UFC has released ${fullName(f)}. Time to rebuild elsewhere.` });
      f.promo = null;
      f.contract = null;
      touch(w);
    }
    if (!f.promo || !f.contract) {
      // Free agent: offers come at the level the record deserves.
      const target = o >= 74 ? "pfl" : o >= 60 ? promoFor(region, "regional")?.id : o >= 50 && age >= 17 ? promoFor(region, "local")?.id : promoFor(region, "amateur")?.id;
      if (target && rng.chance(0.7)) makeContractOffer(w, rng, f, target as PromoId, { note: "Your manager has found you a home." });
      if (o >= 76 && rng.chance(0.4)) makeContractOffer(w, rng, f, "ufc", { note: "The UFC has seen enough.", rivals: 1 });
      continue;
    }
    // Climbing the ladder: who calls a fighter whose deal allows it.
    if (tier === "amateur") {
      const am = f.am;
      if (age >= 17.5 && am.w >= 4 && am.w >= am.l * 2 && rng.chance(0.45)) {
        const local = promoFor(region, "local") ?? promoFor("na", "local");
        if (local) makeContractOffer(w, rng, f, local.id, { note: "Time to turn pro." });
      }
    } else if (tier === "local") {
      if ((f.rec.w >= 4 && f.streak >= 2 && o >= 55) || isChampion(w, f)) {
        const reg = promoFor(region, "regional");
        if (reg && reg.divisions.includes(f.div) && rng.chance(0.4)) makeContractOffer(w, rng, f, reg.id, { note: "The regional promotion has been watching." });
      }
    } else if (tier === "regional") {
      const champ = isChampion(w, f);
      const defended = w.promos[f.promo!].reigns.some((r) => r.fighter === f.id && r.defenses >= 1 && r.lost === undefined);
      if ((champ && defended && o >= 68) || (f.streak >= 5 && o >= 73)) {
        if (rng.chance(0.35)) makeContractOffer(w, rng, f, "ufc", { note: champ ? "A champion who defends gets the call." : "A run like that gets the call." });
      }
      if ((champ || (f.rec.w >= 8 && f.streak >= 3)) && o >= 64 && rng.chance(0.25)) makeContractOffer(w, rng, f, "pfl", { note: "The PFL wants you on its roster." });
    } else if (f.promo === "pfl" && f.contract.left <= 1 && o >= 78 && rng.chance(0.2)) {
      // The UFC can only talk once the PFL deal is done; here it signals interest.
      notify(w, { kind: "contract", fighter: f.id, from: "Manager", subject: "The UFC is interested", body: `Word is the UFC would make an offer once ${fullName(f)}'s PFL deal runs out.`, read: false });
    }
  }
  // A Contender Series winner gets the UFC's offer.
  const dw = w.career.pendingUfcOffer;
  if (dw) {
    w.career.pendingUfcOffer = undefined;
    const f = w.fighters[dw];
    if (f) makeContractOffer(w, rng, f, "ufc", { note: "Dana White liked what he saw on the Contender Series." });
  }
}

export function hireManager(w: World, f: Fighter, quality: number): string {
  const fc = w.career.fc[f.id];
  if (!fc) return "";
  const cut = quality >= 70 ? 20 : quality >= 45 ? 15 : 10;
  const who = withRng(w, (rng) => managerPerson(rng, f));
  fc.manager = { cut, quality, name: quality >= 70 ? "Elite MMA management" : quality >= 45 ? "Established MMA management" : "Local manager", person: who.person, style: who.style };
  return `Signed with ${who.person} (${fc.manager.name}): ${cut}% of purses and sponsorship.`;
}

export function fireManager(w: World, f: Fighter): void {
  const fc = w.career.fc[f.id];
  if (fc) fc.manager = null;
}

export type { FightOffer };
