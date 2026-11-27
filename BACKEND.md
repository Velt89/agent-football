# Agent Football — Backend

**Status: BUILD ONLY.** No deploy to Cloudflare, no broadcast, no wallet
signing, no GitHub push. All numbers below are locked in `DESIGN.md` — nothing
was invented.

## What was built

| Piece | Path |
|---|---|
| Worker config (D1 + KV + Durable Object bindings) | `workers/wrangler.toml` |
| D1 schema | `workers/schema.sql` |
| Worker entry + D1 store adapter | `workers/src/index.ts` |
| Shared constants (positions, training, items, $KICK, season) | `workers/src/config.ts` |
| All route + cap logic + in-memory store | `workers/src/core.ts` |
| Deterministic fixture generator + generated fixtures | `workers/src/fixtures.ts`, `workers/src/fixtures.json` |
| Live match engine | `workers/src/match.ts` |
| Durable Object live-match-room skeleton | `workers/src/durable-match-room.ts` |
| Local dev server (plain Node, no Cloudflare) | `workers/local-server.mjs` |
| Smoke suite | `workers/scripts/smoke.mjs` |
| Agent CLI (no deps) | `agent/agentfootball.js` |
| Docs | `workers/README.md`, `agent/README.md`, this file |

Stack: Cloudflare Workers + D1 + KV + Durable Objects (same as Fateborn
Mutant). TypeScript, zero runtime dependencies. `npm run build:workers`
compiles `src/*.ts` → `workers/dist/*.js`; the local server runs the compiled
output so the smoke tests exercise the same code the Worker ships.

## API

Base: local `http://localhost:8787` (`npm run serve`); production Worker URL
is TBD at deploy time. All endpoints return JSON `{ok, ...}` or
`{ok:false, error, message}`.

**Reads:** `GET /api/health`, `/api/config`, `/api/league/table`,
`/api/league/fixtures[?round=n]`, `/api/league/scorers`, `/api/teams`,
`/api/teams/:id`, `/api/match/:id/live[?seed=n]`, `/api/player/:wallet`,
`/api/rewards/weekly`, `/api/duels`, `/api/items`.

**Writes:** `POST /api/train`, `/api/coach`, `/api/items/draw`,
`/api/items/use`, `/api/items/buy`, `/api/kick/topup`,
`/api/surplus/unlock`, `/api/immortal/claim`, `/api/duels/challenge`,
`/api/duels/play`, `/api/teams/join`.

## Caps enforcement (server-side, in `workers/src/core.ts`)

| Rule | Enforcement |
|---|---|
| Training 3/day UTC | `training_log` count; 4th → `TRAINING_CAP` 429 |
| Fatigue +10/+25/+45; >70 doubles injury; >90 forced rest | computed per training; `FORCED_REST` 403 |
| Injury ranges Light 0–2%, Standard 5–8%, Intense 15–25% | random roll in range; Minor 1d / Sprain 3d / Serious 7d |
| Gains Light +1, Standard +2–3, Intense +4–5; overflow past 99 → surplus | applied + surplus accounting |
| Coach 1/day, 0.001 BNB, +4, 3% injury, +20 fatigue | intent only — returns amount + placeholder calldata, never broadcasts |
| Daily draw 1/day | `daily_draws` (D1) / set (memory) |
| Supermarket use 3/day, max 1 injury-recovery/day | `item_uses`; burns from inventory |
| $KICK buy split 30% burn / 65% pool / 5% creator | integer split, remainder to creator; recorded in `kick_ledger` |
| $KICK caps: total 10M, S1 3M (2.25M earn / 750k top-up), 500 earned/week/player, 5,000 held | checked on every award; awards are partial-capped, never over |
| Top-up 100 $KICK = 0.001 BNB, max 500/day, reserve-capped | intent `PENDING`; **$KICK is NOT credited until the on-chain TopUp event confirms** |
| Surplus unlock 20 points, new stat starts 40 | per-position specialist + universal ids validated |
| Immortal XI only at all-5-base-99 | verified; badge soulbound + Legend NFT by position (FW Golden Boot / GK Golden Glove / DF Golden Shield / MF Golden Playmaker) |
| Teams: first-come, 15 max (11 starters + 4 subs) | `team_members` count; first joiner is captain |
| Duels: 10s window, auto-play on stats if no input | `resolveMoment` / duel play; winner +20 $KICK |
| Weekly rewards pool = 90% BNB sales + 65% $KICK spent; split 40/20/15/15/10 | computed in `/api/rewards/weekly` |
| S1: no liquidity, no trading endpoint | no such route exists |

## Fixtures

