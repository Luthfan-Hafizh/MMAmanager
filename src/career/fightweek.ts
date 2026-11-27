// Fight week and the media: what a fighter says on media day changes the hype,
// the money that follows, and how both fighters arrive on the night. After a
// win, the microphone: call someone out, or ask for the title shot.

import { isFinish } from "../engine/sim";
import type { Rng } from "../core/rng";
import { clamp, money } from "../core/util";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import type { Bout, Fighter, World } from "../model/types";
import { addNews, fullName, rankOf, isChampion, touch, withRng } from "../world/core";
import { notify, closeMessages } from "./inbox";
import { ledger } from "./money";
import { addHeat, addMoment, heatOf } from "./rivals";
import { bmfEligible, callOut } from "./social";

export type Tone = "respect" | "confident" | "trash" | "skip";

export const TONES: Record<Tone, { label: string; desc: string }> = {
  respect: { label: "Show respect", desc: "Credit the opponent, talk about the work. A calm week." },
  confident: { label: "Confident", desc: "Predict the win, sell the fight. A little hype." },
  trash: { label: "Trash talk", desc: "Get under their skin. Big hype and a bigger draw, but it fires them up, and a short temper can boil over." },
  skip: { label: "Skip the media", desc: "Rest instead. The promotion fines you and the fans notice." },
};

const TIER_MUL: Record<string, number> = { amateur: 0.3, local: 0.5, regional: 0.8, tryout: 1, league: 1.3, major: 1.8 };

/** Preparation change on the night: your own tone, and the opponent's if they went at you. */
export function mediaPrep(b: Bout, side: "a" | "b", f: Fighter): number {
  const mine = b.media?.[side];
  const theirs = b.media?.[side === "a" ? "b" : "a"];
  let p = 0;
  if (mine === "respect") p += 0.03;
  if (mine === "confident") p += 0.02;
  if (mine === "skip") p += 0.04;
  if (mine === "trash") p += f.pers.temperament >= 11 ? 0.02 : -0.05;
  if (theirs === "trash") p += 0.05;
  // The face-off: calm helps, a shove can cost focus, and being shoved fires you up.
  const fo = b.faceoff?.[side];
  const fo2 = b.faceoff?.[side === "a" ? "b" : "a"];
  if (fo === "respect" || fo === "stare") p += 0.01;
  if (fo === "shove" && f.pers.temperament < 11) p -= 0.02;
  if (fo2 === "shove") p += 0.03;
  else if (fo2 === "talk") p += 0.01;
  // What was said to the press weeks before.
  p += clamp(b.mprep?.[side] ?? 0, -0.06, 0.06);
  return p;
}

function aiTone(rng: Rng, f: Fighter): Tone {
  const c = f.pers.controversy;
  if (rng.chance(clamp((c - 8) / 14, 0.03, 0.75))) return "trash";
  if (rng.chance(0.5)) return "confident";
  return "respect";
}

/** Three days before a player's fight: media day. */
export function fightWeekDaily(w: World, rng: Rng): void {
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    if (!f?.booked) continue;
    const b = w.bouts[f.booked];
    if (!b || b.status !== "booked" || b.pending) continue;
    if (b.day - w.day !== 3) continue;
    const side = b.a === f.id ? "a" : "b";
    if (b.media?.[side]) continue;
    const opp = w.fighters[side === "a" ? b.b : b.a];
    b.media = { ...(b.media ?? {}), [side === "a" ? "b" : "a"]: b.media?.[side === "a" ? "b" : "a"] ?? aiTone(rng, opp) };
    const ev = w.events[b.ev];
    const oppTone = b.media[side === "a" ? "b" : "a"];
    const heat = heatOf(w, f.id, opp.id);
    const theirLine =
      oppTone === "trash"
        ? `${opp.surname} has already been talking: "${pick(rng, ["I'm going to embarrass him", "He doesn't belong in there with me", "Nobody will remember his name on Sunday", "He's a paper champion in the making"]).replace(/him|his|He/g, (m) => (f.sex === "F" ? { him: "her", his: "her", He: "She" }[m as "him"] ?? m : m))}."`
        : oppTone === "confident"
          ? `${opp.surname} says it won't go the distance.`
          : `${opp.surname} has been respectful all week.`;
    notify(w, {
      kind: "media",
      fighter: f.id,
      ref: b.id,
      from: `${PROMOTIONS[b.promo].short} media team`,
      subject: `Media day: ${f.surname} vs ${opp.surname}`,
      body: `Fight week at ${ev?.name ?? "the event"}: media day is today. ${theirLine}${heat >= 30 ? ` The press know about the bad blood (heat ${heat}).` : ""} Take the questions one by one, or set the tone and let the day run.`,
      needs: true,
      actions: [
        { id: "press:go", label: "Answer the questions", primary: true },
        ...(Object.keys(TONES) as Tone[]).map((t) => ({ id: `media:${t}`, label: TONES[t].label, danger: t === "skip" })),
      ],
      data: { kind: "mediaday", bout: b.id },
    });
  }
}

