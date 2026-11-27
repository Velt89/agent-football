import { bsc } from "viem/chains";

// BNB Chain mainnet
export const CHAIN = bsc; // id 56
export const CHAIN_ID = 56;

// ---------------------------------------------------------------------------
// Contract — DEPLOYED 2026-11-27 12:14 WIB via BAW CREATE2 proxy.
// Tx 0xc13ca21735b9d571aa9ff3166599a7afa4108e91be616841617dd78131573d1b,
// block 135980878, gas 4,765,557. Sourcify VERIFIED exact_match
// (creationMatch + runtimeMatch, matchId 60053691).
// Creator passed as an explicit constructor argument (never msg.sender
// via CREATE2 proxy — the Fateborn v1 lesson).
// ---------------------------------------------------------------------------
export const CONTRACT_ADDRESS =
  "0xD033236A4450DE1703CF63888355c2a29B4D62D8" as const;
export const DEPLOYED = true;
export const DEPLOY_BLOCK = 135980878;

// SPACE ID Agent ID registry (ERC-721, non-transferable) — verified live.
// balanceOf(address) > 0 means the address holds an Agent ID.
export const AGENT_ID_REGISTRY =
  "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F" as const;

// Creator / main wallet (BAW), Agent ID velt.ai.
export const CREATOR_WALLET =
  "0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A" as const;

// ---------------------------------------------------------------------------
// Season — DESIGN.md (locked)
// ---------------------------------------------------------------------------
export const SEASON_1_START = "2026-12-01"; // Tuesday, Dec 1 2026
export const PRESEASON_START = "2026-11-27";
export const PRESEASON_END = "2026-11-30";
export const FINALS_DATE = "2027-01-23";

// Matchdays: Saturdays Dec 5, 12, 19, 26, Jan 2, 9, 16, Finals Jan 23 2027.
// 19:00 WIB — 4 matches live in parallel; 20:00 WIB — 4 matches.
export const MATCHDAYS = [
  { round: 1, date: "2026-12-05", label: "Round 1" },
  { round: 2, date: "2026-12-12", label: "Round 2" },
  { round: 3, date: "2026-12-19", label: "Round 3" },
  { round: 4, date: "2026-12-26", label: "Round 4 — transfer window" },
  { round: 5, date: "2027-01-02", label: "Round 5" },
  { round: 6, date: "2027-01-09", label: "Round 6" },
  { round: 7, date: "2027-01-16", label: "Round 7" },
  { round: 8, date: "2027-01-23", label: "Finals Day" },
] as const;

// Next match countdown target: Sat Dec 5, 2026 19:00 WIB (UTC+7).
export const NEXT_MATCH_ISO = "2026-12-05T19:00:00+07:00";

// ---------------------------------------------------------------------------
// Positions — 4 positions, 5 stats each. Start 40-60 random per stat,
// cap 99 per stat. Overall = average of the 5 stats.
// ---------------------------------------------------------------------------
export const POSITIONS = {
  Goalkeeper: ["Reflexes", "Diving", "Handling", "Distribution", "Positioning"],
  Defender: ["Tackling", "Marking", "Heading", "Strength", "Pace"],
  Midfielder: ["Passing", "Vision", "Dribbling", "Stamina", "Long Shots"],
  Forward: ["Finishing", "Pace", "Dribbling", "Heading", "Off the Ball"],
} as const;
export type PositionName = keyof typeof POSITIONS;

// Surplus Pool — when a stat hits 99, further training on it accrues as
// surplus (1 per +1). 20 surplus unlocks a new stat, starting at 40.
export const SURPLUS_UNLOCK_COST = 20;
export const NEW_STAT_START = 40;
export const ALL_99_TOTAL = 495; // 5 stats x 99

