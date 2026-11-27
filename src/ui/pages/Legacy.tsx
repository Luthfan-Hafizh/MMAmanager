import { useState } from "react";
import { DIVISIONS } from "../../data/divisions";
import { PROMOTIONS, PROMO_IDS, type PromoId } from "../../data/promotions";
import type { AwardKind, World } from "../../model/types";
import { AWARD_NAME } from "../../world/awards";
import { go } from "../router";
import { goatList, legacyText, records } from "../../world/legacy";
import { careerRecap } from "../../career/retire";
import { recordText } from "../../world/core";
import { useWorld } from "../../state/store";
import { Link } from "../router";
import { Empty, Flag, ScrollRow, Tabs } from "../components";
import { Band } from "../art";

type Tab = "goat" | "hof" | "awards" | "records";
const TABS: Tab[] = ["goat", "hof", "awards", "records"];

export function Legacy({ tab, promo }: { tab?: string; promo?: string }) {
  const w = useWorld();
  const [t, setT] = useState<Tab>(TABS.includes(tab as Tab) ? (tab as Tab) : "goat");
  return (
    <>
      <Band
        word="Legacy"
        eyebrow="All-time"
        title="Legacy"
        sub="Belts and defences at the top count most, then wins over the best, finishes, and time at the top of the pound-for-pound list. The Hall of Fame inducts a class every July at International Fight Week."
        tabs={<Tabs<Tab> value={t} onChange={setT} tabs={[{ id: "goat", label: "Greatest of all time" }, { id: "hof", label: "Hall of Fame" }, { id: "awards", label: "Awards" }, { id: "records", label: "Records" }]} />}
      />
      <div className="wrap page-body">
        {t === "goat" && <Goat w={w} />}
        {t === "hof" && <Hof w={w} />}
        {t === "awards" && <Awards w={w} />}
        {t === "records" && <Records w={w} promo={promo} />}
      </div>
    </>
  );
}

