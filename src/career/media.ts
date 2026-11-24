// In front of the press: the press conference five or six weeks out for the
// big fights, media day in fight week, and the press conference after the
// fight. The questions come from the fight and the fighters (the records, the
// run, the cut, the stakes, the bad blood, what the opponent has been saying);
// every answer moves the popularity, the heat and how the fighter arrives on
// the night, and the opponent answers back in character. Too much trash talk
// at a press conference can turn into a shoving match and a fine.

import type { Rng } from "../core/rng";
import { clamp, money } from "../core/util";
import { ageAt, fmtDate } from "../core/time";
import { DIVISIONS } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import { FIGHT_STYLES } from "../data/fightstyles";
import { methodPhrase } from "../engine/sim";
import { groupScore } from "../model/attributes";
import type { AnswerTone, Bout, Fighter, MediaKind, MediaQuestion, MediaSession, Message, World } from "../model/types";
import { addNews, fullName, isChampion, nextId, rankOf, recordText, touch, withRng } from "../world/core";
import { fightStyle } from "../world/fightstyle";
import { notify } from "./inbox";
import { ledger } from "./money";
import { addHeat, addMoment, addPop, fightHype, heatOf, hypeLabel, stageMul } from "./rivals";
import { calloutTargets } from "./fightweek";
import { bmfEligible, callOut } from "./social";
import { boutLimit } from "./shortnotice";

export const TONE_NAME: Record<AnswerTone, string> = { respect: "Respectful", confident: "Confident", trash: "Trash talk", funny: "Funny", deflect: "Deflect" };

const OUTLETS = ["Cageside Daily", "The Fight Ledger", "Octagon Weekly", "Ground Game Radio", "The Fight Desk", "Corner Talk", "MMA Wire", "The Undercard"];
const REPORTERS = ["Mike Ortega", "Sarah Lindqvist", "Tom Okafor", "Ben Carrow", "Lena Park", "Jon Ferris", "Alex Moreau", "Rui Santos", "Kate Moloney", "Darren Hale", "Nadia Petrova", "Chris Walden"];

export function tierFine(b: Pick<Bout, "promo">): number {
  const tier = PROMOTIONS[b.promo].tier;
  return tier === "major" ? 10000 : tier === "league" ? 5000 : tier === "regional" ? 2000 : 500;
}

/** The fights that get a press conference weeks out: the big nights. */
export function bigFight(w: World, b: Bout): boolean {
  const tier = PROMOTIONS[b.promo].tier;
  const ev = w.events[b.ev];
  const belt = b.kind === "title" || b.kind === "interim" || b.kind === "vacant" || b.kind === "bmf";
  if (tier === "major") return belt || (ev?.kind === "numbered" && b.order === 0);
  if (tier === "league") return belt || b.order === 0;
  if (tier === "regional") return b.kind === "title" || b.kind === "vacant";
  return false;
}

function pick<T>(rng: Rng, list: T[]): T {
  return list[Math.floor(rng.next() * list.length)];
}

/** Fill in the opponent's pronouns: {he} {him} {his} {He}. */
function pro(text: string, f: Fighter): string {
  const she = f.sex === "F";
  return text.replace(/\{he\}/g, she ? "she" : "he").replace(/\{He\}/g, she ? "She" : "He").replace(/\{him\}/g, she ? "her" : "him").replace(/\{his\}/g, she ? "her" : "his");
}

type Q = { q: string; answers: { tone: AnswerTone; text: string; callout?: string }[] } | null;

function sideOf(b: Bout, f: Fighter): "a" | "b" {
  return b.a === f.id ? "a" : "b";
}

/** What the opponent will say this time, from the personality and the heat. */
function oppTone(w: World, rng: Rng, opp: Fighter, f: Fighter): AnswerTone {
  const heat = heatOf(w, f.id, opp.id);
  const c = opp.pers.controversy + heat / 12;
  if (rng.chance(clamp((c - 8) / 14, 0.04, 0.8))) return "trash";
  if (rng.chance(0.45)) return "confident";
  return "respect";
}

