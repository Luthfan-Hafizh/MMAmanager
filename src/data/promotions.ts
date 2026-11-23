// The promotions of the world: the UFC at the top, the PFL beside it, the
// Contender Series as the tryout, then a regional and a local show and an
// amateur circuit in each of the eight regions. Card numbers and cities are
// approximate, for flavour.

import type { RegionId } from "./countries";
import type { DivisionId } from "./divisions";

export type Tier = "amateur" | "local" | "regional" | "tryout" | "league" | "major";

export type PromoId =
  | "ufc"
  | "pfl"
  | "dwcs"
  | "lfa"
  | "jungle"
  | "cw"
  | "ksw"
  | "pancrase"
  | "efc"
  | "brave"
  | "eternal"
  | "cffc"
  | "shooto-br"
  | "hexagone"
  | "fen"
  | "shooto"
  | "ares"
  | "uaew"
  | "hex"
  | "am-na"
  | "am-sa"
  | "am-we"
  | "am-ee"
  | "am-ea"
  | "am-af"
  | "am-wa"
  | "am-oc";

export interface PromoDef {
  id: PromoId;
  name: string;
  short: string;
  tier: Tier;
  region: RegionId | "global";
  prestige: number;
  eventsPerYear: number;
  cardSize: number;
  /** How far ahead a card is booked, in days. */
  lead: number;
  /** Rest a fighter usually gets between fights here, in days. */
  gap: number;
  divisions: DivisionId[];
  rosterPerDiv: number;
  rankSize: number;
  roundSec: number;
  /** Show money for a newcomer and for a top name, in dollars. Win money matches show unless noted. */
  showLow: number;
  showHigh: number;
  firstNumber?: number;
  naming: "ufc" | "numbered" | "city" | "series" | "amateur";
  cities: string[];
  day: number; // weekday of events: 1 Tuesday, 5 Saturday
  /** Fighter levels that this promotion signs from. */
  color: string;
}

const MEN: DivisionId[] = ["FLY", "BW", "FW", "LW", "WW", "MW", "LHW", "HW"];
const ALL: DivisionId[] = [...MEN, "WSW", "WFLY", "WBW"];
const BIG: DivisionId[] = [...MEN, "WSW", "WFLY", "WBW"];
const MID: DivisionId[] = [...MEN, "WSW", "WFLY"];

const D = (p: PromoDef) => p;

