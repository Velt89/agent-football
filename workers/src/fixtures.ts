// Agent Football — deterministic fixture generator.
// 16 teams (Team A..P, placeholder names — captains name them at formation),
// 2 groups of 8, group round-robin 7 rounds, finals week cross-group by rank.
// Matchdays: Saturdays Dec 5, 12, 19, 26, Jan 2, 9, 16, Finals Jan 23 2027.
// Slots 19:00 and 20:00 WIB, 4 matches per slot in parallel (8 matches / Saturday).
import { SEASON, TEAM_NAMES } from "./config.js";

export interface Fixture {
  id: string;
  round: number; // 1-7 group rounds, 8 = finals week
  group: "A" | "B" | "Finals";
  home_team: string;
  away_team: string;
  match_date: string; // YYYY-MM-DD
  slot_wib: string; // "19:00" | "20:00"
  status: "scheduled" | "live" | "played";
  home_goals: number | null;
  away_goals: number | null;
}

export interface TeamSeed {
  id: string; // "A".."P"
  name: string;
  group: "A" | "B";
}

export function seedTeams(): TeamSeed[] {
  return TEAM_NAMES.map((name, i) => ({
    id: String.fromCharCode(65 + i),
    name,
    group: i < 8 ? ("A" as const) : ("B" as const),
  }));
}

function roundRobin(teamIds: string[]): string[][][] {
  // Circle method for 8 teams -> 7 rounds x 4 pairings. Deterministic.
  const teams = [...teamIds];
  const rounds: string[][][] = [];
  for (let r = 0; r < 7; r++) {
    const pairs: string[][] = [];
    for (let i = 0; i < 4; i++) {
      pairs.push([teams[i]!, teams[7 - i]!]);
    }
    rounds.push(pairs);
    // Rotate all but the first team.
    teams.splice(1, 0, teams.pop()!);
  }
  return rounds;
}

export function generateFixtures(): Fixture[] {
  const teams = seedTeams();
  const groupA = teams.filter((t) => t.group === "A").map((t) => t.name);
  const groupB = teams.filter((t) => t.group === "B").map((t) => t.name);
  const roundsA = roundRobin(groupA);
  const roundsB = roundRobin(groupB);
  const fixtures: Fixture[] = [];
  let n = 0;
  for (let r = 0; r < 7; r++) {
    const date = SEASON.matchdays[r]!;
    // 19:00 slot: Group A (4 matches). 20:00 slot: Group B (4 matches).
    for (const [home, away] of roundsA[r]!) {
      n++;
      fixtures.push({ id: `R${r + 1}-M${n}`, round: r + 1, group: "A", home_team: home!, away_team: away!, match_date: date, slot_wib: "19:00", status: "scheduled", home_goals: null, away_goals: null });
    }
    for (const [home, away] of roundsB[r]!) {
      n++;
      fixtures.push({ id: `R${r + 1}-M${n}`, round: r + 1, group: "B", home_team: home!, away_team: away!, match_date: date, slot_wib: "20:00", status: "scheduled", home_goals: null, away_goals: null });
    }
  }
  // Finals week (round 8, Jan 23 2027): 1st v 1st, 2nd v 2nd, ... 8th v 8th cross-group.
  // Ranks are not known until week 7 ends, so teams are rank placeholders resolved then.
  const finalsDate = SEASON.finalsDate;
  for (let rank = 1; rank <= 8; rank++) {
    n++;
    fixtures.push({
      id: `F-M${n}`,
      round: 8,
      group: "Finals",
      home_team: `Group A Rank ${rank}`,
      away_team: `Group B Rank ${rank}`,
      match_date: finalsDate,
      slot_wib: rank <= 4 ? "19:00" : "20:00",
      status: "scheduled",
      home_goals: null,
      away_goals: null,
    });
  }
  return fixtures;
}

export function fixtureSummary(fixtures: Fixture[]): Record<string, number> {
  return {
    teams: 16,
    groups: 2,
    groupRounds: 7,
    groupMatches: fixtures.filter((f) => f.round <= 7).length,
    finalsMatches: fixtures.filter((f) => f.round === 8).length,
    totalMatches: fixtures.length,
    matchdays: new Set(fixtures.map((f) => f.match_date)).size,
  };
}