function oppLinesFor(rng: Rng, opp: Fighter, f: Fighter, tone: AnswerTone, kind: MediaKind): string[] {
  const n = f.surname;
  if (kind === "postfight") return [];
  if (tone === "trash")
    return [
      pick(rng, [`${n} is a paper tiger. I'm going to expose that.`, `I've seen ${n}'s best and I'm not impressed.`, `${n} doesn't belong in there with me, and everybody knows it.`, `I'm going to embarrass ${n} in front of the whole world.`]),
      pick(rng, [`Round one. Maybe round two if I feel generous.`, `Enjoy the money, ${n}. It's the last good payday.`, `Look at ${f.sex === "F" ? "her" : "him"}. ${f.sex === "F" ? "She" : "He"}'s already scared.`]),
    ];
  if (tone === "confident") return [pick(rng, [`I respect ${n}, but this is my time.`, `I've been here before. ${n} hasn't.`, `It won't go the distance.`])];
  return [pick(rng, [`${n} is a great fighter and I've prepared for a hard fight.`, `Nothing but respect. May the best one win.`])];
}

function preQuestions(w: World, rng: Rng, f: Fighter, b: Bout, opp: Fighter, otone: AnswerTone): Q[] {
  const ev = w.events[b.ev];
  const when = fmtDate(b.day, { year: false });
  const out: Q[] = [];
  const champ = isChampion(w, f);
  const r = f.rec;
  const or = opp.rec;
  const heat = heatOf(w, f.id, opp.id);
  // The danger in front of them.
  if (or.koW + or.subW >= 3)
    out.push({
      q: `${opp.surname} has ${or.koW} knockout${or.koW === 1 ? "" : "s"}${or.subW ? ` and ${or.subW} submission${or.subW === 1 ? "" : "s"}` : ""} in ${or.w} wins. What worries you most?`,
      answers: [
        { tone: "respect", text: "{He}'s dangerous everywhere, and I've prepared for all of it." },
        { tone: "confident", text: "Nothing. I've seen it all on tape, and I've got answers for it." },
        { tone: "trash", text: "Those were against nobodies. {He}'s never fought anyone like me." },
        { tone: "funny", text: "Honestly? The traffic on the way to the arena." },
      ],
    });
  // What the opponent has been saying.
  if (otone === "trash")
    out.push({
      q: `${opp.surname} says you're ${pick(rng, ["a paper tiger", "not on " + (opp.sex === "F" ? "her" : "his") + " level", "a gatekeeper at best", "one punch from retirement"])}. Your response?`,
      answers: [
        { tone: "respect", text: `{He} can say what {he} wants. I'll answer on ${when}.` },
        { tone: "confident", text: "Talk is cheap. I'll make {him} eat those words." },
        { tone: "trash", text: "{He} talks because {he}'s scared, and everyone in this room can see it." },
        { tone: "deflect", text: "I don't read what {he} says. I'm focused on me." },
      ],
    });
  // The stakes.
  if (b.kind === "bmf")
    out.push({
      q: "The BMF title is on the line. What does that belt mean to you?",
      answers: [
        { tone: "respect", text: "It's the fans' belt. I'll give them a war." },
        { tone: "confident", text: "It means I'm the baddest in the sport, and I'll prove it." },
        { tone: "trash", text: `${opp.surname} isn't a BMF. {He}'s a tough guy on social media.` },
        { tone: "funny", text: "It means I can't say no to anything for a year." },
      ],
    });
  else if ((b.kind === "title" || b.kind === "vacant" || b.kind === "interim") && champ)
    out.push({
      q: `You're the champion. ${opp.surname} says your reign ends on ${when}. Does the pressure feel any different?`,
      answers: [
        { tone: "respect", text: "Every challenger brings something new. I respect {him} and I'll be ready." },
        { tone: "confident", text: "Pressure is for the challenger. I'm the champion for a reason." },
        { tone: "trash", text: "{He}'s another name on my list of defences." },
        { tone: "deflect", text: "I don't think about pressure. Just the work." },
      ],
    });
  else if (b.kind === "title" || b.kind === "vacant" || b.kind === "interim")
    out.push({
      q: `This is for the ${DIVISIONS[b.div].name.toLowerCase()} title. What would the belt mean to you?`,
      answers: [
        { tone: "respect", text: "Everything. It's for my family and my team." },
        { tone: "confident", text: "It means I was right all along. It's coming home with me." },
        { tone: "trash", text: `It means ${opp.surname} goes back to being a nobody.` },
        { tone: "funny", text: "It'll look good next to my bed." },
      ],
    });
  else if (b.order === 0 && ev)
    out.push({
      q: `You're headlining ${ev.name}. Is this the biggest night of your career?`,
      answers: [
        { tone: "respect", text: "It's an honour. I won't waste it." },
        { tone: "confident", text: "It's the first of many." },
        { tone: "trash", text: "It should have happened a long time ago." },
        { tone: "deflect", text: "It's another fight. Same cage, same work." },
      ],
    });
  // The run they're on.
  if (f.streak >= 3)
    out.push({
      q: `${f.streak} wins in a row. What's changed?`,
      answers: [
        { tone: "respect", text: "My team. We've done the work and it's showing." },
        { tone: "confident", text: "I've figured it out. Nobody in the division can stop me right now." },
        { tone: "trash", text: "Nothing. The others just aren't very good." },
        { tone: "funny", text: "I started eating vegetables." },
      ],
    });
  else if (f.streak <= -1) {
    const lastId = [...f.bouts].reverse().find((id) => w.bouts[id]?.status === "done");
    const last = lastId ? w.bouts[lastId] : undefined;
    const who = last ? w.fighters[last.a === f.id ? last.b : last.a] : undefined;
    const dec = last?.res?.method === "DEC";
    out.push({
      q: `You're coming off a loss${who ? ` to ${who.surname}` : ""}. What did you learn?`,
      answers: [
        { tone: "respect", text: "A lot. Losses teach you more than wins." },
        { tone: "confident", text: "That I'm better than that night. You'll see the difference." },
        { tone: "trash", text: dec ? "Nothing. I got robbed, and everyone knows it." : "It was a lucky shot. It won't happen twice." },
        { tone: "deflect", text: "That's behind me. I only think about this fight." },
      ],
    });
  } else if (r.l === 0 && r.w >= 5)
    out.push({
      q: `Still unbeaten at ${recordText(f)}. Does the zero weigh on you?`,
      answers: [
        { tone: "respect", text: "The zero goes one day. I just want to be the best I can be." },
        { tone: "confident", text: "It's not going anywhere." },
        { tone: "trash", text: `${opp.surname} is going to be another win on the record.` },
        { tone: "deflect", text: "I don't think about it." },
      ],
    });
  // The cut, the notice.
  const limit = boutLimit(b);
  if ((f.walk - limit) / limit >= 0.1)
    out.push({
      q: `You walk around at ${Math.round(f.walk)} lb. How's the cut to ${limit} going?`,
      answers: [
        { tone: "respect", text: "The team has it under control. I'll be on weight." },
        { tone: "confident", text: "I'll be on weight and bigger than {him} on the night." },
        { tone: "trash", text: "Better than {his}. Ask {him} about {his} cut." },
        { tone: "deflect", text: "Ask me again at the weigh-ins." },
      ],
    });
  if (b.shortNotice && b.sub === f.id)
    out.push({
      q: `You took this fight on ${b.notice ?? "a few"} days' notice. Smart, or reckless?`,
      answers: [
        { tone: "respect", text: "It's a big chance and I wasn't going to let it pass." },
        { tone: "confident", text: "I'm always in shape. Short notice suits me." },
        { tone: "trash", text: "{He} should be worried. A short camp and I'll still beat {him}." },
        { tone: "deflect", text: "Ask me after the fight." },
      ],
    });
  // Bad blood.
  if (heat >= 25)
    out.push({
      q: "There's real bad blood between you two. Is this personal?",
      answers: [
        { tone: "respect", text: "No. It's business. I respect what {he}'s done." },
        { tone: "confident", text: "It's personal now, and I'm going to settle it." },
        { tone: "trash", text: "I don't like {him}. I'm going to hurt {him}." },
        { tone: "deflect", text: "It's a fight. I'll let it do the talking." },
      ],
    });
  // The styles.
  const os = FIGHT_STYLES[fightStyle(opp).s];
  const og = FIGHT_STYLES[fightStyle(opp).g];
  const grappler = groupScore(f.attrs, "grappling") > groupScore(f.attrs, "striking");
  out.push({
    q: `${opp.surname} is a ${(rng.chance(0.5) ? os : og).name.toLowerCase()}. Where does this fight go?`,
    answers: [
      { tone: "respect", text: "Wherever it goes, I'm ready for it." },
      { tone: "confident", text: "Wherever I want it to go." },
      { tone: "trash", text: grappler ? "To the floor, where {he}'ll tap." : "Straight to a knockout. {His} chin won't hold up." },
      { tone: "deflect", text: "You'll have to watch." },
    ],
  });
  // What comes next.
  const rank = rankOf(w, f);
  if (rank !== null && rank > 0 && rank <= 10 && !champ)
    out.push({
      q: "Win this, and what's next? The title?",
      answers: [
        { tone: "respect", text: "One fight at a time. This one first." },
        { tone: "confident", text: "Win this and I'm next for the belt. Simple." },
        { tone: "trash", text: "The champion is watching, and the champion is worried." },
        { tone: "deflect", text: "Ask my manager." },
      ],
    });
  // Home or away.
  if (ev && ev.country === f.country)
    out.push({
      q: `Fighting at home in ${ev.city}. Pressure, or a boost?`,
      answers: [
        { tone: "respect", text: "It's a dream to fight in front of my people." },
        { tone: "confident", text: "They're going to see something special." },
        { tone: "trash", text: "{He}'s walking into my house. Bad idea." },
        { tone: "funny", text: "The only pressure is finding enough tickets for my family." },
      ],
    });
  else if (ev && ev.country === opp.country)
    out.push({
      q: `${opp.surname} is fighting at home. A whole arena against you. Bothered?`,
      answers: [
        { tone: "respect", text: "I love it. That's what we do this for." },
        { tone: "confident", text: "I'll quiet them down early." },
        { tone: "trash", text: "They'll be cheering for me by round two." },
        { tone: "deflect", text: "I won't hear them." },
      ],
    });
  const age = ageAt(f.birth, w.day);
  if (age >= 35)
    out.push({
      q: `At ${Math.floor(age)}, how many more of these do you have in you?`,
      answers: [
        { tone: "respect", text: "As many as my body lets me. I still love this." },
        { tone: "confident", text: "Age is a number. Watch me on fight night." },
        { tone: "trash", text: "Enough to beat kids like {him}." },
        { tone: "deflect", text: "I'm not thinking about that." },
      ],
    });
  return out;
}

