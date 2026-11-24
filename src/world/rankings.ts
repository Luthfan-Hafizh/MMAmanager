// Rankings the way the UFC now makes them: a rating model in the spirit of Elo
// (the system it launched in October 2026). Who you beat counts most; a finish
// adds a little; fighting often helps; after eighteen months out the score
// decays faster and faster; and a winner always moves above the fighter beaten.

import { clamp } from "../core/util";
import { DIVISIONS, type DivisionId } from "../data/divisions";
import { PROMOTIONS, type PromoId } from "../data/promotions";
import type { Bout, Fighter, World } from "../model/types";
import { addNews, fightsInPromo, fullName, rosterOf, stageFights } from "./core";

const INACTIVE_FROM = 548; // eighteen months

export function activityScore(w: World, f: Fighter): number {
  let recent = 0;
  for (let k = f.bouts.length - 1; k >= 0; k--) {
    const b = w.bouts[f.bouts[k]];
    if (!b || b.status !== "done") continue;
    if (w.day - b.day > 365) break;
    recent++;
  }
  const idle = f.lastFight === null ? 400 : w.day - f.lastFight;
  let s = Math.min(3, recent) * 7;
  if (idle > INACTIVE_FROM) s -= 22 * (Math.exp((idle - INACTIVE_FROM) / 200) - 1);
  return s;
}

export function rankScore(w: World, f: Fighter): number {
  return f.elo + activityScore(w, f);
}

/** Elo with a small bonus for a finish and a larger step in title fights. */
export function eloUpdate(w: World, b: Bout, winner: Fighter | null, a: Fighter, bb: Fighter): void {
  const ea = 1 / (1 + Math.pow(10, (bb.elo - a.elo) / 400));
  const sa = winner === null ? 0.5 : winner === a ? 1 : 0;
  const ka = kFactor(w, a, b);
  const kb = kFactor(w, bb, b);
  const fin = b.res && (b.res.method === "KO" || b.res.method === "TKO" || b.res.method === "SUB") ? 4 : 0;
  let da = ka * (sa - ea) + (sa === 1 ? fin : 0);
  let db = kb * (1 - sa - (1 - ea)) + (sa === 0 ? fin : 0);
  // Stepping in on short notice: a loss is forgiven more easily.
  if (b.shortNotice && b.sub) {
    if (b.sub === a.id && da < 0) da *= 0.5;
    if (b.sub === bb.id && db < 0) db *= 0.5;
  }
  a.elo = Math.round(a.elo + da);
  bb.elo = Math.round(bb.elo + db);
  // A winner always moves above the fighter beaten, within the promotion's list.
  if (winner && a.div === bb.div && a.promo && a.promo === bb.promo && PROMOTIONS[a.promo].rankSize > 0) {
    const loser = winner === a ? bb : a;
    const sw = rankScore(w, winner);
    const sl = rankScore(w, loser);
    if (sw <= sl) winner.elo += Math.round(sl - sw + 4);
  }
}

/** A rating moves faster while it is still settling: a newcomer's first fights at a level count more. */
function kFactor(w: World, f: Fighter, b: Bout): number {
  const n = f.promo ? stageFights(w, f, f.promo) : 6;
  let k = 30 + 20 * clamp(1 - n / 6, 0, 1);
  if (b.kind === "title" || b.kind === "interim" || b.kind === "vacant") k *= 1.25;
  return k;
}

/** Who can be ranked: on the roster, active, and has fought there (or was there when the world began). */
function eligible(w: World, f: Fighter, promo: PromoId): boolean {
  if (f.status !== "active") return false;
  if (f.promo === promo && f.joined <= w.start) return true;
  return fightsInPromo(w, f, promo) >= 1;
}

export function updateRankings(w: World, promo: PromoId, divs?: DivisionId[]): void {
  const p = PROMOTIONS[promo];
  if (!p.rankSize) return;
  const ps = w.promos[promo];
  for (const d of divs ?? p.divisions) {
    const champ = ps.champs[d] ?? null;
    const interim = ps.interim[d] ?? null;
    const list = rosterOf(w, promo, d)
      .filter((f) => f.id !== champ && f.id !== interim && eligible(w, f, promo))
      .map((f) => ({ f, s: rankScore(w, f) }))
      .filter((x) => x.s > -1e9)
      .sort((x, y) => y.s - x.s);
    const ids = list.slice(0, p.rankSize - (interim ? 1 : 0)).map((x) => x.f.id);
    if (interim) ids.unshift(interim);
    ps.prevRanks[d] = ps.ranks[d] ?? [];
    ps.ranks[d] = ids;
    // Peak rank for the record.
    ids.forEach((id, i) => {
      const f = w.fighters[id];
      if (promo === "ufc" && (f.peakRank === undefined || i + 1 < f.peakRank)) f.peakRank = i + 1;
    });
    if (champ) {
      const f = w.fighters[champ];
      if (f && promo === "ufc") f.peakRank = 0;
    }
  }
}

