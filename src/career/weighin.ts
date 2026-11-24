// The scale, the day before the fight. Both fighters weigh in; what happens
// next is a decision. Miss it yourself and there is the extra hour (most
// commissions give one), or you accept the fine (20% of the purse, 30% when
// it's well over) and hope the opponent still wants the fight; a champion who
// misses is stripped on the scale. When the opponent misses, you choose: take
// the fight and their money, hold out for a bigger share, or refuse it and
// collect the show money. Then the face-off, in front of the cameras.

import type { Rng } from "../core/rng";
import { clamp, money } from "../core/util";
import { PROMOTIONS } from "../data/promotions";
import type { Bout, Fact, Fighter, Message, World } from "../model/types";
import { addNews, fullName, touch, withRng } from "../world/core";
import { aiScale, stripAtScale, weightAllowance } from "../world/results";
import { cancelBout } from "../world/matchmaking";
import { notify } from "./inbox";
import { ledger, payShowOnly } from "./money";
import { addHeat, addMoment, addPop, heatOf, stageMul } from "./rivals";
import { boutLimit } from "./shortnotice";
import { tierFine } from "./media";

type Side = "a" | "b";
const other = (s: Side): Side => (s === "a" ? "b" : "a");
const missKey = (s: Side) => (s === "a" ? "missA" : "missB") as "missA" | "missB";

export interface ScaleResult {
  weight: number;
  made: boolean;
  drain: number;
  text: string;
}

/** The share of the purse a weight miss costs: 20%, or 30% when it's well over. */
export function standardFine(overLimit: number): number {
  return overLimit > 2.5 ? 0.3 : 0.2;
}

/** The chance the extra hour gets the weight off. */
export function hourChance(over: number, nutrition: number): number {
  return clamp(0.88 - over * 0.24 + nutrition * 0.05, 0.04, 0.85);
}

function her(f: Fighter, him: string, her: string): string {
  return f.sex === "F" ? her : him;
}

function big(b: Bout): boolean {
  const t = PROMOTIONS[b.promo].tier;
  return t === "major" || t === "league";
}

/** Weigh the opponent, settle what the scale says, and put the next decision in front of the player. */
export function scaleDay(w: World, rng: Rng, b: Bout, mine: Partial<Record<Side, ScaleResult>>, force: Partial<Record<Side, { weight: number; miss: boolean }>> = {}): void {
  const out = { a: 0, b: 0 } as NonNullable<Bout["weighIn"]>;
  for (const side of ["a", "b"] as const) {
    const r = mine[side];
    if (r) {
      out[side] = r.weight;
      if (!r.made) out[missKey(side)] = true;
    } else {
      // The checks can set the opponent's scale; otherwise it's the AI's cut.
      const ai = force[side] ?? aiScale(rng, b, w.fighters[b[side]]);
      out[side] = ai.weight;
      if (ai.miss) out[missKey(side)] = true;
    }
  }
  b.weighIn = out;
  if (out.missA || out.missB) b.catchweight = Math.ceil(Math.max(out.a, out.b));
  const me: Side = mine.a ? "a" : "b";
  const f = w.fighters[b[me]];
  const opp = w.fighters[b[other(me)]];
  const missMe = !!out[missKey(me)];
  const missThem = !!out[missKey(other(me))] && !mine[other(me)];
  let stripped = false;
  if (missThem) stripped = stripAtScale(w, b, opp);
  if (missMe) missDecision(w, b, f, opp, me);
  else if (missThem) oppMissDecision(w, b, f, opp, me, stripped);
  else faceoffDecision(w, b, f, opp, me, mine[me]?.text ?? "");
  touch(w);
}

function weighFacts(w: World, b: Bout, f: Fighter, opp: Fighter, side: Side): Fact[] {
  const lim = boutLimit(b);
  const wi = b.weighIn!;
  return [
    { k: f.surname, v: `${wi[side].toFixed(1)} lb`, tone: wi[missKey(side)] ? "bad" : "good" },
    { k: opp.surname, v: `${wi[other(side)].toFixed(1)} lb`, tone: wi[missKey(other(side))] ? "bad" : undefined },
    { k: "Limit", v: `${lim} lb${b.limit ? " (catchweight)" : ""}${weightAllowance(b) ? ", 1 lb allowance" : ", no allowance in a title fight"}` },
  ];
}

