// Rankings the way the UFC now makes them: a rating model in the spirit of Elo
// (the system it launched in October 2026). Who you beat counts most; a finish
// adds a little; fighting often helps; after eighteen months out the score
// decays faster and faster; and a winner always moves above the fighter beaten.
// A champion who loses the belt goes straight to number one, as on the UFC's
// rankings, and stays there until fighting again. A fighter can hold places at
// two weights at once: beat a ranked fighter a division up or down and that
// division ranks you too, in the place of the fighter beaten.

import { clamp } from "../core/util";
import { DIVISIONS, neighbourDivisions, type DivisionId } from "../data/divisions";
import { PROMOTIONS, PROMO_IDS, rankSizeOf, type PromoId } from "../data/promotions";
import type { Bout, Fighter, World } from "../model/types";
import { addNews, fightsInPromo, fullName, rankNumber, rosterOf, stageFights } from "./core";
import { notify } from "../career/inbox";

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

/** Proven here: has fought on this stage (or was on the roster when the world began). */
function provenHere(w: World, f: Fighter, promo: PromoId): boolean {
  if (f.promo === promo && f.joined <= w.start) return true;
  return fightsInPromo(w, f, promo) >= 1;
}

/**
 * Champions who have just lost the belt (or an interim champion theirs) and
 * haven't fought since: they go straight to number one, for up to eighteen
 * months out.
 */
export function justDethroned(w: World, promo: PromoId, d: DivisionId): Set<string> {
  const ps = w.promos[promo];
  const out = new Set<string>();
  for (const r of ps.reigns) {
    if (r.div !== d || r.lost === undefined || (r.ended !== "lost" && r.ended !== "unified")) continue;
    if (w.day - r.lost > INACTIVE_FROM) continue;
    const f = w.fighters[r.fighter];
    if (!f || f.status !== "active" || f.promo !== promo || f.div !== d || f.lastFight !== r.lost) continue;
    if (ps.champs[d] === f.id || ps.interim[d] === f.id) continue;
    out.add(f.id);
  }
  return out;
}

/**
 * Fighters from the weights either side who have beaten someone here in the last
 * eighteen months, and more often than they lost here: ranked here as well, in
 * the place they took from the fighter beaten, as on the UFC's rankings where a
 * fighter can hold places at two weights at once.
 */
function crossWeighters(w: World, promo: PromoId, d: DivisionId): { f: Fighter; s: number }[] {
  const out: { f: Fighter; s: number }[] = [];
  const nb = neighbourDivisions(d);
  for (const od of [nb.up, nb.down]) {
    if (!od) continue;
    for (const f of rosterOf(w, promo, od)) {
      const x = f.xw?.find((e) => e.promo === promo && e.div === d);
      if (!x || x.score === undefined || x.beat.length <= x.lost || w.day - x.last > INACTIVE_FROM || f.status !== "active") continue;
      out.push({ f, s: x.score });
    }
  }
  return out;
}

/** A fighter's number on a division's list: 0 champion, 1-15, or null. */
function rankNumberOf(w: World, promo: PromoId, d: DivisionId, id: string): number | null {
  const ps = w.promos[promo];
  if (ps.champs[d] === id) return 0;
  const list = ps.ranks[d] ?? [];
  const i = list.indexOf(id);
  return i >= 0 ? rankNumber(list, ps.interim[d] ?? null, i) : null;
}

