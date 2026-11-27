// Matchmaking. Cards are built a few weeks ahead (nine weeks for the UFC):
// title fights first, then ranked fighters against ranked fighters, prospects
// against prospects. The player's fighters are offered fights instead of being
// booked. Fighters get hurt in camp; replacements come in on short notice.

import { storyBooked, storyPull } from "./stories";
import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { DIVISIONS, neighbourDivisions, type DivisionId } from "../data/divisions";
import { PROMOTIONS, roundsFor, type PromoId } from "../data/promotions";
import { ovrOf } from "../model/attributes";
import type { Bout, BoutKind, Fact, FightOffer, Fighter, MMAEvent, World } from "../model/types";
import { addNews, availableFrom, daysSinceFight, fullName, isControlled, nextId, otherRanks, rankIn, rankLabel, rankOf, rosterOf, stageFights } from "./core";
import { lostToRecently, ratingFor } from "./rankings";
import { tryoutProspect } from "./market";
import { clearWant, nextWant, passedOn, snubbed } from "../career/promoter";
import { setOdds } from "./odds";
import { calloutFor } from "../career/fightweek";
import { grudgeBonus, heatOf, rivalsOf } from "../career/rivals";
import { makeInjury, trainingInjury } from "../data/injuries";
import { beltBooked, beltKindFor, bmfPairing, isBeltFight, refreshBelt, stakeLabel, stakeOf } from "./belts";
import { notify } from "../career/inbox";
import { fightOfferPay, payShowOnly } from "../career/money";
import { boutLimit, CUT_TEXT, cutCheck, findCall, type Call } from "../career/shortnotice";
import { fmtDate } from "../core/time";
import { money } from "../core/util";
import { debutBand, waitingForTitle, type DebutBand } from "../career/standing";
import { bookTryouts, tryoutHold } from "../career/tryout";

const DEFENCE_GAP: Record<string, number> = { major: 140, league: 125, regional: 105, local: 95, amateur: 80, tryout: 0 };

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
  // The first weeks of a new world: the fighters on these cards were already in camp
  // when it began, so the cards fill like short-notice ones instead of running empty.
  const early = ev.day - w.start < 42;
  if (clear > ev.day - (opts.shortNotice || early ? 3 : 21)) return false;
  const p = PROMOTIONS[ev.promo];
  const since = f.lastFight === null ? 9999 : ev.day - f.lastFight;
  const need = opts.shortNotice ? 35 : early ? Math.min(35, restNeeded(f, p.gap)) : restNeeded(f, p.gap);
  if (since < need) return false;
  return true;
}

function teammates(a: Fighter, b: Fighter): boolean {
  return !!a.gym && a.gym === b.gym;
}

export function metRecently(w: World, a: Fighter, b: Fighter, days: number): boolean {
  for (let k = a.bouts.length - 1; k >= 0; k--) {
    const bt = w.bouts[a.bouts[k]];
    if (!bt) continue;
    if (w.day - bt.day > days) break;
    if ((bt.a === b.id || bt.b === b.id) && bt.status === "done") return true;
  }
  return false;
}

/**
 * A fighter on a run is matched up: the matchmaker looks higher for the next
 * opponent, about twenty rating points a win at the top level. Only wins on
 * this stage count in full, so a regional record buys a newcomer one step.
 */
export function stepUp(f: Fighter, inPromo: number, tier: string): number {
  const run = Math.min(f.streak, inPromo + 2, 6);
  if (run < 2) return 0;
  return run * (tier === "major" || tier === "league" ? 22 : 15);
}

/**
 * The rating a matchmaker books a fighter at. Rising talent gets noticed in the
 * gym and on tape before the results catch up, so a prospect who has outgrown
 * the rating is matched up sooner; a fading veteran is still booked on the
 * name until the losses show it.
 */
export function bookedAt(f: Fighter, tier: string): number {
  return f.elo + Math.max(0, ratingFor(tier, ovrOf(f.attrs)) - f.elo) * 0.5;
}

