# Agent Football — Design Record

Brainstormed 2026-11-27 in side chat, user-led, brainstorm-first.
Status: BRAINSTORM COMPLETE — design locked, NO build, NO contract, NO deploy yet.
User will review this file and give explicit build go-ahead before any building.

## Name — locked
- **Brand: Agent Football**
- **Full / subtitle: Agent ID Football Growth** — train, grow, play live
- Repo: `Velt89/agent-football`
- Site: `agent-football.pages.dev` (Cloudflare Pages)
- Working title during brainstorm was "Agent FC Career" / "Penalty Pact" — superseded.

## Origin
- Started as "game of football" brainstorm, idea #1 Penalty Pact (1v1 penalty shootout duels).
- User: penalty alone is not interesting enough. Combined with a career RPG:
  you ARE the player, you train, you play position duels, you join a club for
  weekend 11v11. Penalty Pact survives as the live duel mechanic, not the whole game.

## Core concept
- 1 player per Agent ID, soulbound. At mint you choose your player name + position.
- Daily loop: train, draw a free item, play live duels, earn $KICK.
- Weekly loop: Saturday live 11v11 league match, Sunday weekly rewards in an Envelope.
- Season loop: 2-month league season, 16 teams, finals week.

## Positions — locked, 4 positions, 5 stats each
Start 40-60 random per stat, cap 99 per stat. Overall = average of the 5 stats.

- **Goalkeeper:** Reflexes, Diving, Handling, Distribution, Positioning
- **Defender:** Tackling, Marking, Heading, Strength, Pace
- **Midfielder:** Passing, Vision, Dribbling, Stamina, Long Shots
- **Forward:** Finishing, Pace, Dribbling, Heading, Off the Ball

## Player rules — locked
- 1 player per Agent ID, soulbound, cannot mint a second.
- **Name: never changes.** Set at mint, forever. Names are unique at mint,
  first-come gets the name.
- **Position: normally cannot change.**
- Exception — minted the wrong position: pay **0.001 BNB** to change position,
  **max 1 change per season**.
  - Total stats are PRESERVED, allocation is re-randomised for the new position.
  - Example: Striker total 300 (Finishing 75, Pace 65, Dribbling 60,
    Heading 55, Off the Ball 45) -> GK total 300, random split e.g.
    Reflexes 70, Diving 65, Handling 60, Distribution 55, Positioning 50.
  - Each stat stays capped at 99. $KICK, items, training history and team stay.

## Onboarding — locked, 1 fee
- Mint player + Day 1 item draw together in ONE transaction, gas only.
- You get your Player NFT + your first item in that one tap.
- From Day 2 onward, the daily draw is its own tx, still gas only, no BNB price.

## Daily free items — locked
- 1 free draw a day, gas only, random, all legal real-life items.
- Pool: Protein Shake (-20 fatigue), Vitamin C/D (-50% injury chance next
  training), Electrolyte Drink (-10 fatigue), Banana (-5 fatigue),
  Ice Bath (heal 1 day faster).

## Training — locked
Up to 3 trainings a day, free, no gas, off-chain in Season 1 (server-enforced).

- **Light — 15-20 min in-game, +1 stat, 0-2% injury**
  e.g. Video Analysis, Stretching, Positioning Walkthrough.
- **Standard — 30-45 min, +2-3 stats, 5-8% injury**
  e.g. Striker Finishing Drill 30 min, Midfielder Rondo 30 min,
  Defender 1v1 Defending 30 min, GK Catching Crosses 30 min.
- **Intense — 60-90 min, +4-5 stats, 15-25% injury**
  e.g. Sprint Intervals, Aerial Duels, Full Shooting Session 60 min.

Recommended day: 1 Intense + 1 Standard + 1 Light = about 90-120 min in-game.
Training resolves instantly in ~30 seconds of play — the minutes are in-game
time, not a real waiting timer.

### Fatigue + injury — locked
- Fatigue meter 0-100. Light +10, Standard +25, Intense +45.
- Over 70 fatigue, injury chance doubles. Over 90, forced to rest.
- Injury chance = intensity base + fatigue penalty + consecutive hard days.
- Injuries: Minor Strain — out 1 day, no training, duels at -10%;
  Sprain — out 3 days; Serious — out 7 days.

Example Striker day:
1. Finishing Drill, Intense 60 min, +4 Finishing, 15% injury
2. Sprint Intervals, Standard 30 min, +2 Pace, 6% injury
3. Video Analysis, Light 15 min, +1 Off the Ball, 0% injury
Total 105 min, +7 stats, manageable risk if rested / used a shake.

