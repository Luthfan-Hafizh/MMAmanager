// The shapes of everything in a saved world.

import type { DivisionId, Sex } from "../data/divisions";
import type { PromoId } from "../data/promotions";
import type { AttrKey } from "./attributes";
import type { TechId } from "../data/techniques";
import type { BaseArt } from "../data/styles";
import type { FightPlan } from "../engine/plan";

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
}

export interface Injury {
  name: string;
  area: "head" | "body" | "arm" | "hand" | "leg" | "knee" | "shoulder" | "back";
  until: number;
  severity: number; // 1 minor - 3 major
  from: "fight" | "training";
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
  ended?: "lost" | "vacated" | "stripped" | "retired" | "moved" | "unified";
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
}

export type BoutKind = "title" | "interim" | "vacant" | "eliminator" | "regular" | "tryout" | "amateur";

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
  log?: FightLogLine[];
  bonus?: ("fotn" | "potn-a" | "potn-b")[];
  perf: [number, number];
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
  /** An offer to a player fighter that has not been answered yet. */
  pending?: string;
  /** Held for the player to watch or simulate on fight night. */
  awaiting?: boolean;
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
  kind: "offer" | "contract" | "info" | "result" | "injury" | "training" | "sponsor" | "news" | "camp" | "money" | "client" | "weighin" | "ranking";
  fighter?: string;
  ref?: string;
  read: boolean;
  needs?: boolean;
  actions?: MessageAction[];
  done?: string;
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
  patience: number;
  note?: string;
  renewal?: boolean;
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
  cat: "purse" | "bonus" | "sponsor" | "commission" | "camp" | "gym" | "living" | "tax" | "manager" | "fees" | "fine" | "other" | "salary" | "travel";
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
}

export interface FighterCareer {
  id: string;
  plan: TrainingPlan;
  camp: Camp | null;
  goals: string[];
  week?: { growth: Partial<Record<AttrKey, number>>; fatigue: number; injury?: string };
  progress: { day: number; ovr: number }[];
  dayJob: boolean;
  manager: { cut: number; quality: number; name: string } | null;
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
  achievements: { id: string; day: number; fighter: string }[];
  pendingUfcOffer?: string;
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
  awards: { year: number; fighter: string; ko?: string; sub?: string; fight?: string; upset?: string }[];
  hof: { fighter: string; year: number }[];
  /** Fighters whose state changed since the indexes were built. */
  stamp: number;
  /** Events not yet held, soonest first. */
  upcoming: string[];
}