export function pairCost(w: World, a: Fighter, b: Fighter, promo: PromoId, rng?: Rng): number {
  if (teammates(a, b)) return 999;
  // Not again so soon, storyline or not: a rematch waits out the suspensions and a camp.
  if (metRecently(w, a, b, 120)) return 999;
  const tier = PROMOTIONS[promo].tier;
  const na = stageFights(w, a, promo);
  const nb = stageFights(w, b, promo);
  // The ideal opponent for a fighter on a run is rated a little higher.
  let c = Math.abs(bookedAt(a, tier) - bookedAt(b, tier) + stepUp(a, na, tier) - stepUp(b, nb, tier)) / 28;
  const ra = rankOf(w, a);
  const rb = rankOf(w, b);
  if (ra !== null && rb !== null && ra > 0 && rb > 0) c += Math.max(0, Math.abs(ra - rb) - 4) * 1.6;
  else if ((ra !== null) !== (rb !== null)) {
    const r = (ra ?? rb)!;
    const other = ra === null ? a : b;
    if (r > 0 && r <= 10 && other.streak < 3) c += 7;
    else if (r > 0) c += other.streak >= 3 ? 1.5 : 3;
  }
  const story = storyPull(w, a.id, b.id);
  if (story) c += story;
  else if (metRecently(w, a, b, 900)) c += 30;
  else if (metRecently(w, a, b, 3650)) c += 6;
  const newA = na < 2;
  const newB = nb < 2;
  if (newA !== newB) c += 2;
  // Experience: a debutant meets someone with a handful of fights, not a veteran.
  const ea = a.rec.w + a.rec.l + a.rec.d;
  const eb = b.rec.w + b.rec.l + b.rec.d;
  const expGap = Math.abs(Math.log1p(ea) - Math.log1p(eb));
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

/**
 * A newcomer with a name made elsewhere meets a ranked fighter first time out:
 * the best fit in the band of the rankings the record earned, then a little
 * wider, then anyone ranked.
 */
function debutOpponent(w: World, rng: Rng, f: Fighter, pool: Fighter[], promo: PromoId, band: DebutBand): Fighter | null {
  const n = PROMOTIONS[promo].rankSize;
  const bands: [number, number][] = [[band.lo, band.hi], [Math.max(1, band.lo - 2), Math.min(n, band.hi + 3)], [1, n]];
  for (const [lo, hi] of bands) {
    const fits = pool.filter((x) => {
      const r = rankOf(w, x);
      return r !== null && r >= lo && r <= hi;
    });
    const o = bestOpponent(w, rng, f, fits, promo, new Set());
    if (o) return o;
  }
  return null;
}

export function makeBout(w: World, ev: MMAEvent, a: Fighter, b: Fighter, kind: BoutKind, opts: { shortNotice?: boolean; pending?: string; why?: string; div?: DivisionId } = {}): Bout {
  const p = PROMOTIONS[ev.promo];
  const div = opts.div ?? a.div;
  // A champion's fight at the weight is for the belt, however it was made.
  kind = beltKindFor(w, ev.promo, div, a.id, b.id, kind);
  const title = kind === "title" || kind === "interim" || kind === "vacant";
  const bout: Bout = {
    id: nextId(w, "b"),
    ev: ev.id,
    promo: ev.promo,
    day: ev.day,
    a: a.id,
    b: b.id,
    div,
    rounds: roundsFor(p, title, false),
    roundSec: p.roundSec,
    kind: p.tier === "amateur" ? (title ? kind : "amateur") : p.tier === "tryout" ? "tryout" : kind,
    order: 99,
    status: "booked",
    shortNotice: opts.shortNotice,
    pending: opts.pending,
    why: opts.why,
  };
  bout.stake = stakeOf(w, bout);
  w.bouts[bout.id] = bout;
  ev.bouts.push(bout.id);
  a.booked = bout.id;
  b.booked = bout.id;
  setOdds(w, bout);
  storyBooked(w, ev, bout);
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
  if (b.kind === "bmf") s += 1800;
  if (b.kind === "interim") s += 1600;
  if (b.kind === "eliminator") s += 300;
  const ra = rankOf(w, fa);
  const rb = rankOf(w, fb);
  const rs = (r: number | null) => (r === null ? 0 : r === 0 ? 200 : (16 - r) * 12);
  s += rs(ra) + rs(rb);
  s += (fa.pop + fb.pop) * 1.4;
  // Bad blood sells: a grudge match moves up the card.
  s += heatOf(w, fa.id, fb.id) * 5;
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
    // Title fights and the BMF go five rounds wherever they sit on the card.
    const title = isBeltFight(b);
    b.rounds = roundsFor(p, title, i === 0 && b.status !== "cancelled");
  });
  if (ev.promo === "ufc" && ev.kind === "fightnight") {
    const main = list.find((b) => b.status !== "cancelled");
    ev.name = main ? `UFC Fight Night: ${w.fighters[main.a].surname} vs. ${w.fighters[main.b].surname}` : "UFC Fight Night";
  }
}

/** What every fight on a card is for, as the belts stand now; the card is reordered if anything changed. */
export function refreshCard(w: World, ev: MMAEvent): void {
  let moved = false;
  for (const id of ev.bouts) {
    const b = w.bouts[id];
    if (b && refreshBelt(w, b)) moved = true;
  }
  if (moved) orderCard(w, ev);
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

/**
 * Fighters free for an ordinary fight: champions and interim champions fight only
 * for their belts, and a champion from a bigger stage waits for the title fight promised.
 */
function availableIn(w: World, ev: MMAEvent, d: DivisionId): Fighter[] {
  const ps = w.promos[ev.promo];
  return rosterOf(w, ev.promo, d).filter((f) => !f.ctrl && f.id !== ps.champs[d] && f.id !== ps.interim[d] && readyFor(w, f, ev) && !waitingForTitle(w, f));
}

/** Has a belt holder waited well past the usual gap between defences? */
function keptWaiting(w: World, ev: MMAEvent, f: Fighter): boolean {
  return daysSinceFight(w, f) + (ev.day - w.day) >= DEFENCE_GAP[PROMOTIONS[ev.promo].tier] * 1.6;
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
    if (c) return c;
  }
  // A champion kept waiting gets the best challenger available: champions don't
  // take non-title fights, so the promotion finds them one.
  if (keptWaiting(w, ev, champ)) {
    const ranked = ranks.slice(0, limit * 2).map((id) => w.fighters[id]).find((f) => f && f.id !== champ.id && pool.includes(f) && f.streak >= 0 && !lostToRecently(w, f, champ.id));
    if (ranked) return ranked;
    return pool.filter((f) => f.id !== champ.id && f.streak >= 1 && !lostToRecently(w, f, champ.id)).sort((a, b) => b.elo - a.elo)[0] ?? null;
  }
  return null;
}

