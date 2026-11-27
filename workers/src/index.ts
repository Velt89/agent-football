// Agent Football — Cloudflare Worker entry point.
// Plain fetch handler, no dependencies. All route/cap logic lives in core.ts;
// this file only adapts Cloudflare bindings (D1 + KV) to the Store interface.
//
// Env bindings (see wrangler.toml — config only, never deployed by this repo):
//   DB                  D1 database  agent_football_db
//   AGENT_FOOTBALL_KV   KV namespace (live-match cache / config)
//   MATCH_ROOM          Durable Object (live Saturday match room)
//
// NOTE: D1Store below is type-checked but NOT runtime-tested against a live D1
// (no deploy in this task). The fully smoke-tested store is MemoryStore in
// core.ts, exercised by workers/local-server.mjs. Before first deploy, run the
// D1Store against a local `wrangler d1` / miniflare instance and re-run the
// smoke suite against it.
import { handleRequest } from "./core.js";

// Re-exported so the Durable Object class is present in the deployed
// main module (required by the MATCH_ROOM binding / v1 migration).
export { MatchRoom } from "./durable-match-room.js";
import type { Duel, Fixture, KickTotals, LedgerRow, Player, Store, Team } from "./core.js";
import { LEGEND_NFT } from "./config.js";
import { generateFixtures } from "./fixtures.js";

interface Env {
  DB: D1Database;
  AGENT_FOOTBALL_KV: KVNamespace;
  MATCH_ROOM: DurableObjectNamespace;
}

// Minimal local declarations so this compiles without @cloudflare/workers-types.
interface D1Database {
  prepare(query: string): D1PreparedStatement;
}
interface D1PreparedStatement {
  bind(...args: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}
interface DurableObjectNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(req: Request): Promise<Response> };
}

const J = (v: unknown): string => JSON.stringify(v ?? null);
const P = <T>(s: string | null, fallback: T): T => {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
};

function playerFromRow(r: Record<string, unknown>): Player {
  const buffsRaw = P(String(r.buffs_json ?? "{}"), {} as Record<string, unknown>);
  const badges = P(String(r.badges_json ?? "[]"), [] as string[]);
  const position = r.position as Player["position"];
  return {
    wallet: String(r.wallet),
    agent_id: (r.agent_id as string | null) ?? null,
    player_token_id: (r.player_token_id as number | null) ?? null,
    name: String(r.name),
    position,
    base_stats: P(String(r.base_stats ?? "{}"), {} as Record<string, number>),
    unlocked_stats: P(String(r.unlocked_stats ?? "{}"), {} as Record<string, number>),
    surplus_points: Number(r.surplus_points ?? 0),
    fatigue: Number(r.fatigue ?? 0),
    injury_until: (r.injury_until as string | null) ?? null,
    injury_type: (r.injury_type as string | null) ?? null,
    team_id: (r.team_id as string | null) ?? null,
    created_at: String(r.created_at ?? ""),
    buffs: {
      kneeBraceRemaining: Number(buffsRaw.kneeBraceRemaining ?? 0),
      ankleTapeDate: (buffsRaw.ankleTapeDate as string | null) ?? null,
      vitaminNext: Boolean(buffsRaw.vitaminNext ?? false),
      muscleRubDate: (buffsRaw.muscleRubDate as string | null) ?? null,
      tackleBonusDate: (buffsRaw.tackleBonusDate as string | null) ?? null,
    },
    badges,
    legend_nft: badges.includes("Immortal XI") ? LEGEND_NFT[position] : null,
    immortal_claimed: badges.includes("Immortal XI"),
    // Dev-only extras (extra Light trainings, sleep-mask night) ride in buffs_json in D1.
    extra_light_remaining: Number(buffsRaw.extra_light_remaining ?? 0),
    extra_light_date: (buffsRaw.extra_light_date as string | null) ?? null,
    sleep_mask_night: Boolean(buffsRaw.sleep_mask_night ?? false),
    last_seen_date: (buffsRaw.last_seen_date as string | null) ?? null,
    kick_balance: 0, // authoritative balance lives in kick_ledger; synced on read
    weekly_earned: {},
  };
}

export class D1Store implements Store {
  constructor(private db: D1Database) {}
  private async q<T>(sql: string, ...args: unknown[]): Promise<T[]> {
    const res = await this.db.prepare(sql).bind(...args).all<T>();
    return res.results;
  }
  private async one<T>(sql: string, ...args: unknown[]): Promise<T | null> {
    return this.db.prepare(sql).bind(...args).first<T>();
  }
  private async run(sql: string, ...args: unknown[]): Promise<void> {
    await this.db.prepare(sql).bind(...args).run();
  }