function missDecision(w: World, b: Bout, f: Fighter, opp: Fighter, side: Side): void {
  const lim = boutLimit(b);
  const allow = weightAllowance(b);
  const wt = b.weighIn![side];
  const over = Math.round((wt - lim - allow) * 10) / 10;
  const pct = standardFine(wt - lim);
  const purse = (f.contract?.show ?? PROMOTIONS[b.promo].showLow) * 2;
  const ps = w.promos[b.promo];
  const champ = (b.kind === "title" && ps.champs[b.div] === f.id) || (b.kind === "interim" && ps.interim[b.div] === f.id);
  const belt = b.kind === "title" || b.kind === "vacant" || b.kind === "interim";
  const nut = w.career.fc[f.id]?.camp?.nutrition ?? 0;
  const facts: Fact[] = [
    ...weighFacts(w, b, f, opp, side),
    { k: "Over by", v: `${over.toFixed(1)} lb`, tone: over > 2 ? "bad" : "warn" },
    { k: "The fine", v: `${Math.round(pct * 100)}% of the purse (about ${money(Math.round(purse * pct))}) to ${opp.surname}`, tone: "bad" },
  ];
  if (belt) facts.push({ k: "The belt", v: champ ? "Miss it and you are stripped: only the challenger can win it" : "You can't win the belt now", tone: "bad" });
  facts.push({ k: "The extra hour", v: `About ${Math.round(hourChance(over, nut) * 100)}% to make it, and the cut drains you more`, tone: "warn" });
  notify(w, {
    kind: "weighin",
    fighter: f.id,
    ref: b.id,
    from: "Athletic commission",
    subject: `Missed weight: ${over.toFixed(1)} lb over`,
    body: `${fullName(f)} steps on the scale at ${wt.toFixed(1)} lb, ${over.toFixed(1)} lb over. The commission gives an hour to try again: back to the sauna, at a price on fight night. Or accept the miss: part of the purse goes to ${opp.surname}, and ${her(opp, "he", "she")} decides whether the fight still happens.`,
    needs: true,
    actions: [
      { id: "miss:hour", label: "Use the extra hour", primary: true },
      { id: "miss:accept", label: "Accept the miss" },
    ],
    facts,
    data: { step: "miss" },
  });
}

function oppMissDecision(w: World, b: Bout, f: Fighter, opp: Fighter, side: Side, stripped: boolean): void {
  const lim = boutLimit(b);
  const ow = b.weighIn![other(side)];
  const over = Math.round((ow - lim - weightAllowance(b)) * 10) / 10;
  const pct = standardFine(ow - lim);
  const est = Math.round((opp.contract?.show ?? PROMOTIONS[b.promo].showLow) * 2 * pct);
  const show = b.purses?.[side]?.show ?? f.contract?.show ?? 0;
  const ps = w.promos[b.promo];
  const mineBelt = (b.kind === "title" && ps.champs[b.div] === f.id) || (b.kind === "interim" && ps.interim[b.div] === f.id);
  const facts: Fact[] = [
    ...weighFacts(w, b, f, opp, side),
    { k: "Over by", v: `${over.toFixed(1)} lb`, tone: "bad" },
    { k: "Your share", v: `${Math.round(pct * 100)}% of ${her(opp, "his", "her")} purse, about ${money(est)}`, tone: "good" },
  ];
  if (stripped) facts.push({ k: "The belt", v: `${opp.surname} was stripped on the scale: only you can win it`, tone: "good" });
  else if (mineBelt) facts.push({ k: "The belt", v: `Yours is on the line; ${opp.surname} can't win it`, tone: "good" });
  facts.push({ k: "Refusing", v: show && PROMOTIONS[b.promo].tier !== "amateur" ? `No fight, and the promotion pays your show money (${money(show)})` : "No fight and no purse at this level", tone: "warn" });
  notify(w, {
    kind: "weighin",
    fighter: f.id,
    ref: b.id,
    from: "Athletic commission",
    subject: `${opp.surname} missed weight by ${over.toFixed(1)} lb`,
    body: `${fullName(opp)} came in at ${ow.toFixed(1)} lb${b.extraHour === other(side) ? " even after the extra hour" : ""}. The fight can go ahead at a catchweight with part of ${her(opp, "his", "her")} purse going to you, but it's your call: you made weight, and ${her(opp, "he", "she")} will be the bigger one on the night.`,
    needs: true,
    actions: [
      { id: "oppmiss:take", label: "Take the fight and the fine", primary: true },
      { id: "oppmiss:more", label: "Hold out for a bigger share" },
      { id: "oppmiss:refuse", label: "Refuse the fight", danger: true },
    ],
    facts,
    data: { step: "oppmiss" },
  });
}