function titleFights(w: World, rng: Rng, ev: MMAEvent, maxTitles: number): number {
  const p = PROMOTIONS[ev.promo];
  const ps = w.promos[ev.promo];
  let made = 0;
  // The belt that has waited longest goes first: a champion by the days since the last fight, a vacant belt by the days it has been vacant.
  const waited = (d: DivisionId) => {
    const c = ps.champs[d] ? w.fighters[ps.champs[d]!] : null;
    if (c) return daysSinceFight(w, c);
    let last = -1;
    for (const r of ps.reigns) if (r.div === d && !r.interim && r.lost !== undefined && r.lost > last) last = r.lost;
    return last < 0 ? 400 : w.day - last;
  };
  const divs = rng.shuffle([...p.divisions]).sort((x, y) => waited(y) - waited(x));
  for (const d of divs) {
    if (made >= maxTitles) break;
    if ((ev.bouts.length ?? 0) >= p.cardSize) break;
    const champId = ps.champs[d];
    const champ = champId ? w.fighters[champId] : null;
    const pool = rosterOf(w, ev.promo, d).filter((f) => readyFor(w, f, ev));
    if (!champ || champ.status !== "active") {
      // Vacant belt: the best two available (one fight for it at a time). A champion from a
      // bigger stage promised the title takes one place.
      if (beltBooked(w, ev.promo, d, "vacant")) continue;
      const ranked = (ps.ranks[d] ?? []).map((id) => w.fighters[id]).filter((f) => f && pool.includes(f) && !f.ctrl);
      let cands = ranked.length >= 2 ? ranked : pool.filter((f) => !f.ctrl).sort((a, b) => b.elo - a.elo);
      const named = ps.contender[d] ? w.fighters[ps.contender[d]!] : null;
      if (named && waitingForTitle(w, named)) {
        if (named.ctrl) continue; // the player's fighter is offered it instead
        if (pool.includes(named)) cands = [named, ...cands.filter((x) => x.id !== named.id && !teammates(x, named))];
      }
      if (cands.length >= 2 && !teammates(cands[0], cands[1])) {
        makeBout(w, ev, cands[0], cands[1], "vacant");
        ps.contender[d] = null;
        made++;
      }
      continue;
    }
    if (champ.ctrl) {
      // The player's defences are offered separately. A player champion out
      // injured who chose to keep the belt gets an interim title made meanwhile.
      const hold = w.career.fc[champ.id]?.hold;
      const out = availableFrom(champ) - ev.day;
      if (hold && hold.promo === ev.promo && hold.div === d && !ps.interim[d] && out > 60 && p.rankSize && !beltBooked(w, ev.promo, d, "interim")) {
        const ranked = (ps.ranks[d] ?? []).map((id) => w.fighters[id]).filter((f) => f && pool.includes(f) && !f.ctrl && f.id !== champ.id);
        if (ranked.length >= 2 && !teammates(ranked[0], ranked[1])) {
          makeBout(w, ev, ranked[0], ranked[1], "interim");
          made++;
        }
      } else if (ps.interim[d] && out > 120 && interimDefence(w, ev, d, champ, pool)) made++;
      continue;
    }
    const gap = DEFENCE_GAP[p.tier];
    const due = daysSinceFight(w, champ) + (ev.day - w.day) >= gap;
    if (pool.includes(champ) && due) {
      // With an interim champion, the champion's next fight unifies the belts: the
      // champion waits for the interim champion, unless they're out a long time.
      const ic = ps.interim[d] ? w.fighters[ps.interim[d]!] : null;
      const unify = ic && ic.status === "active" && ic.promo === ev.promo && !teammates(ic, champ) ? ic : null;
      let c: Fighter | null = null;
      if (!unify) c = contenderFor(w, ev, d, champ, pool.filter((x) => x.id !== ic?.id));
      else if (pool.includes(unify)) c = unify.ctrl ? null : unify; // the player's interim champion is offered it instead
      else if (availableFrom(unify) - ev.day > 90) c = contenderFor(w, ev, d, champ, pool.filter((x) => x.id !== unify.id));
      if (c && !c.ctrl && !teammates(c, champ)) {
        makeBout(w, ev, champ, c, "title");
        ps.contender[d] = null;
        made++;
      }
      continue;
    }
    // The champion is out for a long time: an interim belt, and the interim champion defends it.
    const out = availableFrom(champ) - ev.day;
    const idle = daysSinceFight(w, champ) + (ev.day - w.day);
    if (!ps.interim[d] && (out > 110 || idle > 330) && p.rankSize && !beltBooked(w, ev.promo, d, "interim")) {
      const ranked = (ps.ranks[d] ?? []).map((id) => w.fighters[id]).filter((f) => f && pool.includes(f) && !f.ctrl && f.id !== champ.id);
      if (ranked.length >= 2 && !teammates(ranked[0], ranked[1])) {
        makeBout(w, ev, ranked[0], ranked[1], "interim");
        made++;
      }
    } else if (ps.interim[d] && out > 120 && interimDefence(w, ev, d, champ, pool)) made++;
  }
  return made;
}

