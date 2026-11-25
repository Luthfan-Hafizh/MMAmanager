import { InjuryCard } from "../advice";
import { Fragment, useMemo, useState } from "react";
import { ATTR_INFO, type AttrKey } from "../../model/attributes";
import type { Fighter, FighterCareer, SessionId, World } from "../../model/types";
import { INTENSITY_NAMES, SESSIONS, SESSION_IDS, SLOT_NAMES, TEMPLATES, coachQuality, neckNote, planPreview, styleSessions, templatePlan, trainingWeek } from "../../career/training";
import { FIGHT_STYLES, masteryName, styleFit, type StyleId } from "../../data/fightstyles";
import { fightStyle, switchStyle } from "../../world/fightstyle";
import { Rng } from "../../core/rng";
import { MASTERY_NAMES, TECHNIQUES, TECH_IDS, type TechId } from "../../data/techniques";
import { changed, useWorld } from "../../state/store";
import { go } from "../router";
import { Empty, FighterLink, Panel, Seg } from "../components";
import { fullName } from "../../world/core";
import { GymPanel, WeightPanel } from "./Moves";

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
  if (!f || !fc) return <Empty title="No fighter to train">{w.career.mode === "manager" ? "Sign clients from Scouting to plan their training." : "There is no active fighter in this career."}</Empty>;
  const gym = w.gyms[f.gym];
  const setSlot = (i: number, s: SessionId) => {
    fc.plan = { ...fc.plan, week: fc.plan.week.map((x, k) => (k === i ? s : x)), template: "custom" };
    changed();
  };
  const setTemplate = (t: string) => {
    const p = templatePlan(t);
    fc.plan = { ...p, drill: fc.plan.drill, style: fc.plan.style };
    changed();
  };
  const drillable = TECH_IDS.filter((t) => (f.tech[t] ?? 0) < 3);
  const progress = (fc as unknown as { drill?: Partial<Record<TechId, number>> }).drill ?? {};
  const counts = new Map<SessionId, number>();
  for (const s of fc.plan.week) counts.set(s, (counts.get(s) ?? 0) + 1);
  const camp = fc.camp;
  const strengthDays = counts.get("strength") ?? 0;
  const neckText = [strengthDays ? "" : "Neck work is part of every strength session, and the one thing that builds a chin.", neckNote(f) ?? ""].filter(Boolean).join(" ");
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
      {f.injury && f.injury.until > w.day && (
        <div className="c12">
          <InjuryCard w={w} f={f} />
        </div>
      )}
      {camp && (
        <div className="c12">
          <div className="notice row">
            <span>In camp for <b>{fullName(w.fighters[w.bouts[camp.bout]?.a === f.id ? w.bouts[camp.bout].b : w.bouts[camp.bout]?.a])}</b>. Hard sparring builds sharpness; taper in the last week so you arrive fresh.</span>
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
                      <select value={s} disabled={off} onChange={(e) => setSlot(i, e.target.value as SessionId)} style={{ borderTopColor: off ? "var(--line)" : SESSIONS[s].color, opacity: off ? 0.45 : 1 }}>
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
        <StyleCoaching w={w} f={f} fc={fc} />
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
                    <td className="small muted">{(Object.keys(d.attrs) as AttrKey[]).map((k) => `${ATTR_INFO[k].name}${d.how?.[k] ? ` (${d.how[k]})` : ""}`).join(", ") || (s === "drilling" ? "The technique you drill" : "Recovery")}</td>
                    <td className="r">{d.load > 0 ? d.load : <span className="good">{d.load}</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
      <div className="c4 stack">
        <GymPanel w={w} f={f} />
        <WeightPanel w={w} f={f} />
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
              <div className="forecast-chin">
                <div className="spread small">
                  <span>Chin <span className="dim">· neck work</span></span>
                  {strengthDays ? <span className={preview.chin >= 0.0005 ? "good" : "dim"}>+{preview.chin.toFixed(3)}</span> : <span className="dim">No strength session</span>}
                </div>
                {neckText && <p className="tiny dim">{neckText}</p>}
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

/** Style coaching: build one of the two styles, or change one. */
function StyleCoaching({ w, f, fc }: { w: World; f: Fighter; fc: FighterCareer }) {
  const st = fightStyle(f);
  const [picking, setPicking] = useState<"strike" | "grapple" | null>(null);
  const focus: "off" | "strike" | "grapple" = fc.plan.style ? FIGHT_STYLES[fc.plan.style].kind : "off";
  const week = useMemo(() => {
    const clone: Fighter = { ...f, attrs: { ...f.attrs }, style: { ...st } };
    // The day job takes Thursday and Friday, as it does in the real week.
    const plan = fc.dayJob ? { ...fc.plan, week: fc.plan.week.map((s, k) => (k >= 6 ? ("rest" as SessionId) : s)) } : fc.plan;
    return trainingWeek(w, clone, plan, new Rng(1), false).styled;
  }, [w, f, fc.plan, fc.dayJob, w.day, st.s, st.g, st.sm, st.gm]);
  const setFocus = (k: "off" | "strike" | "grapple") => {
    fc.plan = { ...fc.plan, style: k === "off" ? null : k === "strike" ? st.s : st.g };
    changed();
  };
  const choose = (id: StyleId) => {
    const sd = FIGHT_STYLES[id];
    const back = st.known?.[id];
    const start = back ?? Math.round(Math.max(6, Math.min(30, 6 + styleFit(f.attrs, id) * 0.22)));
    const cur = sd.kind === "strike" ? st.s : st.g;
    const curM = sd.kind === "strike" ? st.sm : st.gm;
    if (!confirm(`Switch to ${sd.name}? ${back !== undefined ? `${f.surname} goes back to it at ${Math.round(back)}.` : `${f.surname} starts it at ${start}.`} ${FIGHT_STYLES[cur].name} (${Math.round(curM)}) is kept, in case you come back to it.`)) return;
    switchStyle(f, id);
    if (fc.plan.style && FIGHT_STYLES[fc.plan.style].kind === sd.kind) fc.plan = { ...fc.plan, style: id };
    setPicking(null);
    changed();
  };
  const card = (kind: "strike" | "grapple") => {
    const id = kind === "strike" ? st.s : st.g;
    const m = kind === "strike" ? st.sm : st.gm;
    const sd = FIGHT_STYLES[id];
    const best = Object.entries(styleSessions(id)).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 2).map(([sid]) => SESSIONS[sid as SessionId].name.toLowerCase());
    return (
      <div className={`style-coach${focus === kind ? " on" : ""}`}>
        <div className="label">{kind === "strike" ? "Striking" : "Grappling"} · from {sd.from}</div>
        <div className="style-name" style={{ fontSize: 24 }}>{sd.name}</div>
        <div className="style-m">
          <div className="bar"><i style={{ width: `${m}%`, background: "var(--ink)" }} /></div>
          <span><b className="num">{Math.round(m)}</b> {masteryName(m)}</span>
        </div>
        <p className="tiny dim" style={{ marginTop: 6 }}>Built in {best.join(" and ")} sessions.</p>
        <button className="btn sm ghost" style={{ marginTop: 6 }} onClick={() => setPicking(picking === kind ? null : kind)}>{picking === kind ? "Keep this style" : "Change style"}</button>
      </div>
    );
  };
  const options = picking ? Object.values(FIGHT_STYLES).filter((x) => x.kind === picking).map((x) => ({ x, fit: styleFit(f.attrs, x.id) })).sort((a, b) => b.fit - a.fit) : [];
  return (
    <Panel title="Style coaching" hint="The coaches build one style at a time. Mastery makes the style's moves work better in the cage.">
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="small dim">Coaching</span>
        <Seg value={focus} onChange={setFocus} options={[{ v: "off", label: "Off" }, { v: "strike", label: "Striking style" }, { v: "grapple", label: "Grappling style" }]} />
        {week && <span className="small"><b className="good">+{(week.after - week.before).toFixed(1)}</b> a week with this plan</span>}
        {focus !== "off" && !week && <span className="small warn">No sessions in this week build it.</span>}
      </div>
      <div className="grid">
        <div className="c6">{card("strike")}</div>
        <div className="c6">{card("grapple")}</div>
      </div>
      {picking && (
        <div style={{ marginTop: 14 }}>
          <div className="label" style={{ marginBottom: 6 }}>Pick a {picking === "strike" ? "striking" : "grappling"} style · fit with {f.surname}'s attributes</div>
          <div className="style-pick">
            {options.map(({ x, fit }) => {
              const cur = (picking === "strike" ? st.s : st.g) === x.id;
              const back = st.known?.[x.id];
              return (
                <button key={x.id} className={`style-opt${cur ? " on" : ""}`} disabled={cur} onClick={() => choose(x.id)}>
                  <span className="n">{x.name} <span className="small dim">· {x.from}</span>{x.arts.includes(f.base) ? <span className="badge info" style={{ marginLeft: 6 }}>Background</span> : null}{back !== undefined ? <span className="badge" style={{ marginLeft: 6 }}>Known: {Math.round(back)}</span> : null}{cur ? <span className="badge gold" style={{ marginLeft: 6 }}>Current</span> : null}</span>
                  <span className="fit">fit {fit}%</span>
                  <span className="d">{x.desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Panel>
  );
}
