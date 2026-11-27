// The shapes of everything in a saved world.

import type { Build } from "../data/body";
import type { DivisionId, Sex } from "../data/divisions";
import type { PromoId } from "../data/promotions";
import type { AttrKey } from "./attributes";
import type { TechId } from "../data/techniques";
import type { BaseArt } from "../data/styles";
import type { FightPlan } from "../engine/plan";
import type { FighterStyle, StyleId } from "../data/fightstyles";

export type Stance = "orthodox" | "southpaw" | "switch";
export type Attrs = Record<AttrKey, number>;
export type Method = "KO" | "TKO" | "SUB" | "DEC" | "DRAW" | "NC" | "DQ";
export type AgingType = "early" | "normal" | "late";

export interface Hidden {
  /** The best overall rating this fighter can reach. */
  pot: number;
  peak: number; // age of the peak
  aging: AgingType;
  consistency: number; // 1-20
  injuryProne: number; // 1-20, high is bad
  bigFight: number; // 1-20, how they handle the big stage
}

export interface Personality {
  professionalism: number; // 1-20
  ambition: number;
  loyalty: number;
  temperament: number; // high = calm
  controversy: number; // trash talk
  greed: number;
}

export interface FightRecord {
  w: number;
  l: number;
  d: number;
  nc: number;
  koW: number;
  subW: number;
  decW: number;
  koL: number;
  subL: number;
  decL: number;
}

/** A fighter's results at a weight other than their own, at one promotion. */
export interface CrossWeight {
  promo: PromoId;
  div: DivisionId;
  /** Who was beaten there, the latest last. */
  beat: string[];
  lost: number;
  /** Day of the last fight there. */
  last: number;
  /** The place earned there, as a ranking score: just above the best fighter beaten, as they stood before the fight; a loss there takes some off. */
  score?: number;
}

export interface Contract {
  promo: PromoId;
  fights: number;
  left: number;
  show: number;
  win: number;
  /** Raise to show and win after each win. */
  escal: number;
  start: number;
  end: number;
  champClause: boolean;
  signBonus: number;
  /** Clauses won at the table: an immediate rematch if the belt is lost, points of the pay-per-view. */
  rematch?: boolean;
  ppv?: number;
}

export interface Injury {
  name: string;
  area: "head" | "body" | "arm" | "hand" | "leg" | "knee" | "shoulder" | "back";
  until: number;
  severity: number; // 1 minor - 3 major
  from: "fight" | "training";
  /** The injury in data/injuries.ts (older saves have none). */
  id?: string;
  start?: number;
  surgery?: boolean;
  /** Made worse by fighting on it. */
  aggravated?: boolean;
}

export interface Reign {
  fighter: string;
  promo: PromoId;
  div: DivisionId;
  won: number;
  lost?: number;
  defenses: number;
  interim?: boolean;
  how: string; // "won", "promoted", "vacant"
  ended?: "lost" | "vacated" | "stripped" | "retired" | "moved" | "unified" | "injury";
}

export interface CareerTotals {
  fights: number;
  secs: number; // fight time in seconds
  sigL: number;
  sigA: number;
  sigAbs: number; // landed on them
  sigAbsA: number; // thrown at them
  head: number;
  body: number;
  leg: number;
  dist: number;
  clinch: number;
  ground: number;
  kd: number;
  kdAbs: number;
  tdL: number;
  tdA: number;
  tdAbs: number;
  tdAbsA: number;
  subA: number;
  ctrl: number;
}

export interface OfficialStats {
  slpm: number;
  sapm: number;
  acc: number;
  def: number;
  td: number;
  tdDef: number;
  sub: number;
  kd: number;
  /** Shares of significant strikes landed, in percent. */
  head?: number;
  body?: number;
  leg?: number;
  stand?: number;
  clinch?: number;
  ground?: number;
  /** Wins by method in the UFC. */
}