function faceoffDecision(w: World, b: Bout, f: Fighter, opp: Fighter, side: Side, context: string): void {
  const heat = heatOf(w, f.id, opp.id);
  const drain = w.career.fc[f.id]?.campCut ?? 0.15;
  const ev = w.events[b.ev];
  const mood = heat >= 50 ? `There's real bad blood (heat ${heat}): the cameras are waiting for something.` : opp.pers.controversy >= 13 ? `${opp.surname} likes a show at these.` : `${opp.surname} looks calm.`;
  notify(w, {
    kind: "weighin",
    fighter: f.id,
    ref: b.id,
    from: "Ceremonial weigh-ins",
    subject: `The face-off with ${opp.surname}`,
    body: `${context ? `${context} ` : ""}The ceremonial weigh-ins${ev ? ` for ${ev.name}` : ""}: both fighters on stage, nose to nose, the promoter in between. ${mood}`,
    needs: true,
    actions: [
      { id: "faceoff:stare", label: "Stare them down", primary: true },
      { id: "faceoff:respect", label: "Shake hands" },
      { id: "faceoff:talk", label: "Talk in their ear" },
      { id: "faceoff:shove", label: "Shove", danger: true },
    ],
    facts: [...weighFacts(w, b, f, opp, side), { k: "Fight night", v: drain > 0.35 ? "Drained: the gas tank will suffer" : drain < 0.12 ? "Fresh" : "Normal recovery", tone: drain > 0.35 ? "bad" : drain < 0.12 ? "good" : undefined }],
    data: { step: "faceoff" },
  });
}

/** The answer to a scale decision: the miss, the opponent's miss, or the face-off. */
export function answerScale(w: World, m: Message, action: string): string {
  const b = m.ref ? w.bouts[m.ref] : undefined;
  const f = m.fighter ? w.fighters[m.fighter] : undefined;
  if (!b || !f || b.status !== "booked" || !b.weighIn) return "The fight is no longer on.";
  const side: Side = b.a === f.id ? "a" : "b";
  const opp = w.fighters[b[other(side)]];
  return withRng(w, (rng) => {
    if (action === "miss:hour") return extraHour(w, rng, b, f, opp, side);
    if (action === "miss:accept") return missStands(w, rng, b, f, opp, side, "");
    if (action.startsWith("oppmiss:")) return oppMiss(w, rng, b, f, opp, side, action.slice(8));
    if (action.startsWith("faceoff:")) return faceoff(w, rng, b, f, opp, side, action.slice(8));
    return "";
  });
}

function extraHour(w: World, rng: Rng, b: Bout, f: Fighter, opp: Fighter, side: Side): string {
  const fc = w.career.fc[f.id];
  const lim = boutLimit(b);
  const allow = weightAllowance(b);
  const wt = b.weighIn![side];
  const over = wt - lim - allow;
  b.extraHour = side;
  if (rng.chance(hourChance(over, fc?.camp?.nutrition ?? 0))) {
    const nw = Math.round((lim + allow - rng.next() * 0.3) * 10) / 10;
    b.weighIn![side] = nw;
    delete b.weighIn![missKey(side)];
    if (!b.weighIn!.missA && !b.weighIn!.missB) b.catchweight = undefined;
    if (fc) {
      fc.weighed = nw;
      fc.campCut = clamp((fc.campCut ?? 0.15) + 0.1, 0, 0.85);
    }
    const text = `Back to the sauna: ${f.surname} makes ${nw.toFixed(1)} lb on the second try, an hour later. On weight, but drained; the gas tank will feel it.`;
    faceoffDecision(w, b, f, opp, side, text);
    return text;
  }
  const lost = Math.round((0.3 + rng.next() * 0.6) * 10) / 10;
  b.weighIn![side] = Math.round((wt - lost) * 10) / 10;
  if (fc) {
    fc.weighed = b.weighIn![side];
    fc.campCut = clamp((fc.campCut ?? 0.15) + 0.06, 0, 0.85);
  }
  return missStands(w, rng, b, f, opp, side, `The extra hour takes off ${lost.toFixed(1)} lb: not enough. `);
}

