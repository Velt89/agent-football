// Agent Football ABI — minimal subset, VERIFIED against the live contract
// 0xD033236A4450DE1703CF63888355c2a29B4D62D8 (Sourcify exact_match,
// matchId 60053691) and against live reads on 2026-11-27.
// Views (name, symbol, totalMinted, playersCount, hasPlayer, playerOf,
// playerStats, surplusPointsOf, unlockedStatsOf, tokenKind, tokenItem,
// baseURI) match contracts/AgentFootball.sol exactly.
// Writes (mintPlayer, dailyDraw, changePosition, coachSession, topUpKick,
// unlockNewStat, claimImmortalReward, useItem) are the contract's
// signatures from the same source; they are NOT wired to a wallet in this
// build — no transaction can be sent from this site yet.

export const registryAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "handleOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "hasAgentId",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

export const agentFootballAbi = [
  // --- Views (VERIFIED against the live contract ABI, 2026-11-27) ---
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "totalMinted",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "playersCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "hasPlayer",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "playerOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "surplusPointsOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "unlockedStatsOf",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "ids", type: "uint8[]" },
      { name: "values", type: "uint8[]" },
    ],
  },
  {
    type: "function",
    name: "tokenKind",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "tokenItem",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "baseURI",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  // --- Player ---
  {
    type: "function",
    name: "mintPlayer",
    stateMutability: "nonpayable",
    // Mint + Day 1 item draw together in ONE tx, gas only.
    // name is unique at mint (first-come); position 0=GK, 1=Defender,
    // 2=Midfielder, 3=Forward.
    inputs: [
      { name: "playerName", type: "string" },
      { name: "position", type: "uint8" },
    ],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    type: "function",
    name: "playerStats",
    stateMutability: "view",
    // VERIFIED against contracts/AgentFootball.sol + live reads 2026-11-27:
    // playerStats(uint256 tokenId) returns
    // (uint8[5] stats, uint8 position, string playerName, uint256 total, uint256 overall).
    // Live: playerStats(0) = [44, 47, 44, 59, 47], position 2 (Midfielder),
    // name "Velt", total 241, overall 48.
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "stats", type: "uint8[5]" },
      { name: "position", type: "uint8" },
      { name: "playerName", type: "string" },
      { name: "total", type: "uint256" },
      { name: "overall", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "changePosition",
    stateMutability: "payable",
    // 0.001 BNB, max 1 per season. Total stats preserved, allocation
    // re-randomised for the new position.
    inputs: [{ name: "newPosition", type: "uint8" }],
    outputs: [],
  },
  // --- Daily draw ---
  {
    type: "function",
    name: "dailyDraw",
    stateMutability: "nonpayable",
    // 1 free draw/day, gas only. From Day 2 its own tx; Day 1 bundled
    // into mintPlayer.
    inputs: [],
    outputs: [{ name: "itemId", type: "uint256" }],
  },
  // --- Coach session ---
  {
    type: "function",
    name: "coachSession",
    stateMutability: "payable",
    // 0.001 BNB, +4 to a chosen stat, 3% injury, +20 fatigue, 1/day.
    // ASSUMPTION: statIndex 0-4 indexes the position's 5 stats.
    inputs: [{ name: "statIndex", type: "uint8" }],
    outputs: [],
  },
  // --- $KICK top-up ---
  {
    type: "function",
    name: "topUpKick",
    stateMutability: "payable",
    // 100 $KICK = 0.001 BNB, max 500 $KICK/day per player.
    // ASSUMPTION: amount is in $KICK (must be a multiple of 100).
    inputs: [{ name: "kickAmount", type: "uint256" }],
    outputs: [],
  },
  // --- Surplus unlocks / all-99 reward ---
  {
    type: "function",
    name: "unlockNewStat",
    stateMutability: "nonpayable",
    // Costs 20 surplus points; new stat starts at 40.
    // VERIFIED against contracts/AgentFootball.sol 2026-11-27:
    // unlockNewStat(uint8 newStatId) — ids per DESIGN.md
    // (GK 10-12, DF 20-22, MF 30-32, FW 40-42, universal 50-54).
    inputs: [{ name: "newStatId", type: "uint8" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimImmortalReward",
    stateMutability: "nonpayable",
    // Trigger: ALL 5 base stats at 99 (total 495). Mints the soulbound
    // Immortal XI badge + the position's tradeable Legend NFT.
    inputs: [],
    outputs: [],
  },
  // --- Items ---
  {
    type: "function",
    name: "useItem",
    stateMutability: "nonpayable",
    // Supermarket / daily items are NFTs, burned after use.
    // ASSUMPTION: item token id.
    inputs: [{ name: "itemTokenId", type: "uint256" }],
    outputs: [],
  },
  // --- Views ---
  {
    type: "function",
    name: "hasAgentId",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "creator",
    stateMutability: "view",
    inputs: [],
    // Explicit constructor argument = the user's wallet W (NOT msg.sender
    // from a CREATE2 proxy — the Fateborn v1 lesson).
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "rewardPool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;