export const PROMOTIONS: Record<PromoId, PromoDef> = {
  ufc: D({
    id: "ufc", name: "Ultimate Fighting Championship", short: "UFC", tier: "major", region: "global", prestige: 100,
    eventsPerYear: 43, cardSize: 13, lead: 63, gap: 120, divisions: ALL, rosterPerDiv: 0, rankSize: 15, roundSec: 300,
    showLow: 12000, showHigh: 750000, firstNumber: 335, naming: "ufc",
    cities: ["Las Vegas, US", "Las Vegas, US", "Las Vegas, US", "Las Vegas, US", "Abu Dhabi, AE", "London, GB-ENG", "Paris, FR", "Perth, AU", "Sydney, AU", "Rio de Janeiro, BR", "São Paulo, BR", "Mexico City, MX", "Toronto, CA", "Edmonton, CA", "Nashville, US", "Newark, US", "New York, US", "Miami, US", "Houston, US", "Salt Lake City, US", "Denver, US", "Baku, AZ", "Shanghai, CN", "Macau, CN", "Kansas City, US", "Atlanta, US", "Boston, US", "Philadelphia, US", "Riyadh, SA", "Doha, QA"],
    day: 5, color: "#d7263d",
  }),
  pfl: D({
    id: "pfl", name: "Professional Fighters League", short: "PFL", tier: "league", region: "global", prestige: 72,
    eventsPerYear: 24, cardSize: 11, lead: 56, gap: 98, divisions: ["FLY", "BW", "FW", "LW", "WW", "MW", "LHW", "HW", "WFLY", "WBW"], rosterPerDiv: 26, rankSize: 10, roundSec: 300,
    showLow: 10000, showHigh: 400000, naming: "city",
    cities: ["Dubai, AE", "Riyadh, SA", "Madrid, ES", "Paris, FR", "Lyon, FR", "Brussels, BE", "Belfast, GB-NIR", "Chicago, US", "Nashville, US", "Sioux Falls, US", "Orlando, US", "Atlanta, US", "Cape Town, ZA", "Lagos, NG", "Johannesburg, ZA", "Abu Dhabi, AE", "Pittsburgh, US", "Charlotte, US", "Dublin, IE", "Milan, IT"],
    day: 5, color: "#c8a24a",
  }),
  dwcs: D({
    id: "dwcs", name: "Dana White's Contender Series", short: "DWCS", tier: "tryout", region: "global", prestige: 60,
    eventsPerYear: 10, cardSize: 5, lead: 42, gap: 0, divisions: ALL, rosterPerDiv: 0, rankSize: 0, roundSec: 300,
    showLow: 5000, showHigh: 5000, firstNumber: 11, naming: "series", cities: ["Las Vegas, US"], day: 1, color: "#7a8597",
  }),
  // Regional
  lfa: D({ id: "lfa", name: "Legacy Fighting Alliance", short: "LFA", tier: "regional", region: "na", prestige: 46, eventsPerYear: 22, cardSize: 10, lead: 49, gap: 84, divisions: BIG, rosterPerDiv: 13, rankSize: 10, roundSec: 300, showLow: 2000, showHigh: 12000, firstNumber: 246, naming: "numbered", cities: ["Sioux Falls, US", "Minneapolis, US", "Phoenix, US", "Houston, US", "Shawnee, US", "Commerce, US", "Charlotte, US", "Denver, US", "Prior Lake, US", "Belo Horizonte, BR"], day: 4, color: "#3b82f6" }),
  jungle: D({ id: "jungle", name: "Jungle Fight", short: "Jungle Fight", tier: "regional", region: "sa", prestige: 36, eventsPerYear: 10, cardSize: 10, lead: 49, gap: 84, divisions: BIG, rosterPerDiv: 13, rankSize: 10, roundSec: 300, showLow: 1500, showHigh: 8000, firstNumber: 136, naming: "numbered", cities: ["São Paulo, BR", "Rio de Janeiro, BR", "Curitiba, BR", "Belém, BR", "Manaus, BR", "Lima, PE", "Buenos Aires, AR"], day: 5, color: "#22c55e" }),
  cw: D({ id: "cw", name: "Cage Warriors", short: "Cage Warriors", tier: "regional", region: "we", prestige: 46, eventsPerYear: 18, cardSize: 10, lead: 49, gap: 84, divisions: BIG, rosterPerDiv: 13, rankSize: 10, roundSec: 300, showLow: 2000, showHigh: 12000, firstNumber: 201, naming: "numbered", cities: ["London, GB-ENG", "Manchester, GB-ENG", "Glasgow, GB-SCT", "Dublin, IE", "Belfast, GB-NIR", "Newport, GB-WLS", "Rome, IT", "Copenhagen, DK", "Paris, FR", "Liverpool, GB-ENG"], day: 5, color: "#ef4444" }),
  ksw: D({ id: "ksw", name: "KSW", short: "KSW", tier: "regional", region: "ee", prestige: 50, eventsPerYear: 11, cardSize: 10, lead: 49, gap: 98, divisions: MID, rosterPerDiv: 13, rankSize: 10, roundSec: 300, showLow: 3000, showHigh: 40000, firstNumber: 116, naming: "numbered", cities: ["Warsaw, PL", "Gdańsk, PL", "Łódź, PL", "Kraków, PL", "Gliwice, PL", "Szczecin, PL", "Liberec, CZ", "Paris, FR", "Zagreb, HR"], day: 5, color: "#eab308" }),
  pancrase: D({ id: "pancrase", name: "Pancrase", short: "Pancrase", tier: "regional", region: "ea", prestige: 36, eventsPerYear: 10, cardSize: 10, lead: 49, gap: 84, divisions: MID, rosterPerDiv: 13, rankSize: 10, roundSec: 300, showLow: 1500, showHigh: 9000, firstNumber: 361, naming: "numbered", cities: ["Tokyo, JP", "Tokyo, JP", "Osaka, JP", "Yokohama, JP", "Seoul, KR", "Shanghai, CN", "Manila, PH", "Ulaanbaatar, MN"], day: 6, color: "#a855f7" }),
  efc: D({ id: "efc", name: "Extreme Fighting Championship", short: "EFC", tier: "regional", region: "af", prestige: 32, eventsPerYear: 8, cardSize: 10, lead: 49, gap: 91, divisions: MID, rosterPerDiv: 11, rankSize: 10, roundSec: 300, showLow: 1200, showHigh: 7000, firstNumber: 128, naming: "numbered", cities: ["Johannesburg, ZA", "Cape Town, ZA", "Durban, ZA", "Pretoria, ZA", "Lagos, NG", "Kinshasa, CD"], day: 5, color: "#f97316" }),
  brave: D({ id: "brave", name: "Brave Combat Federation", short: "Brave CF", tier: "regional", region: "wa", prestige: 40, eventsPerYear: 10, cardSize: 10, lead: 49, gap: 91, divisions: MID, rosterPerDiv: 11, rankSize: 10, roundSec: 300, showLow: 2000, showHigh: 15000, firstNumber: 101, naming: "numbered", cities: ["Manama, BH", "Isa Town, BH", "Riyadh, SA", "Abu Dhabi, AE", "Amman, JO", "Istanbul, TR", "Mumbai, IN", "Almaty, KZ"], day: 5, color: "#14b8a6" }),
  eternal: D({ id: "eternal", name: "Eternal MMA", short: "Eternal MMA", tier: "regional", region: "oc", prestige: 32, eventsPerYear: 10, cardSize: 10, lead: 49, gap: 84, divisions: MID, rosterPerDiv: 11, rankSize: 10, roundSec: 300, showLow: 1200, showHigh: 7000, firstNumber: 96, naming: "numbered", cities: ["Gold Coast, AU", "Brisbane, AU", "Sydney, AU", "Perth, AU", "Melbourne, AU", "Auckland, NZ", "Adelaide, AU"], day: 5, color: "#06b6d4" }),
  // Local
  cffc: D({ id: "cffc", name: "Cage Fury FC", short: "CFFC", tier: "local", region: "na", prestige: 20, eventsPerYear: 12, cardSize: 9, lead: 35, gap: 63, divisions: MID, rosterPerDiv: 13, rankSize: 0, roundSec: 300, showLow: 600, showHigh: 4000, firstNumber: 146, naming: "numbered", cities: ["Philadelphia, US", "Atlantic City, US", "Newark, US", "Lancaster, US", "Hollywood, US", "Bensalem, US"], day: 5, color: "#64748b" }),
  "shooto-br": D({ id: "shooto-br", name: "Shooto Brasil", short: "Shooto Brasil", tier: "local", region: "sa", prestige: 16, eventsPerYear: 10, cardSize: 9, lead: 35, gap: 63, divisions: MID, rosterPerDiv: 13, rankSize: 0, roundSec: 300, showLow: 400, showHigh: 2500, firstNumber: 131, naming: "numbered", cities: ["Rio de Janeiro, BR", "Niterói, BR", "São Paulo, BR", "Brasília, BR", "Fortaleza, BR"], day: 5, color: "#64748b" }),
  hexagone: D({ id: "hexagone", name: "Hexagone MMA", short: "Hexagone", tier: "local", region: "we", prestige: 18, eventsPerYear: 9, cardSize: 9, lead: 35, gap: 63, divisions: MID, rosterPerDiv: 13, rankSize: 0, roundSec: 300, showLow: 600, showHigh: 3500, firstNumber: 26, naming: "numbered", cities: ["Paris, FR", "Lyon, FR", "Marseille, FR", "Nice, FR", "Lille, FR", "Brussels, BE", "Geneva, CH"], day: 5, color: "#64748b" }),
  fen: D({ id: "fen", name: "Fight Exclusive Night", short: "FEN", tier: "local", region: "ee", prestige: 18, eventsPerYear: 10, cardSize: 9, lead: 35, gap: 63, divisions: MID, rosterPerDiv: 13, rankSize: 0, roundSec: 300, showLow: 600, showHigh: 4000, firstNumber: 61, naming: "numbered", cities: ["Wrocław, PL", "Lubin, PL", "Ostróda, PL", "Szczecin, PL", "Warsaw, PL", "Poznań, PL"], day: 5, color: "#64748b" }),
  shooto: D({ id: "shooto", name: "Professional Shooto", short: "Shooto", tier: "local", region: "ea", prestige: 16, eventsPerYear: 12, cardSize: 9, lead: 35, gap: 63, divisions: MID, rosterPerDiv: 13, rankSize: 0, roundSec: 300, showLow: 400, showHigh: 2500, firstNumber: 1, naming: "numbered", cities: ["Tokyo, JP", "Osaka, JP", "Nagoya, JP", "Sendai, JP", "Okinawa, JP"], day: 6, color: "#64748b" }),
  ares: D({ id: "ares", name: "Ares Fighting Championship", short: "Ares FC", tier: "local", region: "af", prestige: 16, eventsPerYear: 8, cardSize: 9, lead: 35, gap: 70, divisions: MID, rosterPerDiv: 11, rankSize: 0, roundSec: 300, showLow: 500, showHigh: 3000, firstNumber: 41, naming: "numbered", cities: ["Dakar, SN", "Abidjan, CI", "Casablanca, MA", "Douala, CM", "Lagos, NG"], day: 5, color: "#64748b" }),
  uaew: D({ id: "uaew", name: "UAE Warriors", short: "UAE Warriors", tier: "local", region: "wa", prestige: 18, eventsPerYear: 9, cardSize: 9, lead: 35, gap: 70, divisions: MID, rosterPerDiv: 11, rankSize: 0, roundSec: 300, showLow: 600, showHigh: 4000, firstNumber: 66, naming: "numbered", cities: ["Abu Dhabi, AE", "Abu Dhabi, AE", "Dubai, AE", "Al Ain, AE"], day: 5, color: "#64748b" }),
  hex: D({ id: "hex", name: "Hex Fight Series", short: "Hex FS", tier: "local", region: "oc", prestige: 14, eventsPerYear: 9, cardSize: 9, lead: 35, gap: 70, divisions: MID, rosterPerDiv: 11, rankSize: 0, roundSec: 300, showLow: 400, showHigh: 2500, firstNumber: 36, naming: "numbered", cities: ["Melbourne, AU", "Melbourne, AU", "Sydney, AU", "Auckland, NZ", "Adelaide, AU"], day: 5, color: "#64748b" }),
  // Amateur circuits
  "am-na": D({ id: "am-na", name: "IMMAF North America", short: "IMMAF NA", tier: "amateur", region: "na", prestige: 6, eventsPerYear: 8, cardSize: 10, lead: 28, gap: 49, divisions: MID, rosterPerDiv: 10, rankSize: 0, roundSec: 180, showLow: 0, showHigh: 0, naming: "amateur", cities: ["Las Vegas, US", "Denver, US", "Toronto, CA", "Monterrey, MX", "Orlando, US"], day: 6, color: "#475569" }),
  "am-sa": D({ id: "am-sa", name: "IMMAF South America", short: "IMMAF SA", tier: "amateur", region: "sa", prestige: 6, eventsPerYear: 8, cardSize: 10, lead: 28, gap: 49, divisions: MID, rosterPerDiv: 10, rankSize: 0, roundSec: 180, showLow: 0, showHigh: 0, naming: "amateur", cities: ["São Paulo, BR", "Rio de Janeiro, BR", "Lima, PE", "Santiago, CL", "Bogotá, CO"], day: 6, color: "#475569" }),
  "am-we": D({ id: "am-we", name: "IMMAF Western Europe", short: "IMMAF WE", tier: "amateur", region: "we", prestige: 6, eventsPerYear: 8, cardSize: 10, lead: 28, gap: 49, divisions: MID, rosterPerDiv: 10, rankSize: 0, roundSec: 180, showLow: 0, showHigh: 0, naming: "amateur", cities: ["Birmingham, GB-ENG", "Dublin, IE", "Paris, FR", "Stockholm, SE", "Amsterdam, NL"], day: 6, color: "#475569" }),
  "am-ee": D({ id: "am-ee", name: "IMMAF Eastern Europe", short: "IMMAF EE", tier: "amateur", region: "ee", prestige: 6, eventsPerYear: 8, cardSize: 10, lead: 28, gap: 49, divisions: MID, rosterPerDiv: 10, rankSize: 0, roundSec: 180, showLow: 0, showHigh: 0, naming: "amateur", cities: ["Prague, CZ", "Warsaw, PL", "Tbilisi, GE", "Almaty, KZ", "Belgrade, RS"], day: 6, color: "#475569" }),
  "am-ea": D({ id: "am-ea", name: "IMMAF Asia", short: "IMMAF Asia", tier: "amateur", region: "ea", prestige: 6, eventsPerYear: 8, cardSize: 10, lead: 28, gap: 49, divisions: MID, rosterPerDiv: 10, rankSize: 0, roundSec: 180, showLow: 0, showHigh: 0, naming: "amateur", cities: ["Tokyo, JP", "Seoul, KR", "Ulaanbaatar, MN", "Manila, PH", "Bangkok, TH"], day: 6, color: "#475569" }),
  "am-af": D({ id: "am-af", name: "IMMAF Africa", short: "IMMAF Africa", tier: "amateur", region: "af", prestige: 6, eventsPerYear: 7, cardSize: 10, lead: 28, gap: 56, divisions: MID, rosterPerDiv: 9, rankSize: 0, roundSec: 180, showLow: 0, showHigh: 0, naming: "amateur", cities: ["Johannesburg, ZA", "Lagos, NG", "Casablanca, MA", "Dakar, SN"], day: 6, color: "#475569" }),
  "am-wa": D({ id: "am-wa", name: "IMMAF Middle East", short: "IMMAF ME", tier: "amateur", region: "wa", prestige: 6, eventsPerYear: 7, cardSize: 10, lead: 28, gap: 56, divisions: MID, rosterPerDiv: 9, rankSize: 0, roundSec: 180, showLow: 0, showHigh: 0, naming: "amateur", cities: ["Abu Dhabi, AE", "Amman, JO", "Manama, BH", "Istanbul, TR"], day: 6, color: "#475569" }),
  "am-oc": D({ id: "am-oc", name: "IMMAF Oceania", short: "IMMAF Oceania", tier: "amateur", region: "oc", prestige: 6, eventsPerYear: 7, cardSize: 10, lead: 28, gap: 56, divisions: MID, rosterPerDiv: 9, rankSize: 0, roundSec: 180, showLow: 0, showHigh: 0, naming: "amateur", cities: ["Gold Coast, AU", "Auckland, NZ", "Sydney, AU"], day: 6, color: "#475569" }),
};