function Goat({ w }: { w: World }) {
  const list = goatList(w, 30);
  const retired = w.career.retiredFighter ? w.fighters[w.career.retiredFighter] : null;
  return (
    <div className="grid">
      <div className={retired ? "c8" : "c12"}>
        <div className="panel">
          <table className="tbl">
            <thead><tr><th className="c">#</th><th>Fighter</th><th>Division</th><th className="r">Record</th><th>Status</th><th className="r">Legacy</th></tr></thead>
            <tbody>
              {list.map((f, i) => (
                <tr key={f.id} className={f.ctrl || f.id === w.career.retiredFighter ? "me" : ""}>
                  <td className="c"><span className={`rank${i === 0 ? " c" : ""}`}>{i + 1}</span></td>
                  <td><Link to={`/fighter/${f.id}`} className="flink"><Flag code={f.country} /><span className="nm">{f.first} {f.surname}</span></Link></td>
                  <td>{DIVISIONS[f.div].name}</td>
                  <td className="r">{recordText(f)}</td>
                  <td className="small">{f.status === "retired" ? "Retired" : f.promo ? PROMOTIONS[f.promo].short : "Free agent"}{w.hof.some((h) => h.fighter === f.id) ? " · Hall of Fame" : ""}</td>
                  <td className="r"><b className="num" style={{ fontSize: 20 }}>{Math.round(f.legacy ?? 0)}</b> <span className="tiny dim">{legacyText(f.legacy ?? 0)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {retired && (
        <div className="c4">
          <div className="stories">
            <h3>{retired.first} {retired.surname}</h3>
            {careerRecap(w, retired).lines.map((l, i) => (
              <div key={i} className="story" style={{ gridTemplateColumns: "1fr" }}><div className="t">{l}</div></div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Hof({ w }: { w: World }) {
  const years = [...new Set(w.hof.map((h) => h.year))].sort((a, b) => b - a);
  if (!years.length) return <div className="panel"><Empty title="No inductions yet">The first class is inducted at International Fight Week in July: retired fighters with a legacy of 45 or more.</Empty></div>;
  return (
    <div className="stack">
      {years.map((y) => (
        <section key={y} className="sec">
          <div className="sec-h"><h2>Class of {y}</h2></div>
          <div className="grid">
            {w.hof.filter((h) => h.year === y).map((h) => {
              const f = w.fighters[h.fighter];
              if (!f) return null;
              return (
                <div key={h.fighter} className="c4 panel">
                  <div className="panel-b">
                    <div className="label">{DIVISIONS[f.div].name}</div>
                    <Link to={`/fighter/${f.id}`} className="dx" style={{ fontSize: 34, display: "block", margin: "6px 0" }}>{f.first} {f.surname}</Link>
                    <div className="small dim">{recordText(f)} · {f.reigns} title reign{f.reigns === 1 ? "" : "s"} · legacy {Math.round(f.legacy ?? 0)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

const AWARD_ORDER: AwardKind[] = ["fighter", "fight", "ko", "sub", "upset", "newcomer"];

/** Year-end awards: the UFC's six, and a Fighter of the Year in every other ranked promotion. */
function Awards({ w }: { w: World }) {
  const years = [...new Set((w.awards ?? []).map((a) => a.year))].sort((a, b) => b - a);
  if (!years.length) return <div className="panel"><Empty title="No awards yet">Every January the year just gone gets its awards: the UFC's Fighter, Fight, Knockout, Submission, Upset and Newcomer of the Year, and a Fighter of the Year in every other ranked promotion.</Empty></div>;
  return (
    <div className="stack">
      {years.map((y) => {
        const list = (w.awards ?? []).filter((a) => a.year === y);
        const ufc = list.filter((a) => a.promo === "ufc").sort((a, b) => AWARD_ORDER.indexOf(a.kind) - AWARD_ORDER.indexOf(b.kind));
        const rest = list.filter((a) => a.promo !== "ufc");
        return (
          <section key={y} className="sec">
            <div className="sec-h"><h2>{y} awards</h2><span className="hint">Handed out in January {y + 1}</span></div>
            <div className="grid">
              {ufc.map((a) => (
                <div key={`${a.kind}`} className={`c4 panel award${a.fighters.some((id) => w.fighters[id]?.ctrl) ? " me" : ""}`}>
                  <div className="panel-b">
                    <div className="label">UFC · {AWARD_NAME[a.kind]}</div>
                    <div className="award-who">
                      {a.fighters.map((id, i) => (
                        <span key={id}>{i > 0 && <span className="dim"> and </span>}<Link to={`/fighter/${id}`}>{w.fighters[id]?.first} {w.fighters[id]?.surname}</Link></span>
                      ))}
                    </div>
                    <div className="small dim">{a.why}</div>
                  </div>
                </div>
              ))}
            </div>
            {rest.length > 0 && (
              <div className="panel" style={{ marginTop: 18 }}>
                <div className="panel-h"><h3>Fighter of the Year, promotion by promotion</h3></div>
                <table className="tbl compact">
                  <tbody>
                    {rest.map((a) => (
                      <tr key={`${a.promo}-${a.kind}`} className={a.fighters.some((id) => w.fighters[id]?.ctrl) ? "me" : ""}>
                        <td style={{ width: 160 }}><b>{PROMOTIONS[a.promo].short}</b></td>
                        <td><Link to={`/fighter/${a.fighters[0]}`} className="flink"><Flag code={w.fighters[a.fighters[0]]?.country ?? "US"} /><span className="nm">{w.fighters[a.fighters[0]]?.first} {w.fighters[a.fighters[0]]?.surname}</span></Link></td>
                        <td className="small dim">{a.why}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Records({ w, promo }: { w: World; promo?: string }) {
  const ranked = PROMO_IDS.filter((p) => PROMOTIONS[p].rankSize > 0);
  const pick: PromoId | "all" = promo === "all" ? "all" : ranked.includes(promo as PromoId) ? (promo as PromoId) : "ufc";
  const rec = records(w, pick);
  return (
    <>
      <ScrollRow className="rk-divs" active={pick} label="Records at">
        {ranked.map((p) => (
          <button key={p} type="button" className={`btn sm${pick === p ? " on" : ""}`} onClick={() => go(`/legacy/records/${p}`)}>{PROMOTIONS[p].short}</button>
        ))}
        <button type="button" className={`btn sm${pick === "all" ? " on" : ""}`} onClick={() => go("/legacy/records/all")}>Whole careers</button>
      </ScrollRow>
      <p className="small dim" style={{ margin: "0 0 14px" }}>{pick === "all" ? "Over whole careers, every promotion counted." : `In the ${PROMOTIONS[pick].short} since the world began.`}</p>
      <div className="grid">
        {rec.map((r) => (
          <div key={r.label} className="c6 panel">
            <div className="panel-h"><h3>{r.label}</h3></div>
            {r.rows.length === 0 ? (
              <Empty title="Nothing yet">Records fill in as the years go by.</Empty>
            ) : (
              <table className="tbl compact">
                <tbody>
                  {r.rows.map((x, i) => (
                    <tr key={`${x.f.id}-${i}`} className={x.f.ctrl ? "me" : ""}>
                      <td className="c" style={{ width: 40 }}><span className="rank">{i + 1}</span></td>
                      <td><Link to={`/fighter/${x.f.id}`} className="flink"><Flag code={x.f.country} /><span className="nm">{x.f.first} {x.f.surname}</span></Link></td>
                      <td className="r"><b>{x.text}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
