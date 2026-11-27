# Agent Football

**Brand: Agent Football — Agent ID Football Growth.** Train, grow, play live.
Repo: `Velt89/agent-football` · Site: `agent-football.pages.dev` (Cloudflare Pages).

Status: **LIVE — Season 1.** Contract deployed 2026-11-27 via BAW CREATE2
proxy, Sourcify VERIFIED exact_match (matchId 60053691).

- Contract: `0xD033236A4450DE1703CF63888355c2a29B4D62D8` (BSC)
  · deploy tx `0xc13ca21735b9d571aa9ff3166599a7afa4108e91be616841617dd78131573d1b`,
  block 135980878
- Site: https://agent-football.pages.dev (Cloudflare Pages, GitHub-connected)
- First player minted: **Velt**, Midfielder, token #0
  (Passing 44, Vision 47, Dribbling 44, Stamina 59, Long Shots 47 — total 241,
  overall 48), Day-1 item Banana
- Deploy gates: see `DESIGN.md` → "Deploy gates".
- Note: `setBaseURI` is frozen after the first mint, so on-chain `tokenURI`
  stays empty; metadata is served off-chain at
  `https://agent-football.pages.dev/metadata/<id>` (see `frontend/README.md`).

## What this is

1 player per Agent ID, soulbound. Mint (gas only) + Day-1 item draw in one
tx. Daily free item draw, 3 free off-chain trainings/day, 1-on-1 Coach
Session (0.001 BNB, +4 to one stat), $KICK top-ups (100 KICK per 0.001 BNB,
max 500/day), surplus-point unlocks of new stats, Immortal XI reward at
all-99. Season 1: 2-month league, 16 teams, Saturday live 11v11.

Full design: [`DESIGN.md`](DESIGN.md). Contract reference:
[`contracts/README.md`](contracts/README.md).

## Build & test

```bash
npm install
npx hardhat compile   # 0 warnings
npx hardhat test      # 33 passing
npx hardhat run scripts/prepare-deploy.js   # off-chain CREATE2 prediction only — does NOT deploy
```

## Contract

- `contracts/AgentFootball.sol` — one contract, Solidity 0.8.24, hand-rolled
  ERC-721 (RamenForge / Fateborn Mutant pattern). Name `AgentFootball`,
  symbol `AFB`, Season 1.
- Creator wallet W = `0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A` is an explicit
  constructor argument (never `msg.sender` — Fateborn v1 lesson).
- Agent ID registry = `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`.
- Fees: every BNB payment splits 90% reward pool / 8% buyback treasury /
  2% creator. Creator's only fund power is `settleWeekly` (pool only, never
  to itself). No $KICK ERC-20 in Season 1 ($KICK is off-chain points);
  supermarket items (ids 10–18) are off-chain inventory in S1 — no creator
  mint function exists for them by design.