## Individual training for BNB — locked
- **1-on-1 Coach Session, once a day, extra on top of the 3 free trainings.**
- Cost **0.001 BNB**, 60 min in-game, pick 1 stat, **+4 to that stat**,
  only **3% injury** (coach watches form), **+20 fatigue**.
- Per position: GK Shot-Stopping Coach, Defender Tackling Masterclass,
  Midfielder Passing Masterclass, Forward Finishing Coach.
- Future ideas (not v1): Gym Session 0.0005 BNB (+3 Strength/Pace/Stamina),
  Video Analysis with a Pro 0.0005 BNB (+2 Positioning/Vision/Off the Ball, 0% injury).

## Live play — locked
- Same mechanic everywhere: pick a zone + hit a timing bar, 10 seconds,
  mobile-friendly. Skill + stats, not pure stat roll.
- **Forward — Shoot:** pick a corner + power timing, like a penalty from open play.
- **Goalkeeper — Save:** pick a dive zone + timing, vs the shooter at the same moment.
- **Defender — Tackle:** hit the green on a timing bar, too early = foul, too late = beaten.
- **Midfielder — Pass:** pick a lane — safe / through ball / risky killer pass — + timing.
- Daily 1v1 duels are live, ~30 seconds: Striker vs GK penalty,
  Defender vs Striker 1v1 dribble, Mid vs Mid passing battle.
  Same system, different stats. If offline / miss the 10-second window,
  it auto-plays on stats only, no skill bonus.

## Weekend 11v11 — locked
- **Live 10-min Saturday match, everyone online.**
- 10 minutes real time = 90 minutes game time.
- 12-15 live key moments per match. Most of the match is auto-sim on trained
  stats; when the ball comes to you, it stops and it is your turn live.
- Example moments: 12' Striker through 1v1, 34' Winger vs Defender,
  67' penalty, 89' corner header.
- Halftime: 60 seconds, club captain can vote a tactic change.
- Full-time: Man of the Match = most live moments won, not just highest overall.
- Spectators can watch live and predict the next moment.
- **If not full, use subs first.** 11 starters, if a starter is offline /
  injured a sub covers them automatically. If subs are also out, that spot
  auto-plays on stats only — no forfeit for missing 1-2 players.

## Season — locked
- **Season 1 start: Tuesday, Dec 1, 2026.**
- **Pre-season: Nov 27-30, 2026 — mint + training + duels open now.**
  Early advantage is INTENTIONAL. An early player minting Nov 27 gets
  4 days x 3 trainings = 12 trainings before Dec 1, roughly +24 stats,
  plus 4 daily draws and $KICK earned, and first pick of teams.
  A Dec 1 player starts at base. Pre-season is also the bug-test window.
- **Season length: 2 months, 8 Saturdays.**
- **16 teams.** 11 starters + 4 subs per team = 15 squad, **240 players total**.
- Format: **2 groups of 8, Group A and Group B.**
  Weeks 1-7: group round-robin, everyone in your group plays everyone once.
  Week 8: Finals Day — Group A winner vs Group B winner for the title,
  2nd vs 2nd for bronze, down to 8th vs 8th for placement.
- Matchdays: Saturdays Dec 5, 12, 19, 26, Jan 2, 9, 16, Finals Jan 23, 2027.
  8 matches per Saturday, in parallel:
  19:00 WIB — 4 matches live in parallel
  20:00 WIB — 4 matches live in parallel
  Whole round done in about 30 minutes.
- Points: Win 3, Draw 1, Loss 0. Tiebreak: Goal Difference, Goals For,
  Head-to-Head, Live Moments Won.
- League table live on site: P, W, D, L, GF, GA, GD, Pts, Form.
  Top Scorers + Top Savers charts.
- Transfer window Week 4: 1 move per team.

### Team formation — locked
- **First-come, first-served.** First 15 to join a team fill it. No draft, no random.
  Online players have the advantage — they join early, pick their team,
  and start training early. Team names: captains name their team (to be
  confirmed at formation — preset names are a fallback).

## Supermarket — locked
- Separate from daily free items. Targeted, stronger, you choose what you need.
- All items are NFTs, tradeable before use, **burned after use**.
- Priced in **$KICK** (see currency below). No direct BNB items in v1 —
  BNB only buys $KICK top-up, plus the Coach Session at 0.001 BNB.
