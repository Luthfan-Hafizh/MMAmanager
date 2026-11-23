import { useEffect, useRef, useState } from "react";
import { fmtDate } from "../../core/time";
import { compatible, deleteSave, exportWorld, importFile, listSaves, loadWorld, type SaveMeta } from "../../state/persist";
import { setBusy, setWorld, toast } from "../../state/store";
import { Logo } from "../icons";
import { go } from "../router";
import { Panel } from "../components";

export function Title() {
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const refresh = () => listSaves().then(setSaves);
  useEffect(() => {
    void refresh();
  }, []);
  const load = async (id: string) => {
    setBusy("Loading the career…");
    try {
      const w = await loadWorld(id);
      if (!w) throw new Error("Save not found.");
      setWorld(w);
      go("/home");
    } catch (e) {
      toast(String((e as Error).message), "bad");
    } finally {
      setBusy(null);
    }
  };
  const onImport = async (f: File) => {
    try {
      const w = await importFile(f);
      setWorld(w);
      go("/home");
      toast("Career imported.", "good");
    } catch (e) {
      toast(String((e as Error).message), "bad");
    }
  };
  return (
    <div className="title-screen">
      <div className="title-box">
        <div className="title-hero">
          <div className="row" style={{ marginBottom: 18 }}>
            <Logo size={44} />
            <span className="disp up dim" style={{ fontSize: 14, letterSpacing: "0.2em" }}>Version 4 · rebuilt from zero</span>
          </div>
          <h1>
            MMA <span>Manager</span>
          </h1>
          <p>
            Build a fighter from the amateur circuit to a UFC title, or run a management stable. A living world of real promotions, the real UFC and PFL rosters, an engine tuned to the UFC's own numbers, and contracts, camps and weight cuts that work the way the sport does.
          </p>
          <div className="feature-list">
            <div>The real UFC (663 fighters) and PFL (305) rosters, rankings and champions</div>
            <div>Eight regions of real regional, local and amateur promotions</div>
            <div>Round-by-round engine: 30% KOs, 19% submissions, 50% decisions at UFC level</div>
            <div>Ten-point-must judges, 10-8 rounds, split decisions</div>
            <div>Fight plans with a dozen instructions and live corner calls</div>
            <div>Weekly training, fight camps, weight cuts and the scale</div>
            <div>Show and win money, 2026 bonuses, fines, tax and manager cuts</div>
            <div>Elo-style rankings, as the UFC introduced in 2026</div>
          </div>
        </div>
        <div className="stack">
          <Panel title="Play">
            <div className="stack">
              <button className="btn primary lg" onClick={() => go("/new")}>
                New career
              </button>
              <div className="row">
                <button className="btn" onClick={() => file.current?.click()}>
                  Import a save file
                </button>
                <input ref={file} type="file" accept=".json,.gz,application/json" hidden onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
              </div>
            </div>
          </Panel>
          <Panel title="Saved careers" flush>
            {saves === null ? (
              <div className="empty">Looking for saves…</div>
            ) : saves.length === 0 ? (
              <div className="empty">
                <b>No careers yet</b>Start one: it saves itself in this browser.
              </div>
            ) : (
              saves.map((s) => (
                <div className="save-row" key={s.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="disp up" style={{ fontSize: 17, fontWeight: 700 }}>{s.who}</div>
                    <div className="small dim">
                      {s.mode === "manager" ? "Manager" : "Fighter"} career · {fmtDate(s.day)} · saved {new Date(s.savedAt).toLocaleString()}
                    </div>
                  </div>
                  {compatible(s) ? (
                    <button className="btn primary sm" onClick={() => load(s.id)}>
                      Continue
                    </button>
                  ) : (
                    <span className="badge bad">Old version</span>
                  )}
                  <button
                    className="btn sm"
                    onClick={async () => {
                      const w = await loadWorld(s.id);
                      if (w) exportWorld(w);
                    }}
                  >
                    Export
                  </button>
                  <button
                    className="btn sm danger"
                    onClick={async () => {
                      if (!confirm(`Delete the career of ${s.who}? This cannot be undone.`)) return;
                      await deleteSave(s.id);
                      void refresh();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </Panel>
          <p className="tiny dim">
            An unofficial fan game, not affiliated with or endorsed by the UFC, the PFL or any promotion named. Real names are used for identification only.
          </p>
        </div>
      </div>
    </div>
  );
}
