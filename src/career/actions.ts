// Answers to inbox decisions, shared by the interface and the headless checks.

import type { World } from "../model/types";
import { withRng, touch } from "../world/core";
import { withdraw } from "../world/matchmaking";
import { acceptFight, declineFight, rejectContract, signContract } from "./offers";

export function answer(w: World, msgId: string, action: string): string {
  const m = w.inbox.find((x) => x.id === msgId);
  if (!m) return "";
  m.read = true;
  let text = "";
  if (m.kind === "offer" && m.ref) {
    text = action === "accept" ? acceptFight(w, m.ref) : declineFight(w, m.ref);
  } else if (m.kind === "contract" && m.ref) {
    if (action === "sign") text = withRng(w, (rng) => signContract(w, rng, m.ref!));
    else if (action === "reject") text = rejectContract(w, m.ref);
    else return "";
  } else if (m.kind === "injury" && m.ref) {
    const b = w.bouts[m.ref];
    if (action === "pull-out" && b && b.status === "booked" && m.fighter) {
      withRng(w, (rng) => withdraw(w, rng, b, m.fighter!, "injury"));
      const fc = w.career.fc[m.fighter];
      if (fc) fc.camp = null;
      text = "Pulled out of the fight.";
    } else text = "Fighting through it. The doctors will look again on fight week.";
  }
  m.done = text || action;
  m.needs = false;
  touch(w);
  return text;
}

/** For checks and the 'auto' option: answer every waiting decision sensibly. */
export function autoAnswer(w: World): void {
  for (const m of w.inbox) {
    if (!m.needs || m.done) continue;
    if (m.kind === "offer") answer(w, m.id, "accept");
    else if (m.kind === "contract") answer(w, m.id, "sign");
    else if (m.kind === "injury") answer(w, m.id, "fight-hurt");
    else {
      m.needs = false;
      m.done = "ok";
    }
  }
}
