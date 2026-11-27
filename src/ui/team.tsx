// Your team: the manager (or the coach, or the agency's analyst), what the
// promotions would pay you, the questions you can put to them with a straight
// answer laid out like a briefing, and the standing orders.

import { useState } from "react";
import { money } from "../core/util";
import { PROMOTIONS, type PromoId } from "../data/promotions";
import type { Fighter, World } from "../model/types";
import { adviserOf, ask, QUESTIONS } from "../career/advisor";
import { fireManager, hireManager, valueOf } from "../career/offers";
import { changed, toast } from "../state/store";
import { confirmBox } from "./components";

const STYLE_TEXT = { bold: "Likes a gamble", careful: "Protects the record", steady: "Plays it straight" } as const;

const HIRE = [
  { q: 30, name: "Local manager", cut: 10, does: "Gets you on local and regional cards and sorts the paperwork." },
  { q: 55, name: "Established agency", cut: 15, does: "Real leverage at the table, sponsors that call back, advice on every offer." },
  { q: 80, name: "Elite agency", cut: 20, does: "The big doors open. Only takes names with a following." },
];

function initials(name: string): string {
  return name.split(/[\s,]+/).filter((x) => x && x[0] === x[0].toUpperCase()).slice(0, 2).map((x) => x[0]).join("") || "?";
}

/** The first sentence carries the verdict; the rest is the reasoning. */
function split(a: string): [string, string] {
  const m = a.match(/^(.+?[.!?])(\s+[\s\S]*)?$/);
  return m ? [m[1], (m[2] ?? "").trim()] : [a, ""];
}

export function TeamPanel({ w, f }: { w: World; f: Fighter }) {
  const fc = w.career.fc[f.id];
  const [qid, setQid] = useState<string | null>(null);
  const adv = adviserOf(w, f);
  const m = w.career.mode === "fighter" ? fc?.manager : null;
  const answer = qid ? ask(w, f, qid) : null;
  const promos: PromoId[] = ["ufc", "pfl"];
  if (f.promo && !promos.includes(f.promo) && PROMOTIONS[f.promo].tier !== "amateur") promos.push(f.promo);
  const values = promos.map((p) => ({ p, v: valueOf(w, f, p) }));
  const top = Math.max(1, ...values.map((x) => x.v));
  const who = adv.role === "manager" ? "your manager" : adv.role === "coach" ? "head coach" : "the agency's analyst";
  const [lead, rest] = answer ? split(answer.a) : ["", ""];
  return (
    <section className="panel team">
      <div className="panel-h">
        <h3>Your team</h3>
        <span className="hint">{w.career.mode === "fighter" ? (m ? `${m.cut}% of purses and sponsorship` : "No manager yet") : "Your agency"}</span>
      </div>
      <div className="panel-b">
        {w.career.mode === "fighter" &&
          (m ? (
            <div className="team-head">
              <div className="team-av" aria-hidden="true">{initials(m.person ?? m.name)}</div>
              <div className="team-id">
                <div className="label">Manager</div>
                <div className="team-name">{m.person ?? m.name}</div>
                <div className="team-tags">
                  <span>{m.name}</span>
                  <span>{m.cut}% cut</span>
                  <span>{STYLE_TEXT[m.style ?? "steady"]}</span>
                </div>
              </div>
              <button className="btn ghost sm team-part" onClick={() => { void confirmBox({ title: `Part ways with ${m.person ?? m.name}?`, body: `You keep the commission, but lose the negotiating and the sponsors.`, ok: "Part ways", danger: true }).then((yes) => { if (yes) { fireManager(w, f); changed(); } }); }}>Part ways</button>
              <div className="team-meter">
                <span>At the table</span>
                <div className="bar thin"><i style={{ width: `${m.quality}%` }} /></div>
                <b>{m.quality}</b>
              </div>
            </div>
          ) : (
            <div className="team-hire">
              <p className="small muted">Without a manager you keep the commission, but promotions open lower, sponsors call less, and only your head coach advises you, on the fights and not the money. Managers in MMA take 10 to 20%.</p>
              <div className="hire-grid">
                {HIRE.map((h) => {
                  const locked = h.q >= 80 && f.pop < 30;
                  return (
                    <button key={h.q} className="hire" disabled={locked} title={locked ? "Elite agencies only take names with a following (popularity 30)" : ""} onClick={() => { toast(hireManager(w, f, h.q), "good"); changed(); }}>
                      <span className="hire-cut">{h.cut}%</span>
                      <span className="hire-name">{h.name}</span>
                      <span className="hire-does">{locked ? "Needs a following first." : h.does}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

        <div className="team-sec">
          <div className="label">What promotions would pay, to show</div>
          <div className="worth-grid">
            {values.map(({ p, v }) => (
              <div key={p} className={`worth${f.promo === p ? " here" : ""}`}>
                <span className="worth-p">{PROMOTIONS[p].short}</span>
                <b>{money(v)}</b>
                <span className="worth-bar"><i style={{ width: `${Math.round((v / top) * 100)}%` }} /></span>
              </div>
            ))}
          </div>
          <p className="tiny dim" style={{ marginTop: 6 }}>Follows the level, the ranking, popularity and the run you're on. Rival offers push a promotion's ceiling up.</p>
        </div>

        <div className="team-sec">
          <div className="label">Ask {adv.name.split(/[ ,]/)[0]}</div>
          <div className="ask-grid">
            {QUESTIONS.map((q) => (
              <button key={q.id} className={`ask-q${qid === q.id ? " on" : ""}`} aria-pressed={qid === q.id} onClick={() => setQid(qid === q.id ? null : q.id)}>
                {q.q}
              </button>
            ))}
          </div>
          {answer ? (
            <div className="brief" aria-live="polite">
              <div className="brief-h">
                <span className="brief-av" aria-hidden="true">{initials(adv.name)}</span>
                <span className="brief-who"><b>{adv.name}</b><span>{who}</span></span>
              </div>
              <p className="brief-q">{answer.q}</p>
              <p className="brief-a"><b>{lead}</b>{rest ? ` ${rest}` : ""}</p>
            </div>
          ) : (
            <p className="tiny dim" style={{ marginTop: 8 }}>Pick a question for a straight answer, from where things stand today.</p>
          )}
        </div>

        {fc && (
          <div className="team-sec">
            <div className="label">Standing orders</div>
            <label className="toggle">
              <input type="checkbox" role="switch" checked={!!fc.shortNotice} onChange={(e) => { fc.shortNotice = e.target.checked; changed(); }} />
              <span className="toggle-ui" aria-hidden="true" />
              <span className="toggle-t">
                <b>Short-notice calls</b>
                <span>The matchmakers can ring when someone pulls out, from three weeks to the day before, at the weight or a division up.</span>
              </span>
            </label>
          </div>
        )}
      </div>
    </section>
  );
}
