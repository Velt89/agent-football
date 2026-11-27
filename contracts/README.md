# AgentFootball — Contract README

**Status: BUILD ONLY — no deploy, no broadcast, no signing, no GitHub push.**
Design authority: `../DESIGN.md` (locked 2026-11-27). This file documents the
contract as built; where it differs from an earlier sketch, the contract wins
only if the difference is a bug — otherwise DESIGN.md wins and the contract
must be fixed.

## Files

| File | Purpose |
|---|---|
| `AgentFootball.sol` | The game contract (single contract, hand-rolled ERC-721, like RamenForge / Fateborn Mutant) |
| `MockAgentID.sol` | Test-only stand-in for the SPACE ID Agent ID registry. Never deploy live. |
| `AgentFootballTestHarness.sol` | Test-only setters (base stats, surplus, position). Never deploy live. |
| `../test/agentfootball.test.js` | 33 Hardhat tests |
| `../scripts/prepare-deploy.js` | Off-chain CREATE2 prediction + config print. Does NOT deploy. |

## Identity

- Name `AgentFootball`, symbol `AFB`, Season 1 (`seasonId() == 1`).
- Creator wallet W = `0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A`, passed as an
  **explicit constructor argument** — never `msg.sender` (Fateborn v1 broke
  because creator became the CREATE2 proxy). Stored `immutable`, exposed as
  `creator()` (and `owner()` alias).
- Agent ID registry = `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`
  (`balanceOf > 0` = holds Agent ID). `hasAgentId(address)` view.
- **Creator powers: exactly two, both narrow.**
  1. `setBaseURI(string)` — only before any mint; frozen after the first mint.
  2. `settleWeekly(address[] recipients, uint256[] amounts)` — distributes
     ONLY from `rewardPool`, sum ≤ pool, no recipient may be the creator,
     non-empty, lengths must match.
  - The creator **cannot** change odds, caps, stats, fees, positions, or
    withdraw the pool for itself. There is no owner/admin power over game
    rules. The 8% buyback treasury accrues in BNB in S1 and is never spent
    by any function in this contract (Season 2 buyback is a later step).

## Tokens (one contract, multi-kind ERC-721)

| Kind | Name | Transferable |
|---|---|---|
| 0 | Player (soulbound, 1 per Agent ID) | No |
| 1 | Item (daily draws) | Yes |
| 2 | Immortal XI Badge | No |
| 3 | Legend NFT (position) | Yes |

- ERC-2981 royalty: 5% to the contract → lands in the reward pool (`receive()`).
- `tokenURI(tokenId)` = `baseURI + tokenId` (dynamic metadata, Fateborn/AXR
  pattern — the Pages Functions endpoint reads `playerStats()`/`tokenKind()`
  and returns JSON; NOT IPFS, because a training player must change).
  Empty string until `setBaseURI` is called.

## Positions & stats

| Position | 5 stats (index order) |
|---|---|
| 0 Goalkeeper | Reflexes, Diving, Handling, Distribution, Positioning |
| 1 Defender | Tackling, Marking, Heading, Strength, Pace |
| 2 Midfielder | Passing, Vision, Dribbling, Stamina, Long Shots |
| 3 Forward | Finishing, Pace, Dribbling, Heading, Off the Ball |

- Start 40–60 random each, cap 99. `overall()` = average of the 5 base stats.
- `playerStats(tokenId)` → `(uint8[5] stats, uint8 position, string name, uint256 total, uint256 overall)`.

## Functions

### `mintPlayer(string name, uint8 position)` — gas only (non-payable)
- Requires: Agent ID, no existing player, name 1–32 bytes, name hash not
  already taken (first-come), position 0–3.
- Mints the Player NFT **and the Day-1 daily item in the SAME tx**. That
  draw counts as that UTC day's daily draw — `dailyDraw()` cannot be called
  again that day.
- Emits `PlayerMinted` + `ItemDrawn`.

### `dailyDraw()` — gas only (non-payable)
- 1 per UTC day per player, Agent ID + existing player required.
- Random item, uniform across the 5 daily items:
  0 Protein Shake, 1 Vitamin, 2 Electrolyte Drink, 3 Banana, 4 Ice Bath.
- Emits `ItemDrawn`.

### `changePosition(uint8 newPosition)` — payable, exactly 0.001 BNB
- Max 1 per season (Season 1). Reallocates the 5 base stats to the new
  position **preserving the total sum exactly**: each stat 20–99, sum
  preserved (sequential bounded random draw — at each slot the pick is
  clamped so the remaining slots can still reach the remaining total).
  Tested with totals 300 and 495 (all-99 stays all-99, the only feasible
  allocation). $KICK, items, history, unlocked stats untouched. Name never
  changes — **no rename function exists at all**.
- Fee splits 90/8/2 (see below). Emits `PositionChanged`.

### `coachSession(uint8 statIndex)` — payable, exactly 0.001 BNB
- Max 1 per UTC day per player. +4 to the chosen base stat, cap 99.
  Every +1 that would have exceeded 99 goes to `surplusPoints` instead
  (1 surplus per +1; e.g. 97 → 99 + 2 surplus; 99 → +4 surplus).
- **Injury is OFF-CHAIN (Workers).** The 3% figure is recorded in the
  `CoachSession` event only (`injuryChanceBps = 300`); the contract does
  not roll injury.
- Fee splits 90/8/2. Emits `CoachSession` (with pool/treasury/creator shares).

### `topUpKick(uint256 kickAmount)` — payable
- Buys $KICK with BNB **for the OFF-CHAIN ledger**: 100 $KICK per
  0.001 BNB. `kickAmount` must be a multiple of 100, 100–500 per call,
  max 500 per UTC day per player (on-chain daily tracking).
  `msg.value` must equal `kickAmount/100 * 0.001 ether` exactly.
