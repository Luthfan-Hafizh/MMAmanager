import { fmtDate } from "../../core/time";
import { DIVISIONS, type DivisionId } from "../../data/divisions";
import { PROMOTIONS, PROMO_IDS, type PromoId } from "../../data/promotions";
import type { World } from "../../model/types";
import { rankMove } from "../../world/rankings";
import { rankNumber, recordText } from "../../world/core";
import { useWorld } from "../../state/store";
import { go, Link } from "../router";
import { Empty } from "../components";
import { Band } from "../art";

export function Rankings({ promo, div }: { promo?: string; div?: string }) {
  const w = useWorld();
  const ranked = PROMO_IDS.filter((p) => PROMOTIONS[p].rankSize > 0);
  const pid = (promo && ranked.includes(promo as PromoId) ? promo : "ufc") as PromoId;
  const p = PROMOTIONS[pid];
  const only = div && p.divisions.includes(div as DivisionId) ? (div as DivisionId) : null;
  const divs = only ? [only] : p.divisions;
  return (
    <>
      <Band
        eyebrow={pid === "ufc" ? "Rating model rankings" : `${p.short} rankings`}
        title={`${p.short} Rankings`}
        sub="Who you beat counts most, a finish adds a little, activity helps, and after eighteen months out the score decays. A winner always moves above the fighter beaten."
        tabs={
          <div className="tabs" style={{ marginBottom: -34 }}>
            {ranked.map((x) => (
              <button key={x} className={x === pid ? "on" : ""} onClick={() => go(`/rankings/${x}`)}>{PROMOTIONS[x].short}</button>
            ))}
          </div>
        }
      />
      <div className="wrap page-body">
        {(pid === "ufc" || pid === "pfl") && !only && <P4P w={w} promo={pid} />}
        <div className="rk-grid">
          {divs.map((d) => <DivisionColumn key={d} w={w} promo={pid} d={d} />)}
        </div>
      </div>
    </>
  );
}

function DivisionColumn({ w, promo, d }: { w: World; promo: PromoId; d: DivisionId }) {
  const ps = w.promos[promo];
  const champId = ps.champs[d];
  const champ = champId ? w.fighters[champId] : null;
  const ids = ps.ranks[d] ?? [];
  const reign = champId ? [...ps.reigns].reverse().find((r) => r.fighter === champId && r.div === d && r.lost === undefined) : undefined;
  return (
    <article className="rk-col">
      <div className="rk-champ">
        <div>
          <div className="div">{DIVISIONS[d].name}</div>
          {champ ? (
            <>
              <Link to={`/fighter/${champ.id}`} className="cn" style={{ display: "block" }}>{champ.first} {champ.surname}</Link>
              <div className="cr">Champion · {recordText(champ)}{reign ? ` · since ${fmtDate(reign.won)}${reign.defenses ? ` · ${reign.defenses} def.` : ""}` : ""}</div>
            </>
          ) : (
            <>
              <div className="cn">Vacant</div>
              <div className="cr">The top two available will fight for it</div>
            </>
          )}
        </div>
        {champ && <span className="belt" aria-hidden="true">C</span>}
      </div>
      {ps.interim[d] && w.fighters[ps.interim[d]!] && (
        <div className="rk-interim">
          <span className="label">Interim</span>
          <Link to={`/fighter/${ps.interim[d]}`}><b>{w.fighters[ps.interim[d]!].first} {w.fighters[ps.interim[d]!].surname}</b></Link>
          {champ && champ.injury && champ.injury.until > w.day ? <span className="tiny dim">champion out to {fmtDate(champ.injury.until)}</span> : null}
        </div>
      )}
      {promo === "ufc" && d === "LW" && ps.bmf && (
        <Link to="/titles/ufc/bmf" className="bmf-card">
          <div>
            <div className="label">BMF title</div>
            <div className="bmf-name">{ps.bmf.holder && w.fighters[ps.bmf.holder] ? `${w.fighters[ps.bmf.holder].first} ${w.fighters[ps.bmf.holder].surname}` : "Vacant"}</div>
          </div>
          <span className="bmf-mark" aria-hidden="true">BMF</span>
        </Link>
      )}
      <div className="rk-list">
        {ids.length === 0 && <Empty title="No rankings yet" />}
        {ids.map((id, i) => {
          const f = w.fighters[id];
          const mv = rankMove(w, promo, d, id);
          return (
            <Link key={id} to={`/fighter/${id}`} className={f.ctrl ? "me" : ""}>
              <span className="n">{ps.interim[d] === id ? "IC" : rankNumber(ids, ps.interim[d] ?? null, i)}</span>
              <span className="ellip" style={{ fontWeight: f.ctrl ? 800 : 500 }}>{f.first} {f.surname}</span>
              <span className={`mv ${typeof mv === "number" ? (mv > 0 ? "good" : "bad") : "dim"}`}>{mv === "new" ? "NEW" : typeof mv === "number" && mv !== 0 ? (mv > 0 ? `▲${mv}` : `▼${-mv}`) : ""}</span>
            </Link>
          );
        })}
      </div>
      <Link to={`/titles/${promo}/${d}`} className="rk-hist">Title history</Link>
    </article>
  );
}

function P4P({ w, promo }: { w: World; promo: PromoId }) {
  const list = promo === "ufc" ? w.p4p : w.promos[promo]?.p4p ?? [];
  const top = list.slice(0, 15).map((id) => w.fighters[id]).filter(Boolean);
  const first = top[0];
  if (!first) return null;
  return (
    <section className="sec">
      <div className="sec-h"><h2>Pound for pound</h2><span className="hint">The best {top.length} fighters in the {PROMOTIONS[promo].short} regardless of weight</span></div>
      <div className="rk-col p4p-col">
        {first && (
          <div className="rk-champ" style={{ minHeight: 220 }}>
            <div>
              <div className="div">Pound-for-pound #1</div>
              <Link to={`/fighter/${first.id}`} className="cn" style={{ display: "block", fontSize: 34 }}>{first.first} {first.surname}</Link>
              <div className="cr">{DIVISIONS[first.div].name} · {recordText(first)}</div>
            </div>
            <span className="belt" aria-hidden="true" style={{ fontSize: 150 }}>1</span>
          </div>
        )}
        <div className="rk-list p4p-list">
          {top.map((f, i) => (
            <Link key={f.id} to={`/fighter/${f.id}`} className={f.ctrl ? "me" : ""}>
              <span className="n">{i + 1}</span>
              <span className="ellip" style={{ fontWeight: 600 }}>{f.first} {f.surname}</span>
              <span className="tiny dim">{DIVISIONS[f.div].short}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
