// Title history: the lineage of every belt, with the interim reigns, how each
// reign began and ended, and the defences; and the UFC's BMF title.

import { fmtDate } from "../../core/time";
import { DIVISIONS, type DivisionId } from "../../data/divisions";
import { PROMOTIONS, PROMO_IDS, type PromoId } from "../../data/promotions";
import type { Reign, World } from "../../model/types";
import { fullName } from "../../world/core";
import { stripDeadline } from "../../world/belts";
import { useWorld } from "../../state/store";
import { go, Link } from "../router";
import { Empty } from "../components";
import { Band } from "../art";

const HOW: Record<string, string> = { won: "Won it", vacant: "Won the vacant title", promoted: "Promoted from interim", interim: "Won the interim title" };
const ENDED: Record<string, string> = { lost: "Lost it", vacated: "Vacated", stripped: "Stripped", retired: "Retired", moved: "Left the promotion", unified: "Unified", injury: "Vacated (injury)" };

export function Titles({ promo, div }: { promo?: string; div?: string }) {
  const w = useWorld();
  const ranked = PROMO_IDS.filter((p) => PROMOTIONS[p].rankSize > 0);
  const pid = (promo && ranked.includes(promo as PromoId) ? promo : "ufc") as PromoId;
  const p = PROMOTIONS[pid];
  const bmf = pid === "ufc" && div === "bmf";
  const d = (div && p.divisions.includes(div as DivisionId) ? div : p.divisions[0]) as DivisionId;
  return (
    <>
      <Band
        eyebrow="Lineage"
        title="Title history"
        sub="Every reign from the champions the world began with: how each began and ended, interim belts and their defences, unifications and strippings. The BMF lineage goes back to 2019."
        tabs={
          <div className="tabs" style={{ marginBottom: -34 }}>
            {ranked.map((x) => (
              <button key={x} className={x === pid ? "on" : ""} onClick={() => go(`/titles/${x}`)}>{PROMOTIONS[x].short}</button>
            ))}
          </div>
        }
      />
      <div className="wrap page-body">
        <div className="pills" role="tablist" aria-label="Weight classes">
          {p.divisions.map((x) => (
            <button key={x} role="tab" aria-selected={!bmf && x === d} className={`pill${!bmf && x === d ? " on" : ""}`} onClick={() => go(`/titles/${pid}/${x}`)}>{DIVISIONS[x].name.replace("Women's ", "W. ")}</button>
          ))}
          {pid === "ufc" && <button role="tab" aria-selected={bmf} className={`pill bmf${bmf ? " on" : ""}`} onClick={() => go("/titles/ufc/bmf")}>BMF</button>}
        </div>
        {bmf ? <BmfLineage w={w} /> : <Lineage w={w} promo={pid} d={d} />}
      </div>
    </>
  );
}

function Lineage({ w, promo, d }: { w: World; promo: PromoId; d: DivisionId }) {
  const ps = w.promos[promo];
  const reigns = ps.reigns.filter((r) => r.div === d).sort((a, b) => b.won - a.won);
  const champ = ps.champs[d] ? w.fighters[ps.champs[d]!] : null;
  const ic = ps.interim[d] ? w.fighters[ps.interim[d]!] : null;
  const deadline = champ && (ic || (champ.injury && champ.injury.until > w.day)) ? stripDeadline(w, promo, d) : null;
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>{PROMOTIONS[promo].short} {DIVISIONS[d].name}</h2>
        <span className="hint">
          {champ ? <>Champion: <Link to={`/fighter/${champ.id}`}>{fullName(champ)}</Link></> : "Vacant"}
          {ic ? <> · Interim: <Link to={`/fighter/${ic.id}`}>{fullName(ic)}</Link></> : null}
          {deadline ? <> · champion out: the belt is at risk from {fmtDate(deadline)}</> : null}
        </span>
      </div>
      <div className="panel">
        {reigns.length === 0 ? (
          <Empty title="No reigns recorded yet">The first champion in this world will appear here.</Empty>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Champion</th><th>Belt</th><th>Won</th><th>How</th><th>Until</th><th>How it ended</th><th className="c">Defences</th></tr></thead>
              <tbody>
                {reigns.map((r: Reign, i) => {
                  const f = w.fighters[r.fighter];
                  const now = r.lost === undefined;
                  return (
                    <tr key={i} className={now ? "hl" : ""}>
                      <td>{f ? <Link to={`/fighter/${f.id}`}><b>{fullName(f)}</b></Link> : r.fighter}</td>
                      <td>{r.interim ? <span className="badge">Interim</span> : <span className="badge gold">Undisputed</span>}</td>
                      <td className="nowrap">{fmtDate(r.won)}</td>
                      <td className="small">{HOW[r.how] ?? r.how}</td>
                      <td className="nowrap">{now ? <b>Current</b> : fmtDate(r.lost!)}</td>
                      <td className={`small${r.ended === "stripped" ? " bad" : ""}`}>{now ? "" : ENDED[r.ended ?? ""] ?? r.ended ?? ""}</td>
                      <td className="c"><b className="num">{r.defenses}</b></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function BmfLineage({ w }: { w: World }) {
  const bmf = w.promos.ufc.bmf;
  const reigns = [...(bmf?.reigns ?? [])].reverse();
  const holder = bmf?.holder ? w.fighters[bmf.holder] : null;
  return (
    <section className="sec">
      <div className="bmf-card big">
        <div>
          <div className="label">The BMF title · UFC lightweight</div>
          <div className="bmf-name">{holder ? <Link to={`/fighter/${holder.id}`}>{fullName(holder)}</Link> : "Vacant"}</div>
          <div className="small">The Baddest Motherf*cker: a ceremonial belt for the most exciting names, first won by Jorge Masvidal at UFC 244. Defended about once a year, over five rounds; it has no rankings behind it and no bearing on the lightweight title.</div>
        </div>
        <span className="bmf-mark" aria-hidden="true">BMF</span>
      </div>
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>BMF</th><th>Won</th><th>Where</th><th>Until</th><th>How it ended</th><th className="c">Defences</th></tr></thead>
            <tbody>
              {reigns.map((r, i) => {
                const f = r.fighter ? w.fighters[r.fighter] : null;
                const now = r.lost === undefined;
                return (
                  <tr key={i} className={now ? "hl" : ""}>
                    <td>{f ? <Link to={`/fighter/${f.id}`}><b>{r.name}</b></Link> : <b>{r.name}</b>}</td>
                    <td className="nowrap">{fmtDate(r.won)}</td>
                    <td className="small">{r.at ?? ""}</td>
                    <td className="nowrap">{now ? <b>Current</b> : fmtDate(r.lost!)}</td>
                    <td className="small">{now ? "" : ENDED[r.ended ?? ""] ?? ""}</td>
                    <td className="c"><b className="num">{r.defenses}</b></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