function prediction(): Q {
  return {
    q: "Prediction?",
    answers: [
      { tone: "respect", text: "I'll win. However it comes, I'm ready." },
      { tone: "confident", text: "A finish, inside two rounds." },
      { tone: "trash", text: "{He}'s not hearing the bell for round two." },
      { tone: "funny", text: "My mum says round one, and she's never wrong." },
    ],
  };
}

function postQuestions(w: World, f: Fighter, b: Bout, opp: Fighter): Q[] {
  const res = b.res;
  if (!res) return [];
  const won = res.winner === sideOf(b, f);
  const lost = res.winner !== null && !won;
  const out: Q[] = [];
  if (won) {
    out.push({
      q: res.method === "DEC" ? "A decision win. How did it feel in there?" : `${methodPhrase(res.method, res.detail).replace(/^./, (c) => c.toUpperCase())} in round ${res.round}. Walk us through it.`,
      answers: [
        { tone: "respect", text: "We saw something in the film and it worked. Credit to my coaches, and to {him}." },
        { tone: "confident", text: "I told you all what would happen." },
        { tone: "funny", text: "I closed my eyes and threw it." },
        { tone: "trash", text: "{He} wasn't ready for that level." },
      ],
    });
    const answers: { tone: AnswerTone; text: string; callout?: string }[] = [];
    const ps = f.promo ? w.promos[f.promo] : null;
    const champId = ps?.champs[f.div];
    const champ = champId && champId !== f.id ? w.fighters[champId] : null;
    const rank = rankOf(w, f);
    if (champ && rank !== null && rank <= 5) answers.push({ tone: "confident", text: `${champ.surname}. Give me the belt.`, callout: champ.id });
    for (const t of calloutTargets(w, f).slice(0, 2)) if (t.id !== champ?.id) answers.push({ tone: "trash", text: `${t.surname}. I want ${t.sex === "F" ? "her" : "him"} next.`, callout: t.id });
    const holder = w.promos.ufc?.bmf?.holder;
    if (bmfEligible(w, f) && holder && holder !== f.id) answers.push({ tone: "confident", text: `The BMF title. ${w.fighters[holder]?.surname ?? "The holder"}, let's go.`, callout: `bmf:${holder}` });
    answers.push({ tone: "respect", text: "Whoever the promotion wants. I'll be ready." });
    out.push({ q: "Who's next?", answers: answers.slice(0, 4) });
  } else if (lost) {
    const dec = res.method === "DEC";
    out.push({
      q: "What happened tonight?",
      answers: [
        { tone: "respect", text: `${opp.surname} was better tonight. No excuses.` },
        { tone: "deflect", text: "I need to watch it back before I say anything." },
        { tone: "confident", text: "One bad night. I'll be back stronger." },
        ...(dec ? [{ tone: "trash" as AnswerTone, text: "I thought I won. The judges got it wrong." }] : []),
      ],
    });
    const close = res.verdict === "split" || res.verdict === "majority" || (dec && res.cards?.some(([x, y]) => Math.abs(x - y) <= 1));
    if (close)
      out.push({
        q: "Do you want the rematch?",
        answers: [
          { tone: "respect", text: "One day. I've got work to do first." },
          { tone: "confident", text: "Run it back. I want it now.", callout: opp.id },
          { tone: "trash", text: "{He} knows {he} didn't win. Give me the rematch.", callout: opp.id },
          { tone: "deflect", text: "I'll talk to my team." },
        ],
      });
    if (ageAt(f.birth, w.day) >= 34 && f.streak <= -2)
      out.push({
        q: "Is this the end of the road?",
        answers: [
          { tone: "respect", text: "I'll sit down with my family and decide." },
          { tone: "confident", text: "No chance. I'm not done." },
          { tone: "deflect", text: "Not tonight. Ask me in a few weeks." },
        ],
      });
  } else {
    out.push({
      q: "A draw. Fair result?",
      answers: [
        { tone: "respect", text: "Close fight. We'll do it again." },
        { tone: "confident", text: "I thought I did enough.", callout: opp.id },
        { tone: "trash", text: "{He} got gifted a draw. I won that.", callout: opp.id },
      ],
    });
  }
  return out;
}

