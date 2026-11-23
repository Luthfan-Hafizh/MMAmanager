# MMA Manager

A browser MMA career and management simulator. Take a fighter from the amateur circuit to a UFC title, or run a management company and build a stable of champions, in a living world of real promotions.

> Version 4 is a rebuild from zero of the earlier game (github.com/Luthfan-Hafizh/MMAGames): a new engine, a new world simulation and a new interface. Saves from earlier versions do not carry over.
>
> An unofficial fan game, not affiliated with, endorsed or sponsored by the UFC, the PFL, Dana White's Contender Series, IMMAF or any promotion named. Real names are used for identification only; no logos are used.

## The game

**Two careers**

- **Fighter.** Create a fighter (country, weight class, body, martial arts background, talent; start as an amateur, a pro debutant or a regional prospect) or take over any real fighter on the UFC or PFL roster. Plan the training week, drill techniques, accept or turn down fights, run the camp and the weight cut, negotiate contracts, corner yourself live, and chase the belt.
- **Manager.** Run an MMA management company. Sign clients at every level (your reputation, your cut and the stable you already have decide who says yes), take 10-20% of their purses and 20% of their sponsorship, negotiate their deals, plan their camps and build a stable.

**A world of real promotions.** The UFC and the PFL with their real rosters, rankings and champions; the Contender Series every August; and in each of eight regions a regional promotion (LFA, Jungle Fight, Cage Warriors, KSW, Pancrase, EFC, Brave CF, Eternal MMA), a local show and an IMMAF amateur circuit. About 3,700 fighters; promotions sign the best from the level below (the UFC and the PFL want a winning record as well as the talent), release fighters on losing runs, and fighters develop, age, get hurt and retire. Real fighters are scouted like prospects: the young ones with an unbeaten record, finishes, a ranking already or a fast rise to the top level have the most room to grow, so the real prospects of 2026 can become the contenders of 2029.

**The fight engine.** Fights are played exchange by exchange: range and footwork, the fence, combinations and counters, the clinch, takedowns and sprawls, ground positions from guard to back control, submissions, ground and pound. Damage is tracked for the head, body and legs; stamina drains with work and body shots; knockdowns, referee stoppages, cuts and doctor stoppages end fights; three judges score every round on the ten-point must system, with 10-8 rounds and split decisions. Calibrated against the UFC:

| | Engine (UFC level) | Real UFC |
| --- | --- | --- |
| KO/TKO, submission, decision | 30% / 19% / 50% | about 30% / 19% / 50% |
| Heavyweight vs women's strawweight KO/TKO | 48% vs 15% | 48% vs 13% |
| Significant strikes landed per minute, accuracy | 3.6, 46% | about 3.5-4.3, 47% |
| Takedowns per 15 minutes, accuracy | 1.7, 42% | about 1.5, 38-42% |
| Share of finishes in round 1 | 46% | about 45-50% |
| Strikes landed to head / body / legs | 63 / 21 / 16 | 64 / 21 / 15 |
| Split and majority share of decisions | 16% | about 15-20% |

Lower levels are sloppier: more finishes on the local shows and in the regional promotions; amateurs fight three-minute rounds.