function missStands(w: World, rng: Rng, b: Bout, f: Fighter, opp: Fighter, side: Side, prefix: string): string {
  const lim = boutLimit(b);
  const wt = b.weighIn![side];
  const stripped = stripAtScale(w, b, f);
  const p = wt - lim > 4 ? 0.45 : wt - lim > 2.5 ? 0.75 : 0.9;
  const yes = stripped || rng.chance(p);
  addPop(f, -0.8 * stageMul(f));
  const ev = w.events[b.ev];
  if (!yes) {
    cancelBout(w, b, `${fullName(f)} missed weight; ${fullName(opp)} would not take the fight`);
    const fc = w.career.fc[f.id];
    if (fc) {
      fc.camp = null;
      fc.lastAsk = w.day + 21;
    }
    addPop(f, -0.7 * stageMul(f));
    addHeat(w, f, opp, 6, "Turned down the fight after the miss");
    if (big(b)) addNews(w, { kind: "booking", promo: b.promo, ev: b.ev, fighters: [f.id, opp.id], text: `${fullName(f)} vs ${fullName(opp)} is off${ev ? ` at ${ev.name}` : ""}: ${fullName(f)} missed weight and ${fullName(opp)} said no.` });
    addMoment(w, f, "life", `Missed weight for ${ev?.name ?? "the fight"}; ${opp.surname} refused to fight.`, opp.id);
    return `${prefix}${opp.surname} won't fight at that weight. It's off: no purse, and the matchmaker isn't happy.`;
  }
  b.catchweight = Math.ceil(Math.max(b.weighIn!.a, b.weighIn!.b));
  const share = b.fineCut?.[side] ?? standardFine(wt - lim);
  const text = `${prefix}${opp.surname} agrees to fight at a ${b.catchweight} lb catchweight. ${Math.round(share * 100)}% of the purse goes to ${her(opp, "him", "her")}.${stripped ? ` The title is gone: only ${opp.surname} can win it now.` : b.kind === "title" || b.kind === "vacant" || b.kind === "interim" ? " You can't win the belt." : ""}`;
  addMoment(w, f, "life", `Missed weight for ${ev?.name ?? "the fight"} (${wt.toFixed(1)} lb).`, opp.id);
  faceoffDecision(w, b, f, opp, side, text);
  return text;
}

function oppMiss(w: World, rng: Rng, b: Bout, f: Fighter, opp: Fighter, side: Side, choice: string): string {
  const lim = boutLimit(b);
  const ow = b.weighIn![other(side)];
  const pct = standardFine(ow - lim);
  const ev = w.events[b.ev];
  if (choice === "refuse") {
    const paid = payShowOnly(w, f, b, `${ev?.name ?? "the event"}: ${opp.surname} missed weight`);
    cancelBout(w, b, `${fullName(opp)} missed weight and ${fullName(f)} refused the fight`);
    const fc = w.career.fc[f.id];
    if (fc) fc.camp = null;
    addPop(opp, -1);
    addHeat(w, f, opp, 8, `Refused to fight ${opp.surname} after the miss`);
    if (big(b)) addNews(w, { kind: "booking", promo: b.promo, ev: b.ev, fighters: [f.id, opp.id], text: `${fullName(f)} refuses to fight ${fullName(opp)} after the weight miss${ev ? `: off ${ev.name}` : ""}.` });
    addMoment(w, f, "life", `Refused to fight ${opp.surname}, who missed weight for ${ev?.name ?? "the fight"}.`, opp.id);
    return `No fight. ${opp.surname} came in heavy and you made weight${paid ? `: ${PROMOTIONS[b.promo].short} pays your show money, ${money(paid)}` : ""}. The fans are split: some call it smart.`;
  }
  let text: string;
  if (choice === "more") {
    const yes = rng.chance(clamp(0.75 - opp.pers.greed / 40, 0.25, 0.7));
    if (yes) {
      b.fineCut = { ...(b.fineCut ?? {}), [other(side)]: pct + 0.1 };
      addHeat(w, f, opp, 6, "Held out for more of the purse");
      text = `${opp.surname}'s team gives in: ${Math.round((pct + 0.1) * 100)}% of the purse comes to you.`;
    } else {
      addHeat(w, f, opp, 4, "Held out for more of the purse");
      text = `${opp.surname}'s team won't go higher. It's the usual ${Math.round(pct * 100)}%, and the fight is on.`;
    }
  } else text = `The fight is on at ${b.catchweight ?? Math.ceil(ow)} lb, with ${Math.round(pct * 100)}% of ${opp.surname}'s purse coming to you.`;
  faceoffDecision(w, b, f, opp, side, text);
  return text;
}

