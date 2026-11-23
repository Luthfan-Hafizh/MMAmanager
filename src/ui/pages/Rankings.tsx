import { ageYears, fmtDate } from "../../core/time";
import { DIVISIONS, type DivisionId } from "../../data/divisions";
import { PROMOTIONS, PROMO_IDS, type PromoId } from "../../data/promotions";
import { ovr } from "../../model/attributes";
import type { World } from "../../model/types";
import { rankMove } from "../../world/rankings";
import { recordText } from "../../world/core";
import { useWorld } from "../../state/store";
import { go } from "../router";
import { Empty, FighterLink, Form, Ovr, Panel } from "../components";

export function Rankings({ promo, div }: { promo?: string; div?: string }) {
  const w = useWorld();
  const ranked = PROMO_IDS.filter((p) => PROMOTIONS[p].rankSize > 0);
  const pid = (promo && ranked.includes(promo as PromoId) ? promo : "ufc") as PromoId;
  const p = PROMOTIONS[pid];
  const d = (div && p.divisions.includes(div as DivisionId) ? div : div === "p4p" && pid === "ufc" ? "p4p" : p.divisions[0]) as DivisionId | "p4p";
  return (
    <div className="stack">
      <div className="row">
        <select className="input" value={pid} onChange={(e) => go(`/rankings/${e.target.value}`)}>
          {ranked.map((x) => <option key={x} value={x}>{PROMOTIONS[x].name}</option>)}
        </select>
        <div className="seg">
          {pid === "ufc" && <button className={d === "p4p" ? "on" : ""} onClick={() => go(`/rankings/ufc/p4p`)}>P4P</button>}
          {p.divisions.map((x) => (
            <button key={x} className={d === x ? "on" : ""} onClick={() => go(`/rankings/${pid}/${x}`)}>{DIVISIONS[x].short}</button>
          ))}
        </div>
      </div>
      {d === "p4p" ? <P4P w={w} /> : <DivisionRanks w={w} promo={pid} d={d} />}
      <p className="tiny dim">
        Rankings follow the rating model the UFC introduced in October 2026: who you beat counts most, a finish adds a little, activity helps, and after eighteen months out the score decays. A winner always moves above the fighter beaten. Champions sit above the list; an interim champion heads it.
      </p>
    </div>
  );
}

function DivisionRanks({ w, promo, d }: { w: World; promo: PromoId; d: DivisionId }) {
  const ps = w.promos[promo];
  const champ = ps.champs[d];
  const ids = ps.ranks[d] ?? [];
  const reign = champ ? [...ps.reigns].reverse().find((r) => r.fighter === champ && r.div === d && r.lost === undefined) : undefined;
  return (
    <div className="grid">
      <div className="c4">
        <Panel title="Champion" className="gold">
          {champ ? (
            <div className="stack">
              <div className="disp up" style={{ fontSize: 26, fontWeight: 800 }}><FighterLink w={w} id={champ} /></div>
              <div className="small muted">{recordText(w.fighters[champ])} · {reign ? `champion since ${fmtDate(reign.won)} · ${reign.defenses} defence${reign.defenses === 1 ? "" : "s"}` : ""}</div>
              <Form w={w} f={w.fighters[champ]} />
            </div>
          ) : (
            <Empty title="Vacant">The two best available contenders will fight for it.</Empty>
          )}
          {ps.contender[d] && <p className="small" style={{ marginTop: 10 }}>Number one contender: <FighterLink w={w} id={ps.contender[d]!} /></p>}
        </Panel>
      </div>
      <div className="c8">
        <Panel title={`${PROMOTIONS[promo].short} ${DIVISIONS[d].name}`} hint={`${DIVISIONS[d].limit} lb`} flush>
          {ids.length === 0 ? (
            <Empty title="No rankings yet" />
          ) : (
            <table className="tbl">
              <thead><tr><th className="c">#</th><th className="c">±</th><th>Fighter</th><th className="r">Record</th><th className="r">Age</th><th>Form</th><th className="c">Ovr</th></tr></thead>
              <tbody>
                {ids.map((id, i) => {
                  const f = w.fighters[id];
                  const mv = rankMove(w, promo, d, id);
                  return (
                    <tr key={id} className={f.ctrl ? "me" : ""}>
                      <td className="c">{ps.interim[d] === id ? <span className="rank ic">IC</span> : <span className="rank">{i + 1}</span>}</td>
                      <td className="c small">{mv === "new" ? <span className="badge info">New</span> : mv ? <span className={mv > 0 ? "good" : "bad"}>{mv > 0 ? `▲${mv}` : `▼${-mv}`}</span> : <span className="dim">-</span>}</td>
                      <td><FighterLink w={w} id={id} /></td>
                      <td className="r">{recordText(f)}</td>
                      <td className="r">{ageYears(f.birth, w.day)}</td>
                      <td><Form w={w} f={f} /></td>
                      <td className="c"><Ovr v={ovr(f.attrs)} sm /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}

function P4P({ w }: { w: World }) {
  return (
    <Panel title="UFC pound-for-pound" flush>
      <table className="tbl">
        <thead><tr><th className="c">#</th><th>Fighter</th><th>Division</th><th className="r">Record</th><th className="c">Ovr</th></tr></thead>
        <tbody>
          {w.p4p.map((id, i) => {
            const f = w.fighters[id];
            if (!f) return null;
            return (
              <tr key={id} className={f.ctrl ? "me" : ""}>
                <td className="c"><span className="rank">{i + 1}</span></td>
                <td><FighterLink w={w} id={id} rank /></td>
                <td>{DIVISIONS[f.div].name}</td>
                <td className="r">{recordText(f)}</td>
                <td className="c"><Ovr v={ovr(f.attrs)} sm /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}