export const SPECIALIST_UNLOCKS: Record<PositionName, string[]> = {
  Goalkeeper: ["Penalty Saving", "Command of Area", "Sweeper Keeper"],
  Defender: ["Anticipation", "Ball Playing", "Leadership"],
  Midfielder: ["Set Pieces", "Creativity / Flair", "Work Rate"],
  Forward: ["Weak Foot", "Composure / Clutch", "Skill Moves"],
};
export const UNIVERSAL_UNLOCKS = [
  "Leadership",
  "Clutch",
  "Durability (-20% injury chance, permanent)",
  "Consistency",
  "Versatility (play a second position at 80% of stats)",
] as const;

// All-99 reward (trigger: ALL 5 base stats at 99, total 495 — NOT one stat).
export const IMMORTAL_BADGE = "Immortal XI"; // soulbound badge
export const IMMORTAL_NFT: Record<PositionName, string> = {
  Forward: "Golden Boot Legend",
  Goalkeeper: "Golden Glove Legend",
  Defender: "Golden Shield Legend",
  Midfielder: "Golden Playmaker Legend",
}; // tradeable NFT

// ---------------------------------------------------------------------------
// Training — DESIGN.md (locked). 3 free trainings/day, off-chain in S1.
// Fatigue: Light +10, Standard +25, Intense +45. Over 70 fatigue injury
// chance doubles; over 90 forced to rest.
// ---------------------------------------------------------------------------
export const TRAINING_TYPES = [
  {
    id: "light",
    name: "Light",
    minutes: "15-20 min",
    gain: "+1 stat",
    injury: "0-2%",
    fatigue: 10,
    examples: "Video Analysis, Stretching, Positioning Walkthrough",
  },
  {
    id: "standard",
    name: "Standard",
    minutes: "30-45 min",
    gain: "+2-3 stats",
    injury: "5-8%",
    fatigue: 25,
    examples: "Finishing Drill, Rondo, 1v1 Defending, Catching Crosses",
  },
  {
    id: "intense",
    name: "Intense",
    minutes: "60-90 min",
    gain: "+4-5 stats",
    injury: "15-25%",
    fatigue: 45,
    examples: "Sprint Intervals, Aerial Duels, Full Shooting Session",
  },
] as const;
export const MAX_FREE_TRAININGS_PER_DAY = 3;

// 1-on-1 Coach Session: 0.001 BNB, +4 to a chosen stat, 3% injury,
// +20 fatigue, 1/day, on top of the 3 free trainings.
export const COACH_SESSION = {
  priceBnb: "0.001",
  gain: 4,
  injury: "3%",
  fatigue: 20,
  perDay: 1,
} as const;

// Position change: 0.001 BNB, max 1 per season. Total stats preserved,
// allocation re-randomised for the new position. Name never changes.
export const POSITION_CHANGE = { priceBnb: "0.001", perSeason: 1 } as const;

// ---------------------------------------------------------------------------
// $KICK — DESIGN.md (locked)
// Season 1: off-chain points, no price, no trading, no liquidity, no buyback.
// Earn by playing only. Top-up $KICK comes from the capped 750,000 reserve.
// ---------------------------------------------------------------------------
export const KICK = {
  totalCap: 10_000_000,
  season1Cap: 3_000_000,
  season1EarnReserve: 2_250_000,
  season1TopUpReserve: 750_000,
  maxEarnedPerWeek: 500,
  maxHeld: 5_000,
  // Earn rates
  earnTraining: 10,
  earnDuelWin: 20,
  earnMatchWin: 50,
  earnMatchDraw: 20,
  earnGoalCleanSheetSave: 5,
  // Spend split: 30% burned, 65% reward pool, 5% creator
  spendBurnPct: 30,
  spendRewardPoolPct: 65,
  spendCreatorPct: 5,
  // BNB sales split: 90% weekly reward, 8% buyback treasury, 2% creator
  bnbRewardPct: 90,
  bnbBuybackPct: 8,
  bnbCreatorPct: 2,
  // Top-up: 100 $KICK = 0.001 BNB, max 500 $KICK/day per player
  topUpKickPerBnb: 100,
  topUpPriceBnb: "0.001",
  topUpMaxPerDay: 500,
} as const;

