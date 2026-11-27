// Answers to inbox decisions, shared by the interface and the headless checks.

import type { World } from "../model/types";
import { withRng, touch } from "../world/core";
import { withdraw } from "../world/matchmaking";
import { acceptFight, declineFight, rejectContract, signContract } from "./offers";
import { answerMedia, answerMicrophone, type Tone } from "./fightweek";
import { answerInjury } from "./injury";
import { autoPlay, sessionById, skipSession } from "./media";
import { answerScale } from "./weighin";
import { answerLife } from "./life";
import type { DeclineReason } from "./promoter";
import { answerTryout } from "./tryout";
import { answerRtu } from "../world/roadtoufc";

export function answer(w: World, msgId: string, action: string): string {
  const m = w.inbox.find((x) => x.id === msgId);
  if (!m) return "";
  m.read = true;
  let text = "";
  if (m.kind === "offer" && m.ref) {
    // "decline:<reason>" says why; a bare "decline" (an old message) gives no reason.
    text = action === "accept" ? acceptFight(w, m.ref) : declineFight(w, m.ref, false, action.startsWith("decline:") ? (action.slice(8) as DeclineReason) : undefined);
  } else if (action.startsWith("tryout:")) {
    text = answerTryout(w, m, action);
  } else if (action.startsWith("rtu:")) {
    text = answerRtu(w, m, action);
  } else if (m.kind === "contract" && m.ref) {
    if (action === "sign") text = withRng(w, (rng) => signContract(w, rng, m.ref!));
    else if (action === "reject") text = rejectContract(w, m.ref);
    else return "";
  } else if (action.startsWith("media:") && m.ref && m.fighter) {
    const b = w.bouts[m.ref];
    if (b) text = answerMedia(w, b, w.fighters[m.fighter], action.slice(6) as Tone);
    // A quick tone instead of the questions: any session that was started is over.
    const s = m.data?.session ? sessionById(w, String(m.data.session)) : undefined;
    if (s && !s.done) {
      s.done = true;
      s.skipped = true;
      s.summary = text;
    }
  } else if (action === "press:go") {
    text = autoPlay(w, m);
  } else if (action === "press:skip") {
    text = skipSession(w, m);
  } else if (action.startsWith("miss:") || action.startsWith("oppmiss:") || action.startsWith("faceoff:")) {
    text = answerScale(w, m, action);
  } else if (action.startsWith("life:")) {
    text = answerLife(w, m, action.slice(5));
  } else if ((action.startsWith("callout:") || action === "titleshot" || action === "bmfcall") && m.fighter) {
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
  for (const m of [...w.inbox]) {
    if (!m.needs || m.done) continue;
    if (m.kind === "offer") answer(w, m.id, "accept");
    // A contract is signed; an invitation (the Contender Series) accepted.
    else if (m.kind === "contract") answer(w, m.id, m.actions?.[0]?.id ?? "sign");
    // Everything else: the first choice (the questions answered in the fighter's own voice, the extra hour, the stare-down).
    else if (m.actions?.length) answer(w, m.id, m.actions[0].id);
    else {
      m.needs = false;
      m.done = "ok";
    }
  }
}
