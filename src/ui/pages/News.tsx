import { useState } from "react";
import { fmtDate } from "../../core/time";
import { PROMOTIONS } from "../../data/promotions";
import type { News as NewsItem, NewsKind, World } from "../../model/types";
import { useWorld } from "../../state/store";
import { Link } from "../router";
import { Empty, Panel, Seg } from "../components";

const KINDS: { v: NewsKind | "all"; label: string }[] = [
  { v: "all", label: "All" },
  { v: "title", label: "Titles" },
  { v: "result", label: "Results" },
  { v: "upset", label: "Upsets" },
  { v: "signing", label: "Signings" },
  { v: "release", label: "Releases" },
  { v: "booking", label: "Bookings" },
  { v: "retire", label: "Retirements" },
];

/** Stories shown at a time; "Show more" adds as many again. */
const PAGE = 40;

/**
 * A headline: your own fighters, your promotion, the UFC, the PFL and the Contender
 * Series, a regional title changing hands, and news of the sport itself. The rest
 * (an amateur main event, a local show's title) waits under "Every promotion".
 */
export function isHeadline(w: World, n: NewsItem): boolean {
  if (n.fighters?.some((id) => w.fighters[id]?.ctrl)) return true;
  if (!n.promo) return true;
  if (w.career.fighters.some((id) => w.fighters[id]?.promo === n.promo)) return true;
  const tier = PROMOTIONS[n.promo].tier;
  return tier === "major" || tier === "league" || tier === "tryout" || (tier === "regional" && n.kind === "title");
}

export function News() {
  const w = useWorld();
  const [kind, setKind] = useState<NewsKind | "all">("all");
  const [promo, setPromo] = useState<"all" | "top">("top");
  const [shown, setShown] = useState(PAGE);
  const items = w.news.filter((n) => (kind === "all" || n.kind === kind) && (promo === "all" || isHeadline(w, n)));
  // A heading for each day, the stories of the day under it.
  const days: { day: number; list: NewsItem[] }[] = [];
  for (const n of items.slice(0, shown)) {
    const last = days[days.length - 1];
    if (last && last.day === n.day) last.list.push(n);
    else days.push({ day: n.day, list: [n] });
  }
  return (
    <div className="stack">
      <div className="row">
        <Seg value={kind} onChange={(v) => { setKind(v); setShown(PAGE); }} options={KINDS} />
        <Seg value={promo} onChange={(v) => { setPromo(v); setShown(PAGE); }} options={[{ v: "top", label: "Headlines" }, { v: "all", label: "Every promotion" }]} />
      </div>
      <Panel title="News" hint={`${items.length} ${items.length === 1 ? "story" : "stories"}`} flush>
        {items.length === 0 && <Empty title="No news" />}
        {days.map((g) => (
          <div key={g.day}>
            <div className="news-date">{fmtDate(g.day, { dow: true })}</div>
            {g.list.map((n) => (
              <div key={n.id} className={`list-row news-row${n.fighters?.some((id) => w.fighters[id]?.ctrl) ? " mine" : ""}`}>
                {n.promo && <span className="badge">{PROMOTIONS[n.promo].short}</span>}
                <span className={`news-text${n.big ? " lead" : " muted"}`}>{n.text}</span>
                {n.ev && <Link to={`/event/${n.ev}`} className="btn sm ghost">Card</Link>}
              </div>
            ))}
          </div>
        ))}
        {items.length > shown && (
          <div className="news-more">
            <button type="button" className="btn" onClick={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, items.length - shown)} more</button>
            <span className="small dim">{shown} of {items.length}</span>
          </div>
        )}
      </Panel>
    </div>
  );
}
