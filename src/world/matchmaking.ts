// Matchmaking. Cards are built a few weeks ahead (nine weeks for the UFC):
// title fights first, then ranked fighters against ranked fighters, prospects
// against prospects. The player's fighters are offered fights instead of being
// booked. Fighters get hurt in camp; replacements come in on short notice.

import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { DIVISIONS, type DivisionId } from "../data/divisions";
import { PROMOTIONS, roundsFor, type PromoId } from "../data/promotions";
import { ovrOf } from "../model/attributes";
import type { Bout, BoutKind, FightOffer, Fighter, MMAEvent, World } from "../model/types";
import { addNews, availableFrom, daysSinceFight, fightsInPromo, fullName, isControlled, nextId, rankOf, rosterOf } from "./core";
import { lostToRecently } from "./rankings";
import { setOdds } from "./odds";
import { calloutFor } from "../career/fightweek";
import { notify } from "../career/inbox";
import { fightOfferPay } from "../career/money";
import { fmtDate } from "../core/time";
import { money } from "../core/util";

const DEFENCE_GAP: Record<string, number> = { major: 150, league: 125, regional: 105, local: 95, amateur: 80, tryout: 0 };

/** Rest a fighter wants between fights, a personal figure around the promotion's usual gap. */
function restNeeded(f: Fighter, gap: number): number {
  const h = ((f.id.charCodeAt(f.id.length - 1) * 31 + f.bouts.length * 17) % 100) / 100;
  return Math.round(gap * (0.72 + h * 0.5));
}

export function readyFor(w: World, f: Fighter, ev: MMAEvent, opts: { shortNotice?: boolean } = {}): boolean {
  if (f.status !== "active" || f.booked) return false;
  if (f.promo !== ev.promo && ev.promo !== "dwcs") return false;
  if (f.contract && f.contract.left <= 0 && PROMOTIONS[ev.promo].tier !== "amateur") return false;
  const clear = availableFrom(f);
  if (clear > ev.day - (opts.shortNotice ? 3 : 21)) return false;
  const p = PROMOTIONS[ev.promo];
  const since = f.lastFight === null ? 9999 : ev.day - f.lastFight;
  const need = opts.shortNotice ? 35 : restNeeded(f, p.gap);
  if (since < need) return false;
  return true;
}

function teammates(a: Fighter, b: Fighter): boolean {
  return !!a.gym && a.gym === b.gym;
}

function metRecently(w: World, a: Fighter, b: Fighter, days: number): boolean {
  for (let k = a.bouts.length - 1; k >= 0; k--) {
    const bt = w.bouts[a.bouts[k]];
    if (!bt) continue;
    if (w.day - bt.day > days) break;
    if ((bt.a === b.id || bt.b === b.id) && bt.status === "done") return true;
  }
  return false;
}

export function pairCost(w: World, a: Fighter, b: Fighter, promo: PromoId, rng?: Rng): number {
  if (teammates(a, b)) return 999;
  let c = Math.abs(a.elo - b.elo) / 28;
  const ra = rankOf(w, a);
  const rb = rankOf(w, b);
  if (ra !== null && rb !== null && ra > 0 && rb > 0) c += Math.max(0, Math.abs(ra - rb) - 4) * 1.6;
  else if ((ra !== null) !== (rb !== null)) {
    const r = (ra ?? rb)!;
    const other = ra === null ? a : b;
    if (r > 0 && r <= 10 && other.streak < 3) c += 7;
    else if (r > 0) c += 3;
  }
  if (metRecently(w, a, b, 900)) c += 30;
  else if (metRecently(w, a, b, 3650)) c += 6;
  const newA = fightsInPromo(w, a, promo) < 2;
  const newB = fightsInPromo(w, b, promo) < 2;
  if (newA !== newB) c += 2;
  // Experience: a debutant meets someone with a handful of fights, not a veteran.
  const ea = a.rec.w + a.rec.l + a.rec.d;
  const eb = b.rec.w + b.rec.l + b.rec.d;
  const expGap = Math.abs(Math.log1p(ea) - Math.log1p(eb));
  const tier = PROMOTIONS[promo].tier;
  c += expGap * (tier === "local" || tier === "amateur" ? 7 : tier === "regional" ? 4 : 1.5);
  if (a.streak >= 3 && b.streak <= -2) c += 3;
  if (b.streak >= 3 && a.streak <= -2) c += 3;
  // Regional and local shows match fighters from nearby.
  if ((tier === "local" || tier === "amateur") && a.country !== b.country) c += 0.6;
  if (rng) c += rng.next() * 2.2;
  return c;
}

