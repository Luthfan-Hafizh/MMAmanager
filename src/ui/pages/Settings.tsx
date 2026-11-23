import { useState } from "react";
import { exportWorld } from "../../state/persist";
import { save, setWorld, toast, useWorld } from "../../state/store";
import { go } from "../router";
import { Panel, Seg } from "../components";

export function Settings() {
  const w = useWorld();
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem("mmam:theme") ?? "light";
    } catch {
      return "light";
    }
  });
  const applyTheme = (t: string) => {
    setTheme(t);
    try {
      localStorage.setItem("mmam:theme", t);
    } catch {
      /* private mode */
    }
    if (t === "light") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  };
  return (
    <div className="grid">
      <div className="c6 stack">
        <Panel title="Appearance">
          <Seg value={theme} onChange={applyTheme} options={[{ v: "light", label: "Day" }, { v: "dark", label: "Night" }]} />
        </Panel>
        <Panel title="This career">
          <p className="muted">Careers save themselves in this browser after every Continue. Export a file to keep a copy or move to another device.</p>
          <div className="row">
            <button className="btn" onClick={() => { void save().then(() => toast("Saved.", "good")); }}>Save now</button>
            <button className="btn" onClick={() => exportWorld(w)}>Export save file</button>
            <button className="btn danger" onClick={() => { void save().then(() => { setWorld(null); go("/"); }); }}>Save and quit to the title screen</button>
          </div>
        </Panel>
      </div>
      <div className="c6">
        <Panel title="About the game">
          <div className="prose">
            <p>MMA Manager 4 is a rebuild from zero. The real UFC roster, rankings and official statistics come from a snapshot of 1 October 2026, the PFL's roster from 15 November 2026; everything after day one is simulated.</p>
            <p>The engine is calibrated to the UFC: about 30% of fights end by KO or TKO, 19% by submission and 50% go to the judges, with heavyweights finishing far more often than the women's strawweights. Pay follows the 2026 numbers: $12,000 to show and $12,000 to win for a UFC newcomer, $100,000 Fight and Performance of the Night bonuses and $25,000 for every finish.</p>
            <p className="small dim">Keyboard: Ctrl+Space continues.</p>
            <p className="small dim">An unofficial fan game, not affiliated with or endorsed by any promotion named.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