/** An interim champion defends the interim belt while the champion is out. */
function interimDefence(w: World, ev: MMAEvent, d: DivisionId, champ: Fighter, pool: Fighter[]): boolean {
  const ps = w.promos[ev.promo];
  const ic = ps.interim[d] ? w.fighters[ps.interim[d]!] : null;
  if (!ic || ic.ctrl || !pool.includes(ic) || beltBooked(w, ev.promo, d, "interim")) return false;
  if (daysSinceFight(w, ic) + (ev.day - w.day) < DEFENCE_GAP[PROMOTIONS[ev.promo].tier]) return false;
  const c = contenderFor(w, ev, d, ic, pool.filter((x) => x.id !== champ.id && x.id !== ic.id));
  if (!c || c.ctrl || teammates(c, ic)) return false;
  makeBout(w, ev, ic, c, "interim");
  return true;
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
  // Offers to the player's fighters first (on poor terms with the matchmaker, not on every card).
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    if (f && f.promo === ev.promo && wantsOffer(w, f, ev) && !snubbed(w, rng, f, ev.promo)) offerFight(w, rng, ev, f);
  }
  const bmf = bmfPairing(w, rng, ev, (f) => readyFor(w, f, ev) && !w.career.fightOffers.some((o) => o.fighter === f.id && o.status === "open"));
  if (bmf) {
    const [x, y] = bmf;
    if (x.ctrl) offerFight(w, rng, ev, x, y, "bmf");
    else if (y.ctrl) offerFight(w, rng, ev, y, x, "bmf");
    else makeBout(w, ev, x, y, "bmf");
  }
  // Champions fight only for their belts, so the shows below the UFC put two title
  // fights on most cards (Cage Warriors and KSW often three); the UFC two on a numbered card.
  const maxTitles = ev.kind === "numbered" ? 2 : ev.kind === "fightnight" ? (rng.chance(0.2) ? 1 : 0) : p.tier === "amateur" ? 1 : rng.chance(0.2) ? 1 : rng.chance(0.75) ? 2 : 3;
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
    // A newcomer with a name made elsewhere meets a ranked fighter first.
    const band = debutBand(w, f, ev.promo);
    const o = (band && debutOpponent(w, rng, f, pool, ev.promo, band)) || bestOpponent(w, rng, f, pool, ev.promo, new Set());
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

/**
 * The records the Contender Series invites: a prospect's (no more than half as many
 * losses as wins, or two), a fighter on a run with a winning record, or a regional
 * champion. Records built in this world fill up with the losses of an even regional
 * scene, and a stricter rule (a third as many losses) left later seasons half empty.
 */
function tryoutRecord(w: World, f: Fighter): boolean {
  const { w: won, l: lost } = f.rec;
  return lost <= Math.max(2, won / 2) || (f.streak >= 2 && won >= lost * 1.5) || (!!f.promo && w.promos[f.promo]?.champs[f.div] === f.id);
}

/** Who the scouts put first: the talent, the form and a clean record. */
function tryoutScore(f: Fighter): number {
  return ovrOf(f.attrs) + Math.max(-1, f.streak) + clamp((f.rec.w - 2 * f.rec.l) * 0.3, -3, 3);
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
    if (!tryoutRecord(w, f)) return false;
    if (availableFrom(f) > ev.day - 21) return false;
    if (f.lastFight !== null && ev.day - f.lastFight < 49) return false;
    return ovrOf(f.attrs) >= 64;
  });
  cands.sort((a, b) => tryoutScore(b) - tryoutScore(a));
  const pool = cands.slice(0, 60);
  const byDiv = new Map<DivisionId, Fighter[]>();
  for (const f of pool) {
    let l = byDiv.get(f.div);
    if (!l) byDiv.set(f.div, (l = []));
    l.push(f);
  }
  // The player's fighters who accepted the invitation for this week, and a spot that opened up.
  bookTryouts(w, rng, ev, byDiv);
  let n = 0;
  for (const [, list] of byDiv) {
    while (list.length >= 2 && ev.bouts.length < 5 && n < 8) {
      const a = list.shift()!;
      const j = list.findIndex((x) => !teammates(a, x) && !x.booked && !metRecently(w, a, x, 120));
      if (j < 0) continue; // only teammates (or a recent opponent) left for this one: the others can still meet
      const b = list.splice(j, 1)[0];
      if (a.booked || b.booked) continue;
      makeBout(w, ev, a, b, "tryout");
      n++;
    }
    if (ev.bouts.length >= 5) break;
  }
  // Short of prospects on the shows the game runs, the scouts look further: the rest
  // of the card goes to prospects from elsewhere, at the weights the UFC carries most.
  for (let k = 0; ev.bouts.length < 5 && k < 10; k++) {
    const d = rng.weighted(PROMOTIONS.dwcs.divisions, (x) => DIVISIONS[x].ufc);
    const a = tryoutProspect(w, rng, d);
    let b = tryoutProspect(w, rng, d);
    for (let t = 0; t < 3 && teammates(a, b); t++) b = tryoutProspect(w, rng, d);
    if (!teammates(a, b)) makeBout(w, ev, a, b, "tryout");
  }
}

// ---------- the player's fighters ----------

export function wantsOffer(w: World, f: Fighter, ev: MMAEvent): boolean {
  if (f.booked) return false;
  if (w.career.fightOffers.some((o) => o.fighter === f.id && o.status === "open")) return false;
  if (!readyFor(w, f, ev)) return false;
  const fc = w.career.fc[f.id];
  if (fc?.lastAsk && w.day < fc.lastAsk) return false; // cooling off after a refusal
  // A Contender Series week accepted: nothing else around it.
  if (ev.promo !== "dwcs" && tryoutHold(w, f, ev.day)) return false;
  return true;
}

export interface OfferExtra {
  notice?: number;
  limit?: number;
  debut?: PromoId;
  stay?: boolean;
  replaced?: string;
}

