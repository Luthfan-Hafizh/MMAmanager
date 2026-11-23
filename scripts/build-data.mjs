// Build the compact real-world roster the game loads, from the snapshot in
// data-src/ (the UFC's official roster, rankings and statistics of 1 October
// 2026 and the PFL's roster of 15 November 2026).
//   npm run data
import { readFileSync, writeFileSync } from "node:fs";

const src = JSON.parse(readFileSync("data-src/roster-2026-10.json", "utf8"));
const DIV = {
  flyweight: "FLY", bantamweight: "BW", featherweight: "FW", lightweight: "LW", welterweight: "WW", middleweight: "MW",
  "light-heavyweight": "LHW", heavyweight: "HW", "womens-strawweight": "WSW", "womens-flyweight": "WFLY",
  "womens-bantamweight": "WBW", "womens-featherweight": "WBW",
};
const round = (v, d = 2) => (typeof v === "number" ? Math.round(v * 10 ** d) / 10 ** d : null);
const T_KEYS = ["pressure", "counter", "range", "pocket", "kicking", "clinch", "takedownEntry", "topControl", "submissionHunt", "scramble", "pace", "starterSpeed", "riskTolerance", "finishSeeking", "chinTucking", "legKickDefense"];
const P_KEYS = ["discipline", "temper", "ego", "charisma", "legacy", "money", "loyalty"];

const replaced = new Set(Object.keys(src.pfl.replaces ?? {}));

function compact(f, promo) {
  const st = f.stats;
  const m = f.methods ?? {};
  return {
    id: f.id,
    n: f.name,
    k: f.nickname || undefined,
    c: f.countryCode || "US",
    cn: f.country,
    h: f.hometown || undefined,
    a: f.age,
    ht: f.heightIn,
    rc: f.reachIn || f.heightIn,
    b: f.build,
    d: DIV[f.divisionId],
    p: promo,
    lg: f.league,
    r: [f.record.w, f.record.l, f.record.d ?? 0],
    m: [m.koWins ?? 0, m.subWins ?? 0, m.decWins ?? 0, m.koLosses ?? 0, m.subLosses ?? 0, m.decLosses ?? 0],
    ws: f.winStreak ?? 0,
    ls: f.lossStreak ?? 0,
    bs: f.bestStreak ?? 0,
    // The record on this stage: the UFC's for UFC fighters, the league's for the PFL's.
    pr: (() => {
      const r = promo === "ufc" ? f.majorRecord : f.leagueRecord;
      return r ? [r.w ?? 0, r.l ?? 0, r.d ?? 0] : undefined;
    })(),
    rt: [f.ratings.striking, f.ratings.grappling, f.ratings.wrestling, f.ratings.submissions, f.ratings.cardio, f.ratings.durability],
    t: T_KEYS.map((k) => round(f.tendencies?.[k] ?? 0.5)),
    ps: P_KEYS.map((k) => f.personality?.[k] ?? 50),
    dv: [f.development?.peakAge ?? 29, round(f.development?.growth ?? 1), round(f.development?.decline ?? 1)],
    pot: f.potential ?? null,
    pop: f.popularity ?? 20,
    g: f.gymId || undefined,
    td: f.titleDefenses ?? 0,
    tr: f.titleReigns ?? 0,
    s: st
      ? [round(st.slpm), round(st.sapm), round(st.acc, 0), round(st.def, 0), round(st.td), round(st.tdDef, 0), round(st.sub), round(st.kd),
         st.target?.head ?? 64, st.target?.body ?? 21, st.target?.leg ?? 15, st.position?.standing ?? 76, st.position?.clinch ?? 11, st.position?.ground ?? 13]
      : undefined,
  };
}

const fighters = [];
for (const f of src.fighters) if (!replaced.has(f.id) && DIV[f.divisionId]) fighters.push(compact(f, "ufc"));
for (const f of src.pfl.fighters) if (DIV[f.divisionId]) fighters.push(compact(f, "pfl"));

const ROLE = { "head-coach": 0, "striking-coach": 1, "grappling-coach": 2, "wrestling-coach": 3, "strength-conditioning": 4 };
const gyms = src.gyms.map((g) => {
  const q = [50, 50, 50, 50, 50];
  let hc = "";
  for (const s of g.staff ?? []) {
    const k = ROLE[s.role];
    if (k === undefined) continue;
    q[k] = s.quality;
    if (k === 0) hc = s.name;
  }
  return { id: g.id, n: g.name, c: g.countryCode || "US", city: g.city || undefined, rep: g.reputation, fac: g.facilities, q, hc };
});

const ranks = {};
for (const r of src.rankings) ranks[DIV[r.divisionId]] = { c: r.championId, e: r.entries };
const pflRanks = {};
for (const [d, list] of Object.entries(src.pfl.rankings ?? {})) pflRanks[DIV[d]] = list;
const pflChamps = {};
for (const [d, id] of Object.entries(src.pfl.champions ?? {})) pflChamps[DIV[d]] = id;
const pflInterim = {};
for (const [d, id] of Object.entries(src.pfl.interim ?? {})) pflInterim[DIV[d]] = id;

const out = {
  date: src.meta.snapshotDate,
  sources: [
    "UFC official rankings and athlete profiles (ufc.com), 1 October 2026",
    "Wikipedia: List of current PFL fighters (CC BY-SA 4.0), 15 November 2026",
  ],
  fighters,
  gyms,
  ufc: { ranks, p4p: src.pfp },
  pfl: { champs: pflChamps, interim: pflInterim, ranks: pflRanks },
};
writeFileSync("public/data/roster.json", JSON.stringify(out));
console.log(`roster.json: ${fighters.length} fighters (${fighters.filter((f) => f.p === "ufc").length} UFC, ${fighters.filter((f) => f.p === "pfl").length} PFL), ${gyms.length} gyms, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
