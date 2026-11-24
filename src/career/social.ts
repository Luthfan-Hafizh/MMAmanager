// Talking in public: calling out any fighter, at any time, and reacting to the
// fights that just happened in your division. A credible call-out builds heat
// and hype and puts the name in the matchmaker's ear; a nobody calling out the
// champion gets laughed at. The other fighter answers in character: some fire
// back, some accept, some never reply.

import type { Rng } from "../core/rng";
import { clamp } from "../core/util";
import { fmtDate } from "../core/time";
import { PROMOTIONS } from "../data/promotions";
import type { Bout, Fighter, World } from "../model/types";
import { addNews, fullName, isChampion, rankOf } from "../world/core";
import { addHeat, addMoment, addPop, fcOf, heatOf, stageMul } from "./rivals";

export type CallTone = "respect" | "callout" | "trash";

export const CALL_TONES: Record<CallTone, { label: string; desc: string }> = {
  respect: { label: "Ask for the fight", desc: "Credit them, then ask for it. The fans respect it; a little heat." },
  callout: { label: "Call them out", desc: "Name them in public. Heat, hype, and the matchmaker hears it." },
  trash: { label: "Trash talk", desc: "Go after them. The most heat and hype; they may fire back, and the fans can turn." },
};

export interface CalloutCheck {
  ok: boolean;
  why?: string;
  /** The fans take it seriously (the ranking gap isn't silly). */
  credible: boolean;
  /** Same promotion and division: the matchmaker can make it. */
  bookable: boolean;
  /** A call for the BMF title. */
  bmf: boolean;
}

const COOLDOWN = 10;

function they(f: Fighter, he: string, she: string): string {
  return f.sex === "F" ? she : he;
}

function pick<T>(rng: Rng, list: T[]): T {
  return list[Math.floor(rng.next() * list.length)];
}

/** Where a fighter sits for these purposes: 0 the champion, 1..15 ranked, 16+ unranked. */
function standing(w: World, f: Fighter): number {
  const r = rankOf(w, f);
  return r === null ? 17 : r;
}

export function bmfEligible(w: World, f: Fighter): boolean {
  const ps = w.promos.ufc;
  return f.status === "active" && f.promo === "ufc" && f.div === "LW" && f.pop >= 35 && ps?.champs.LW !== f.id && ps?.interim.LW !== f.id;
}

export function calloutCheck(w: World, f: Fighter, t: Fighter, viaTalk = false): CalloutCheck {
  const no = (why: string): CalloutCheck => ({ ok: false, why, credible: false, bookable: false, bmf: false });
  if (t.id === f.id) return no("That's you.");
  if (f.status !== "active") return no("Retired fighters don't call anyone out.");
  if (t.status !== "active") return no(`${t.surname} has retired.`);
  if (t.ctrl) return no("That's one of your own fighters.");
  if (t.gym === f.gym) return no(`You train with ${t.surname}.`);
  const fc = fcOf(w, f);
  if (!viaTalk && fc?.lastSocial !== undefined && w.day - fc.lastSocial < COOLDOWN) return no(`You called someone out on ${fmtDate(fc.lastSocial, { year: false })}. Give it a few days or the fans stop listening.`);
  const samePromo = !!f.promo && t.promo === f.promo;
  const bookable = samePromo && t.div === f.div && PROMOTIONS[f.promo!].tier !== "amateur";
  const sf = standing(w, f);
  const st = standing(w, t);
  let credible: boolean;
  if (!samePromo) credible = f.pop >= t.pop - 15;
  else if (st === 0) credible = sf <= 5 || f.pop >= t.pop - 5;
  else if (st <= 15) credible = sf - st <= 6 || f.pop >= t.pop;
  else credible = true;
  const bmf = w.promos.ufc?.bmf?.holder === t.id && bmfEligible(w, f);
  return { ok: true, credible, bookable, bmf };
}