export function offerFight(w: World, rng: Rng, ev: MMAEvent, f: Fighter, opp?: Fighter, kind?: BoutKind, shortNotice = false, replace?: Bout, extra: OfferExtra = {}): FightOffer | null {
  const p = PROMOTIONS[ev.promo];
  const ps = w.promos[ev.promo];
  // A replacement spot is at the bout's weight, which may be a division up.
  const d = replace ? replace.div : f.div;
  let k: BoutKind = kind ?? "regular";
  let o = opp ?? null;
  // The weight the bout is made at, and a first fight here against the ranked (and why).
  let bd: DivisionId = d;
  let rankedDebut: string | undefined;
  if (!o) {
    // Whoever the fighter turned down lately is off the table: the offer is somebody else.
    const passed = passedOn(w, f, ev.promo);
    const pool = rosterOf(w, ev.promo, d).filter((x) => x.id !== f.id && !x.ctrl && !passed.has(x.id) && readyFor(w, x, ev, { shortNotice }));
    const champ = ps.champs[d];
    // Belt holders aren't ordinary opponents: they fight for their belts.
    const free = pool.filter((x) => x.id !== champ && x.id !== ps.interim[d]);
    if (champ === f.id) {
      // A champion's defence.
      const due = daysSinceFight(w, f) + (ev.day - w.day) >= DEFENCE_GAP[p.tier] - 20;
      if (!due) return null;
      o = contenderFor(w, ev, d, f, pool);
      k = "title";
    } else if (champ && ps.interim[d] === f.id) {
      // The interim champion fights only for the belts: the unification when the
      // champion is back, a defence while the champion is out a long time.
      const c = w.fighters[champ];
      const away = !c || c.status !== "active" || c.ctrl || teammates(c, f);
      if (!away && readyFor(w, c, ev)) {
        o = c;
        k = "title";
      } else if (away || availableFrom(c) - ev.day > 120) {
        const due = daysSinceFight(w, f) + (ev.day - w.day) >= DEFENCE_GAP[p.tier] - 20;
        if (!due) return null;
        o = contenderFor(w, ev, d, f, free);
        k = "interim";
      } else return null; // The champion is nearly back: the next fight is the unification.
    } else if (champ && ps.contender[d] === f.id) {
      const c = w.fighters[champ];
      // A title shot turned down: the matchmaker has moved on for now.
      if (c && !c.ctrl && !passed.has(c.id) && readyFor(w, c, ev)) {
        o = c;
        k = "title";
      } else if (waitingForTitle(w, f) && !(c && passed.has(c.id))) return null; // promised the title on arrival: nothing else meanwhile
    } else if (!champ && ((ps.ranks[d] ?? []).slice(0, 2).includes(f.id) || (ps.contender[d] === f.id && waitingForTitle(w, f)))) {
      const other = (ps.ranks[d] ?? []).slice(0, 3).map((id) => w.fighters[id]).find((x) => x && x.id !== f.id && pool.includes(x));
      if (other) {
        o = other;
        k = "vacant";
      } else if (waitingForTitle(w, f)) return null;
    }
    if (!o) {
      // A call-out the matchmaker likes the sound of.
      const c = calloutFor(w, f);
      const t = c ? w.fighters[c] : null;
      if (t && (t.id === champ || t.id === ps.interim[d]) && pool.includes(t) && !teammates(f, t)) {
        // A top-five contender calling out a belt holder gets the fight, with the belt on it;
        // with another contender already named, only if the champion said yes in public.
        const rf = rankOf(w, f);
        const agreed = !!w.career.fc[f.id]?.callout?.ok;
        const other = ps.contender[d] && ps.contender[d] !== f.id && w.fighters[ps.contender[d]!]?.status === "active";
        if (rf !== null && rf > 0 && rf <= 5 && (f.streak >= 1 || agreed) && (!other || agreed)) {
          o = t;
          k = t.id === champ ? "title" : "interim";
        }
      } else if (t && free.includes(t) && !teammates(f, t)) {
        const rf = rankOf(w, f);
        const rt = rankOf(w, t);
        const gap = (rf ?? 18) - (rt ?? 18);
        // Both said yes in public: the matchmaker nearly always makes it.
        const agreed = !!w.career.fc[f.id]?.callout?.ok;
        if (rng.chance(agreed ? 0.9 : gap > 8 ? 0.2 : gap > 4 ? 0.5 : 0.75)) o = t;
      }
    }
    if (!o) {
      // A rivalry with real heat in the division: the fight sells, so it gets made.
      const hot = rivalsOf(w, f).find((x) => x.r.heat >= 35 && free.includes(x.f) && !teammates(f, x.f));
      if (hot) {
        const gap = Math.abs((rankOf(w, f) ?? 18) - (rankOf(w, hot.f) ?? 18));
        if (gap <= 8 && rng.chance(hot.r.heat / 130)) o = hot.f;
      }
    }
    // A newcomer with a name made elsewhere (a long title reign) meets a ranked fighter first time out.
    if (!o && k === "regular") {
      const band = debutBand(w, f, ev.promo);
      if (band) {
        o = debutOpponent(w, rng, f, free, ev.promo, band);
        if (o) rankedDebut = band.why;
      }
    }
    // Ranked at another weight as well (a win there over a ranked fighter): some fights are
    // made there, against someone ranked near that place; more often when the place is better.
    if (!o && k === "regular" && !replace) {
      const alt = otherRanks(w, f)[0];
      const mine = rankOf(w, f);
      if (alt && rng.chance(mine === null || alt.rank < mine ? 0.5 : 0.25)) {
        const there = rosterOf(w, ev.promo, alt.div).filter((x) => !x.ctrl && !passed.has(x.id) && x.id !== ps.champs[alt.div] && x.id !== ps.interim[alt.div] && readyFor(w, x, ev));
        const near = there.filter((x) => {
          const r = rankOf(w, x);
          return r !== null && r > 0 && Math.abs(r - alt.rank) <= 4;
        });
        const c = bestOpponent(w, rng, f, near.length ? near : there, ev.promo, new Set());
        if (c) {
          o = c;
          bd = alt.div;
        }
      }
    }
    // After a no for the right reasons: a step up, or a more even fight.
    const want = nextWant(w, f, ev.promo);
    if (!o && want) {
      const mine = bookedAt(f, p.tier);
      const rf = rankOf(w, f);
      const fits = free.filter((x) => {
        const rx = rankOf(w, x);
        return want === "up" ? bookedAt(x, p.tier) >= mine + 25 || (rx !== null && rx > 0 && (rf === null || rx < rf)) : Math.abs(bookedAt(x, p.tier) - mine) <= 35;
      });
      o = bestOpponent(w, rng, f, fits, ev.promo, new Set());
      if (o) clearWant(w, f);
    }
    if (!o) o = bestOpponent(w, rng, f, free, ev.promo, new Set());
  }
  if (!o) return null;
  if (k === "regular" && p.rankSize) {
    const rf = bd === f.div ? rankOf(w, f) : rankIn(w, f, ev.promo, bd);
    const ro = rankOf(w, o);
    if (rf !== null && ro !== null && rf > 0 && ro > 0 && rf <= 5 && ro <= 5) k = "eliminator";
  }
  const bout = replace ?? makeBout(w, ev, f, o, k, { shortNotice, pending: "x", div: bd });
  if (replace) {
    // A replacement spot: the player's fighter steps in.
    if (replace.a === "") replace.a = f.id;
    f.booked = replace.id;
    replace.pending = "x";
  }
  const pay = extra.stay ? fightOfferPay(w, f, ev.promo, false) : fightOfferPay(w, f, ev.promo, shortNotice);
  // A grudge match sells, and the promotion pays for it.
  const grudge = grudgeBonus(w, f, o, pay.show, pay.win);
  if (grudge) pay.show += grudge;
  if (k === "bmf") {
    // A BMF fight sells: it pays like a main event.
    pay.show = Math.round((pay.show * 1.5) / 1000) * 1000;
    pay.win = Math.round((pay.win * 1.5) / 1000) * 1000;
  }
  const days = ev.day - w.day;
  // Short notice can't wait: two days to answer with a week or more to go, a day inside a week, the same day at the end.
  const expires = shortNotice ? w.day + (days >= 8 ? 2 : days >= 4 ? 1 : 0) : Math.min(ev.day - 10, w.day + 5);
  const offer: FightOffer = {
    id: nextId(w, "fo"),
    fighter: f.id,
    promo: ev.promo,
    opp: o.id,
    ev: ev.id,
    day: ev.day,
    div: bd,
    rounds: bout.rounds,
    kind: bout.kind,
    show: pay.show,
    win: pay.win,
    shortNotice,
    made: w.day,
    expires,
    status: "open",
    notice: shortNotice ? days : undefined,
    limit: extra.limit,
    debut: extra.debut,
    stay: extra.stay,
    replaced: extra.replaced,
    rankedDebut,
  };
  bout.pending = offer.id;
  w.career.fightOffers.push(offer);
  const you = f.ctrl && w.career.mode === "manager" ? fullName(f) : "you";
  const rec = `${o.rec.w}-${o.rec.l}${o.rec.d ? `-${o.rec.d}` : ""}`;
  const purse = pay.show ? `Purse: ${money(pay.show)} to show${pay.win ? ` and ${money(pay.win)} to win` : ""}.` : "Amateur bout: no purse.";
  const out = extra.replaced ? w.fighters[extra.replaced] : undefined;
  if (shortNotice) {
    const limit = extra.limit ?? DIVISIONS[d].limit;
    const weight = extra.limit ? `at a ${limit} lb catchweight` : d !== f.div ? `up at ${DIVISIONS[d].name.toLowerCase()} (${limit} lb)` : `at ${DIVISIONS[d].name.toLowerCase()} (${limit} lb)`;
    const cut = cutCheck(f, limit, days);
    const when = days <= 1 ? "tomorrow" : `in ${days} days`;
    const big = p.tier === "major" || p.tier === "league";
    const why = extra.stay
      ? "Your opponent is out; the promotion found a new one."
      : extra.debut
      ? `${p.short} needs a name with a record like yours, and your deal lets them call.`
      : d !== f.div
      ? `Up at ${limit} lb there's no weight to cut, which is why they can call this late.`
      : extra.limit
      ? `You couldn't make ${DIVISIONS[d].limit} lb in ${days} days, so they agreed a catchweight.`
      : "You're in the division, healthy, and you said you'd take calls.";
    const facts: Fact[] = [
      { k: "Notice", v: `${days} day${days === 1 ? "" : "s"} to fight night`, tone: days <= 3 ? "bad" : days <= 7 ? "warn" : undefined },
      { k: "Opponent", v: `${fullName(o)} (${rec}), ${rankLabel(w, o) || "unranked"}` },
      { k: "Weight", v: extra.limit ? `${limit} lb catchweight` : `${DIVISIONS[d].name}, ${limit} lb${d !== f.div ? " (a division up)" : ""}` },
      { k: "The cut", v: cut.lb > 0 ? `${cut.lb} lb from ${f.walk}: ${CUT_TEXT[cut.risk]}` : "None", tone: cut.risk === "hard" ? "warn" : cut.risk === "too much" ? "bad" : undefined },
      { k: "Why you", v: why },
      { k: "Purse", v: pay.show ? `${money(pay.show)} + ${money(pay.win)} to win` : "No purse" },
      { k: "Answer by", v: days <= 3 ? "Today" : fmtDate(expires) },
    ];
    notify(w, {
      kind: "offer",
      fighter: f.id,
      ref: offer.id,
      from: `${p.short} matchmaker`,
      subject: extra.stay ? `New opponent: ${fullName(o)}, ${days} day${days === 1 ? "" : "s"} out` : `Short notice: ${fullName(o)} ${when}${bout.kind === "title" || bout.kind === "interim" ? " (title)" : ""}`,
      body: extra.stay
        ? `${out ? `${fullName(out)} is out of the fight. ` : ""}${p.short} has ${fullName(o)} (${rec}) ready to step in on ${days} days' notice: same date, same card, ${weight}. Take the new opponent, or the fight is off${days <= 7 && big ? " (in fight week the promotion still pays your show money)" : ""}.`
        : `${out ? `${fullName(out)} has pulled out of ${ev.name}. ` : ""}${p.name} wants ${you} ${extra.debut ? "on its card for the first time, " : ""}against ${fullName(o)} (${rec}) ${when}, ${fmtDate(ev.day)} in ${ev.city}, ${weight}. ${bout.rounds} rounds. ${purse} ${days <= 3 ? "They need an answer today." : `Answer by ${fmtDate(expires)}.`} The camp is ${days} day${days === 1 ? "" : "s"}; the weight, from ${f.walk} lb, is ${CUT_TEXT[cut.risk]}.${extra.debut ? ` Taking it signs the ${p.short} deal.` : ""}`,
      needs: true,
      actions: [
        { id: "accept", label: extra.stay ? "Take the new opponent" : "Take the fight", primary: true },
        { id: "decline", label: extra.stay ? "Call it off" : "Turn it down", danger: true },
      ],
      facts,
    });
    return offer;
  }
  const kindText = bout.kind === "bmf" ? (bout.stake === "bmf-defence" ? "a BMF title defence" : "a fight for the BMF title, five rounds") : bout.kind === "title" ? (bout.stake === "unify" ? "a title unification" : "a title fight") : bout.kind === "vacant" ? "a fight for the vacant title" : bout.kind === "interim" ? (bout.stake === "interim-defence" ? "an interim title defence" : "an interim title fight") : bout.kind === "tryout" ? "a Contender Series fight" : "a fight";
  // A first fight against the ranked, or a fight at the other weight where the fighter is ranked too.
  const facts: Fact[] = [];
  let extraText = "";
  if (rankedDebut) {
    extraText += ` A ranked opponent first time out (${rankLabel(w, o) || "ranked"}): ${rankedDebut} earned it.`;
    facts.push({ k: "Debut", v: `Against the ${rankLabel(w, o) || "ranked"} at ${DIVISIONS[bd].name.toLowerCase()}`, tone: "good" }, { k: "Earned by", v: rankedDebut });
  }
  if (bd !== f.div) {
    const there = rankIn(w, f, ev.promo, bd);
    const up = DIVISIONS[bd].limit > DIVISIONS[f.div].limit;
    extraText += ` It's at ${DIVISIONS[bd].name.toLowerCase()} (${DIVISIONS[bd].limit} lb), a division ${up ? "up" : "down"}${there ? `, where you're ranked #${there}` : ""}.`;
    facts.push({ k: "Weight", v: `${DIVISIONS[bd].name}, ${DIVISIONS[bd].limit} lb (a division ${up ? "up" : "down"})`, tone: up ? undefined : "warn" });
    if (there) facts.push({ k: "Your rank there", v: `#${there}`, tone: "good" });
  }
  notify(w, {
    kind: "offer",
    fighter: f.id,
    ref: offer.id,
    from: `${p.short} matchmaker`,
    subject: `${p.short} offer: ${fullName(o)}${stakeLabel(bout) ? ` (${stakeLabel(bout)!.toLowerCase()})` : rankedDebut ? " (ranked debut)" : bd !== f.div ? ` (at ${DIVISIONS[bd].name.toLowerCase()})` : ""}`,
    body: `${p.name} offers ${you} ${kindText} against ${fullName(o)} (${rec}) at ${ev.name} on ${fmtDate(ev.day)} in ${ev.city}. ${bout.rounds} rounds. ${purse}${grudge ? ` The bad blood sells: ${money(grudge)} of that is for the grudge.` : ""}${extraText}`,
    needs: true,
    actions: [
      { id: "accept", label: "Accept", primary: true },
      { id: "decline", label: "Decline", danger: true },
    ],
    facts: facts.length ? facts : undefined,
  });
  return offer;
}

