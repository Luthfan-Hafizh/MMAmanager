// The team's advice. A manager reads an offer the way the business does: the
// chances, what a win or a loss does to the ranking, the money against the
// market, the camp, the cut, the body, and the contract. Without a manager the
// head coach talks about the fight but not the money. A better manager reads
// the odds and the promotion's ceiling more accurately; a bold one leans
// towards yes, a careful one towards no.

import { Rng, hashString } from "../core/rng";
import { clamp, money } from "../core/util";
import { ageAt, fmtDate } from "../core/time";
import { countryOf } from "../data/countries";
import { DIVISIONS, neighbourDivisions } from "../data/divisions";
import { makeName } from "../data/names";
import { PROMOTIONS, TIER_RANK, type PromoId } from "../data/promotions";
import { ovrOf } from "../model/attributes";
import type { Bout, ContractOffer, FightOffer, Fighter, World } from "../model/types";
import { fullName, isChampion, rankOf } from "../world/core";
import { outlookRoom } from "../world/development";
import { preview, winProb } from "../world/odds";
import { boutLimit, cutCheck, noticeHurt, sizeEdge } from "./shortnotice";
import { counterOffer, valueOf } from "./offers";

export type Verdict = "take" | "pass" | "think" | "sign" | "counter" | "wait";

export interface Reason {
  /** true helps the case, false hurts it, null is just information. */
  good: boolean | null;
  text: string;
  weight: number;
}

export interface Advice {
  who: string;
  role: "manager" | "coach" | "analyst";
  verdict: Verdict;
  label: string;
  headline: string;
  reasons: Reason[];
  counter?: { show: number; win: number; fights: number };
  /** The adviser's read of the chance of winning, when it's a fight. */
  chance?: number;
}

export interface Adviser {
  name: string;
  role: Advice["role"];
  quality: number;
  style: "bold" | "careful" | "steady";
}

const LABEL: Record<Verdict, string> = { take: "Take it", pass: "Pass", think: "Your call", sign: "Sign it", counter: "Counter", wait: "Wait" };

/** Who's giving the advice: the manager, or without one the head coach (or, running an agency, the analyst). */
export function adviserOf(w: World, f: Fighter): Adviser {
  if (w.career.mode === "manager") {
    const a = w.career.agency;
    return { name: "Your analyst", role: "analyst", quality: clamp(45 + (a?.staff ?? 0) * 10 + (a?.rep ?? 20) / 4, 30, 90), style: "steady" };
  }
  const m = w.career.fc[f.id]?.manager;
  if (m) return { name: m.person ?? m.name, role: "manager", quality: m.quality, style: m.style ?? "steady" };
  const g = w.gyms[f.gym];
  return { name: g?.headCoach ?? "Your coach", role: "coach", quality: clamp(g?.coaches.head ?? 45, 20, 90), style: "steady" };
}

/** A stable error for one adviser on one question: the same every time it's asked. */
function err(key: string, quality: number): number {
  const u = (hashString(key) % 10007) / 10007;
  return (u - 0.5) * 2 * (1 - quality / 100);
}

/** Pick a manager's name and temperament when one is hired. */
export function managerPerson(rng: Rng, f: Fighter): { person: string; style: Adviser["style"] } {
  const n = makeName(rng, countryOf(f.country).culture, rng.chance(0.3) ? "F" : "M");
  return { person: `${n.first} ${n.last}`, style: rng.pick(["bold", "careful", "steady"] as const) };
}

function rankText(r: number | null): string {
  return r === 0 ? "the champion" : r ? `#${r}` : "unranked";
}

