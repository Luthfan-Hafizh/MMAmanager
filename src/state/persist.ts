// Saves: compressed JSON in IndexedDB, one record per career, plus export and import.
// The JSON is the world as tables (state/codec.ts); older plain saves still load.

import type { World } from "../model/types";
import { packNow, packSliced, unpack } from "./codec";
import { migrate, repair, OLDEST_SAVE, SAVE_VERSION } from "../world/create";
import { loadRoster } from "./roster";
import { ymd } from "../core/time";
import { dropWorldTapes } from "./live";

export interface SaveMeta {
  id: string;
  name: string;
  mode: World["career"]["mode"];
  who: string;
  day: number;
  savedAt: number;
  version: number;
  size: number;
  /** A backup copy: the career it belongs to, and its slot. */
  backupOf?: string;
  slot?: number;
}

const DB = "mma-manager";
const STORE = "saves";
const META = "meta";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function gzip(text: string): Promise<Uint8Array | string> {
  if (typeof CompressionStream === "undefined") return text;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(data: Uint8Array | string): Promise<string> {
  if (typeof data === "string") return data;
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

export function metaOf(w: World, size = 0): SaveMeta {
  const first = w.career.fighters[0] ? w.fighters[w.career.fighters[0]] : undefined;
  return {
    id: w.id,
    name: w.name,
    mode: w.career.mode,
    who: w.career.mode === "manager" ? w.career.agency?.name ?? w.career.name : first ? `${first.first} ${first.surname}` : w.career.name,
    day: w.day,
    savedAt: Date.now(),
    version: w.v,
    size,
  };
}

// Backups: the first save of every month of game time also goes in one of three
// rotating slots, so the last three months can be restored from the title screen.
const BACKUPS = 3;
const bakKey = (id: string, slot: number) => `${id}#bak#${slot}`;
const backedUp = new Map<string, number>();

/**
 * Write the career. With `still`, the writing is done in the browser's quiet moments and
 * gives way (null, nothing written) when `still` says the world has changed meanwhile.
 */
export async function saveWorld(w: World, still?: () => boolean): Promise<SaveMeta | null> {
  const json = still ? await packSliced(w, still) : packNow(w);
  if (json === null) return null;
  const data = await gzip(json);
  const db = await open();
  const meta = metaOf(w, typeof data === "string" ? data.length : data.byteLength);
  await tx(db, STORE, "readwrite", (s) => s.put(data, w.id));
  await tx(db, META, "readwrite", (s) => s.put(meta, w.id));
  const t = ymd(w.day);
  const month = t.y * 12 + t.m;
  if (backedUp.get(w.id) !== month) {
    const slot = month % BACKUPS;
    await tx(db, STORE, "readwrite", (s) => s.put(data, bakKey(w.id, slot)));
    await tx(db, META, "readwrite", (s) => s.put({ ...meta, backupOf: w.id, slot }, bakKey(w.id, slot)));
    backedUp.set(w.id, month);
  }
  db.close();
  return meta;
}

/** A career's backups, newest game date first. */
export async function listBackups(id: string): Promise<SaveMeta[]> {
  try {
    const db = await open();
    const out: SaveMeta[] = [];
    for (let k = 0; k < BACKUPS; k++) {
      const m = await tx<SaveMeta | undefined>(db, META, "readonly", (s) => s.get(bakKey(id, k)) as IDBRequest<SaveMeta | undefined>);
      if (m) out.push(m);
    }
    db.close();
    return out.sort((a, b) => b.day - a.day);
  } catch {
    return [];
  }
}

/** A backup, read back like a save. */
export async function loadBackup(id: string, slot: number): Promise<World | null> {
  const db = await open();
  const data = await tx<Uint8Array | string | undefined>(db, STORE, "readonly", (s) => s.get(bakKey(id, slot)) as IDBRequest<Uint8Array | string | undefined>);
  db.close();
  if (!data) return null;
  return upToDate(unpack(JSON.parse(await gunzip(data))));
}

export async function listSaves(): Promise<SaveMeta[]> {
  try {
    const db = await open();
    const all = await tx<SaveMeta[]>(db, META, "readonly", (s) => s.getAll() as IDBRequest<SaveMeta[]>);
    db.close();
    return all.filter((m) => !m.backupOf).sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

export async function loadWorld(id: string): Promise<World | null> {
  const db = await open();
  const data = await tx<Uint8Array | string | undefined>(db, STORE, "readonly", (s) => s.get(id) as IDBRequest<Uint8Array | string | undefined>);
  db.close();
  if (!data) return null;
  return upToDate(unpack(JSON.parse(await gunzip(data))));
}

/** Bring an older save up to date; the roster file fills in what old saves did not keep. */
async function upToDate(w: World): Promise<World> {
  repair(w);
  if (w.v >= SAVE_VERSION) return w;
  return migrate(w, await loadRoster().catch(() => null));
}

export async function deleteSave(id: string): Promise<void> {
  dropWorldTapes(id);
  const db = await open();
  await tx(db, STORE, "readwrite", (s) => s.delete(id));
  await tx(db, META, "readwrite", (s) => s.delete(id));
  for (let k = 0; k < BACKUPS; k++) {
    await tx(db, STORE, "readwrite", (s) => s.delete(bakKey(id, k)));
    await tx(db, META, "readwrite", (s) => s.delete(bakKey(id, k)));
  }
  db.close();
}

export function compatible(m: SaveMeta | World): boolean {
  const v = "version" in m ? m.version : m.v;
  return v >= OLDEST_SAVE && v <= SAVE_VERSION;
}

export function exportWorld(w: World): void {
  w.career.lastExport = w.day;
  const blob = new Blob([packNow(w)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const who = metaOf(w).who.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  a.download = `mma-manager-${who}-${w.day}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export async function importFile(file: File): Promise<World> {
  let text: string;
  if (file.name.endsWith(".gz")) text = await gunzip(new Uint8Array(await file.arrayBuffer()));
  else text = await file.text();
  let w: World;
  try {
    w = unpack(JSON.parse(text));
  } catch {
    throw new Error("That file is not an MMA Manager save.");
  }
  if (!w || !w.fighters || !w.career) throw new Error("That file is not an MMA Manager save.");
  if (!compatible(w)) throw new Error(`This save is from another version of the game (format ${w.v}).`);
  return upToDate(w);
}
