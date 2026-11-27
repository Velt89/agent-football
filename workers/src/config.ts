// Agent Football — shared constants. Single source of truth, mirroring DESIGN.md.
// Nothing here is deployed; contract address stays zero until a real deploy.
export const CONTRACT_ADDRESS = "0x0000000000000000000000000000000000000000";
export const DEPLOYED = false;
export const REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
export const CHAIN_ID = 56; // BSC mainnet
export const MAIN_WALLET = "0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A";

export const SEASON = {
  season: 1,
  seasonStart: "2026-12-01",
  preseasonStart: "2026-11-27",
  preseasonEnd: "2026-11-30",
  finalsDate: "2027-01-23",
  matchdays: ["2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26", "2027-01-02", "2027-01-09", "2027-01-16"],
  matchSlotsWib: ["19:00", "20:00"],
  teamsTotal: 16,
  squadSize: 15,
  starters: 11,
  subs: 4,
  groups: ["A", "B"],
} as const;

export type Position = "GK" | "DF" | "MF" | "FW";

export const POSITION_STATS: Record<Position, string[]> = {
  GK: ["Reflexes", "Diving", "Handling", "Distribution", "Positioning"],
  DF: ["Tackling", "Marking", "Heading", "Strength", "Pace"],
  MF: ["Passing", "Vision", "Dribbling", "Stamina", "Long Shots"],
  FW: ["Finishing", "Pace", "Dribbling", "Heading", "Off the Ball"],
};

export const STAT_CAP = 99;
export const STAT_START_MIN = 40;
export const STAT_START_MAX = 60;

// Surplus unlocks (DESIGN.md update 2026-11-27 11:40 WIB). Cost 20 surplus, new stat starts at 40.
export const SURPLUS_UNLOCK_COST = 20;
export const SURPLUS_UNLOCK_START = 40;
export const SPECIALIST_UNLOCKS: Record<Position, string[]> = {
  GK: ["Penalty Saving", "Command of Area", "Sweeper Keeper"],
  DF: ["Anticipation", "Ball Playing", "Leadership"],
  MF: ["Set Pieces", "Creativity / Flair", "Work Rate"],
  FW: ["Weak Foot", "Composure / Clutch", "Skill Moves"],
};
export const UNIVERSAL_UNLOCKS = ["Leadership", "Clutch", "Durability", "Consistency", "Versatility"];
// Durability = -20% injury chance permanently (applied in injury-chance calc when unlocked).

export const IMMORTAL_BADGE = "Immortal XI";
export const LEGEND_NFT: Record<Position, string> = {
  FW: "Golden Boot Legend",
  GK: "Golden Glove Legend",
  DF: "Golden Shield Legend",
  MF: "Golden Playmaker Legend",
};

// Training (DESIGN.md, locked). Gains / fatigue / injury ranges per intensity.
export type Intensity = "light" | "standard" | "intense";
export const TRAINING: Record<
  Intensity,
  { gainMin: number; gainMax: number; fatigue: number; injuryMin: number; injuryMax: number; minutes: string }
> = {
  light: { gainMin: 1, gainMax: 1, fatigue: 10, injuryMin: 0, injuryMax: 2, minutes: "15-20" },
  standard: { gainMin: 2, gainMax: 3, fatigue: 25, injuryMin: 5, injuryMax: 8, minutes: "30-45" },
  intense: { gainMin: 4, gainMax: 5, fatigue: 45, injuryMin: 15, injuryMax: 25, minutes: "60-90" },
};
export const TRAININGS_PER_DAY = 3;
export const FATIGUE_DOUBLE_INJURY_ABOVE = 70;
export const FATIGUE_FORCED_REST_ABOVE = 90;
export const KICK_PER_TRAINING = 10;

// 1-on-1 Coach Session: 1/day, 0.001 BNB, +4 to one stat, 3% injury, +20 fatigue.
// Intent only in S1 backend — NO broadcast. Frontend uses the returned calldata at deploy time.
export const COACH = {
  perDay: 1,
  costBnb: "0.001",
  costWei: "1000000000000000",
  gain: 4,
  injuryPct: 3,
  fatigue: 20,
  minutes: "60",
  // Placeholder selector: the real coachSession(uint8) selector is set at contract deploy.
  // Returned calldata is therefore explicitly marked placeholder until then.
  calldataPlaceholder: "0x00000000",
} as const;

