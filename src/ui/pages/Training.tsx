import { Fragment, useMemo } from "react";
import { ATTR_INFO, type AttrKey } from "../../model/attributes";
import type { SessionId, World } from "../../model/types";
import { INTENSITY_NAMES, SESSIONS, SESSION_IDS, SLOT_NAMES, TEMPLATES, coachQuality, planPreview, templatePlan } from "../../career/training";
import { MASTERY_NAMES, TECHNIQUES, TECH_IDS, type TechId } from "../../data/techniques";
import { changed, useWorld } from "../../state/store";
import { go } from "../router";
import { Empty, FighterLink, Panel, Seg } from "../components";
import { fullName } from "../../world/core";

export function FighterSwitch({ w, id, base }: { w: World; id: string; base: string }) {
  if (w.career.fighters.length <= 1) return null;
  return (
    <select className="input" value={id} onChange={(e) => go(`${base}/${e.target.value}`)}>
      {w.career.fighters.map((x) => (
        <option key={x} value={x}>{fullName(w.fighters[x])}</option>
      ))}
    </select>
  );
}

export function Training({ id }: { id?: string }) {
  const w = useWorld();
  const fid = id && w.career.fc[id] ? id : w.career.fighters[0];
  const f = w.fighters[fid];
  const fc = w.career.fc[fid];
  const preview = useMemo(() => (f && fc ? planPreview(w, f, fc.plan) : null), [w, f, fc, fc?.plan, w.day]);
  if (!f || !fc) return <Empty title="No fighter to train" />;
  const gym = w.gyms[f.gym];
  const setSlot = (i: number, s: SessionId) => {
    fc.plan = { ...fc.plan, week: fc.plan.week.map((x, k) => (k === i ? s : x)), template: "custom" };
    changed();
  };
  const setTemplate = (t: string) => {
    const p = templatePlan(t);
    fc.plan = { ...p, drill: fc.plan.drill };
    changed();
  };
  const drillable = TECH_IDS.filter((t) => (f.tech[t] ?? 0) < 3);
  const progress = (fc as unknown as { drill?: Partial<Record<TechId, number>> }).drill ?? {};
  const counts = new Map<SessionId, number>();
  for (const s of fc.plan.week) counts.set(s, (counts.get(s) ?? 0) + 1);
  const camp = fc.camp;
  return (
    <div className="grid">
      <div className="c12">
        <div className="row">
          <FighterSwitch w={w} id={fid} base="/training" />
          <span className="muted">
            Training at <b>{gym?.name}</b>, head coach {gym?.headCoach}. Coaches: striking {gym?.coaches.striking}, wrestling {gym?.coaches.wrestling}, grappling {gym?.coaches.grappling}, strength {gym?.coaches.sc}; facilities {gym?.facilities}.
          </span>
        </div>
      </div>
      {camp && (
        <div className="c12">
          <div className="notice row">
            In camp for <b>{fullName(w.fighters[w.bouts[camp.bout]?.a === f.id ? w.bouts[camp.bout].b : w.bouts[camp.bout]?.a])}</b>. Hard sparring builds sharpness; taper in the last week so you arrive fresh.
            <div style={{ flex: 1 }} />
            <button className="btn sm" onClick={() => setTemplate("camp")}>Use the camp week</button>
            <button className="btn sm" onClick={() => setTemplate("taper")}>Taper</button>
          </div>
        </div>
      )}
      <div className="c8 stack">
        <Panel
          title="The week"
          hint="Ten sessions, Monday to Friday"
          acts={
            <select className="input" value={TEMPLATES.some((t) => t.id === fc.plan.template) ? fc.plan.template : ""} onChange={(e) => e.target.value && setTemplate(e.target.value)}>
              <option value="">Custom week</option>
              {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          }
        >
          <div className="week">
            <div />
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => <div key={d} className="hd">{d}</div>)}
            {[0, 1].map((half) => (
              <Fragment key={half}>
                <div className="lab">{half === 0 ? "Morning" : "Evening"}</div>
                {[0, 1, 2, 3, 4].map((day) => {
                  const i = day * 2 + half;
                  const s = fc.plan.week[i];
                  const off = fc.dayJob && i >= 6;
                  return (
                    <div className="slot" key={i} title={SLOT_NAMES[i]}>
                      <select value={s} disabled={off} onChange={(e) => setSlot(i, e.target.value as SessionId)} style={{ borderLeftColor: off ? "var(--border)" : SESSIONS[s].color, opacity: off ? 0.45 : 1 }}>
                        {SESSION_IDS.map((x) => <option key={x} value={x}>{SESSIONS[x].name}</option>)}
                      </select>
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
          {fc.dayJob && <p className="small warn" style={{ marginTop: 10 }}>The day job takes Thursday and Friday: those sessions are lost.</p>}
          <hr className="sep" />
          <div className="row">
            <span className="small dim">Intensity</span>
            <Seg value={fc.plan.intensity} onChange={(v) => { fc.plan = { ...fc.plan, intensity: v }; changed(); }} options={INTENSITY_NAMES.map((n, i) => ({ v: i as 0 | 1 | 2, label: n }))} />
            <div style={{ flex: 1 }} />
            <label className="row small">
              <input type="checkbox" checked={fc.dayJob} onChange={(e) => { fc.dayJob = e.target.checked; changed(); }} /> Day job ($2,100 a month)
            </label>
          </div>
        </Panel>
        <Panel title="Sessions" flush>
          <table className="tbl compact">
            <thead>
              <tr><th>Session</th><th className="c">This week</th><th>Coach</th><th>Trains</th><th className="r">Load</th></tr>
            </thead>
            <tbody>
              {SESSION_IDS.map((s) => {
                const d = SESSIONS[s];
                return (
                  <tr key={s}>
                    <td><span className="row tight"><span className="promo-dot" style={{ background: d.color }} /> <b>{d.name}</b></span></td>
                    <td className="c">{counts.get(s) ?? 0}</td>
                    <td>{d.area === "head" ? "Head coach" : d.area === "sc" ? "Strength coach" : `${d.area} coach`} <span className="dim">{coachQuality(gym, d.area)}</span></td>
                    <td className="small muted">{Object.keys(d.attrs).map((k) => ATTR_INFO[k as AttrKey].name).join(", ") || (s === "drilling" ? "The technique you drill" : "Recovery")}</td>
                    <td className="r">{d.load > 0 ? d.load : <span className="good">{d.load}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
      <div className="c4 stack">
        <Panel title="Forecast" hint="one week of this plan">
          {preview && (
            <div className="stack" style={{ gap: 8 }}>
              <div className="spread"><span className="dim">Overall</span><b className={preview.ovr > 0 ? "good" : ""}>{preview.ovr >= 0 ? "+" : ""}{preview.ovr.toFixed(2)}</b></div>
              <div className="spread"><span className="dim">Fatigue after the week</span><b className={preview.fatigue > 65 ? "bad" : preview.fatigue > 45 ? "warn" : "good"}>{Math.round(preview.fatigue)}</b></div>
              <div className="spread"><span className="dim">Injury risk</span><b className={preview.risk > 0.03 ? "bad" : preview.risk > 0.015 ? "warn" : "good"}>{(preview.risk * 100).toFixed(1)}%</b></div>
              <div className="small" style={{ marginTop: 4 }}>
                <div className="dim">Most improved:</div>
                {preview.top.map(([k, v]) => (
                  <div key={k} className="spread"><span>{ATTR_INFO[k].name}</span><span className="good">+{v.toFixed(3)}</span></div>
                ))}
              </div>
              <p className="tiny dim" style={{ marginTop: 6 }}>Growth slows near the fighter's ceiling and with age; fatigue over 55 slows it too. Sparring is where injuries happen.</p>
            </div>
          )}
        </Panel>
        <Panel title="Technique to drill">
          <select className="input" style={{ width: "100%" }} value={fc.plan.drill ?? ""} onChange={(e) => { fc.plan = { ...fc.plan, drill: (e.target.value || null) as TechId | null }; changed(); }}>
            <option value="">Nothing in particular</option>
            {drillable.map((t) => (
              <option key={t} value={t}>{TECHNIQUES[t].name} ({MASTERY_NAMES[f.tech[t] ?? 0].toLowerCase()})</option>
            ))}
          </select>
          {fc.plan.drill && (
            <div style={{ marginTop: 10 }}>
              <p className="small muted">{TECHNIQUES[fc.plan.drill].desc}</p>
              <div className="spread small"><span className="dim">To the next level</span><b>{Math.round((progress[fc.plan.drill] ?? 0) * 100)}%</b></div>
              <div className="bar thin"><i style={{ width: `${(progress[fc.plan.drill] ?? 0) * 100}%` }} /></div>
              <p className="tiny dim" style={{ marginTop: 6 }}>Drilling sessions do most of the work; every fighting session adds a little. Typical: {TECHNIQUES[fc.plan.drill].weeks} weeks a level with two drilling sessions.</p>
            </div>
          )}
        </Panel>
        <Panel title="Fighter">
          <FighterLink w={w} id={f.id} rank />
          <div className="small dim" style={{ marginTop: 6 }}>Fatigue {f.fatigue} · Sharpness {f.sharp} · Professionalism {f.pers.professionalism}/20</div>
        </Panel>
      </div>
    </div>
  );
}
