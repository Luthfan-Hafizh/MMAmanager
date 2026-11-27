import { fmtDate } from "../../core/time";
import { money } from "../../core/util";
import { REGIONS } from "../../data/countries";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS, PROMO_IDS, TIER_NAME, rankSizeOf, type PromoId } from "../../data/promotions";
import { ovr } from "../../model/attributes";
import { upcomingOf } from "../../world/calendar";
import { promoRoster, recordText } from "../../world/core";
import { useWorld } from "../../state/store";
import { latestBrackets, rtuSeason } from "../../world/roadtoufc";
import type { RtuBracket, World } from "../../model/types";
import { go, Link } from "../router";
import { Empty, FighterLink, Ovr, Panel, rowLink, ScrollRow } from "../components";

export function Promotions() {
  const w = useWorld();
  const tiers = ["major", "league", "tryout", "regional", "local", "amateur"] as const;
  return (
    <div className="stack">
      {tiers.map((t) => (
        <Panel key={t} title={TIER_NAME[t]} flush>
          <table className="tbl">
            <thead><tr><th>Promotion</th><th>Region</th><th className="r">Events a year</th><th className="r">Fighters</th><th className="r">Purses</th><th>Next event</th></tr></thead>
            <tbody>
              {PROMO_IDS.filter((p) => PROMOTIONS[p].tier === t).map((p) => {
                const d = PROMOTIONS[p];
                const next = upcomingOf(w, p, 1)[0];
                return (
                  <tr key={p} className="click" {...rowLink(() => go(`/promotions/${p}`))}>
                    <td><span className="row tight"><span className="promo-dot" style={{ background: d.color }} /><b>{d.name}</b> <span className="dim">{d.short}</span></span></td>
                    <td>{d.region === "global" ? "Worldwide" : REGIONS[d.region].name}</td>
                    <td className="r">{d.eventsPerYear}</td>
                    <td className="r">{d.tier === "tryout" ? <span className="dim">Invited</span> : promoRoster(w, p).length}</td>
                    <td className="r small">{!d.showLow ? "Amateur" : d.showLow === d.showHigh ? money(d.showLow) : `${money(d.showLow)} to ${money(d.showHigh)}`}</td>
                    <td className="small">{next ? `${next.name}, ${fmtDate(next.day)}` : d.tier === "tryout" ? <span className="dim">Next summer</span> : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ))}
    </div>
  );
}

export function PromotionPage({ id }: { id: string }) {
  const w = useWorld();
  const p = PROMOTIONS[id as PromoId];
  if (!p) return <Empty title="Promotion not found" />;
  const ps = w.promos[p.id];
  const events = upcomingOf(w, p.id, 6);
  return (
    <div className="grid">
      <div className="c8">
        {p.id === "rtu" ? (
          <RtuBrackets w={w} />
        ) : (
        <Panel title="Champions" flush>
          <table className="tbl">
            <thead><tr><th>Division</th><th>Champion</th><th className="r">Record</th><th className="c">Ovr</th><th className="r">Roster</th></tr></thead>
            <tbody>
              {p.divisions.map((d) => {
                const c = ps.champs[d];
                const f = c ? w.fighters[c] : null;
                return (
                  <tr key={d}>
                    <td><b>{DIVISIONS[d].name}</b>{ps.interim[d] && <div className="tiny dim">Interim: {w.fighters[ps.interim[d]!]?.surname}</div>}</td>
                    <td>{f ? <FighterLink w={w} id={f.id} /> : <span className="dim">Vacant</span>}</td>
                    <td className="r">{f ? recordText(f) : ""}</td>
                    <td className="c">{f ? <Ovr v={ovr(f.attrs)} sm /> : ""}</td>
                    <td className="r">{promoRoster(w, p.id).filter((x) => x.div === d).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        )}
      </div>
      <div className="c4 stack">
        <Panel title="About">
          <dl className="kv">
            <dt>Level</dt><dd>{TIER_NAME[p.tier]}</dd>
            <dt>Region</dt><dd>{p.region === "global" ? "Worldwide" : REGIONS[p.region].name}</dd>
            <dt>Events a year</dt><dd>{p.eventsPerYear}</dd>
            <dt>Purses</dt><dd>{!p.showLow ? "None" : p.showLow === p.showHigh ? `${money(p.showLow)}, and the same to win` : `${money(p.showLow)} to ${money(p.showHigh)}`}</dd>
            <dt>Rounds</dt><dd>{p.roundSec === 180 ? "3 × 3 min" : p.tier === "tryout" ? "3 × 5 min" : "3 × 5 min, titles 5 × 5"}</dd>
            {p.rankSize > 0 && <><dt>Rankings</dt><dd>Top {p.rankSize}{p.divisions.some((d) => rankSizeOf(p.id, d) < p.rankSize) ? `, top ${Math.min(...p.divisions.map((d) => rankSizeOf(p.id, d)))} in the smaller divisions` : ""}</dd></>}
          </dl>
          <div className="row" style={{ marginTop: 10 }}>
            {p.rankSize > 0 && <Link to={`/rankings/${p.id}`} className="btn sm">Rankings</Link>}
            {p.rankSize > 0 && <Link to={`/legacy/records/${p.id}`} className="btn sm">Records</Link>}
            <Link to={`/events/${p.id}`} className="btn sm">Events</Link>
          </div>
        </Panel>
        <Panel title="Next events" flush>
          {events.map((e) => (
            <div key={e.id} className="list-row" {...rowLink(() => go(`/event/${e.id}`))} style={{ cursor: "pointer" }}>
              <div><b className="disp up">{e.name}</b><div className="tiny dim">{fmtDate(e.day, { dow: true })} · {e.city}</div></div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

/** Road to UFC's brackets this season: the opening round, the semifinals, the final, the winner. */
function RtuBrackets({ w }: { w: World }) {
  const list = latestBrackets(w);
  if (!list.length) {
    return (
      <Panel title="Road to UFC">
        <Empty title="No brackets yet">The field is named about three months before the opening round in May: four brackets of eight from Asia and Oceania.</Empty>
      </Panel>
    );
  }
  const year = list[0].year;
  const round = (t: RtuBracket, r: number) => {
    const slots = t.slots[r];
    if (!slots) return <span className="dim">-</span>;
    const next = t.slots[r + 1];
    const out = [];
    for (let p = 0; p < slots.length / 2; p++) {
      const won = next?.[p];
      const who = (id: string | null) =>
        id ? (
          <span className={won ? (won === id ? "br-w" : "br-l") : undefined}>
            <FighterLink w={w} id={id} short />
          </span>
        ) : (
          <span className="dim">TBA</span>
        );
      out.push(
        <div key={p} className="br-pair">
          {who(slots[2 * p])} <span className="dim">v</span> {who(slots[2 * p + 1])}
        </div>,
      );
    }
    return out;
  };
  return (
    <Panel title={`Road to UFC Season ${rtuSeason(year)}`} hint={list.every((t) => t.done) ? "The winners have UFC contracts" : "Three wins to a UFC contract"} flush>
      <ScrollRow className="br-wrap" label="The brackets">
        <table className="tbl bracket">
          <thead><tr><th>Division</th><th>Opening round</th><th>Semifinals</th><th>Final</th><th>Winner</th></tr></thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td><b>{DIVISIONS[t.div].name}</b></td>
                <td>{round(t, 0)}</td>
                <td>{round(t, 1)}</td>
                <td>{round(t, 2)}</td>
                <td>{t.winner ? <FighterLink w={w} id={t.winner} /> : <span className="dim">-</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRow>
    </Panel>
  );
}
