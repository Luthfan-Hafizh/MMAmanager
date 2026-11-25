// Turning a fight down: the reasons, each with how the matchmaker will take it as
// things stand, and the relationship it is spent from.

import { PROMOTIONS } from "../data/promotions";
import type { FightOffer, World } from "../model/types";
import { declineChoices, rapport, rapportLabel, rapportTone, type DeclineReason } from "../career/promoter";

export function DeclinePicker({ w, o, onPick, onCancel }: { w: World; o: FightOffer; onPick: (r: DeclineReason) => void; onCancel: () => void }) {
  const choices = declineChoices(w, o);
  const r = rapport(w, o.fighter, o.promo);
  const tone = rapportTone(r);
  return (
    <div className="decline" role="group" aria-label="Why turn it down">
      <div className="decline-h">
        <b>Tell the matchmaker why</b>
        <span className="small">
          {PROMOTIONS[o.promo].short}: <span className={tone === "good" ? "good" : tone === "bad" ? "bad" : tone === "warn" ? "gold-t" : ""}>{rapportLabel(r).toLowerCase()} terms ({Math.round(r)})</span>
        </span>
      </div>
      <div className="decline-list">
        {choices.map((c) => (
          <button key={c.id} type="button" className={`decline-row ${c.tone}`} onClick={() => onPick(c.id)}>
            <span className="dr-say">
              <b>{c.label}</b>
              {c.best && <em>Best reason</em>}
            </span>
            <span className="dr-take">{c.take}</span>
            <span className="dr-cost">{c.raise ? "Asks for more" : c.cost ? `−${c.cost}` : "No cost"}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button type="button" className="btn sm ghost" onClick={onCancel}>Keep the offer</button>
        <span className="tiny dim">Whoever you turn down is off the table for about four months: the next offer is someone else.</span>
      </div>
    </div>
  );
}

/** Where a fighter stands with a promotion's matchmaker, and what moved it lately. */
export function RapportLine({ w, fighter, promo }: { w: World; fighter: string; promo: FightOffer["promo"] }) {
  const r = rapport(w, fighter, promo);
  const tone = rapportTone(r);
  return (
    <span className={`rapport ${tone ?? ""}`} title="Your working relationship with the matchmaker: taking fights, saving cards, winning and making weight build it; weak excuses, missed weight and unanswered offers wear it down.">
      Matchmaker: {rapportLabel(r).toLowerCase()} terms
    </span>
  );
}