16 teams (Team A..P placeholders), 2 groups of 8, circle-method round-robin
(7 rounds, 28 unique pairings per group verified), finals week cross-group by
rank (1st v 1st … 8th v 8th). Matchdays Saturdays Dec 5, 12, 19, 26, Jan 2, 9,
16, Finals Jan 23 2027; slots 19:00 (Group A) and 20:00 (Group B) WIB, 4
matches per slot. 64 fixtures total in `workers/src/fixtures.json`.

## Match engine

10 minutes real time = 90 game minutes, 12–15 key moments (fixed slots:
12' striker 1v1, 34' winger vs defender, 67' penalty, 89' corner), types
shoot/save/tackle/pass, 10-second play window per moment, auto-play fallback
on stats, halftime at 45', Man of the Match = most live moments won.
Deterministic: same fixture (or explicit seed) replays byte-identically.

## Verification (run 2026-11-27, this build)

- `npx tsc -p workers/tsconfig.json --noEmit` — **clean, 0 errors**
- `node --check` on all JS files (local-server, smoke, gen-fixtures, all
  `dist/*.js`, agent CLI) — **all pass**
- `node workers/scripts/smoke.mjs` — **56 passed, 0 failed** (see below)
- CLI smoke: `status`, `player`, `train` (intense, +5, fatigue 45, +10 $KICK),
  `fixtures 1`, `match R1-M1`, `league`, `draw`, `kick` — **all OK** against the
  local server

Smoke checks that prove the caps (all passing): train 3x then 4th fails
`TRAINING_CAP` 429; coach 2nd same day fails `COACH_CAP` 429; buy Ankle Tape
(20 $KICK) splits exactly 6 burned / 13 pool / 1 creator and ledger matches;
surplus unlock with 0 surplus fails `INSUFFICIENT_SURPLUS` 402 and a
wrong-position stat fails `BAD_STAT`; immortal claim at non-99 fails
`NOT_ALL_99` 403; top-up 100 $KICK is `PENDING` and does **not** credit the
balance; top-up over 500/day fails `TOPUP_CAP`; fixtures = 64 (56 + 8),
finals Jan 23 2027, round-robin 28 pairings/group; match = 12–15 moments with
12'/67'/89' present, halftime 45, MotM present, score == goal moments,
deterministic replay; weekly pool = 65% of $KICK spent (13 from 20 spent).

## On-chain player sync (lazy indexer, added 2026-11-27)

`GET /api/player/:wallet` used to 404 for wallets that had minted on-chain,
because nothing copied the mint into D1. Fixed with a lazy sync:
- `workers/src/core.ts` — `HandlerOpts.syncPlayerFromChain` hook; `loadPlayer`
  calls it on store miss (any route, not just GET /api/player), saves the
  returned player, and serves it. Hook returning null or throwing falls back
  to the old behaviour (404 in prod, demo in dev mode) — an RPC outage never
  500s a lookup.
- `workers/src/onchain-sync.ts` — raw `eth_call` (no deps) against BSC RPC
  with fallback + 8s timeout: `hasPlayer` → `playerOf` → `playerStats` →
  `surplusPointsOf` → `unlockedStatsOf`, manual ABI decoding. Never throws.
- Miss-only by design: an existing D1 row is never overwritten from the
  chain, because off-chain training gains live in D1 and a refresh would
  clobber them. There is no mint-event indexer yet; the first API lookup
  after a mint is what imports the player.
- Tests: `workers/scripts/test-sync.mjs` — 12 passed (stub-hook behaviour +
  live decode of Velt: token 0, MF, 44/47/44/59/47, surplus 0; unknown
  wallet → null). Smoke suite still 56/56 (two stale checks updated to the
  live contract address / DEPLOYED=true and the coach intent's live `to`).

## Still placeholder / not done

- **Contract address `0x000…000`, `DEPLOYED=false`** — set only after a real
  deploy passes the DESIGN.md deploy gates (Sourcify exact_match, live reads
  on two RPCs, BAW preview clean, creator = W as explicit constructor arg).
- **`wrangler.toml` D1/KV ids are `00000000-…` placeholders.** Create with
  `wrangler d1 create agent_football_db` and `wrangler kv namespace create
  AGENT_FOOTBALL_KV`, paste ids, then `wrangler d1 execute … --file=schema.sql`.
- **Coach calldata is a placeholder** (`coachSession(uint8)` selector set at
  deploy). The returned intent must not be broadcast as-is.
- **`D1Store` is type-checked but not runtime-tested against live D1** (no
  deploy in this task). Before first deploy: run it against local D1/miniflare
  and re-run the smoke suite against it. Fully tested store is `MemoryStore`.
- **No frontend here** — the 8-page site lives in `frontend/` (sibling work).
  The API is the authority; the site is just buttons.
- Fixture team names are placeholders (captains rename at formation); finals
  pairings are rank placeholders resolved after week 7. League table/scorers
  are empty until matches are played.
- Dev-mode auto-provisioning of demo players exists **only** in the local
  server; the production Worker 404s unminted wallets.