function bestOpponent(w: World, rng: Rng, f: Fighter, pool: Fighter[], promo: PromoId, exclude: Set<string>): Fighter | null {
  let best: Fighter | null = null;
  let bc = 1e9;
  for (const o of pool) {
    if (o.id === f.id || exclude.has(o.id)) continue;
    const c = pairCost(w, f, o, promo, rng);
    if (c < bc) {
      bc = c;
      best = o;
    }
  }
  return bc < 60 ? best : null;
}

export function makeBout(w: World, ev: MMAEvent, a: Fighter, b: Fighter, kind: BoutKind, opts: { shortNotice?: boolean; pending?: string; why?: string } = {}): Bout {
  const p = PROMOTIONS[ev.promo];
  const title = kind === "title" || kind === "interim" || kind === "vacant";
  const bout: Bout = {
    id: nextId(w, "b"),
    ev: ev.id,
    promo: ev.promo,
    day: ev.day,
    a: a.id,
    b: b.id,
    div: a.div,
    rounds: roundsFor(p, title, false),
    roundSec: p.roundSec,
    kind: p.tier === "amateur" ? (title ? kind : "amateur") : p.tier === "tryout" ? "tryout" : kind,
    order: 99,
    status: "booked",
    shortNotice: opts.shortNotice,
    pending: opts.pending,
    why: opts.why,
  };
  w.bouts[bout.id] = bout;
  ev.bouts.push(bout.id);
  a.booked = bout.id;
  b.booked = bout.id;
  setOdds(w, bout);
  return bout;
}

export function freeBout(w: World, b: Bout): void {
  for (const id of [b.a, b.b]) {
    const f = w.fighters[id];
    if (f && f.booked === b.id) f.booked = null;
  }
}

export function cancelBout(w: World, b: Bout, why: string): void {
  b.status = "cancelled";
  b.why = why;
  freeBout(w, b);
  const ev = w.events[b.ev];
  if (ev) orderCard(w, ev);
}

function importance(w: World, b: Bout): number {
  const fa = w.fighters[b.a];
  const fb = w.fighters[b.b];
  let s = 0;
  if (b.kind === "title" || b.kind === "vacant") s += 2000;
  if (b.kind === "interim") s += 1600;
  if (b.kind === "eliminator") s += 300;
  const ra = rankOf(w, fa);
  const rb = rankOf(w, fb);
  const rs = (r: number | null) => (r === null ? 0 : r === 0 ? 200 : (16 - r) * 12);
  s += rs(ra) + rs(rb);
  s += (fa.pop + fb.pop) * 1.4;
  if (b.status === "cancelled") s -= 5000;
  return s;
}

/** Order a card: title fights head it, cancelled fights go last; five rounds for main events at the top. */
export function orderCard(w: World, ev: MMAEvent): void {
  const done = ev.bouts.some((id) => w.bouts[id]?.status === "done");
  if (done) return;
  const list = ev.bouts.map((id) => w.bouts[id]).filter(Boolean);
  list.sort((x, y) => importance(w, y) - importance(w, x));
  ev.bouts = list.map((b) => b.id);
  const p = PROMOTIONS[ev.promo];
  list.forEach((b, i) => {
    b.order = i;
    const title = b.kind === "title" || b.kind === "interim" || b.kind === "vacant";
    b.rounds = roundsFor(p, title, i === 0 && b.status !== "cancelled");
  });
  if (ev.promo === "ufc" && ev.kind === "fightnight") {
    const main = list.find((b) => b.status !== "cancelled");
    ev.name = main ? `UFC Fight Night: ${w.fighters[main.a].surname} vs. ${w.fighters[main.b].surname}` : "UFC Fight Night";
  }
}

