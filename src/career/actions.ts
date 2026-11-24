// Answers to inbox decisions, shared by the interface and the headless checks.

import type { World } from "../model/types";
import { withRng, touch } from "../world/core";
import { withdraw } from "../world/matchmaking";
import { acceptFight, declineFight, rejectContract, signContract } from "./offers";
import { answerMedia, answerMicrophone, type Tone } from "./fightweek";
import { answerInjury } from "./injury";

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
  } else if (action.startsWith("media:") && m.ref && m.fighter) {
    const b = w.bouts[m.ref];
    if (b) text = answerMedia(w, b, w.fighters[m.fighter], action.slice(6) as Tone);
  } else if ((action.startsWith("callout:") || action === "titleshot") && m.fighter) {
    text = answerMicrophone(w, w.fighters[m.fighter], action);
  } else if (m.kind === "injury" && m.fighter && m.actions?.length) {
    const f = w.fighters[m.fighter];
    text = withRng(w, (rng) => answerInjury(w, rng, f, action, m.ref));
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
    else if (m.kind === "injury" && m.actions?.length) answer(w, m.id, m.actions[0].id);
    else if (m.actions?.some((a) => a.id === "media:confident")) answer(w, m.id, "media:confident");
    else {
      m.needs = false;
      m.done = "ok";
    }
  }
}