**Fight plans.** Twelve styles to start from and a dozen instructions (tempo, risk, range, kicks, lead or counter, takedowns, clinch, fence pressure, target, top and bottom game, defence). The coaches comment on the plan against this opponent. In the live fight, shout instructions from the corner (discipline decides if they're heard) and change the plan between rounds.

**Camps and the scale.** Sparring partners, a nutritionist or a full cut team, the cut strategy, film study. Preparation on the night comes from the camp's length, sharpness, freshness and the partners. Weight is checked the day before; a miss costs 20-30% of the purse and the fight goes ahead at a catchweight.

**Money as the sport pays it (2026).** UFC newcomers on $12,000 to show and $12,000 to win, rising with each win; fight-week compliance pay; $100,000 Fight and Performance of the Night bonuses and $25,000 for every finish (the bonuses introduced with the Paramount deal in 2026). Out of the purse: the gym and head coach, the manager, licences and medicals, travel, and tax.

**Rankings.** A rating model in the spirit of the one the UFC launched in October 2026: who you beat counts most, finishes add a little, activity helps, and after eighteen months out the score decays exponentially. A winner always moves above the fighter beaten. Champions sit above the list; interim champions head it. Newcomers start among the unranked however good they are, and a newcomer's rating moves faster until it settles. Matchmakers step fighters on a run up against better opposition, and notice a prospect who has outgrown the record before the results catch up, while a fading veteran is still booked on the name.

**Odds and previews.** Every fight gets a betting line from what a bookmaker weighs: ratings, form, the style matchup, reach, layoffs and age, with the bookmaker's margin in the moneylines (-175 / +145). Click a fight on any card for the tale of the tape, the keys to victory for each side and their history; upsets make the news.

**Fight week and the microphone.** Three days out it's media day: show respect, sell it with confidence, trash talk, or skip it. Trash talk builds the most hype (and the money and sponsors that follow) but fires the opponent up, and a short temper can boil over into a fined face-off. After a win the microphone is yours: call out the fighters ranked above you, or ask for the title shot; the matchmaker listens to the reasonable ones. Profiles keep head-to-head records against every rival.

**Moving camps and moving weight.** Browse every gym in the world (real ones among them), with coach quality, facilities, the purse cut, who trains there and how likely they are to take you; moving costs money and a few weeks of settling in. Set a walking-weight target to bulk up or slim down, and move up or down a division: bigger or smaller opponents, an easier or harder cut, and the rankings start again.

**Legacy and life after fighting.** Every career builds a legacy score from belts and defences at the top, wins over the best, finishes and time on the pound-for-pound list; real champions start with their UFC title history. The Legacy page ranks the greatest of all time, keeps the records and the Hall of Fame, which inducts a class each July at International Fight Week. Retire whenever you choose (the team will tell you when they think it's time), read the career recap, then open a management company in the same world or watch the sport go on.

**Everything else.** Medical suspensions as commissions set them (up to 120 days after a heavy knockout), injuries in camp and in fights, short-notice replacements, interim and vacant titles, immediate rematches after close title fights, title strips for refusing to defend, ring rust after long layoffs, an aging curve with early and late agers, sponsorship deals, achievements.

## The interface

An editorial sports design, after UFC.com, ESPN's fighter pages and the typography-led sites on Awwwards: a black broadcast bar with the date, the bank and Continue; a navigation strip instead of a sidebar; a results ticker; a dark hero band at the top of every page with giant outlined type (the rank, the odds, the surname) where a photo would go; heavy condensed Archivo for names and numbers; one red accent. Fighter pages carry the athlete hero (record, wins by knockout and submission, a fact grid) and a Stats & Records section with accuracy donuts, a body-target figure and win-by-method bars. Rankings show every division with its champion; event pages show the fight card in sections with odds; the live fight is a broadcast scorebug in the red and blue corners. Day and night modes.

## Running it

```bash
npm install
npm run dev          # http://localhost:5630
npm run build        # type-check and production build into dist/
```

Every check runs in Node without a browser:

```bash
npm run check:engine            # finish rates, strikes, takedowns by weight class (2000 fights each)
npm run check:engine -- --tier=2 # the same at regional level (0 amateur .. 5 UFC)
npm run check:world             # three years of the world with a player career, invariants
npm run check:world -- --manager
npm run check:ui                # render every page for a fighter, a real fighter and a manager
npm run check                   # all of the above, quick versions
```

`npm run data` rebuilds `public/data/roster.json` from the snapshot in `data-src/`.

## Data

- The UFC roster, rankings and official statistics: a snapshot of ufc.com taken on 1 October 2026.
- The PFL roster: Wikipedia's List of current PFL fighters (CC BY-SA 4.0), 15 November 2026.
- Records, physicals, rankings and statistics are sourced; the 1-20 attributes are derived from them; everything after the first day is simulated.
- Saves from the previous save format are brought up to date when loaded (real fighters are re-scouted).

## Project layout

```
src/core/      random numbers, the calendar, helpers
src/data/      weight classes, countries and regions, promotions, names, martial arts, techniques
src/model/     types and the 28 attributes
src/engine/    the fight engine: strikes, plans, the simulation, judging
src/world/     world creation, the real roster, calendar, matchmaking, results, rankings, market, aging
src/career/    training, camps, offers and contracts, money, sponsors, the agency, the inbox
src/sim/       the day-by-day loop
src/state/     the store and saves (compressed in IndexedDB)
src/ui/        the interface: shell, components, art, pages
scripts/       the data build and the headless checks
```

Saves stay in the browser (IndexedDB) and can be exported and imported from Settings.