export function bookingPass(w: World, rng: Rng): void {
  for (const id of w.upcoming) {
    const ev = w.events[id];
    if (ev.status !== "planned") continue;
    const p = PROMOTIONS[ev.promo];
    if (w.day < ev.day - p.lead) break;
    buildCard(w, rng, ev);
  }
}

function availableIn(w: World, ev: MMAEvent, d: DivisionId): Fighter[] {
  return rosterOf(w, ev.promo, d).filter((f) => !f.ctrl && readyFor(w, f, ev));
}

function contenderFor(w: World, ev: MMAEvent, d: DivisionId, champ: Fighter, pool: Fighter[]): Fighter | null {
  const ps = w.promos[ev.promo];
  const named = ps.contender[d] ? w.fighters[ps.contender[d]!] : null;
  if (named && pool.includes(named)) return named;
  const ranks = ps.ranks[d] ?? [];
  const limit = PROMOTIONS[ev.promo].rankSize ? 5 : 3;
  for (const id of ranks.slice(0, limit)) {
    const f = w.fighters[id];
    if (!f || !pool.includes(f)) continue;
    if (f.streak < 1) continue;
    if (lostToRecently(w, f, champ.id) && f.streak < 3) continue;
    return f;
  }
  if (!PROMOTIONS[ev.promo].rankSize) {
    // Shows without rankings: the best of the available on a run.
    const c = pool.filter((f) => f.id !== champ.id && f.streak >= 2).sort((a, b) => b.elo - a.elo)[0];
    return c ?? null;
  }
  return null;
}

function titleFights(w: World, rng: Rng, ev: MMAEvent, maxTitles: number): number {
  const p = PROMOTIONS[ev.promo];
  const ps = w.promos[ev.promo];
  let made = 0;
  const divs = rng.shuffle([...p.divisions]);
  for (const d of divs) {
    if (made >= maxTitles) break;
    if ((ev.bouts.length ?? 0) >= p.cardSize) break;
    const champId = ps.champs[d];
    const champ = champId ? w.fighters[champId] : null;
    const pool = rosterOf(w, ev.promo, d).filter((f) => readyFor(w, f, ev));
    if (!champ || champ.status !== "active") {
      // Vacant belt: the best two available.
      const ranked = (ps.ranks[d] ?? []).map((id) => w.fighters[id]).filter((f) => f && pool.includes(f) && !f.ctrl);
      const cands = ranked.length >= 2 ? ranked : pool.filter((f) => !f.ctrl).sort((a, b) => b.elo - a.elo);
      if (cands.length >= 2 && !teammates(cands[0], cands[1])) {
        makeBout(w, ev, cands[0], cands[1], "vacant");
        ps.contender[d] = null;
        made++;
      }
      continue;
    }
    if (champ.ctrl) continue; // offered separately
    const gap = DEFENCE_GAP[p.tier];
    const due = daysSinceFight(w, champ) + (ev.day - w.day) >= gap;
    if (pool.includes(champ) && due) {
      const c = contenderFor(w, ev, d, champ, pool);
      if (c && !c.ctrl && !teammates(c, champ)) {
        makeBout(w, ev, champ, c, "title");
        ps.contender[d] = null;
        made++;
      }
      continue;
    }
    // The champion is out for a long time: an interim belt.
    const out = availableFrom(champ) - ev.day;
    const idle = daysSinceFight(w, champ) + (ev.day - w.day);
    if (!ps.interim[d] && (out > 110 || idle > 330) && p.rankSize) {
      const ranked = (ps.ranks[d] ?? []).map((id) => w.fighters[id]).filter((f) => f && pool.includes(f) && !f.ctrl && f.id !== champ.id);
      if (ranked.length >= 2 && !teammates(ranked[0], ranked[1])) {
        makeBout(w, ev, ranked[0], ranked[1], "interim");
        made++;
      }
    }
  }
  return made;
}

