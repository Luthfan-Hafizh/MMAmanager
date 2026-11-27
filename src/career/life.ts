// Life between the fights: the things a training week doesn't plan for. Fans
// who want a picture, a teammate who takes sparring too far, the promotion
// asking you to sit cageside where the champion can see you (and call you into
// the cage), a clip that goes everywhere, a podcast, a sponsor nobody should
// take, a knee that pops in camp, a rival calling you out, a split decision
// the fans think you lost. Each one is a decision, and each answer costs or
// earns something real: popularity, morale, money, sharpness, heat, or the
// next fight. About one every five or six weeks, none in fight week.

import { isFinish } from "../engine/sim";
import type { Rng } from "../core/rng";
import { clamp, money } from "../core/util";
import { fmtDate } from "../core/time";
import { countryOf } from "../data/countries";
import { DIVISIONS } from "../data/divisions";
import { INJURY } from "../data/injuries";
import { PROMOTIONS } from "../data/promotions";
import type { Bout, Fact, Fighter, FighterCareer, MMAEvent, Message, World } from "../model/types";
import { addNews, fullName, gymMembers, rankOf, recordText, touch, withRng } from "../world/core";
import { notify } from "./inbox";
import { ledger } from "./money";
import { playerInjured } from "./injury";
import { addHeat, addMoment, addPop, followers, compact, stageMul } from "./rivals";
import { callOut } from "./social";
import { calloutTargets } from "./fightweek";
import { boutLimit } from "./shortnotice";

interface Ctx {
  f: Fighter;
  fc: FighterCareer;
  tier: string;
  rank: number | null;
  /** Days to the booked fight, if there is one. */
  days: number | null;
  inCamp: boolean;
  mates: Fighter[];
  last?: Bout;
}

interface Made {
  subject: string;
  from: string;
  body: string;
  facts?: Fact[];
  options: { id: string; label: string; primary?: boolean; danger?: boolean }[];
  data?: Record<string, string | number>;
}

interface LifeDef {
  id: string;
  cooldown: number;
  /** Said or done in public: it goes in the fighter's media log. */
  pub?: boolean;
  weight: (w: World, c: Ctx) => number;
  make: (w: World, rng: Rng, c: Ctx) => Made | null;
  resolve: (w: World, rng: Rng, c: Ctx, opt: string, data: Record<string, string | number>) => string;
}

function pick<T>(rng: Rng, list: T[]): T {
  return list[Math.floor(rng.next() * list.length)];
}

function pay(w: World, f: Fighter, amount: number, what: string, cat: "other" | "fine" | "travel" | "sponsor" = "other"): void {
  if (w.career.mode === "fighter" && amount) ledger(w, { amount, what, cat, fighter: f.id });
}

function morale(c: Ctx, d: number): void {
  c.f.morale = clamp(c.f.morale + d, 0, 100);
  c.fc.morale = clamp((c.fc.morale ?? 60) + d, 0, 100);
}

function sharp(f: Fighter, d: number): void {
  f.sharp = clamp(f.sharp + d, 0, 100);
}

function tired(f: Fighter, d: number): void {
  f.fatigue = clamp(f.fatigue + d, 0, 100);
}

function lastBout(w: World, f: Fighter): Bout | undefined {
  for (let i = f.bouts.length - 1; i >= 0; i--) {
    const b = w.bouts[f.bouts[i]];
    if (b?.status === "done" && b.res) return b;
  }
  return undefined;
}

function wonLast(c: Ctx): boolean {
  const b = c.last;
  return !!b?.res && b.res.winner === (b.a === c.f.id ? "a" : "b");
}

function travelCost(tier: string): number {
  return tier === "major" ? 3000 : tier === "league" ? 2200 : 1200;
}

/** The champion's fight, or a big card, coming up in the fighter's promotion: a reason to be cageside. */
function cagesideEvent(w: World, f: Fighter): { ev: MMAEvent; title?: Bout } | null {
  if (!f.promo) return null;
  for (const id of w.upcoming) {
    const ev = w.events[id];
    if (!ev || ev.promo !== f.promo || ev.status === "done") continue;
    const d = ev.day - w.day;
    if (d < 6 || d > 24) continue;
    const bouts = ev.bouts.map((x) => w.bouts[x]).filter((b) => b && b.status === "booked" && !b.pending);
    if (bouts.some((b) => b.a === f.id || b.b === f.id)) continue;
    const title = bouts.find((b) => b.div === f.div && (b.kind === "title" || b.kind === "vacant"));
    if (title || ev.kind === "numbered") return { ev, title };
  }
  return null;
}

