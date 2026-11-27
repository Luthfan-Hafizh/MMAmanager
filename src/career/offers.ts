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
import type { BidEnd, ContractOffer, Fact, FightOffer, Fighter, World } from "../model/types";
import { addNews, fullName, nextId, rankOf, touch, isChampion, isInterim, withRng, touchRoster } from "../world/core";
import { dropInterim, vacate } from "../world/titles";
import { promoteInterim, refreshDivision } from "../world/belts";
import { callOff, cancelBout, withdraw } from "../world/matchmaking";
import { signTo } from "../world/results";
import { managerPerson } from "./advisor";
import { entryElo } from "../world/rankings";
import { startCamp } from "./camp";
import { closeMessages, notify } from "./inbox";
import { ledger } from "./money";
import { adjustRapport, applyDecline, dealFactor, passOn, rapport, rapportFacts, type DeclineReason } from "./promoter";
import { arrivalTitleShot, bestReign, longReign, marketPay, perFight, promiseTitle, reignText } from "./standing";
import { tryoutInvites } from "./tryout";

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
  {
    // Saying yes is remembered, stepping in on short notice most of all.
    const them = w.fighters[o.opp];
    const notice = Math.max(0, o.day - w.day);
    if (o.shortNotice && !o.stay) adjustRapport(w, f, o.promo, 6, `Stepped in against ${them.surname} on ${notice} days' notice`);
    else if (o.stay) adjustRapport(w, f, o.promo, 2, `Took ${them.surname} as the new opponent`);
    else adjustRapport(w, f, o.promo, 1, `Took the fight with ${them.surname}`);
  }
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

/**
 * Turn a fight down. With a reason the matchmaker answers (and a fighter worth it
 * who says no to the money hears back with more); without one, or when the offer
 * lapses, the relationship takes a knock. Either way the opponent is off the table
 * for a while. `moved`: the offers fall away with a change of division or gym.
 */
export function declineFight(w: World, offerId: string, auto = false, reason?: DeclineReason | "moved"): string {
  const o = w.career.fightOffers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return "This offer is no longer open.";
  const f = w.fighters[o.fighter];
  const opp = w.fighters[o.opp];
  const p = PROMOTIONS[o.promo];
  let reply = "";
  if (!auto && reason && reason !== "moved") {
    const out = withRng(w, (rng) => applyDecline(w, rng, o, reason));
    if (out.raised) {
      // The same fight for more money: a new message to answer.
      closeMessages(w, o.id, "Asked for more");
      notify(w, {
        kind: "offer",
        fighter: f.id,
        ref: o.id,
        from: `${p.short} matchmaker`,
        subject: `A better number for ${opp.surname}`,
        body: out.reply,
        needs: true,
        actions: [
          { id: "accept", label: "Take it", primary: true },
          { id: "decline", label: "Turn it down", danger: true },
        ],
      });
      touch(w);
      return out.reply;
    }
    reply = out.reply;
  } else if (reason !== "moved" && opp) {
    adjustRapport(w, f, o.promo, auto ? -(o.shortNotice ? 2 : 4) : -3, auto ? `Let the offer to fight ${opp.surname} lapse` : `Turned down ${opp.surname} without a reason`);
    passOn(w, f, opp, o.promo);
  }
  o.status = auto ? "expired" : "declined";
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
  // With a reason, the matchmaker has already set the wait.
  if (fc && !o.shortNotice && !reply) fc.lastAsk = w.day + (o.kind === "title" ? 10 : 14);
  closeMessages(w, o.id, auto ? "Expired" : "Declined");
  if (reply) notify(w, { kind: "info", fighter: f.id, from: `${p.short} matchmaker`, subject: `Re: ${opp.surname}`, body: reply, facts: rapportFacts(w, f, o.promo) });
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
      promoteInterim(w, o.promo, f.div);
      refreshDivision(w, o.promo, f.div);
      notify(w, { kind: "info", fighter: f.id, from: PROMOTIONS[o.promo].short, subject: "Stripped of the title", body: `${fullName(f)} turned down a second title defence. The belt has been vacated.` });
      addNews(w, { kind: "title", promo: o.promo, fighters: [f.id], big: true, text: `${fullName(f)} has been stripped of the ${PROMOTIONS[o.promo].short} title after refusing to defend it.` });
    } else if (!auto) {
      notify(w, { kind: "info", fighter: f.id, from: PROMOTIONS[o.promo].short, subject: "A warning from the matchmaker", body: `The promotion expects its champion to defend. Turn down the next defence and the belt will be taken.` });
    }
  }
  touch(w);
  return auto ? "The offer expired." : reply || "Fight declined.";
}

