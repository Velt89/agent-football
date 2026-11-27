// Agent Football — on-chain player sync tests.
//   node workers/scripts/test-sync.mjs
// Part 1 (offline): the lazy-sync hook in core.ts — stub hook returns a
//   player on store miss, null/throw falls back to 404 (never 500).
// Part 2 (live, read-only): the real onchain-sync.ts against BSC RPC —
//   Velt must decode to token 0, MF, 44/47/44/59/47; a random wallet null.
// No deploy, no signing, no broadcast. Exits non-zero on any failure.
import { handleRequest, MemoryStore } from "../dist/core.js";
import { syncPlayerFromChain } from "../dist/onchain-sync.js";

const W = "0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A";
const NOWALLET = "0x9999999999999999999999999999999999999999";

let pass = 0;
let fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name} ${detail}`); }
}

const stubPlayer = {
  wallet: W.toLowerCase(), agent_id: null, player_token_id: 7,
  name: "Stub", position: "MF",
  base_stats: { Passing: 50, Vision: 50, Dribbling: 50, Stamina: 50, "Long Shots": 50 },
  unlocked_stats: {}, surplus_points: 3, fatigue: 0, injury_until: null, injury_type: null,
  team_id: null, created_at: new Date().toISOString(),
  buffs: { kneeBraceRemaining: 0, ankleTapeDate: null, vitaminNext: false, muscleRubDate: null, tackleBonusDate: null },
  badges: [], legend_nft: null, immortal_claimed: false,
  extra_light_remaining: 0, extra_light_date: null, sleep_mask_night: false,
  last_seen_date: null, kick_balance: 0, weekly_earned: {},
};

// 1a. Stub hook: miss -> sync -> 200 with the stub player, and it is saved.
{
  const store = new MemoryStore();
  const r = await handleRequest("GET", `/api/player/${W}`, {}, null, store,
    { devMode: false, syncPlayerFromChain: async () => stubPlayer });
  check("hook sync: miss returns stub player 200", r.status === 200 && r.body.player?.name === "Stub", JSON.stringify(r.body).slice(0, 160));
  check("hook sync: player saved to store", (await store.getPlayer(W))?.player_token_id === 7);
  // 1b. Second call hits the store, hook not called again.
  let calls = 0;
  const r2 = await handleRequest("GET", `/api/player/${W}`, {}, null, store,
    { devMode: false, syncPlayerFromChain: async () => { calls++; return null; } });
  check("hook sync: second call uses stored row, hook not called", r2.status === 200 && calls === 0);
}
// 1c. No hook -> 404 (old behaviour preserved).
{
  const store = new MemoryStore();
  const r = await handleRequest("GET", `/api/player/${W}`, {}, null, store, { devMode: false });
  check("no hook: miss is 404 PLAYER_NOT_FOUND", r.status === 404 && r.body.error === "PLAYER_NOT_FOUND", JSON.stringify(r.body));
}
// 1d. Hook returns null -> 404, not 500.
{
  const store = new MemoryStore();
  const r = await handleRequest("GET", `/api/player/${W}`, {}, null, store,
    { devMode: false, syncPlayerFromChain: async () => null });
  check("hook null: miss is 404", r.status === 404);
}
// 1e. Hook throws -> 404, not 500.
{
  const store = new MemoryStore();
  const r = await handleRequest("GET", `/api/player/${W}`, {}, null, store,
    { devMode: false, syncPlayerFromChain: async () => { throw new Error("rpc down"); } });
  check("hook throws: miss is 404, no 500", r.status === 404);
}

// 2. Live chain decode (read-only eth_call).
{
  const p = await syncPlayerFromChain(W);
  check("live sync: Velt found", p !== null);
  check("live sync: token 0", p?.player_token_id === 0, JSON.stringify(p?.player_token_id));
  check("live sync: name Velt, position MF", p?.name === "Velt" && p?.position === "MF", JSON.stringify({ name: p?.name, position: p?.position }));
  const s = p?.base_stats ?? {};
  check("live sync: stats 44/47/44/59/47",
    s.Passing === 44 && s.Vision === 47 && s.Dribbling === 44 && s.Stamina === 59 && s["Long Shots"] === 47,
    JSON.stringify(s));
  check("live sync: surplus 0, no unlocked stats", p?.surplus_points === 0 && Object.keys(p?.unlocked_stats ?? {}).length === 0,
    JSON.stringify({ surplus: p?.surplus_points, unlocked: p?.unlocked_stats }));
  const none = await syncPlayerFromChain(NOWALLET);
  check("live sync: wallet with no player returns null", none === null);
}

console.log(`\nSYNC TESTS: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail ? 1 : 0);