export interface Fighter {
  id: string;
  first: string;
  surname: string;
  nick?: string;
  sex: Sex;
  country: string;
  hometown: string;
  birth: number;
  div: DivisionId;
  height: number;
  reach: number;
  stance: Stance;
  walk: number;
  /** Body composition, for a created fighter (data/body.ts). */
  build?: Build;
  attrs: Attrs;
  hid: Hidden;
  pers: Personality;
  base: BaseArt;
  tech: Partial<Record<TechId, number>>;
  rec: FightRecord;
  am: FightRecord;
  amateur: boolean;
  promo: PromoId | null;
  contract: Contract | null;
  gym: string;
  pop: number;
  elo: number;
  bouts: string[];
  lastFight: number | null;
  streak: number;
  injury: Injury | null;
  susp: number;
  /** Why the suspension, when it isn't a medical one ("a failed drug test"). */
  suspWhy?: string;
  booked: string | null;
  status: "active" | "retired";
  retired?: number;
  reigns: number; // count of title reigns at major/league level
  dmg: number; // career wear
  stats: CareerTotals;
  official?: OfficialStats;
  real?: boolean;
  fatigue: number;
  sharp: number;
  morale: number;
  ctrl?: boolean;
  /** Fights in the current promotion since joining (for releases). */
  joined: number;
  /** Day of the last ranking-relevant win, for title shots. */
  rival?: string;
  plan?: FightPlan;
  /** Free-text notes the world keeps (DWCS winner, cut by...). */
  tags?: string[];
  /** Highest overall ever reached. */
  best: number;
  peakRank?: number;
  legacy?: number;
  bestStreak?: number;
  /** Fights on a promotion's stage before the world began (real fighters). */
  prior?: { promo: PromoId; n: number };
  /** Fights at another weight: who was beaten there, for a place in that division's rankings too. */
  xw?: CrossWeight[];
  /** How they strike and grapple, and how well they know each style. */
  style?: FighterStyle;
}

export type BoutKind = "title" | "interim" | "vacant" | "eliminator" | "regular" | "tryout" | "amateur" | "bmf";

export interface RoundStat {
  sigL: number;
  sigA: number;
  totL: number;
  totA: number;
  head: number;
  body: number;
  leg: number;
  headA: number;
  bodyA: number;
  legA: number;
  dist: number;
  clinch: number;
  ground: number;
  kd: number;
  tdL: number;
  tdA: number;
  subA: number;
  rev: number;
  ctrl: number;
  /** Condition at the end of the round, 0..100: head, body, legs and gas tank. */
  hd?: number;
  bd?: number;
  lg?: number;
  st?: number;
  /** Where the fighter was guarding at the end of the round: head, body, legs in percent. */
  gd?: [number, number, number];
}

export interface BoutResult {
  winner: "a" | "b" | null;
  method: Method;
  detail: string;
  round: number;
  time: number;
  /** Judges' totals, [judge][a, b]. */
  cards?: [number, number][];
  /** Round by round, [round][judge] as "10-9". */
  rcards?: string[][];
  verdict?: "unanimous" | "split" | "majority" | "draw";
  /** Full statistics are kept for the player's fights only. */
  stats?: [RoundStat, RoundStat];
  rounds?: [RoundStat, RoundStat][];
  /** Round-by-round statistics in compact form (see world/report.ts). */
  rx?: number[][];
  log?: FightLogLine[];
  bonus?: ("fotn" | "potn-a" | "potn-b")[];
  perf: [number, number];
  /** What the fight did to each side's belts: "Won the title", "Defended the interim title"... */
  belt?: { a?: string; b?: string };
}

export interface FightLogLine {
  r: number;
  t: number;
  text: string;
  side?: 0 | 1;
  big?: boolean;
  kind?: string;
}

export interface Purse {
  show: number;
  win: number;
  bonus: number;
  finish: number;
  fine: number;
  total: number;
}