- The Workers backend credits $KICK by indexing the `TopUp` event.
  **This contract holds NO $KICK token — do NOT deploy any $KICK ERC-20
  for Season 1.** Fee splits 90/8/2. Emits `TopUp`.

### `unlockNewStat(uint8 newStatId)` — gas only
- Spends 20 `surplusPoints`, sets the new stat to 40 (cap 99, trainable
  thereafter). Each new stat unlockable once.
- Valid ids: own position's specialists + universals 50–54:

| Position | Specialists |
|---|---|
| GK | 10 Penalty Saving, 11 Command of Area, 12 Sweeper Keeper |
| DF | 20 Anticipation, 21 Ball Playing, 22 Leadership |
| MF | 30 Set Pieces, 31 Creativity / Flair, 32 Work Rate |
| FW | 40 Weak Foot, 41 Composure / Clutch, 42 Skill Moves |
| Any | 50 Leadership, 51 Clutch, 52 Durability, 53 Consistency, 54 Versatility |

- `surplusPointsOf(address)`, `unlockedStatsOf(address)` → parallel
  `(ids, values)` arrays, `extraStatOf(tokenId, statId)` → `(unlocked, value)`.

### `claimImmortalReward()` — gas only
- **ONLY when ALL 5 base stats are exactly 99 (total 495).** A single 99
  does NOT qualify — it only accrues surplus.
- Mints the soulbound Immortal XI Badge (kind 2) **and** the position
  Legend NFT (kind 3, tradeable): FW 30 Golden Boot Legend, GK 31 Golden
  Glove Legend, DF 32 Golden Shield Legend, MF 33 Golden Playmaker Legend.
  Once per player only. Emits `ImmortalRewarded`.

### `useItem(uint256 tokenId)` — gas only
- Burns a tradeable Item NFT owned by the caller. The item's EFFECT
  (fatigue/injury) is applied **off-chain by Workers** — the contract only
  proves ownership + burn. Emits `ItemUsed`.

### `settleWeekly(address[] recipients, uint256[] amounts)` — creator only
- See Identity above. The ONLY creator power over funds. Emits
  `WeeklySettled`.

## Fee split (every BNB payment: coach + top-up)

| Share | Destination |
|---|---|
| 90% | `rewardPool` — weekly rewards, paid out only via `settleWeekly` |
| 8% | `buybackTreasury` — accrues in BNB in S1, unspent (Season 2 buyback) |
| 2% | creator wallet, paid immediately in the same tx |

Royalties (ERC-2981 5%) and plain BNB sent to the contract also join
`rewardPool` via `receive()`.

## On-chain / off-chain split (Season 1)

| On-chain (this contract) | Off-chain (Workers / D1 / KV) |
|---|---|
| Player mint + name/position/stats | Training (3/day, Light/Standard/Intense), fatigue, injury rolls |
| Daily item draw (1/day) | $KICK ledger (earn/spend/caps), Supermarket inventory & purchases |
| Coach Session (+4, surplus) | Coach injury roll (3%), live duels, Saturday 11v11, league table |
| $KICK top-up payment proof (`TopUp` event) | $KICK crediting, weekly Envelope computation |
| Position change (1/season, sum preserved) | Teams, transfers, spectators/predictions |
| Surplus unlocks, Immortal XI reward | Item effects on `useItem` burn |
| Weekly settle (creator → recipients) | Weekly award winners (Team of Week, Top Scorer, …) |

**Supermarket items (ids 10–18) in Season 1 are issued as off-chain
inventory by Workers and only become on-chain NFTs when a player chooses
to withdraw/trade them. There is deliberately NO creator mint function
for them** — `mintItemFor` / `mintSupermarketItem` do not exist in this
contract (a test asserts the ABI has no such function). Daily-draw items
and Legend NFTs are the only on-chain item mints in S1. The
`supermarketItemName(id)` view exists only so frontend/backend agree on
the id table (10 Recovery Shake Pro … 18 Cryotherapy).

**No $KICK ERC-20 exists in Season 1.** $KICK is off-chain points, no
price, no trading, no liquidity (per DESIGN.md). The on-chain token is a
Season 2 step.

## Randomness — honest limits

Draws and stat rolls are `keccak256(blockhash(prev), block.prevrandao,
sender, day, nonce)`, revealed at call time (same construction as
RamenForge/Fateborn Mutant). Public chain data, so a sophisticated caller
who can land a tx in an exact chosen block could bias their own single
daily draw / stat roll. Impact is bounded: 1 draw/day, 1 player per Agent
ID, stats capped at 99 with overflow going to surplus instead of
vanishing. No VRF oracle, deliberately, to keep the contract
dependency-free and self-contained.

## Verification (2026-11-27, build run)

- `npx hardhat compile` — **Compiled 3 Solidity files successfully, 0 warnings.**
- `npx hardhat test` — **33 passing, 0 failing.**
- Coverage includes: mint+Day1 in one tx, second mint reverts, name
  uniqueness (incl. 32-byte boundary), non-Agent-ID reverts, daily draw
  once/day, position change preserves total (300 and 495) + 0.001 fee +
  second change reverts, coach +4/cap/surplus/daily cap/fee split,
  top-up multiples/caps/fee split, surplus unlock cost + once-only +
  position tables, Immortal reward only at all-99 + once-only + correct
  position Legend, item burn, settleWeekly restrictions, creator is the
  constructor arg not msg.sender (deployed via a different deployer
  address in tests, `creator() == W` asserted).
- **Not deployed, not broadcast, nothing signed, nothing pushed.**