/** Fighters who would call out the player's fighter: same division and promotion, near in the rankings, and loud. */
function loudRivals(w: World, f: Fighter): Fighter[] {
  if (!f.promo || PROMOTIONS[f.promo].tier === "amateur") return [];
  const ps = w.promos[f.promo];
  const r = rankOf(w, f) ?? 17;
  const pool = (ps.ranks[f.div] ?? []).map((id) => w.fighters[id]).filter(Boolean);
  const extra = Object.values(w.fighters).filter((x) => x.promo === f.promo && x.div === f.div && x.status === "active" && rankOf(w, x) === null && x.pop >= 12);
  return [...pool, ...extra.slice(0, 30)].filter((x) => x.id !== f.id && !x.ctrl && x.status === "active" && x.gym !== f.gym && x.pers.controversy >= 11 && Math.abs((rankOf(w, x) ?? 17) - r) <= 5 && x.booked !== f.booked);
}

const LIFE: LifeDef[] = [
  {
    id: "fans",
    cooldown: 60,
    pub: true,
    weight: (w, c) => (c.f.pop >= 8 ? 2.4 : 0),
    make: (w, rng, c) => ({
      subject: "Fans want to meet you",
      from: "Fan club",
      body: `${c.f.pop > 50 ? "A fan club with thousands of members" : `A fan club back home in ${c.f.hometown}`} wants a meet-and-greet this weekend: photos, signed gloves, an hour or two. ${c.inCamp ? "It's the middle of camp, though." : ""}`,
      facts: [{ k: "Followers", v: compact(followers(c.f.pop)) }, { k: "When", v: "Saturday afternoon" }],
      options: [
        { id: "go", label: "Meet the fans", primary: true },
        { id: "glove", label: "Send signed gloves" },
        { id: "no", label: "Not this time" },
      ],
    }),
    resolve: (w, rng, c, opt) => {
      const tm = stageMul(c.f);
      if (opt === "go") {
        addPop(c.f, 1.4 * tm);
        morale(c, 5);
        tired(c.f, c.inCamp ? 4 : 2);
        return "The line goes round the block. Good for the soul, and the clips do well online.";
      }
      if (opt === "glove") {
        addPop(c.f, 0.4 * tm);
        pay(w, c.f, -200, "Signed gloves for the fan club");
        return "The gloves go up on the fan club's page. A nice gesture.";
      }
      if (c.f.pop >= 40) addPop(c.f, -0.3);
      return "They understand. Mostly.";
    },
  },
  {
    id: "hospital",
    cooldown: 200,
    pub: true,
    weight: (w, c) => (c.f.pop >= 25 ? 1 : 0),
    make: (w, rng, c) => ({
      subject: "A children's hospital asks for a visit",
      from: "Community team",
      body: `A children's hospital in ${c.f.hometown} asks whether you'd come and spend an afternoon on the ward. A lot of the kids watch your fights.`,
      options: [
        { id: "visit", label: "Visit", primary: true },
        { id: "donate", label: `Send a donation (${money(c.f.pop >= 60 ? 5000 : 1500)})` },
        { id: "no", label: "Decline" },
      ],
    }),
    resolve: (w, rng, c, opt) => {
      const tm = stageMul(c.f);
      if (opt === "visit") {
        addPop(c.f, 1.8 * tm);
        morale(c, 8);
        sharp(c.f, -2);
        return "A day off the mats, worth every minute. The pictures travel.";
      }
      if (opt === "donate") {
        pay(w, c.f, -(c.f.pop >= 60 ? 5000 : 1500), "Donation to the children's hospital");
        addPop(c.f, 0.8 * tm);
        morale(c, 3);
        return "The hospital thanks you publicly.";
      }
      return "You stay in the gym.";
    },
  },
  {
    id: "sparclash",
    cooldown: 120,
    weight: (w, c) => (c.mates.length ? 1.6 : 0),
    make: (w, rng, c) => {
      const near = c.mates.filter((m) => Math.abs(DIVISIONS[m.div].limit - DIVISIONS[c.f.div].limit) <= 25);
      const mate = pick(rng, near.length ? near : c.mates);
      return {
        subject: `Sparring got heated with ${mate.surname}`,
        from: w.gyms[c.f.gym]?.headCoach ?? "Head coach",
        body: `Hard rounds with ${fullName(mate)} turned personal: words after the bell, then more shots than anyone asked for. The whole gym is watching how you handle it.`,
        facts: [{ k: "Teammate", v: `${fullName(mate)} (${recordText(mate)})` }, { k: "Gym", v: w.gyms[c.f.gym]?.name ?? "Your gym" }],
        options: [
          { id: "talk", label: "Talk it out", primary: true },
          { id: "spar", label: "Settle it in sparring", danger: true },
          { id: "coach", label: "Let the coach handle it" },
          { id: "leave", label: "Look for another gym" },
        ],
        data: { mate: mate.id },
      };
    },
    resolve: (w, rng, c, opt, data) => {
      const mate = w.fighters[String(data.mate)];
      if (opt === "talk") {
        morale(c, -1);
        return `You and ${mate?.surname ?? "your teammate"} clear the air over a coffee. The gym moves on.`;
      }
      if (opt === "spar") {
        if (rng.chance(0.12)) {
          const def = INJURY[pick(rng, ["ribs-bruised", "eye-cut"])];
          playerInjured(w, rng, c.f, def, "training", "settling it in sparring");
          return `Five rounds, no holding back, and you come out of it with a ${def.name.toLowerCase()}.`;
        }
        sharp(c.f, 4);
        morale(c, 6);
        return "Five hard rounds, then a hug. Everyone trains harder for a week.";
      }
      if (opt === "coach") {
        morale(c, 1);
        return "The coach splits you up for a fortnight. Quietly sorted.";
      }
      morale(c, -4);
      return "Your manager starts asking around. Other gyms are on the Moves page.";
    },
  },
  {
    id: "matediv",
    cooldown: 300,
    pub: true,
    weight: (w, c) => (c.mates.some((m) => m.promo === c.f.promo && m.div === c.f.div && (rankOf(w, m) !== null || m.pop >= 20)) ? 0.9 : 0),
    make: (w, rng, c) => {
      const mate = c.mates.find((m) => m.promo === c.f.promo && m.div === c.f.div && (rankOf(w, m) !== null || m.pop >= 20));
      if (!mate) return null;
      return {
        subject: `Would you fight ${mate.surname}?`,
        from: "Media requests",
        body: `${fullName(mate)} trains with you and is climbing the same division. Every interview ends with the same question: would you two ever fight?`,
        options: [
          { id: "never", label: "We'd never fight", primary: true },
          { id: "business", label: "Business is business" },
          { id: "later", label: "Maybe one day" },
        ],
        data: { mate: mate.id },
      };
    },
    resolve: (w, rng, c, opt, data) => {
      const mate = w.fighters[String(data.mate)];
      if (opt === "never") {
        morale(c, 4);
        addPop(c.f, 0.2);
        return "The gym loves it. Loyalty counts for something.";
      }
      if (opt === "business") {
        addPop(c.f, 0.8 * stageMul(c.f));
        if (mate) addHeat(w, c.f, mate, 15, "Said a fight between teammates is just business");
        morale(c, -3);
        return "It makes the headlines. Training gets awkward.";
      }
      addPop(c.f, 0.3);
      return "A diplomatic answer. The question will come back.";
    },
  },
  {
    id: "cageside",
    cooldown: 90,
    pub: true,
    weight: (w, c) => {
      if (!["major", "league", "regional"].includes(c.tier)) return 0;
      if (!(c.f.pop >= 20 || (c.rank !== null && c.rank <= 15))) return 0;
      if (c.days !== null && c.days < 21) return 0;
      const x = cagesideEvent(w, c.f);
      return x ? (x.title && c.rank !== null && c.rank > 0 && c.rank <= 5 ? 3 : 1.6) : 0;
    },
    make: (w, rng, c) => {
      const x = cagesideEvent(w, c.f);
      if (!x) return null;
      const t = x.title;
      const champId = t ? w.promos[t.promo].champs[t.div] : null;
      const champ = champId ? w.fighters[champId] : null;
      const contender = !!t && c.rank !== null && c.rank > 0 && c.rank <= 5;
      const cost = travelCost(c.tier);
      return {
        subject: `${PROMOTIONS[x.ev.promo].short} wants you cageside at ${x.ev.name}`,
        from: `${PROMOTIONS[x.ev.promo].short} matchmaker`,
        body: `The promotion has a seat for you at ${x.ev.name} in ${x.ev.city} on ${fmtDate(x.ev.day)}${t ? `, where ${champ ? `${champ.surname} defends` : "they fight for"} the ${DIVISIONS[t.div].name.toLowerCase()} title` : ""}. Be seen, do the interviews, raise your value.${contender ? " And be ready: if the winner calls you into the cage, the face-off will be everywhere." : ""}`,
        facts: [
          { k: "Event", v: `${x.ev.name}, ${fmtDate(x.ev.day)}` },
          { k: "Where", v: `${x.ev.city}, ${countryOf(x.ev.country).name}` },
          ...(t ? [{ k: "Main attraction", v: `${fullName(w.fighters[t.a])} vs ${fullName(w.fighters[t.b])}` }] : []),
          { k: "Your cost", v: w.career.mode === "fighter" ? `${money(cost)} travel` : "The promotion pays" },
        ],
        options: [
          { id: "go", label: "Fly in", primary: true },
          { id: "no", label: "Watch at home" },
        ],
        data: { event: x.ev.id, title: t?.id ?? "" },
      };
    },
    resolve: (w, rng, c, opt, data) => {
      if (opt !== "go") return "Maybe next time.";
      pay(w, c.f, -travelCost(c.tier), "Travel to sit cageside", "travel");
      addPop(c.f, 1 * stageMul(c.f));
      tired(c.f, 3);
      const contender = !!data.title && c.rank !== null && c.rank > 0 && c.rank <= 5;
      c.fc.cageside = { ev: String(data.event), champ: contender ? String(data.title) : undefined };
      return contender ? "Front row. If the winner calls you into the cage, be ready." : "Front row, interviews all night. The promotion is pleased.";
    },
  },
  {
    id: "champface",
    cooldown: 0,
    pub: true,
    weight: () => 0,
    make: () => null,
    resolve: (w, rng, c, opt, data) => {
      const champ = w.fighters[String(data.champ)];
      if (!champ || !c.f.promo) return "";
      const ps = w.promos[c.f.promo];
      const r = rankOf(w, c.f);
      const tm = stageMul(c.f);
      if (opt === "sit") {
        addPop(c.f, -0.3);
        return "You stay in your seat. The moment passes.";
      }
      const hot = opt === "in";
      addHeat(w, c.f, champ, hot ? 20 : 6, hot ? "Face-off in the cage" : "Respectful face-off in the cage");
      addPop(c.f, (hot ? 2.5 : 1.5) * tm);
      const chance = r !== null && r > 0 && r <= 3 ? (hot ? 0.45 : 0.35) : 0.12;
      const next = rng.chance(chance);
      if (next && ps.champs[c.f.div] === champ.id) ps.contender[c.f.div] = c.f.id;
      addNews(w, { kind: "booking", promo: c.f.promo, fighters: [champ.id, c.f.id], text: `${fullName(champ)} calls ${fullName(c.f)} into the cage${hot ? ", and it gets heated" : " for a face-off"}.${next ? " The promotion says the fight is next." : ""}` });
      return `${hot ? "Nose to nose, words, security in between." : "A long stare and a handshake."} The arena goes wild.${next ? " The promotion says you're next for the belt." : ""}`;
    },
  },
  {
    id: "viral",
    cooldown: 45,
    pub: true,
    weight: (w, c) => {
      const b = c.last;
      const recent = b && w.day - b.day <= 14 && wonLast(c) && isFinish(b.res!.method);
      return recent ? 3 : c.f.pop >= 30 ? 0.4 : 0;
    },
    make: (w, rng, c) => {
      const b = c.last;
      const how = b?.res && wonLast(c) && isFinish(b.res.method) ? (b.res.method === "SUB" ? "submission" : "knockout") : "training clip";
      const views = compact(Math.round(followers(c.f.pop) * (6 + rng.next() * 20)));
      return {
        subject: `Your ${how} is everywhere`,
        from: "Social media",
        body: `The clip of ${c.f.surname}'s ${how} has ${views} views and counting. Strike while it's hot?`,
        facts: [{ k: "Views", v: views, tone: "good" }, { k: "Followers", v: compact(followers(c.f.pop)) }],
        options: [
          { id: "post", label: "Post a challenge", primary: true },
          { id: "thank", label: "Thank the fans" },
          { id: "merch", label: "Drop a T-shirt" },
        ],
      };
    },
    resolve: (w, rng, c, opt) => {
      if (opt === "post") {
        const t = calloutTargets(w, c.f)[0];
        if (t) return callOut(w, rng, c.f, t, "callout", { viaTalk: true }).text;
        addPop(c.f, 1 * stageMul(c.f));
        return "\"Whoever's next, I'm ready.\" The post does numbers.";
      }
      if (opt === "thank") {
        addPop(c.f, 1 * stageMul(c.f));
        morale(c, 3);
        return "The fans love it. Followers up.";
      }
      const amount = Math.round((followers(c.f.pop) / 1000) * 6 + 1500);
      pay(w, c.f, amount, "T-shirt sales after the viral clip", "sponsor");
      addPop(c.f, 0.3);
      return `The shirts sell out in a day: ${money(amount)}.`;
    },
  },
  {
    id: "podcast",
    cooldown: 120,
    pub: true,
    weight: (w, c) => (c.f.pop >= 20 ? 1.3 : 0),
    make: (w, rng, c) => {
      const show = pick(rng, ["The Ground Game", "Sweat Equity", "Corner Talk Live", "Off the Cage", "The Long Round"]);
      return {
        subject: `${show} wants you on`,
        from: "Media requests",
        body: `${show}, one of the biggest fight podcasts, wants you for two hours. A big audience, and the host likes to push.`,
        options: [
          { id: "open", label: "Go on and say what you think", primary: true },
          { id: "safe", label: "Go on, keep it about the fight" },
          { id: "no", label: "Decline" },
        ],
        data: { show },
      };
    },
    resolve: (w, rng, c, opt, data) => {
      const tm = stageMul(c.f);
      if (opt === "open") {
        addPop(c.f, 1.6 * tm);
        if (rng.chance(0.22 + c.f.pers.controversy / 80)) {
          const t = loudRivals(w, c.f)[0] ?? calloutTargets(w, c.f)[0];
          if (t) {
            addHeat(w, c.f, t, 12, `Said something about ${t.surname} on ${data.show}`);
            if (c.f.pop > 30 || t.pop > 30) addNews(w, { kind: "booking", promo: c.f.promo ?? undefined, fighters: [c.f.id, t.id], text: `${fullName(c.f)} takes aim at ${fullName(t)} on ${data.show}.` });
            return `Two hours, no filter. The clip of you on ${t.surname} is all over the internet.`;
          }
          addPop(c.f, -0.6);
          return "Two hours, no filter. One answer lands badly, and the sponsors call your manager.";
        }
        return "Two great hours. The episode does huge numbers.";
      }
      if (opt === "safe") {
        addPop(c.f, 0.7 * tm);
        return "A professional interview. Good for the profile.";
      }
      return "You stay in the gym.";
    },
  },
  {
    id: "shadysponsor",
    cooldown: 240,
    weight: (w, c) => (c.f.pop >= 25 && w.career.mode === "fighter" ? 0.8 : 0),
    make: (w, rng, c) => {
      const brand = pick(rng, ["a crypto exchange nobody has heard of", "an offshore betting site", "a 'miracle' supplement company"]);
      const amount = Math.round((4000 + c.f.pop * 400) / 100) * 100;
      return {
        subject: "A sponsor with a reputation",
        from: "Your manager",
        body: `${brand.charAt(0).toUpperCase()}${brand.slice(1)} offers ${money(amount)} to wear its patch for the next fight. The money's real; the reputation is the problem.`,
        facts: [{ k: "Offer", v: money(amount), tone: "good" }, { k: "Risk", v: "A backlash if it goes wrong", tone: "warn" }],
        options: [
          { id: "take", label: "Take the money" },
          { id: "no", label: "Turn it down", primary: true },
        ],
        data: { amount },
      };
    },
    resolve: (w, rng, c, opt, data) => {
      if (opt === "take") {
        pay(w, c.f, Number(data.amount), "One-off sponsor deal", "sponsor");
        if (rng.chance(0.3)) {
          addPop(c.f, -2);
          return "The money lands, then the story does: fans aren't happy about the sponsor.";
        }
        return "The money lands and nobody notices. This time.";
      }
      morale(c, 2);
      return "Your manager approves. There will be better offers.";
    },
  },
  {
    id: "sparscare",
    cooldown: 120,
    weight: (w, c) => (c.inCamp && c.days !== null && c.days > 10 ? 1.2 : 0),
    make: () => ({
      subject: "Something popped in sparring",
      from: "Team doctor",
      body: "Something popped in your knee during sparring. It doesn't feel terrible, but it doesn't feel right either.",
      options: [
        { id: "scan", label: "Get a scan ($800)", primary: true },
        { id: "push", label: "Train through it", danger: true },
        { id: "rest", label: "Rest it for a few days" },
      ],
    }),
    resolve: (w, rng, c, opt) => {
      if (opt === "scan") {
        pay(w, c.f, -800, "Knee scan");
        if (rng.chance(0.2)) {
          playerInjured(w, rng, c.f, INJURY.ankle, "training", "in sparring (caught early on the scan)");
          return "The scan finds a small sprain, caught early.";
        }
        return "Nothing torn: a bone bruise. Back to work.";
      }
      if (opt === "push") {
        if (rng.chance(0.45)) {
          playerInjured(w, rng, c.f, INJURY.mcl, "training", "training through a sore knee");
          return "It was something. The knee gives way a week later.";
        }
        sharp(c.f, 1);
        return "It settles down by itself. Lucky.";
      }
      sharp(c.f, -3);
      tired(c.f, -12);
      return "Three easy days and it settles.";
    },
  },
  {
    id: "cutwarning",
    cooldown: 60,
    weight: (w, c) => {
      if (!c.inCamp || c.days === null || c.days > 28 || c.days < 8) return 0;
      const b = c.f.booked ? w.bouts[c.f.booked] : undefined;
      if (!b) return 0;
      const lim = boutLimit(b);
      return (c.f.walk - lim) / lim >= 0.08 ? 1.3 : 0;
    },
    make: (w, rng, c) => ({
      subject: "The weight is behind schedule",
      from: "Nutritionist",
      body: `On the scale this morning you're heavier than the plan, with ${c.days} days to go. It can still come off, but not by hoping.`,
      options: [
        { id: "specialist", label: w.career.mode === "fighter" ? "Bring in a cut specialist ($2,000)" : "Bring in a cut specialist", primary: true },
        { id: "diet", label: "Diet harder" },
        { id: "ignore", label: "It'll come off" },
      ],
    }),
    resolve: (w, rng, c, opt) => {
      const camp = c.fc.camp;
      if (opt === "specialist") {
        pay(w, c.f, -2000, "Weight-cut specialist");
        if (camp) camp.nutrition = Math.min(2, camp.nutrition + 1) as 0 | 1 | 2;
        return "The specialist takes over the kitchen. The numbers start moving.";
      }
      if (opt === "diet") {
        tired(c.f, 6);
        sharp(c.f, -2);
        if (camp) camp.cut = "early";
        return "Smaller plates and more cardio. You're hungry, but the weight moves.";
      }
      if (camp) camp.cut = "late";
      return "Your call. It'll be a hard last week.";
    },
  },
  {
    id: "family",
    cooldown: 400,
    weight: () => 0.35,
    make: () => ({
      subject: "A call from home",
      from: "Family",
      body: "Your family needs you back home for a few days. Nothing that can't be fixed, but they want you there.",
      options: [
        { id: "home", label: "Fly home", primary: true },
        { id: "stay", label: "Stay in the gym" },
      ],
    }),
    resolve: (w, rng, c, opt) => {
      if (opt === "home") {
        sharp(c.f, -4);
        morale(c, 6);
        pay(w, c.f, -900, "Flights home", "travel");
        return "Family first. You'll make the time up.";
      }
      morale(c, -8);
      return "You stay. It weighs on you.";
    },
  },
  {
    id: "aicallout",
    cooldown: 45,
    pub: true,
    weight: (w, c) => (c.f.pop >= 12 && loudRivals(w, c.f).length ? 1.6 : 0),
    make: (w, rng, c) => {
      const list = loudRivals(w, c.f).sort((a, b) => b.pers.controversy - a.pers.controversy);
      const t = list[Math.min(list.length - 1, Math.floor(rng.next() * 2))];
      if (!t) return null;
      const r = rankOf(w, t);
      const quote = pick(rng, [`${c.f.surname} has been avoiding me for months. Sign the contract.`, `Everyone thinks ${c.f.surname} is the real deal. I'll show them otherwise.`, `${c.f.surname}, you and me. Any time, any place.`, `I'd stop ${c.f.surname} in one round. The fans know it.`]);
      return {
        subject: `${t.surname} called you out`,
        from: "Social media",
        body: `${fullName(t)} (${recordText(t)}${r === 0 ? ", the champion" : r ? `, #${r}` : ""}) posted: "${quote}"`,
        facts: [{ k: "Followers", v: compact(followers(t.pop)) }, { k: "Ranking", v: r === 0 ? "Champion" : r ? `#${r}` : "Unranked" }],
        options: [
          { id: "accept", label: "Accept the fight", primary: true },
          { id: "fire", label: "Fire back" },
          { id: "ignore", label: "Ignore it" },
        ],
        data: { t: t.id },
      };
    },
    resolve: (w, rng, c, opt, data) => {
      const t = w.fighters[String(data.t)];
      if (!t) return "";
      const tm = stageMul(c.f);
      const bookable = !!c.f.promo && t.promo === c.f.promo && t.div === c.f.div;
      if (opt === "accept") {
        addHeat(w, c.f, t, 12, `${t.surname} called you out and you said yes`);
        addPop(c.f, 0.6 * tm);
        if (bookable) c.fc.callout = { target: t.id, until: w.day + 180, ok: true };
        addMoment(w, c.f, "reply", `To ${t.surname}: "You got it. Tell the matchmaker."`, t.id);
        return `"You got it." Both of you want it, and the matchmaker is listening.`;
      }
      if (opt === "fire") {
        addHeat(w, c.f, t, 20, `Traded insults with ${t.surname}`);
        addPop(c.f, 1.2 * tm);
        if (bookable) c.fc.callout = { target: t.id, until: w.day + 150 };
        if (c.f.pop > 30 || t.pop > 30) addNews(w, { kind: "booking", promo: c.f.promo ?? undefined, fighters: [c.f.id, t.id], text: `${fullName(c.f)} and ${fullName(t)} trade insults online.` });
        addMoment(w, c.f, "reply", `To ${t.surname}: "${pick(rng, ["You couldn't stop a cold. Get in line.", "Come and say it to my face.", "I don't fight people who need my name to sell tickets. Fine, I'll make an exception."])}"`, t.id);
        return "The back-and-forth goes viral. Heat rising.";
      }
      addHeat(w, c.f, t, 4);
      const above = (rankOf(w, c.f) ?? 17) < (rankOf(w, t) ?? 17);
      if (above) return `You don't answer. ${t.surname} needs you more than you need ${t.sex === "F" ? "her" : "him"}.`;
      addPop(c.f, -0.3);
      return "You don't answer. Some fans call it ducking.";
    },
  },
  {
    id: "robbery",
    cooldown: 60,
    pub: true,
    weight: (w, c) => {
      const b = c.last;
      return b && w.day - b.day <= 14 && wonLast(c) && (b.res!.verdict === "split" || b.res!.verdict === "majority") ? 4 : 0;
    },
    make: (w, rng, c) => {
      const b = c.last!;
      const opp = w.fighters[b.a === c.f.id ? b.b : b.a];
      return {
        subject: "The fans think you lost",
        from: "Social media",
        body: `The ${b.res!.verdict} decision over ${opp.surname} has the internet arguing; plenty of media scorecards had it the other way.`,
        facts: [{ k: "Result", v: `Won by ${b.res!.verdict} decision` }, { k: "Judges", v: (b.res!.cards ?? []).map(([x, y]) => `${x}-${y}`).join(", ") || "-" }],
        options: [
          { id: "rematch", label: "Offer the rematch", primary: true },
          { id: "stand", label: "Say you won it fair" },
          { id: "quiet", label: "Say nothing" },
        ],
        data: { opp: opp.id },
      };
    },
    resolve: (w, rng, c, opt, data) => {
      const opp = w.fighters[String(data.opp)];
      const tm = stageMul(c.f);
      if (opt === "rematch") {
        addPop(c.f, 1 * tm);
        if (opp) {
          addHeat(w, c.f, opp, -5);
          if (c.f.promo && opp.promo === c.f.promo && opp.div === c.f.div) c.fc.callout = { target: opp.id, until: w.day + 180, ok: true };
        }
        return "Classy. The fans come round, and the matchmaker notes it.";
      }
      if (opt === "stand") {
        addPop(c.f, -0.4);
        if (opp) addHeat(w, c.f, opp, 8, "Argued about the decision");
        return "Half the comments agree with you. The other half don't.";
      }
      addPop(c.f, -0.2);
      return "It blows over in a week.";
    },
  },
  {
    id: "hometown",
    cooldown: 500,
    pub: true,
    weight: (w, c) => {
      const b = c.last;
      const note = b?.res?.belt?.[b.a === c.f.id ? "a" : "b"];
      return b && w.day - b.day <= 30 && note && /Won the (title|vacant title|BMF)|Unified/.test(note) ? 5 : 0;
    },
    make: (w, rng, c) => ({
      subject: `${c.f.hometown} wants a parade`,
      from: "The mayor's office",
      body: `Your hometown wants to celebrate the belt: an open-top bus, the mayor, the whole thing.`,
      options: [
        { id: "go", label: "Go home for it", primary: true },
        { id: "later", label: "After the next defence" },
      ],
    }),
    resolve: (w, rng, c, opt) => {
      if (opt === "go") {
        addPop(c.f, 2 * stageMul(c.f));
        morale(c, 10);
        sharp(c.f, -3);
        return "Half the town turns out. Nobody will forget it.";
      }
      morale(c, -1);
      return "The town understands: there's work to do.";
    },
  },
  {
    id: "film",
    cooldown: 300,
    pub: true,
    weight: (w, c) => (c.f.pop >= 55 && (c.days === null || c.days > 45) ? 0.6 : 0),
    make: (w, rng, c) => ({
      subject: "A film studio calls",
      from: "Your manager",
      body: `A small part in an action film: two weeks on set, ${money(Math.round(c.f.pop * 1000))}, and a lot of new fans. Two weeks out of the gym, too.`,
      options: [
        { id: "take", label: "Take the part", primary: true },
        { id: "no", label: "Stay in the gym" },
      ],
    }),
    resolve: (w, rng, c, opt) => {
      if (opt === "take") {
        pay(w, c.f, Math.round(c.f.pop * 1000), "Film role", "sponsor");
        addPop(c.f, 2.5 * stageMul(c.f));
        sharp(c.f, -6);
        tired(c.f, -10);
        return "Two weeks of standing around and one great fight scene. The trailer does big numbers.";
      }
      morale(c, 1);
      return "The gym it is.";
    },
  },
];