export interface Bout {
  id: string;
  ev: string;
  promo: PromoId;
  day: number;
  a: string;
  b: string;
  div: DivisionId;
  rounds: number;
  roundSec: number;
  kind: BoutKind;
  order: number;
  status: "booked" | "done" | "cancelled";
  catchweight?: number;
  shortNotice?: boolean;
  weighIn?: { a: number; b: number; missA?: boolean; missB?: boolean };
  res?: BoutResult;
  rankA?: number | null;
  rankB?: number | null;
  odds?: number;
  purses?: { a?: Purse; b?: Purse };
  why?: string;
  replaced?: string;
  /** What's at stake beyond the kind: the belts unified, an interim champion defending, the BMF holder defending. */
  stake?: "unify" | "interim-defence" | "bmf-defence";
  /** The fighter who stepped in on short notice, and how many days' notice they had. */
  sub?: string;
  notice?: number;
  /** The contracted weight when it isn't the division's limit (a catchweight, or a fighter moving up). */
  limit?: number;
  /** An offer to a player fighter that has not been answered yet. */
  pending?: string;
  /** Held for the player to watch or simulate on fight night. */
  awaiting?: boolean;
  /** What each fighter said on media day. */
  media?: { a?: string; b?: string };
  /** How each fighter played the face-off at the weigh-ins. */
  faceoff?: { a?: string; b?: string };
  /** Preparation gained or lost in front of the press (press conference, media day). */
  mprep?: { a?: number; b?: number };
  /** A weight-miss fine agreed above the usual share, per side that missed. */
  fineCut?: { a?: number; b?: number };
  /** The side that used the extra hour to make weight. */
  extraHour?: "a" | "b";
  /** Billed as a rematch, a trilogy or a grudge match (world/stories.ts). */
  story?: StoryKind;
}

export type EventKind = "numbered" | "fightnight" | "standard" | "tryout" | "amateur";

export interface MMAEvent {
  id: string;
  promo: PromoId;
  name: string;
  day: number;
  city: string;
  country: string;
  venue: string;
  kind: EventKind;
  number?: number;
  bouts: string[];
  status: "planned" | "booked" | "done";
}

export interface PromoState {
  id: PromoId;
  champs: Partial<Record<DivisionId, string | null>>;
  interim: Partial<Record<DivisionId, string | null>>;
  ranks: Partial<Record<DivisionId, string[]>>;
  prevRanks: Partial<Record<DivisionId, string[]>>;
  reigns: Reign[];
  counter: number;
  cityCount: Record<string, number>;
  nextEvent: number;
  /** Named number-one contender per division. */
  contender: Partial<Record<DivisionId, string | null>>;
  /** The UFC's BMF title (lightweight). */
  bmf?: BmfState;
  /** Pound for pound, for the PFL (the UFC's is World.p4p). */
  p4p?: string[];
}

export interface BmfReign {
  fighter?: string;
  name: string;
  won: number;
  lost?: number;
  defenses: number;
  ended?: "lost" | "retired" | "vacated" | "moved";
  /** Where it was won. */
  at?: string;
}

export interface BmfState {
  holder: string | null;
  reigns: BmfReign[];
  /** Day of the last BMF fight. */
  last?: number;
}

export interface Gym {
  id: string;
  name: string;
  country: string;
  city: string;
  rep: number;
  facilities: number;
  coaches: { head: number; striking: number; grappling: number; wrestling: number; sc: number };
  headCoach: string;
  fee: number;
  real?: boolean;
  /** A gym the player opened (career/business.ts): the owner's fighter id, and its size. */
  owner?: string;
  ownTier?: number;
}

export type NewsKind = "result" | "title" | "signing" | "release" | "retire" | "injury" | "ranking" | "upset" | "bonus" | "booking" | "other";

export interface News {
  id: string;
  day: number;
  kind: NewsKind;
  text: string;
  promo?: PromoId;
  fighters?: string[];
  ev?: string;
  big?: boolean;
}