- Cap: max **3 Supermarket items used per day**, max **1 injury-recovery
  item per day**. You can own as many as you want, you cannot use them all at once.

Items:
- **Fatigue:** Recovery Shake Pro (-50 fatigue), Energy Gel (+1 extra Light
  training today), Sleep Mask Pro (full fatigue reset overnight)
- **Prevention:** Knee Brace (-75% injury chance for next 3 trainings),
  Ankle Tape (-50% injury chance, +5% tackle success today),
  Muscle Rub (if injured today, Minor only, never worse)
- **Recovery:** Physio Session (heal 2 days faster), Medical Kit
  (heal a Minor injury instantly), Cryotherapy (-40 fatigue + heal 1 day faster)
- Old BNB pricing (superseded, for reference only): 0.0002-0.001 BNB per item,
  roughly $0.11-$0.55 at ~$550 BNB. $KICK prices to be set at build from
  the earn rates below — Recovery Shake Pro ~50 $KICK, Physio ~100 $KICK, etc.

## $KICK currency — locked
- **Name: $KICK.** $GOAL was rejected — TopGoal $GOAL already exists on BSC,
  a football token, $0.000188, $102k market cap, same chain/theme.
  $BOLA was considered, $ENVELOPE was considered and rejected — $ENVELOPE
  on Solana was rugged 8 min after launch, and it does not say football.
  Envelope is kept only as the name for the weekly reward pack.
- **Utility (v1): Supermarket currency + earn by playing only. No rerolls.**
- Earn: training complete +10 $KICK, duel win +20, match win +50,
  draw +20, goal / clean sheet / save +5.
- Spend: Supermarket items, extra Light training, cosmetics, club creation (S2).
- **Cap: total 10,000,000 $KICK. Season 1 cap 3,000,000 $KICK.**
  Split inside S1: **2,250,000 for earn-by-playing, 750,000 reserve for top-ups.**
  No pre-mint, no team / creator allocation in S1, every $KICK earned on the pitch.
- Per player: max **500 $KICK earned per week**, max **5,000 $KICK held**.
- **Season 1: no liquidity.** $KICK is off-chain points, no price, no trading.
- **Buyback: no buyback in Season 1.** Starts Season 2 when $KICK gets a
  PancakeSwap GOAL/BNB-style pool, then buyback $KICK is burned.
- **Every $KICK spent splits: 30% burned, 65% to reward pool, 5% to creator.**
  Example: spend 100 $KICK -> 30 burned, 65 to weekly rewards, 5 to creator.

### $KICK calculation for Season 1 — verified 2026-11-27
Assumptions: 240 players, ~300 $KICK/week each, 8 weeks, 80% spent.
- Earn mint optimistic: 240 x 300 x 8 = **576,000 $KICK**
  70% active (168 players): 403,200. 50% active: 288,000.
  Even if every player maxed the 500/week cap: 960,000 — still under
  the 2,250,000 earn reserve.
- Spend (80%): 460,800 $KICK
  - 30% burned: **138,240**
  - 65% reward pool: **299,520**
  - 5% creator: **23,040**
  Per week: earn 72,000, spend 57,600, burn 17,280, reward pool 37,440, creator 2,880.
- Net supply after S1: 576,000 - 138,240 = **437,760 $KICK** in circulation.
- Top-up realistic: 30 players/day buy 200 $KICK avg = 6,000/day x 56 days
  = **336,000 $KICK**. Total S1: 576,000 + 336,000 = **912,000**,
  headroom ~2,088,000 under the 3,000,000 cap.
  Theoretical top-up max (all 240 x 500/day x 56d = 6,720,000) EXCEEDS the cap,
  so top-up $KICK must come from the capped 750,000 reserve, first-come,
  and stops when the reserve is gone.

## Fees — locked
Two different splits, do not confuse them:
- **BNB sales (top-ups / NFTs): 90% weekly reward, 8% buyback $KICK treasury,
  2% creator.** The 8% accrues in BNB in S1, unspent, for the Season 2 buyback.
- **$KICK spending: 30% burn, 65% reward pool, 5% creator** (above).

## How BNB is raised — locked, option #2
- **$KICK top-up, optional, capped: buy 100 $KICK for 0.001 BNB,
  max 500 $KICK bought per day per player** (= 0.005 BNB/day max).
  Grinders earn it free, impatient players top up. That BNB is split 90 / 8 / 2.
- No BNB lane in the Supermarket in v1, no Founder pass in v1.
  Premium BNB-direct items (Physio, Cryotherapy, Golden Boot) were discussed
  as a possible later addition, not locked.