function line(rng: Rng, f: Fighter, t: Fighter, tone: CallTone, bmf: boolean): string {
  const n = t.surname;
  const him = they(t, "him", "her");
  if (bmf) return pick(rng, [`${n}, that BMF belt belongs to someone who fights like it. Bring it.`, `The BMF title should be on the line against me, ${n}. Let's give the fans a war.`]);
  if (tone === "respect") return pick(rng, [`${n} is one of the best out there. I want to test myself against the best. Let's do it.`, `Nothing but respect for ${n}, but I think I beat ${him}. Let's find out.`, `${n} vs me makes sense for everybody. I'm ready when ${they(t, "he", "she")} is.`]);
  if (tone === "callout") return pick(rng, [`${n}, you're next. Sign the contract.`, `I want ${n}. No more waiting around.`, `Everyone's talking about ${n}. Put ${him} in front of me.`]);
  return pick(rng, [`${n} is overrated and everybody in the gym knows it. I'll prove it.`, `${n} has been ducking me. Stop hiding.`, `I'd stop ${n} inside two rounds. Easy money.`, `${n} talks like a champion and fights like a prospect.`]);
}

export interface CalloutResult {
  text: string;
  quote: string;
  reply: string;
  heat: number;
  pop: number;
}

/** Call a fighter out in public. */
export function callOut(w: World, rng: Rng, f: Fighter, t: Fighter, tone: CallTone, opts: { viaTalk?: boolean; asBmf?: boolean } = {}): CalloutResult {
  const ck = calloutCheck(w, f, t, opts.viaTalk);
  if (!ck.ok) return { text: ck.why ?? "Not possible.", quote: "", reply: "", heat: 0, pop: 0 };
  const fc = fcOf(w, f)!;
  const bmf = ck.bmf && (opts.asBmf ?? true);
  const tm = stageMul(f);
  const fame = clamp(t.pop / 45, 0.5, 2);
  const quote = line(rng, f, t, tone, bmf);
  let popGain: number;
  let heat: number;
  let reply: string;
  if (!ck.credible) {
    popGain = addPop(f, tone === "trash" ? -0.5 : -0.25);
    heat = addHeat(w, f, t, 3, `Called out ${t.surname}, who laughed it off`);
    reply = `${t.surname}: "${pick(rng, ["Who?", "Get a few more wins and call me back.", "I don't know who that is, and neither do the fans.", "Nice try. Go and get ranked."])}"`;
  } else {
    popGain = addPop(f, { respect: 0.5, callout: 0.9, trash: 1.5 }[tone] * tm * fame * (bmf ? 1.4 : 1));
    heat = addHeat(w, f, t, { respect: 6, callout: 12, trash: 22 }[tone] + (bmf ? 4 : 0), bmf ? "Called out for the BMF title" : `Called out (${CALL_TONES[tone].label.toLowerCase()})`);
    const p = t.pers;
    const fire = clamp((p.controversy - 6) / 14 + (tone === "trash" ? 0.25 : 0) - (p.temperament - 10) / 30, 0.05, 0.85);
    const accept = clamp(0.25 + p.ambition / 40 + (standing(w, f) < standing(w, t) ? 0.15 : 0) + (t.streak <= -1 ? -0.15 : 0), 0.1, 0.8);
    const roll = rng.next();
    if (roll < fire) {
      heat = addHeat(w, f, t, 9, `${t.surname} fired back`);
      addPop(f, 0.4 * tm);
      addPop(t, 0.4);
      reply = `${t.surname} fires back: "${pick(rng, [`${f.surname} needs my name to sell tickets.`, `I'll put ${they(f, "him", "her")} to sleep and go home early.`, `Careful what you wish for, ${f.surname}.`, `${f.surname}? I've seen better on the regional scene.`])}"`;
      addMoment(w, f, "reply", reply, t.id);
    } else if (roll < fire + accept * (1 - fire)) {
      reply = `${t.surname} answers: "${pick(rng, ["You got it. Tell the matchmaker.", "Let's do it. Name the date.", "I don't need to talk. Send the contract."])}"`;
      if (ck.bookable) fc.callout = { target: t.id, until: w.day + 180, ok: true };
      addMoment(w, f, "reply", reply, t.id);
    } else {
      reply = `${t.surname} doesn't answer.`;
    }
  }
  if (ck.bookable && ck.credible && !(fc.callout?.target === t.id && fc.callout.ok)) fc.callout = { target: t.id, until: w.day + 150 };
  if (bmf) fc.bmfCall = w.day + 240;
  if (!opts.viaTalk) fc.lastSocial = w.day;
  addMoment(w, f, "callout", `"${quote}"`, t.id);
  const big = f.promo && (PROMOTIONS[f.promo].tier === "major" || PROMOTIONS[f.promo].tier === "league");
  if (ck.credible && (big || t.pop > 30 || f.pop > 30)) {
    addNews(w, { kind: "booking", promo: f.promo ?? undefined, fighters: [f.id, t.id], text: bmf ? `${fullName(f)} calls out ${fullName(t)} for the BMF title.` : `${fullName(f)} calls out ${fullName(t)}${isChampion(w, t) ? ", the champion" : ""}.` });
    if (reply.includes("fires back") && (big || t.pop > 40)) addNews(w, { kind: "booking", promo: t.promo ?? undefined, fighters: [t.id, f.id], text: `${fullName(t)} fires back at ${fullName(f)}.` });
  }
  const gain = Math.round(popGain * 10) / 10;
  const text = `"${quote}" ${reply}${ck.credible ? "" : " The fans aren't buying it yet."}`;
  return { text, quote, reply, heat, pop: gain };
}

