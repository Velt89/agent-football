-- Agent Football — D1 schema (Cloudflare D1, SQLite).
-- Apply with: wrangler d1 execute agent_football_db --file=workers/schema.sql
-- (config only in this repo — NO deploy is run from here).
-- JSON columns are TEXT holding JSON (base_stats, unlocked_stats, buffs_json, badges_json).
-- Extra operational tables/columns beyond the DESIGN.md list are marked [extra].

CREATE TABLE IF NOT EXISTS players (
  agent_id        TEXT,
  wallet          TEXT PRIMARY KEY,              -- lowercase 0x address
  player_token_id INTEGER,
  name            TEXT NOT NULL UNIQUE,          -- never changes, first-come at mint
  position        TEXT NOT NULL CHECK (position IN ('GK','DF','MF','FW')),
  base_stats      TEXT NOT NULL DEFAULT '{}',    -- {"Finishing": 55, ...} 5 stats, cap 99
  surplus_points  INTEGER NOT NULL DEFAULT 0,
  unlocked_stats  TEXT NOT NULL DEFAULT '{}',    -- surplus-unlocked stats, start at 40
  fatigue         INTEGER NOT NULL DEFAULT 0,    -- 0-100
  injury_until    TEXT,                          -- YYYY-MM-DD inclusive, NULL = fit
  injury_type     TEXT,                          -- Minor Strain | Sprain | Serious
  team_id         TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  buffs_json      TEXT NOT NULL DEFAULT '{}',    -- [extra] knee brace / ankle tape / vitamin / muscle rub + extra-light / sleep-mask / last-seen
  badges_json     TEXT NOT NULL DEFAULT '[]'    -- [extra] soulbound badges, e.g. ["Immortal XI"]
);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);

CREATE TABLE IF NOT EXISTS training_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet      TEXT NOT NULL,
  date_utc    TEXT NOT NULL,                     -- YYYY-MM-DD (UTC day)
  slot        TEXT NOT NULL DEFAULT 'free',      -- free | extra-light | coach
  intensity   TEXT NOT NULL,                     -- light | standard | intense | coach
  stat_index  INTEGER NOT NULL,
  gain        INTEGER NOT NULL,
  injury_roll INTEGER NOT NULL DEFAULT 0,       -- 1 = injury rolled on this training
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_training_wallet_date ON training_log(wallet, date_utc);

CREATE TABLE IF NOT EXISTS kick_ledger (
  wallet              TEXT NOT NULL,
  week                TEXT NOT NULL,             -- ISO week YYYY-Www
  earned              INTEGER NOT NULL DEFAULT 0,
  spent               INTEGER NOT NULL DEFAULT 0,
  burned              INTEGER NOT NULL DEFAULT 0,
  reward_pool_contrib INTEGER NOT NULL DEFAULT 0,
  creator_contrib     INTEGER NOT NULL DEFAULT 0,
  topup_bought        INTEGER NOT NULL DEFAULT 0,
  balance             INTEGER NOT NULL DEFAULT 0,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (wallet, week)
);

CREATE TABLE IF NOT EXISTS items_inventory (
  wallet           TEXT NOT NULL,
  item_id          TEXT NOT NULL,
  qty              INTEGER NOT NULL DEFAULT 0,
  source           TEXT NOT NULL,                -- daily | supermarket
  onchain_token_id INTEGER,                      -- NULL in S1 (items are off-chain until mint)
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),  -- [extra] audit trail
  PRIMARY KEY (wallet, item_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id             TEXT PRIMARY KEY,               -- A..P
  "group"        TEXT NOT NULL CHECK ("group" IN ('A','B')),
  name           TEXT NOT NULL,                  -- placeholder "Team A".."Team P" until captains rename
  captain_wallet TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id TEXT NOT NULL REFERENCES teams(id),
  wallet  TEXT NOT NULL,
  role    TEXT NOT NULL CHECK (role IN ('starter','sub')),
  PRIMARY KEY (team_id, wallet)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id         TEXT PRIMARY KEY,                   -- R1-M1..R7-M56, F-M57..F-M64
  round      INTEGER NOT NULL,                   -- 1-7 group rounds, 8 = finals week
  "group"    TEXT NOT NULL,                      -- A | B | Finals
  home_team  TEXT NOT NULL,
  away_team  TEXT NOT NULL,
  match_date TEXT NOT NULL,                      -- YYYY-MM-DD (Saturday)
  slot_wib   TEXT NOT NULL DEFAULT '19:00',     -- [extra] 19:00 | 20:00 WIB
  status     TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | live | played
  home_goals INTEGER,
  away_goals INTEGER
);
CREATE INDEX IF NOT EXISTS idx_fixtures_round ON fixtures(round);

CREATE TABLE IF NOT EXISTS matches_live (
  match_id TEXT PRIMARY KEY,
  minute   INTEGER NOT NULL DEFAULT 0,          -- game minute 0-90
  score    TEXT NOT NULL DEFAULT '0-0',
  moments  TEXT NOT NULL DEFAULT '[]'           -- JSON array of live moments
);

CREATE TABLE IF NOT EXISTS duels (
  id         TEXT PRIMARY KEY,
  challenger TEXT NOT NULL,
  opponent   TEXT NOT NULL,
  type       TEXT NOT NULL,                      -- penalty | dribble | passing
  status     TEXT NOT NULL DEFAULT 'open',       -- open | completed
  result     TEXT,                               -- JSON: winner, loser, method, kickEarned
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_duels_players ON duels(challenger, opponent);

CREATE TABLE IF NOT EXISTS weekly_rewards (
  week            TEXT NOT NULL,
  category        TEXT NOT NULL,                 -- team_of_week | top_scorer | best_gk | man_of_week | hardest_trainer
  winner_wallet   TEXT NOT NULL,
  amount_bnb      REAL NOT NULL DEFAULT 0,
  amount_kick     INTEGER NOT NULL DEFAULT 0,
  envelope_claimed INTEGER NOT NULL DEFAULT 0,  -- 0 = unclaimed, 1 = claimed
  PRIMARY KEY (week, category, winner_wallet)
);

-- [extra] operational tables the D1Store needs for server-enforced daily caps.
-- These hold no money: they are the audit trail for the 1/day draw, item-use
-- caps (3/day, max 1 recovery/day) and the 500/day $KICK top-up cap.
CREATE TABLE IF NOT EXISTS daily_draws (
  wallet   TEXT NOT NULL,
  date_utc TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  PRIMARY KEY (wallet, date_utc)
);
CREATE TABLE IF NOT EXISTS item_uses (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet   TEXT NOT NULL,
  date_utc TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  recovery INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_item_uses_wallet_date ON item_uses(wallet, date_utc);
CREATE TABLE IF NOT EXISTS topup_intents (
  id         TEXT PRIMARY KEY,
  wallet     TEXT NOT NULL,
  date_utc   TEXT NOT NULL,
  amount_kick INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'PENDING',    -- PENDING | CONFIRMED | FAILED
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_topup_wallet_date ON topup_intents(wallet, date_utc);

-- Seed the 16 placeholder teams (captains rename them at formation).
INSERT OR IGNORE INTO teams (id, "group", name) VALUES
  ('A','A','Team A'),('B','A','Team B'),('C','A','Team C'),('D','A','Team D'),
  ('E','A','Team E'),('F','A','Team F'),('G','A','Team G'),('H','A','Team H'),
  ('I','B','Team I'),('J','B','Team J'),('K','B','Team K'),('L','B','Team L'),
  ('M','B','Team M'),('N','B','Team N'),('O','B','Team O'),('P','B','Team P');
