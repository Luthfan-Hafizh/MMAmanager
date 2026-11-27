// The app's store: one world, mutated in place by the simulation, and a
// version number React components subscribe to.

import { useSyncExternalStore } from "react";
import type { World } from "../model/types";
import { createWorld, type NewGameOptions } from "../world/create";
import { advance, type AdvanceResult } from "../sim/advance";
import { saveWorld } from "./persist";
import { loadRoster } from "./roster";

type Listener = () => void;

interface State {
  world: World | null;
  version: number;
  busy: string | null;
  toast: { text: string; kind: "info" | "good" | "bad"; id: number } | null;
  lastStop: AdvanceResult["stop"];
}

const state: State = { world: null, version: 0, busy: null, toast: null, lastStop: null };
const listeners = new Set<Listener>();

function emit() {
  state.version++;
  for (const l of listeners) l();
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getState(): State {
  return state;
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state), () => sel(state));
}

/** Re-render on every world change; returns the world (throws if none). */
export function useWorld(): World {
  useSyncExternalStore(subscribe, () => state.version, () => state.version);
  if (!state.world) throw new Error("No world loaded");
  return state.world;
}

export function useVersion(): number {
  return useSyncExternalStore(subscribe, () => state.version, () => state.version);
}

export function changed(): void {
  emit();
  // Whatever was just done (an offer answered, a plan changed) is kept even without a Continue.
  saveSoon();
}

export function setWorld(w: World | null): void {
  state.world = w;
  state.lastStop = null;
  emit();
}

export function toast(text: string, kind: "info" | "good" | "bad" = "info"): void {
  state.toast = { text, kind, id: Date.now() };
  emit();
  const id = state.toast.id;
  setTimeout(() => {
    if (state.toast?.id === id) {
      state.toast = null;
      emit();
    }
  }, 3800);
}

export { loadRoster };

export async function newGame(o: NewGameOptions): Promise<World> {
  state.busy = "Building the world…";
  emit();
  await new Promise((r) => setTimeout(r, 30));
  const ros = await loadRoster();
  const w = createWorld(ros, o);
  state.world = w;
  state.busy = null;
  emit();
  void saveWorld(w);
  return w;
}

let running: Promise<boolean> | null = null;
let queued: Promise<boolean> | null = null;

async function saveNow(): Promise<boolean> {
  const w = state.world;
  if (!w) return false;
  try {
    await saveWorld(w);
    return true;
  } catch (e) {
    console.error(e);
    toast("Saving failed. Export the career from Settings to be safe.", "bad");
    return false;
  }
}

/**
 * Save the career. Resolves once a save that includes every change made before
 * the call is on disk (true), or failed (false). Calls during a save share one
 * more save after it.
 */
export function save(): Promise<boolean> {
  if (!running) {
    running = saveNow().finally(() => {
      running = null;
    });
    return running;
  }
  if (!queued) {
    queued = running.then(() => {
      queued = null;
      return save();
    });
  }
  return queued;
}

// ---------- saving in a quiet moment ----------

type Pending = { idle: boolean; id: number };
let pending: Pending | null = null;
const canStore = () => typeof indexedDB !== "undefined";

/**
 * Save when the browser has a quiet moment, within a couple of seconds: a run of
 * Continue doesn't stop to save after every week (a big career takes a moment to
 * write). Leaving the tab saves at once.
 */
export function saveSoon(): void {
  if (pending || !canStore() || !state.world) return;
  const run = () => {
    pending = null;
    void save();
  };
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  pending = ric ? { idle: true, id: ric(run, { timeout: 2500 }) } : { idle: false, id: setTimeout(run, 1500) as unknown as number };
}

function flushSave(): void {
  if (!pending) return;
  const cic = (globalThis as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
  if (pending.idle && cic) cic(pending.id);
  else if (!pending.idle) clearTimeout(pending.id);
  pending = null;
  void save();
}

if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSave();
  });
}
if (typeof window !== "undefined" && typeof window.addEventListener === "function") window.addEventListener("pagehide", flushSave);

/** Continue: advance in small steps so the page stays responsive. */
export async function continueGame(max = 7): Promise<AdvanceResult | null> {
  const w = state.world;
  if (!w || state.busy) return null;
  state.busy = "Processing…";
  emit();
  let total = 0;
  let stop: AdvanceResult["stop"] = null;
  try {
    while (total < max) {
      const r = advance(w, 1);
      total += r.days;
      if (r.stop && r.stop.kind !== "week") {
        stop = r.stop;
        break;
      }
      if (r.days === 0) break;
      // let the browser breathe
      await new Promise((res) => setTimeout(res, 0));
    }
    if (!stop) stop = { kind: "week", text: total >= 7 ? "A week has passed." : "" };
  } finally {
    state.busy = null;
    state.lastStop = stop;
    emit();
  }
  saveSoon();
  return { days: total, stop };
}

export function setBusy(text: string | null): void {
  state.busy = text;
  emit();
}
