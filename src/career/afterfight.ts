// After the fight: the report, the money, the doctors, and the next step.

import type { Rng } from "../core/rng";
import { fmtDate } from "../core/time";
import { money, nth, ordinal } from "../core/util";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import { ovr } from "../model/attributes";
import type { Bout, Fact, Fighter, Reign, World } from "../model/types";
import { methodPhrase, type FightOutcome } from "../engine/sim";
import { fullName, rankOf } from "../world/core";
import { notify } from "./inbox";
import { payPurse } from "./money";
import { ACHIEVEMENTS, achievementText, checkAchievements, grantQuiet } from "./achievements";
import { clearCallout, offerMicrophone } from "./fightweek";
import { offerPostFight } from "./media";
import { addHeat, addMoment, addPop, heatOf, ppvShare, stageMul } from "./rivals";
import { boutLimit } from "./shortnotice";
import { neckWork } from "./training";
import { beltNote, currentReign } from "../world/belts";
import { DEFENCE_GAP } from "../world/matchmaking";
import { adjustRapport } from "./promoter";
import { offerTwoBelts } from "./superfight";

/** What a fight did to the player's belt, told in the result message, and the promotion's own word for a belt newly won. */
interface BeltOutcome {
  subject: string;
  lead: string;
  facts: Fact[];
  promo?: { subject: string; body: string; facts: Fact[] };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const defences = (n: number) => `${n} defence${n === 1 ? "" : "s"}`;

/** The reign that ended in this fight. */
function endedHere(w: World, b: Bout, id: string, interim: boolean): Reign | undefined {
  const ps = w.promos[b.promo];
  for (let k = ps.reigns.length - 1; k >= 0; k--) {
    const r = ps.reigns[k];
    if (r.fighter === id && r.div === b.div && !!r.interim === interim && r.lost === b.day) return r;
  }
  return undefined;
}

/** The promotion's message to a new champion: what the belt asks of them now. */
function newChampion(w: World, b: Bout, f: Fighter, opp: Fighter): NonNullable<BeltOutcome["promo"]> {
  const p = PROMOTIONS[b.promo];
  const div = DIVISIONS[b.div].name.toLowerCase();
  const ev = w.events[b.ev];
  const months = Math.round((DEFENCE_GAP[p.tier] ?? 120) / 30.4);
  return {
    subject: `${p.short} ${div} champion`,
    body: `${fullName(f)} is the new ${p.short} ${div} champion${ev ? `, crowned at ${ev.name}` : ""}. From here every fight at ${div} is for the belt: the matchmaker books a defence against the top contender about every ${months} months, and turning down two in a row costs the title.`,
    facts: [
      { k: "Belt", v: `${p.short} ${DIVISIONS[b.div].name}`, tone: "good" },
      { k: "Won", v: `${fmtDate(b.day)}${ev ? `, ${ev.name}` : ""}` },
      { k: "Beat", v: fullName(opp) },
      { k: "First defence", v: `In about ${months} months` },
    ],
  };
}

function beltOutcome(w: World, b: Bout, f: Fighter, opp: Fighter, how: string, when: string, oppRank: number | null | undefined): BeltOutcome | null {
  const note = beltNote(b, f.id);
  if (!note) return null;
  const p = PROMOTIONS[b.promo];
  const ps = w.promos[b.promo];
  const div = DIVISIONS[b.div].name.toLowerCase();
  const title = `${p.short} ${div} title`;
  const ev = w.events[b.ev];
  const by = `by ${how} ${when}${ev ? ` at ${ev.name}` : ""}`;
  const them = fullName(opp);
  const ranked = oppRank ? `${them} (#${oppRank})` : them;
  const reign = currentReign(w, b.promo, b.div, f.id);
  const since: Fact[] = reign ? [{ k: "Champion since", v: fmtDate(reign.won) }] : [];
  const count = (r?: Reign) => Math.max(1, r?.defenses ?? 1);
  if (note.startsWith("Defended the title")) {
    const d = count(reign);
    return {
      subject: `${cap(nth(d))} title defence: beat ${them}`,
      lead: `${fullName(f)} kept the ${title}, beating ${ranked} ${by}.${reign ? ` That's the ${nth(d)} defence of a reign that began on ${fmtDate(reign.won)}.` : ""}`,
      facts: [{ k: "Belt", v: `Retained · ${ordinal(d)} defence`, tone: "good" }, ...since],
    };
  }
  if (note === "Unified the titles") {
    if (reign && reign.won < b.day) {
      // The champion beat the interim champion: one belt again, and it counts as a defence.
      const d = count(reign);
      return {
        subject: `Unified the titles: beat ${them}`,
        lead: `${fullName(f)} beat the interim champion, ${them}, ${by}: one ${div} champion again, and it's ${f.surname}. It counts as the ${nth(d)} defence.`,
        facts: [{ k: "Belt", v: `Unified · ${ordinal(d)} defence`, tone: "good" }, ...since],
      };
    }
    return {
      subject: `Undisputed champion: beat ${them}`,
      lead: `${fullName(f)}, the interim champion, beat the champion ${them} ${by} and is the undisputed ${p.short} ${div} champion.`,
      facts: [{ k: "Belt", v: "Unified: the undisputed champion", tone: "good" }],
      promo: newChampion(w, b, f, opp),
    };
  }
  if (note === "Won the title" || note === "Won the vacant title") {
    const vacant = note === "Won the vacant title";
    return {
      subject: `${vacant ? "Won the vacant title" : "Won the title"}: beat ${them}`,
      lead: vacant ? `${fullName(f)} beat ${ranked} ${by} for the vacant ${title}: ${f.surname} is the champion.` : `${fullName(f)} beat the champion, ${them}, ${by} and is the new ${p.short} ${div} champion.`,
      facts: [{ k: "Belt", v: vacant ? "Won the vacant title" : "Won the title", tone: "good" }],
      promo: newChampion(w, b, f, opp),
    };
  }
  if (note === "Won the interim title") {
    return {
      subject: `Interim champion: beat ${them}`,
      lead: `${fullName(f)} beat ${ranked} ${by} for the interim ${title}.`,
      facts: [{ k: "Belt", v: "Won the interim title", tone: "good" }],
    };
  }
  if (note === "Defended the interim title") {
    const d = count(currentReign(w, b.promo, b.div, f.id, true));
    return {
      subject: `Interim title defence: beat ${them}`,
      lead: `${fullName(f)} kept the interim ${title}, beating ${ranked} ${by}${d > 1 ? `: the ${nth(d)} interim defence` : ""}. The unification with the champion is still to come.`,
      facts: [{ k: "Belt", v: `Interim title retained${d > 1 ? ` · ${ordinal(d)} defence` : ""}`, tone: "good" }],
    };
  }
  if (note === "Lost the title shot") {
    return {
      subject: `Defeat to ${them} in the title fight`,
      lead: `${fullName(f)} came up short against the champion: ${them} won ${by} and keeps the ${title}.`,
      facts: [{ k: "Belt", v: "Title shot lost", tone: "bad" }],
    };
  }
  if (note === "Lost the title" || note.startsWith("Lost the title:")) {
    const old = endedHere(w, b, f.id, false);
    const months = old ? Math.max(1, Math.round((b.day - old.won) / 30.4)) : 0;
    const clause = note.includes("rematch clause");
    const rematch = clause || ps.contender[b.div] === f.id;
    return {
      subject: `Lost the title to ${them}`,
      lead: `${fullName(f)} lost the ${title} to ${them} ${by}.${old ? ` The reign lasted ${months} month${months === 1 ? "" : "s"}, with ${defences(old.defenses)}.` : ""}${clause ? " The rematch clause holds: the next fight is for the belt." : rematch ? " The promotion wants the immediate rematch." : ""}`,
      facts: [
        { k: "Belt", v: "Lost the title", tone: "bad" },
        ...(old ? [{ k: "The reign", v: `${fmtDate(old.won)} to ${fmtDate(b.day)}, ${defences(old.defenses)}` }] : []),
        ...(rematch ? [{ k: "Next", v: "The rematch", tone: "good" as const }] : []),
      ],
    };
  }
  if (note === "Lost the interim title") {
    return {
      subject: `Lost the interim title to ${them}`,
      lead: `${fullName(f)} lost ${b.stake === "unify" ? "the unification" : "the interim title"} to ${them} ${by}, and the interim belt goes with it.`,
      facts: [{ k: "Belt", v: "Lost the interim title", tone: "bad" }],
    };
  }
  if (note.startsWith("Kept the title")) {
    return {
      subject: `${note.includes("draw") ? "Draw" : "No contest"} with ${them}: the belt stays`,
      lead: `${cap(how)} with ${them}${ev ? ` at ${ev.name}` : ""}: ${f.surname} keeps the ${title}${ps.contender[b.div] === opp.id ? ", and the promotion wants the rematch" : ""}.`,
      facts: [{ k: "Belt", v: note.includes("draw") ? "Kept (draw)" : "Kept (no contest)", tone: "warn" }, ...since],
    };
  }
  if (note.startsWith("Missed weight")) {
    return {
      subject: `Victory over ${them}, but no belt`,
      lead: `${fullName(f)} beat ${them} ${by}, but missed weight and could not win the ${title}.`,
      facts: [{ k: "Belt", v: "Not eligible: missed weight", tone: "warn" }],
    };
  }
  if (note === "Won the BMF title") return { subject: `The BMF title: beat ${them}`, lead: `${fullName(f)} beat ${them} ${by} and takes the BMF title.`, facts: [{ k: "Belt", v: "Won the BMF title", tone: "good" }] };
  if (note === "Defended the BMF title") return { subject: `Still the BMF: beat ${them}`, lead: `${fullName(f)} beat ${them} ${by} and keeps the BMF title.`, facts: [{ k: "Belt", v: "Kept the BMF title", tone: "good" }] };
  if (note === "Lost the BMF title") return { subject: `Lost the BMF title to ${them}`, lead: `${fullName(f)} lost the BMF title to ${them} ${by}.`, facts: [{ k: "Belt", v: "Lost the BMF title", tone: "bad" }] };
  if (note.startsWith("Kept the BMF title")) return { subject: `Draw with ${them}: still the BMF`, lead: `${cap(how)} with ${them}: the BMF title stays with ${f.surname}.`, facts: [{ k: "Belt", v: "Kept the BMF title (draw)", tone: "warn" }] };
  return null;
}

export function afterFightCareer(w: World, rng: Rng, b: Bout, o: FightOutcome, chinBefore: Record<string, number> = {}): void {
  for (const side of ["a", "b"] as const) {
    const f = w.fighters[b[side]];
    if (!f.ctrl) continue;
    const opp = w.fighters[side === "a" ? b.b : b.a];
    const fc = w.career.fc[f.id];
    const won = o.winner === side;
    const lost = o.winner !== null && o.winner !== side;
    const mine = o.stats[side === "a" ? 0 : 1];
    const theirs = o.stats[side === "a" ? 1 : 0];
    const how = methodPhrase(o.method, o.detail);
    const when = o.method === "DEC" || o.method === "DRAW" ? `after ${b.rounds} rounds` : `in round ${o.round} (${Math.floor(o.time / 60)}:${String(o.time % 60).padStart(2, "0")})`;
    // The belt, if there was one on it: a defence reads as a defence, a new title as a new title.
    const belt = beltOutcome(w, b, f, opp, how, when, side === "a" ? b.rankB : b.rankA);
    const lines = [
      belt?.lead ?? (won ? `${fullName(f)} beat ${fullName(opp)} by ${how} ${when}.` : lost ? `${fullName(f)} lost to ${fullName(opp)} by ${how} ${when}.` : `${fullName(f)} and ${fullName(opp)} fought to a ${how}.`),
      `Significant strikes ${mine.sigL} of ${mine.sigA} (absorbed ${theirs.sigL}); takedowns ${mine.tdL} of ${mine.tdA}; control ${Math.floor(mine.ctrl / 60)}:${String(Math.round(mine.ctrl % 60)).padStart(2, "0")}${mine.kd ? `; ${mine.kd} knockdown${mine.kd > 1 ? "s" : ""}` : ""}.`,
    ];
    if (f.susp > w.day + 8) lines.push(`Medical suspension until ${fmtDate(f.susp)}.`);
    if (f.injury && f.injury.until > w.day) lines.push(`Injury: ${f.injury.name.toLowerCase()}, out until about ${fmtDate(f.injury.until)}.`);
    // A knockout costs some of the chin for good; neck work builds a little back.
    const chinWas = chinBefore[f.id];
    const chinLost = chinWas === undefined ? 0 : chinWas - f.attrs.chin;
    const chinFmt = (v: number) => v.toFixed(chinLost < 0.15 ? 2 : 1);
    if (chinLost >= 0.05) lines.push(`The knockout took something off the chin: ${chinFmt(chinWas)} before, ${chinFmt(f.attrs.chin)} now. Neck work in the strength sessions builds some of it back${neckWork(f) < 0.995 ? ", if less after every knockout" : ""}.`);
    if (beltNote(b, f.id) === "Won the interim title") {
      const ch = w.promos[b.promo].champs[b.div];
      const pron = DIVISIONS[b.div].sex === "F" ? "she" : "he";
      lines.push(`${f.surname} is the interim champion, and every fight from here is for that belt: a defence while ${ch ? fullName(w.fighters[ch]) : "the champion"} is out, the unification when ${pron}'s back. Lose one and the belt goes with it.`);
    }
    const r = rankOf(w, f);
    if (f.contract && f.contract.left === 0 && PROMOTIONS[b.promo].tier !== "amateur") lines.push("That was the last fight on the contract. Talks on the next deal start now.");
    // Milestones the fight earned, told here rather than as a message each.
    const got = checkAchievements(w, f, b);
    if (got.length) lines.push(`Milestone${got.length > 1 ? "s" : ""}: ${got.map(achievementText).join("; ")}.`);
    const facts: Fact[] = [
      { k: "Result", v: won ? "Win" : lost ? "Loss" : b.res?.method === "NC" ? "No contest" : "Draw", tone: won ? "good" : lost ? "bad" : undefined },
      { k: "How", v: `${how.charAt(0).toUpperCase()}${how.slice(1)}, ${when}` },
      ...(belt?.facts ?? []),
      { k: "Record now", v: `${f.rec.w}-${f.rec.l}${f.rec.d ? `-${f.rec.d}` : ""}` },
      { k: "Ranking", v: r === 0 ? "Champion" : r ? `#${r}` : "Unranked" },
      { k: "Strikes", v: `${mine.sigL} of ${mine.sigA} landed, ${theirs.sigL} taken` },
      { k: "Takedowns", v: `${mine.tdL} of ${mine.tdA}` },
    ];
    const weeksOut = Math.round((f.susp - w.day) / 7);
    if (f.susp > w.day + 8) facts.push({ k: "Medical suspension", v: `To ${fmtDate(f.susp)} (${weeksOut} week${weeksOut === 1 ? "" : "s"})`, tone: f.susp - w.day > 60 ? "bad" : "warn" });
    if (f.injury && f.injury.until > w.day) facts.push({ k: "Injury", v: `${f.injury.name}, fight-ready ${fmtDate(f.injury.until)}`, tone: "bad" });
    if (chinLost >= 0.05) facts.push({ k: "Chin", v: `${chinFmt(chinWas)} → ${chinFmt(f.attrs.chin)}`, tone: "bad" });
    if (got.length) facts.push({ k: got.length > 1 ? "Milestones" : "Milestone", v: got.map((id) => ACHIEVEMENTS[id]?.name ?? id).join(", "), tone: "good" });
    notify(w, {
      kind: "result",
      fighter: f.id,
      ref: b.id,
      from: w.gyms[f.gym]?.headCoach ?? "Corner",
      subject: belt?.subject ?? (won ? `Victory over ${fullName(opp)}` : lost ? `Defeat to ${fullName(opp)}` : `Draw with ${fullName(opp)}`),
      body: lines.join(" "),
      facts,
    });
    // A belt newly won: the promotion's own word on what it asks now.
    if (belt?.promo) notify(w, { kind: "title", fighter: f.id, ref: b.id, from: PROMOTIONS[b.promo].short, ...belt.promo });
    // A second belt (a champion-versus-champion fight won): one of them has to go.
    if (won) offerTwoBelts(w, f, b);
    if (fc) {
      fc.camp = null;
      fc.campBout = undefined;
      fc.progress.push({ day: w.day, ovr: ovr(f.attrs) });
      fc.morale = Math.max(0, Math.min(100, (fc.morale ?? 60) + (won ? 12 : lost ? -14 : 0)));
      // Back to a normal week.
      if (fc.plan.template === "camp" || fc.plan.template === "taper") fc.plan = { ...fc.plan, intensity: 0, template: "light", week: ["boxing", "recovery", "bjj", "rest", "film", "recovery", "drilling", "rest", "conditioning", "rest"] };
    }
    f.morale = Math.max(0, Math.min(100, f.morale + (won ? 10 : lost ? -12 : 0)));
    clearCallout(w, f, opp.id);
    if (b.kind === "bmf" && fc) fc.bmfCall = undefined;
    // A rivalry settled in the cage: the winner cashes in, and the heat cools unless it was close.
    const heat = heatOf(w, f.id, opp.id);
    if (heat >= 25 && (won || lost)) {
      if (won) addPop(f, (heat / 25) * stageMul(f));
      const close = o.verdict === "split" || o.verdict === "majority";
      addHeat(w, f, opp, close ? -heat * 0.1 : -heat * 0.45, won ? `Beat ${opp.surname}${close ? ", but it was close" : ""}` : `Lost to ${opp.surname}${close ? ", and it was close" : ""}`);
      addMoment(w, f, "life", won ? `Settled the rivalry with ${opp.surname} in the cage.` : `Lost the grudge match to ${opp.surname}.`, opp.id);
    }
    if (won) offerMicrophone(w, f, b);
    offerPostFight(w, f, b);
    void rng;
  }
}

export function payControlled(w: World, b: Bout): void {
  if (!b.res) return;
  for (const side of ["a", "b"] as const) {
    const f = w.fighters[b[side]];
    if (!f.ctrl) continue;
    const won = b.res.winner === side;
    const bonusCount = (b.res.bonus ?? []).filter((x) => x === "fotn" || x === `potn-${side}`).length;
    const finish = won && (b.res.method === "KO" || b.res.method === "TKO" || b.res.method === "SUB");
    const missedMe = side === "a" ? b.weighIn?.missA : b.weighIn?.missB;
    const missedThem = side === "a" ? b.weighIn?.missB : b.weighIn?.missA;
    const limit = boutLimit(b);
    const other = side === "a" ? "b" : "a";
    const myW = side === "a" ? b.weighIn?.a ?? limit : b.weighIn?.b ?? limit;
    const fine = missedMe ? b.fineCut?.[side] ?? (myW - limit > 2.5 ? 0.3 : 0.2) : 0;
    let fineIn = 0;
    if (missedThem) {
      const opp = w.fighters[side === "a" ? b.b : b.a];
      const oppW = side === "a" ? b.weighIn?.b ?? limit : b.weighIn?.a ?? limit;
      const oppShow = opp.contract?.show ?? PROMOTIONS[b.promo].showLow;
      fineIn = oppShow * 2 * (b.fineCut?.[other] ?? (oppW - limit > 2.5 ? 0.3 : 0.2));
    }
    const p = payPurse(w, f, b, won, bonusCount, finish, fine, fineIn, ppvShare(w, f, b));
    const parts = [`Show ${money(p.show)}`];
    if (p.win) parts.push(`win ${money(p.win)}`);
    if (p.compliance) parts.push(`compliance pay ${money(p.compliance)}`);
    if (p.bonus) parts.push(`bonus ${money(p.bonus)}`);
    if (p.finish) parts.push(`finish bonus ${money(p.finish)}`);
    if (p.ppv) parts.push(`pay-per-view share ${money(p.ppv)}`);
    if (p.fine) parts.push(`weight fine -${money(p.fine)}`);
    const body =
      w.career.mode === "fighter"
        ? `${parts.join(", ")}: ${money(p.total)} gross. After the gym (${money(p.gym)})${p.manager ? `, the manager (${money(p.manager)})` : ""}, fees (${money(p.fees)})${p.travel ? `, travel (${money(p.travel)})` : ""} and tax (${money(p.tax)}): ${money(p.net)} in the bank.`
        : `${fullName(f)}: ${parts.join(", ")}. ${money(p.total)} gross; your commission is ${money(Math.round((p.show + p.win + p.bonus + p.finish) * ((w.career.agency?.cut ?? 15) / 100)))}.`;
    notify(w, { kind: "money", fighter: f.id, ref: b.id, from: "Accountant", subject: `Purse: ${money(w.career.mode === "fighter" ? p.net : p.total)}`, body, read: false });
    if (bonusCount) {
      // The bonuses are known only once the card is over, so the milestone is earned here.
      const first = grantQuiet(w, f, "bonus");
      notify(w, { kind: "result", fighter: f.id, from: PROMOTIONS[b.promo].short, subject: (b.res.bonus ?? []).includes("fotn") ? "Fight of the Night!" : "Performance of the Night!", body: `${fullName(f)} takes home a ${money(100000)} bonus${bonusCount > 1 ? " twice over" : ""}.${first ? ` Milestone: ${achievementText("bonus")}.` : ""}` });
    }
    // The matchmaker remembers a good night: a win, a finish, a bonus, a belt.
    const them = w.fighters[b[other]];
    const belt = !!beltNote(b, f.id)?.startsWith("Won");
    const gain = (won ? 2 + (finish ? 1 : 0) : 0) + (bonusCount ? 2 : 0) + (belt ? 3 : 0);
    if (gain) adjustRapport(w, f, b.promo, gain, won ? `Beat ${them.surname}${finish ? " inside the distance" : ""}${bonusCount ? ", with a bonus" : ""}${belt ? ", and the belt" : ""}` : `A bonus against ${them.surname}`);
  }
}