function shuffle<T>(rng: Rng, a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

function build(rng: Rng, opp: Fighter, list: Q[]): MediaQuestion[] {
  const used = new Set<string>();
  return list.filter((q): q is NonNullable<Q> => !!q).map((q) => {
    let who = pick(rng, REPORTERS);
    for (let k = 0; k < 4 && used.has(who); k++) who = pick(rng, REPORTERS);
    used.add(who);
    return { who, outlet: pick(rng, OUTLETS), q: q.q, answers: q.answers.map((a) => ({ ...a, text: pro(a.text, opp) })) };
  });
}

export function sessionsOf(w: World): MediaSession[] {
  return (w.career.media = w.career.media ?? []);
}

export function sessionById(w: World, id: string): MediaSession | undefined {
  return w.career.media?.find((s) => s.id === id);
}

/** Open a press session for a fighter and a bout. */
export function startSession(w: World, rng: Rng, f: Fighter, b: Bout, kind: MediaKind): MediaSession {
  const opp = w.fighters[b.a === f.id ? b.b : b.a];
  const otone = oppTone(w, rng, opp, f);
  let qs: Q[];
  if (kind === "postfight") qs = postQuestions(w, f, b, opp);
  else {
    const pool = shuffle(rng, preQuestions(w, rng, f, b, opp, otone));
    // The opponent's words get asked about first; a prediction always ends it.
    pool.sort((x, y) => (y?.q.startsWith(opp.surname + " says") ? 1 : 0) - (x?.q.startsWith(opp.surname + " says") ? 1 : 0));
    qs = [...pool.slice(0, kind === "presser" ? 3 : 2), prediction()];
  }
  const s: MediaSession = {
    id: nextId(w, "ms"),
    kind,
    fighter: f.id,
    bout: b.id,
    opp: opp.id,
    day: w.day,
    questions: build(rng, opp, qs),
    oppLines: oppLinesFor(rng, opp, f, otone, kind),
    done: false,
    pop: 0,
    heat: 0,
    prep: 0,
    fine: 0,
  };
  const list = sessionsOf(w);
  list.push(s);
  // Keep the open ones and the last few finished.
  while (list.length > 14) {
    const k = list.findIndex((x) => x.done);
    list.splice(k >= 0 ? k : 0, 1);
  }
  return s;
}

export const KIND_NAME: Record<MediaKind, string> = { presser: "Press conference", mediaday: "Media day", postfight: "Post-fight press conference" };

/** Daily: the press conference for a big fight, five or six weeks out. */
export function pressDaily(w: World, rng: Rng): void {
  void rng;
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    if (!f?.booked) continue;
    const b = w.bouts[f.booked];
    if (!b || b.status !== "booked" || b.pending) continue;
    const days = b.day - w.day;
    if (days < 26 || days > 42 || !bigFight(w, b)) continue;
    if (w.inbox.some((m) => m.kind === "media" && m.ref === b.id && m.fighter === f.id && m.data?.kind === "presser")) continue;
    const ev = w.events[b.ev];
    const opp = w.fighters[b.a === f.id ? b.b : b.a];
    const hype = fightHype(w, b);
    notify(w, {
      kind: "media",
      fighter: f.id,
      ref: b.id,
      from: `${PROMOTIONS[b.promo].short} media team`,
      subject: `Press conference: ${f.surname} vs ${opp.surname}`,
      body: `${PROMOTIONS[b.promo].name} is selling ${ev?.name ?? "the event"} with a press conference ${ev ? `in ${ev.city}` : ""}, ${days} days before the fight. ${opp.surname} will be there. The press will ask about the fight, the run you're on and whatever ${opp.sex === "F" ? "she" : "he"}'s been saying. Skipping it costs a fine and the promotion remembers.`,
      needs: true,
      actions: [
        { id: "press:go", label: "Go to the press conference", primary: true },
        { id: "press:skip", label: "Skip it", danger: true },
      ],
      facts: [
        { k: "Event", v: `${ev?.name ?? "?"}, ${fmtDate(b.day)}` },
        { k: "Opponent", v: `${fullName(opp)} (${recordText(opp)})` },
        { k: "Fight hype", v: `${hype} · ${hypeLabel(hype)}` },
        { k: "Heat", v: heatOf(w, f.id, opp.id) ? `${heatOf(w, f.id, opp.id)} of 100` : "None yet" },
        { k: "Skipping", v: `${money(tierFine(b))} fine`, tone: "warn" },
      ],
      data: { kind: "presser", bout: b.id },
    });
  }
}

