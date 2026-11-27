// Shared world helpers: ids, lookups and the indexes that are rebuilt on demand
// (they live outside the save).

import { ageAt } from "../core/time";
import { Rng } from "../core/rng";
import type { DivisionId } from "../data/divisions";
import { PROMOTIONS, TIER_RANK, type PromoId, type Tier } from "../data/promotions";
import { ovr } from "../model/attributes";
import type { Bout, Fighter, MMAEvent, News, World } from "../model/types";

export function nextId(w: World, prefix: string): string {
  const n = (w.ids[prefix] ?? 0) + 1;
  w.ids[prefix] = n;
  return `${prefix}-${n.toString(36)}`;
}

/** Run something with the world's stream and save the stream state afterwards. */
export function withRng<T>(w: World, fn: (rng: Rng) => T): T {
  const r = new Rng(w.rng);
  try {
    return fn(r);
  } finally {
    w.rng = r.s;
  }
}

export function ageOf(w: World, f: Fighter): number {
  return ageAt(f.birth, w.day);
}

export function fullName(f: Fighter): string {
  return f.first ? `${f.first} ${f.surname}` : f.surname;
}

export function tierOf(f: Fighter): Tier | null {
  return f.promo ? PROMOTIONS[f.promo].tier : null;
}

export function tierLevel(p: PromoId | null): number {
  return p ? TIER_RANK[PROMOTIONS[p].tier] : -1;
}

export function fOvr(f: Fighter): number {
  return ovr(f.attrs);
}

// ---------- indexes ----------

interface Index {
  stamp: number;
  roster: Map<string, Fighter[]>; // `${promo}:${div}`
  free: Fighter[];
  byGym: Map<string, Fighter[]>;
  /** Where each active fighter sits in the lists above, so one move patches the index in place. */
  at: Map<string, { k: string | null; g: string | null }>;
}

const cache = new WeakMap<World, Index>();

export function touch(w: World): void {
  w.stamp = (w.stamp ?? 0) + 1;
}

function place(ix: Index, f: Fighter): void {
  if (f.status !== "active") return;
  const k = f.promo ? `${f.promo}:${f.div}` : null;
  if (k) {
    let l = ix.roster.get(k);
    if (!l) ix.roster.set(k, (l = []));
    l.push(f);
  } else ix.free.push(f);
  const g = f.gym || null;
  if (g) {
    let l = ix.byGym.get(g);
    if (!l) ix.byGym.set(g, (l = []));
    l.push(f);
  }
  ix.at.set(f.id, { k, g });
}

function unplace(ix: Index, f: Fighter): void {
  const at = ix.at.get(f.id);
  if (!at) return;
  const drop = (l: Fighter[] | undefined) => {
    if (!l) return;
    const i = l.indexOf(f);
    if (i >= 0) l.splice(i, 1);
  };
  drop(at.k ? ix.roster.get(at.k) : ix.free);
  if (at.g) drop(ix.byGym.get(at.g));
  ix.at.delete(f.id);
}

function build(w: World): Index {
  const ix: Index = { stamp: w.rstamp ?? 0, roster: new Map(), free: [], byGym: new Map(), at: new Map() };
  for (const f of Object.values(w.fighters)) place(ix, f);
  return ix;
}

/**
 * Who is on which roster changed: a fighter signed, released, retired, added, or moved
 * to another weight or gym. With the fighter, the index is patched in place; without,
 * it's rebuilt when next read. (It used to be rebuilt after every change to the world,
 * a quarter of the simulation's time.)
 */
export function touchRoster(w: World, f?: Fighter): void {
  const ix = cache.get(w);
  const current = !!ix && ix.stamp === (w.rstamp ?? 0);
  w.rstamp = (w.rstamp ?? 0) + 1;
  if (ix && current && f) {
    unplace(ix, f);
    place(ix, f);
    ix.stamp = w.rstamp;
  }
  touch(w);
}

function index(w: World): Index {
  let ix = cache.get(w);
  if (!ix || ix.stamp !== (w.rstamp ?? 0)) {
    ix = build(w);
    cache.set(w, ix);
  }
  return ix;
}

export function rosterOf(w: World, promo: PromoId, div: DivisionId): Fighter[] {
  return index(w).roster.get(`${promo}:${div}`) ?? [];
}

export function promoRoster(w: World, promo: PromoId): Fighter[] {
  const out: Fighter[] = [];
  for (const d of PROMOTIONS[promo].divisions) out.push(...rosterOf(w, promo, d));
  return out;
}

export function freeAgents(w: World): Fighter[] {
  return index(w).free;
}

export function gymMembers(w: World, gym: string): Fighter[] {
  return index(w).byGym.get(gym) ?? [];
}

export function isControlled(w: World, id: string): boolean {
  return w.career.fighters.includes(id);
}

export function boutsOf(w: World, f: Fighter): Bout[] {
  return f.bouts.map((id) => w.bouts[id]).filter((b): b is Bout => !!b);
}

export function lastBout(w: World, f: Fighter): Bout | undefined {
  for (let k = f.bouts.length - 1; k >= 0; k--) {
    const b = w.bouts[f.bouts[k]];
    if (b && b.status === "done") return b;
  }
  return undefined;
}