export const PROMO_IDS = Object.keys(PROMOTIONS) as PromoId[];

export const TIER_RANK: Record<Tier, number> = { amateur: 0, local: 1, regional: 2, tryout: 3, league: 4, major: 5 };

export const TIER_NAME: Record<Tier, string> = {
  amateur: "Amateur",
  local: "Local",
  regional: "Regional",
  tryout: "Tryout",
  league: "World league",
  major: "Major",
};

export function promo(id: PromoId): PromoDef {
  return PROMOTIONS[id];
}

export function promosOfTier(tier: Tier): PromoDef[] {
  return PROMO_IDS.map((id) => PROMOTIONS[id]).filter((p) => p.tier === tier);
}

export function promoFor(region: RegionId, tier: Tier): PromoDef | undefined {
  return PROMO_IDS.map((id) => PROMOTIONS[id]).find((p) => p.tier === tier && p.region === region);
}

/** Title fights are five rounds in professional MMA; amateur and tryout bouts are three. */
export function roundsFor(p: PromoDef, title: boolean, main: boolean): number {
  if (p.tier === "amateur" || p.tier === "tryout") return 3;
  if (title) return 5;
  if (main && (p.tier === "major" || p.tier === "league")) return 5;
  return 3;
}

/** UFC numbered-event venues (and a few for the rest), by city. */
export const VENUES: Record<string, string[]> = {
  "Las Vegas": ["T-Mobile Arena", "Meta APEX"],
  "New York": ["Madison Square Garden"],
  "Newark": ["Prudential Center"],
  "Abu Dhabi": ["Etihad Arena"],
  London: ["The O2"],
  Paris: ["Accor Arena"],
  Perth: ["RAC Arena"],
  Sydney: ["Qudos Bank Arena"],
  "Rio de Janeiro": ["Farmasi Arena"],
  "São Paulo": ["Ibirapuera Gymnasium"],
  "Mexico City": ["Arena CDMX"],
  Toronto: ["Scotiabank Arena"],
  Edmonton: ["Rogers Place"],
  Nashville: ["Bridgestone Arena"],
  Miami: ["Kaseya Center"],
  Houston: ["Toyota Center"],
  "Salt Lake City": ["Delta Center"],
  Denver: ["Ball Arena"],
  Baku: ["Baku Crystal Hall"],
  Shanghai: ["Shanghai Indoor Stadium"],
  Macau: ["Galaxy Arena"],
  "Kansas City": ["T-Mobile Center"],
  Atlanta: ["State Farm Arena"],
  Boston: ["TD Garden"],
  Philadelphia: ["Wells Fargo Center"],
  Riyadh: ["Kingdom Arena"],
  Doha: ["Lusail Sports Arena"],
  Dubai: ["Coca-Cola Arena"],
  Madrid: ["Movistar Arena"],
  Warsaw: ["PGE Narodowy"],
  Gdańsk: ["Ergo Arena"],
  Tokyo: ["Korakuen Hall", "Tachikawa Stage Garden"],
  Manama: ["Khalifa Sports City"],
};