const MOVE_TEXT: Record<string, string> = {
  stare: "stares straight through",
  respect: "offers a handshake to",
  talk: "leans in and talks to",
  shove: "shoves",
};

function faceoff(w: World, rng: Rng, b: Bout, f: Fighter, opp: Fighter, side: Side, move: string): string {
  const heat = heatOf(w, f.id, opp.id);
  const tm = stageMul(f);
  const shoveP = clamp(0.04 + heat / 300 + (opp.pers.controversy - 10) / 60 + (move === "shove" ? 0.35 : move === "talk" ? 0.1 : 0) - (opp.pers.temperament - 10) / 50, 0.01, 0.75);
  const theirs = rng.chance(shoveP) ? "shove" : rng.chance(clamp((opp.pers.controversy - 6) / 20, 0.05, 0.6)) ? "talk" : move === "respect" && rng.chance(0.7) ? "respect" : "stare";
  b.faceoff = { ...(b.faceoff ?? {}), [side]: move, [other(side)]: theirs };
  const parts: string[] = [];
  const ev = w.events[b.ev];
  if (move === "stare") {
    addPop(f, 0.3 * tm);
    addHeat(w, f, opp, 2);
  } else if (move === "respect") {
    addPop(f, 0.2 * tm);
    addHeat(w, f, opp, -4);
  } else if (move === "talk") {
    addPop(f, 0.6 * tm);
    addHeat(w, f, opp, 5, "Words at the face-off");
  } else if (move === "shove") {
    addPop(f, 1.5 * tm);
    addHeat(w, f, opp, 12, "Shoved at the face-off");
    if (rng.chance(0.7)) {
      const fine = Math.round(tierFine(b) / 2);
      if (w.career.mode === "fighter") ledger(w, { amount: -fine, what: "Fined for the shove at the weigh-ins", cat: "fine", fighter: f.id });
      parts.push(`The commission fines ${f.surname} ${money(fine)}.`);
    }
  }
  if (theirs === "shove") {
    addHeat(w, f, opp, 8, `${opp.surname} shoved at the face-off`);
    addPop(f, 0.4 * tm);
  }
  const ours = `${f.surname} ${MOVE_TEXT[move] ?? "faces"} ${opp.surname}`;
  const back =
    theirs === "shove"
      ? move === "shove"
        ? "and it turns into a shoving match: security drags them apart."
        : `and ${opp.surname} shoves ${her(f, "him", "her")}. Security steps in.`
      : theirs === "talk"
        ? `and ${opp.surname} has plenty to say back.`
        : theirs === "respect"
          ? `and ${opp.surname} shakes on it.`
          : `and ${opp.surname} doesn't blink.`;
  if ((move === "shove" || theirs === "shove") && big(b)) addNews(w, { kind: "booking", promo: b.promo, ev: b.ev, fighters: [f.id, opp.id], text: `Shoving match at the ${ev?.name ?? ""} weigh-ins: ${fullName(f)} and ${fullName(opp)} have to be separated.` });
  const text = `${ours}, ${back}${parts.length ? ` ${parts.join(" ")}` : ""}`;
  addMoment(w, f, "faceoff", `${ev?.name ?? "Weigh-ins"}: ${text}`, opp.id);
  return text;
}