// ---------- fight talk ----------

export type TalkTone = "credit" | "callout" | "doubt" | "mock";

export const TALK_TONES: Record<TalkTone, { label: string; desc: string }> = {
  credit: { label: "Give credit", desc: "Respect for the winner. Classy; a little less heat with them." },
  callout: { label: "Call out the winner", desc: "You're next. Heat with the winner, and the matchmaker hears it." },
  doubt: { label: "Not impressed", desc: "Say it was nothing special. Heat with the winner and some hype." },
  mock: { label: "Mock the loser", desc: "Kick someone when they're down. A big reaction, and it can backfire." },
};

/** Fights in the last month that the fans want the fighter's take on: the division's notable ones. */
export function talkableFights(w: World, f: Fighter, limit = 6): Bout[] {
  if (f.status !== "active") return [];
  const fc = fcOf(w, f);
  const seen = new Set(fc?.talked ?? []);
  const out: Bout[] = [];
  for (const ev of Object.values(w.events)) {
    if (ev.status !== "done" || ev.day < w.day - 30 || ev.day > w.day) continue;
    if (ev.promo !== f.promo && ev.promo !== "ufc") continue;
    for (const id of ev.bouts) {
      const b = w.bouts[id];
      if (!b || b.status !== "done" || !b.res?.winner || b.div !== f.div || seen.has(b.id)) continue;
      if (b.a === f.id || b.b === f.id) continue;
      const A = w.fighters[b.a];
      const B = w.fighters[b.b];
      if (!A || !B || A.ctrl || B.ctrl) continue;
      const notable = b.order <= 1 || b.kind !== "regular" || (b.rankA ?? null) !== null || (b.rankB ?? null) !== null || A.pop > 35 || B.pop > 35;
      if (!notable) continue;
      if (ev.promo !== f.promo && !(b.kind === "title" || b.kind === "bmf" || b.order === 0)) continue;
      out.push(b);
    }
  }
  out.sort((a, b) => b.day - a.day || a.order - b.order);
  return out.slice(0, limit);
}

