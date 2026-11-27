// Shared interface pieces.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { flagUrl, countryOf } from "../data/countries";
import { DIVISIONS, type DivisionId } from "../data/divisions";
import { PROMOTIONS, type PromoId } from "../data/promotions";
import { ATTR_GROUPS, ATTR_INFO, GROUP_NAMES, attrBand, ovr, stars as starsOf, type AttrGroup, type AttrKey } from "../model/attributes";
import type { Fact, Fighter, World } from "../model/types";
import { formOf, isInterim, rankOf, recordText } from "../world/core";
import { Link } from "./router";
import { money } from "../core/util";

export function Flag({ code, lg }: { code: string; lg?: boolean }) {
  const [bad, setBad] = useState(false);
  if (bad || !code) return <span className="badge" style={{ height: 14, padding: "0 3px", fontSize: 9 }}>{code}</span>;
  return <img className={`flag${lg ? " lg" : ""}`} src={flagUrl(code, lg ? 40 : 20)} alt={countryOf(code).name} title={countryOf(code).name} loading="lazy" onError={() => setBad(true)} />;
}

export function RankBadge({ w, f }: { w: World; f: Fighter }) {
  const r = rankOf(w, f);
  if (r === 0) return <span className="rank c" title="Champion">C</span>;
  if (isInterim(w, f)) return <span className="rank ic" title="Interim champion">IC</span>;
  if (r) return <span className="rank" title={`Ranked #${r}`}>{r}</span>;
  return null;
}

export function FighterLink({ w, id, rank, flag = true, short, record }: { w: World; id: string; rank?: boolean; flag?: boolean; short?: boolean; record?: boolean }) {
  const f = w.fighters[id];
  if (!f) return <span className="dim">Unknown</span>;
  return (
    <Link to={`/fighter/${f.id}`} className={`flink${f.ctrl ? " me" : ""}`}>
      {flag && <Flag code={f.country} />}
      {rank && <RankBadge w={w} f={f} />}
      <span className="nm">{short ? f.surname : `${f.first} ${f.surname}`.trim()}</span>
      {record && <span className="dim small nowrap">{recordText(f)}</span>}
    </Link>
  );
}

export function Form({ w, f, n = 5 }: { w: World; f: Fighter; n?: number }) {
  const form = formOf(w, f, n).reverse();
  if (!form.length) return <span className="dim small">{f.rec.w + f.rec.l + f.rec.d + f.am.w + f.am.l + f.am.d > 0 ? "None in this world yet" : "No fights yet"}</span>;
  return (
    <span className="form">
      {form.map((r, i) => (
        <i key={i} className={r}>{r === "NC" ? "N" : r}</i>
      ))}
    </span>
  );
}

export function Ovr({ v, sm }: { v: number; sm?: boolean }) {
  const band = v >= 88 ? "a-elite" : v >= 80 ? "a-great" : v >= 72 ? "a-good" : v >= 62 ? "a-fair" : v >= 52 ? "a-weak" : "a-poor";
  return <span className={`ovr${sm ? " sm" : ""} ${band}`}>{Math.round(v)}</span>;
}

export function Stars({ v }: { v: number }) {
  const s = starsOf(v);
  const full = Math.floor(s);
  const half = s - full >= 0.5;
  return (
    <span className="stars" title={`${s} stars`}>
      {"★".repeat(full)}
      {half ? "½" : ""}
      <span className="off">{"★".repeat(5 - full - (half ? 1 : 0))}</span>
    </span>
  );
}

export function AttrValue({ v, delta }: { v: number; delta?: number }) {
  return (
    <b className={`a-${attrBand(v)}`}>
      {Math.round(v)}
      {delta !== undefined && Math.abs(delta) >= 0.05 && <span className={`delta ${delta > 0 ? "good" : "bad"}`}>{delta > 0 ? "▲" : "▼"}</span>}
    </b>
  );
}

