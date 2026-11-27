// Saves as tables. The world's big collections (the bouts, the fighters, the events) are
// written once as their field names and then a row of values for each record, and the
// records inside them that every one of them has (a bout's result, a fighter's
// attributes, statistics and records) likewise. Nothing is dropped: unpacking gives back
// the same world. An eight-year career comes to about two thirds of its plain JSON.
//
// The writing goes a chunk of records at a time, so a save made in the browser's quiet
// moments can stop between chunks and let the page get on with things (packSliced).

import type { World } from "../model/types";

/** A field this record doesn't have. */
const NONE = "\u0000";
/** Fields at least this share of records have go in the row; the rest in the row's extras. */
const COMMON = 0.2;
/** Records written between checks of the clock. */
const CHUNK = 100;

interface Shape {
  /** The fields, in row order. */
  k: string[];
  /** Fields whose values are records too, with their own shapes. */
  n?: Record<string, Shape>;
}

interface Table {
  s: Shape;
  /** The map's keys, when they aren't the records' own ids. */
  keys?: string[];
  r: unknown[][];
}

export interface PackedWorld {
  packed: 1;
  base: Record<string, unknown>;
  t: Record<string, Table>;
}

type Rec = Record<string, unknown>;

/** Which collections are tables, and which of their fields are records to nest. */
const TABLES: Record<string, string[]> = {
  bouts: ["res"],
  fighters: ["attrs", "stats", "rec", "am", "hid", "pers", "dmg"],
  events: [],
};

const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * The fields most records share, in the order they first appear, and the same for the
 * records nested in them: counted a chunk of records at a time.
 */
function* shapeOf(rows: Rec[], nest: string[]): Generator<void, Shape, void> {
  const count = new Map<string, number>();
  const inner = new Map<string, { n: number; count: Map<string, number> }>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    for (const k in r) count.set(k, (count.get(k) ?? 0) + 1);
    for (const f of nest) {
      const v = r[f];
      if (!isRec(v)) continue;
      let c = inner.get(f);
      if (!c) inner.set(f, (c = { n: 0, count: new Map() }));
      c.n++;
      for (const k in v) c.count.set(k, (c.count.get(k) ?? 0) + 1);
    }
    if (i % CHUNK === CHUNK - 1) yield;
  }
  const common = (c: Map<string, number>, n: number) => [...c.entries()].filter(([, m]) => m >= n * COMMON).map(([key]) => key);
  const s: Shape = { k: common(count, rows.length) };
  for (const f of nest) {
    const c = inner.get(f);
    if (c && s.k.includes(f)) (s.n ??= {})[f] = { k: common(c.count, c.n) };
  }
  return s;
}

/** Each shape's fields as a set, for telling the extras apart. */
const fieldSets = new WeakMap<Shape, Set<string>>();
function fieldsOf(s: Shape): Set<string> {
  let set = fieldSets.get(s);
  if (!set) fieldSets.set(s, (set = new Set(s.k)));
  return set;
}

function packRow(r: Rec, s: Shape): unknown[] {
  const row: unknown[] = new Array(s.k.length);
  const fields = fieldsOf(s);
  let extra: Rec | null = null;
  for (let i = 0; i < s.k.length; i++) {
    const key = s.k[i];
    const v = r[key];
    const inner = s.n?.[key];
    if (v === undefined) row[i] = NONE;
    else if (inner && isRec(v)) row[i] = packRow(v, inner);
    else if (inner && v !== null) {
      // Not a record where records are nested (an array, say): kept whole in the extras.
      row[i] = NONE;
      (extra ??= {})[key] = v;
    } else row[i] = v;
  }
  for (const key in r) {
    if (r[key] === undefined || fields.has(key)) continue;
    (extra ??= {})[key] = r[key];
  }
  if (extra) row.push(extra);
  return row;
}

function unpackRow(row: unknown[], s: Shape): Rec {
  const r: Rec = {};
  for (let i = 0; i < s.k.length; i++) {
    const v = row[i];
    if (v === NONE) continue;
    const inner = s.n?.[s.k[i]];
    r[s.k[i]] = inner && Array.isArray(v) ? unpackRow(v, inner) : v;
  }
  if (row.length > s.k.length && isRec(row[s.k.length])) Object.assign(r, row[s.k.length]);
  return r;
}

/** The save as JSON, a chunk of records at a time: each yield is a place to stop for a moment. */
function* packParts(w: World): Generator<void, string, void> {
  const src = w as unknown as Rec;
  const base: Rec = {};
  for (const key in src) if (!(key in TABLES)) base[key] = src[key];
  const parts: string[] = [`{"packed":1,"base":${JSON.stringify(base)},"t":{`];
  let firstTable = true;
  for (const [name, nest] of Object.entries(TABLES)) {
    const map = (src[name] ?? {}) as Record<string, Rec>;
    const keys = Object.keys(map);
    const rows = keys.map((key) => map[key]);
    const byId = rows.every((r, i) => isRec(r) && r.id === keys[i]);
    yield;
    const shape = yield* shapeOf(rows, nest);
    parts.push(`${firstTable ? "" : ","}${JSON.stringify(name)}:{"s":${JSON.stringify(shape)}${byId ? "" : `,"keys":${JSON.stringify(keys)}`},"r":[`);
    firstTable = false;
    for (let i = 0; i < rows.length; i += CHUNK) {
      let chunk = "";
      const end = Math.min(rows.length, i + CHUNK);
      for (let j = i; j < end; j++) chunk += (j ? "," : "") + JSON.stringify(packRow(rows[j], shape));
      parts.push(chunk);
      yield;
    }
    parts.push("]}");
  }
  parts.push("}}");
  return parts.join("");
}

/** The whole save at once. */
export function packNow(w: World): string {
  const it = packParts(w);
  for (;;) {
    const step = it.next();
    if (step.done) return step.value;
  }
}

type IdleDeadline = { timeRemaining: () => number };
const ric = () => (globalThis as { requestIdleCallback?: (cb: (d: IdleDeadline) => void, o?: { timeout: number }) => number }).requestIdleCallback;

/** A quiet moment: resolves with the time to stop working by. */
function quiet(): Promise<number> {
  const idle = ric();
  return new Promise((resolve) => {
    if (idle) idle((d) => resolve(performance.now() + Math.max(4, Math.min(24, d.timeRemaining()))), { timeout: 1000 });
    else setTimeout(() => resolve(performance.now() + 10), 0);
  });
}

/**
 * The save written in the browser's quiet moments, a few milliseconds at a time.
 * Null when `still` says the world has moved on in the meantime: the caller saves later.
 */
export async function packSliced(w: World, still: () => boolean): Promise<string | null> {
  const it = packParts(w);
  let until = await quiet();
  if (!still()) return null;
  for (;;) {
    const step = it.next();
    if (step.done) return step.value;
    if (performance.now() > until) {
      until = await quiet();
      if (!still()) return null;
    }
  }
}

/** A save read back: packed saves are unpacked, plain ones (older saves, older exports) pass through. */
export function unpack(data: unknown): World {
  if (!isRec(data) || data.packed !== 1) return data as World;
  const p = data as unknown as PackedWorld;
  const w: Rec = { ...p.base };
  for (const [name, t] of Object.entries(p.t)) {
    const map: Record<string, Rec> = {};
    for (let i = 0; i < t.r.length; i++) {
      const r = unpackRow(t.r[i], t.s);
      map[t.keys ? t.keys[i] : (r.id as string)] = r;
    }
    w[name] = map;
  }
  return w as unknown as World;
}
