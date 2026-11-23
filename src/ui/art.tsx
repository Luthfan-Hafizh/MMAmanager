// Drawn pieces of the broadcast look: the fighter figure that stands in for an
// athlete photo, the hero band, accuracy donuts and the body-target figure.

import type { ReactNode } from "react";

/** Giant outlined type that fills a hero's empty side: a rank, a number, a surname. */
export function Mark({ children, gold, label, sub }: { children: ReactNode; gold?: boolean; label?: ReactNode; sub?: ReactNode }) {
  return (
    <div className={`mark${gold ? " gold" : ""}`}>
      <div className="mark-big">{children}</div>
      {label && <div className="mark-label">{label}</div>}
      {sub && <div className="mark-sub">{sub}</div>}
    </div>
  );
}

/** The dark hero band every page opens with. */
export function Band({ eyebrow, title, first, sub, right, children, tabs, word }: { eyebrow?: ReactNode; title: ReactNode; first?: ReactNode; sub?: ReactNode; right?: ReactNode; children?: ReactNode; tabs?: ReactNode; word?: string }) {
  return (
    <section className="band">
      {word && <div className="band-word" aria-hidden="true">{word}</div>}
      <div className="wrap">
        <div className={right ? "band-grid" : undefined}>
          <div>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h1>
              {first && <span className="first">{first}</span>}
              {title}
            </h1>
            {sub && <div className="sub">{sub}</div>}
            {children}
          </div>
          {right && <div>{right}</div>}
        </div>
        {tabs}
      </div>
    </section>
  );
}

/** An accuracy donut, as UFC.com draws them. */
export function Donut({ value, size = 96, color = "var(--red)" }: { value: number; size?: number; color?: string }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${Math.round(v * 100)}%`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--sheet-3)" strokeWidth="14" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="14" strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 50 50)" />
    </svg>
  );
}

/** Where the strikes land: head, body and legs on a standing figure. */
export function BodyTarget({ head, body, leg }: { head: number; body: number; leg: number }) {
  const total = head + body + leg || 1;
  const pct = (v: number) => Math.round((v / total) * 100);
  const shade = (v: number) => `rgba(210, 32, 31, ${0.18 + 0.8 * (v / total)})`;
  return (
    <div className="row" style={{ gap: 18, alignItems: "center" }}>
      <svg width="86" height="170" viewBox="0 0 86 170" role="img" aria-label={`Head ${pct(head)}%, body ${pct(body)}%, legs ${pct(leg)}%`}>
        <circle cx="43" cy="17" r="13" fill={shade(head)} />
        <path d="M22 36 Q43 30 64 36 L70 92 L16 92 Z" fill={shade(body)} />
        <path d="M14 40 L6 88 L12 90 L22 50 Z M72 40 L80 88 L74 90 L64 50 Z" fill="var(--sheet-3)" />
        <path d="M18 94 L41 94 L38 166 L26 166 Z M45 94 L68 94 L60 166 L48 166 Z" fill={shade(leg)} />
      </svg>
      <div className="stack" style={{ gap: 10, flex: 1 }}>
        {[
          ["Head", head],
          ["Body", body],
          ["Legs", leg],
        ].map(([k, v]) => (
          <div key={k as string} className="spread" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
            <span className="label" style={{ color: "var(--ink-2)" }}>{k}</span>
            <span><b className="num">{v as number}</b> <span className="dim small">{pct(v as number)}%</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