function pick<T>(rng: Rng, a: T[]): T {
  return a[Math.floor(rng.next() * a.length)];
}

export function answerMedia(w: World, b: Bout, f: Fighter, tone: Tone): string {
  const side = b.a === f.id ? "a" : "b";
  const opp = w.fighters[side === "a" ? b.b : b.a];
  b.media = { ...(b.media ?? {}), [side]: tone };
  const tm = TIER_MUL[PROMOTIONS[b.promo].tier] ?? 1;
  const ev = w.events[b.ev];
  let text = "";
  const tier = PROMOTIONS[b.promo].tier;
  const fine = tier === "major" ? 10000 : tier === "league" ? 5000 : tier === "regional" ? 2000 : 500;
  if (tone === "respect") {
    f.pop = clamp(f.pop + 0.5 * tm, 0, 100);
    text = `${f.surname} keeps it respectful. A quiet, focused week.`;
  } else if (tone === "confident") {
    f.pop = clamp(f.pop + 1.2 * tm, 0, 100);
    text = `${f.surname} predicts a finish. The fans like it.`;
  } else if (tone === "trash") {
    f.pop = clamp(f.pop + (2 + f.pers.controversy / 6) * tm, 0, 100);
    text = `${f.surname} goes after ${opp.surname} at the press conference. The clip is everywhere.`;
    const scuffle = withRng(w, (rng) => rng.chance(0.2 + (f.pers.temperament < 9 ? 0.15 : 0)));
    if (scuffle) {
      f.pop = clamp(f.pop + 1 * tm, 0, 100);
      if (w.career.mode === "fighter") ledger(w, { amount: -fine, what: "Fined for the face-off scuffle", cat: "fine", fighter: f.id });
      text += ` The face-off turns into a shoving match: security steps in and the commission fines ${f.surname} ${money(fine)}.`;
      if (tier === "major" || tier === "league") addNews(w, { kind: "booking", promo: b.promo, ev: b.ev, fighters: [f.id, opp.id], text: `Tempers flare at the ${ev?.name} face-offs: ${fullName(f)} and ${fullName(opp)} have to be separated.` });
    } else if (tier === "major" || tier === "league") {
      addNews(w, { kind: "booking", promo: b.promo, ev: b.ev, fighters: [f.id, opp.id], text: `${fullName(f)} lays into ${fullName(opp)} before ${ev?.name}.` });
    }
    text += f.pers.temperament < 11 ? " Careful: the anger could cost focus on the night." : "";
  } else {
    f.pop = clamp(f.pop - 0.5 * tm, 0, 100);
    if (w.career.mode === "fighter") ledger(w, { amount: -Math.round(fine / 2), what: "Fined for missing media day", cat: "fine", fighter: f.id });
    text = `${f.surname} skips the media. The promotion fines ${money(Math.round(fine / 2))}; the extra rest helps.`;
  }
  touch(w);
  return text;
}

// ---------- after the fight ----------

/** Candidates for a call-out after a win. */
export function calloutTargets(w: World, f: Fighter): Fighter[] {
  if (!f.promo) return [];
  const ps = w.promos[f.promo];
  const ranks = ps.ranks[f.div] ?? [];
  const r = rankOf(w, f);
  const out: Fighter[] = [];
  const add = (id: string | null | undefined) => {
    if (!id || id === f.id) return;
    const x = w.fighters[id];
    if (x && x.status === "active" && x.promo === f.promo && !out.includes(x) && x.gym !== f.gym) out.push(x);
  };
  if (r !== null && r > 0) {
    for (let k = Math.max(0, r - 4); k < r - 1; k++) add(ranks[k]);
  } else if (r === null) {
    for (const id of ranks.slice(-4)) add(id);
  }
  if (!out.length) {
    // No rankings here: the best of the division on a run.
    const pool = Object.values(w.fighters).filter((x) => x.promo === f.promo && x.div === f.div && x.id !== f.id && x.status === "active" && x.streak >= 1);
    pool.sort((a, b) => b.elo - a.elo);
    for (const x of pool.slice(0, 3)) add(x.id);
  }
  return out.slice(0, 3);
}