function finish(verdict: Verdict, reasons: Reason[], adv: Adviser, extra: Partial<Advice> = {}): Advice {
  reasons.sort((a, b) => b.weight - a.weight);
  const top = reasons.find((r) => (verdict === "pass" || verdict === "wait" ? r.good === false : r.good === true)) ?? reasons[0];
  const lead = verdict === "take" ? "Take it." : verdict === "pass" ? "I'd pass." : verdict === "sign" ? "Sign it." : verdict === "counter" ? "Don't sign yet." : verdict === "wait" ? "Wait." : "Your call.";
  let headline = top ? `${lead} ${top.text}` : lead;
  if (verdict === "think") {
    // A split decision: the best case for it, and the main thing against it.
    const pro = reasons.find((r) => r.good === true);
    const con = reasons.find((r) => r.good === false);
    headline = [lead, pro?.text, con ? `Against it: ${con.text.charAt(0).toLowerCase()}${con.text.slice(1)}` : ""].filter(Boolean).join(" ");
  }
  return {
    who: adv.role === "manager" ? `${adv.name}, your manager` : adv.role === "coach" ? `${adv.name}, head coach` : adv.name,
    role: adv.role,
    verdict,
    label: LABEL[verdict],
    headline,
    reasons: reasons.slice(0, adv.role === "coach" ? 4 : 6),
    ...extra,
  };
}

/** The pending bout behind a fight offer. */
export function boutOfOffer(w: World, o: FightOffer): Bout | undefined {
  return Object.values(w.bouts).find((x) => x.pending === o.id);
}

