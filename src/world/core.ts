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
  return `${f.first} ${f.surname}`;
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
}

const cache = new WeakMap<World, Index>();

export function touch(w: World): void {
  w.stamp = (w.stamp ?? 0) + 1;
}

function build(w: World): Index {
  const roster = new Map<string, Fighter[]>();
  const free: Fighter[] = [];
  const byGym = new Map<string, Fighter[]>();
  for (const f of Object.values(w.fighters)) {
    if (f.status !== "active") continue;
    if (f.promo) {
      const k = `${f.promo}:${f.div}`;
      let l = roster.get(k);
      if (!l) roster.set(k, (l = []));
      l.push(f);
    } else free.push(f);
    if (f.gym) {
      let g = byGym.get(f.gym);
      if (!g) byGym.set(f.gym, (g = []));
      g.push(f);
    }
  }
  return { stamp: w.stamp, roster, free, byGym };
}

function index(w: World): Index {
  let ix = cache.get(w);
  if (!ix || ix.stamp !== w.stamp) {
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

/** Rank in the promotion's division: 0 champion, 1-15 ranked, null unranked. */
export function rankOf(w: World, f: Fighter): number | null {
  if (!f.promo) return null;
  const ps = w.promos[f.promo];
  if (!ps) return null;
  if (ps.champs[f.div] === f.id) return 0;
  const list = ps.ranks[f.div];
  if (!list) return null;
  const i = list.indexOf(f.id);
  return i >= 0 ? i + 1 : null;
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

export function daysSinceFight(w: World, f: Fighter): number {
  return f.lastFight === null ? 9999 : w.day - f.lastFight;
}