const BY_ID: Record<string, LifeDef> = Object.fromEntries(LIFE.map((d) => [d.id, d]));

function ctxOf(w: World, f: Fighter, fc: FighterCareer): Ctx {
  const b = f.booked ? w.bouts[f.booked] : undefined;
  const days = b && b.status === "booked" && !b.pending ? b.day - w.day : null;
  return {
    f,
    fc,
    tier: f.promo ? PROMOTIONS[f.promo].tier : "amateur",
    rank: rankOf(w, f),
    days,
    inCamp: !!fc.camp && days !== null,
    mates: gymMembers(w, f.gym).filter((m) => m.id !== f.id && m.status === "active" && !m.ctrl),
    last: lastBout(w, f),
  };
}

/** Weekly: now and then, something happens. */
export function lifeWeekly(w: World, rng: Rng): void {
  for (const id of w.career.fighters) {
    const f = w.fighters[id];
    const fc = w.career.fc[id];
    if (!f || !fc || f.status !== "active") continue;
    if (w.inbox.some((m) => m.kind === "life" && m.fighter === id && m.needs && !m.done)) continue;
    const life = (fc.life = fc.life ?? { last: -999, seen: {} });
    if (w.day - life.last < 14) continue;
    const c = ctxOf(w, f, fc);
    if (c.days !== null && c.days <= 6) continue;
    if (!rng.chance(w.career.mode === "manager" ? 0.08 : 0.24)) continue;
    const opts = LIFE.filter((d) => (life.seen[d.id] ?? -99999) + d.cooldown <= w.day)
      .map((d) => ({ d, wt: d.weight(w, c) }))
      .filter((x) => x.wt > 0);
    if (!opts.length) continue;
    const chosen = rng.weighted(opts, (x) => x.wt).d;
    const made = chosen.make(w, rng, c);
    if (!made) continue;
    life.last = w.day;
    life.seen[chosen.id] = w.day;
    notify(w, {
      kind: "life",
      fighter: f.id,
      from: made.from,
      subject: made.subject,
      body: made.body,
      facts: made.facts,
      needs: true,
      actions: made.options.map((o) => ({ id: `life:${o.id}`, label: o.label, primary: o.primary, danger: o.danger })),
      data: { ev: chosen.id, ...(made.data ?? {}) },
    });
  }
}

