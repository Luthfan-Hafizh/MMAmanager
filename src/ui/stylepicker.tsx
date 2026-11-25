// Picking how a fighter strikes or grapples: the families as chips that wrap (the fighter's own
// background first), the styles as tiles with how well each suits them, and a card
// for the chosen one: what it does in a fight, its trait profile, its signature
// techniques and what it is built on.

import { useEffect, useState } from "react";
import { ATTR_INFO, type AttrKey } from "../model/attributes";
import type { BaseArt } from "../data/styles";
import { TECHNIQUES } from "../data/techniques";
import {
  FIGHT_STYLES, GRAPPLE_GROUPS, STRIKE_GROUPS, TRAIT_NAMES, styleFit, stylesForArt,
  type StyleGroup, type StyleId, type TraitKey,
} from "../data/fightstyles";

type Tab = "own" | StyleGroup;

/** How well a style suits the fighter against the best one available: a label and five dots. */
function fitLabel(fit: number, best: number): { label: string; dots: number } {
  const gap = best - fit;
  if (gap <= 4) return { label: "Natural fit", dots: 5 };
  if (gap <= 10) return { label: "Good fit", dots: 4 };
  if (gap <= 18) return { label: "Fair fit", dots: 3 };
  if (gap <= 28) return { label: "Hard work", dots: 2 };
  return { label: "Uphill", dots: 1 };
}

export function StylePicker({ kind, art, value, attrs, onChange }: { kind: "strike" | "grapple"; art: BaseArt; value: StyleId; attrs: Record<AttrKey, number>; onChange: (id: StyleId) => void }) {
  const own = stylesForArt(art, kind);
  const groups = (kind === "strike" ? STRIKE_GROUPS : GRAPPLE_GROUPS).filter((g) => Object.values(FIGHT_STYLES).some((s) => s.kind === kind && s.group === g));
  const home: Tab = own.includes(value) ? "own" : FIGHT_STYLES[value].group;
  const [tab, setTab] = useState<Tab>(home);
  // A new background brings its own styles back to the front.
  useEffect(() => setTab(own.includes(value) ? "own" : FIGHT_STYLES[value].group), [art]);
  const all = Object.values(FIGHT_STYLES).filter((s) => s.kind === kind);
  const fits = Object.fromEntries(all.map((s) => [s.id, styleFit(attrs, s.id)])) as Record<StyleId, number>;
  const best = Math.max(...Object.values(fits));
  const list = tab === "own" ? own : all.filter((s) => s.group === tab).map((s) => s.id);
  const cur = FIGHT_STYLES[value];
  const mine = own.includes(value);
  const fit = fitLabel(fits[value], best);
  const traits = (Object.entries(cur.t) as [TraitKey, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <div className="sp">
      <div className="sp-fams" role="tablist" aria-label={kind === "strike" ? "Striking families" : "Grappling families"}>
        <button type="button" role="tab" aria-selected={tab === "own"} className={`sp-fam sp-fam-own${tab === "own" ? " on" : ""}${mine ? " sp-has" : ""}`} onClick={() => setTab("own")} title={mine ? "Your style is here" : undefined}>
          Your background<i>{own.length}</i>
        </button>
        {groups.map((g) => {
          const n = all.filter((s) => s.group === g).length;
          const here = !mine && cur.group === g;
          return (
            <button key={g} type="button" role="tab" aria-selected={tab === g} className={`sp-fam${tab === g ? " on" : ""}${here ? " sp-has" : ""}`} onClick={() => setTab(g)} title={here ? "Your style is here" : undefined}>
              {g === "Brazilian jiu-jitsu" ? "BJJ" : g}<i>{n}</i>
            </button>
          );
        })}
      </div>
      <div className="tiles sp-tiles" role="radiogroup" aria-label={kind === "strike" ? "How you strike" : "How you grapple"}>
        {list.map((id) => {
          const s = FIGHT_STYLES[id];
          const f = fitLabel(fits[id], best);
          return (
            <button key={id} type="button" role="radio" aria-checked={id === value} aria-label={`${s.name}, ${own.includes(id) ? "your background" : s.from}, ${f.label}`} title={s.desc} className={`tile sp-tile${id === value ? " on" : ""}`} onClick={() => onChange(id)}>
              <b>{s.name}</b>
              <span>{own.includes(id) ? "Your background" : s.from}</span>
              <i className="sp-dots" aria-hidden="true">{[1, 2, 3, 4, 5].map((n) => <em key={n} className={n <= f.dots ? "on" : ""} />)}</i>
            </button>
          );
        })}
        {list.length === 0 && <span className="small dim">Nothing here for this background: pick a family above.</span>}
      </div>
      <div className="sp-card">
        <div className="sp-head">
          <b>{cur.name}</b>
          <span className="sp-tag">{cur.from}</span>
          {mine && <span className="sp-tag sp-own">Your background: starts deeper</span>}
          <span className={`sp-fit d${fit.dots}`}>{fit.label}</span>
        </div>
        <p className="sp-desc">{cur.desc}</p>
        <div className="sp-cols">
          <div>
            <div className="label">In the fight</div>
            <ul className="sp-how">{cur.how.map((h) => <li key={h}>{h}</li>)}</ul>
          </div>
          <div>
            <div className="label">What it does</div>
            <div className="sp-traits">
              {traits.map(([k, v]) => (
                <div key={k} className="sp-trait">
                  <span>{TRAIT_NAMES[k]}</span>
                  <i><em style={{ width: `${Math.round(v * 100)}%` }} /></i>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="sp-foot">
          <span><b>Signature</b> {cur.tech.map((t) => TECHNIQUES[t].name).join(", ")}</span>
          <span><b>Built on</b> {cur.keys.map((k) => ATTR_INFO[k].name.toLowerCase()).join(", ")}</span>
        </div>
      </div>
    </div>
  );
}