// Daily free items (1/day, gas only on-chain at mint; off-chain draw in S1 backend).
export type DailyItemId = "protein_shake" | "vitamin_cd" | "electrolyte_drink" | "banana" | "ice_bath";
export const DAILY_ITEMS: { id: DailyItemId; name: string; effect: string }[] = [
  { id: "protein_shake", name: "Protein Shake", effect: "-20 fatigue" },
  { id: "vitamin_cd", name: "Vitamin C/D", effect: "-50% injury chance next training" },
  { id: "electrolyte_drink", name: "Electrolyte Drink", effect: "-10 fatigue" },
  { id: "banana", name: "Banana", effect: "-5 fatigue" },
  { id: "ice_bath", name: "Ice Bath", effect: "heal 1 day faster" },
];

// Supermarket items — $KICK prices locked for build (DESIGN.md: Recovery Shake Pro ~50, Physio ~100, etc.).
export type SupermarketItemId =
  | "recovery_shake_pro"
  | "energy_gel"
  | "sleep_mask_pro"
  | "knee_brace"
  | "ankle_tape"
  | "muscle_rub"
  | "physio_session"
  | "medical_kit"
  | "cryotherapy";
export const SUPERMARKET_ITEMS: {
  id: SupermarketItemId;
  name: string;
  priceKick: number;
  category: "fatigue" | "prevention" | "recovery";
  effect: string;
}[] = [
  { id: "recovery_shake_pro", name: "Recovery Shake Pro", priceKick: 50, category: "fatigue", effect: "-50 fatigue" },
  { id: "energy_gel", name: "Energy Gel", priceKick: 30, category: "fatigue", effect: "+1 extra Light training today" },
  { id: "sleep_mask_pro", name: "Sleep Mask Pro", priceKick: 100, category: "fatigue", effect: "full fatigue reset overnight" },
  { id: "knee_brace", name: "Knee Brace", priceKick: 50, category: "prevention", effect: "-75% injury chance for next 3 trainings" },
  { id: "ankle_tape", name: "Ankle Tape", priceKick: 20, category: "prevention", effect: "-50% injury chance, +5% tackle success today" },
  { id: "muscle_rub", name: "Muscle Rub", priceKick: 100, category: "prevention", effect: "if injured today, Minor only, never worse" },
  { id: "physio_session", name: "Physio Session", priceKick: 100, category: "recovery", effect: "heal 2 days faster" },
  { id: "medical_kit", name: "Medical Kit", priceKick: 50, category: "recovery", effect: "heal a Minor injury instantly" },
  { id: "cryotherapy", name: "Cryotherapy", priceKick: 100, category: "recovery", effect: "-40 fatigue + heal 1 day faster" },
];
export const SUPERMARKET_USE_PER_DAY = 3;
export const SUPERMARKET_RECOVERY_PER_DAY = 1;

// $KICK (DESIGN.md, locked).
export const KICK = {
  name: "$KICK",
  totalCap: 10_000_000,
  season1Cap: 3_000_000,
  earnReserve: 2_250_000,
  topupReserve: 750_000,
  maxEarnedPerWeek: 500,
  maxHeld: 5_000,
  perTraining: 10,
  perDuelWin: 20,
  perMatchWin: 50,
  perMatchDraw: 20,
  perGoalCleanSheetSave: 5,
  // Spend split: 30% burn / 65% reward pool / 5% creator.
  burnPct: 30,
  rewardPoolPct: 65,
  creatorPct: 5,
  // Top-up: 100 $KICK = 0.001 BNB, max 500/day. BNB sales split 90% rewards / 8% buyback / 2% creator.
  topupKickPerBnb: 100,
  topupBnbPer100Kick: "0.001",
  topupMaxPerDay: 500,
  bnbSplit: { rewardsPct: 90, buybackPct: 8, creatorPct: 2 },
  noLiquiditySeason1: true,
} as const;

// Weekly rewards pool = 90% BNB sales that week + 65% $KICK spent that week.
export const WEEKLY_REWARD_SPLIT = {
  teamOfWeekPct: 40,
  topScorerPct: 20,
  bestGkPct: 15,
  manOfWeekPct: 15,
  hardestTrainerPct: 10,
} as const;

export const TEAM_NAMES = [
  "Team A", "Team B", "Team C", "Team D", "Team E", "Team F", "Team G", "Team H",
  "Team I", "Team J", "Team K", "Team L", "Team M", "Team N", "Team O", "Team P",
] as const;

export function utcDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
export function isoWeek(d = new Date()): string {
  // ISO week label YYYY-Www (UTC).
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fday = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fday + 3);
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
