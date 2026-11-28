// How to play: the game in one page, from the first week to a world title.

import { Link } from "../router";
import { Band } from "../art";

interface Part {
  id: string;
  title: string;
  lines: (string | [string, string, string])[];
}

/** A line, or [text before, link label, route] for a line that ends in a link. */
const PARTS: Part[] = [
  {
    id: "week",
    title: "The week",
    lines: [
      "Continue moves the world on, up to a week at a time (Ctrl+Space does it from any page). It stops for anything that needs you: an offer, a contract, an injury in camp, media day, the weigh-ins, fight night.",
      ["Messages and decisions arrive in the ", "Inbox", "/inbox"],
      "A decision left unanswered is answered for you when it runs out, usually the careful way. The game saves by itself in a quiet moment and whenever you leave the tab.",
    ],
  },
  {
    id: "fighter",
    title: "Your fighter",
    lines: [
      "Attributes run from 1 to 20 and add up to the overall. A fighter grows toward a hidden ceiling until the prime, in the late twenties, and fades after it; scouting words on the fighter page hint at the room left.",
      ["Ten sessions a week, an intensity and a technique to drill are set on ", "Training", "/training"],
      "Better coaches make each session count for more, and moving gyms costs money and a few weeks of settling in. The walking weight drifts toward the target you set: a lighter one makes the cut easier, a heavier one adds strength.",
      "Fighting styles (one striking, one grappling) shape how a fighter fights and are trained like attributes; switching keeps the old one in case you come back.",
    ],
  },
  {
    id: "ladder",
    title: "The road to a title",
    lines: [
      "Most careers start on an IMMAF amateur circuit, turn pro on a local show, and move up to the region's promotion, with rankings and a belt. From there: a Contender Series invitation, a direct UFC signing for a champion with a run of defences, or the PFL.",
      "Prospects from Asia and Oceania can be invited to Road to UFC: four brackets of eight every year, the opening round in May and the semifinals in August in Shanghai, the final on a UFC card, and a UFC contract for each winner. In a bracket, there are no other fights until you're out.",
      "Retired fighters sometimes come back: a few a year, older for the time away.",
      "The matchmaker offers fights; turning them down has reasons and costs a little goodwill. When someone pulls out late the phone may ring with a short-notice call: less camp, more money, and the matchmaker remembers who said yes.",
      ["Call out a name or talk about a fight on ", "Media", "/media"],
    ],
  },
  {
    id: "camp",
    title: "Camp and fight week",
    lines: [
      ["A signed fight starts the camp. Set the fight plan (the style, the instructions, a plan B) on ", "Next fight", "/fight"],
      "Bring in partners who fight like the opponent (his striking, or his wrestling and grappling): what they copy is no surprise on the night. The coaches say which, from the game plan they expect.",
      "Fight week brings media day and, for big fights, a press conference: what you say changes the hype, the rivalry and a little of the preparation. Miss weight at the scale and you lose part of the purse; a champion who misses is stripped.",
    ],
  },
  {
    id: "night",
    title: "Fight night",
    lines: [
      "Watch it live or simulate it. Live, the corner calls what it sees (answer with keys 1 to 3, or let the corner or instinct decide), you change what your fighter does round by round, and between rounds you use the minute and adjust the plan.",
      "Fouls happen: a warning first, then a point off every card; an accidental foul that ends a fight early is a no contest, a deliberate one a disqualification.",
      "Leave the fight screen and the fight waits, paused, where you left it, even after a reload. The result is saved the moment the fight ends.",
    ],
  },
  {
    id: "money",
    title: "Contracts and money",
    lines: [
      "A contract is a number of fights at a show and a win purse. Out of every purse come the gym's cut, the manager's, licence fees, travel and tax; the UFC adds bonuses and fight-week pay.",
      ["Deals, renewals, rival offers and your manager's advice are on ", "Contracts", "/contracts"],
      "A champion from a bigger stage is promised a title fight on arrival, and the UFC approaches fighters before their contracts run out.",
      "Champions, top-five contenders and the names that sell can ask for clauses at the table: a rematch if the belt is lost, points of the pay-per-view, a deal without the champion's clause (which otherwise keeps a champion on a fight at a time when the deal is done), and at the PFL a UFC out clause. With the money in the bank, a contract can be bought out to sign elsewhere, or to start a deal already signed for later.",
      ["Spare money can go into investments, or into a gym of your own with no cut from the purses (its members pay more the more famous you are; sell it whenever you like), on ", "Money", "/finances"],
    ],
  },
  {
    id: "rank",
    title: "Rankings and belts",
    lines: [
      "Rankings work like the UFC's rating model: who you beat counts most, a finish adds a little, activity helps, and a winner always moves above the fighter beaten. A win over a ranked fighter a division away ranks you there too.",
      "Champions only fight for their belts; a champion out long enough gets an interim title made, and one away too long is stripped. Every January the year's awards are handed out.",
      "In the UFC the title fights go on the numbered cards. After a defence the champion names the next challenger from the cage, or, with a defence behind them or a big name, calls out the champion a weight up (or down): if the promotion makes it and the champion wins, two belts, and one has to be given up.",
      ["Lineages, records and the Hall of Fame are on ", "Legacy", "/legacy"],
    ],
  },
  {
    id: "manager",
    title: "Manager mode",
    lines: [
      "Run an agency instead of one fighter: scout fighters at every level, pitch to sign them, negotiate their deals and take your cut of their purses. Reputation, your cut and the stable you already have decide who says yes.",
      "A retired fighter can open an agency in the same world; a gym of their own comes along, and the clients train there with no gym cut.",
    ],
  },
  {
    id: "saves",
    title: "Saves and backups",
    lines: [
      "Careers are saved in this browser. The game keeps a backup each month of game time (the last three), which the title screen can restore; export the career now and then to keep a copy outside the browser.",
      ["Export, import and the save button are in ", "Settings", "/settings"],
    ],
  },
];

export function Help() {
  return (
    <>
      <Band word="Guide" eyebrow="New here?" title="How to play" sub="The game in one page: the week, your fighter, the road to a title, fight night, money and belts." />
      <div className="wrap page-body">
        <nav className="help-toc" aria-label="Sections">
          {PARTS.map((p) => (
            <a key={p.id} href={`#/help`} onClick={(e) => { e.preventDefault(); document.getElementById(`help-${p.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{p.title}</a>
          ))}
        </nav>
        <div className="help-grid">
          {PARTS.map((p, i) => (
            <section key={p.id} id={`help-${p.id}`} className="panel help-part">
              <div className="panel-b">
                <div className="help-n">{String(i + 1).padStart(2, "0")}</div>
                <h2>{p.title}</h2>
                {p.lines.map((l, k) =>
                  typeof l === "string" ? (
                    <p key={k}>{l}</p>
                  ) : (
                    <p key={k}>
                      {l[0]}
                      <Link to={l[2]} className="textlink">{l[1]}</Link>.
                    </p>
                  ),
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