/** Should we take this fight? */
export function adviseFight(w: World, f: Fighter, o: FightOffer): Advice {
  const adv = adviserOf(w, f);
  const opp = w.fighters[o.opp];
  const b = boutOfOffer(w, o);
  const p = PROMOTIONS[o.promo];
  const days = Math.max(0, o.day - w.day);
  const limit = b ? boutLimit(b) : o.limit ?? DIVISIONS[o.div].limit;
  const reasons: Reason[] = [];
  const add = (good: boolean | null, weight: number, text: string) => reasons.push({ good, text, weight: Math.abs(weight) });
  let score = 0;

  // The chances, as this adviser reads them.
  let pw = winProb(w, f, opp, o.day);
  if (o.shortNotice && !o.stay) pw -= 0.02 + 0.06 * noticeHurt(days);
  if (o.shortNotice && o.stay) pw += 0.01 + 0.03 * noticeHurt(days);
  if (f.div !== o.div) pw += 0.03 * sizeEdge(f, opp, limit);
  const est = clamp(pw + err(`${o.id}:p:${adv.name}`, adv.quality) * 0.12, 0.05, 0.95);
  const pct = Math.round(est * 100);
  score += (est - 0.5) * 6;
  if (est >= 0.6) add(true, (est - 0.5) * 6, `You should win this: I make it about ${pct}%.`);
  else if (est >= 0.45) add(null, 0.5, `It's an even fight: about ${pct}% for you.`);
  else if (est >= 0.32) add(false, (0.5 - est) * 6, `${opp.surname} is the favourite: you're about a ${pct}% shot.`);
  else add(false, (0.5 - est) * 6, `A long shot: maybe ${pct}%. ${opp.surname} is a level above right now.`);

  // What it does for the career.
  const title = o.kind === "title" || o.kind === "vacant" || o.kind === "interim";
  const rf = f.promo === o.promo ? rankOf(w, f) : null;
  const ro = rankOf(w, opp);
  if (title) {
    score += 3;
    add(true, 3, o.kind === "interim" ? "An interim belt is a belt: it puts you next in line." : "It's a title fight. They don't always come twice.");
  } else if (o.kind === "eliminator") {
    score += 1.4;
    add(true, 1.4, "Win this and you're next for the title.");
  } else if (ro !== null && ro > 0 && (rf === null || ro < rf)) {
    const w2 = ro <= 5 ? 1.8 : ro <= 10 ? 1.3 : 0.9;
    score += w2;
    add(true, w2, `${opp.surname} is ${rankText(ro)}: beat him and you take the spot${rf === null ? " and you're ranked" : ""}.`);
  } else if (rf !== null && rf <= 10 && (ro === null || ro > rf + 5)) {
    score -= 1;
    add(false, 1, `You're ${rankText(rf)} and ${opp.surname} is ${rankText(ro)}: little to gain, a lot to lose.`);
  }
  if (o.debut) {
    score += 2.5;
    add(true, 2.5, `It's a ${PROMOTIONS[o.debut].short} contract. A debut on short notice is how plenty of careers started.`);
  }

  // The money (the coach leaves that to others).
  if (adv.role !== "coach" && o.show > 0) {
    const value = valueOf(w, f, o.promo);
    const ratio = o.show / Math.max(1, value);
    if (ratio >= 1.15) {
      score += Math.min(1.2, (ratio - 1) * 2);
      add(true, Math.min(1.2, (ratio - 1) * 2), `${money(o.show)} to show is more than they'd normally pay you (${money(value)}).`);
    } else if (ratio < 0.85) {
      score -= Math.min(1.2, (1 - ratio) * 2);
      add(false, Math.min(1.2, (1 - ratio) * 2), `The money's light: ${money(o.show)} when you're worth about ${money(value)}.`);
    }
    if (f.contract && f.contract.promo === o.promo && f.contract.left === 1 && est >= 0.5) {
      score += 0.4;
      add(true, 0.4, "It's the last fight on your deal: a win here and we negotiate from strength.");
    }
  }

  // The camp and the scale.
  if (!o.stay && days < 28) {
    const pen = (1 - days / 28) * 1.2;
    score -= pen;
    add(false, pen, days <= 3 ? `${days <= 1 ? "Tomorrow" : `${days} days`}: no camp at all.` : `${days} days to get ready: no real camp.`);
  }
  const cut = cutCheck(f, limit, Math.max(1, days));
  if (f.div !== o.div) {
    const up = neighbourDivisions(f.div).up === o.div;
    const z = sizeEdge(f, opp, limit);
    add(up ? null : false, up ? 0.6 : 1, up ? `Up at ${limit} lb there's no real cut, but ${opp.surname} is the bigger man${z < -0.5 ? " by a lot" : ""}.` : `Down at ${limit} lb is a big ask for your body.`);
    if (up) score += z * 0.6;
  }
  if (cut.risk === "hard") {
    score -= 1;
    add(false, 1, `From ${f.walk} lb to ${limit} in ${days} days is a hard cut.`);
  } else if (cut.risk === "too much") {
    score -= 3;
    add(false, 3, `${f.walk} lb to ${limit} in ${days} days can't be done safely. You'd miss weight.`);
  } else if (o.shortNotice && (cut.risk === "none" || cut.risk === "easy")) {
    add(true, 0.4, `The weight's no problem from ${f.walk} lb.`);
  }

  // The body.
  if (f.injury && f.injury.until > o.day) {
    score -= 2;
    add(false, 2, `The ${f.injury.name.toLowerCase()} won't be healed by then.`);
  } else if (f.injury && f.injury.until > w.day) {
    add(null, 0.3, `The ${f.injury.name.toLowerCase()} should be healed in time.`);
  }
  if (f.dmg > 120 && ageAt(f.birth, w.day) > 32) {
    score -= 0.5;
    add(false, 0.5, "You've taken a lot of damage over the years. Pick the fights that matter.");
  }
  if (f.fatigue > 65) {
    score -= 0.4;
    add(false, 0.4, "You're worn down from training: ease off if you take it.");
  }

  // Activity.
  const idle = f.lastFight === null ? 0 : w.day - f.lastFight;
  if (idle > 300) {
    score += 0.6;
    add(true, 0.6, `You haven't fought in ${Math.round(idle / 30)} months. You need to stay active.`);
  }
  if (o.shortNotice && !o.stay) {
    score += 0.4;
    add(true, 0.4, "Saying yes on short notice keeps the matchmaker on your side, and a loss is forgiven.");
  }

  // The style.
  if (b && b.a && b.b) {
    const pv = preview(w, b);
    const theirs = pv.keys[b.a === opp.id ? 0 : 1][0];
    if (theirs) add(null, 0.2, `Watch for this: ${theirs.charAt(0).toLowerCase()}${theirs.slice(1)}`);
  }

  // Temperament.
  score += adv.style === "bold" ? 0.3 : adv.style === "careful" ? -0.3 : 0;
  const verdict: Verdict = score >= 0.5 ? "take" : score <= -0.5 ? "pass" : "think";
  return finish(verdict, reasons, adv, { chance: est });
}