/** The session behind a press message, opened the first time it's asked for. */
export function openSession(w: World, m: Message): MediaSession | null {
  const kind = m.data?.kind as MediaKind | undefined;
  const b = m.ref ? w.bouts[m.ref] : undefined;
  const f = m.fighter ? w.fighters[m.fighter] : undefined;
  if (!kind || !b || !f) return null;
  const sid = m.data?.session as string | undefined;
  const have = sid ? sessionById(w, sid) : undefined;
  if (have) return have;
  const s = withRng(w, (rng) => startSession(w, rng, f, b, kind));
  s.msg = m.id;
  m.data = { ...(m.data ?? {}), session: s.id };
  touch(w);
  return s;
}

/** Answer one question. Returns the room's reaction or the opponent's comeback. */
export function answerQuestion(w: World, s: MediaSession, qi: number, ai: number): string {
  const q = s.questions[qi];
  const f = w.fighters[s.fighter];
  const opp = w.fighters[s.opp];
  if (!q || q.picked !== undefined || !f || !opp || s.done) return "";
  const a = q.answers[ai];
  if (!a) return "";
  q.picked = ai;
  const n = Math.max(2, s.questions.length);
  const per = 2.5 / n;
  const tm = stageMul(f);
  const fx: Record<AnswerTone, [number, number, number]> = {
    respect: [0.35, -3, 0.012],
    confident: [0.75, 2, 0.006],
    trash: [0.8 + f.pers.controversy / 20, 8, f.pers.temperament >= 11 ? 0.004 : -0.012],
    funny: [0.9, 0, 0.004],
    deflect: [0.05, -1, 0.01],
  };
  const [p, h, pr] = fx[a.tone];
  s.pop += p * per * tm * (s.kind === "postfight" ? 1.2 : 1);
  s.heat += h * (s.kind === "postfight" ? 0.6 : 1);
  s.prep += pr * per;
  const reply = withRng(w, (rng) => {
    const theirs = s.oppLines.length > 1 ? "trash" : "calm";
    if (s.kind === "postfight") {
      if (a.tone === "funny") return "The room laughs.";
      if (a.tone === "trash") return "That one will be all over the internet by morning.";
      if (a.callout) return "The cameras swing to the front row. The matchmaker is listening.";
      return pick(rng, ["The room nods along.", "A few claps from the back.", "The journalist moves on."]);
    }
    if (a.tone === "trash") return theirs === "trash" || opp.pers.temperament < 10 ? `${opp.surname} grabs the microphone: "${pick(rng, ["Keep talking. It only makes it sweeter.", "Say that to my face on fight night.", "You'll be quiet soon enough."])}"` : `${opp.surname} just smiles and shakes ${opp.sex === "F" ? "her" : "his"} head.`;
    if (a.tone === "funny") return "The room laughs. Even the security guys.";
    if (a.tone === "respect") return `${opp.surname} nods.`;
    if (a.tone === "confident") return pick(rng, ["A cheer from the fans at the back.", `${opp.surname} smirks.`, "The headline writes itself."]);
    return "The journalist moves on.";
  });
  q.reply = reply;
  touch(w);
  return reply;
}

