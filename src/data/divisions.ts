// The eleven weight classes the UFC runs. Heights and reaches are the averages of
// the real October 2026 UFC roster; finish rates are the UFC's own by division.

export type DivisionId = "FLY" | "BW" | "FW" | "LW" | "WW" | "MW" | "LHW" | "HW" | "WSW" | "WFLY" | "WBW";
export type Sex = "M" | "F";

export interface DivisionDef {
  id: DivisionId;
  name: string;
  short: string;
  limit: number; // lb
  sex: Sex;
  height: number; // inches, roster average
  reach: number;
  /** Share of UFC fights ending by KO/TKO and by submission (targets for the engine). */
  ko: number;
  sub: number;
  /** Engine knockout scale: heavier hands, more knockouts. */
  punch: number;
  /** Real UFC roster size, used as the promotion's target. */
  ufc: number;
  order: number;
}

export const DIVISIONS: Record<DivisionId, DivisionDef> = {
  FLY: { id: "FLY", name: "Flyweight", short: "FLY", limit: 125, sex: "M", height: 66, reach: 67.4, ko: 0.22, sub: 0.21, punch: 0.79, ufc: 46, order: 0 },
  BW: { id: "BW", name: "Bantamweight", short: "BW", limit: 135, sex: "M", height: 67.6, reach: 69.2, ko: 0.26, sub: 0.19, punch: 0.86, ufc: 80, order: 1 },
  FW: { id: "FW", name: "Featherweight", short: "FW", limit: 145, sex: "M", height: 68.6, reach: 70.6, ko: 0.29, sub: 0.19, punch: 0.9, ufc: 90, order: 2 },
  LW: { id: "LW", name: "Lightweight", short: "LW", limit: 155, sex: "M", height: 69.8, reach: 71.6, ko: 0.31, sub: 0.21, punch: 0.94, ufc: 95, order: 3 },
  WW: { id: "WW", name: "Welterweight", short: "WW", limit: 170, sex: "M", height: 72, reach: 74.2, ko: 0.35, sub: 0.19, punch: 0.97, ufc: 80, order: 4 },
  MW: { id: "MW", name: "Middleweight", short: "MW", limit: 185, sex: "M", height: 73.2, reach: 75.7, ko: 0.4, sub: 0.19, punch: 1.02, ufc: 72, order: 5 },
  LHW: { id: "LHW", name: "Light Heavyweight", short: "LHW", limit: 205, sex: "M", height: 74.5, reach: 76.7, ko: 0.44, sub: 0.17, punch: 1.07, ufc: 48, order: 6 },
  HW: { id: "HW", name: "Heavyweight", short: "HW", limit: 265, sex: "M", height: 75.3, reach: 77.8, ko: 0.48, sub: 0.17, punch: 1.11, ufc: 50, order: 7 },
  WSW: { id: "WSW", name: "Women's Strawweight", short: "WSW", limit: 115, sex: "F", height: 63.4, reach: 63.5, ko: 0.13, sub: 0.19, punch: 0.6, ufc: 47, order: 8 },
  WFLY: { id: "WFLY", name: "Women's Flyweight", short: "WFLY", limit: 125, sex: "F", height: 65.9, reach: 66.8, ko: 0.14, sub: 0.17, punch: 0.65, ufc: 34, order: 9 },
  WBW: { id: "WBW", name: "Women's Bantamweight", short: "WBW", limit: 135, sex: "F", height: 67.1, reach: 68, ko: 0.2, sub: 0.19, punch: 0.71, ufc: 26, order: 10 },
};

export const DIVISION_IDS = Object.keys(DIVISIONS) as DivisionId[];
export const MEN_DIVISIONS = DIVISION_IDS.filter((d) => DIVISIONS[d].sex === "M");
export const WOMEN_DIVISIONS = DIVISION_IDS.filter((d) => DIVISIONS[d].sex === "F");

/** Divisions of the same sex, lightest first. */
export function ladderOf(d: DivisionId): DivisionId[] {
  const sex = DIVISIONS[d].sex;
  return DIVISION_IDS.filter((x) => DIVISIONS[x].sex === sex).sort((a, b) => DIVISIONS[a].order - DIVISIONS[b].order);
}

export function neighbourDivisions(d: DivisionId): { down?: DivisionId; up?: DivisionId } {
  const l = ladderOf(d);
  const i = l.indexOf(d);
  return { down: l[i - 1], up: l[i + 1] };
}

/** Typical walking weight: about 10-14% over the limit for the men, less at heavyweight. */
export function typicalWalk(d: DivisionId): number {
  const def = DIVISIONS[d];
  if (d === "HW") return 248;
  const pct = def.sex === "F" ? 0.11 : 0.125;
  return Math.round(def.limit * (1 + pct));
}

/** Names used by the source data files. */
export const SOURCE_DIVISIONS: Record<string, DivisionId> = {
  flyweight: "FLY",
  bantamweight: "BW",
  featherweight: "FW",
  lightweight: "LW",
  welterweight: "WW",
  middleweight: "MW",
  "light-heavyweight": "LHW",
  heavyweight: "HW",
  "womens-strawweight": "WSW",
  "womens-flyweight": "WFLY",
  "womens-bantamweight": "WBW",
  "womens-featherweight": "WBW",
};
