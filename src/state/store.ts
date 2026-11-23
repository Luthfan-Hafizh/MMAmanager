// The app's store: one world, mutated in place by the simulation, and a
// version number React components subscribe to.

import { useSyncExternalStore } from "react";
import type { World } from "../model/types";
import type { RosterFile } from "../world/real";
import { createWorld, type NewGameOptions } from "../world/create";
import { advance, type AdvanceResult } from "../sim/advance";
import { saveWorld } from "./persist";

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

let roster: RosterFile | null = null;
export async function loadRoster(): Promise<RosterFile> {
  if (roster) return roster;
  const r = await fetch(`${import.meta.env.BASE_URL}data/roster.json`);
  if (!r.ok) throw new Error("Could not load the roster.");
  roster = (await r.json()) as RosterFile;
  return roster;
}

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

let saving = false;
let saveAgain = false;
export async function save(): Promise<void> {
  const w = state.world;
  if (!w) return;
  if (saving) {
    saveAgain = true;
    return;
  }
  saving = true;
  try {
    await saveWorld(w);
  } catch (e) {
    console.error(e);
    toast("Saving failed. Export the career from Settings to be safe.", "bad");
  } finally {
    saving = false;
    if (saveAgain) {
      saveAgain = false;
      void save();
    }
  }
}

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
  void save();
  return { days: total, stop };
}

export function setBusy(text: string | null): void {
  state.busy = text;
  emit();
}
