// Agent Football — core API logic (shared by the Cloudflare Worker and the local dev server).
// Plain TypeScript, no dependencies. The website is just a button: EVERY cap,
// split and gate below is enforced here on the server, per DESIGN.md anti-cheat.
// Storage is behind the Store interface: MemoryStore (local dev / tests) or
// D1Store (workers/src/index.ts, Cloudflare D1 + KV).
import {
  CHAIN_ID, COACH, CONTRACT_ADDRESS, DAILY_ITEMS, DEPLOYED, FATIGUE_DOUBLE_INJURY_ABOVE, FATIGUE_FORCED_REST_ABOVE,
  IMMORTAL_BADGE, KICK, LEGEND_NFT, POSITION_STATS, REGISTRY, SEASON, SPECIALIST_UNLOCKS,
  STAT_CAP, SUPERMARKET_ITEMS, SUPERMARKET_RECOVERY_PER_DAY, SUPERMARKET_USE_PER_DAY,
  SURPLUS_UNLOCK_COST, SURPLUS_UNLOCK_START, TRAININGS_PER_DAY, TRAINING,
  UNIVERSAL_UNLOCKS, isoWeek, utcDate,
} from "./config.js";
import type { Intensity, Position, SupermarketItemId } from "./config.js";
import { generateFixtures, seedTeams } from "./fixtures.js";
import type { Fixture } from "./fixtures.js";
export type { Fixture } from "./fixtures.js";
import { generateMatch } from "./match.js";

// ---------------------------------------------------------------- types
export interface Buffs {
  kneeBraceRemaining: number;
  ankleTapeDate: string | null;
  vitaminNext: boolean;
  muscleRubDate: string | null;
  tackleBonusDate: string | null;
}
export interface Player {
  wallet: string;
  agent_id: string | null;
  player_token_id: number | null;
  name: string;
  position: Position;
  base_stats: Record<string, number>;
  unlocked_stats: Record<string, number>;
  surplus_points: number;
  fatigue: number;
  injury_until: string | null; // YYYY-MM-DD inclusive; null = fit
  injury_type: string | null; // Minor Strain | Sprain | Serious
  team_id: string | null;
  created_at: string;
  buffs: Buffs;
  badges: string[];
  legend_nft: string | null;
  immortal_claimed: boolean;
  extra_light_remaining: number;
  extra_light_date: string | null;
  sleep_mask_night: boolean;
  last_seen_date: string | null;
  kick_balance: number;
  weekly_earned: Record<string, number>;
}
export interface TrainingEntry {
  wallet: string; date_utc: string; slot: string; intensity: string;
  stat_index: number; gain: number; injury_roll: boolean;
}
export interface Duel {
  id: string; challenger: string; opponent: string; type: string;
  status: "open" | "completed"; result: Record<string, unknown> | null; created_at: string;
}
export interface LedgerRow {
  wallet: string; week: string; earned: number; spent: number; burned: number;
  reward_pool_contrib: number; creator_contrib: number; topup_bought: number; balance: number;
}
export interface KickTotals {
  earnedTotal: number; topupTotal: number; spentTotal: number;
  burnedTotal: number; poolTotal: number; creatorTotal: number;
}
export interface TeamMember { wallet: string; role: "starter" | "sub"; }
export interface Team {
  id: string; group: string; name: string; captain_wallet: string | null;
  created_at: string; members: TeamMember[];
}
export interface Store {
  getPlayer(wallet: string): Promise<Player | null>;
  savePlayer(p: Player): Promise<void>;
  listPlayers(): Promise<Player[]>;
  countTrainings(wallet: string, date: string): Promise<number>;
  addTraining(e: TrainingEntry): Promise<void>;
  hasCoachToday(wallet: string, date: string): Promise<boolean>;
  hasDrawnToday(wallet: string, date: string): Promise<boolean>;
  recordDraw(wallet: string, date: string, itemId: string): Promise<void>;
  getItemUses(wallet: string, date: string): Promise<{ total: number; recovery: number }>;
  recordItemUse(wallet: string, date: string, itemId: string, recovery: boolean): Promise<void>;
  getInventory(wallet: string): Promise<Record<string, number>>;
  addInventory(wallet: string, itemId: string, qty: number, source: string): Promise<void>;
  removeInventory(wallet: string, itemId: string, qty: number): Promise<void>;
  getLedger(wallet: string, week: string): Promise<LedgerRow>;
  recordLedger(wallet: string, week: string, delta: Partial<LedgerRow>): Promise<void>;
  getTotals(): Promise<KickTotals>;
  addTotals(delta: Partial<KickTotals>): Promise<void>;
  getTeams(): Promise<Team[]>;
  getTeam(id: string): Promise<Team | null>;
  saveTeam(t: Team): Promise<void>;
  addDuel(d: Duel): Promise<Duel>;
  getDuel(id: string): Promise<Duel | null>;
  updateDuel(d: Duel): Promise<void>;
  listDuels(): Promise<Duel[]>;
  getFixtures(): Promise<Fixture[]>;
  getTopupsToday(wallet: string, date: string): Promise<number>;
  recordTopup(wallet: string, date: string, amountKick: number): Promise<void>;
  getScorers(): Promise<{ wallet: string; name: string; goals: number }[]>;
}

export interface ApiResult { status: number; body: Record<string, unknown>; }
export interface HandlerOpts {
  devMode: boolean; // local server: auto-provision demo players for unknown wallets
  now?: Date;
  random?: () => number;
  // Lazy on-chain sync (production Worker only): called when the store has
  // no row for a wallet. Reads the minted player from the live contract
  // and inserts it. Miss-only — an existing row is never overwritten, so
  // off-chain training gains in D1 are safe. Must never throw; a null
  // return (or a throw) falls back to the previous behaviour (404 in prod).
  syncPlayerFromChain?: (wallet: string) => Promise<Player | null>;
}