## Weekly rewards — locked
- Paid **Sunday, in an Envelope, in BNB + $KICK together.**
- Pool that week = 90% of BNB sales that week + 65% of $KICK spent that week.
- Split — locked:
  - Team of the Week 40% — best result that week, split between the 15 squad
  - Top Scorer 20%
  - Best GK 15% — most saves in live moments
  - Man of the Week 15% — most live moments won, any position
  - Hardest Trainer 10% — most trainings completed that week with no injury
- Plus non-money: soulbound weekly badge, and Team of the Week gets
  1 free Coach Session each next week.
- Ideas not locked (Season 2 candidates): Lucky Envelope (random active player),
  Most Improved, Clean Sheet Team, Comeback of the Week.

## Website — locked, 8 pages
1. Home / Stadium — player card front and centre, next match countdown,
   league position, fatigue meter, $KICK balance
2. My Player — radar chart of 5 stats, training history, injury status,
   inventory, goals/saves/duels record, season streak
3. Training Ground — 3 free slots, Light/Standard/Intense picker,
   fatigue + injury risk shown before confirm, Coach Session
4. Supermarket — $KICK items, BNB top-up, owned items with Use / Sell, burn on use
5. League — live table, fixtures for all 8 rounds, results, form,
   Top Scorers, Top Savers
6. Clubs — 8 team pages, squad list, captain, join/request to join
7. Live Match Center — live score, minute-by-minute commentary,
   "your turn" moment, live table updating after every goal;
   off-season shows next fixtures + last highlights
8. Duels / Arena — daily 1v1s, open challenges, named callouts, duel history

## Agent ID access — locked
- One Agent ID login unlocks all 8 pages. Connect the wallet holding your
  Agent ID, site checks the on-chain registry (`hasAgentId`), session unlocks
  your player, stats, $KICK, training, team.
- **Public view:** League, Clubs, Live Match Center — anyone can watch the
  table and matches, to attract new players.
- **Agent ID required to do anything:** mint, train, buy/use items, duel,
  play Saturday, join a team.
- Agents can access all 8 via API with a signed message from their ID wallet:
  mint, check stats, train, buy/use item, issue a duel, play a live moment,
  check the table. Live moments: poll the Match Center, 10 seconds to send
  pick-a-zone + timing when it is your turn.

## Art direction — locked
- **Style #1: Flat vector — night stadium neon.** Same pipeline as Agent X Robot.
  Bold outlines, flat colours, dark green pitch, floodlights, neon glow.
  Examples in `art-examples/`:
  `media-generation-flat-vector-night-stadium-*.webp` (chosen),
  `media-generation-pixel-art-retro-arcade-*.webp` (rejected),
  `media-generation-anime-manga-captain-tsubasa-*.webp` (rejected for main,
  candidate for special Man of the Match / Golden Boot cards),
  sticker/Panini style was discussed, no image generated.
- Player card = FIFA-style vector card: overall, position badge, 5 stats,
  team colour stripe. GKs get a distinct kit colour (bright yellow/pink),
  8/16 teams get distinct kit colours.
- Rarity: Common slate, Rare blue, Epic purple, Legendary gold — same as AXR.
- **Items art: same flat vector, colour = effect, shape = item.**
  - Fatigue — cyan / blue
  - Prevention — green
  - Recovery — purple / pink
  - Daily items: plain dark frame. Supermarket items: $KICK price tag,
    thin gold/neon border if premium.
  - Example sheet: `art-examples/media-generation-items-flat-vector-icons-*.webp`

## Deployment — locked
- **Cloudflare Pages + Workers, same as Fateborn Mutant.**
  Pages for the 8-page site, Workers for the API, D1 / KV for the database,
  Durable Objects for the live Saturday match room.
- BSC mint / draw / top-up are wallet transactions from the browser.
- Vercel was discussed (easier API routes) and rejected for this one —
  Cloudflare is cheaper at scale and already proven for Fateborn.

## Contract + wallet — locked
- **One contract, deployed from the user's BAW main wallet.**
  Single contract for Player + Items + $KICK logic (S1 $KICK is off-chain
  points; on-chain $KICK token is a Season 2 step).
- Lesson from Fateborn v1 (do NOT repeat): creator must be an explicit
  constructor argument = the user's wallet W, NOT `msg.sender` from a
  CREATE2 proxy — v1 made owner() the proxy and setBaseURI uncallable.
