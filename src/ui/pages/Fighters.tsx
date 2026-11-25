import { useMemo, useState } from "react";
import { ageYears } from "../../core/time";
import { REGIONS, countryOf, type RegionId } from "../../data/countries";
import { DIVISIONS, DIVISION_IDS, type DivisionId } from "../../data/divisions";
import { PROMOTIONS, PROMO_IDS, type PromoId } from "../../data/promotions";
import { ovr, styleOf } from "../../model/attributes";
import type { Fighter } from "../../model/types";
import { recordText } from "../../world/core";
import { useWorld } from "../../state/store";
import { go } from "../router";
import { FighterLink, Ovr, PromoBadge, Table, type Col } from "../components";

export function Fighters() {
  const w = useWorld();
  const [q, setQ] = useState("");
  const [div, setDiv] = useState<DivisionId | "all">("all");
  const [promo, setPromo] = useState<PromoId | "all" | "free">("all");
  const [region, setRegion] = useState<RegionId | "all">("all");
  const [maxAge, setMaxAge] = useState(45);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return Object.values(w.fighters).filter(
      (f) =>
        f.status === "active" &&
        (div === "all" || f.div === div) &&
        (promo === "all" ? true : promo === "free" ? !f.promo : f.promo === promo) &&
        (region === "all" || countryOf(f.country).region === region) &&
        ageYears(f.birth, w.day) <= maxAge &&
        (!s || `${f.first} ${f.surname} ${f.nick ?? ""}`.toLowerCase().includes(s)),
    );
  }, [w, q, div, promo, region, maxAge, w.stamp]);
  const cols: Col<Fighter>[] = [
    { key: "name", label: "Fighter", render: (f) => <FighterLink w={w} id={f.id} rank />, sort: (f) => f.surname },
    { key: "promo", label: "Promotion", render: (f) => <PromoBadge p={f.promo} />, sort: (f) => (f.promo ? PROMOTIONS[f.promo].prestige : 0) },
    { key: "div", label: "Division", render: (f) => DIVISIONS[f.div].short, sort: (f) => DIVISIONS[f.div].order },
    { key: "rec", label: "Record", render: (f) => (f.amateur ? `${f.am.w}-${f.am.l} am` : recordText(f)), sort: (f) => f.rec.w - f.rec.l, align: "r" },
    { key: "age", label: "Age", render: (f) => ageYears(f.birth, w.day), sort: (f) => -f.birth, align: "r" },
    { key: "style", label: "Style", render: (f) => <span className="small">{styleOf(f.attrs)}</span> },
    { key: "pop", label: "Pop", render: (f) => Math.round(f.pop), sort: (f) => f.pop, align: "r", title: "Popularity" },
    { key: "ovr", label: "Ovr", render: (f) => <Ovr v={ovr(f.attrs)} sm />, sort: (f) => ovr(f.attrs), align: "c" },
  ];
  return (
    <div className="stack">
      <div className="row">
        <input className="input" placeholder="Search a name" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
        <select className="input" value={div} onChange={(e) => setDiv(e.target.value as DivisionId | "all")}>
          <option value="all">All weight classes</option>
          {DIVISION_IDS.map((d) => <option key={d} value={d}>{DIVISIONS[d].name}</option>)}
        </select>
        <select className="input" value={promo} onChange={(e) => setPromo(e.target.value as PromoId | "all" | "free")}>
          <option value="all">All promotions</option>
          <option value="free">Free agents</option>
          {PROMO_IDS.map((p) => <option key={p} value={p}>{PROMOTIONS[p].name}</option>)}
        </select>
        <select className="input" value={region} onChange={(e) => setRegion(e.target.value as RegionId | "all")}>
          <option value="all">All regions</option>
          {Object.values(REGIONS).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <label className="row small dim">Max age {maxAge}<input type="range" min={18} max={45} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} style={{ width: 120 }} /></label>
        <span className="small dim">{rows.length} fighters</span>
      </div>
      <div className="panel">
        <Table cols={cols} rows={rows} rowKey={(f) => f.id} onRow={(f) => go(`/fighter/${f.id}`)} highlight={(f) => !!f.ctrl} initial={{ key: "ovr" }} page={50} />
      </div>
    </div>
  );
}