/** The matchmaker calls one of the player's fighters to fill a spot. True if the call was made. */
function callPlayer(w: World, rng: Rng, ev: MMAEvent, b: Bout, outId: string, stay: Fighter, days: number): boolean {
  const c: Call | null = findCall(w, ev, b, stay, days);
  if (!c || !rng.chance(c.chance)) return false;
  if (b.a === outId) b.a = c.f.id;
  else b.b = c.f.id;
  b.replaced = outId;
  b.sub = c.f.id;
  b.notice = days;
  b.shortNotice = true;
  b.limit = c.limit;
  c.f.booked = b.id;
  setOdds(w, b);
  const fc = w.career.fc[c.f.id];
  if (fc) fc.lastCall = w.day;
  offerFight(w, rng, ev, c.f, stay, b.kind, true, b, { notice: days, limit: c.limit, debut: c.debut, replaced: outId });
  return true;
}

/**
 * A fighter is out of a booked fight. The matchmaker rings round (the player's
 * fighters who said they'd take short notice first, if they fit), then looks
 * for someone on the roster; with no one, the fight is off. When the player's
 * own opponent drops out, the new name is the player's call.
 */
export function withdraw(w: World, rng: Rng, b: Bout, outId: string, why: string, opts: { quiet?: boolean } = {}): void {
  const ev = w.events[b.ev];
  const out = w.fighters[outId];
  const stayId = b.a === outId ? b.b : b.a;
  const stay = w.fighters[stayId];
  if (out.booked === b.id) out.booked = null;
  if (!ev || ev.status === "done") return;
  const days = ev.day - w.day;
  const p = PROMOTIONS[ev.promo];
  const big = p.tier === "major" || p.tier === "league";
  const titleFight = b.kind === "title" || b.kind === "interim" || b.kind === "vacant";
  const champOut = titleFight && w.promos[ev.promo].champs[b.div] === outId;
  // The phone rings for one of the player's fighters.
  if (!stay.ctrl && !champOut && callPlayer(w, rng, ev, b, outId, stay, days)) {
    if (!opts.quiet && (big || p.tier === "regional")) addNews(w, { kind: "booking", promo: ev.promo, fighters: [outId], text: `${fullName(out)} is out of ${ev.name} (${why}).` });
    return;
  }
  // Champions don't step in on short notice (and can't fight for an interim belt).
  const ps = w.promos[ev.promo];
  const free = (x: Fighter) => x.id !== stayId && x.id !== outId && !x.ctrl && x.id !== ps.champs[x.div] && x.id !== ps.interim[x.div] && readyFor(w, x, ev, { shortNotice: true });
  // From the division (if the cut can be made in the days left), and inside two
  // weeks from the division below: a lighter man stepping up has no cut to make.
  const limit = boutLimit(b);
  const below = neighbourDivisions(b.div).down;
  const pool = [
    ...rosterOf(w, ev.promo, b.div).filter((x) => free(x) && cutCheck(x, limit, Math.max(1, days)).risk !== "too much"),
    ...(below && days <= 14 && !titleFight ? rosterOf(w, ev.promo, below).filter((x) => free(x) && x.walk <= limit + 2) : []),
  ];
  // Who says yes on short notice: the fighters with more to gain than to lose.
  // Those rated well above the opponent mostly pass, so replacements are usually underdogs.
  const level = bookedAt(stay, p.tier);
  const willing = pool.filter((x) => bookedAt(x, p.tier) <= level - 35 || rng.chance(0.1));
  const sub = days >= 2 ? bestOpponent(w, rng, stay, willing, ev.promo, new Set()) : null;
  if (sub && (!titleFight || rankOf(w, sub) !== null)) {
    if (b.a === outId) b.a = sub.id;
    else b.b = sub.id;
    b.replaced = outId;
    b.sub = sub.id;
    b.notice = days;
    b.shortNotice = true;
    b.limit = undefined;
    sub.booked = b.id;
    setOdds(w, b);
    if (champOut) b.kind = "interim";
    if (stay.ctrl) {
      // The player's opponent changed: take the new name, or the fight is off.
      offerFight(w, rng, ev, stay, sub, b.kind, true, b, { notice: days, stay: true, replaced: outId });
      return;
    }
    if (!opts.quiet) addNews(w, { kind: "booking", promo: ev.promo, fighters: [outId, sub.id, stayId], text: `${fullName(out)} is out of ${ev.name} (${why}). ${fullName(sub)} steps in on ${days} days' notice${sub.div !== b.div ? `, up from ${DIVISIONS[sub.div].name.toLowerCase()},` : ""} against ${fullName(stay)}.` });
    orderCard(w, ev);
    return;
  }
  cancelBout(w, b, `${fullName(out)} withdrew (${why})`);
  if (!opts.quiet && p.tier !== "amateur") {
    addNews(w, { kind: "booking", promo: ev.promo, fighters: [outId, stayId], text: `${fullName(out)} vs. ${fullName(stay)} is off ${ev.name}: ${fullName(out)} withdrew (${why}).` });
  }
  if (stay.ctrl) callOff(w, b, stay, `${fullName(out)} has withdrawn (${why}) and there was no replacement in time.`, days);
}