/** Movement since the last update: positive is up. */
export function rankMove(w: World, promo: PromoId, d: DivisionId, id: string): number | "new" | null {
  const ps = w.promos[promo];
  const now = (ps.ranks[d] ?? []).indexOf(id);
  if (now < 0) return null;
  const before = (ps.prevRanks[d] ?? []).indexOf(id);
  if (before < 0) return "new";
  return before - now;
}

/** Pound for pound: rating against the division, plus the belt and recent form. */
export function updateP4P(w: World): void {
  const scored: { id: string; s: number }[] = [];
  const ps = w.promos.ufc;
  for (const d of PROMOTIONS.ufc.divisions) {
    const roster = rosterOf(w, "ufc", d);
    if (!roster.length) continue;
    const scores = roster.map((f) => rankScore(w, f));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const sd = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length) || 1;
    const top = new Set([...(ps.ranks[d] ?? []).slice(0, 6)]);
    for (const f of roster) {
      const champ = ps.champs[d] === f.id;
      if (!champ && !top.has(f.id)) continue;
      let s = (rankScore(w, f) - mean) / sd;
      if (champ) s += 1.2;
      s += clamp(f.streak, -2, 6) * 0.08;
      if (DIVISIONS[d].sex === "F") s -= 0.15;
      scored.push({ id: f.id, s });
    }
  }
  scored.sort((a, b) => b.s - a.s);
  w.p4p = scored.slice(0, 15).map((x) => x.id);
}

/** After a card: name a number one contender who has earned it. */
export function nameContenders(w: World, promo: PromoId): void {
  const ps = w.promos[promo];
  const p = PROMOTIONS[promo];
  if (!p.rankSize) return;
  for (const d of p.divisions) {
    const champ = ps.champs[d];
    const cur = ps.contender[d];
    if (cur) {
      const c = w.fighters[cur];
      if (!c || c.status !== "active" || c.promo !== promo || c.div !== d || c.streak < 0 || cur === champ) ps.contender[d] = null;
      else continue;
    }
    if (!champ) continue;
    const list = ps.ranks[d] ?? [];
    const top = list[0] ? w.fighters[list[0]] : undefined;
    if (top && top.streak >= 2 && !lostToRecently(w, top, champ)) {
      ps.contender[d] = top.id;
    }
  }
}

export function lostToRecently(w: World, f: Fighter, otherId: string, days = 730): boolean {
  for (let k = f.bouts.length - 1; k >= 0; k--) {
    const b = w.bouts[f.bouts[k]];
    if (!b || b.status !== "done" || !b.res) continue;
    if (w.day - b.day > days) break;
    const opp = b.a === f.id ? b.b : b.a;
    if (opp !== otherId) continue;
    const mine = b.a === f.id ? "a" : "b";
    return b.res.winner !== null && b.res.winner !== mine;
  }
  return false;
}

/**
 * Entry rating when a fighter signs with a promotion: the level of the pool
 * there. At the UFC and the PFL a newcomer starts among the unranked, however
 * good, and has to win a way into the rankings like everyone already there.
 */
export function entryElo(promo: PromoId, ovr: number, elo: number): number {
  const tier = PROMOTIONS[promo].tier;
  const top = tier === "major" ? 10 : tier === "league" ? 30 : 320;
  const fresh = ratingFor(tier, ovr);
  return Math.round(clamp(0.7 * fresh + 0.3 * Math.min(elo, fresh + 60), BASE[tier] - 150, BASE[tier] + top));
}

const BASE: Record<string, number> = { major: 1480, league: 1420, tryout: 1400, regional: 1250, local: 1150, amateur: 1000 };
const SLOPE: Record<string, number> = { major: 12, league: 11, tryout: 10, regional: 10, local: 9, amateur: 8 };
const CENTRE: Record<string, number> = { major: 72, league: 68, tryout: 68, regional: 61, local: 54, amateur: 46 };

/** The rating that a fighter of this quality usually holds at this level. */
export function ratingFor(tier: string, ovr: number): number {
  return BASE[tier] + (ovr - CENTRE[tier]) * SLOPE[tier];
}

export function rankingNews(w: World, promo: PromoId, d: DivisionId): void {
  const ps = w.promos[promo];
  const first = ps.ranks[d]?.[0];
  const before = ps.prevRanks[d]?.[0];
  if (first && first !== before && promo === "ufc") {
    const f = w.fighters[first];
    addNews(w, { kind: "ranking", promo, fighters: [first], text: `${fullName(f)} is the new number one contender at ${DIVISIONS[d].name.toLowerCase()}.` });
  }
}