export function sessionComplete(s: MediaSession): boolean {
  return s.questions.every((q) => q.picked !== undefined);
}

function closeMsg(w: World, s: MediaSession, done: string): void {
  const m = s.msg ? w.inbox.find((x) => x.id === s.msg) : undefined;
  if (m) {
    m.done = done;
    m.needs = false;
    m.read = true;
  }
}

/** Wrap up: apply what was said, the face-off at the end, and close the message. */
export function finishSession(w: World, s: MediaSession): string {
  if (s.done) return s.summary ?? "";
  const f = w.fighters[s.fighter];
  const opp = w.fighters[s.opp];
  const b = w.bouts[s.bout];
  if (!f || !opp || !b) return "";
  const side = sideOf(b, f);
  const ev = w.events[b.ev];
  const tones = s.questions.map((q) => (q.picked !== undefined ? q.answers[q.picked].tone : "deflect"));
  const trash = tones.filter((t) => t === "trash").length;
  const parts: string[] = [];
  withRng(w, (rng) => {
    // A press conference that gets heated can end in a shoving match.
    if (s.kind !== "postfight" && trash >= 1) {
      const p = clamp(trash * 0.12 + (f.pers.temperament < 9 ? 0.1 : 0) + (heatOf(w, f.id, opp.id) >= 50 ? 0.1 : 0) + (s.oppLines.length > 1 ? 0.06 : 0) - 0.05, 0, 0.6);
      if (rng.chance(p)) {
        s.scuffle = true;
        s.fine = tierFine(b);
        s.pop += 1 * stageMul(f);
        s.heat += 10;
        if (w.career.mode === "fighter") ledger(w, { amount: -s.fine, what: `Fined after the ${KIND_NAME[s.kind].toLowerCase()} scuffle`, cat: "fine", fighter: f.id });
        parts.push(`It boils over at the face-off: shoving, security in between, and a ${money(s.fine)} fine.`);
        const tier = PROMOTIONS[b.promo].tier;
        if (tier === "major" || tier === "league") addNews(w, { kind: "booking", promo: b.promo, ev: b.ev, fighters: [f.id, opp.id], text: `Tempers flare at the ${ev?.name ?? ""} ${KIND_NAME[s.kind].toLowerCase()}: ${fullName(f)} and ${fullName(opp)} have to be separated.` });
      }
    }
    // A name called out after the fight.
    if (s.kind === "postfight") {
      for (const q of s.questions) {
        const a = q.picked !== undefined ? q.answers[q.picked] : undefined;
        if (!a?.callout) continue;
        const bmf = a.callout.startsWith("bmf:");
        const t = w.fighters[bmf ? a.callout.slice(4) : a.callout];
        if (t && t.id !== f.id) {
          const r = callOut(w, rng, f, t, a.tone === "trash" ? "trash" : "callout", { viaTalk: true, asBmf: bmf });
          parts.push(r.reply);
        }
      }
    }
  });
  const gained = addPop(f, s.pop);
  const heat = s.heat ? addHeat(w, f, opp, s.heat, `${KIND_NAME[s.kind]}${ev ? `, ${ev.name}` : ""}`) : heatOf(w, f.id, opp.id);
  if (s.kind !== "postfight") {
    b.mprep = { ...(b.mprep ?? {}), [side]: clamp((b.mprep?.[side] ?? 0) + s.prep, -0.06, 0.06) };
    if (s.kind === "mediaday") {
      const media = trash >= 1 ? "trash" : tones.filter((t) => t === "confident" || t === "funny").length >= tones.length / 2 ? "confident" : "respect";
      b.media = { ...(b.media ?? {}), [side]: media };
      const ot = s.oppLines.length > 1 ? "trash" : s.oppLines.length ? "confident" : "respect";
      if (!b.media[side === "a" ? "b" : "a"]) b.media = { ...b.media, [side === "a" ? "b" : "a"]: ot };
    }
  }
  // The line people will remember.
  const best = s.questions.map((q) => (q.picked !== undefined ? q.answers[q.picked] : null)).find((a) => a && (a.tone === "trash" || a.tone === "funny" || a.callout)) ?? (s.questions[0].picked !== undefined ? s.questions[0].answers[s.questions[0].picked] : null);
  if (best) addMoment(w, f, "press", `${KIND_NAME[s.kind]}${ev ? `, ${ev.name}` : ""}: "${best.text}"`, opp.id);
  const mood = s.prep > 0.008 ? "focused" : s.prep < -0.004 ? "wound up" : "settled";
  s.summary = [`Popularity ${gained >= 0 ? "+" : ""}${gained.toFixed(1)}.`, `Heat with ${opp.surname}: ${heat}.`, s.kind !== "postfight" ? `${f.surname} leaves ${mood}.` : "", ...parts].filter(Boolean).join(" ");
  s.done = true;
  closeMsg(w, s, s.summary);
  touch(w);
  return s.summary;
}