export function buildCard(w: World, rng: Rng, ev: MMAEvent): void {
  const p = PROMOTIONS[ev.promo];
  ev.status = "booked";
  if (ev.promo === "dwcs") {
    buildDwcs(w, rng, ev);
    orderCard(w, ev);
    return;
  }
  const size = ev.kind === "numbered" ? 13 : p.cardSize;
  // Offers to the player's fighters first.
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    if (f && f.promo === ev.promo && wantsOffer(w, f, ev)) offerFight(w, rng, ev, f);
  }
  const maxTitles = ev.kind === "numbered" ? 2 : ev.kind === "fightnight" ? (rng.chance(0.12) ? 1 : 0) : p.tier === "amateur" ? 1 : rng.chance(0.65) ? 1 : 2;
  titleFights(w, rng, ev, maxTitles);
  fillCard(w, rng, ev, size);
  orderCard(w, ev);
}

export function fillCard(w: World, rng: Rng, ev: MMAEvent, size: number): void {
  const p = PROMOTIONS[ev.promo];
  let guard = 0;
  const pools = new Map<DivisionId, Fighter[]>();
  for (const d of p.divisions) pools.set(d, availableIn(w, ev, d));
  while (ev.bouts.filter((id) => w.bouts[id].status !== "cancelled").length < size && guard++ < 60) {
    // Pick a division weighted by how many fighters are waiting there.
    const divs = p.divisions.filter((d) => (pools.get(d)?.length ?? 0) >= 2);
    if (!divs.length) break;
    const d = rng.weighted(divs, (x) => Math.pow(pools.get(x)!.length, 1.1));
    const pool = pools.get(d)!;
    // The one who has waited longest goes first.
    pool.sort((x, y) => daysSinceFight(w, y) - daysSinceFight(w, x));
    const f = pool[rng.chance(0.75) ? 0 : Math.min(pool.length - 1, rng.int(1, 3))];
    const o = bestOpponent(w, rng, f, pool, ev.promo, new Set());
    if (!o) {
      pool.splice(pool.indexOf(f), 1);
      continue;
    }
    const ra = rankOf(w, f);
    const rb = rankOf(w, o);
    const elim = p.rankSize && ra !== null && rb !== null && ra > 0 && rb > 0 && ra <= 5 && rb <= 5 && f.streak >= 2 && o.streak >= 2;
    makeBout(w, ev, f, o, elim ? "eliminator" : "regular");
    pool.splice(pool.indexOf(f), 1);
    pool.splice(pool.indexOf(o), 1);
  }
}

/** Ten weeks of tryouts: the best prospects from the regional scene, one fight for a UFC deal. */
function buildDwcs(w: World, rng: Rng, ev: MMAEvent): void {
  const cands = Object.values(w.fighters).filter((f) => {
    if (f.status !== "active" || f.booked || f.ctrl) return false;
    if (!f.promo || !["regional", "local", "league"].includes(PROMOTIONS[f.promo].tier)) return false;
    if (f.promo === "pfl") return false;
    if (f.tags?.includes("ufc-alum")) return false;
    const age = (w.day - f.birth) / 365.25;
    if (age > 32 || f.rec.w < 4) return false;
    if (f.rec.l > Math.max(2, f.rec.w / 3)) return false;
    if (availableFrom(f) > ev.day - 21) return false;
    if (f.lastFight !== null && ev.day - f.lastFight < 49) return false;
    return ovrOf(f.attrs) >= 64;
  });
  cands.sort((a, b) => ovrOf(b.attrs) + b.streak - (ovrOf(a.attrs) + a.streak));
  const pool = cands.slice(0, 60);
  const byDiv = new Map<DivisionId, Fighter[]>();
  for (const f of pool) {
    let l = byDiv.get(f.div);
    if (!l) byDiv.set(f.div, (l = []));
    l.push(f);
  }
  // A player's fighter with the record for it gets an invitation.
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    if (!f || f.booked || !f.promo || !["regional", "local"].includes(PROMOTIONS[f.promo].tier)) continue;
    if (f.rec.w < 5 || f.streak < 2 || ovrOf(f.attrs) < 62) continue;
    if (w.career.fightOffers.some((o) => o.fighter === f.id && o.status === "open")) continue;
    if (f.lastFight !== null && ev.day - f.lastFight < 49) continue;
    if (rng.chance(0.5)) continue;
    const opps = (byDiv.get(f.div) ?? []).filter((o) => !o.booked);
    const o = opps[0];
    if (o) offerFight(w, rng, ev, f, o, "tryout");
  }
  let n = 0;
  for (const [, list] of byDiv) {
    while (list.length >= 2 && ev.bouts.length < 5 && n < 8) {
      const a = list.shift()!;
      const j = list.findIndex((x) => !teammates(a, x) && !x.booked);
      if (j < 0) break;
      const b = list.splice(j, 1)[0];
      if (a.booked || b.booked) continue;
      makeBout(w, ev, a, b, "tryout");
      n++;
    }
    if (ev.bouts.length >= 5) break;
  }
}