- Main wallet (BAW): 0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A, Agent ID velt.ai.

## Anti-cheat — locked as a build rule
- Server enforces everything, website is just a button.
  3 trainings/day, 500 $KICK/week, 1 Coach Session/day,
  3 Supermarket items/day (max 1 injury-recovery), 1 position change/season,
  500 $KICK top-up/day. If the server does not check it, it does not happen,
  no matter what is sent via API.

## Open / not locked yet
- Team names: captains name their team at formation; preset names are a fallback.
- Exact $KICK prices per Supermarket item (to be set at build from earn rates).
- Season 2: $KICK on-chain token + PancakeSwap pool, buyback live, Cup,
  Gym / Video Analysis trainings, Lucky Envelope / Most Improved awards.
- Growth: Season 1 needs 240 players for 16 full teams. If sign-ups are
  slower, start with fewer teams filled first-come and expand — do NOT
  start with half-empty teams.

## Next step
- User reviews this DESIGN.md. No building until user gives explicit build
  go-ahead in chat.

## Update 2026-11-27 — Surplus points unlock new stats, all-99 reward

Locked by user 2026-11-27 11:40 WIB, after DESIGN.md v1 was saved.

### Surplus Pool — locked
- No hard cap / Legend retirement. Players keep evolving past 99.
- When a stat hits 99, further training on that stat does NOT vanish —
  it goes into a **Surplus Pool** (1 surplus point per +1 that would have
  been gained).
- Spend surplus to unlock a new stat, starting at 40, then train that
  new stat up like a normal one (cap 99).
- Cost: **20 surplus points to unlock a new stat.**
- Diminishing returns from the earlier proposal are NOT locked — surplus
  unlock is the mechanism instead. Training gains stay as in the main
  design (Light +1, Standard +2-3, Intense +4-5, Coach +4) until a stat
  hits 99, then surplus accrues.

### New stats — locked, BOTH specialist + universal
Per position, specialist unlocks:
- **Goalkeeper:** Penalty Saving, Command of Area, Sweeper Keeper
- **Defender:** Anticipation, Ball Playing, Leadership
- **Midfielder:** Set Pieces, Creativity / Flair, Work Rate
- **Forward:** Weak Foot, Composure / Clutch, Skill Moves

Universal unlocks, any position:
- Leadership, Clutch, Durability (-20% injury chance permanently),
  Consistency, Versatility (play a second position at 80% of stats)

Recommended v1 order (not yet separately locked): 3 unlocks per position
+ 2 universal — 1 specialist, 1 team stat, 1 universal per player path.
A maxed player adds a 6th, 7th stat row to their card; overall can go
past 99 into a new tier.

### All-99 reward — locked
- When all 5 base stats reach 99 (total 495, overall 99), player gets a reward.
- **For now: badge + NFT.**
  - **Badge: soulbound**, cannot be sold or transferred. Season Legend badge.
  - **NFT: tradeable.** Can be sold in the in-site Supermarket / market,
    or on Element later. Not soulbound.
- Badge + NFT are the Season 1 reward. No $KICK conversion, no forced
  retirement, no Legend-only training conversion — player keeps evolving
  via surplus unlocks.

## Update 2026-11-27 — All-99 reward names, trigger clarified

Locked by user 2026-11-27 11:43 WIB.

- **Badge name: Immortal XI** — soulbound, cannot be sold or transferred.
- **NFT name: by position, tradeable** — Forward: Golden Boot Legend,
  Goalkeeper: Golden Glove Legend, Defender: Golden Shield Legend,
  Midfielder: Golden Playmaker Legend. Can be sold in the in-site
  Supermarket / market, or on Element later.
- **Trigger: ONLY when ALL 5 base stats reach 99** (total 495, overall 99).
  NOT when only 1 stat reaches 99. A single 99 gives surplus points
  toward unlocks, it does NOT give the badge or the NFT.

## Deploy gates — user instruction 2026-11-27 11:45 WIB
- "Make sure you check all first before deploy."
- No deploy until ALL checks pass, and user gives explicit deploy go-ahead
  after seeing the checks. Same standing gates as previous games:
  Sourcify exact_match, source clean, live reads verified on two RPCs,
  static call succeeds, BAW preview fully clean, gas within limits,
  wallet CONNECTED + DevMode on, creator = W (explicit constructor arg),
  contract address cross-checked, frontend build passes, tests pass,
  agent CLI smoke test passes. If any check fails, stop, report, wait —
  do not deploy.
