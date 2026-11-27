// Agent Football — live match engine.
// A 10-minute real-time match = 90 game minutes, 12-15 key moments.
// Each moment: type (shoot/save/tackle/pass), involved positions, a 10-second
// play window, auto-play fallback on stats if no input. Halftime at minute 45.
// Man of the Match = most live moments won. Deterministic with a seed so a
// match can be replayed in tests: same (home, away, seed) -> same moments.
import type { Position } from "./config.js";

export type MomentType = "shoot" | "save" | "tackle" | "pass";
export type MomentOutcome =
  | "goal"
  | "saved"
  | "missed"
  | "tackle_won"
  | "beaten"
  | "pass_complete"
  | "pass_intercepted";

export interface MatchMoment {
  index: number;
  minute: number;
  type: MomentType;
  team: "home" | "away";
  positions: Position[]; // [actor, opponent] where applicable
  description: string;
  outcome: MomentOutcome;
  // Live-play window (seconds of real time the player has to respond).
  playWindowSeconds: number;
  // Which side "won" the moment (for Man of the Match counting).
  wonBy: "home" | "away";
  wonPosition: Position;
}

export interface MatchResult {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  seed: number;
  homeGoals: number;
  awayGoals: number;
  moments: MatchMoment[];
  halftime: { minute: 45; homeGoals: number; awayGoals: number };
  manOfTheMatch: { position: Position; momentsWon: number };
  durationRealMinutes: 10;
  gameMinutes: 90;
}