export function expireOffers(w: World): void {
  for (const o of w.career.fightOffers) if (o.status === "open" && w.day > o.expires) declineFight(w, o.id, true);
  for (const o of w.career.contractOffers) if (o.status === "open" && w.day > o.expires) {
    o.status = "expired";
    recordBid(w, o, "expired");
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

/** How much of what another promotion paid this one will match to sign the fighter. */
function shareOf(from: PromoId, to: PromoId): number {
  if (from === to) return 1;
  // The PFL pays over the odds for a UFC name; the UFC pays less than the PFL did, and the stage makes up the rest.
  if (to === "pfl" && from === "ufc") return 1.1;
  if (to === "ufc" && PROMOTIONS[from].tier === "league") return 0.85;
  return 1;
}

/** A deal here would be a flat purse: a champion's, at the UFC and the PFL. */
function flatFor(w: World, f: Fighter, promo: PromoId): boolean {
  return (promo === "ufc" || promo === "pfl") && f.promo === promo && isChampion(w, f);
}

/** The UFC's and the PFL's deals bind until they are done; the shows below let the bigger ones call. */
export function exclusiveDeal(promo: PromoId | null): boolean {
  const t = promo ? PROMOTIONS[promo].tier : null;
  return t === "major" || t === "league";
}

/**
 * What a promotion thinks a fighter is worth per fight (show money): ability,
 * rank, popularity and form; a title held there or won elsewhere; and what the
 * market has been paying, so a fighter leaving a big deal isn't priced from
 * scratch the day the contract ends.
 */
export function valueOf(w: World, f: Fighter, promo: PromoId): number {
  const p = PROMOTIONS[promo];
  if (p.tier === "amateur") return 0;
  const o = ovrOf(f.attrs);
  const rank = f.promo === promo ? rankOf(w, f) : null;
  const pop = f.pop;
  const run = bestReign(w, f);
  const flat = flatFor(w, f, promo);
  // What the market has been paying: the promotion paying it now pays a little more to
  // keep a fighter in form, another pays its share of it, and a losing run takes some off.
  let market = 0;
  const paid = marketPay(w, f);
  if (paid) {
    const form = f.streak < 0 ? clamp(1 + 0.08 * f.streak, 0.75, 1) : paid.promo === promo && paid.current ? 1.05 : 1;
    market = (perFight(paid.show, paid.win) * shareOf(paid.promo, promo) * form) / (flat ? 1 : 1.6);
  }
  if (promo === "ufc") {
    let v = 12000 + Math.max(0, o - 72) * 2600 + pop * 900 + Math.max(0, f.streak) * 1500;
    if (rank === 0) v = Math.max(v, 450000 + pop * 6000);
    else if (rank !== null) v = Math.max(v, 160000 - rank * 7000 + pop * 1200);
    else if (run && run.promo !== "ufc") {
      // A champion from elsewhere is a signing to sell: the longer the reign, the bigger the name.
      const t = PROMOTIONS[run.promo].tier;
      const keep = run.lostIt ? 0.7 : 1;
      if (t === "league") v = Math.max(v, Math.min(900000, 150000 + run.defences * 20000 + pop * 2000) * keep);
      else if (t === "regional") v = Math.max(v, Math.min(120000, 30000 + run.defences * 6000 + pop * 300) * keep);
    }
    v = Math.max(v, market);
    return Math.round(clamp(v, 12000, 3000000) / 1000) * 1000;
  }
  if (promo === "pfl") {
    let v = 12000 + Math.max(0, o - 64) * 3000 + pop * 1100 + Math.max(0, f.streak) * 1500;
    // Its champion, or the one who left as champion: the face of the promotion.
    if (rank === 0 || (run?.promo === "pfl" && !run.lostIt)) v = Math.max(v, 300000 + (run?.promo === "pfl" ? run.defences : 0) * 15000);
    if (f.promo === "ufc" && rankOf(w, f) !== null) v *= 1.6; // a ranked UFC name is a coup
    v = Math.max(v, market);
    return Math.round(clamp(v, 10000, 2500000) / 1000) * 1000;
  }
  const q = clamp((o - (p.tier === "regional" ? 56 : 48)) / 22, 0, 1);
  let v = p.showLow + (p.showHigh - p.showLow) * (q * 0.6 + Math.min(1, pop / 60) * 0.4);
  if (rank === 0 || isChampion(w, f) || (run?.promo === promo && !run.lostIt)) v *= 1.5;
  // A small show can't pay what the big ones did: it goes to the top of its scale.
  if (market) v = Math.max(v, Math.min(market, p.showHigh * 1.6));
  return Math.round(v / 100) * 100;
}

export interface ContractOpts {
  renewal?: boolean;
  note?: string;
  rivals?: number;
  /** Before the current deal is done: signed, it starts when that deal ends. */
  approach?: boolean;
  /** Answering another promotion's offer: its money a fight, all in, to match. */
  match?: { promo: PromoId; perFight: number };
}

export function makeContractOffer(w: World, rng: Rng, f: Fighter, promo: PromoId, opts: ContractOpts = {}): ContractOffer | null {
  if (w.career.contractOffers.some((o) => o.fighter === f.id && o.promo === promo && o.status === "open")) return null;
  const p = PROMOTIONS[promo];
  const fc = w.career.fc[f.id];
  // The relationship with the promotion moves where its deal opens and how far it will go.
  const rap = rapport(w, f.id, promo);
  const value = valueOf(w, f, promo) * dealFactor(rap);
  const mgr = w.career.mode === "manager" ? 0.08 + (w.career.agency?.rep ?? 20) / 800 : fc?.manager ? 0.06 + fc.manager.quality / 1000 : 0;
  let opening = Math.round((value * (0.82 + rng.next() * 0.1) * (1 + mgr)) / 100) * 100;
  let limit = Math.round(value * (1.12 + mgr + (opts.rivals ?? 0) * 0.08 + rng.next() * 0.12));
  const champ = isChampion(w, f) && f.promo === promo;
  const big = promo === "ufc" || promo === "pfl";
  const flat = champ && big;
  const fights = p.tier === "major" ? (opts.renewal ? rng.int(4, 6) : 4) : p.tier === "league" ? rng.int(3, 4) : rng.int(2, 4);
  let patience = rng.int(1, 3);
  // A promotion coming back starts where it left off: its last offer, moved by the results
  // and the relationship since. Turned down, it adds a touch to get it done and has less
  // patience for haggling; left to lapse, it comes back with the same money. Not a new
  // number from scratch.
  const prev = fc?.bids?.[promo];
  let last: ContractOffer["last"];
  if (prev && prev.how !== "signed" && w.day - prev.day <= 540) {
    const form = clamp(1 + (f.rec.w - prev.w) * 0.04 - (f.rec.l - prev.l) * 0.1, 0.72, 1.2) * (dealFactor(rap) / dealFactor(prev.rap));
    const terms = (x: number) => (x * (prev.win > 0 ? 1.6 : 1) * form) / (flat ? 1 : 1.6);
    const nudge = prev.how === "rejected" ? 1 + rng.next() * 0.05 : 1;
    opening = Math.max(opening, Math.round((terms(prev.show) * nudge) / 100) * 100);
    limit = Math.max(limit, Math.round(terms(prev.limit)));
    if (prev.how === "rejected") patience = Math.max(1, patience - 1);
    last = { show: prev.show, win: prev.win, day: prev.day, how: prev.how };
  }
  // Answering a rival: its money a fight, all in, if the promotion can go that far.
  let matched = false;
  if (opts.match) {
    const need = opts.match.perFight / (flat ? 1 : 1.6);
    if (need <= value * 1.45) {
      matched = true;
      opening = Math.max(opening, Math.round((need * 1.02) / 100) * 100);
      limit = Math.max(limit, Math.round(need * (1.1 + rng.next() * 0.1)));
    } else limit = Math.max(limit, Math.round(value * 1.45));
  }
  limit = Math.max(limit, Math.round(opening * 1.06));
  const offer: ContractOffer = {
    id: nextId(w, "co"),
    fighter: f.id,
    promo,
    fights,
    show: opening,
    win: flat ? 0 : opening,
    escal: big ? 2000 : Math.round(opening * 0.1),
    signBonus: big && value > 150000 ? Math.round(value * 0.5 / 1000) * 1000 : 0,
    champClause: big,
    termDays: big ? 365 * 3 : 365 * 2,
    made: w.day,
    expires: w.day + (opts.approach || opts.match ? 21 : 14),
    status: "open",
    rounds: 0,
    limit,
    patience,
    note: opts.note,
    renewal: opts.renewal,
    approach: opts.approach,
    matches: matched ? opts.match!.promo : undefined,
    last,
  };
  w.career.contractOffers.push(offer);
  const who = w.career.mode === "manager" ? fullName(f) : "you";
  const cur = f.promo && f.contract && f.promo !== promo ? PROMOTIONS[f.promo].short : null;
  const terms = `${fights} fights at ${money(offer.show)} to show${offer.win ? ` and ${money(offer.win)} to win` : " (a flat purse)"}, rising ${money(offer.escal)} with each win${offer.signBonus ? `, plus a ${money(offer.signBonus)} signing bonus` : ""}`;
  const left = f.contract?.left ?? 0;
  const lead =
    opts.approach && cur
      ? `${p.name} wants ${who} when the ${cur} deal is done (${left} fight${left === 1 ? "" : "s"} left). Sign now and the move happens after the last ${cur} fight: `
      : matched
      ? `${p.short} matches the ${PROMOTIONS[opts.match!.promo].short} to keep ${who}: `
      : opts.match
      ? `${p.short} can't go as far as the ${PROMOTIONS[opts.match.promo].short}, but wants to keep ${who}: `
      : `${p.name} offers ${who} `;
  const back = last ? ` Last time ${p.short} offered ${money(last.show)}${last.win ? ` + ${money(last.win)}` : " flat"} (${last.how === "rejected" ? "turned down" : last.how === "expired" ? "left to lapse" : "withdrawn"} ${fmtDate(last.day, { year: false })}); it comes back at that level, moved by the results since.` : "";
  notify(w, {
    kind: "contract",
    fighter: f.id,
    ref: offer.id,
    from: p.name,
    subject: `${opts.approach ? "Approach" : matched ? "Matching offer" : opts.renewal ? "New deal" : last ? "Back with an offer" : "Contract offer"}: ${p.short}`,
    body: `${opts.note ? opts.note + " " : ""}${lead}${terms}.${back} Negotiate on the Contracts page.`,
    needs: true,
    actions: [
      { id: "sign", label: "Sign", primary: true },
      { id: "negotiate", label: "Negotiate" },
      { id: "reject", label: "Reject", danger: true },
    ],
    facts: contractFacts(w, f, offer),
  });
  return offer;
}

/** The numbers that matter in a contract offer, for the message and the Contracts page. */
export function contractFacts(w: World, f: Fighter, o: ContractOffer): Fact[] {
  const facts: Fact[] = [
    { k: "Fights", v: `${o.fights}, over ${Math.round(o.termDays / 365)} years` },
    { k: "Purse", v: o.win ? `${money(o.show)} + ${money(o.win)} to win` : `${money(o.show)} flat` },
    { k: "A fight, all in", v: `About ${money(perFight(o.show, o.win))}` },
  ];
  if (o.signBonus) facts.push({ k: "Signing bonus", v: money(o.signBonus), tone: "good" });
  if (o.approach && f.promo && f.promo !== o.promo && f.contract && f.contract.left > 0) {
    facts.push({ k: "Starts", v: `After the last ${PROMOTIONS[f.promo].short} fight (${f.contract.left} left)` });
  }
  if (o.matches) facts.push({ k: "Matches", v: `The ${PROMOTIONS[o.matches].short}'s offer`, tone: "good" });
  if (o.last) facts.push({ k: "Last time", v: `${money(o.last.show)}${o.last.win ? ` + ${money(o.last.win)}` : " flat"} (${o.last.how === "rejected" ? "turned down" : o.last.how === "expired" ? "lapsed" : "withdrawn"})` });
  const paid = marketPay(w, f);
  if (paid && paid.promo !== o.promo) facts.push({ k: paid.current ? "Paid now" : "Last deal", v: `${PROMOTIONS[paid.promo].short}: ${money(paid.show)}${paid.win ? ` + ${money(paid.win)}` : " flat"}` });
  if (walksAsChampion(w, f, o)) facts.push({ k: "Turning it down", v: `Free agency, and the ${PROMOTIONS[o.promo].short} title is vacated`, tone: "warn" });
  return facts;
}

/** Turning this down ends the deal, and the fighter holds a belt there: it would be vacated. */
export function walksAsChampion(w: World, f: Fighter, o: ContractOffer): boolean {
  return !!o.renewal && f.promo === o.promo && !!f.contract && f.contract.left <= 0 && (isChampion(w, f) || isInterim(w, f));
}

/** Remember how a promotion's offer ended: its next offer starts from there. */
function recordBid(w: World, o: ContractOffer, how: BidEnd): void {
  const fc = w.career.fc[o.fighter];
  const f = w.fighters[o.fighter];
  if (!fc || !f) return;
  (fc.bids ??= {})[o.promo] = { show: o.show, win: o.win, fights: o.fights, limit: o.limit, day: w.day, how, w: f.rec.w, l: f.rec.l, rap: rapport(w, f.id, o.promo) };
}

/** The fighter's other open offers lapse. */
function lapseOthers(w: World, f: Fighter, keep: string): void {
  for (const x of w.career.contractOffers) if (x.fighter === f.id && x.status === "open" && x.id !== keep) {
    x.status = "withdrawn";
    recordBid(w, x, "withdrawn");
    closeMessages(w, x.id, "Withdrawn");
  }
}

export type CounterResult = { outcome: "accepted" | "countered" | "final" | "walked"; text: string };

/**
 * Clauses are for the fighters a big promotion can't do without: a champion, a top-five
 * contender, or a draw (popularity 60+). Elsewhere the deal is the money.
 */
export function clauseLeverage(w: World, f: Fighter, promo: PromoId): boolean {
  if (promo !== "ufc" && promo !== "pfl") return false;
  const r = f.promo === promo ? rankOf(w, f) : null;
  return (r !== null && r <= 5) || f.pop >= 60 || (f.promo !== promo && isChampion(w, f));
}

export function counterOffer(w: World, rng: Rng, offerId: string, ask: { show: number; win: number; fights: number; rematch?: boolean; ppv?: number }): CounterResult {
  const o = w.career.contractOffers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return { outcome: "walked", text: "That offer is gone." };
  o.rounds++;
  const f = w.fighters[o.fighter];
  const wantsClauses = (!!ask.rematch && !o.rematch) || (ask.ppv ?? 0) > (o.ppv ?? 0);
  if (wantsClauses && f && !clauseLeverage(w, f, o.promo)) {
    return { outcome: "countered", text: `${PROMOTIONS[o.promo].short} won't talk about clauses: those are for champions, top-five contenders and the names that sell. The money is still on the table.` };
  }
  // A clause is worth money to the promotion: the rematch about 8% of the deal, each point of the pay-per-view about 6%.
  const clauseCost = 1 + (ask.rematch && !o.rematch ? 0.08 : 0) + Math.max(0, (ask.ppv ?? 0) - (o.ppv ?? 0)) * 0.06;
  const wantTotal = (ask.show + ask.win * 0.6) * clauseCost;
  const limitTotal = o.limit * (o.win ? 1.6 : 1);
  const curTotal = o.show + o.win * 0.6;
  // More fights on the deal is worth a little to the promotion.
  const fightsFactor = 1 + (ask.fights - o.fights) * 0.03;
  if (wantTotal <= limitTotal * fightsFactor) {
    o.show = ask.show;
    o.win = o.win ? ask.win : 0;
    o.fights = clamp(ask.fights, 1, 8);
    if (ask.rematch) o.rematch = true;
    if (ask.ppv) o.ppv = Math.max(o.ppv ?? 0, ask.ppv);
    return { outcome: "accepted", text: `${PROMOTIONS[o.promo].short} agrees to those terms. Sign when you're ready.` };
  }
  if (o.patience <= 0) {
    o.status = "withdrawn";
    recordBid(w, o, "withdrawn");
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

type Terms = Pick<ContractOffer, "fights" | "show" | "win" | "escal" | "signBonus" | "champClause" | "termDays" | "rematch" | "ppv">;

/**
 * The fighter moves to a promotion (or starts a new deal at the same one) on
 * these terms: a belt held at the old one is vacated, the rating starts at the
 * new level, and a signing bonus is paid. Returns the promotion left.
 */
function joinPromotion(w: World, f: Fighter, promo: PromoId, t: Terms): PromoId | null {
  const old = f.promo;
  const fc = w.career.fc[f.id];
  if (old && old !== promo) {
    // A champion leaving vacates the belt (an interim champion is promoted); an interim champion leaves the interim belt.
    const ps = w.promos[old];
    if (ps.champs[f.div] === f.id || ps.interim[f.div] === f.id) {
      addNews(w, { kind: "title", promo: old, fighters: [f.id], big: true, text: `${fullName(f)} vacates the ${PROMOTIONS[old].short} ${ps.champs[f.div] === f.id ? "" : "interim "}title to sign with the ${PROMOTIONS[promo].short}.` });
      vacate(w, f, "vacated");
    }
    if (fc && f.contract && PROMOTIONS[f.contract.promo].tier !== "amateur") fc.lastDeal = { promo: f.contract.promo, show: f.contract.show, win: f.contract.win, ended: w.day };
  }
  f.promo = promo;
  touchRoster(w, f);
  f.amateur = PROMOTIONS[promo].tier === "amateur";
  if (old !== promo) {
    f.joined = w.day;
    f.elo = entryElo(promo, ovrOf(f.attrs), f.elo);
  }
  f.contract = {
    promo,
    fights: t.fights,
    left: t.fights,
    show: t.show,
    win: t.win,
    escal: t.escal,
    start: w.day,
    end: w.day + t.termDays,
    champClause: t.champClause,
    signBonus: t.signBonus,
    rematch: t.rematch,
    ppv: t.ppv,
  };
  if (t.signBonus) {
    if (w.career.mode === "fighter") ledger(w, { amount: t.signBonus, what: `${PROMOTIONS[promo].short} signing bonus`, cat: "bonus", fighter: f.id });
    else ledger(w, { amount: Math.round(t.signBonus * (w.career.agency!.cut / 100)), what: `Commission on ${fullName(f)}'s signing bonus`, cat: "commission", fighter: f.id });
  }
  if (promo === "ufc") f.tags = [...new Set([...(f.tags ?? []), "ufc-alum"])];
  // A champion from a bigger stage goes straight to a title fight here.
  if (old !== promo) {
    const shot = arrivalTitleShot(w, f, promo);
    if (shot) promiseTitle(w, f, promo, shot);
  }
  return old;
}

export function signContract(w: World, rng: Rng, offerId: string): string {
  const o = w.career.contractOffers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return "That offer is no longer open.";
  const f = w.fighters[o.fighter];
  const fc = w.career.fc[f.id];
  const from = f.promo;
  // An exclusive deal still has fights to run: the UFC's approach is signed now and starts when that deal is done.
  if (from && from !== o.promo && f.contract && f.contract.left > 0 && exclusiveDeal(from)) {
    const left = f.contract.left;
    if (!o.approach) return `The ${PROMOTIONS[from].short} deal still has ${left} fight${left === 1 ? "" : "s"} to run.`;
    o.status = "accepted";
    recordBid(w, o, "signed");
    if (fc) fc.next = { promo: o.promo, fights: o.fights, show: o.show, win: o.win, escal: o.escal, signBonus: o.signBonus, champClause: o.champClause, termDays: o.termDays, signed: w.day, rematch: o.rematch, ppv: o.ppv };
    lapseOthers(w, f, o.id);
    closeMessages(w, o.id, "Signed");
    adjustRapport(w, f, from, -6, `Agreed to join the ${PROMOTIONS[o.promo].short} when the deal is done`);
    addNews(w, { kind: "signing", promo: o.promo, fighters: [f.id], big: o.promo === "ufc", text: `${fullName(f)} has agreed to join the ${PROMOTIONS[o.promo].short} when the ${PROMOTIONS[from].short} contract is done${left === 1 ? ", with one fight left on it" : ""}.` });
    touch(w);
    return `Signed: ${fullName(f)} joins the ${PROMOTIONS[o.promo].short} when the ${PROMOTIONS[from].short} deal is done (${left} fight${left === 1 ? "" : "s"} left).`;
  }
  if (f.booked && f.promo !== o.promo) return "Finish the fight that is booked first.";
  void rng;
  o.status = "accepted";
  recordBid(w, o, "signed");
  const old = joinPromotion(w, f, o.promo, o);
  lapseOthers(w, f, o.id);
  closeMessages(w, o.id, "Signed");
  if (PROMOTIONS[o.promo].tier === "major" || PROMOTIONS[o.promo].tier === "league") {
    addNews(w, { kind: "signing", promo: o.promo, fighters: [f.id], text: `${fullName(f)} signs with the ${PROMOTIONS[o.promo].short}${old && old !== o.promo ? ` from ${PROMOTIONS[old].short}` : ""}.` });
  }
  if (w.career.mode === "manager" && w.career.agency) w.career.agency.rep = clamp(w.career.agency.rep + TIER_RANK[PROMOTIONS[o.promo].tier] * 0.6, 0, 100);
  touch(w);
  return `Signed with ${PROMOTIONS[o.promo].name}.`;
}

/**
 * Out of contract with nothing signed: the last deal is remembered for the
 * market, and a belt held at the promotion left is vacated.
 */
function toFreeAgency(w: World, f: Fighter): void {
  const fc = w.career.fc[f.id];
  if (fc && f.contract && PROMOTIONS[f.contract.promo].tier !== "amateur") fc.lastDeal = { promo: f.contract.promo, show: f.contract.show, win: f.contract.win, ended: w.day };
  if (f.promo) {
    const ps = w.promos[f.promo];
    const held = ps.champs[f.div] === f.id ? "" : ps.interim[f.div] === f.id ? "interim " : null;
    if (held !== null) {
      addNews(w, { kind: "title", promo: f.promo, fighters: [f.id], big: true, text: `${fullName(f)} leaves the ${PROMOTIONS[f.promo].short} as ${held}champion, and the ${held}title is vacated.` });
      vacate(w, f, "vacated");
    }
  }
  f.promo = null;
  touchRoster(w, f);
  f.contract = null;
  touch(w);
}

export function rejectContract(w: World, offerId: string): string {
  const o = w.career.contractOffers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return "";
  const f = w.fighters[o.fighter];
  const walks = o.renewal && f.promo === o.promo && f.contract && f.contract.left <= 0;
  const champ = walksAsChampion(w, f, o);
  o.status = "declined";
  recordBid(w, o, "rejected");
  closeMessages(w, o.id, "Rejected");
  if (walks) {
    // Walking away from the promotion: free agency.
    const short = PROMOTIONS[o.promo].short;
    toFreeAgency(w, f);
    notify(w, { kind: "contract", fighter: f.id, from: "Manager", subject: "Free agent", body: `${fullName(f)} turned down ${short}'s new deal and is a free agent${champ ? `, and the ${short} title has been vacated` : ""}. Other promotions can make offers now, and ${short} may come back with about the same money.` });
    return champ ? `Free agent: the ${short} title is vacated.` : "Offer rejected: free agent.";
  }
  return "Offer rejected.";
}

/** Whether the UFC wants a fighter from outside, how keenly, and what it says when it calls. */
function ufcInterest(w: World, f: Fighter): { chance: number; note: string } | null {
  if (f.promo === "ufc" || f.status !== "active") return null;
  if ((w.day - f.birth) / 365.25 > 36) return null;
  // Told no lately: it waits a while before asking again.
  const said = w.career.fc[f.id]?.bids?.ufc;
  if (said && said.how === "rejected" && w.day - said.day < 150) return null;
  const o = ovrOf(f.attrs);
  const run = bestReign(w, f);
  if (run && run.promo !== "ufc" && !run.lostIt) {
    const t = PROMOTIONS[run.promo].tier;
    if (t === "league" && o >= 68) return { chance: 0.75, note: `${reignText(run)}: the UFC wants the best of the ${PROMOTIONS[run.promo].short}.` };
    // A long regional reign skips the Contender Series (Salahdine Parnasse's in KSW); a
    // shorter one goes through it (Bilal Hasan's at Cage Fury), see career/tryout.ts.
    if (t === "regional" && longReign(run) && o >= 70) return { chance: 0.5, note: `${reignText(run)}: a reign like that doesn't need the Contender Series.` };
  }
  if (f.promo && PROMOTIONS[f.promo].tier === "league" && o >= 76 && f.streak >= 2) return { chance: 0.35, note: `A run like that in the ${PROMOTIONS[f.promo].short} gets noticed in Las Vegas.` };
  if (!f.promo && o >= 76) return { chance: 0.4, note: "The UFC has seen enough." };
  return null;
}

/** The current promotion answers a rival's offer: an extension that matches it if it can, or its best. */
function answerRival(w: World, rng: Rng, f: Fighter, rival: ContractOffer): void {
  if (!f.promo || f.promo === rival.promo) return;
  // An open renewal is replaced by the answer.
  for (const x of w.career.contractOffers) if (x.fighter === f.id && x.promo === f.promo && x.status === "open") {
    x.status = "withdrawn";
    recordBid(w, x, "withdrawn");
    closeMessages(w, x.id, "Replaced");
  }
  const short = PROMOTIONS[f.promo].short;
  // The PFL matches; a regional show can't pay UFC money, but asks all the same.
  if (exclusiveDeal(f.promo)) makeContractOffer(w, rng, f, f.promo, { renewal: true, rivals: 1, match: { promo: rival.promo, perFight: perFight(rival.show, rival.win) } });
  else makeContractOffer(w, rng, f, f.promo, { renewal: true, note: `${short} can't pay what the ${PROMOTIONS[rival.promo].short} pays, but wants to keep you.` });
}

/**
 * Monthly: who wants the player's fighters. A deal that is done brings the
 * promotion's renewal (or a release), and the UFC's offer when it wants the
 * fighter; an exclusive deal on its last fight or its last four months brings
 * the UFC's approach and the promotion's answer; free agents hear from the level
 * their record deserves. The regional scene climbs through the Contender Series
 * (career/tryout.ts), the very best signed straight away.
 */
export function careerInterest(w: World, rng: Rng): void {
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    if (!f || f.status !== "active") continue;
    const fc = w.career.fc[f.id];
    // A deal signed for when this one is done: nothing else to talk about.
    if (fc?.next) continue;
    const o = ovr(f.attrs);
    const region = countryOf(f.country).region;
    const tier = f.promo ? PROMOTIONS[f.promo].tier : null;
    const age = (w.day - f.birth) / 365.25;
    const deal = f.promo ? f.contract : null;
    const openFrom = (promo: PromoId) => w.career.contractOffers.some((x) => x.fighter === f.id && x.promo === promo && x.status === "open");
    // The UFC doesn't wait for free agency: an exclusive deal elsewhere on its last fight, or
    // its last four months, and the UFC makes its approach; the promotion answers with a match.
    if (deal && f.promo && f.promo !== "ufc" && exclusiveDeal(f.promo) && deal.left > 0 && (deal.left <= 1 || deal.end - w.day <= 120)) {
      const ufc = ufcInterest(w, f);
      if (ufc && !openFrom("ufc") && rng.chance(ufc.chance)) {
        const rival = makeContractOffer(w, rng, f, "ufc", { approach: true, rivals: 1, note: ufc.note });
        if (rival && f.streak >= -1) answerRival(w, rng, f, rival);
      }
      continue;
    }
    if (f.booked) continue;
    if (w.career.contractOffers.some((x) => x.fighter === f.id && x.status === "open")) continue;
    // A deal that is done: the promotion's renewal or a release, and the UFC's offer when it wants the fighter.
    if (deal && f.promo && deal.left <= 0 && tier !== "amateur") {
      const losing = f.streak <= -3 || (f.promo === "ufc" && f.streak <= -2 && f.rec.l > f.rec.w * 0.6);
      if (losing) {
        notify(w, { kind: "contract", fighter: f.id, from: PROMOTIONS[f.promo].name, subject: "Released", body: `${PROMOTIONS[f.promo].short} has decided not to renew ${fullName(f)}'s contract after the recent results. ${fullName(f)} is a free agent.` });
        toFreeAgency(w, f);
        continue;
      }
      const ufc = f.promo !== "ufc" ? ufcInterest(w, f) : null;
      const rival = ufc && rng.chance(ufc.chance) ? makeContractOffer(w, rng, f, "ufc", { rivals: 1, note: ufc.note }) : null;
      if (rival) answerRival(w, rng, f, rival);
      else makeContractOffer(w, rng, f, f.promo, { renewal: true, note: "The contract is done and the promotion wants to keep you." });
      continue;
    }
    // Releases mid-contract after a bad run at the top.
    if (f.promo === "ufc" && f.streak <= -3 && rng.chance(0.6)) {
      notify(w, { kind: "contract", fighter: f.id, from: "UFC", subject: "Released by the UFC", body: `Three losses in a row: the UFC has released ${fullName(f)}. Time to rebuild elsewhere.` });
      toFreeAgency(w, f);
    }
    if (!f.promo || !f.contract) {
      // Free agent: offers come at the level the record deserves (a promotion that offered
      // before comes back at about the same money), and from the UFC when it wants the fighter.
      const target = (o >= 74 ? "pfl" : o >= 60 ? promoFor(region, "regional")?.id : o >= 50 && age >= 17 ? promoFor(region, "local")?.id : promoFor(region, "amateur")?.id) as PromoId | undefined;
      if (target && rng.chance(0.7)) makeContractOffer(w, rng, f, target, { note: fc?.bids?.[target] ? `${PROMOTIONS[target].short} comes back.` : "Your manager has found you a home." });
      const ufc = ufcInterest(w, f);
      if (ufc && rng.chance(ufc.chance)) makeContractOffer(w, rng, f, "ufc", { note: ufc.note, rivals: target === "pfl" ? 1 : 0 });
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
      // Most of the regional scene reaches the UFC through the Contender Series (the
      // invitations go out each summer); a long reign is signed straight away.
      const ufc = ufcInterest(w, f);
      if (ufc && rng.chance(ufc.chance)) makeContractOffer(w, rng, f, "ufc", { note: ufc.note });
      if ((isChampion(w, f) || (f.rec.w >= 8 && f.streak >= 3)) && o >= 64 && rng.chance(0.25)) makeContractOffer(w, rng, f, "pfl", { note: "The PFL wants you on its roster." });
    }
  }
  // A Contender Series winner gets the UFC's offer.
  const dw = w.career.pendingUfcOffer;
  if (dw) {
    w.career.pendingUfcOffer = undefined;
    const f = w.fighters[dw];
    if (f) makeContractOffer(w, rng, f, "ufc", { note: "Dana White liked what he saw on the Contender Series." });
  }
  tryoutInvites(w, rng);
}

/** Daily: a deal signed for when the current one is done starts the day that one ends. */
export function startSignedDeals(w: World): void {
  for (const id of w.career.fighters) {
    const fc = w.career.fc[id];
    const f = w.fighters[id];
    const n = fc?.next;
    if (!fc || !n || !f || f.status !== "active" || f.booked) continue;
    const c = f.contract;
    if (c && c.promo !== n.promo && c.left > 0 && w.day <= c.end) continue;
    fc.next = undefined;
    const old = joinPromotion(w, f, n.promo, n);
    const to = PROMOTIONS[n.promo].short;
    addNews(w, { kind: "signing", promo: n.promo, fighters: [f.id], big: n.promo === "ufc", text: `${fullName(f)} joins the ${to}${old ? ` from the ${PROMOTIONS[old].short}` : ""}.` });
    notify(w, {
      kind: "contract",
      fighter: f.id,
      from: PROMOTIONS[n.promo].name,
      subject: `Welcome to the ${to}`,
      body: `The ${old ? PROMOTIONS[old].short : "old"} deal is done and the ${to} contract starts today: ${n.fights} fights at ${money(n.show)}${n.win ? ` + ${money(n.win)} to win` : " flat"}${n.signBonus ? `, and the ${money(n.signBonus)} signing bonus is paid` : ""}. The matchmaker will be in touch about a first fight.`,
    });
    touch(w);
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
