// Demo data — shown when no wallet is connected and while the contract
// is not deployed (config.ts DEPLOYED = false). Every number here is
// invented placeholder data for the UI only; nothing here is a live read.
// Replace with on-chain / API reads once the contract is deployed.

export const DEMO_PLAYER = {
  name: "Velt",
  position: "Forward" as const,
  positionIndex: 3,
  tokenId: 1,
  stats: [
    { name: "Finishing", value: 72 },
    { name: "Pace", value: 68 },
    { name: "Dribbling", value: 64 },
    { name: "Heading", value: 58 },
    { name: "Off the Ball", value: 61 },
  ],
  // 2 of 5 stats at 99 would be needed for the demo of Immortal progress;
  // demo player is mid-growth: 0 at 99, surplus 14 (needs 20 to unlock).
  surplusPool: 14,
  fatigue: 45,
  kickBalance: 320,
  kickEarnedThisWeek: 180,
  injured: false,
  injury: null as null | { type: string; daysLeft: number },
  streak: 4, // season streak (days)
  team: "Team A",
  teamColour: "#22e6ff",
  goals: 3,
  saves: 0,
  duelsWon: 5,
  duelsLost: 2,
  liveMomentsWon: 9,
  trainingsThisWeek: 12,
  inventory: [
    { id: 101, name: "Protein Shake", source: "Daily draw", effect: "-20 fatigue", owned: 2 },
    { id: 102, name: "Recovery Shake Pro", source: "Supermarket", effect: "-50 fatigue", owned: 1 },
    { id: 103, name: "Ankle Tape", source: "Supermarket", effect: "-50% injury chance, +5% tackle success today", owned: 1 },
    { id: 104, name: "Banana", source: "Daily draw", effect: "-5 fatigue", owned: 1 },
  ],
  trainingHistory: [
    { day: "Thu Nov 26", drill: "Finishing Drill (Intense)", stat: "Finishing", gain: "+4", kick: "+10" },
    { day: "Thu Nov 26", drill: "Sprint Intervals (Standard)", stat: "Pace", gain: "+2", kick: "+10" },
    { day: "Thu Nov 26", drill: "Video Analysis (Light)", stat: "Off the Ball", gain: "+1", kick: "+10" },
    { day: "Wed Nov 25", drill: "Full Shooting Session (Intense)", stat: "Finishing", gain: "+5", kick: "+10" },
    { day: "Wed Nov 25", drill: "Rondo (Standard)", stat: "Dribbling", gain: "+3", kick: "+10" },
    { day: "Wed Nov 25", drill: "Stretching (Light)", stat: "Heading", gain: "+1", kick: "+10" },
  ],
  // Demo: one stat already at 99 in the "near-Immortal" showcase player.
  immortalDemo: {
    statsAt99: 2,
    showcaseStats: [99, 99, 81, 74, 70],
  },
};

export function overallOf(stats: { value: number }[]): number {
  return Math.round(stats.reduce((s, x) => s + x.value, 0) / stats.length);
}

export interface TableRow {
  team: string;
  captain: string;
  p: number; w: number; d: number; l: number;
  gf: number; ga: number; pts: number;
  form: string[];
}
export function gd(r: TableRow): number { return r.gf - r.ga; }

function mkTable(teams: string[]): TableRow[] {
  // Deterministic placeholder table (3 rounds "played").
  const seed: Array<[number, number, number, number, number, number, string[]]> = [
    [3, 2, 1, 0, 7, 3, ["W", "W", "D"]],
    [3, 2, 0, 1, 6, 4, ["W", "L", "W"]],
    [3, 1, 2, 0, 5, 3, ["D", "W", "D"]],
    [3, 1, 1, 1, 4, 4, ["L", "W", "D"]],
    [3, 1, 1, 1, 3, 4, ["D", "L", "W"]],
    [3, 1, 0, 2, 4, 6, ["L", "W", "L"]],
    [3, 0, 1, 2, 2, 5, ["L", "D", "L"]],
    [3, 0, 0, 3, 1, 7, ["L", "L", "L"]],
  ];
  return teams.map((team, i) => {
    const [p, w, d, l, gf, ga, form] = seed[i % seed.length];
    return { team, captain: "TBD", p, w, d, l, gf, ga, pts: w * 3 + d, form };
  }).sort((a, b) => b.pts - a.pts || gd(b) - gd(a));
}

export const GROUP_A_TEAMS = ["Team A", "Team B", "Team C", "Team D", "Team E", "Team F", "Team G", "Team H"];
export const GROUP_B_TEAMS = ["Team I", "Team J", "Team K", "Team L", "Team M", "Team N", "Team O", "Team P"];
export const GROUP_A_TABLE = mkTable(GROUP_A_TEAMS);
export const GROUP_B_TABLE = mkTable(GROUP_B_TEAMS);