/** After a card the player watched from cageside: the winner may call them into the cage. */
export function lifeAfterEvent(w: World, ev: MMAEvent): void {
  for (const id of w.career.fighters) {
    const fc = w.career.fc[id];
    const f = w.fighters[id];
    if (!fc?.cageside || fc.cageside.ev !== ev.id || !f) continue;
    const tid = fc.cageside.champ;
    fc.cageside = undefined;
    addMoment(w, f, "life", `Sat cageside at ${ev.name}.`);
    const t = tid ? w.bouts[tid] : undefined;
    if (!t?.res?.winner || !f.promo) continue;
    const champ = w.fighters[t.res.winner === "a" ? t.a : t.b];
    if (!champ || w.promos[f.promo].champs[f.div] !== champ.id) continue;
    notify(w, {
      kind: "life",
      fighter: f.id,
      from: ev.name,
      subject: `${champ.surname} wins, and points at you`,
      body: `${fullName(champ)} wins the ${DIVISIONS[t.div].name.toLowerCase()} title fight at ${ev.name}, grabs the microphone and calls you into the cage. The cameras find you in the front row.`,
      needs: true,
      actions: [
        { id: "life:in", label: "Get in the cage, and in their face", primary: true },
        { id: "life:calm", label: "Step in for a respectful face-off" },
        { id: "life:sit", label: "Stay in your seat" },
      ],
      data: { ev: "champface", champ: champ.id },
    });
  }
}