function fnv1a(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_MINUTES = [12, 23, 34, 41, 47, 58, 67, 74, 82, 89];
const EXTRA_MINUTES = [5, 8, 17, 27, 31, 38, 44, 52, 55, 62, 64, 71, 77, 80, 85, 87];
const SHOOT_DESCRIPTIONS = [
  "Striker through 1v1",
  "Winger cuts inside and shoots",
  "Forward latches onto a through ball",
  "Long-range effort from outside the box",
]; // "Penalty" (67') and "Corner header" (89') are fixed slots, not random picks.
const SAVE_DESCRIPTIONS = ["Keeper dives for a curling shot", "Point-blank reaction save", "Keeper claims a dangerous cross"];
const TACKLE_DESCRIPTIONS = ["Winger vs Defender 1v1", "Last-ditch tackle in the box", "Defender steps in to intercept the run"];
const PASS_DESCRIPTIONS = ["Midfielder threads a through ball", "Killer pass splits the defence", "Safe lane recycle under pressure"];

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export function generateMatch(homeTeam: string, awayTeam: string, seed?: number): MatchResult {
  const matchId = `${homeTeam}-v-${awayTeam}`.replace(/[^A-Za-z0-9]+/g, "-");
  const actualSeed = seed ?? fnv1a(`${homeTeam}|${awayTeam}`);
  const rng = mulberry32(actualSeed);
  // 12-15 moments: 10 base + 2-5 extras, sorted by minute.
  const extraCount = 2 + Math.floor(rng() * 4); // 2..5 -> total 12..15
  const extras = [...EXTRA_MINUTES].sort(() => rng() - 0.5).slice(0, extraCount);
  const minutes = [...BASE_MINUTES, ...extras].sort((a, b) => a - b);
  const moments: MatchMoment[] = [];
  let homeGoals = 0;
  let awayGoals = 0;
  let halftimeHome = 0;
  let halftimeAway = 0;
  const winsByPosition: Record<string, number> = {};
  const countWin = (pos: Position) => {
    winsByPosition[pos] = (winsByPosition[pos] ?? 0) + 1;
  };

  minutes.forEach((minute, i) => {
    const team: "home" | "away" = rng() < 0.5 ? "home" : "away";
    const roll = rng();
    let type: MomentType;
    if (minute === 12 || minute === 67) type = "shoot"; // 12' 1v1 + 67' penalty slots per DESIGN example
    else if (minute === 89) type = "shoot"; // 89' corner header slot
    else if (roll < 0.4) type = "shoot";
    else if (roll < 0.6) type = "save";
    else if (roll < 0.8) type = "tackle";
    else type = "pass";

    let description = "";
    let outcome: MomentOutcome;
    let wonBy: "home" | "away" = team;
    let wonPosition: Position;
    let positions: Position[];
    if (type === "shoot") {
      description = minute === 67 ? "Penalty" : minute === 89 ? "Corner header" : minute === 12 ? "Striker through 1v1" : pick(rng, SHOOT_DESCRIPTIONS);
      positions = ["FW", "GK"];
      const scored = rng() < 0.38; // ~38% of shooting moments become goals
      if (scored) {
        outcome = "goal";
        if (team === "home") homeGoals++;
        else awayGoals++;
        wonBy = team;
        wonPosition = "FW";
      } else if (rng() < 0.6) {
        outcome = "saved";
        wonBy = team === "home" ? "away" : "home";
        wonPosition = "GK";
      } else {
        outcome = "missed";
        wonBy = team === "home" ? "away" : "home";
        wonPosition = "GK";
      }
    } else if (type === "save") {
      description = pick(rng, SAVE_DESCRIPTIONS);
      positions = ["GK", "FW"];
      outcome = rng() < 0.72 ? "saved" : "goal";
      if (outcome === "goal") {
        if (team === "home") awayGoals++;
        else homeGoals++;
        wonBy = team === "home" ? "away" : "home";
        wonPosition = "FW";
      } else {
        wonBy = team;
        wonPosition = "GK";
      }
    } else if (type === "tackle") {
      description = minute === 34 ? "Winger vs Defender" : pick(rng, TACKLE_DESCRIPTIONS);
      positions = ["DF", "FW"];
      const won = rng() < 0.55;
      outcome = won ? "tackle_won" : "beaten";
      wonBy = won ? team : team === "home" ? "away" : "home";
      wonPosition = won ? "DF" : "FW";
    } else {
      description = pick(rng, PASS_DESCRIPTIONS);
      positions = ["MF", "MF"];
      const complete = rng() < 0.68;
      outcome = complete ? "pass_complete" : "pass_intercepted";
      wonBy = complete ? team : team === "home" ? "away" : "home";
      wonPosition = "MF";
    }
    countWin(wonPosition);
    moments.push({
      index: i + 1,
      minute,
      type,
      team,
      positions,
      description,
      outcome,
      playWindowSeconds: 10,
      wonBy,
      wonPosition,
    });
    if (minute <= 45) {
      halftimeHome = homeGoals;
      halftimeAway = awayGoals;
    }
  });

  let motmPos: Position = "FW";
  let motmWins = 0;
  for (const [pos, wins] of Object.entries(winsByPosition)) {
    if (wins > motmWins) {
      motmWins = wins;
      motmPos = pos as Position;
    }
  }
  return {
    matchId,
    homeTeam,
    awayTeam,
    seed: actualSeed,
    homeGoals,
    awayGoals,
    moments,
    halftime: { minute: 45, homeGoals: halftimeHome, awayGoals: halftimeAway },
    manOfTheMatch: { position: motmPos, momentsWon: motmWins },
    durationRealMinutes: 10,
    gameMinutes: 90,
  };
}

/** Resolve one live moment with player input (zone pick + timing 0..1).
 *  No input (or input after the 10s window) -> auto-play on stats only. */
export function resolveMoment(
  moment: MatchMoment,
  opts: { zone?: string; timing?: number; actorStat?: number; opponentStat?: number; autoPlay?: boolean }
): { outcome: MomentOutcome; skillBonus: boolean; wonBy: "home" | "away" } {
  const actor = opts.actorStat ?? 50;
  const opponent = opts.opponentStat ?? 50;
  const statEdge = (actor - opponent) / 100; // -0.5..0.5
  if (opts.autoPlay || opts.zone === undefined || opts.timing === undefined) {
    // Stats only, no skill bonus.
    const p = 0.5 + statEdge;
    const won = Math.random() < p;
    return { outcome: moment.outcome, skillBonus: false, wonBy: won ? moment.team : moment.team === "home" ? "away" : "home" };
  }
  // Skill: timing near 0.5 (centre of the bar) is perfect; zone match is a coin-flip
  // against the hidden target zone in live play — here the caller passes the result.
  const timingQuality = 1 - Math.abs(opts.timing - 0.5) * 2; // 0..1
  const p = 0.35 + statEdge + timingQuality * 0.4;
  const won = Math.random() < Math.min(0.95, Math.max(0.05, p));
  return { outcome: moment.outcome, skillBonus: true, wonBy: won ? moment.team : moment.team === "home" ? "away" : "home" };
}
