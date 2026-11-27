# Agent Football — frontend

Vite + React + TypeScript app (same versions as the RamenForge frontend:
react ^18.3.1, vite ^5.4.0, typescript ^5.5.0, viem ^2.33.0). Hash routing,
so it works as a static Cloudflare Pages site with no server rewrites.

Design authority: `../DESIGN.md` — every number, fee, cap and date in
`src/config.ts` comes from there. Do not invent different ones.

## Run

```bash
cd frontend
npm install
npm run dev      # local dev server
npm run build    # tsc + vite build -> dist/
npm run preview  # serve the production build locally
```

## Live mode (current state)

The contract is **LIVE on BSC** at `0xD033236A4450DE1703CF63888355c2a29B4D62D8`
(deployed 2026-11-27, Sourcify exact_match, matchId 60053691). `src/config.ts`
has `CONTRACT_ADDRESS` set to that address and `DEPLOYED = true`.

- **Live reads (viem, `src/onchain.ts`):** Home, My Player and League read
  `name` / `symbol` / `totalMinted` / `playersCount` on load, and My Player
  reads `playerStats` / `surplusPointsOf` / `unlockedStatsOf` for the
  connected wallet's player. Verified live 2026-11-27: token 0 = Velt,
  Midfielder, stats [44, 47, 44, 59, 47], total 241, overall 48.
- **Wallet connect (`src/wallet.ts`):** the "Connect wallet (Agent ID)"
  button calls `eth_requestAccounts` on the injected provider (read-only
  link). No transaction can be sent from this site — writes (mint, coach,
  unlock, use item) are NOT wired yet.
- **Demo fallback:** when no wallet is connected, pages show the demo
  preview from `src/demoData.ts`, labelled "Demo preview" — demo stats are
  never presented as live data. League tables, fixtures, clubs, duels and
  training history are still demo placeholders (no live source yet — the
  Workers API is not deployed).
- **Metadata endpoint:** `functions/metadata/[id].js` (Cloudflare Pages
  Function) reads the live contract via public BSC RPC and returns
  ERC-721 JSON per token. Verified locally against the live contract:
  token 0 (Velt, stats above), token 1 (Banana item), token 999 → 404.

### Known limit — tokenURI can never be set on this contract

`setBaseURI()` reverts once ANY token exists
(`require(_tokens.length == 0)`), and tokens 0 and 1 were minted on
2026-11-27, so the on-chain `baseURI` is permanently `""` and
`tokenURI()` returns `""` for every token. The metadata endpoint above
CANNOT be wired as the contract's tokenURI without a new contract
deployment. It is the correct metadata source for the site itself and
for marketplaces that accept a manually-set metadata URL. Do not attempt
`setBaseURI` via BAW — it will revert.

## What is placeholder vs real

| Piece | Status |
|---|---|
| Contract address | Placeholder zero address — DO NOT invent one; set it after deployment |
| Player, table, fixtures, clubs, duels | Demo data in `src/demoData.ts` (invented) |
| League table / Top Scorers / Top Savers | Placeholder results, 3 rounds "played" |
| Team names Team A..P, captains TBD | Placeholders until captains name teams at formation |
| Season dates, matchdays, $KICK caps/splits, item prices, training numbers | Real — from DESIGN.md, in `src/config.ts` |
| Art | Real — flat-vector night stadium (`public/art/night-stadium.webp`) and item sheet (`public/art/items.webp`), copied from `../art-examples/` (chosen style). Pixel/anime examples are NOT used on the main site. See "Art pipeline" below — the .webp files are stored as base64 in the repo. |

## Art pipeline (2026-11-27 fix)

