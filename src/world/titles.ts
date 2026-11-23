// Giving up belts: a champion who leaves, retires or moves on vacates the title,
// and an interim champion is promoted.

import { DIVISIONS, type DivisionId } from "../data/divisions";
import { PROMOTIONS } from "../data/promotions";
import type { Fighter, World } from "../model/types";
import { addNews, fullName } from "./core";

export function vacate(w: World, f: Fighter, why: "vacated" | "retired" | "moved"): void {
  if (!f.promo) return;
  const promo = f.promo;
  const ps = w.promos[promo];
  for (const d of Object.keys(ps.champs) as DivisionId[]) {
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
    if (ps.interim[d] === f.id) ps.interim[d] = null;
    if (ps.contender[d] === f.id) ps.contender[d] = null;
  }
}