export const FIXTURES = [
  { round: 1, date: "Sat Dec 5", time: "19:00 WIB", home: "Team A", away: "Team B", score: null as string | null },
  { round: 1, date: "Sat Dec 5", time: "19:00 WIB", home: "Team C", away: "Team D", score: null },
  { round: 1, date: "Sat Dec 5", time: "20:00 WIB", home: "Team E", away: "Team F", score: null },
  { round: 1, date: "Sat Dec 5", time: "20:00 WIB", home: "Team G", away: "Team H", score: null },
  { round: 1, date: "Sat Dec 5", time: "19:00 WIB", home: "Team I", away: "Team J", score: null },
  { round: 1, date: "Sat Dec 5", time: "20:00 WIB", home: "Team K", away: "Team L", score: null },
  { round: 2, date: "Sat Dec 12", time: "19:00 WIB", home: "Team A", away: "Team C", score: null },
  { round: 2, date: "Sat Dec 12", time: "20:00 WIB", home: "Team B", away: "Team D", score: null },
  { round: 8, date: "Sat Jan 23", time: "19:00 WIB", home: "Group A winner", away: "Group B winner", score: null },
  { round: 8, date: "Sat Jan 23", time: "20:00 WIB", home: "Group A 2nd", away: "Group B 2nd", score: null },
];

export const TOP_SCORERS = [
  { player: "Velt (Team A)", goals: 3 },
  { player: "Demo Striker (Team C)", goals: 2 },
  { player: "Demo Winger (Team E)", goals: 2 },
  { player: "Demo Forward (Team J)", goals: 1 },
];
export const TOP_SAVERS = [
  { player: "Demo GK (Team B)", saves: 6 },
  { player: "Demo GK (Team D)", saves: 5 },
  { player: "Demo GK (Team A)", saves: 4 },
];

export interface Club {
  name: string;
  group: "A" | "B";
  colour: string;
  captain: string;
  slotsLeft: number;
  squad: { name: string; position: string; overall: number; starter: boolean }[];
}
function mkSquad(team: string): Club["squad"] {
  const positions = ["Goalkeeper", "Defender", "Defender", "Defender", "Defender", "Midfielder", "Midfielder", "Midfielder", "Midfielder", "Forward", "Forward", "Defender", "Midfielder", "Forward", "Goalkeeper"];
  return positions.map((position, i) => ({
    name: i === 0 ? "Captain (TBD)" : `${team} Player ${i + 1}`,
    position,
    overall: 55 + ((i * 7) % 20),
    starter: i < 11,
  }));
}
export const CLUBS: Club[] = [...GROUP_A_TEAMS, ...GROUP_B_TEAMS].map((name, i) => ({
  name,
  group: (i < 8 ? "A" : "B") as "A" | "B",
  colour: ["#22e6ff", "#7dff9e", "#ffd23f", "#ff5d8f", "#b388ff", "#ff8a3d", "#3dffc8", "#ff4d4d", "#4d9fff", "#e6ff4d", "#ff9ff3", "#4dff88", "#ffb84d", "#9d4dff", "#4dd8ff", "#ff6b6b"][i],
  captain: "TBD",
  slotsLeft: [3, 0, 5, 2, 7, 1, 4, 6, 2, 0, 8, 3, 5, 1, 4, 9][i],
  squad: mkSquad(name),
}));

export const COMMENTARY = [
  { minute: "12'", text: "Through ball! Velt is 1v1 with the keeper…" },
  { minute: "23'", text: "Big save at the other end — Demo GK dives low to his right." },
  { minute: "34'", text: "Winger vs Defender on the flank — the crowd is on its feet." },
  { minute: "45'", text: "Halftime. Team A 1-0 Team B. Captains have 60 seconds to vote a tactic change." },
  { minute: "67'", text: "PENALTY to Team A! Velt steps up…" },
  { minute: "89'", text: "Corner in the 89th minute — everyone forward, including the keeper!" },
];

export const DUELS = {
  open: [
    { id: 1, challenger: "Demo Striker (Team C)", type: "Striker vs GK penalty", stake: "20 $KICK" },
    { id: 2, challenger: "Demo Mid (Team E)", type: "Mid vs Mid passing battle", stake: "20 $KICK" },
    { id: 3, challenger: "Demo Defender (Team B)", type: "Defender vs Striker 1v1 dribble", stake: "20 $KICK" },
  ],
  callouts: [
    { id: 1, from: "Demo Striker (Team C)", to: "Velt", text: "You dodged me twice. Saturday, penalties, loser buys the shakes." },
  ],
  history: [
    { id: 1, opponent: "Demo GK (Team B)", type: "Penalty", result: "Won 2-1", kick: "+20 $KICK" },
    { id: 2, opponent: "Demo Striker (Team C)", type: "Penalty", result: "Won 3-2", kick: "+20 $KICK" },
    { id: 3, opponent: "Demo Mid (Team E)", type: "Passing battle", result: "Lost 1-2", kick: "+0 $KICK" },
  ],
};