export function talkFight(w: World, rng: Rng, f: Fighter, b: Bout, tone: TalkTone): string {
  const fc = fcOf(w, f);
  if (!fc || !b.res?.winner) return "";
  const winner = w.fighters[b.res.winner === "a" ? b.a : b.b];
  const loser = w.fighters[b.res.winner === "a" ? b.b : b.a];
  fc.talked = [b.id, ...(fc.talked ?? [])].slice(0, 80);
  const tm = stageMul(f);
  const close = b.res.verdict === "split" || b.res.verdict === "majority";
  let text: string;
  if (tone === "credit") {
    addPop(f, 0.35 * tm);
    addHeat(w, f, winner, -5);
    text = pick(rng, [`Great performance by ${winner.surname}. Respect.`, `${winner.surname} looked sharp tonight. Credit where it's due.`, `Tough night for ${loser.surname}, big win for ${winner.surname}. That's the sport.`]);
  } else if (tone === "callout") {
    const r = callOut(w, rng, f, winner, "callout", { viaTalk: true });
    return r.text;
  } else if (tone === "doubt") {
    addHeat(w, f, winner, 10, `Wasn't impressed by the win over ${loser.surname}`);
    addPop(f, (close ? 1.1 : 0.6) * tm);
    text = close ? `${winner.surname} won that? Most people had it the other way. I'd have finished both of them.` : `That's it? I'm not impressed. ${winner.surname} isn't on my level.`;
    if (close) text += " The fans agree it was close.";
  } else {
    const backlash = loser.pop > f.pop + 10 || (b.res.method === "KO" && rng.chance(0.35));
    addHeat(w, f, loser, 14, `Mocked the loss to ${winner.surname}`);
    if (backlash) {
      addPop(f, -1.2);
      text = `${loser.surname} folded the moment it got hard. The fans didn't like that one.`;
    } else {
      addPop(f, (0.9 + f.pers.controversy / 25) * tm);
      text = pick(rng, [`${loser.surname} folded the moment it got hard. Same as always.`, `${loser.surname} should think about another job.`, `Nobody's surprised. ${loser.surname} was never that good.`]);
    }
  }
  addMoment(w, f, "talk", `"${text}"`, tone === "mock" ? loser.id : winner.id);
  return `"${text}"`;
}

/** The heat between the player's fighter and the people they've talked about lately. */
export function heatWith(w: World, f: Fighter, other: Fighter): number {
  return heatOf(w, f.id, other.id);
}

/** The people worth calling out: the champion and the ranked names in the division, rivals, and the BMF holder. */
export function calloutChoices(w: World, f: Fighter): Fighter[] {
  const out: Fighter[] = [];
  const add = (id: string | null | undefined) => {
    const x = id ? w.fighters[id] : undefined;
    if (x && x.id !== f.id && x.status === "active" && !x.ctrl && x.gym !== f.gym && !out.includes(x)) out.push(x);
  };
  if (f.promo) {
    const ps = w.promos[f.promo];
    add(ps.champs[f.div]);
    add(ps.interim[f.div]);
    for (const id of ps.ranks[f.div] ?? []) add(id);
    if (!(ps.ranks[f.div] ?? []).length) {
      const pool = Object.values(w.fighters).filter((x) => x.promo === f.promo && x.div === f.div && x.status === "active").sort((a, b) => b.elo - a.elo);
      for (const x of pool.slice(0, 12)) add(x.id);
    }
  }
  for (const id of Object.keys(w.career.fc[f.id]?.rivals ?? {})) add(id);
  if (bmfEligible(w, f)) add(w.promos.ufc?.bmf?.holder);
  return out;
}

/** Bury the hatchet in public: the heat drops, and the fans like it. */
export function makePeace(w: World, f: Fighter, t: Fighter): string {
  const before = heatOf(w, f.id, t.id);
  addHeat(w, f, t, -15, "Made peace in public");
  addPop(f, 0.2);
  addMoment(w, f, "talk", `"Respect to ${t.surname}. No hard feelings."`, t.id);
  return `Respect to ${t.surname}. The heat drops from ${before} to ${heatOf(w, f.id, t.id)}.`;
}
