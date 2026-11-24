# MMA Manager

A browser MMA career and management simulator. Take a fighter from the amateur circuit to a UFC title, or run a management company and build a stable of champions, in a living world of real promotions.

**Play it at https://mma-manager-eta.vercel.app.** Careers are saved in the browser you play in; Settings exports a save file, and "Import a save file" on the title screen loads it on another device or browser.

> Version 4 is a rebuild from zero of the earlier game (github.com/Luthfan-Hafizh/MMAGames): a new engine, a new world simulation and a new interface. Saves from earlier versions do not carry over.
>
> An unofficial fan game, not affiliated with, endorsed or sponsored by the UFC, the PFL, Dana White's Contender Series, IMMAF or any promotion named. Real names are used for identification only; no logos are used.

## The game

**Two careers**

- **Fighter.** Create a fighter (country, weight class, body, martial arts background, talent; start as an amateur, a pro debutant or a regional prospect) or take over any real fighter on the UFC or PFL roster. Plan the training week, drill techniques, accept or turn down fights, run the camp and the weight cut, negotiate contracts, corner yourself live, and chase the belt. Hire a manager (10-20%) and they advise on every fight and contract offer, answer questions about your value, your readiness, your weight and the plan, and negotiate for you; without one, your head coach talks about the fights but not the money.
- **Manager.** Run an MMA management company. Sign clients at every level (your reputation, your cut and the stable you already have decide who says yes), take 10-20% of their purses and 20% of their sponsorship, negotiate their deals, plan their camps and build a stable.

**A world of real promotions.** The UFC and the PFL with their real rosters, rankings and champions; the Contender Series every August; and in each of eight regions a regional promotion (LFA, Jungle Fight, Cage Warriors, KSW, Pancrase, EFC, Brave CF, Eternal MMA), a local show and an IMMAF amateur circuit. About 3,700 fighters; promotions sign the best from the level below (the UFC and the PFL want a winning record as well as the talent), release fighters on losing runs, and fighters develop, age, get hurt and retire. Real fighters are scouted like prospects: the young ones with an unbeaten record, finishes, a ranking already or a fast rise to the top level have the most room to grow, so the real prospects of 2026 can become the contenders of 2029.

**How fighters develop.** Nobody jumps ten points in a year. A fighter's room to grow is spread over the years to the prime: a few points a year, fastest in the early twenties, slowing in the late twenties, with early and late developers. Most of the gap to the potential closes by the prime (about 85-90%); good coaching, good habits and, for your own fighter, a well-planned training week beat the pace. A phenom who debuts at 20 is at UFC level around 24-25 and a contender by 29-30, about the age real champions win their belts. The pace is tuned so the UFC's win rate by age (58% under 25, falling to 38% at 37 and over) comes out as it does in the real sport.

**The fight engine.** Fights are played exchange by exchange: range and footwork, the fence, combinations and counters, the clinch, takedowns and sprawls, ground positions from guard to back control, submissions, ground and pound. Damage is tracked for the head, body and legs; stamina drains with work and body shots; knockdowns, referee stoppages, cuts and doctor stoppages end fights; three judges score every round on the ten-point must system, with 10-8 rounds and split decisions. Calibrated against the UFC:

| | Engine (UFC level) | Real UFC |
| --- | --- | --- |
| KO/TKO, submission, decision | 29% / 20% / 51% | about 30% / 19% / 50% |
| Heavyweight vs women's strawweight KO/TKO | 48% vs 15% | 48% vs 13% |
| Significant strikes landed per minute, accuracy | 3.6, 47% | about 3.5-4.3, 47% |
| Takedowns per 15 minutes, accuracy | 1.7, 42% | about 1.5, 38-42% |
| Share of finishes in round 1 | 47% | about 45-50% |
| Strikes landed to head / body / legs | 64 / 21 / 15 | 64 / 21 / 15 |
| Split and majority share of decisions | 16% | about 15-20% |
| Short-notice replacements who win (world, UFC and PFL) | 42% | 37-42% |

Lower levels are sloppier: more finishes on the local shows and in the regional promotions; amateurs fight three-minute rounds.