export function AttrGrid({ f, prev }: { f: Fighter; prev?: Record<AttrKey, number> }) {
  return (
    <div className="attr-cols">
      {(Object.keys(ATTR_GROUPS) as AttrGroup[]).map((g) => {
        const keys = ATTR_GROUPS[g] as readonly AttrKey[];
        const avg = keys.reduce((a, k) => a + f.attrs[k], 0) / keys.length;
        return (
          <div className="attr-group" key={g}>
            <h4>
              {GROUP_NAMES[g]} <span className={`a-${attrBand(avg)}`}>{avg.toFixed(1)}</span>
            </h4>
            {keys.map((k) => (
              <div className="attr" key={k} title={ATTR_INFO[k].desc}>
                <span>{ATTR_INFO[k].name}</span>
                <AttrValue v={f.attrs[k]} delta={prev ? f.attrs[k] - prev[k] : undefined} />
                <div className="meter-s"><i className={`bg-a-${attrBand(f.attrs[k])}`} style={{ width: `${(f.attrs[k] / 20) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function Panel({ title, hint, acts, children, flush, className }: { title?: ReactNode; hint?: ReactNode; acts?: ReactNode; children: ReactNode; flush?: boolean; className?: string }) {
  return (
    <section className={`panel ${className ?? ""}`}>
      {title !== undefined && (
        <div className="panel-h">
          <h3>{title}</h3>
          {hint && <span className="hint">{hint}</span>}
          {acts && <div className="acts">{acts}</div>}
        </div>
      )}
      <div className={`panel-b${flush ? " flush" : ""}`}>{children}</div>
    </section>
  );
}

export function Bar({ v, max = 100, kind, thin, title }: { v: number; max?: number; kind?: "red" | "gold" | "info" | "warn"; thin?: boolean; title?: string }) {
  const pct = Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className={`bar${thin ? " thin" : ""}${kind ? ` ${kind}` : ""}`} title={title}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg" role="radiogroup">
      {options.map((o) => (
        <button key={String(o.v)} className={o.v === value ? "on" : ""} onClick={() => onChange(o.v)} role="radio" aria-checked={o.v === value}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * A row that scrolls sideways when it doesn't fit (tabs, chips): the edges fade
 * while there's more to see, and the chosen item (".on") is kept in view, without
 * moving the page.
 */
export function ScrollRow({ className, active, label, children, style }: { className: string; active?: string; label?: string; children: ReactNode; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      el.dataset.more = el.scrollWidth - el.scrollLeft - el.clientWidth > 4 ? "1" : "";
      el.dataset.less = el.scrollLeft > 4 ? "1" : "";
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
      ro?.disconnect();
    };
  }, []);
  useEffect(() => {
    const el = ref.current;
    const on = el?.querySelector<HTMLElement>(".on");
    if (!el || !on || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: Math.max(0, on.offsetLeft - (el.clientWidth - on.offsetWidth) / 2), behavior: "instant" as ScrollBehavior });
  }, [active]);
  return (
    <div ref={ref} className={`${className} scroll-row`} aria-label={label} style={style}>
      {children}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <ScrollRow className="tabs" active={value}>
      {tabs.map((t) => (
        <button key={t.id} className={t.id === value ? "on" : ""} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </ScrollRow>
  );
}

export interface Col<R> {
  key: string;
  label: string;
  render: (r: R) => ReactNode;
  sort?: (r: R) => number | string;
  align?: "r" | "c";
  width?: number | string;
  title?: string;
}

/** A sortable table. `page`: that many rows at a time, with Previous and Next under it. */
export function Table<R>({ cols, rows, rowKey, onRow, highlight, initial, compact, limit, page }: { cols: Col<R>[]; rows: R[]; rowKey: (r: R) => string; onRow?: (r: R) => void; highlight?: (r: R) => boolean; initial?: { key: string; desc?: boolean }; compact?: boolean; limit?: number; page?: number }) {
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(initial ? { key: initial.key, desc: initial.desc ?? true } : null);
  const [at, setAt] = useState(0);
  const top = useRef<HTMLDivElement | null>(null);
  // A new filter or a new sort starts from the first page.
  useEffect(() => setAt(0), [rows, sort]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const c = cols.find((x) => x.key === sort.key);
    if (!c?.sort) return rows;
    const s = c.sort;
    return [...rows].sort((a, b) => {
      const x = s(a);
      const y = s(b);
      const d = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y));
      return sort.desc ? -d : d;
    });
  }, [rows, sort, cols]);
  const pages = page ? Math.max(1, Math.ceil(sorted.length / page)) : 1;
  const cur = Math.min(at, pages - 1);
  const shown = page ? sorted.slice(cur * page, (cur + 1) * page) : limit ? sorted.slice(0, limit) : sorted;
  const turn = (n: number) => {
    setAt(n);
    // Back to the top of the table, below the bars that stay on screen.
    const el = top.current;
    if (el) window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 120), behavior: "instant" as ScrollBehavior });
  };
  return (
    <>
    <div className="tbl-wrap" ref={top}>
      <table className={`tbl${compact ? " compact" : ""}`}>
        <thead>
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                className={`${c.sort ? "sortable" : ""} ${c.align ?? ""}`}
                style={c.width ? { width: c.width } : undefined}
                title={c.title}
                onClick={c.sort ? () => setSort((s) => (s && s.key === c.key ? { key: c.key, desc: !s.desc } : { key: c.key, desc: true })) : undefined}
                aria-sort={sort?.key === c.key ? (sort.desc ? "descending" : "ascending") : undefined}
              >
                {c.label}
                {sort?.key === c.key ? (sort.desc ? " ▾" : " ▴") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={rowKey(r)} className={`${onRow ? "click" : ""} ${highlight?.(r) ? "me" : ""}`} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map((c) => (
                <td key={c.key} className={c.align ?? ""}>
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {page && sorted.length > page && (
      <div className="tbl-pager">
        <span className="small dim">{(cur * page + 1).toLocaleString()}–{Math.min(sorted.length, (cur + 1) * page).toLocaleString()} of {sorted.length.toLocaleString()}</span>
        <div className="row">
          <button type="button" className="btn sm" disabled={cur === 0} onClick={() => turn(cur - 1)}>Previous</button>
          <span className="small">Page {cur + 1} of {pages}</span>
          <button type="button" className="btn sm" disabled={cur >= pages - 1} onClick={() => turn(cur + 1)}>Next</button>
        </div>
      </div>
    )}
    </>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

export function DivBadge({ d }: { d: DivisionId }) {
  return <span className="badge" title={DIVISIONS[d].name}>{DIVISIONS[d].short}</span>;
}

export function PromoBadge({ p }: { p: PromoId | null }) {
  if (!p) return <span className="badge">Free agent</span>;
  const def = PROMOTIONS[p];
  const cls = def.tier === "major" ? "red" : def.tier === "league" ? "gold" : def.tier === "tryout" ? "info" : "";
  return <span className={`badge ${cls}`} title={def.name}>{def.short}</span>;
}

export function Money({ v, sign }: { v: number; sign?: boolean }) {
  return <span className={v < 0 ? "bad" : sign && v > 0 ? "good" : ""}>{money(v, { sign })}</span>;
}

export function Spark({ points, w = 140, h = 36, color = "var(--accent)" }: { points: number[]; w?: number; h?: number; color?: string }) {
  if (points.length < 2) return <span className="dim small">Not enough data yet</span>;
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const span = hi - lo || 1;
  const xy = points.map((p, i) => [(i / (points.length - 1)) * (w - 4) + 2, h - 3 - ((p - lo) / span) * (h - 6)]);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg className="spark" width={w} height={h} role="img" aria-label={`Trend from ${lo.toFixed(0)} to ${hi.toFixed(0)}`}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="3" fill={color} />
    </svg>
  );
}

/**
 * A dialog over the page. It is drawn on the body, not inside the page: pages slide
 * in with a transform, and a fixed overlay inside a transformed element is placed
 * against that element instead of the screen, which centred the dialog on the whole
 * page, thousands of pixels down a long list. Escape closes it, and focus goes to the
 * dialog and back to where it was.
 */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("keydown", key);
    box.current?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", key);
      before?.focus?.({ preventScroll: true });
    };
  }, []);
  const dialog = (
    <div className="modal-back" onClick={onClose}>
      <div ref={box} tabIndex={-1} className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="panel-h">
          <h3>{title}</h3>
          <div className="acts">
            <button className="btn ghost sm" onClick={onClose} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="panel-b">{children}</div>
      </div>
    </div>
  );
  return typeof document === "undefined" ? dialog : createPortal(dialog, document.body);
}

export function OvrStars({ f }: { f: Fighter }) {
  const o = ovr(f.attrs);
  return (
    <span className="row tight">
      <Ovr v={o} sm />
      <Stars v={o} />
    </span>
  );
}

export function Versus({ label, a, b, fmt, higher = "good" }: { label: string; a: number; b: number; fmt?: (v: number) => string; higher?: "good" | "bad" | "none" }) {
  const f = fmt ?? ((v: number) => String(Math.round(v)));
  const total = Math.abs(a) + Math.abs(b) || 1;
  const better = higher === "none" ? 0 : higher === "good" ? a - b : b - a;
  return (
    <div>
      <div className="versus">
        <div className={`l ${better > 0 ? "good" : ""}`}>{f(a)}</div>
        <div className="m">{label}</div>
        <div className={`r ${better < 0 ? "good" : ""}`}>{f(b)}</div>
      </div>
      <div className="vbar">
        <div className="a" style={{ width: `${(Math.abs(a) / total) * 100}%` }} />
        <div className="b" style={{ width: `${(Math.abs(b) / total) * 100}%` }} />
      </div>
    </div>
  );
}

/** The key facts of a message or a situation, as a compact grid. */
export function Facts({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null;
  return (
    <dl className="facts">
      {facts.map((x, i) => (
        <div key={i} className={x.v.length > 46 ? "wide" : ""}>
          <dt>{x.k}</dt>
          <dd className={x.tone ?? ""}>{x.v}</dd>
        </div>
      ))}
    </dl>
  );
}