  async getPlayer(wallet: string): Promise<Player | null> {
    const row = await this.one<Record<string, unknown>>("SELECT * FROM players WHERE wallet = ?", wallet.toLowerCase());
    if (!row) return null;
    const p = playerFromRow(row);
    // Sync kick balance + weekly earned from the ledger (authoritative).
    const led = await this.q<Record<string, unknown>>("SELECT week, earned, balance FROM kick_ledger WHERE wallet = ? ORDER BY week DESC", wallet.toLowerCase());
    for (const l of led) {
      p.weekly_earned[String(l.week)] = Number(l.earned ?? 0);
    }
    if (led.length > 0) p.kick_balance = Number(led[0]!.balance ?? 0);
    return p;
  }
  async savePlayer(p: Player): Promise<void> {
    await this.run(
      `INSERT INTO players (agent_id, wallet, player_token_id, name, position, base_stats, surplus_points,
         unlocked_stats, fatigue, injury_until, injury_type, team_id, created_at, buffs_json, badges_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(wallet) DO UPDATE SET name=excluded.name, position=excluded.position,
         base_stats=excluded.base_stats, surplus_points=excluded.surplus_points,
         unlocked_stats=excluded.unlocked_stats, fatigue=excluded.fatigue,
         injury_until=excluded.injury_until, injury_type=excluded.injury_type,
         team_id=excluded.team_id, buffs_json=excluded.buffs_json, badges_json=excluded.badges_json`,
      p.agent_id, p.wallet.toLowerCase(), p.player_token_id, p.name, p.position, J(p.base_stats),
      p.surplus_points, J(p.unlocked_stats), p.fatigue, p.injury_until, p.injury_type,
      p.team_id, p.created_at,
      J({ ...p.buffs, extra_light_remaining: p.extra_light_remaining, extra_light_date: p.extra_light_date, sleep_mask_night: p.sleep_mask_night, last_seen_date: p.last_seen_date }),
      J(p.badges),
    );
  }
  async listPlayers(): Promise<Player[]> {
    const rows = await this.q<Record<string, unknown>>("SELECT wallet FROM players");
    const out: Player[] = [];
    for (const r of rows) { const p = await this.getPlayer(String(r.wallet)); if (p) out.push(p); }
    return out;
  }
  async countTrainings(wallet: string, date: string): Promise<number> {
    const row = await this.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM training_log WHERE wallet = ? AND date_utc = ? AND intensity != 'coach'",
      wallet.toLowerCase(), date);
    return row?.c ?? 0;
  }
  async addTraining(e: { wallet: string; date_utc: string; slot: string; intensity: string; stat_index: number; gain: number; injury_roll: boolean }): Promise<void> {
    await this.run(
      "INSERT INTO training_log (wallet, date_utc, slot, intensity, stat_index, gain, injury_roll) VALUES (?, ?, ?, ?, ?, ?, ?)",
      e.wallet.toLowerCase(), e.date_utc, e.slot, e.intensity, e.stat_index, e.gain, e.injury_roll ? 1 : 0);
  }
  async hasCoachToday(wallet: string, date: string): Promise<boolean> {
    const row = await this.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM training_log WHERE wallet = ? AND date_utc = ? AND intensity = 'coach'",
      wallet.toLowerCase(), date);
    return (row?.c ?? 0) > 0;
  }
  async hasDrawnToday(wallet: string, date: string): Promise<boolean> {
    const row = await this.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM daily_draws WHERE wallet = ? AND date_utc = ?",
      wallet.toLowerCase(), date);
    return (row?.c ?? 0) > 0;
  }
  async recordDraw(wallet: string, date: string, itemId: string): Promise<void> {
    if (await this.hasDrawnToday(wallet, date)) return;
    await this.run(
      "INSERT INTO daily_draws (wallet, date_utc, item_id) VALUES (?, ?, ?)",
      wallet.toLowerCase(), date, itemId);
    await this.addInventory(wallet, itemId, 1, "daily");
  }
  async getItemUses(wallet: string, date: string): Promise<{ total: number; recovery: number }> {
    const rows = await this.q<Record<string, unknown>>(
      "SELECT recovery FROM item_uses WHERE wallet = ? AND date_utc = ?", wallet.toLowerCase(), date);
    return { total: rows.length, recovery: rows.filter((r) => Number(r.recovery) === 1).length };
  }
  async recordItemUse(wallet: string, date: string, itemId: string, recovery: boolean): Promise<void> {
    await this.run(
      "INSERT INTO item_uses (wallet, date_utc, item_id, recovery) VALUES (?, ?, ?, ?)",
      wallet.toLowerCase(), date, itemId, recovery ? 1 : 0);
  }
  async getInventory(wallet: string): Promise<Record<string, number>> {
    const rows = await this.q<Record<string, unknown>>(
      "SELECT item_id, qty FROM items_inventory WHERE wallet = ?", wallet.toLowerCase());
    const inv: Record<string, number> = {};
    for (const r of rows) inv[String(r.item_id)] = Number(r.qty ?? 0);
    return inv;
  }
  async addInventory(wallet: string, itemId: string, qty: number, source: string): Promise<void> {
    await this.run(
      `INSERT INTO items_inventory (wallet, item_id, qty, source, onchain_token_id)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT(wallet, item_id) DO UPDATE SET qty = items_inventory.qty + excluded.qty`,
      wallet.toLowerCase(), itemId, qty, source);
  }
  async removeInventory(wallet: string, itemId: string, qty: number): Promise<void> {
    await this.run(
      "UPDATE items_inventory SET qty = MAX(0, qty - ?) WHERE wallet = ? AND item_id = ?",
      qty, wallet.toLowerCase(), itemId);
  }
  async getLedger(wallet: string, week: string): Promise<LedgerRow> {
    const row = await this.one<Record<string, unknown>>(
      "SELECT * FROM kick_ledger WHERE wallet = ? AND week = ?", wallet.toLowerCase(), week);
    if (!row) return { wallet: wallet.toLowerCase(), week, earned: 0, spent: 0, burned: 0, reward_pool_contrib: 0, creator_contrib: 0, topup_bought: 0, balance: 0 };
    return {
      wallet: wallet.toLowerCase(), week,
      earned: Number(row.earned ?? 0), spent: Number(row.spent ?? 0), burned: Number(row.burned ?? 0),
      reward_pool_contrib: Number(row.reward_pool_contrib ?? 0), creator_contrib: Number(row.creator_contrib ?? 0),
      topup_bought: Number(row.topup_bought ?? 0), balance: Number(row.balance ?? 0),
    };
  }
  async recordLedger(wallet: string, week: string, delta: Partial<LedgerRow>): Promise<void> {
    const cur = await this.getLedger(wallet, week);
    const next: LedgerRow = {
      ...cur,
      earned: cur.earned + (delta.earned ?? 0),
      spent: cur.spent + (delta.spent ?? 0),
      burned: cur.burned + (delta.burned ?? 0),
      reward_pool_contrib: cur.reward_pool_contrib + (delta.reward_pool_contrib ?? 0),
      creator_contrib: cur.creator_contrib + (delta.creator_contrib ?? 0),
      topup_bought: cur.topup_bought + (delta.topup_bought ?? 0),
      balance: delta.balance ?? cur.balance,
    };
    await this.run(
      `INSERT INTO kick_ledger (wallet, week, earned, spent, burned, reward_pool_contrib, creator_contrib, topup_bought, balance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(wallet, week) DO UPDATE SET earned=excluded.earned, spent=excluded.spent,
         burned=excluded.burned, reward_pool_contrib=excluded.reward_pool_contrib,
         creator_contrib=excluded.creator_contrib, topup_bought=excluded.topup_bought, balance=excluded.balance`,
      next.wallet, next.week, next.earned, next.spent, next.burned, next.reward_pool_contrib,
      next.creator_contrib, next.topup_bought, next.balance);
  }
  async getTotals(): Promise<KickTotals> {
    const row = await this.one<Record<string, unknown>>(
      "SELECT COALESCE(SUM(earned),0) AS earned, COALESCE(SUM(spent),0) AS spent, COALESCE(SUM(burned),0) AS burned, COALESCE(SUM(reward_pool_contrib),0) AS pool, COALESCE(SUM(creator_contrib),0) AS creator, COALESCE(SUM(topup_bought),0) AS topup FROM kick_ledger");
    return {
      earnedTotal: Number(row?.earned ?? 0), topupTotal: Number(row?.topup ?? 0),
      spentTotal: Number(row?.spent ?? 0), burnedTotal: Number(row?.burned ?? 0),
      poolTotal: Number(row?.pool ?? 0), creatorTotal: Number(row?.creator ?? 0),
    };
  }
  async addTotals(_delta: Partial<KickTotals>): Promise<void> {
    // Totals are derived from kick_ledger aggregates in D1 (see getTotals); no-op.
  }
  async getTeams(): Promise<Team[]> {
    const rows = await this.q<Record<string, unknown>>("SELECT * FROM teams ORDER BY id");
    const out: Team[] = [];
    for (const r of rows) {
      const members = await this.q<Record<string, unknown>>(
        "SELECT wallet, role FROM team_members WHERE team_id = ?", String(r.id));
      out.push({
        id: String(r.id), group: String(r.group), name: String(r.name),
        captain_wallet: (r.captain_wallet as string | null) ?? null,
        created_at: String(r.created_at ?? ""),
        members: members.map((m) => ({ wallet: String(m.wallet), role: (String(m.role) === "starter" ? "starter" : "sub") as "starter" | "sub" })),
      });
    }
    return out;
  }
  async getTeam(id: string): Promise<Team | null> {
    const teams = await this.getTeams();
    return teams.find((t) => t.id === id.toUpperCase()) ?? null;
  }
  async saveTeam(t: Team): Promise<void> {
    await this.run(
      `INSERT INTO teams (id, "group", name, captain_wallet, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, captain_wallet=excluded.captain_wallet`,
      t.id, t.group, t.name, t.captain_wallet, t.created_at);
    for (const m of t.members) {
      await this.run(
        "INSERT INTO team_members (team_id, wallet, role) VALUES (?, ?, ?) ON CONFLICT(team_id, wallet) DO UPDATE SET role=excluded.role",
        t.id, m.wallet, m.role);
    }
  }
  async addDuel(d: Duel): Promise<Duel> {
    const id = `duel-${Date.now()}`;
    await this.run(
      "INSERT INTO duels (id, challenger, opponent, type, status, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      id, d.challenger, d.opponent, d.type, d.status, J(d.result), d.created_at);
    return { ...d, id };
  }
  async getDuel(id: string): Promise<Duel | null> {
    const row = await this.one<Record<string, unknown>>("SELECT * FROM duels WHERE id = ?", id);
    if (!row) return null;
    return {
      id: String(row.id), challenger: String(row.challenger), opponent: String(row.opponent),
      type: String(row.type), status: String(row.status) as Duel["status"],
      result: P(String(row.result ?? "null"), null), created_at: String(row.created_at ?? ""),
    };
  }
  async updateDuel(d: Duel): Promise<void> {
    await this.run("UPDATE duels SET status = ?, result = ? WHERE id = ?", d.status, J(d.result), d.id);
  }
  async listDuels(): Promise<Duel[]> {
    const rows = await this.q<Record<string, unknown>>("SELECT * FROM duels ORDER BY created_at DESC LIMIT 100");
    const out: Duel[] = [];
    for (const row of rows) {
      const d = await this.getDuel(String(row.id));
      if (d) out.push(d);
    }
    return out;
  }
  async getFixtures(): Promise<Fixture[]> {
    const rows = await this.q<Record<string, unknown>>("SELECT * FROM fixtures ORDER BY round, id");
    if (rows.length === 0) return generateFixtures(); // deterministic fallback until seeded
    return rows.map((r) => ({
      id: String(r.id), round: Number(r.round), group: String(r.group) as Fixture["group"],
      home_team: String(r.home_team), away_team: String(r.away_team),
      match_date: String(r.match_date), slot_wib: String(r.slot_wib ?? "19:00"),
      status: String(r.status ?? "scheduled") as Fixture["status"],
      home_goals: (r.home_goals as number | null) ?? null,
      away_goals: (r.away_goals as number | null) ?? null,
    }));
  }
  async getTopupsToday(wallet: string, date: string): Promise<number> {
    const row = await this.one<{ total: number }>(
      "SELECT COALESCE(SUM(amount_kick),0) AS total FROM topup_intents WHERE wallet = ? AND date_utc = ?",
      wallet.toLowerCase(), date);
    return row?.total ?? 0;
  }
  async recordTopup(wallet: string, date: string, amount: number): Promise<void> {
    await this.run(
      "INSERT INTO topup_intents (id, wallet, date_utc, amount_kick, status) VALUES (?, ?, ?, ?, 'PENDING')",
      `topup-${wallet.toLowerCase().slice(2, 8)}-${Date.now()}`, wallet.toLowerCase(), date, amount);
  }
  async getScorers(): Promise<{ wallet: string; name: string; goals: number }[]> {
    return [];
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    let body: Record<string, unknown> | null = null;
    if (request.method === "POST" || request.method === "PUT") {
      try { body = (await request.json()) as Record<string, unknown>; } catch { body = {}; }
    }
    const query: Record<string, string> = {};
    url.searchParams.forEach((v, k) => { query[k] = v; });
    const store = new D1Store(env.DB);
    const result = await handleRequest(request.method, url.pathname, query, body, store, { devMode: false });
    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  },
};