// ---------------------------------------------------------------------------
// Supermarket — DESIGN.md (locked). Items are NFTs, tradeable before use,
// BURNED after use. Max 3 Supermarket items used/day, max 1 injury-recovery
// item/day. Prices in $KICK (set at build from earn rates).
// ---------------------------------------------------------------------------
export type ItemCategory = "fatigue" | "prevention" | "recovery";
export const SUPERMARKET_ITEMS: {
  name: string;
  price: number;
  category: ItemCategory;
  effect: string;
  recovery?: boolean;
}[] = [
  { name: "Recovery Shake Pro", price: 50, category: "fatigue", effect: "-50 fatigue" },
  { name: "Energy Gel", price: 30, category: "fatigue", effect: "+1 extra Light training today" },
  { name: "Sleep Mask Pro", price: 100, category: "fatigue", effect: "Full fatigue reset overnight" },
  { name: "Knee Brace", price: 50, category: "prevention", effect: "-75% injury chance for next 3 trainings" },
  { name: "Ankle Tape", price: 20, category: "prevention", effect: "-50% injury chance, +5% tackle success today" },
  { name: "Muscle Rub", price: 100, category: "prevention", effect: "If injured today, Minor only, never worse" },
  { name: "Physio Session", price: 100, category: "recovery", effect: "Heal 2 days faster", recovery: true },
  { name: "Medical Kit", price: 50, category: "recovery", effect: "Heal a Minor injury instantly", recovery: true },
  { name: "Cryotherapy", price: 100, category: "recovery", effect: "-40 fatigue + heal 1 day faster", recovery: true },
];

// Daily free draw pool (gas only, 1/day): all legal real-life items.
export const DAILY_DRAW_POOL = [
  { name: "Protein Shake", effect: "-20 fatigue" },
  { name: "Vitamin C/D", effect: "-50% injury chance next training" },
  { name: "Electrolyte Drink", effect: "-10 fatigue" },
  { name: "Banana", effect: "-5 fatigue" },
  { name: "Ice Bath", effect: "Heal 1 day faster" },
] as const;

// ---------------------------------------------------------------------------
// League — DESIGN.md (locked). 16 teams, 2 groups of 8, 7 league rounds +
// finals week. 11 starters + 4 subs = 15 squad, 240 players total.
// Points: Win 3, Draw 1, Loss 0. Tiebreak: GD, GF, Head-to-Head,
// Live Moments Won. Transfer window Week 4: 1 move per team.
// ---------------------------------------------------------------------------
export const TEAM_COUNT = 16;
export const SQUAD_SIZE = 15;
export const STARTERS = 11;
export const SUBS = 4;
export const TOTAL_PLAYERS = 240;

// Weekly rewards (Sunday Envelope, BNB + $KICK): Team of the Week 40%,
// Top Scorer 20%, Best GK 15%, Man of the Week 15%, Hardest Trainer 10%.
export const WEEKLY_REWARDS = [
  { name: "Team of the Week", pct: 40, note: "Best result that week, split between the 15 squad" },
  { name: "Top Scorer", pct: 20, note: "Most goals that week" },
  { name: "Best GK", pct: 15, note: "Most saves in live moments" },
  { name: "Man of the Week", pct: 15, note: "Most live moments won, any position" },
  { name: "Hardest Trainer", pct: 10, note: "Most trainings completed that week with no injury" },
] as const;

// Kit colours — 16 distinct team colours (8/16 teams get distinct kit
// colours per DESIGN.md; GKs get a distinct kit colour: bright yellow/pink).
export const TEAM_COLOURS = [
  "#22e6ff", "#7dff9e", "#ffd23f", "#ff5d8f", "#b388ff", "#ff8a3d",
  "#3dffc8", "#ff4d4d", "#4d9fff", "#e6ff4d", "#ff9ff3", "#4dff88",
  "#ffb84d", "#9d4dff", "#4dd8ff", "#ff6b6b",
] as const;

export function artImage(name: string): string {
  return `/art/${name}`;
}