export function offerMicrophone(w: World, f: Fighter, b: Bout): void {
  if (!f.promo || PROMOTIONS[f.promo].tier === "amateur") return;
  const targets = calloutTargets(w, f);
  const r = rankOf(w, f);
  const ps = w.promos[f.promo];
  const champ = ps.champs[f.div];
  const canAskTitle = !!champ && champ !== f.id && r !== null && r > 0 && r <= 5 && f.streak >= 2;
  if (!targets.length && !canAskTitle) return;
  const actions: { id: string; label: string; primary?: boolean }[] = targets.map((t) => ({ id: `callout:${t.id}`, label: `Call out ${t.surname}` }));
  if (canAskTitle) actions.unshift({ id: "titleshot", label: "Ask for the title shot", primary: true });
  const holder = w.promos.ufc?.bmf?.holder;
  const finish = b.res && isFinish(b.res.method);
  if (bmfEligible(w, f) && holder !== f.id && (finish || f.pop >= 55)) actions.push({ id: "bmfcall", label: holder ? `Call for the BMF title (${w.fighters[holder]?.surname ?? "the holder"})` : "Call for the vacant BMF title" });
  actions.push({ id: "callout:none", label: "Thank the fans" });
  notify(w, {
    kind: "result",
    fighter: f.id,
    ref: b.id,
    from: "Post-fight interview",
    subject: `The microphone is yours, ${f.surname}`,
    body: `${f.surname} gets the post-fight interview inside the cage. ${canAskTitle ? `At #${r} on a ${f.streak}-fight run, the belt is a fair ask. ` : ""}Who's next?`,
    actions,
  });
}

export function answerMicrophone(w: World, f: Fighter, action: string): string {
  const fc = w.career.fc[f.id];
  if (!fc || !f.promo) return "";
  const ps = w.promos[f.promo];
  if (action === "bmfcall") {
    const holder = w.promos.ufc?.bmf?.holder ? w.fighters[w.promos.ufc.bmf.holder] : null;
    if (holder && holder.id !== f.id) {
      const r = withRng(w, (rng) => callOut(w, rng, f, holder, "callout", { viaTalk: true, asBmf: true }));
      return `${f.surname} wants the BMF title. ${r.reply}`;
    }
    fc.bmfCall = w.day + 360;
    f.pop = clamp(f.pop + 1, 0, 100);
    addMoment(w, f, "callout", '"Make the BMF fight. The fans want it, and so do I."');
    return `${f.surname} asks for the vacant BMF title. The promotion likes the sound of it.`;
  }
  if (action === "titleshot") {
    const r = rankOf(w, f) ?? 99;
    const champId = ps.champs[f.div];
    const champ = champId ? w.fighters[champId] : null;
    const p = r === 1 ? 0.85 : r <= 3 ? 0.55 : 0.3;
    const ok = withRng(w, (rng) => rng.chance(p));
    f.pop = clamp(f.pop + 1, 0, 100);
    if (ok && champ) {
      ps.contender[f.div] = f.id;
      addNews(w, { kind: "ranking", promo: f.promo, fighters: [f.id, champ.id], text: `${fullName(f)} asks for the title and gets the nod: next in line for ${fullName(champ)}.` });
      return `The promotion agrees: ${f.surname} is next for the ${DIVISIONS[f.div].name.toLowerCase()} title.`;
    }
    return "The promotion wants one more win first.";
  }
  const id = action.split(":")[1];
  if (id === "none") return `${f.surname} thanks the fans and the team.`;
  const t = w.fighters[id];
  if (!t) return "";
  fc.callout = { target: id, until: w.day + 150 };
  f.pop = clamp(f.pop + 0.8, 0, 100);
  addHeat(w, f, t, 12, "Called out after a win");
  addMoment(w, f, "callout", `In the cage: "${t.surname}, you're next."`, t.id);
  const big = PROMOTIONS[f.promo].tier === "major" || PROMOTIONS[f.promo].tier === "league";
  if (big || t.pop > 30) addNews(w, { kind: "booking", promo: f.promo, fighters: [f.id, id], text: `${fullName(f)} calls out ${fullName(t)}${isChampion(w, t) ? ", the champion" : ""}.` });
  return `${f.surname} calls out ${fullName(t)}. The matchmaker will look at it.`;
}

/** The matchmaker's view of a call-out: the target, if it can be made. */
export function calloutFor(w: World, f: Fighter): string | null {
  const fc = w.career.fc[f.id];
  const c = fc?.callout;
  if (!c || c.until < w.day) return null;
  const t = w.fighters[c.target];
  if (!t || t.status !== "active" || t.promo !== f.promo || t.div !== f.div) return null;
  return c.target;
}

export function clearCallout(w: World, f: Fighter, opp: string): void {
  const fc = w.career.fc[f.id];
  if (fc?.callout?.target === opp) fc.callout = undefined;
}

export { closeMessages };