// ---------- the player's fighters ----------

export function wantsOffer(w: World, f: Fighter, ev: MMAEvent): boolean {
  if (f.booked) return false;
  if (w.career.fightOffers.some((o) => o.fighter === f.id && o.status === "open")) return false;
  if (!readyFor(w, f, ev)) return false;
  const fc = w.career.fc[f.id];
  if (fc?.lastAsk && w.day < fc.lastAsk) return false; // cooling off after a refusal
  return true;
}

export function offerFight(w: World, rng: Rng, ev: MMAEvent, f: Fighter, opp?: Fighter, kind?: BoutKind, shortNotice = false, replace?: Bout): FightOffer | null {
  const p = PROMOTIONS[ev.promo];
  const ps = w.promos[ev.promo];
  const d = f.div;
  let k: BoutKind = kind ?? "regular";
  let o = opp ?? null;
  if (!o) {
    const pool = rosterOf(w, ev.promo, d).filter((x) => x.id !== f.id && !x.ctrl && readyFor(w, x, ev, { shortNotice }));
    const champ = ps.champs[d];
    if (champ === f.id) {
      // A champion's defence.
      const due = daysSinceFight(w, f) + (ev.day - w.day) >= DEFENCE_GAP[p.tier] - 20;
      if (!due) return null;
      o = contenderFor(w, ev, d, f, pool);
      k = "title";
    } else if (champ && ps.contender[d] === f.id) {
      const c = w.fighters[champ];
      if (c && !c.ctrl && readyFor(w, c, ev)) {
        o = c;
        k = "title";
      }
    } else if (!champ && (ps.ranks[d] ?? []).slice(0, 2).includes(f.id)) {
      const other = (ps.ranks[d] ?? []).slice(0, 3).map((id) => w.fighters[id]).find((x) => x && x.id !== f.id && pool.includes(x));
      if (other) {
        o = other;
        k = "vacant";
      }
    }
    if (!o) {
      // A call-out the matchmaker likes the sound of.
      const c = calloutFor(w, f);
      const t = c ? w.fighters[c] : null;
      if (t && pool.includes(t) && !teammates(f, t)) {
        const rf = rankOf(w, f);
        const rt = rankOf(w, t);
        const gap = (rf ?? 18) - (rt ?? 18);
        if (rng.chance(gap > 8 ? 0.2 : gap > 4 ? 0.5 : 0.75)) o = t;
      }
    }
    if (!o) o = bestOpponent(w, rng, f, pool, ev.promo, new Set());
  }
  if (!o) return null;
  if (k === "regular" && p.rankSize) {
    const rf = rankOf(w, f);
    const ro = rankOf(w, o);
    if (rf !== null && ro !== null && rf > 0 && ro > 0 && rf <= 5 && ro <= 5) k = "eliminator";
  }
  const bout = replace ?? makeBout(w, ev, f, o, k, { shortNotice, pending: "x" });
  if (replace) {
    // A replacement spot: the player's fighter steps in.
    if (replace.a === "") replace.a = f.id;
    f.booked = replace.id;
    replace.pending = "x";
  }
  const pay = fightOfferPay(w, f, ev.promo, shortNotice);
  const offer: FightOffer = {
    id: nextId(w, "fo"),
    fighter: f.id,
    promo: ev.promo,
    opp: o.id,
    ev: ev.id,
    day: ev.day,
    div: d,
    rounds: bout.rounds,
    kind: bout.kind,
    show: pay.show,
    win: pay.win,
    shortNotice,
    made: w.day,
    expires: Math.min(ev.day - 10, w.day + (shortNotice ? 2 : 5)),
    status: "open",
  };
  bout.pending = offer.id;
  w.career.fightOffers.push(offer);
  const kindText = bout.kind === "title" ? "a title fight" : bout.kind === "vacant" ? "a fight for the vacant title" : bout.kind === "interim" ? "an interim title fight" : bout.kind === "tryout" ? "a Contender Series fight" : shortNotice ? "a short-notice fight" : "a fight";
  notify(w, {
    kind: "offer",
    fighter: f.id,
    ref: offer.id,
    from: `${p.short} matchmaker`,
    subject: `${p.short} offer: ${fullName(o)}${bout.kind === "title" ? " (title)" : ""}`,
    body: `${p.name} offers ${f.ctrl && w.career.mode === "manager" ? fullName(f) : "you"} ${kindText} against ${fullName(o)} (${o.rec.w}-${o.rec.l}${o.rec.d ? `-${o.rec.d}` : ""}) at ${ev.name} on ${fmtDate(ev.day)} in ${ev.city}. ${bout.rounds} rounds. ${pay.show ? `Purse: ${money(pay.show)} to show${pay.win ? ` and ${money(pay.win)} to win` : ""}.` : "Amateur bout: no purse."}`,
    needs: true,
    actions: [
      { id: "accept", label: "Accept", primary: true },
      { id: "decline", label: "Decline", danger: true },
    ],
  });
  return offer;
}

