import { useMemo, useState } from "react";
import { money } from "../../core/util";
import { countryOf, REGIONS, type RegionId } from "../../data/countries";
import { DIVISIONS, neighbourDivisions } from "../../data/divisions";
import type { Fighter, World } from "../../model/types";
import { canMove, gymFee, gymOptions, gymQuality, joinGym, moveDivision, walkRange } from "../../career/moves";
import { changed, toast } from "../../state/store";
import { Link } from "../router";
import { Flag, Modal, Panel, Seg } from "../components";

export function GymPanel({ w, f }: { w: World; f: Fighter }) {
  const [open, setOpen] = useState(false);
  const g = w.gyms[f.gym];
  const fc = w.career.fc[f.id];
  return (
    <Panel title="Gym" acts={<button className="btn sm" onClick={() => setOpen(true)}>Find a new gym</button>}>
      {g ? (
        <>
          <div className="dx" style={{ fontSize: 28 }}>{g.name}</div>
          <div className="small dim row tight" style={{ marginTop: 4 }}><Flag code={g.country} /> {g.city}, {countryOf(g.country).name} · head coach {g.headCoach}</div>
          <div className="stat-tiles" style={{ marginTop: 14 }}>
            <div className="tile"><div className="k">Room</div><div className="v">{gymQuality(g)}</div></div>
            <div className="tile"><div className="k">Striking</div><div className="v">{g.coaches.striking}</div></div>
            <div className="tile"><div className="k">Wrestling</div><div className="v">{g.coaches.wrestling}</div></div>
            <div className="tile"><div className="k">Grappling</div><div className="v">{g.coaches.grappling}</div></div>
            <div className="tile"><div className="k">Strength</div><div className="v">{g.coaches.sc}</div></div>
            <div className="tile"><div className="k">Purse cut</div><div className="v">{g.fee}%</div></div>
          </div>
          {fc?.adapt ? <p className="small warn" style={{ marginTop: 10 }}>Settling in: {fc.adapt} more week{fc.adapt === 1 ? "" : "s"} at reduced training speed.</p> : null}
        </>
      ) : (
        <p className="muted">No gym.</p>
      )}
      {open && <GymBrowser w={w} f={f} onClose={() => setOpen(false)} />}
    </Panel>
  );
}

function GymBrowser({ w, f, onClose }: { w: World; f: Fighter; onClose: () => void }) {
  const [region, setRegion] = useState<RegionId | "all">(countryOf(f.country).region);
  const [q, setQ] = useState("");
  const list = useMemo(() => gymOptions(w, f), [w, f, w.stamp]);
  const shown = list.filter((o) => (region === "all" || countryOf(o.g.country).region === region) && (!q || o.g.name.toLowerCase().includes(q.toLowerCase()))).slice(0, 60);
  return (
    <Modal title="Find a gym" onClose={onClose}>
      <div className="row" style={{ marginBottom: 10 }}>
        <select className="input" value={region} onChange={(e) => setRegion(e.target.value as RegionId | "all")}>
          <option value="all">Every region</option>
          {Object.values(REGIONS).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <input className="input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
        <table className="tbl compact">
          <thead><tr><th>Gym</th><th className="c">Room</th><th className="c">Cut</th><th className="r">Move</th><th className="r">Chance</th><th /></tr></thead>
          <tbody>
            {shown.map((o) => (
              <tr key={o.g.id}>
                <td>
                  <b>{o.g.name}</b>
                  <div className="tiny dim row tight"><Flag code={o.g.country} /> {o.g.city} · {o.members} fighters{o.best ? <> · best: <Link to={`/fighter/${o.best.id}`}>{o.best.surname}</Link></> : null}</div>
                </td>
                <td className="c"><b className="num" style={{ fontSize: 18 }}>{o.quality}</b></td>
                <td className="c">{gymFee(o.g)}%</td>
                <td className="r">{money(o.cost)}</td>
                <td className="r" title={o.why}>{Math.round(o.chance * 100)}%</td>
                <td className="r">
                  <button className="btn sm" onClick={() => { toast(joinGym(w, f, o.g.id)); changed(); onClose(); }}>Ask</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny dim" style={{ marginTop: 10 }}>Better rooms make better fighters: coach quality sets how fast each session improves you. Elite gyms are choosy and take a bigger cut. Moving costs money and a few weeks of settling in.</p>
    </Modal>
  );
}

export function WeightPanel({ w, f }: { w: World; f: Fighter }) {
  const fc = w.career.fc[f.id];
  const d = DIVISIONS[f.div];
  const [lo, hi] = walkRange(f.div);
  const target = fc?.walkTarget ?? f.walk;
  const nb = neighbourDivisions(f.div);
  const cut = ((f.walk - d.limit) / f.walk) * 100;
  const move = (to: typeof f.div) => {
    const chk = canMove(w, f, to);
    if (!chk.ok) return toast(chk.why, "bad");
    if (chk.vacates && !confirm("Moving divisions vacates your title. Go ahead?")) return;
    toast(moveDivision(w, f, to), "good");
    changed();
  };
  return (
    <Panel title="Weight class">
      <div className="spread">
        <div>
          <div className="dx" style={{ fontSize: 28 }}>{d.name}</div>
          <div className="small dim">{d.limit} lb limit · walking at {f.walk} lb · a {cut.toFixed(1)}% cut</div>
        </div>
        <span className={`badge ${cut > 12 ? "bad" : cut > 9 ? "" : "good"}`}>{cut > 12 ? "Hard cut" : cut > 9 ? "Normal cut" : "Easy cut"}</span>
      </div>
      <hr className="sep" />
      <div className="label">Walking weight target</div>
      <div className="row" style={{ marginTop: 6 }}>
        <input type="range" min={lo} max={hi} value={target} onChange={(e) => { if (fc) { fc.walkTarget = Number(e.target.value); changed(); } }} style={{ flex: 1 }} aria-label="Walking weight target" />
        <b className="num" style={{ fontSize: 20, minWidth: 64, textAlign: "right" }}>{target} lb</b>
      </div>
      <p className="tiny dim">Bulking adds about 1.5 lb a month and a little strength; slimming down takes off about 2.5 lb a month. A lighter walking weight makes the cut easier, and makes moving down possible.</p>
      <div className="row" style={{ marginTop: 8 }}>
        {nb.down && <button className="btn sm" onClick={() => move(nb.down!)} title={canMove(w, f, nb.down).why}>Down to {DIVISIONS[nb.down].name.replace("Women's ", "")}</button>}
        {nb.up && <button className="btn sm" onClick={() => move(nb.up!)} title={canMove(w, f, nb.up).why}>Up to {DIVISIONS[nb.up].name.replace("Women's ", "")}</button>}
      </div>
      {nb.down && !canMove(w, f, nb.down).ok && <p className="tiny warn" style={{ marginTop: 6 }}>{canMove(w, f, nb.down).why}</p>}
    </Panel>
  );
}

export { Seg };