/** Should we sign this contract, and if not, what do we ask for? */
export function adviseContract(w: World, f: Fighter, o: ContractOffer): Advice {
  const adv = adviserOf(w, f);
  const p = PROMOTIONS[o.promo];
  const reasons: Reason[] = [];
  const add = (good: boolean | null, weight: number, text: string) => reasons.push({ good, text, weight: Math.abs(weight) });
  const value = valueOf(w, f, o.promo);
  const curTier = f.promo ? TIER_RANK[PROMOTIONS[f.promo].tier] : 0;
  const newTier = TIER_RANK[p.tier];
  if (adv.role === "coach") {
    // A coach doesn't do numbers.
    if (newTier > curTier) add(true, 2, `${p.short} is a step up. That's what we've been training for.`);
    else if (newTier < curTier) add(false, 1, `${p.short} is a step down from where you are.`);
    add(null, 1, "I'm a coach, not an agent: a manager would know what they'd really pay.");
    return finish(newTier >= curTier ? "sign" : "think", reasons, adv);
  }
  // The manager's read of how far the promotion will go.
  const ceiling = Math.round((o.limit * (1 + err(`${o.id}:c:${adv.name}`, adv.quality) * 0.15)) / 100) * 100;
  const target = Math.max(o.show, Math.round((ceiling * 0.97) / 100) * 100);
  const opening = o.show;
  if (newTier > curTier) add(true, 2, o.promo === "ufc" ? "It's the UFC: the stage that makes careers." : `${p.short} is a step up.`);
  if (o.renewal) add(null, 0.5, `${p.short} wants to keep you.`);
  const rank = f.promo === o.promo ? rankOf(w, f) : null;
  const leverage = (rank !== null && rank <= 10 ? 1 : 0) + (f.streak >= 3 ? 1 : 0) + (f.pop >= 50 ? 1 : 0) + (isChampion(w, f) ? 2 : 0);
  if (leverage >= 2) add(true, 1, `You have leverage: ${[rank !== null && rank <= 10 ? `ranked ${rankText(rank)}` : "", f.streak >= 3 ? `${f.streak} wins in a row` : "", f.pop >= 50 ? "a following" : ""].filter(Boolean).join(", ")}.`);
  if (opening >= value * 1.05) add(true, 1, `${money(opening)} a fight is above your market value (${money(value)}).`);
  else if (opening < value * 0.9) add(false, 1, `${money(opening)} a fight is under your market value (${money(value)}).`);
  if (o.signBonus) add(true, 0.6, `There's a ${money(o.signBonus)} signing bonus.`);
  const rising = ageAt(f.birth, w.day) < 28 && outlookRoom(f, w.day) > 4;
  if (rising && o.fights > 3) add(null, 0.5, `You're still improving: a shorter deal (${o.fights - 1} fights) lets us renegotiate sooner.`);
  // A better offer elsewhere?
  const other = (["ufc", "pfl"] as PromoId[]).filter((x) => x !== o.promo).map((x) => ({ x, v: valueOf(w, f, x) })).sort((a, b) => b.v - a.v)[0];
  const freeAgency = o.renewal && f.contract && f.contract.left <= 0;
  let verdict: Verdict;
  let counter: Advice["counter"];
  if (freeAgency && other && other.v > Math.max(opening, ceiling) * 1.35 && !isChampion(w, f) && TIER_RANK[PROMOTIONS[other.x].tier] >= newTier) {
    verdict = "wait";
    add(false, 1.5, `${PROMOTIONS[other.x].short} would pay about ${money(other.v)}. Test free agency.`);
  } else if (opening >= target) {
    verdict = "sign";
    add(true, 1.2, `I don't think they'll go much higher than ${money(Math.max(opening, ceiling))}.`);
  } else {
    verdict = "counter";
    counter = { show: target, win: o.win ? target : 0, fights: rising && o.fights > 3 ? o.fights - 1 : o.fights };
    add(false, 1.2, `They'll go to about ${money(ceiling)}. Ask for ${money(target)}${o.win ? ` and ${money(target)}` : ""}.`);
  }
  return finish(verdict, reasons, adv, { counter });
}