**Fighting styles.** Every fighter has a way of striking and a way of grappling, the way analysts describe real fighters, each with a mastery from 0 to 100. Twelve striking styles: technical boxer, pressure fighter, counter-puncher, power puncher, Dutch kickboxer, point fighter, flash kicker, Muay Khao knee fighter, Muay Femur technician, volume striker, brawler and the functional striker of a grappler. Eleven grappling styles: chain wrestler, power wrestler, cage grinder, scrambler, ground-and-pounder, pressure passer, guard player, back-take specialist, leg-locker, thrower and sprawl-and-brawl. A style changes what a fighter chooses to do (a technical boxer leads with the jab and wins the range; a Dutch kickboxer ends every combination with a low kick; a chain wrestler chains a failed shot into the next; a guard player attacks off the back) and, the better they know it, how well those moves work. Real fighters get theirs from how they really fight (the snapshot's tendencies and official statistics), everyone else from their background and attributes; a created fighter picks both. Mastery grows with fights, with the years in the gym, and with style coaching on the Training page (the right sessions build it, about a point a week with a focused plan); a new style can be learned, starting from what carries over, and an old one is kept in case you come back.

**Defences that adapt.** Every fighter guards the levels they get hit at: chop the legs all night and the opponent starts checking the kicks, which leaves the head open. Clever fighters read where the guard has gone and hit what's left open, counter-punchers and technical fighters read patterns faster, and volume strikers and point fighters are hard to read. Over thousands of fights the guard averages where strikes really go (three-quarters to the head), so an ordinary fight is neutral and only a pattern opens a gap: in a test of a kickboxer chopping the legs against a boxer, leg-kick accuracy fell from 60% to 53% as the boxer adapted while head shots rose from 36% to 39%, and finding the opening won most.

**Fight plans.** Twelve styles to start from and a dozen instructions (tempo, risk, range, kicks, lead or counter, takedowns, clinch, fence pressure, target, top and bottom game, defence); targets include mixing it up (head, body and legs in turn, so the defence can't settle) and finding the opening. The coaches comment on the plan against this opponent, including how they defend.

**The live fight.** Watch it at reading pace, every exchange told in a line ("Jackson throws a body kick and a calf kick, and both land", "In the clinch, Velasquez lands a short punch; Jackson blocks the rest"), or quickly, fast, or straight to the bell. The screen reads like a live fight tracker: the scorebug and the latest line on top, the play by play in the main column (newest first, and filtered to everything, the key moments or the corners), and beside it the corner's calls, with tabs for your moves, the live numbers for this round or the whole fight, and the read. From the corner, twenty-two instructions in five groups (pace, target, range, grappling, risk and defence), one active from each, from "Push the pace!" and "Find the opening" to "Check the kicks" and "Hunt the submission"; discipline decides whether they're heard. The read shows where each fighter is guarding and what is open. Between rounds: a summary of the round, what the corner sees (the opening, the hurt leg, the fading gas tank, the cards) with a button to put it in the plan, and the plan itself.

**Corner calls, live.** During the rounds your corner calls what it sees, as real corners do, and the fight never stops for it: "He's hurt! Finish him!", "You're on the fence! Get off it!", "He's covering the body. The legs are open!", "Thirty seconds! Steal the round!". Each call has two or three choices with a countdown (keys 1 to 3 answer); urgent ones are short-lived. In fighter mode you are the fighter, so what you choose happens, at once for the urgent ones (the swarm, the shot on the fence, the escape, the tie-up), unless you're too dazed. Let the countdown run out and your instinct decides: disciplined, clever fighters follow the corner, aggressive ones go for it. Choose "Ask me", "Follow the corner" or "Instinct". About twenty seconds after a call the corner says whether it's working ("Three leg kicks in, he's favouring the leg" or "He's checking them now, go upstairs"), a meter in the scorebug shows who is winning the round, and a better head coach notices sooner. The other corner calls too and its fighter acts on them, so it's a chess match: in tests, fighting on instinct wins about as often as the opponent, following the corner the same, and ignoring the corner drops to about 40%. Your own calls go into the fight report's key moments. In manager mode the assistant coach makes the calls and you shout them to your fighter.

**Fight reports.** Every fight keeps its round-by-round numbers: significant strikes by target and position, total strikes, knockdowns, takedowns, submission attempts, reversals and control time, the judges' scores for each round, a summary of the round, and how both fighters finished it (head, body, legs, gas tank and where they were guarding). Your own fights add the key moments from the play by play. Small shows keep them for six months; the big stages, title fights and your fights for good.

**Real records.** Real fighters carry their real fight-by-fight history from before the world began (from Wikipedia's MMA record tables, matched against the official record), with opponents linked when they're in the game; champions' reigns start on the real date they won the belt, with their real defences. Records next to a fight are the ones the fighters had on the night, and amateur bouts show amateur records.

**Camps and the scale.** Sparring partners, a nutritionist or a full cut team, the cut strategy, film study. Preparation on the night comes from the camp's length, sharpness, freshness and the partners. Weight is checked the day before; a miss costs 20-30% of the purse and the fight goes ahead at a catchweight.

**Short notice.** When someone pulls out late, the phone rings: from three weeks to the day before, at the weight, at a catchweight when the cut can't be made in time, or a division up against the bigger man, and sometimes from a bigger promotion that needs a name (a UFC debut on short notice comes with the contract). The call shows the days left, the cut from your walking weight and your manager's advice, and needs an answer fast. A short camp costs cardio and preparation, more the later the call, and a fast cut drains the body; but the money is better, the matchmaker remembers who said yes, and a short-notice loss costs half as much in the rankings. When your own opponent drops out, you choose whether to take the new name; in fight week the big promotions pay your show money if the fight falls through. The weight sets how late the phone can ring: up a division or at a catchweight there's no cut to make, so a call can come days out; at the weight, a fighter facing a hard cut rarely gets the call inside a week. Every call says why you got it, the notice, the weight and the cut, the money and the deadline. Switch the calls off on the Contracts page.

**Injuries, as long as they really take.** Twenty-five injuries from training and from fights, each with its time to fight-ready, treatment and what can still be trained: a bruised rib two to four weeks, a broken hand six to ten, a torn meniscus two to four months, a torn labrum four to six, a torn ACL nine to thirteen months (a 2024 study of UFC fighters found 412 days on average from surgery to the next fight). Fight injuries follow the fight: an armbar loss can hurt the elbow, a heel hook the knee, a checked kick the foot. Hurt in camp, you choose by how bad it is: fight through it (only if the doctors would clear it and you're nearly healed; you'll be down in what that part of the body does, and it may get worse), ask the promotion to postpone (it moves most title fights and main events, about half the rest), or pull out; serious injuries take you out. A champion facing months out decides whether to keep the belt, and the promotion makes an interim title to unify on return, or to vacate it and be first in line for a title shot when fit. The doctor's facts, a recovery timeline and your team's advice come with every injury.

**Money as the sport pays it (2026).** UFC newcomers on $12,000 to show and $12,000 to win, rising with each win; fight-week compliance pay; $100,000 Fight and Performance of the Night bonuses and $25,000 for every finish (the bonuses introduced with the Paramount deal in 2026). Out of the purse: the gym and head coach, the manager, licences and medicals, travel, and tax.

**Rankings.** A rating model in the spirit of the one the UFC launched in October 2026: who you beat counts most, finishes add a little, activity helps, and after eighteen months out the score decays exponentially. A winner always moves above the fighter beaten. Champions sit above the list; interim champions head it. Newcomers start among the unranked however good they are, and a newcomer's rating moves faster until it settles. Matchmakers step fighters on a run up against better opposition, and notice a prospect who has outgrown the record before the results catch up, while a fading veteran is still booked on the name.

**Belts, interim belts and the BMF.** A champion out about four months gets an interim title made in the division, and the interim champion defends it while the champion stays away; the champion's first fight back unifies the belts. A champion still out fifteen months after the last fight, with an interim champion waiting, is stripped and the interim champion promoted (as with McGregor and Aldo in 2016); with no interim belt, eighteen months out vacates it. A stripped or vacating champion is first in line for a title shot when fit, and the player is warned before the deadline. The UFC's BMF title lives at lightweight with its real lineage (Masvidal at UFC 244, Gaethje, Holloway, and Charles Oliveira since UFC 326 in March 2026): about once a year it goes on the line over five rounds near the top of a numbered card, between popular, exciting names, and it has no rankings behind it. Every fight record says what was at stake (title fight, unification, interim title and interim defence, vacant title, BMF) and what happened (won, defended, unified, lost); the Title history pages keep the lineage of every belt, with how each reign began and ended.

**Odds and previews.** Every fight gets a betting line from what a bookmaker weighs: ratings, form, the style matchup, reach, layoffs and age, with the bookmaker's margin in the moneylines (-175 / +145). Click a fight on any card for the tale of the tape, the keys to victory for each side and their history; upsets make the news.

**Fight week and the microphone.** Three days out it's media day: show respect, sell it with confidence, trash talk, or skip it. Trash talk builds the most hype (and the money and sponsors that follow) but fires the opponent up, and a short temper can boil over into a fined face-off. After a win the microphone is yours: call out the fighters ranked above you, or ask for the title shot; the matchmaker listens to the reasonable ones. Profiles keep head-to-head records against every rival.

**Moving camps and moving weight.** Browse every gym in the world (real ones among them), with coach quality, facilities, the purse cut, who trains there and how likely they are to take you; moving costs money and a few weeks of settling in. Set a walking-weight target to bulk up or slim down, and move up or down a division: bigger or smaller opponents, an easier or harder cut, and the rankings start again.

**Legacy and life after fighting.** Every career builds a legacy score from belts and defences at the top, wins over the best, finishes and time on the pound-for-pound list; real champions start with their UFC title history. The Legacy page ranks the greatest of all time, keeps the records and the Hall of Fame, which inducts a class each July at International Fight Week. Retire whenever you choose (the team will tell you when they think it's time), read the career recap, then open a management company in the same world or watch the sport go on.

**Everything else.** Medical suspensions as commissions set them (up to 120 days after a heavy knockout), interim and vacant titles, immediate rematches after close title fights, title strips for refusing to defend, ring rust after long layoffs, an aging curve with early and late agers, sponsorship deals, achievements.

## The interface

An editorial sports design, after UFC.com, ESPN's fighter pages and the typography-led sites on Awwwards: a black broadcast bar with the date, the bank and Continue; a navigation strip instead of a sidebar; a results ticker; a dark hero band at the top of every page with giant outlined type (the rank, the odds, the surname) where a photo would go; heavy condensed Archivo for names and numbers; one red accent. Fighter pages carry the athlete hero (record, wins by knockout and submission, a fact grid) and a Stats & Records section with accuracy donuts, a body-target figure and win-by-method bars. Rankings show every division with its champion; event pages show the fight card in sections with odds; the live fight is a broadcast scorebug in the red and blue corners. On a phone everything fits the screen: the clock runs across the top of the scorebug with the two fighters under it, the corner's calls stay pinned while the fight goes on, titles stay on one line, and wide tables and the training week scroll inside their own box. Day and night modes.

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

`npm run data` rebuilds `public/data/roster.json` from the snapshot in `data-src/`. `node scripts/build-history.mjs` rebuilds `public/data/history.json`, the real fight histories, from Wikipedia (slow and polite: it caches every answer, so a rate-limited run picks up where it stopped); run `npm run data` after it so the champions' real reign dates reach the roster.

The live site is the Vercel project `mma-manager`, connected to this repository: every push to `main` is built (`npm run build`, with the settings in `vercel.json`) and goes live within a minute, and pushes to other branches get preview deployments. `npx vercel deploy` (without `--prod`) makes a preview of the local folder without touching the live site. It is separate from the old game's Vercel projects.

## Data

- The UFC roster, rankings and official statistics: a snapshot of ufc.com taken on 1 October 2026.
- The PFL roster: Wikipedia's List of current PFL fighters (CC BY-SA 4.0), 15 November 2026.
- Real fight histories before 1 October 2026: the mixed martial arts record tables on English Wikipedia (CC BY-SA 4.0), each matched against the fighter's official record; `public/data/history.json` is shared under the same licence.
- Records, physicals, rankings and statistics are sourced; the 1-20 attributes are derived from them; everything after the first day is simulated.
- Saves from earlier save formats are brought up to date when loaded (real fighters are re-scouted, everyone gets fighting styles, and champions' reigns move to their real start dates).

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