The two `.webp` files cannot be pushed to GitHub through the connector
(its snapshot push is UTF-8 text only, and the files are binary), so they
are stored as base64 text chunks in `art-src/` (`night-stadium.webp.b64.part-01..06`,
`items.webp.b64.part-01..04`) and reassembled by `scripts/decode-art.mjs`,
which runs first in `npm run build` and writes `public/art/*.webp` (Vite
then copies them into `dist/`, served as `/art/*.webp` and used as the
metadata `image` URLs). The script is idempotent and fails the build if a
chunk is missing or the decoded bytes fail the RIFF/WEBP check. If the art
is ever uploaded as real binary files instead (e.g. via the GitHub web UI),
delete `art-src/` and the decode step — the build works either way.

## Pages (8, all in the top nav)

1. **Stadium** (`#/`) — player card, next-match countdown (Sat Dec 5, 2026 19:00 WIB), league position, fatigue meter, $KICK balance.
2. **My Player** (`#/player`) — inline-SVG radar chart of the 5 stats, training history, injury status, inventory, record, season streak, Surplus Pool + unlock-new-stat buttons (20 surplus, new stat starts at 40), Immortal XI progress (x/5 stats at 99; trigger is ALL 5 at 99, total 495).
3. **Training Ground** (`#/training`) — 3 free slots/day, Light / Standard / Intense picker with fatigue + injury risk shown BEFORE confirm, Coach Session (0.001 BNB, +4 chosen stat, 3% injury, 1/day).
4. **Supermarket** (`#/market`) — $KICK items (Recovery Shake Pro 50, Energy Gel 30, Sleep Mask Pro 100, Knee Brace 50, Ankle Tape 20, Muscle Rub 100, Physio Session 100, Medical Kit 50, Cryotherapy 100), top-up panel (100 $KICK = 0.001 BNB, max 500/day), owned items with Use (burns) / Sell. Item colours: fatigue cyan/blue, prevention green, recovery purple/pink.
5. **League** (`#/league`) — live table (P W D L GF GA GD Pts Form), fixtures for all 8 rounds, Top Scorers, Top Savers. 16 teams, 2 groups of 8, 7 league rounds + finals week.
6. **Clubs** (`#/clubs`) — 16 team pages (list + detail), 11 starters + 4 subs, captain, join/request (first-come, first-served, slots remaining shown).
7. **Live Match Center** (`#/live`) — live score, minute-by-minute commentary, "your turn" live-moment panel, live table. Playable live-moment component (9-zone grid + timing bar, 10-second countdown) for Shoot / Save / Tackle / Pass; "Simulate a moment" runs a demo moment. Off-season shows next fixtures + last highlights.
8. **Duels / Arena** (`#/duels`) — daily 1v1s, open challenges, named callouts, duel history, live penalty shootout reusing the live-moment component.

## Agent ID gating

- **Public view:** League, Clubs, Live Match Center — anyone can watch.
- **Agent ID required to do anything:** mint, train, buy/use item, duel, play Saturday, join a team. Each action area shows a clear "Connect wallet with Agent ID to play" gate; in demo mode the gate explains actions are disabled until the contract is deployed.

## ABI status (verified 2026-11-27)

`src/abi.ts` is verified against the live contract ABI (Sourcify
exact_match) and live reads:

- `playerStats(uint256 tokenId)` returns `(uint8[5] stats, uint8 position, string playerName, uint256 total, uint256 overall)` — live: token 0 = [44, 47, 44, 59, 47], Midfielder, "Velt", 241, 48.
- `mintPlayer(string playerName, uint8 position)` — position 0=GK, 1=Defender, 2=Midfielder, 3=Forward.
- `coachSession(uint8 statIndex)` — statIndex 0-4 over the position's 5 stats.
- `topUpKick(uint256 kickAmount)` — amount in $KICK, multiple of 100.
- `unlockNewStat(uint8 newStatId)` — ids per DESIGN.md (GK 10-12, DF 20-22, MF 30-32, FW 40-42, universal 50-54).
- `useItem(uint256 itemTokenId)` — item token id.
- `hasAgentId` on the contract mirrors the registry check; the registry itself exposes `balanceOf` / `handleOf` (as in RamenForge).

## Styling

Dark night-stadium theme, flat vector, neon cyan accent (`#22e6ff`), no
external font/CDN dependencies — the build works offline.
