# Agent Football — Workers API

Cloudflare Workers API + D1/KV backend. **BUILD ONLY — no deploy, no broadcast,
no wallet signing.** Follows the Fateborn Mutant pattern (Cloudflare Pages +
Workers, D1/KV, Durable Objects) with the numbers locked in `../DESIGN.md`.

## Layout

| File | What it is |
|---|---|
| `wrangler.toml` | Worker config (D1 `agent_football_db`, KV `AGENT_FOOTBALL_KV`, DO `MatchRoom`). IDs are placeholders — paste real IDs after creating the resources. **Never `wrangler deploy` without the user's explicit deploy go-ahead.** |
| `schema.sql` | D1 schema (players, training_log, kick_ledger, items_inventory, teams, team_members, fixtures, matches_live, duels, weekly_rewards + operational tables `daily_draws`, `item_uses`, `topup_intents`). Apply: `wrangler d1 execute agent_football_db --file=workers/schema.sql` |
| `src/config.ts` | Single source of truth: positions/stats, training, coach, items, $KICK caps/splits, season dates |
| `src/core.ts` | All route + cap logic + `MemoryStore` (in-memory store). Shared by Worker and local server |
| `src/index.ts` | Worker entry: `fetch` handler + `D1Store` (D1-backed `Store` implementation) |
| `src/fixtures.ts` | Deterministic fixture generator (16 teams, 2 groups, 7 rounds + finals) |
| `src/fixtures.json` | Generated fixtures (64 matches) — regenerate with `npm run fixtures` |
| `src/match.ts` | Live match engine (10 min real = 90 game min, 12–15 moments, seeded/deterministic) |
| `src/durable-match-room.ts` | Durable Object skeleton for the live Saturday match room (code only) |
| `local-server.mjs` | Plain-Node dev server on port 8787, same handler, in-memory store |
| `scripts/smoke.mjs` | Smoke suite (56 checks) against the local server |
| `dist/` | Compiled JS from `src/` (`npm run build:workers`) — what the local server runs |

## Run locally

```bash
npm run build:workers   # tsc: src/*.ts -> workers/dist/*.js
npm run serve           # node workers/local-server.mjs  (http://localhost:8787)
npm run smoke           # 56 checks incl. every cap below
npm run typecheck:workers
```

Dev mode auto-provisions a deterministic demo player for any wallet
(`GET /api/player/<wallet>`). The production Worker returns `404
PLAYER_NOT_FOUND` for unminted wallets.

## API (all JSON; server enforces everything — the website is just a button)

| Endpoint | Enforced rule |
|---|---|
| `GET /api/health` | liveness |
| `GET /api/config` | season, caps, fees, contract `0x000…000`, `DEPLOYED=false`, registry `0x60B9…022F` |
| `GET /api/league/table` | P/W/D/L/GF/GA/GD/Pts/Form per group, tiebreak Pts → GD → GF |
| `GET /api/league/fixtures[?round=n]` | 64 fixtures |
| `GET /api/league/scorers` | goals recorded so far (empty in pre-season) |
| `GET /api/teams`, `GET /api/teams/:id` | 16 teams, squad, captain |
| `GET /api/match/:id/live[?seed=n]` | deterministic simulated match |
| `GET /api/player/:wallet` | player card + inventory + weekly ledger |
| `GET /api/rewards/weekly` | pool = 90% BNB sales + 65% $KICK spent; split 40/20/15/15/10 |
| `GET /api/duels`, `GET /api/items` | duel list; supermarket catalogue + caps |
| `POST /api/train` | 3/day UTC; Light +1/+10 fatigue/0–2% injury; Standard +2–3/+25/5–8%; Intense +4–5/+45/15–25%; fatigue >70 doubles injury; >90 forced rest; +10 $KICK; overflow past 99 → surplus |
| `POST /api/coach` | 1/day; **intent only** — returns 0.001 BNB amount + placeholder calldata; never broadcasts |
| `POST /api/items/draw` | 1/day, random of the 5 daily items |
| `POST /api/items/use` | 3/day, max 1 injury-recovery/day; burns from inventory |
| `POST /api/items/buy` | $KICK prices (Shake Pro 50, Gel 30, Sleep Mask 100, Knee Brace 50, Ankle Tape 20, Muscle Rub 100, Physio 100, Medical Kit 50, Cryo 100); split 30% burn / 65% pool / 5% creator |
| `POST /api/kick/topup` | 100 $KICK = 0.001 BNB, max 500/day, 750,000 top-up reserve; **PENDING only — $KICK credits only on a confirmed on-chain TopUp event** |
| `POST /api/surplus/unlock` | 20 surplus; new stat starts at 40; per-position + universal ids from DESIGN.md |
| `POST /api/immortal/claim` | only when all 5 base stats are 99 → Immortal XI badge (soulbound) + Legend NFT by position |
| `POST /api/duels/challenge`, `POST /api/duels/play` | penalty/dribble/passing; zone + timing (10s window), auto-play on stats if no input; winner +20 $KICK; Minor injury −10% |
| `POST /api/teams/join` | first-come, 15/team (11 starters + 4 subs); first joiner is captain |

## $KICK ledger rules (enforced in `core.ts`)

- Total cap 10,000,000; S1 cap 3,000,000 (2,250,000 earn reserve / 750,000 top-up reserve)
- Per player: max 500 earned/week, max 5,000 held
- Earn: training +10, duel win +20, match win +50, draw +20, goal/clean sheet/save +5
- Spend split: 30% burn / 65% reward pool / 5% creator (integer split, remainder to creator)
- BNB sales split: 90% rewards / 8% buyback treasury / 2% creator
- S1: no liquidity, no trading endpoint, no buyback

## What is still placeholder

- Contract address `0x000…000`, `DEPLOYED=false` — set after a real deploy passes the gates
- `wrangler.toml` D1/KV ids are `00000000-…` placeholders
- Coach calldata is a placeholder (`coachSession(uint8)` selector set at deploy)
- `D1Store` (`src/index.ts`) is type-checked but **not runtime-tested against live D1**
  (no deploy in this task). Before first deploy, run it against local D1/miniflare
  and re-run the smoke suite against it. The fully tested store is `MemoryStore`.
- Fixtures use placeholder team names (Team A..P) and rank placeholders for finals;
  captains rename teams at formation, finals pairings resolve after week 7.
- League table / scorers are empty until matches are played and results recorded.
