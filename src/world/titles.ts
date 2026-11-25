// Giving up belts: a champion who leaves, retires or moves on vacates the title,
// and an interim champion is promoted.

import { DIVISIONS, type DivisionId } from "../data/divisions";
import { PROMOTIONS, type PromoId } from "../data/promotions";
import type { Fighter, Reign, World } from "../model/types";
import { addNews, fullName } from "./core";
import { refreshDivision } from "./belts";

/** Take the interim belt from its holder and close the reign. */
export function dropInterim(w: World, promo: PromoId, d: DivisionId, ended: NonNullable<Reign["ended"]>): void {
  const ps = w.promos[promo];
  const id = ps.interim[d];
  if (!id) return;
  ps.interim[d] = null;
  const r = [...ps.reigns].reverse().find((x) => x.fighter === id && x.div === d && x.interim && x.lost === undefined);
  if (r) {
    r.lost = w.day;
    r.ended = ended;
  }
}

export function vacate(w: World, f: Fighter, why: "vacated" | "retired" | "moved" | "injury"): void {
  if (!f.promo) return;
  const promo = f.promo;
  const ps = w.promos[promo];
  for (const d of Object.keys(ps.champs) as DivisionId[]) {
    const held = ps.champs[d] === f.id || ps.interim[d] === f.id;
    if (ps.champs[d] === f.id) {
      ps.champs[d] = null;
      const r = [...ps.reigns].reverse().find((x) => x.fighter === f.id && x.div === d && x.lost === undefined);
      if (r) {
        r.lost = w.day;
        r.ended = why;
      }
      if (ps.interim[d]) {
        const nc = w.fighters[ps.interim[d]!];
        ps.champs[d] = nc.id;
        ps.interim[d] = null;
        const ir = [...ps.reigns].reverse().find((x) => x.fighter === nc.id && x.interim && x.lost === undefined);
        if (ir) {
          ir.lost = w.day;
          ir.ended = "unified";
        }
        ps.reigns.push({ fighter: nc.id, promo, div: d, won: w.day, defenses: 0, how: "promoted" });
        if (promo === "ufc" || promo === "pfl") addNews(w, { kind: "title", promo, fighters: [nc.id], big: true, text: `${fullName(nc)} is promoted to undisputed ${PROMOTIONS[promo].short} ${DIVISIONS[d].name.toLowerCase()} champion.` });
      }
    }
    if (ps.interim[d] === f.id) dropInterim(w, promo, d, why);
    if (ps.contender[d] === f.id) ps.contender[d] = null;
    if (held) refreshDivision(w, promo, d);
  }
}