/** The answer to an unexpected event. */
export function answerLife(w: World, m: Message, opt: string): string {
  const def = BY_ID[String(m.data?.ev ?? "")];
  const f = m.fighter ? w.fighters[m.fighter] : undefined;
  const fc = f ? w.career.fc[f.id] : undefined;
  if (!def || !f || !fc) return "";
  const c = ctxOf(w, f, fc);
  const text = withRng(w, (rng) => def.resolve(w, rng, c, opt, m.data ?? {}));
  if (def.pub && text) addMoment(w, f, "life", `${m.subject}: ${text}`);
  touch(w);
  return text;
}

/** For the checks: the ids of every event in the catalogue. */
export const LIFE_IDS = LIFE.map((d) => d.id);

/** For the checks: make one event for a fighter if it can happen now. */
export function forceLife(w: World, f: Fighter, id: string): Message | null {
  const def = BY_ID[id];
  const fc = w.career.fc[f.id];
  if (!def || !fc) return null;
  const c = ctxOf(w, f, fc);
  if (def.weight(w, c) <= 0) return null;
  const made = withRng(w, (rng) => def.make(w, rng, c));
  if (!made) return null;
  return notify(w, {
    kind: "life",
    fighter: f.id,
    from: made.from,
    subject: made.subject,
    body: made.body,
    facts: made.facts,
    needs: true,
    actions: made.options.map((o) => ({ id: `life:${o.id}`, label: o.label, primary: o.primary, danger: o.danger })),
    data: { ev: id, ...(made.data ?? {}) },
  });
}