/** Skip it: a fine (none after a fight) and the fans notice. */
export function skipSession(w: World, m: Message): string {
  const b = m.ref ? w.bouts[m.ref] : undefined;
  const f = m.fighter ? w.fighters[m.fighter] : undefined;
  const kind = m.data?.kind as MediaKind | undefined;
  if (!b || !f || !kind) return "";
  const sid = m.data?.session as string | undefined;
  const s = sid ? sessionById(w, sid) : undefined;
  if (s) {
    s.done = true;
    s.skipped = true;
    s.summary = "Skipped.";
  }
  if (kind === "postfight") return `${f.surname} skips the press conference.`;
  const fine = kind === "presser" ? tierFine(b) : Math.round(tierFine(b) / 2);
  addPop(f, -0.5 * stageMul(f));
  if (w.career.mode === "fighter") ledger(w, { amount: -fine, what: `Fined for missing the ${KIND_NAME[kind].toLowerCase()}`, cat: "fine", fighter: f.id });
  if (kind === "mediaday") b.media = { ...(b.media ?? {}), [sideOf(b, f)]: "skip" };
  return `${f.surname} skips the ${KIND_NAME[kind].toLowerCase()}. The promotion fines ${money(fine)}${kind === "mediaday" ? "; the extra rest helps" : ""}.`;
}