export function opponentOf(b: Bout, id: string): string {
  return b.a === id ? b.b : b.a;
}

export function resultFor(b: Bout, id: string): "W" | "L" | "D" | "NC" | null {
  if (!b.res) return null;
  if (b.res.method === "NC") return "NC";
  if (b.res.winner === null) return "D";
  const mine = b.a === id ? "a" : "b";
  return b.res.winner === mine ? "W" : "L";
}

export function formOf(w: World, f: Fighter, n = 5): ("W" | "L" | "D" | "NC")[] {
  const out: ("W" | "L" | "D" | "NC")[] = [];
  for (let k = f.bouts.length - 1; k >= 0 && out.length < n; k--) {
    const b = w.bouts[f.bouts[k]];
    if (!b || b.status !== "done") continue;
    const r = resultFor(b, f.id);
    if (r) out.push(r);
  }
  return out;
}

/** Rank in the promotion's division: 0 champion, 1-15 ranked, null unranked (an interim champion counts as 1). */
export function rankOf(w: World, f: Fighter): number | null {
  if (!f.promo) return null;
  const ps = w.promos[f.promo];
  if (!ps) return null;
  if (ps.champs[f.div] === f.id) return 0;
  const list = ps.ranks[f.div];
  if (!list) return null;
  const i = list.indexOf(f.id);
  return i >= 0 ? rankNumber(list, ps.interim[f.div] ?? null, i) : null;
}

/**
 * Rank in one of a promotion's divisions, the fighter's own or another weight
 * where a ranked win put them on the list too: 0 champion, 1-15, or null.
 */
export function rankIn(w: World, f: Fighter, promo: PromoId, div: DivisionId): number | null {
  const ps = w.promos[promo];
  if (!ps || f.promo !== promo) return null;
  if (ps.champs[div] === f.id) return 0;
  const list = ps.ranks[div];
  if (!list) return null;
  const i = list.indexOf(f.id);
  return i >= 0 ? rankNumber(list, ps.interim[div] ?? null, i) : null;
}

/** The other weights where a fighter is ranked as well, best first. */
export function otherRanks(w: World, f: Fighter): { div: DivisionId; rank: number }[] {
  if (!f.promo || !f.xw?.length) return [];
  const out: { div: DivisionId; rank: number }[] = [];
  for (const x of f.xw) {
    if (x.promo !== f.promo || x.div === f.div) continue;
    const r = rankIn(w, f, f.promo, x.div);
    if (r) out.push({ div: x.div, rank: r });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

/**
 * The number at a place in a ranking list. An interim champion heads the list
 * without a number, as on the UFC's rankings, so the first contender under
 * them is still number one.
 */
export function rankNumber(list: string[], interim: string | null, i: number): number {
  return interim && list[0] === interim ? Math.max(1, i) : i + 1;
}

export function isChampion(w: World, f: Fighter): boolean {
  return !!f.promo && w.promos[f.promo]?.champs[f.div] === f.id;
}

export function isInterim(w: World, f: Fighter): boolean {
  return !!f.promo && w.promos[f.promo]?.interim[f.div] === f.id;
}

export function rankLabel(w: World, f: Fighter): string {
  const r = rankOf(w, f);
  if (r === 0) return "C";
  if (isInterim(w, f)) return "IC";
  return r ? `#${r}` : "";
}

export function addNews(w: World, n: Omit<News, "id" | "day"> & { day?: number }): void {
  w.news.unshift({ id: nextId(w, "n"), day: n.day ?? w.day, ...n });
  if (w.news.length > 600) w.news.length = 600;
}

export function eventOf(w: World, b: Bout): MMAEvent | undefined {
  return w.events[b.ev];
}

export function recordText(f: Fighter): string {
  const r = f.rec;
  return `${r.w}-${r.l}${r.d ? `-${r.d}` : ""}${r.nc ? ` (${r.nc} NC)` : ""}`;
}

export function amRecordText(f: Fighter): string {
  const r = f.am;
  return `${r.w}-${r.l}${r.d ? `-${r.d}` : ""}`;
}

/** Days until a fighter could fight again (injury, suspension). */
export function availableFrom(f: Fighter): number {
  return Math.max(f.injury ? f.injury.until : 0, f.susp || 0);
}

export function isAvailable(f: Fighter, day: number): boolean {
  return f.status === "active" && !f.booked && availableFrom(f) <= day;
}

export function fightsInPromo(w: World, f: Fighter, promo: PromoId): number {
  let n = 0;
  for (const id of f.bouts) {
    const b = w.bouts[id];
    if (b && b.status === "done" && b.promo === promo) n++;
  }
  return n;
}

/** Fights on a promotion's stage: in this world, plus a real fighter's before it began. */
export function stageFights(w: World, f: Fighter, promo: PromoId): number {
  return fightsInPromo(w, f, promo) + (f.prior?.promo === promo ? f.prior.n : 0);
}

/** Ring rust: nothing for nine months, then it builds and is complete at about two years. */
export function ringRust(days: number): number {
  if (days < 270) return 0;
  return Math.min(1, Math.sqrt((days - 270) / 530));
}

export function daysSinceFight(w: World, f: Fighter): number {
  return f.lastFight === null ? 9999 : w.day - f.lastFight;
}
