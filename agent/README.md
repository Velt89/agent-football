# Agent Football — agent CLI

Node agent CLI for the Agent Football API. **No external deps** (plain
`node:http`/`node:https`), no wallet signing, no broadcast, no deploy.

## Setup

```bash
# 1. Build + start the local API (in another terminal)
npm run build:workers
npm run serve          # http://localhost:8787

# 2. Use the CLI (default API base http://localhost:8787)
node agent/agentfootball.js --demo status
```

Point at another API with `AGENT_FOOTBALL_API`:

```bash
AGENT_FOOTBALL_API=http://localhost:8787 node agent/agentfootball.js status
```

`--demo` uses the demo wallet `0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A`
(the BAW main wallet; auto-provisioned as a demo Forward on the local server).

## Commands

| Command | What it does |
|---|---|
| `status` | API health + config (deployed? contract, registry, season, $KICK caps, coach cost) |
| `player [wallet]` | Player card: name, position, 5 base stats + overall, unlocked stats, surplus, fatigue, injury, $KICK, badges, Legend NFT, inventory |
| `train <wallet> <stat\|index> <light\|standard\|intense>` | Train one stat. 3/day UTC (server-enforced). Stat by name (`Finishing`) or index 0–4. |
| `coach <wallet> <statIndex>` | 1-on-1 Coach Session intent: 0.001 BNB, +4, 1/day. Returns the intent only — **nothing is broadcast**. |
| `draw [wallet]` | Daily free item draw (1/day). |
| `inventory [wallet]` | Owned items (daily draws + Supermarket buys). |
| `items` | Supermarket catalogue + prices + use caps. |
| `items buy <wallet> <itemId>` | Buy with $KICK. Split is 30% burn / 65% pool / 5% creator. |
| `items use <wallet> <itemId>` | Use an owned item (3/day, max 1 injury-recovery/day). Burns it. |
| `league` | League tables (Group A + B) and top scorers. |
| `fixtures [round]` | All 64 fixtures, or one round (1–7 group rounds, 8 = finals). |
| `teams [id]` | All 16 teams (squad size, starters, captain), or one team in full. |
| `teams join <wallet> <teamId>` | Join a team (first-come, 15 max: 11 starters + 4 subs). |
| `duel challenge <wallet> <opponent> [penalty\|dribble\|passing]` | Issue a 1v1 duel. |
| `duel play <duelId> <wallet> [zone] [timing 0..1]` | Play it. Omit zone/timing for stats-only auto-play. Winner +20 $KICK. |
| `duel list` | Open + completed duels. |
| `match <fixtureId> [seed]` | Live match simulation: 12–15 moments, halftime, Man of the Match. Deterministic for a given fixture/seed. |
| `kick [wallet]` | $KICK balance + this week's ledger (earned/spent/burned/pool/creator/topup). |
| `kick topup <wallet> <amountKick>` | Top-up intent: 100 $KICK = 0.001 BNB, max 500/day. **PENDING only** — $KICK credits only after the on-chain TopUp event confirms. |
| `surplus unlock <wallet> <statId>` | Unlock a new stat: 20 surplus, starts at 40. |
| `immortal [wallet]` | Claim Immortal XI badge + Legend NFT (requires all 5 base stats at 99). |
| `rewards` | This week's reward pool + the 40/20/15/15/10 split. |
| `help` | Full usage. |

## Examples

```bash
node agent/agentfootball.js --demo status
node agent/agentfootball.js --demo player
node agent/agentfootball.js --demo train 0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A 0 intense
node agent/agentfootball.js --demo draw
node agent/agentfootball.js --demo items buy 0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A ankle_tape
node agent/agentfootball.js --demo teams join 0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A A
node agent/agentfootball.js --demo duel challenge 0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A 0x1111111111111111111111111111111111111111 penalty
node agent/agentfootball.js --demo match R1-M1
node agent/agentfootball.js --demo fixtures 8
node agent/agentfootball.js --demo kick topup 0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A 100
```

## Notes

- Every cap is enforced server-side; the CLI just prints what the API returns
  (a `TRAINING_CAP` / `COACH_CAP` / `INSUFFICIENT_KICK` error is the API saying no).
- The local server is in-memory: all state resets when it restarts. The
  production API (D1) is not deployed yet — see `../BACKEND.md`.
