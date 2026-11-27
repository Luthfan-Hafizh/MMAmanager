// Work done in steps: a generator that yields wherever it is safe to stop for a moment.
// The simulation runs the same code either way: drained at once in checks and headless
// runs, or a few milliseconds at a time by Continue, so the page keeps drawing.

export type Steps<T> = Generator<void, T, void>;

/** Run steps to the end at once. */
export function drain<T>(steps: Steps<T>): T {
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
  }
}

/** Let the page draw and answer clicks before going on. */
export function yieldToPage(): Promise<void> {
  const sch = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (sch?.yield) return sch.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Run steps a slice at a time, yielding to the page whenever a slice has taken `slice` ms. */
export async function runSliced<T>(steps: Steps<T>, slice = 12): Promise<T> {
  let until = performance.now() + slice;
  for (;;) {
    const s = steps.next();
    if (s.done) return s.value;
    if (performance.now() >= until) {
      await yieldToPage();
      until = performance.now() + slice;
    }
  }
}