// ---------------------------------------------------------------- helpers
function ok(body: Record<string, unknown>, status = 200): ApiResult { return { status, body: { ok: true, ...body } }; }
function err(code: string, message: string, status = 400): ApiResult {
  return { status, body: { ok: false, error: code, message } };
}
function isWallet(w: unknown): w is string {
  return typeof w === "string" && /^0x[0-9a-fA-F]{40}$/.test(w);
}
function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function emptyBuffs(): Buffs {
  return { kneeBraceRemaining: 0, ankleTapeDate: null, vitaminNext: false, muscleRubDate: null, tackleBonusDate: null };
}
export function demoPlayer(wallet: string): Player {
  // Deterministic demo stats (40-60) seeded from the wallet address — local dev only.
  let h = 2166136261 >>> 0;
  for (const c of wallet) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const rng = () => { h = (h + 0x6d2b79f5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const stats: Record<string, number> = {};
  for (const s of POSITION_STATS.FW) stats[s] = 40 + Math.floor(rng() * 21);
  return {
    wallet, agent_id: null, player_token_id: null,
    name: "Demo Striker", position: "FW", base_stats: stats, unlocked_stats: {},
    surplus_points: 0, fatigue: 0, injury_until: null, injury_type: null,
    team_id: null, created_at: new Date().toISOString(), buffs: emptyBuffs(),
    badges: [], legend_nft: null, immortal_claimed: false,
    extra_light_remaining: 0, extra_light_date: null, sleep_mask_night: false,
    last_seen_date: null, kick_balance: 0, weekly_earned: {},
  };
}
export function overall(p: Player): number {
  const vals = Object.values(p.base_stats);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}
function publicPlayer(p: Player, inventory: Record<string, number>): Record<string, unknown> {
  return { ...p, overall: overall(p), inventory };
}

// $KICK award helper: enforces weekly earned cap (500), held cap (5,000),
// and the S1 earn reserve (2,250,000). Returns what was actually awarded.
async function awardKick(store: Store, p: Player, week: string, amount: number): Promise<{ awarded: number; capped: boolean }> {
  const totals = await store.getTotals();
  const weeklyLeft = KICK.maxEarnedPerWeek - (p.weekly_earned[week] ?? 0);
  const heldLeft = KICK.maxHeld - p.kick_balance;
  const reserveLeft = KICK.earnReserve - totals.earnedTotal;
  const awarded = Math.max(0, Math.min(amount, weeklyLeft, heldLeft, reserveLeft));
  if (awarded > 0) {
    p.kick_balance += awarded;
    p.weekly_earned[week] = (p.weekly_earned[week] ?? 0) + awarded;
    await store.recordLedger(p.wallet, week, { earned: awarded, balance: p.kick_balance });
    await store.addTotals({ earnedTotal: awarded });
  }
  return { awarded, capped: awarded < amount };
}

const RECOVERY_ITEM_IDS = new Set(["physio_session", "medical_kit", "cryotherapy", "ice_bath"]);

// ---------------------------------------------------------------- MemoryStore
export class MemoryStore implements Store {
  players = new Map<string, Player>();
  trainings: TrainingEntry[] = [];
  draws = new Set<string>(); // wallet|date
  itemUses: { wallet: string; date: string; recovery: boolean }[] = [];
  inventory = new Map<string, Record<string, number>>();
  ledgers = new Map<string, LedgerRow>(); // wallet|week
  totals: KickTotals = { earnedTotal: 0, topupTotal: 0, spentTotal: 0, burnedTotal: 0, poolTotal: 0, creatorTotal: 0 };
  teams: Team[] = seedTeams().map((t) => ({ id: t.id, group: t.group, name: t.name, captain_wallet: null, created_at: new Date().toISOString(), members: [] }));
  duels = new Map<string, Duel>();
  duelSeq = 0;
  fixtures: Fixture[] = generateFixtures();
  topups: { wallet: string; date: string; amount: number }[] = [];
  scorers = new Map<string, { wallet: string; name: string; goals: number }>();

  async getPlayer(w: string) { return this.players.get(w.toLowerCase()) ?? null; }
  async savePlayer(p: Player) { this.players.set(p.wallet.toLowerCase(), p); }
  async listPlayers() { return [...this.players.values()]; }
  async countTrainings(w: string, d: string) { return this.trainings.filter((t) => t.wallet === w.toLowerCase() && t.date_utc === d && t.intensity !== "coach").length; }
  async addTraining(e: TrainingEntry) { this.trainings.push({ ...e, wallet: e.wallet.toLowerCase() }); }
  async hasCoachToday(w: string, d: string) { return this.trainings.some((t) => t.wallet === w.toLowerCase() && t.date_utc === d && t.intensity === "coach"); }
  async hasDrawnToday(w: string, d: string) { return this.draws.has(`${w.toLowerCase()}|${d}`); }
  async recordDraw(w: string, d: string, itemId: string) { this.draws.add(`${w.toLowerCase()}|${d}`); await this.addInventory(w, itemId, 1, "daily"); }
  async getItemUses(w: string, d: string) {
    const rows = this.itemUses.filter((u) => u.wallet === w.toLowerCase() && u.date === d);
    return { total: rows.length, recovery: rows.filter((r) => r.recovery).length };
  }
  async recordItemUse(w: string, d: string, _itemId: string, recovery: boolean) { this.itemUses.push({ wallet: w.toLowerCase(), date: d, recovery }); }
  async getInventory(w: string) { return { ...(this.inventory.get(w.toLowerCase()) ?? {}) }; }
  async addInventory(w: string, itemId: string, qty: number, _source: string) {
    const inv = this.inventory.get(w.toLowerCase()) ?? {};
    inv[itemId] = (inv[itemId] ?? 0) + qty;
    this.inventory.set(w.toLowerCase(), inv);
  }
  async removeInventory(w: string, itemId: string, qty: number) {
    const inv = this.inventory.get(w.toLowerCase()) ?? {};
    inv[itemId] = Math.max(0, (inv[itemId] ?? 0) - qty);
    this.inventory.set(w.toLowerCase(), inv);
  }
  async getLedger(w: string, week: string) {
    const key = `${w.toLowerCase()}|${week}`;
    return this.ledgers.get(key) ?? { wallet: w.toLowerCase(), week, earned: 0, spent: 0, burned: 0, reward_pool_contrib: 0, creator_contrib: 0, topup_bought: 0, balance: 0 };
  }
  async recordLedger(w: string, week: string, delta: Partial<LedgerRow>) {
    const row = await this.getLedger(w, week);
    for (const [k, v] of Object.entries(delta)) (row as unknown as Record<string, number>)[k] = ((row as unknown as Record<string, number>)[k] ?? 0) + (v as number);
    this.ledgers.set(`${w.toLowerCase()}|${week}`, row);
  }
  async getTotals() { return { ...this.totals }; }
  async addTotals(d: Partial<KickTotals>) { for (const [k, v] of Object.entries(d)) (this.totals as unknown as Record<string, number>)[k] += v as number; }
  async getTeams() { return this.teams; }
  async getTeam(id: string) { return this.teams.find((t) => t.id === id.toUpperCase()) ?? null; }
  async saveTeam(t: Team) { const i = this.teams.findIndex((x) => x.id === t.id); if (i >= 0) this.teams[i] = t; }
  async addDuel(d: Duel) { this.duelSeq++; const duel = { ...d, id: `duel-${this.duelSeq}` }; this.duels.set(duel.id, duel); return duel; }
  async getDuel(id: string) { return this.duels.get(id) ?? null; }
  async updateDuel(d: Duel) { this.duels.set(d.id, d); }
  async listDuels() { return [...this.duels.values()]; }
  async getFixtures() { return this.fixtures; }
  async getTopupsToday(w: string, d: string) { return this.topups.filter((t) => t.wallet === w.toLowerCase() && t.date === d).reduce((a, t) => a + t.amount, 0); }
  async recordTopup(w: string, d: string, amount: number) { this.topups.push({ wallet: w.toLowerCase(), date: d, amount }); }
  async getScorers() { return [...this.scorers.values()].sort((a, b) => b.goals - a.goals); }
}

// ---------------------------------------------------------------- handler
async function loadPlayer(store: Store, wallet: string, opts: HandlerOpts): Promise<Player | null> {
  const p = await store.getPlayer(wallet);
  if (p) return p;
  // Lazy on-chain sync: a wallet that minted on-chain but has no D1 row
  // (e.g. Velt, token 0) is imported from the live contract instead of 404.
  if (opts.syncPlayerFromChain) {
    try {
      const synced = await opts.syncPlayerFromChain(wallet);
      if (synced) {
        await store.savePlayer(synced);
        return synced;
      }
    } catch {
      // RPC outage / decode failure: fall through to the old behaviour
      // (demo in dev mode, 404 in prod) instead of 500ing the request.
    }
  }
  if (!opts.devMode) return null;
  const demo = demoPlayer(wallet);
  await store.savePlayer(demo);
  return demo;
}

function applyOvernightReset(p: Player, today: string): void {
  if (p.last_seen_date && p.last_seen_date < today) {
    if (p.sleep_mask_night) { p.fatigue = 0; p.sleep_mask_night = false; }
    if (p.extra_light_date !== today) { p.extra_light_remaining = 0; p.extra_light_date = null; }
  }
  p.last_seen_date = today;
}

export async function handleRequest(
  method: string, path: string, query: Record<string, string>, body: Record<string, unknown> | null,
  store: Store, opts: HandlerOpts,
): Promise<ApiResult> {
  const rng = opts.random ?? Math.random;
  const now = opts.now ?? new Date();
  const today = utcDate(now);
  const week = isoWeek(now);
  const parts = path.split("/").filter(Boolean);

  // ---- GET /api/health
  if (method === "GET" && path === "/api/health") {
    return ok({ service: "agent-football-api", time: now.toISOString(), devMode: opts.devMode });
  }
  // ---- GET /api/config
  if (method === "GET" && path === "/api/config") {
    return ok({
      contract_address: CONTRACT_ADDRESS, deployed: DEPLOYED, registry: REGISTRY, chain_id: CHAIN_ID,
      season: SEASON, kick: { ...KICK }, training: TRAINING, coach: { perDay: COACH.perDay, costBnb: COACH.costBnb, gain: COACH.gain, injuryPct: COACH.injuryPct, fatigue: COACH.fatigue },
      positions: POSITION_STATS, surplusUnlockCost: SURPLUS_UNLOCK_COST,
      supermarket: SUPERMARKET_ITEMS, daily: DAILY_ITEMS,
      weeklyRewardSplit: { teamOfWeek: 40, topScorer: 20, bestGk: 15, manOfWeek: 15, hardestTrainer: 10 },
    });
  }
  // ---- GET /api/league/table
  if (method === "GET" && path === "/api/league/table") {
    const fixtures = await store.getFixtures();
    const table = new Map<string, { team: string; group: string; p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number; form: string[] }>();
    for (const t of await store.getTeams()) {
      table.set(t.name, { team: t.name, group: t.group, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0, form: [] });
    }
    for (const f of fixtures.filter((x) => x.status === "played" && x.home_goals !== null && x.away_goals !== null)) {
      const h = table.get(f.home_team)!; const a = table.get(f.away_team)!;
      h.p++; a.p++; h.gf += f.home_goals!; h.ga += f.away_goals!; a.gf += f.away_goals!; a.ga += f.home_goals!;
      if (f.home_goals! > f.away_goals!) { h.w++; a.l++; h.pts += 3; h.form.push("W"); a.form.push("L"); }
      else if (f.home_goals! < f.away_goals!) { a.w++; h.l++; a.pts += 3; a.form.push("L"); h.form.push("W"); }
      else { h.d++; a.d++; h.pts++; a.pts++; h.form.push("D"); a.form.push("D"); }
    }
    for (const row of table.values()) row.gd = row.gf - row.ga;
    const sort = (x: { pts: number; gd: number; gf: number }, y: { pts: number; gd: number; gf: number }) =>
      y.pts - x.pts || y.gd - x.gd || y.gf - x.gf;
    return ok({
      groups: {
        A: [...table.values()].filter((r) => r.group === "A").sort(sort),
        B: [...table.values()].filter((r) => r.group === "B").sort(sort),
      },
      note: "Pre-season: no matches played yet; all teams start 0 points.",
    });
  }
  // ---- GET /api/league/fixtures
  if (method === "GET" && path === "/api/league/fixtures") {
    const fixtures = await store.getFixtures();
    const round = query.round ? Number(query.round) : null;
    return ok({ fixtures: round ? fixtures.filter((f) => f.round === round) : fixtures, count: fixtures.length });
  }
  // ---- GET /api/league/scorers
  if (method === "GET" && path === "/api/league/scorers") {
    return ok({ scorers: await store.getScorers(), note: "No goals recorded yet in S1 (pre-season)." });
  }
  // ---- GET /api/teams
  if (method === "GET" && path === "/api/teams") {
    return ok({ teams: await store.getTeams() });
  }
  // ---- GET /api/teams/:id
  if (method === "GET" && parts[0] === "api" && parts[1] === "teams" && parts[2]) {
    const team = await store.getTeam(parts[2]);
    if (!team) return err("TEAM_NOT_FOUND", `No team ${parts[2]}`, 404);
    return ok({ team });
  }
  // ---- GET /api/match/:id/live
  if (method === "GET" && parts[0] === "api" && parts[1] === "match" && parts[2] && parts[3] === "live") {
    const fixtures = await store.getFixtures();
    const fixture = fixtures.find((f) => f.id === parts[2]);
    if (!fixture) return err("MATCH_NOT_FOUND", `No fixture ${parts[2]}`, 404);
    const seed = query.seed ? Number(query.seed) : undefined;
    const match = generateMatch(fixture.home_team, fixture.away_team, seed);
    return ok({ fixture, live: { minute: 90, score: `${match.homeGoals}-${match.awayGoals}`, status: "simulated" }, match });
  }
  // ---- GET /api/player/:wallet
  if (method === "GET" && parts[0] === "api" && parts[1] === "player" && parts[2]) {
    const wallet = parts[2];
    if (!isWallet(wallet)) return err("BAD_WALLET", "wallet must be a 0x 40-hex address", 400);
    const p = await loadPlayer(store, wallet, opts);
    if (!p) return err("PLAYER_NOT_FOUND", "No player for this wallet — mint first", 404);
    applyOvernightReset(p, today);
    await store.savePlayer(p);
    return ok({ player: await publicPlayer(p, await store.getInventory(wallet)), ledger: await store.getLedger(wallet, week) });
  }
  // ---- GET /api/rewards/weekly
  if (method === "GET" && path === "/api/rewards/weekly") {
    const totals = await store.getTotals();
    const kickPool = Math.floor((totals.spentTotal * KICK.rewardPoolPct) / 100);
    const bnbPool = 0; // PENDING top-ups are intents only; no confirmed BNB sales in S1 local mode.
    return ok({
      week,
      pool: { kick: kickPool, bnb: bnbPool, note: "pool = 90% BNB sales that week + 65% of $KICK spent that week" },
      split: {
        teamOfWeek: { pct: 40, kick: Math.floor(kickPool * 0.4), bnb: bnbPool * 0.4 },
        topScorer: { pct: 20, kick: Math.floor(kickPool * 0.2), bnb: bnbPool * 0.2 },
        bestGk: { pct: 15, kick: Math.floor(kickPool * 0.15), bnb: bnbPool * 0.15 },
        manOfWeek: { pct: 15, kick: Math.floor(kickPool * 0.15), bnb: bnbPool * 0.15 },
        hardestTrainer: { pct: 10, kick: Math.floor(kickPool * 0.1), bnb: bnbPool * 0.1 },
      },
      totals,
    });
  }
  // ---- GET /api/duels
  if (method === "GET" && path === "/api/duels") {
    return ok({ duels: await store.listDuels() });
  }
  // ---- GET /api/items (supermarket catalogue)
  if (method === "GET" && path === "/api/items") {
    return ok({ supermarket: SUPERMARKET_ITEMS, daily: DAILY_ITEMS, useCaps: { perDay: SUPERMARKET_USE_PER_DAY, recoveryPerDay: SUPERMARKET_RECOVERY_PER_DAY } });
  }

  // ---- POST routes need a body
  const b = body ?? {};
  const wallet = typeof b.wallet === "string" ? b.wallet : "";
  const needWallet = (): ApiResult | null => {
    if (!isWallet(wallet)) return err("BAD_WALLET", "body.wallet must be a 0x 40-hex address", 400);
    return null;
  };

  // ---- POST /api/train
  if (method === "POST" && path === "/api/train") {
    const bad = needWallet(); if (bad) return bad;
    const intensity = b.intensity as Intensity;
    if (!TRAINING[intensity]) return err("BAD_INTENSITY", "intensity must be light | standard | intense", 400);
    const p = await loadPlayer(store, wallet, opts);
    if (!p) return err("PLAYER_NOT_FOUND", "No player for this wallet — mint first", 404);
    applyOvernightReset(p, today);
    if (p.injury_until && p.injury_until >= today) {
      return err("INJURED", `Out injured (${p.injury_type}) until ${p.injury_until} — no training`, 403);
    }
    if (p.fatigue > FATIGUE_FORCED_REST_ABOVE) {
      return err("FORCED_REST", `Fatigue ${p.fatigue} > 90 — forced rest, use a recovery item or wait`, 403);
    }
    const statNames = POSITION_STATS[p.position];
    const statIndex = typeof b.statIndex === "number" ? b.statIndex : -1;
    const statName = typeof b.stat === "string" ? b.stat : statNames[statIndex];
    if (!statName) return err("BAD_STAT", `statIndex must be 0-${statNames.length - 1} for ${p.position}`, 400);
    const isBase = statNames.includes(statName);
    const isUnlocked = Object.prototype.hasOwnProperty.call(p.unlocked_stats, statName);
    if (!isBase && !isUnlocked) return err("BAD_STAT", `Stat ${statName} is not trained/unlocked for this player`, 400);

    const done = await store.countTrainings(wallet, today);
    let usedExtraLight = false;
    if (done >= TRAININGS_PER_DAY) {
      if (intensity === "light" && p.extra_light_remaining > 0 && p.extra_light_date === today) {
        p.extra_light_remaining--;
        usedExtraLight = true;
      } else {
        return err("TRAINING_CAP", `3 trainings/day cap reached for ${today} (UTC)`, 429);
      }
    }
    const cfg = TRAINING[intensity];
    const gain = randInt(rng, cfg.gainMin, cfg.gainMax);
    // Injury chance: base range, doubled over 70 fatigue, Durability -20%, buffs apply.
    let chance = randInt(rng, cfg.injuryMin, cfg.injuryMax);
    if (p.fatigue > FATIGUE_DOUBLE_INJURY_ABOVE) chance *= 2;
    if (Object.prototype.hasOwnProperty.call(p.unlocked_stats, "Durability")) chance *= 0.8;
    if (p.buffs.kneeBraceRemaining > 0) { chance *= 0.25; p.buffs.kneeBraceRemaining--; }
    if (p.buffs.ankleTapeDate === today) chance *= 0.5;
    if (p.buffs.vitaminNext) { chance *= 0.5; p.buffs.vitaminNext = false; }
    chance = Math.min(95, chance);
    const roll = rng() * 100;
    let injured = roll < chance;
    let injuryType: string | null = null;
    let injuryUntil: string | null = null;
    if (injured) {
      if (p.buffs.muscleRubDate === today) injuryType = "Minor Strain";
      else {
        const s = rng();
        injuryType = s < 0.6 ? "Minor Strain" : s < 0.85 ? "Sprain" : "Serious";
      }
      const days = injuryType === "Minor Strain" ? 1 : injuryType === "Sprain" ? 3 : 7;
      injuryUntil = addDays(today, days);
      p.injury_until = injuryUntil;
      p.injury_type = injuryType;
    }
    // Apply gain; overflow past 99 goes to the surplus pool (1 surplus per +1 lost).
    let applied = 0;
    let surplusGained = 0;
    if (isBase) {
      const cur = p.base_stats[statName] ?? 40;
      const room = STAT_CAP - cur;
      applied = Math.min(gain, room);
      surplusGained = gain - applied;
      p.base_stats[statName] = cur + applied;
    } else {
      const cur = p.unlocked_stats[statName] ?? 40;
      const room = STAT_CAP - cur;
      applied = Math.min(gain, room);
      surplusGained = gain - applied;
      p.unlocked_stats[statName] = cur + applied;
    }
    p.surplus_points += surplusGained;
    p.fatigue = Math.min(100, p.fatigue + cfg.fatigue);
    const kick = await awardKick(store, p, week, KICK.perTraining);
    await store.addTraining({ wallet, date_utc: today, slot: usedExtraLight ? "extra-light" : "free", intensity, stat_index: statIndex, gain: applied, injury_roll: injured });
    await store.savePlayer(p);
    return ok({
      training: { stat: statName, gain: applied, surplusGained, intensity, fatigue: p.fatigue, injury: injured ? { type: injuryType, until: injuryUntil } : null, injuryChancePct: Math.round(chance * 100) / 100, injuryRoll: Math.round(roll * 100) / 100 },
      kickEarned: kick.awarded, kickCapped: kick.capped, kickBalance: p.kick_balance,
      trainingsToday: done + 1, trainingsCap: TRAININGS_PER_DAY, usedExtraLight,
    });
  }

  // ---- POST /api/coach (intent only — NO broadcast, NO signing)
  if (method === "POST" && path === "/api/coach") {
    const bad = needWallet(); if (bad) return bad;
    const p = await loadPlayer(store, wallet, opts);
    if (!p) return err("PLAYER_NOT_FOUND", "No player for this wallet — mint first", 404);
    if (await store.hasCoachToday(wallet, today)) {
      return err("COACH_CAP", `1 Coach Session/day cap reached for ${today} (UTC)`, 429);
    }
    const statNames = POSITION_STATS[p.position];
    const statIndex = typeof b.statIndex === "number" ? b.statIndex : -1;
    const statName = statNames[statIndex];
    if (!statName) return err("BAD_STAT", `statIndex must be 0-${statNames.length - 1} for ${p.position}`, 400);
    await store.addTraining({ wallet, date_utc: today, slot: "coach", intensity: "coach", stat_index: statIndex, gain: 0, injury_roll: false });
    // Real coachSession(uint8) calldata for the live contract; amount is exact.
    const statWord = String(statIndex).padStart(64, "0");
    return ok({
      intent: {
        kind: "coach_session", status: "PENDING_ONCHAIN",
        to: CONTRACT_ADDRESS,
        amountBnb: COACH.costBnb, amountWei: COACH.costWei,
        calldata: COACH.calldataPlaceholder + statWord,
        calldataNote: "Real coachSession(uint8) calldata for the live contract; intent only — the frontend/agent must still preview via BAW before broadcasting.",
        stat: statName, statIndex, gain: COACH.gain, injuryPct: COACH.injuryPct, fatigue: COACH.fatigue,
      },
      note: "Intent recorded only. The +4 stat / +20 fatigue apply when the on-chain tx confirms.",
    });
  }

  // ---- POST /api/items/draw
  if (method === "POST" && path === "/api/items/draw") {
    const bad = needWallet(); if (bad) return bad;
    const p = await loadPlayer(store, wallet, opts);
    if (!p) return err("PLAYER_NOT_FOUND", "No player for this wallet — mint first", 404);
    if (await store.hasDrawnToday(wallet, today)) {
      return err("DRAW_CAP", `1 free draw/day cap reached for ${today} (UTC)`, 429);
    }
    const item = DAILY_ITEMS[randInt(rng, 0, DAILY_ITEMS.length - 1)]!;
    await store.recordDraw(wallet, today, item.id);
    return ok({ item, inventory: await store.getInventory(wallet) });
  }

  // ---- POST /api/items/use
  if (method === "POST" && path === "/api/items/use") {
    const bad = needWallet(); if (bad) return bad;
    const itemId = b.itemId as string;
    const p = await loadPlayer(store, wallet, opts);
    if (!p) return err("PLAYER_NOT_FOUND", "No player for this wallet — mint first", 404);
    applyOvernightReset(p, today);
    const inv = await store.getInventory(wallet);
    if (!inv[itemId] || inv[itemId] <= 0) return err("NO_ITEM", `No ${itemId} in inventory`, 400);
    const uses = await store.getItemUses(wallet, today);
    if (uses.total >= SUPERMARKET_USE_PER_DAY) {
      return err("ITEM_USE_CAP", `3 Supermarket items/day cap reached for ${today} (UTC)`, 429);
    }
    const isRecovery = RECOVERY_ITEM_IDS.has(itemId);
    if (isRecovery && uses.recovery >= SUPERMARKET_RECOVERY_PER_DAY) {
      return err("RECOVERY_CAP", `Max 1 injury-recovery item/day (already used one today)`, 429);
    }
    const healDays = (days: number) => {
      if (!p.injury_until) return false;
      const healed = addDays(p.injury_until, -days);
      if (healed <= today) { p.injury_until = null; p.injury_type = null; }
      else p.injury_until = healed;
      return true;
    };
    let effect = "";
    switch (itemId) {
      case "protein_shake": p.fatigue = Math.max(0, p.fatigue - 20); effect = "-20 fatigue"; break;
      case "vitamin_cd": p.buffs.vitaminNext = true; effect = "-50% injury chance next training"; break;
      case "electrolyte_drink": p.fatigue = Math.max(0, p.fatigue - 10); effect = "-10 fatigue"; break;
      case "banana": p.fatigue = Math.max(0, p.fatigue - 5); effect = "-5 fatigue"; break;
      case "ice_bath": if (!healDays(1)) return err("NO_INJURY", "Ice Bath needs an active injury to heal", 400); effect = "heal 1 day faster"; break;
      case "recovery_shake_pro": p.fatigue = Math.max(0, p.fatigue - 50); effect = "-50 fatigue"; break;
      case "energy_gel": p.extra_light_remaining++; p.extra_light_date = today; effect = "+1 extra Light training today"; break;
      case "sleep_mask_pro": p.sleep_mask_night = true; effect = "full fatigue reset overnight"; break;
      case "knee_brace": p.buffs.kneeBraceRemaining = 3; effect = "-75% injury chance for next 3 trainings"; break;
      case "ankle_tape": p.buffs.ankleTapeDate = today; p.buffs.tackleBonusDate = today; effect = "-50% injury chance, +5% tackle success today"; break;
      case "muscle_rub": p.buffs.muscleRubDate = today; effect = "if injured today, Minor only, never worse"; break;
      case "physio_session": if (!healDays(2)) return err("NO_INJURY", "Physio Session needs an active injury to heal", 400); effect = "heal 2 days faster"; break;
      case "medical_kit":
        if (!p.injury_until || p.injury_type !== "Minor Strain") return err("NO_MINOR_INJURY", "Medical Kit heals a Minor injury instantly — none active", 400);
        p.injury_until = null; p.injury_type = null; effect = "Minor injury healed instantly"; break;
      case "cryotherapy": p.fatigue = Math.max(0, p.fatigue - 40); healDays(1); effect = "-40 fatigue + heal 1 day faster"; break;
      default: return err("BAD_ITEM", `Unknown item ${itemId}`, 400);
    }
    await store.removeInventory(wallet, itemId, 1);
    await store.recordItemUse(wallet, today, itemId, isRecovery);
    await store.savePlayer(p);
    return ok({ used: itemId, effect, fatigue: p.fatigue, injury_until: p.injury_until, inventory: await store.getInventory(wallet), usesToday: uses.total + 1 });
  }

  // ---- POST /api/items/buy (spend $KICK; split 30 burn / 65 pool / 5 creator)
  if (method === "POST" && path === "/api/items/buy") {
    const bad = needWallet(); if (bad) return bad;
    const itemId = b.itemId as SupermarketItemId;
    const item = SUPERMARKET_ITEMS.find((x) => x.id === itemId);
    if (!item) return err("BAD_ITEM", `Unknown Supermarket item ${itemId}`, 400);
    const p = await loadPlayer(store, wallet, opts);
    if (!p) return err("PLAYER_NOT_FOUND", "No player for this wallet — mint first", 404);
    if (p.kick_balance < item.priceKick) {
      return err("INSUFFICIENT_KICK", `$KICK balance ${p.kick_balance} < price ${item.priceKick}`, 402);
    }
    const price = item.priceKick;
    const burned = Math.floor((price * KICK.burnPct) / 100);
    const pool = Math.floor((price * KICK.rewardPoolPct) / 100);
    const creator = price - burned - pool; // remainder so the split always sums to price
    p.kick_balance -= price;
    await store.recordLedger(wallet, week, { spent: price, burned, reward_pool_contrib: pool, creator_contrib: creator, balance: p.kick_balance });
    await store.addTotals({ spentTotal: price, burnedTotal: burned, poolTotal: pool, creatorTotal: creator });
    await store.addInventory(wallet, itemId, 1, "supermarket");
    await store.savePlayer(p);
    return ok({ bought: itemId, price, split: { burned, rewardPool: pool, creator }, kickBalance: p.kick_balance, inventory: await store.getInventory(wallet) });
  }

  // ---- POST /api/kick/topup (intent only — $KICK credited ONLY on confirmed on-chain TopUp event)
  if (method === "POST" && path === "/api/kick/topup") {
    const bad = needWallet(); if (bad) return bad;
    const amount = typeof b.amountKick === "number" ? b.amountKick : 0;
    if (!Number.isInteger(amount) || amount <= 0 || amount % 100 !== 0) {
      return err("BAD_AMOUNT", "amountKick must be a positive multiple of 100 $KICK", 400);
    }
    const boughtToday = await store.getTopupsToday(wallet, today);
    if (boughtToday + amount > KICK.topupMaxPerDay) {
      return err("TOPUP_CAP", `Max 500 $KICK top-up/day (already bought ${boughtToday} today)`, 429);
    }
    const totals = await store.getTotals();
    if (totals.topupTotal + amount > KICK.topupReserve) {
      return err("TOPUP_RESERVE_EMPTY", `Top-up reserve exhausted (${totals.topupTotal}/${KICK.topupReserve} used)`, 429);
    }
    const bnb = (amount / 100) * 0.001;
    const intentId = `topup-${wallet.toLowerCase().slice(2, 8)}-${Date.now()}`;
    await store.recordTopup(wallet, today, amount);
    await store.addTotals({ topupTotal: amount });
    await store.recordLedger(wallet, week, { topup_bought: amount });
    return ok({
      intent: {
        id: intentId, status: "PENDING", kind: "kick_topup",
        amountKick: amount, amountBnb: bnb.toFixed(6),
        to: CONTRACT_ADDRESS,
        bnbSplit: { rewards: +(bnb * 0.9).toFixed(6), buybackTreasury: +(bnb * 0.08).toFixed(6), creator: +(bnb * 0.02).toFixed(6) },
        note: "$KICK is credited ONLY after the on-chain TopUp event confirms. Local mode records PENDING.",
      },
      kickBalance: (await store.getPlayer(wallet))?.kick_balance ?? 0,
      topupReserveUsed: totals.topupTotal + amount, topupReserve: KICK.topupReserve,
    });
  }

  // ---- POST /api/surplus/unlock
  if (method === "POST" && path === "/api/surplus/unlock") {
    const bad = needWallet(); if (bad) return bad;
    const statId = b.statId as string;
    const p = await loadPlayer(store, wallet, opts);
    if (!p) return err("PLAYER_NOT_FOUND", "No player for this wallet — mint first", 404);
    const allowed = [...SPECIALIST_UNLOCKS[p.position], ...UNIVERSAL_UNLOCKS];
    if (!allowed.includes(statId)) {
      return err("BAD_STAT", `${statId} is not unlockable for ${p.position} (specialist: ${SPECIALIST_UNLOCKS[p.position].join(", ")}; universal: ${UNIVERSAL_UNLOCKS.join(", ")})`, 400);
    }
    if (Object.prototype.hasOwnProperty.call(p.unlocked_stats, statId) || POSITION_STATS[p.position].includes(statId)) {
      return err("ALREADY_UNLOCKED", `${statId} is already on this player's card`, 400);
    }
    if (p.surplus_points < SURPLUS_UNLOCK_COST) {
      return err("INSUFFICIENT_SURPLUS", `Need ${SURPLUS_UNLOCK_COST} surplus points, have ${p.surplus_points}`, 402);
    }
    p.surplus_points -= SURPLUS_UNLOCK_COST;
    p.unlocked_stats[statId] = SURPLUS_UNLOCK_START;
    await store.savePlayer(p);
    return ok({ unlocked: statId, startsAt: SURPLUS_UNLOCK_START, surplusLeft: p.surplus_points, unlockedStats: p.unlocked_stats });
  }

  // ---- POST /api/immortal/claim
  if (method === "POST" && path === "/api/immortal/claim") {
    const bad = needWallet(); if (bad) return bad;
    const p = await loadPlayer(store, wallet, opts);
    if (!p) return err("PLAYER_NOT_FOUND", "No player for this wallet — mint first", 404);
    if (p.immortal_claimed) {
      return ok({ claimed: true, alreadyClaimed: true, badge: IMMORTAL_BADGE, legendNft: p.legend_nft });
    }
    const base = POSITION_STATS[p.position];
    const all99 = base.every((s) => (p.base_stats[s] ?? 0) >= STAT_CAP);
    if (!all99) {
      const missing = base.filter((s) => (p.base_stats[s] ?? 0) < STAT_CAP).map((s) => `${s} ${p.base_stats[s] ?? 0}/99`);
      return err("NOT_ALL_99", `Immortal XI requires ALL 5 base stats at 99. Missing: ${missing.join(", ")}`, 403);
    }
    p.immortal_claimed = true;
    p.badges.push(IMMORTAL_BADGE);
    p.legend_nft = LEGEND_NFT[p.position];
    await store.savePlayer(p);
    return ok({ claimed: true, badge: IMMORTAL_BADGE, badgeSoulbound: true, legendNft: p.legend_nft, legendNftTradeable: true });
  }

  // ---- POST /api/duels/challenge
  if (method === "POST" && path === "/api/duels/challenge") {
    const bad = needWallet(); if (bad) return bad;
    const opponent = typeof b.opponent === "string" ? b.opponent : "";
    const type = typeof b.type === "string" ? b.type : "penalty";
    if (!isWallet(opponent)) return err("BAD_OPPONENT", "body.opponent must be a 0x 40-hex address", 400);
    if (opponent.toLowerCase() === wallet.toLowerCase()) return err("SELF_DUEL", "Cannot duel yourself", 400);
    if (!["penalty", "dribble", "passing"].includes(type)) return err("BAD_TYPE", "type must be penalty | dribble | passing", 400);
    const challenger = await loadPlayer(store, wallet, opts);
    if (!challenger) return err("PLAYER_NOT_FOUND", "No player for this wallet — mint first", 404);
    const opp = await loadPlayer(store, opponent, opts);
    if (!opp) return err("OPPONENT_NOT_FOUND", "No player for the opponent wallet", 404);
    const duel = await store.addDuel({ id: "", challenger: wallet.toLowerCase(), opponent: opponent.toLowerCase(), type, status: "open", result: null, created_at: now.toISOString() });
    return ok({ duel }, 201);
  }

  // ---- POST /api/duels/play
  if (method === "POST" && path === "/api/duels/play") {
    const bad = needWallet(); if (bad) return bad;
    const duelId = typeof b.duelId === "string" ? b.duelId : "";
    const duel = await store.getDuel(duelId);
    if (!duel) return err("DUEL_NOT_FOUND", `No duel ${duelId}`, 404);
    if (duel.status !== "open") return err("DUEL_CLOSED", `Duel ${duelId} already ${duel.status}`, 400);
    if (wallet.toLowerCase() !== duel.challenger && wallet.toLowerCase() !== duel.opponent) {
      return err("NOT_A_PARTICIPANT", "Only the challenger or opponent can play this duel", 403);
    }
    const me = await loadPlayer(store, wallet, opts);
    const otherWallet = wallet.toLowerCase() === duel.challenger ? duel.opponent : duel.challenger;
    const other = await store.getPlayer(otherWallet);
    if (!me || !other) return err("PLAYER_NOT_FOUND", "Both duelists need a player", 404);
    const autoPlay = b.autoPlay === true || b.zone === undefined || b.timing === undefined;
    // Skill: timing near 0.5 is perfect; zone pick adds a bonus. Minor injury: -10%.
    const myStat = overall(me) * (me.injury_type === "Minor Strain" ? 0.9 : 1);
    const theirStat = overall(other) * (other.injury_type === "Minor Strain" ? 0.9 : 1);
    let winP = 0.5 + (myStat - theirStat) / 200;
    let method = "auto-play (stats only)";
    if (!autoPlay) {
      const timing = typeof b.timing === "number" ? b.timing : 0.5;
      const timingQuality = 1 - Math.abs(timing - 0.5) * 2;
      winP += timingQuality * 0.25;
      method = "skill (zone + timing)";
    }
    winP = Math.min(0.95, Math.max(0.05, winP));
    const iWon = rng() < winP;
    const winner = iWon ? wallet.toLowerCase() : otherWallet;
    const loser = iWon ? otherWallet : wallet.toLowerCase();
    const winnerPlayer = winner === wallet.toLowerCase() ? me : other;
    const kick = await awardKick(store, winnerPlayer, week, KICK.perDuelWin);
    await store.savePlayer(winnerPlayer);
    duel.status = "completed";
    duel.result = { winner, loser, method, winProbability: Math.round(winP * 1000) / 1000, autoPlay, kickEarned: kick.awarded };
    await store.updateDuel(duel);
    return ok({ duel, winner, kickEarned: kick.awarded });
  }

  // ---- POST /api/teams/join
  if (method === "POST" && path === "/api/teams/join") {
    const bad = needWallet(); if (bad) return bad;
    const teamId = typeof b.teamId === "string" ? b.teamId.toUpperCase() : "";
    const team = await store.getTeam(teamId);
    if (!team) return err("TEAM_NOT_FOUND", `No team ${teamId} (A-P)`, 404);
    const p = await loadPlayer(store, wallet, opts);
    if (!p) return err("PLAYER_NOT_FOUND", "No player for this wallet — mint first", 404);
    if (p.team_id) return err("ALREADY_IN_TEAM", `Already in team ${p.team_id} (1 move allowed in the Week 4 transfer window, not v1)`, 400);
    if (team.members.length >= 15) return err("TEAM_FULL", `Team ${teamId} is full (15/15)`, 429);
    const role: "starter" | "sub" = team.members.length < 11 ? "starter" : "sub";
    team.members.push({ wallet: wallet.toLowerCase(), role });
    if (!team.captain_wallet) team.captain_wallet = wallet.toLowerCase();
    p.team_id = team.id;
    await store.saveTeam(team);
    await store.savePlayer(p);
    return ok({ team, role, squadSize: team.members.length, captain: team.captain_wallet });
  }

  return err("NOT_FOUND", `${method} ${path} is not an Agent Football endpoint`, 404);
}