/** The player's fight is off: the camp ends, and in fight week the big promotions still pay the show money. */
export function callOff(w: World, b: Bout, f: Fighter, why: string, days: number): void {
  const ev = w.events[b.ev];
  const p = PROMOTIONS[b.promo];
  const paid = days <= 7 && (p.tier === "major" || p.tier === "league") ? payShowOnly(w, f, b, `${ev?.name ?? "the event"}, the fight fell through`) : 0;
  notify(w, {
    kind: "camp",
    fighter: f.id,
    from: `${p.short} matchmaker`,
    subject: "The fight is off",
    body: `${why} The camp is over; the matchmaker will be in touch about the next date.${paid ? ` ${p.short} pays the show money all the same: ${money(paid)}.` : ""}`,
    facts: [
      { k: "Event", v: `${ev?.name ?? "The card"}, ${fmtDate(b.day)}` },
      { k: "Days out", v: `${days}` },
      { k: "Show money", v: paid ? `${money(paid)} paid` : days <= 7 ? "Not paid at this level" : "Not paid outside fight week", tone: paid ? "good" : undefined },
    ],
  });
  const fc = w.career.fc[f.id];
  if (fc) fc.camp = null;
  if (f.booked === b.id) f.booked = null;
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
        const p = 0.0023 * (f.hid.injuryProne / 9);
        if (rng.chance(p)) {
          // The same injuries the player's fighters get, as long as they really take.
          f.injury = makeInjury(rng, trainingInjury(rng, new Set()), w.day, "training");
          if (f.injury.until > b.day - 3) {
            withdraw(w, rng, b, fid, f.injury.name.charAt(0).toLowerCase() + f.injury.name.slice(1));
            break;
          }
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