/** The manager handles the negotiation: one counter at their read of the ceiling, then the best that comes back. */
export function managerNegotiate(w: World, rng: Rng, offerId: string): string[] {
  const o = w.career.contractOffers.find((x) => x.id === offerId);
  if (!o || o.status !== "open") return ["That offer is gone."];
  const f = w.fighters[o.fighter];
  const a = adviseContract(w, f, o);
  const log: string[] = [];
  if (!a.counter) {
    log.push(`${a.who.split(",")[0]}: "This is as good as it gets. Sign it."`);
    return log;
  }
  const r = counterOffer(w, rng, o.id, a.counter);
  log.push(`${a.who.split(",")[0]} asks for ${money(a.counter.show)}${a.counter.win ? ` + ${money(a.counter.win)}` : ""} over ${a.counter.fights} fights.`);
  log.push(r.text);
  if (r.outcome === "countered") {
    // One more step towards the middle, never past the ceiling the manager reads.
    const mid = Math.round(((o.show + a.counter.show) / 2) / 100) * 100;
    if (mid > o.show) {
      const r2 = counterOffer(w, rng, o.id, { show: mid, win: o.win ? mid : 0, fights: a.counter.fights });
      log.push(`Meet in the middle: ${money(mid)}.`);
      log.push(r2.text);
    }
  }
  return log;
}

export interface Answer {
  q: string;
  a: string;
}

export const QUESTIONS: { id: string; q: string }[] = [
  { id: "worth", q: "What am I worth?" },
  { id: "ready", q: "Am I ready for the next level?" },
  { id: "weight", q: "Should I change weight class?" },
  { id: "short", q: "Should I take short-notice fights?" },
  { id: "plan", q: "What's the plan from here?" },
];

