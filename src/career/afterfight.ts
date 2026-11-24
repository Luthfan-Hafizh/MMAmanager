// After the fight: the report, the money, the doctors, and the next step.

import type { Rng } from "../core/rng";
import { fmtDate } from "../core/time";
import { money } from "../core/util";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import { ovr } from "../model/attributes";
import type { Bout, Fact, Fighter, World } from "../model/types";
import { methodPhrase, type FightOutcome } from "../engine/sim";
import { fullName, rankOf } from "../world/core";
import { notify } from "./inbox";
import { payPurse } from "./money";
import { checkAchievements } from "./achievements";
import { clearCallout, offerMicrophone } from "./fightweek";
import { offerPostFight } from "./media";
import { addHeat, addMoment, addPop, heatOf, ppvShare, stageMul } from "./rivals";
import { boutLimit } from "./shortnotice";

export function afterFightCareer(w: World, rng: Rng, b: Bout, o: FightOutcome): void {
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
    const lines = [
      won ? `${fullName(f)} beat ${fullName(opp)} by ${how} ${when}.` : lost ? `${fullName(f)} lost to ${fullName(opp)} by ${how} ${when}.` : `${fullName(f)} and ${fullName(opp)} fought to a ${how}.`,
      `Significant strikes ${mine.sigL} of ${mine.sigA} (absorbed ${theirs.sigL}); takedowns ${mine.tdL} of ${mine.tdA}; control ${Math.floor(mine.ctrl / 60)}:${String(Math.round(mine.ctrl % 60)).padStart(2, "0")}${mine.kd ? `; ${mine.kd} knockdown${mine.kd > 1 ? "s" : ""}` : ""}.`,
    ];
    if (f.susp > w.day + 8) lines.push(`Medical suspension until ${fmtDate(f.susp)}.`);
    if (f.injury && f.injury.until > w.day) lines.push(`Injury: ${f.injury.name.toLowerCase()}, out until about ${fmtDate(f.injury.until)}.`);
    const r = rankOf(w, f);
    if (f.contract && f.contract.left === 0 && PROMOTIONS[b.promo].tier !== "amateur") lines.push("That was the last fight on the contract. Talks on the next deal start now.");
    const facts: Fact[] = [
      { k: "Result", v: won ? "Win" : lost ? "Loss" : "Draw", tone: won ? "good" : lost ? "bad" : undefined },
      { k: "How", v: `${how.charAt(0).toUpperCase()}${how.slice(1)}, ${when}` },
      { k: "Record now", v: `${f.rec.w}-${f.rec.l}${f.rec.d ? `-${f.rec.d}` : ""}` },
      { k: "Ranking", v: r === 0 ? "Champion" : r ? `#${r}` : "Unranked" },
      { k: "Strikes", v: `${mine.sigL} of ${mine.sigA} landed, ${theirs.sigL} taken` },
      { k: "Takedowns", v: `${mine.tdL} of ${mine.tdA}` },
    ];
    if (f.susp > w.day + 8) facts.push({ k: "Medical suspension", v: `To ${fmtDate(f.susp)} (${Math.round((f.susp - w.day) / 7)} weeks)`, tone: f.susp - w.day > 60 ? "bad" : "warn" });
    if (f.injury && f.injury.until > w.day) facts.push({ k: "Injury", v: `${f.injury.name}, fight-ready ${fmtDate(f.injury.until)}`, tone: "bad" });
    notify(w, {
      kind: "result",
      fighter: f.id,
      ref: b.id,
      from: w.gyms[f.gym]?.headCoach ?? "Corner",
      subject: won ? `Victory over ${fullName(opp)}` : lost ? `Defeat to ${fullName(opp)}` : `Draw with ${fullName(opp)}`,
      body: lines.join(" "),
      facts,
    });
    if (fc) {
      fc.camp = null;
      fc.campBout = undefined;
      fc.progress.push({ day: w.day, ovr: ovr(f.attrs) });
      fc.morale = Math.max(0, Math.min(100, (fc.morale ?? 60) + (won ? 12 : lost ? -14 : 0)));
      // Back to a normal week.
      if (fc.plan.template === "camp" || fc.plan.template === "taper") fc.plan = { ...fc.plan, intensity: 0, template: "light", week: ["boxing", "recovery", "bjj", "rest", "film", "recovery", "drilling", "rest", "conditioning", "rest"] };
    }
    f.morale = Math.max(0, Math.min(100, f.morale + (won ? 10 : lost ? -12 : 0)));
    if (r !== null && won && b.promo === "ufc") {
      const champ = w.promos.ufc.champs[b.div] === f.id;
      if (champ && (b.kind === "title" || b.kind === "vacant")) {
        notify(w, { kind: "ranking", fighter: f.id, from: "UFC", subject: `${DIVISIONS[b.div].name} champion`, body: `${fullName(f)} is the UFC ${DIVISIONS[b.div].name.toLowerCase()} champion. The belt is yours to defend.` });
      }
    }
    checkAchievements(w, f, b);
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
      notify(w, { kind: "result", fighter: f.id, from: PROMOTIONS[b.promo].short, subject: (b.res.bonus ?? []).includes("fotn") ? "Fight of the Night!" : "Performance of the Night!", body: `${fullName(f)} takes home a ${money(100000)} bonus${bonusCount > 1 ? " twice over" : ""}.` });
    }
  }
}