export interface MessageAction {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

export interface Message {
  id: string;
  day: number;
  from: string;
  subject: string;
  body: string;
  kind: "offer" | "contract" | "info" | "result" | "injury" | "training" | "sponsor" | "news" | "camp" | "money" | "client" | "weighin" | "ranking" | "life" | "media";
  fighter?: string;
  ref?: string;
  read: boolean;
  needs?: boolean;
  actions?: MessageAction[];
  done?: string;
  /** The key facts, shown as a panel above the text. */
  facts?: Fact[];
  /** What a decision needs to remember (the event behind it, the people in it). */
  data?: Record<string, string | number>;
}

export interface Fact {
  k: string;
  v: string;
  tone?: "good" | "bad" | "warn";
}

export type ProposalStatus = "open" | "accepted" | "declined" | "expired" | "withdrawn";

export interface FightOffer {
  id: string;
  fighter: string;
  promo: PromoId;
  opp: string;
  ev: string;
  day: number;
  div: DivisionId;
  rounds: number;
  kind: BoutKind;
  show: number;
  win: number;
  shortNotice: boolean;
  catchweight?: number;
  made: number;
  expires: number;
  status: ProposalStatus;
  note?: string;
  replaceBout?: string;
  counter?: number;
  /** Days' notice when the call came. */
  notice?: number;
  /** The contracted weight, when it isn't the division's limit. */
  limit?: number;
  /** A bigger promotion's call: accepting signs the deal (its first fight is this one). */
  debut?: PromoId;
  /** The player's own fight with a new opponent: accept, or the fight is off. */
  stay?: boolean;
  /** Who pulled out. */
  replaced?: string;
  /** Turned down for the money once, and the purse went up. */
  raised?: boolean;
  /** A first fight here against a ranked opponent, and the record elsewhere that earned it. */
  rankedDebut?: string;
}

/** How a contract offer ended. */
export type BidEnd = "signed" | "rejected" | "expired" | "withdrawn";

/** What a promotion last put on the table for a fighter, so its next offer starts from there. */
export interface Bid {
  show: number;
  win: number;
  fights: number;
  limit: number;
  day: number;
  how: BidEnd;
  /** The record and the relationship at the time: what has changed since moves the next offer. */
  w: number;
  l: number;
  rap: number;
}

/** A deal signed now that starts when the current one is done (the UFC's approach). */
export interface SignedNext {
  promo: PromoId;
  fights: number;
  show: number;
  win: number;
  escal: number;
  signBonus: number;
  champClause: boolean;
  termDays: number;
  signed: number;
  rematch?: boolean;
  ppv?: number;
}

export interface ContractOffer {
  id: string;
  fighter: string;
  promo: PromoId;
  fights: number;
  show: number;
  win: number;
  escal: number;
  signBonus: number;
  champClause: boolean;
  termDays: number;
  made: number;
  expires: number;
  status: ProposalStatus;
  rounds: number;
  /** The promotion's own ceiling for this fighter (hidden from the player). */
  limit: number;
  /** Clauses agreed at the table. */
  rematch?: boolean;
  ppv?: number;
  patience: number;
  note?: string;
  renewal?: boolean;
  /** Made before the current deal is done: signed, it starts when that deal ends. */
  approach?: boolean;
  /** The current promotion's answer to a rival's offer: the rival it matches. */
  matches?: PromoId;
  /** This promotion's offer last time, when it comes back. */
  last?: { show: number; win: number; day: number; how: BidEnd };
}

export interface SponsorDeal {
  id: string;
  fighter: string;
  brand: string;
  perFight: number;
  monthly: number;
  until: number;
  need?: string;
}

export interface LedgerEntry {
  day: number;
  amount: number;
  what: string;
  cat: "purse" | "bonus" | "sponsor" | "commission" | "camp" | "gym" | "living" | "tax" | "manager" | "fees" | "fine" | "other" | "salary" | "travel" | "invest";
  fighter?: string;
}

export type SessionId =
  | "boxing"
  | "kickboxing"
  | "muaythai"
  | "wrestling"
  | "bjj"
  | "sparring"
  | "drilling"
  | "strength"
  | "conditioning"
  | "film"
  | "recovery"
  | "rest";

export interface TrainingPlan {
  week: SessionId[]; // ten slots, Monday to Friday, morning and evening
  intensity: 0 | 1 | 2; // light, normal, hard
  drill: TechId | null;
  template: string;
  /** A style the coaches are building, striking or grappling. */
  style?: StyleId | null;
}

export interface Camp {
  bout: string;
  start: number;
  weeks: number;
  sparring: 0 | 1 | 2; // partners: none, good, elite
  nutrition: 0 | 1 | 2; // none, nutritionist, full cut team
  cut: "early" | "standard" | "late";
  plan: FightPlan;
  study: number; // 0-1 how well the opponent has been studied
  cost: number;
  paid: boolean;
  /** Where the camp is: at home, at altitude, or at a top gym (guest) for its coaches. */
  site?: CampSite;
  guest?: string;
}

export type CampSite = "home" | "altitude" | "topgym";
/** A fighter's own staff (career/staff.ts): the coach's quality by role. */
export type TeamRole = "striking" | "wrestling" | "grappling" | "sc" | "nutrition";

export interface FighterCareer {
  id: string;
  plan: TrainingPlan;
  camp: Camp | null;
  goals: string[];
  week?: { growth: Partial<Record<AttrKey, number>>; fatigue: number; injury?: string };
  progress: { day: number; ovr: number }[];
  dayJob: boolean;
  manager: { cut: number; quality: number; name: string; person?: string; style?: "bold" | "careful" | "steady" } | null;
  mediaStyle: "humble" | "confident" | "trash";
  shortNotice: boolean;
  lastAsk?: number;
  /** Fight-night figures worked out from the camp and the weigh-in. */
  campCut?: number;
  campPrep?: number;
  weighed?: number;
  campBout?: string;
  asked?: boolean;
  morale?: number;
  /** A call-out the matchmaker knows about; ok when the other fighter said yes. */
  callout?: { target: string; until: number; ok?: boolean };
  walkTarget?: number;
  adapt?: number;
  /** Day of the last short-notice call, so the phone doesn't ring every week. */
  lastCall?: number;
  /** A champion out injured who kept the belt: an interim title is fought meanwhile. */
  hold?: { promo: PromoId; div: DivisionId; since: number };
  /** A champion who vacated through injury: a title shot when fit, until this day. */
  promise?: { promo: PromoId; div: DivisionId; until: number };
  /** Day a champion out injured was warned the belt may be taken. */
  stripWarned?: number;
  /** Advice taken and ignored, for the manager's mood. */
  trust?: number;
  /** Bad blood with other fighters, 0..100, and the moments that made it. */
  rivals?: Record<string, Rivalry>;
  /** Fights already talked about, so each gets one reaction. */
  talked?: string[];
  /** Day of the last call-out, so the timeline isn't all call-outs. */
  lastSocial?: number;
  /** What the fighter said and did in public, newest first. */
  moments?: Moment[];
  /** Unexpected events: the last one, and when each kind last happened. */
  life?: { last: number; seen: Record<string, number> };
  /** A call for the BMF title, alive until this day. */
  bmfCall?: number;
  /** Invited cageside at an event (where a face-off with the champion can happen). */
  cageside?: { ev: string; champ?: string };
  /** The working relationship with each promotion's matchmaker, 0..100 (50 when missing). */
  rapport?: Partial<Record<PromoId, number>>;
  /** What moved it, newest first. */
  rapportLog?: { day: number; promo: PromoId; d: number; why: string }[];
  /** Opponents turned down: off the table until the day given. */
  passed?: { opp: string; promo: PromoId; until: number }[];
  /** What the next offer should be after a no: a step up, or a more even fight. */
  want?: { promo: PromoId; kind: "up" | "even"; until: number };
  /** What each promotion last offered and how it ended: a promotion coming back starts from there. */
  bids?: Partial<Record<PromoId, Bid>>;
  /** The last deal, kept through free agency: what the market has been paying. */
  lastDeal?: { promo: PromoId; show: number; win: number; ended: number };
  /** A deal signed for when the current one is done. */
  next?: SignedNext;
  /** The Contender Series: this season's invitation, the answer, and the week. */
  tryout?: { season: number; day: number; yes?: boolean; ev?: string; done?: boolean };
  /** Took a supplement nobody checked: a drug test until this day may come back positive. */
  tainted?: number;
  /** The fighter's own coaches and nutritionist: quality by role. */
  team?: Partial<Record<TeamRole, number>>;
}

export interface Rivalry {
  heat: number;
  since: number;
  last: number;
  notes: { day: number; text: string }[];
}

export interface Moment {
  day: number;
  kind: "callout" | "talk" | "press" | "faceoff" | "life" | "reply";
  text: string;
  with?: string;
}

export type MediaKind = "presser" | "mediaday" | "postfight";
export type AnswerTone = "respect" | "confident" | "trash" | "funny" | "deflect";

export interface MediaQuestion {
  who: string;
  outlet: string;
  q: string;
  answers: { tone: AnswerTone; text: string; callout?: string }[];
  picked?: number;
  /** The room's reaction, or the opponent's comeback, once answered. */
  reply?: string;
}

export interface MediaSession {
  id: string;
  kind: MediaKind;
  fighter: string;
  bout: string;
  opp: string;
  day: number;
  questions: MediaQuestion[];
  /** What the opponent says in the session. */
  oppLines: string[];
  done: boolean;
  skipped?: boolean;
  /** The running effect of the answers. */
  pop: number;
  heat: number;
  prep: number;
  fine: number;
  scuffle?: boolean;
  /** The inbox message that asked for it. */
  msg?: string;
  summary?: string;
}

export interface Agency {
  name: string;
  rep: number;
  cut: number;
  staff: number;
  scouting: string[];
}

export interface Career {
  mode: "fighter" | "manager";
  name: string;
  fighters: string[];
  money: number;
  ledger: LedgerEntry[];
  monthly: { m: string; inc: number; out: number; bal: number }[];
  agency?: Agency;
  fc: Record<string, FighterCareer>;
  fightOffers: FightOffer[];
  contractOffers: ContractOffer[];
  sponsors: SponsorDeal[];
  living: number;
  pitches: { fighter: string; day: number; ok: boolean }[];
  retiredAt?: number;
  /** The game day the career was last exported to a file. */
  lastExport?: number;
  /** Money in the markets (career/business.ts): the balance, what went in, last month's move. */
  invest?: { balance: number; paidIn: number; last: number };
  achievements: { id: string; day: number; fighter: string }[];
  pendingUfcOffer?: string;
  retiredFighter?: string;
  /** Press conferences, media days and post-fight pressers, the latest last. */
  media?: MediaSession[];
}

/** A storyline between two of the world's fighters (world/stories.ts). */
export type StoryKind = "rematch" | "trilogy" | "grudge";
export interface Story {
  a: string;
  b: string;
  kind: StoryKind;
  promo: PromoId;
  why: string;
  since: number;
  /** The bout that settles it, once booked. */
  booked?: string;
  done?: boolean;
}

/** A year-end award (world/awards.ts). */
export type AwardKind = "fighter" | "fight" | "ko" | "sub" | "upset" | "newcomer";
export interface Award {
  year: number;
  promo: PromoId;
  kind: AwardKind;
  fighters: string[];
  bout?: string;
  why: string;
}

export interface World {
  v: number;
  id: string;
  name: string;
  created: number;
  seed: number;
  rng: number;
  day: number;
  start: number;
  fighters: Record<string, Fighter>;
  bouts: Record<string, Bout>;
  events: Record<string, MMAEvent>;
  promos: Record<string, PromoState>;
  gyms: Record<string, Gym>;
  news: News[];
  inbox: Message[];
  career: Career;
  ids: Record<string, number>;
  p4p: string[];
  hof: { fighter: string; year: number }[];
  /** Year-end awards, every January for the year gone (world/awards.ts). */
  awards: Award[];
  /** Open and recent storylines between the world's fighters. */
  stories?: Story[];
  /** Fighters whose state changed since the indexes were built. */
  stamp: number;
  /** Bumped when rosters change (touchRoster): the roster index follows it. */
  rstamp?: number;
  /** Events not yet held, soonest first. */
  upcoming: string[];
}
