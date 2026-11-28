// A fight being watched. It stays in memory while the player looks at other
// pages, and its tape (every call, shout and plan change, at the exchange it came)
// is kept in this browser, so a reload rebuilds it exactly where it was. The
// result goes into the world the moment the fight ends (ui/pages/FightNight.tsx),
// and only then is the tape thrown away: no way out of the fight screen plays
// the fight again.

import { FightSim, type FightInput, type Tape } from "../engine/sim";
import type { Bout, World } from "../model/types";
import { boutRng } from "../sim/advance";
import { fightInputFor } from "../world/results";

// Bumped when the engine changes: an old tape would play back as a different fight.
const VERSION = 5;

type Setup = Omit<FightInput, "a" | "b">;

interface Kept {
  v: number;
  day: number;
  /** The fight as it was set up at the first bell: the plans and each fighter's condition. */
  input: Setup;
  tape: Tape;
  /** Where it stands, for the fight-night card. */
  round: number;
  t: number;
  over: boolean;
}

interface Running {
  sim: FightSim;
  input: Setup;
  wid: string;
  bid: string;
  day: number;
  /** What was last written to disk, to skip writes when nothing moved. */
  written: string;
}

const running = new Map<string, Running>();
const keyOf = (wid: string) => `mma.live.${wid}`;
const idOf = (w: World, b: Bout) => `${w.id}/${b.id}`;
const mark = (s: FightSim) => `${s.steps}:${s.tape?.length ?? 0}`;

function readAll(wid: string): Record<string, Kept> {
  try {
    const raw = localStorage.getItem(keyOf(wid));
    const all = raw ? JSON.parse(raw) : null;
    return all && typeof all === "object" ? (all as Record<string, Kept>) : {};
  } catch {
    return {};
  }
}

function writeAll(wid: string, all: Record<string, Kept>): void {
  try {
    if (Object.keys(all).length) localStorage.setItem(keyOf(wid), JSON.stringify(all));
    else localStorage.removeItem(keyOf(wid));
  } catch {
    // Private mode or a full disk: the fight still lives in memory until the page closes.
  }
}

function write(r: Running): void {
  const tape = r.sim.tapeOf();
  if (!tape) return;
  const m = mark(r.sim);
  if (m === r.written) return;
  const all = readAll(r.wid);
  all[r.bid] = { v: VERSION, day: r.day, input: r.input, tape, round: r.sim.round, t: Math.round(r.sim.t), over: r.sim.over };
  writeAll(r.wid, all);
  r.written = m;
}

/** A fight on tape for this bout, today, that can still be fought on. */
function keptFor(w: World, b: Bout): Kept | null {
  if (b.status !== "booked") return null;
  const k = readAll(w.id)[b.id];
  return k && k.v === VERSION && k.day === w.day && k.tape && Array.isArray(k.tape.ops) ? k : null;
}

/** The fight for the fight-night screen: the one under way (in memory, or rebuilt from its tape), or a new one from the first bell. */
export function liveFight(w: World, b: Bout): FightSim {
  const id = idOf(w, b);
  const have = running.get(id);
  if (have) return have.sim;
  const kept = keptFor(w, b);
  if (kept) {
    const sim = FightSim.replay({ ...kept.input, a: w.fighters[b.a], b: w.fighters[b.b] }, kept.tape);
    running.set(id, { sim, input: kept.input, wid: w.id, bid: b.id, day: w.day, written: mark(sim) });
    return sim;
  }
  const mine: 0 | 1 = w.fighters[b.a].ctrl ? 0 : 1;
  const rng = boutRng(w, b);
  const full = fightInputFor(w, b, rng, rng.int(1, 2 ** 31 - 1), true);
  full.aiCorner = mine === 0 ? [false, true] : [true, false];
  // Fixed at the first bell, as it will be read back: a plan edited on another page
  // mid-fight can't change a fight that has started.
  const input = JSON.parse(JSON.stringify({ ...full, a: undefined, b: undefined })) as Setup;
  const sim = new FightSim({ ...input, a: full.a, b: full.b });
  sim.tape = [];
  const r: Running = { sim, input, wid: w.id, bid: b.id, day: w.day, written: "" };
  running.set(id, r);
  write(r);
  return sim;
}

/** Where a fight under way stands: round, seconds into it, and whether it's over. Null when it hasn't started. */
export function underWay(w: World, b: Bout): { round: number; t: number; over: boolean } | null {
  if (b.status !== "booked") return null;
  const r = running.get(idOf(w, b));
  if (r) return r.sim.steps > 0 || r.sim.tape?.length ? { round: r.sim.round, t: r.sim.t, over: r.sim.over } : null;
  const k = keptFor(w, b);
  return k && (k.tape.steps > 0 || k.tape.ops.length) ? { round: k.round, t: k.t, over: k.over } : null;
}

/** Keep the tape on disk when the fight has moved on. */
export function keepLive(w: World, b: Bout): void {
  const r = running.get(idOf(w, b));
  if (r) write(r);
}

/** The result is in the world and the world is saved: the tape can go. */
export function dropLive(w: World, b: Bout): void {
  running.delete(idOf(w, b));
  const all = readAll(w.id);
  if (all[b.id]) {
    delete all[b.id];
    writeAll(w.id, all);
  }
}

/** Throw away tapes of fights already in the books, gone, or from a day that has passed. */
export function tidyLive(w: World): void {
  const all = readAll(w.id);
  let n = 0;
  for (const [id, k] of Object.entries(all)) {
    // A result from this session waits for its save before its tape goes (dropLive).
    if (running.has(`${w.id}/${id}`)) continue;
    const b = w.bouts[id];
    if (!b || b.status !== "booked" || !k || k.day < w.day) {
      delete all[id];
      n++;
    }
  }
  if (n) writeAll(w.id, all);
}

/** What a reload does to memory (for the checks): only the tapes on disk are left. */
export function forgetLiveFights(): void {
  running.clear();
}

/** A career deleted: its paused fights go with it. */
export function dropWorldTapes(wid: string): void {
  for (const [k, r] of running) if (r.wid === wid) running.delete(k);
  writeAll(wid, {});
}

// Closing the tab or the phone putting it away: write what has moved on.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  const flush = () => {
    for (const r of running.values()) write(r);
  };
  window.addEventListener("pagehide", flush);
  window.addEventListener("visibilitychange", flush);
}