/** A conversation with the team about the career. */
export function ask(w: World, f: Fighter, id: string): Answer {
  const adv = adviserOf(w, f);
  const q = QUESTIONS.find((x) => x.id === id)?.q ?? id;
  const o = ovrOf(f.attrs);
  const rank = rankOf(w, f);
  const age = ageAt(f.birth, w.day);
  const tier = f.promo ? PROMOTIONS[f.promo].tier : null;
  const coach = adv.role === "coach";
  let a = "";
  if (id === "worth") {
    if (coach) a = "That's a question for a manager. I can tell you you're worth more every week you train like this.";
    else {
      const ufc = valueOf(w, f, "ufc");
      const pfl = valueOf(w, f, "pfl");
      const here = f.promo && f.promo !== "ufc" && f.promo !== "pfl" ? valueOf(w, f, f.promo) : 0;
      a = `Per fight, to show: the UFC would value you at about ${money(ufc)}, the PFL at ${money(pfl)}${here ? `, ${PROMOTIONS[f.promo!].short} at ${money(here)}` : ""}. ${f.streak >= 3 ? `The ${f.streak}-fight run is pushing that up.` : f.streak <= -2 ? "The losses are costing us at the table; a win fixes that." : "Win and finish, and it goes up."}`;
    }
  } else if (id === "ready") {
    const next = tier === "amateur" ? { n: "turning pro", lvl: 50 } : tier === "local" ? { n: "a regional promotion", lvl: 60 } : tier === "regional" ? { n: "the UFC", lvl: 68 } : tier === "league" ? { n: "the UFC", lvl: 76 } : { n: rank === 0 ? "defending the belt" : "the title", lvl: 85 };
    const gap = next.lvl - o;
    a = gap <= 0
      ? `Yes. You're at the level for ${next.n}. ${tier === "regional" ? "A title here, or a run of three or four, and they'll call." : tier === "major" ? (rank !== null && rank <= 5 ? "Ask for the title shot after the next win." : "Beat ranked men and the shot comes.") : "Keep winning and the offers come."}`
      : gap <= 4
      ? `Close. You're a few months of good training from ${next.n}. Win the fights in front of you.`
      : `Not yet. ${next.n === "the UFC" ? "The UFC" : "The next level"} would be a step too far right now; another year or so of work.`;
  } else if (id === "weight") {
    const lim = DIVISIONS[f.div].limit;
    const cut = (f.walk - lim) / f.walk;
    const nb = neighbourDivisions(f.div);
    a = cut > 0.12
      ? `You walk at ${f.walk} lb for a ${lim} lb limit: a ${(cut * 100).toFixed(0)}% cut. It's draining you on fight night.${nb.up ? ` Moving up to ${DIVISIONS[nb.up].name.toLowerCase()} is worth thinking about.` : ""}`
      : cut < 0.06 && nb.down
      ? `You're barely cutting (${(cut * 100).toFixed(0)}%). If you can slim down your walking weight, ${DIVISIONS[nb.down].name.toLowerCase()} would make you the bigger man.`
      : `The cut's fine: ${f.walk} lb to ${lim} is ${(cut * 100).toFixed(0)}%. Stay where you are.`;
  } else if (id === "short") {
    const on = w.career.fc[f.id]?.shortNotice;
    a = rank !== null && rank <= 5
      ? `You're ${rankText(rank)}: short notice is a gamble with a lot to lose. Only for a title shot.${on ? "" : " For now you're not taking calls."}`
      : `Yes${rank === null ? ", while you're making your name" : ""}. Most replacements lose, but they get paid, get seen, and a short-notice loss is forgiven. The weight's the thing: from ${f.walk} lb, keep your walking weight sensible.${on ? " You're down as available." : " You're not taking calls right now; say the word and I'll tell the matchmakers."}`;
  } else {
    const room = outlookRoom(f, w.day);
    const g = w.gyms[f.gym];
    const steps: string[] = [];
    if (tier === "amateur" || tier === "local") steps.push("Build the record: a few more wins and the regional shows will call.");
    else if (tier === "regional") steps.push(isChampion(w, f) ? "Defend the belt once, and the UFC or the PFL will want you." : "Get the regional title, or a run of wins, for the call-up.");
    else if (tier === "league") steps.push("Win the league fights in front of you; when the deal is done, the UFC can talk.");
    else if (rank === null) steps.push("Get a ranked name on the record and you're in the top fifteen.");
    else if (rank > 5) steps.push(`From ${rankText(rank)}, beat someone above you and call out the next one.`);
    else if (rank > 0) steps.push("One more big win and ask for the title shot.");
    else steps.push("Defend the belt and build the legacy.");
    if (room > 6) steps.push("You're still improving fast: train hard and don't rush into the wrong fights.");
    else if (age > 32) steps.push("The clock's running: take the fights that matter.");
    if (g && (g.coaches.head < 60 || g.rep < 50) && o > 65) steps.push("A better gym would make a difference at this level.");
    a = steps.join(" ");
  }
  return { q, a: `${a}` };
}

export function adviceDate(w: World): string {
  return fmtDate(w.day);
}

export { fullName };