/** A fighter is out of a booked fight: find a replacement or scrap it. */
export function withdraw(w: World, rng: Rng, b: Bout, outId: string, why: string): void {
  const ev = w.events[b.ev];
  const out = w.fighters[outId];
  const stayId = b.a === outId ? b.b : b.a;
  const stay = w.fighters[stayId];
  if (out.booked === b.id) out.booked = null;
  if (!ev || ev.status === "done") return;
  const days = ev.day - w.day;
  // The player's fighter is the one pulling out: the opponent may get a new name.
  const pool = rosterOf(w, ev.promo, b.div).filter((x) => x.id !== stayId && x.id !== outId && readyFor(w, x, ev, { shortNotice: true }));
  // A player's fighter in the division willing to take short notice gets the call first.
  const playerSub = pool.find((x) => x.ctrl && w.career.fc[x.id]?.shortNotice && !w.career.fightOffers.some((o) => o.fighter === x.id && o.status === "open"));
  if (playerSub && days >= 5 && !stay.ctrl) {
    if (b.a === outId) b.a = playerSub.id;
    else b.b = playerSub.id;
    b.replaced = outId;
    b.shortNotice = true;
    playerSub.booked = b.id;
    setOdds(w, b);
    offerFight(w, rng, ev, playerSub, stay, b.kind === "title" ? "title" : b.kind, true, b);
    addNews(w, { kind: "booking", promo: ev.promo, fighters: [outId], text: `${fullName(out)} is out of ${ev.name} (${why}).` });
    return;
  }
  const sub = days >= 4 ? bestOpponent(w, rng, stay, pool.filter((x) => !x.ctrl), ev.promo, new Set()) : null;
  const titleFight = b.kind === "title" || b.kind === "interim" || b.kind === "vacant";
  if (sub && (!titleFight || rankOf(w, sub) !== null)) {
    if (b.a === outId) b.a = sub.id;
    else b.b = sub.id;
    b.replaced = outId;
    b.shortNotice = true;
    sub.booked = b.id;
    setOdds(w, b);
    if (titleFight && w.promos[ev.promo].champs[b.div] === outId) b.kind = "interim";
    addNews(w, { kind: "booking", promo: ev.promo, fighters: [outId, sub.id, stayId], text: `${fullName(out)} is out of ${ev.name} (${why}). ${fullName(sub)} steps in on short notice against ${fullName(stay)}.` });
    if (stay.ctrl) {
      notify(w, { kind: "camp", fighter: stay.id, from: `${PROMOTIONS[ev.promo].short} matchmaker`, subject: `New opponent: ${fullName(sub)}`, body: `${fullName(out)} has pulled out (${why}). ${fullName(sub)} (${sub.rec.w}-${sub.rec.l}) takes the fight on short notice. Same date, same card.` });
    }
    orderCard(w, ev);
    return;
  }
  cancelBout(w, b, `${fullName(out)} withdrew (${why})`);
  if (ev.promo === "ufc" || PROMOTIONS[ev.promo].tier !== "amateur") {
    addNews(w, { kind: "booking", promo: ev.promo, fighters: [outId, stayId], text: `${fullName(out)} vs. ${fullName(stay)} is off ${ev.name}: ${fullName(out)} withdrew (${why}).` });
  }
  if (stay.ctrl) {
    notify(w, { kind: "camp", fighter: stay.id, from: `${PROMOTIONS[ev.promo].short} matchmaker`, subject: "Your fight is off", body: `${fullName(out)} has withdrawn (${why}) and there was no replacement in time. Your camp is over; the matchmaker will be in touch about the next date.` });
    const fc = w.career.fc[stay.id];
    if (fc) fc.camp = null;
  }
}