export function updateRankings(w: World, promo: PromoId, divs?: DivisionId[]): void {
  const p = PROMOTIONS[promo];
  if (!p.rankSize) return;
  const ps = w.promos[promo];
  for (const d of divs ?? p.divisions) {
    const champ = ps.champs[d] ?? null;
    const interim = ps.interim[d] ?? null;
    const pool = rosterOf(w, promo, d).filter((f) => f.id !== champ && f.id !== interim && f.status === "active");
    const scored = [
      ...pool.filter((f) => provenHere(w, f, promo)).map((f) => ({ f, s: rankScore(w, f) })),
      // Fighters from the weights either side who beat someone here.
      ...crossWeighters(w, promo, d).filter((x) => x.f.id !== champ && x.f.id !== interim),
    ]
      .filter((x) => x.s > -1e9)
      .sort((x, y) => y.s - x.s);
    // The champion who just lost the belt is number one until fighting again.
    const back = justDethroned(w, promo, d);
    // New signings yet to fight here fill the places still open, below everyone
    // who has (best record and rating first): a thin roster still ranks in full.
    const fresh = pool
      .filter((f) => !provenHere(w, f, promo))
      .map((f) => ({ f, s: rankScore(w, f) }))
      .sort((x, y) => y.s - x.s);
    const list = [...scored.filter((x) => back.has(x.f.id)), ...scored.filter((x) => !back.has(x.f.id)), ...fresh];
    // Ten or fifteen numbered places (five in a small division); an interim champion heads them without a number.
    const ids = list.slice(0, rankSizeOf(promo, d)).map((x) => x.f.id);
    if (interim) ids.unshift(interim);
    const was = new Set(ps.ranks[d] ?? []);
    ps.prevRanks[d] = ps.ranks[d] ?? [];
    ps.ranks[d] = ids;
    // Ranked at a second weight: the news, and a word to the player.
    ids.forEach((id, i) => {
      const f = w.fighters[id];
      if (!f || f.div === d || was.has(id)) return;
      const n = rankNumber(ids, interim, i);
      const text = `${fullName(f)} is ranked at ${DIVISIONS[d].name.toLowerCase()} too, at #${n}, after a win there.`;
      if (promo === "ufc" || promo === "pfl") addNews(w, { kind: "ranking", promo, fighters: [id], text });
      if (f.ctrl) {
        const beat = f.xw?.find((x) => x.promo === promo && x.div === d)?.beat.slice(-1)[0];
        notify(w, {
          kind: "ranking",
          fighter: id,
          from: `${PROMOTIONS[promo].short} rankings`,
          subject: `Ranked at ${DIVISIONS[d].name.toLowerCase()}: #${n}`,
          body: `${fullName(f)} is on the ${PROMOTIONS[promo].short} ${DIVISIONS[d].name.toLowerCase()} rankings at #${n}${beat && w.fighters[beat] ? `, in the place of ${fullName(w.fighters[beat])}` : ""}, as well as at ${DIVISIONS[f.div].name.toLowerCase()}. The matchmaker can now offer fights at either weight; a loss up there costs the place, and it lapses after eighteen months without a fight at that weight.`,
          facts: [
            { k: DIVISIONS[d].name, v: `#${n}`, tone: "good" },
            { k: DIVISIONS[f.div].name, v: ((): string => { const r = rankNumberOf(w, promo, f.div, id); return r === 0 ? "Champion" : r ? `#${r}` : "Unranked"; })() },
          ],
        });
      }
    });
    // Peak rank for the record.
    ids.forEach((id, i) => {
      const f = w.fighters[id];
      const n = rankNumber(ids, interim, i);
      if (promo === "ufc" && (f.peakRank === undefined || n < f.peakRank)) f.peakRank = n;
    });
    if (champ) {
      const f = w.fighters[champ];
      if (f && promo === "ufc") f.peakRank = 0;
    }
  }
}

/**
 * Lists the rules no longer match (a save from before the open places were
 * filled, or a division that now ranks five): ranked again, keeping the last
 * movement, so the arrows still show the last month's moves.
 */
export function refitRankings(w: World): void {
  for (const id of PROMO_IDS) {
    if (!PROMOTIONS[id].rankSize) continue;
    const ps = w.promos[id];
    for (const d of PROMOTIONS[id].divisions) {
      const want = rankSizeOf(id, d) + (ps.interim[d] ? 1 : 0);
      if ((ps.ranks[d] ?? []).length === want) continue;
      const prev = ps.prevRanks[d] ?? [];
      updateRankings(w, id, [d]);
      ps.prevRanks[d] = prev;
    }
  }
}

/** Movement since the last update: positive is up. */
export function rankMove(w: World, promo: PromoId, d: DivisionId, id: string): number | "new" | null {
  const ps = w.promos[promo];
  // Places among the numbered contenders: the belt holders above them don't count.
  const numbered = (list: string[] | undefined) => (list ?? []).filter((x) => x !== ps.interim[d] && x !== ps.champs[d]);
  const now = numbered(ps.ranks[d]).indexOf(id);
  if (now < 0) return null;
  // The first ranking has nothing to compare with: no arrows, no "new" for everybody.
  if (!ps.prevRanks[d]?.length) return null;
  const before = numbered(ps.prevRanks[d]).indexOf(id);
  if (before < 0) return "new";
  return before - now;
}

/** Pound for pound in a promotion: rating against the division, plus the belt and recent form. */
export function p4pOf(w: World, promo: PromoId, n: number): string[] {
  const scored: { id: string; s: number }[] = [];
  const ps = w.promos[promo];
  for (const d of PROMOTIONS[promo].divisions) {
    const roster = rosterOf(w, promo, d);
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
  return scored.slice(0, n).map((x) => x.id);
}

/** The UFC's pound-for-pound top fifteen and the PFL's top ten. */
export function updateP4P(w: World): void {
  w.p4p = p4pOf(w, "ufc", 15);
  if (w.promos.pfl) w.promos.pfl.p4p = p4pOf(w, "pfl", 10);
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
    // A number one from another weight is ranked here, but the title shot goes to the division's own.
    if (top && top.div === d && top.streak >= 2 && !lostToRecently(w, top, champ)) {
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
  const firstOf = (list: string[] | undefined) => (list ?? []).find((id) => id !== ps.interim[d]);
  const first = firstOf(ps.ranks[d]);
  const before = firstOf(ps.prevRanks[d]);
  if (first && first !== before && promo === "ufc") {
    const f = w.fighters[first];
    addNews(w, { kind: "ranking", promo, fighters: [first], text: `${fullName(f)} is the new number one contender at ${DIVISIONS[d].name.toLowerCase()}.` });
  }
}