/** For the checks and the 'answer for me' path: play a session the way the fighter talks. */
export function autoPlay(w: World, m: Message): string {
  const s = openSession(w, m);
  if (!s) return "";
  const style = w.career.fc[s.fighter]?.mediaStyle ?? "confident";
  const want: AnswerTone = style === "humble" ? "respect" : style === "trash" ? "trash" : "confident";
  s.questions.forEach((q, i) => {
    if (q.picked !== undefined) return;
    const k = q.answers.findIndex((a) => a.tone === want);
    answerQuestion(w, s, i, k >= 0 ? k : 0);
  });
  return finishSession(w, s);
}

/** The post-fight press conference: offered after the big fights. */
export function offerPostFight(w: World, f: Fighter, b: Bout): void {
  const tier = PROMOTIONS[b.promo].tier;
  if (!(tier === "major" || tier === "league" || bigFight(w, b))) return;
  if (!b.res) return;
  const won = b.res.winner === sideOf(b, f);
  const opp = w.fighters[b.a === f.id ? b.b : b.a];
  notify(w, {
    kind: "media",
    fighter: f.id,
    ref: b.id,
    from: `${PROMOTIONS[b.promo].short} media team`,
    subject: `Post-fight press conference${won ? "" : ": after the loss"}`,
    body: won ? `The press want to hear about the win over ${opp.surname}, and who's next.` : `The press want to hear from you after the loss to ${opp.surname}. You don't have to go.`,
    actions: [
      { id: "press:go", label: "Talk to the press", primary: true },
      { id: "press:skip", label: "Skip it" },
    ],
    data: { kind: "postfight", bout: b.id },
  });
}