/** Camp injuries for the AI: about one booked fight in ten falls through. */
export function campInjuries(w: World, rng: Rng): void {
  for (const id of w.upcoming) {
    const ev = w.events[id];
    if (ev.day - w.day > 70) break;
    if (ev.status !== "booked" || ev.day <= w.day) continue;
    for (const bid of [...ev.bouts]) {
      const b = w.bouts[bid];
      if (!b || b.status !== "booked" || b.pending) continue;
      for (const fid of [b.a, b.b]) {
        const f = w.fighters[fid];
        if (!f || f.ctrl) continue;
        const p = 0.00155 * (f.hid.injuryProne / 9);
        if (rng.chance(p)) {
          const days = rng.chance(0.2) ? rng.int(60, 200) : rng.int(21, 56);
          f.injury = { name: rng.pick(["knee injury", "hand injury", "back injury", "rib injury", "illness", "shoulder injury", "ankle injury"]), area: "body", until: w.day + days, severity: days > 60 ? 2 : 1, from: "training" };
          withdraw(w, rng, b, fid, f.injury.name);
          break;
        }
      }
    }
  }
}

/** Gaps on a card (after cancellations) are filled up to a week before. */
export function fillGaps(w: World, rng: Rng): void {
  for (const id of w.upcoming) {
    const ev = w.events[id];
    if (ev.status !== "booked") continue;
    const days = ev.day - w.day;
    if (days < 7) continue;
    if (days > PROMOTIONS[ev.promo].lead) break;
    if (ev.promo === "dwcs") continue;
    const size = ev.kind === "numbered" ? 13 : PROMOTIONS[ev.promo].cardSize;
    const live = ev.bouts.filter((b) => w.bouts[b].status !== "cancelled").length;
    if (live < size - 1 && rng.chance(0.35)) {
      fillCard(w, rng, ev, size);
      orderCard(w, ev);
    }
  }
}

export function divisionDepth(w: World, promo: PromoId, d: DivisionId): number {
  return rosterOf(w, promo, d).length;
}

export function hypeOf(w: World, f: Fighter): number {
  return clamp(f.pop + Math.max(0, f.streak) * 4 + (rankOf(w, f) !== null ? 10 : 0), 0, 100);
}

export { DEFENCE_GAP, DIVISIONS };
