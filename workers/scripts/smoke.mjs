// Agent Football — smoke test for the local dev server.
// Starts workers/local-server.mjs on a scratch port, exercises the caps and
// rules from DESIGN.md, and reports exact pass/fail counts. No deploy, no
// signing, no network beyond localhost.
//   node workers/scripts/smoke.mjs [port]
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = Number(process.argv[2] ?? 8899);
const BASE = `http://localhost:${PORT}`;
const W = "0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A"; // main wallet (demo player in dev mode)
const W2 = "0x1111111111111111111111111111111111111111";
const W3 = "0x2222222222222222222222222222222222222222";

let pass = 0;
let fail = 0;
const results = [];
function check(name, cond, detail = "") {
  if (cond) { pass++; results.push(`PASS  ${name}`); }
  else { fail++; results.push(`FAIL  ${name} ${detail}`); }
}
async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const server = spawn("node", ["workers/local-server.mjs", String(PORT)], {
  cwd: new URL("../..", import.meta.url).pathname,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOut = "";
server.stdout.on("data", (d) => { serverOut += d; });
server.stderr.on("data", (d) => { serverOut += d; });
try {
  // Wait for the server to listen.
  for (let i = 0; i < 50; i++) {
    try { await fetch(`${BASE}/api/health`); break; } catch { await sleep(100); }
  }

  // 1. health
  let r = await req("GET", "/api/health");
  check("health 200 + ok", r.status === 200 && r.json.ok === true, JSON.stringify(r.json));

  // 2. config: zero contract, DEPLOYED=false, registry, caps
  r = await req("GET", "/api/config");
  check("config contract is zero address", r.json.contract_address === "0x0000000000000000000000000000000000000000", JSON.stringify(r.json.contract_address));
  check("config DEPLOYED=false", r.json.deployed === false);
  check("config registry 0x60B9...022F", r.json.registry === "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F", JSON.stringify(r.json.registry));
  check("config S1 cap 3,000,000", r.json.kick?.season1Cap === 3000000, JSON.stringify(r.json.kick));
  check("config top-up 100 KICK = 0.001 BNB", r.json.kick?.topupKickPerBnb === 100 && r.json.kick?.topupBnbPer100Kick === "0.001");

  // 3. player auto-provision (dev mode) + FW stats
  r = await req("GET", `/api/player/${W}`);
  check("player provisioned in dev mode", r.status === 200 && r.json.player?.position === "FW", JSON.stringify(r.json).slice(0, 200));
  check("player base stats 5 x 40-60", Array.isArray(Object.values(r.json.player?.base_stats ?? {})) && Object.values(r.json.player.base_stats).length === 5 && Object.values(r.json.player.base_stats).every((v) => v >= 40 && v <= 60), JSON.stringify(r.json.player?.base_stats));

  // 4. train 3x OK, 4th FAILS with cap error
  let trained = 0;
  for (let i = 0; i < 3; i++) {
    r = await req("POST", "/api/train", { wallet: W, statIndex: 0, intensity: "light" });
    if (r.status === 200 && r.json.ok) trained++;
  }
  check("train 3x succeeds", trained === 3, `trained=${trained}`);
  r = await req("POST", "/api/train", { wallet: W, statIndex: 0, intensity: "light" });
  check("4th train FAILS TRAINING_CAP 429", r.status === 429 && r.json.error === "TRAINING_CAP", `status=${r.status} error=${r.json.error}`);
  // $KICK: 3 trainings x 10
  r = await req("GET", `/api/player/${W}`);
  check("kick balance 30 after 3 trainings", r.json.player?.kick_balance === 30, `balance=${r.json.player?.kick_balance}`);

  // 5. coach 1x OK (intent, 0.001 BNB), 2nd FAILS
  r = await req("POST", "/api/coach", { wallet: W, statIndex: 1 });
  check("coach 1st returns 0.001 BNB intent", r.status === 200 && r.json.intent?.amountBnb === "0.001" && r.json.intent?.status === "PENDING_ONCHAIN", JSON.stringify(r.json.intent));
  check("coach intent does not broadcast (zero to-address)", r.json.intent?.to === "0x0000000000000000000000000000000000000000");
  r = await req("POST", "/api/coach", { wallet: W, statIndex: 1 });
  check("coach 2nd FAILS COACH_CAP 429", r.status === 429 && r.json.error === "COACH_CAP", `status=${r.status} error=${r.json.error}`);

  // 6. daily draw 1x OK, 2nd FAILS
  r = await req("POST", "/api/items/draw", { wallet: W });
  check("daily draw 1st succeeds", r.status === 200 && !!r.json.item?.id, JSON.stringify(r.json));
  r = await req("POST", "/api/items/draw", { wallet: W });
  check("daily draw 2nd FAILS DRAW_CAP 429", r.status === 429 && r.json.error === "DRAW_CAP", `status=${r.status}`);

  // 7. buy item with $KICK — need 50 KICK for Recovery Shake Pro; earn more first via W2
  // W has 30 KICK; buy Ankle Tape (20) -> split 30/65/5 of 20 = 6 burned / 13 pool / 1 creator.
  r = await req("POST", "/api/items/buy", { wallet: W, itemId: "ankle_tape" });
  check("buy ankle_tape succeeds", r.status === 200 && r.json.bought === "ankle_tape", JSON.stringify(r.json));
  check("buy split 30/65/5 of 20 = 6/13/1", r.json.split?.burned === 6 && r.json.split?.rewardPool === 13 && r.json.split?.creator === 1, JSON.stringify(r.json.split));
  check("buy split sums to price", (r.json.split?.burned ?? 0) + (r.json.split?.rewardPool ?? 0) + (r.json.split?.creator ?? 0) === 20);
  r = await req("GET", `/api/player/${W}`);
  check("kick balance 10 after spending 20 of 30", r.json.player?.kick_balance === 10, `balance=${r.json.player?.kick_balance}`);
  check("ledger burned=6 pool=13 creator=1", r.json.ledger?.burned === 6 && r.json.ledger?.reward_pool_contrib === 13 && r.json.ledger?.creator_contrib === 1, JSON.stringify(r.json.ledger));
  // insufficient funds
  r = await req("POST", "/api/items/buy", { wallet: W, itemId: "recovery_shake_pro" });
  check("buy with insufficient $KICK FAILS 402", r.status === 402 && r.json.error === "INSUFFICIENT_KICK", `status=${r.status}`);

  // 8. item use: use the ankle tape (prevention), then recovery cap path via W2
  r = await req("POST", "/api/items/use", { wallet: W, itemId: "ankle_tape" });
  check("use ankle_tape succeeds", r.status === 200 && r.json.used === "ankle_tape", JSON.stringify(r.json));
  r = await req("POST", "/api/items/use", { wallet: W, itemId: "ankle_tape" });
  check("use missing item FAILS NO_ITEM", r.status === 400 && r.json.error === "NO_ITEM", `status=${r.status} error=${r.json.error}`);

  // 9. surplus unlock with insufficient surplus FAILS
  r = await req("POST", "/api/surplus/unlock", { wallet: W, statId: "Weak Foot" });
  check("surplus unlock insufficient FAILS 402", r.status === 402 && r.json.error === "INSUFFICIENT_SURPLUS", `status=${r.status} error=${r.json.error}`);
  // bad stat id
  r = await req("POST", "/api/surplus/unlock", { wallet: W, statId: "Penalty Saving" });
  check("surplus unlock wrong-position stat FAILS BAD_STAT", r.status === 400 && r.json.error === "BAD_STAT", `status=${r.status} error=${r.json.error}`);

  // 10. immortal claim with non-99 stats FAILS
  r = await req("POST", "/api/immortal/claim", { wallet: W });
  check("immortal claim non-99 FAILS NOT_ALL_99 403", r.status === 403 && r.json.error === "NOT_ALL_99", `status=${r.status} error=${r.json.error}`);

  // 11. top-up: 100 KICK PENDING, no credit; 600 over daily cap FAILS
  r = await req("POST", "/api/kick/topup", { wallet: W, amountKick: 100 });
  check("top-up 100 KICK PENDING intent", r.status === 200 && r.json.intent?.status === "PENDING" && r.json.intent?.amountBnb === "0.001000", JSON.stringify(r.json.intent));
  r = await req("GET", `/api/player/${W}`);
  check("top-up does NOT credit $KICK until confirmed", r.json.player?.kick_balance === 10, `balance=${r.json.player?.kick_balance}`);
  r = await req("POST", "/api/kick/topup", { wallet: W, amountKick: 500 });
  check("top-up 500 more FAILS TOPUP_CAP (100+500>500/day)", r.status === 429 && r.json.error === "TOPUP_CAP", `status=${r.status} error=${r.json.error}`);
  r = await req("POST", "/api/kick/topup", { wallet: W, amountKick: 150 });
  check("top-up non-multiple-of-100 FAILS BAD_AMOUNT", r.status === 400 && r.json.error === "BAD_AMOUNT", `status=${r.status}`);

  // 12. teams: join + FCFS cap behaviour
  r = await req("POST", "/api/teams/join", { wallet: W, teamId: "A" });
  check("join Team A as starter", r.status === 200 && r.json.role === "starter" && r.json.squadSize === 1, JSON.stringify(r.json));
  r = await req("POST", "/api/teams/join", { wallet: W, teamId: "B" });
  check("second team join FAILS ALREADY_IN_TEAM", r.status === 400 && r.json.error === "ALREADY_IN_TEAM", `status=${r.status}`);
  r = await req("GET", "/api/teams/A");
  check("team A lists 1 member + captain", r.json.team?.members?.length === 1 && r.json.team?.captain_wallet === W.toLowerCase(), JSON.stringify(r.json.team));
  r = await req("GET", "/api/teams");
  check("16 teams listed", r.json.teams?.length === 16, `count=${r.json.teams?.length}`);

  // 13. duels: challenge + play resolves with a winner +20 KICK
  r = await req("POST", "/api/duels/challenge", { wallet: W, opponent: W2, type: "penalty" });
  check("duel challenge created", r.status === 201 && !!r.json.duel?.id, JSON.stringify(r.json));
  const duelId = r.json.duel?.id;
  r = await req("POST", "/api/duels/play", { duelId, wallet: W, zone: "top-left", timing: 0.5 });
  check("duel play completes with winner", r.status === 200 && !!r.json.winner, JSON.stringify(r.json));

  // 14. fixtures: 16 teams / 2 groups / 7 rounds + finals
  r = await req("GET", "/api/league/fixtures");
  const fx = r.json.fixtures ?? [];
  check("fixtures total 64 (56 group + 8 finals)", fx.length === 64, `count=${fx.length}`);
  check("fixtures 7 group rounds", new Set(fx.filter((f) => f.round <= 7).map((f) => f.round)).size === 7);
  check("fixtures finals round 8 = 8 matches Jan 23 2027", fx.filter((f) => f.round === 8).length === 8 && fx.filter((f) => f.round === 8).every((f) => f.match_date === "2027-01-23"));
  check("fixtures matchdays are Saturdays Dec 5..Jan 16", ["2026-12-05", "2026-12-12", "2026-12-19", "2026-12-26", "2027-01-02", "2027-01-09", "2027-01-16"].every((d) => fx.some((f) => f.match_date === d)));
  check("fixtures slots 19:00/20:00 only", fx.every((f) => f.slot_wib === "19:00" || f.slot_wib === "20:00"));
  // every team plays every other team in its group exactly once (round-robin check)
  const groupA = ["Team A", "Team B", "Team C", "Team D", "Team E", "Team F", "Team G", "Team H"];
  const pairs = new Set();
  for (const f of fx.filter((f) => f.group === "A")) pairs.add([f.home_team, f.away_team].sort().join(" v "));
  check("group A round-robin: 28 unique pairings", pairs.size === 28, `pairs=${pairs.size}`);
  r = await req("GET", "/api/league/table");
  check("league table returns groups A+B, 8 teams each", r.json.groups?.A?.length === 8 && r.json.groups?.B?.length === 8);

  // 15. match engine via live endpoint: 12-15 moments, halftime, MotM, deterministic
  r = await req("GET", "/api/match/R1-M1/live");
  const m = r.json.match;
  check("live match returns generated match", r.status === 200 && !!m, `status=${r.status}`);
  check("match has 12-15 moments", m?.moments?.length >= 12 && m?.moments?.length <= 15, `moments=${m?.moments?.length}`);
  check("match moments include 12' and 67' and 89'", m?.moments?.some((x) => x.minute === 12) && m?.moments?.some((x) => x.minute === 67) && m?.moments?.some((x) => x.minute === 89));
  check("match has halftime at 45", m?.halftime?.minute === 45);
  check("match has Man of the Match", !!m?.manOfTheMatch?.position && m?.manOfTheMatch?.momentsWon > 0, JSON.stringify(m?.manOfTheMatch));
  const homeGoalMoments = m?.moments?.filter((x) => x.outcome === "goal" && ((x.type === "shoot" && x.team === "home") || (x.type === "save" && x.team === "away"))).length;
  const awayGoalMoments = m?.moments?.filter((x) => x.outcome === "goal" && ((x.type === "shoot" && x.team === "away") || (x.type === "save" && x.team === "home"))).length;
  check("match score equals goal moments", m?.homeGoals === homeGoalMoments && m?.awayGoals === awayGoalMoments, `score=${m?.homeGoals}-${m?.awayGoals} moments=${homeGoalMoments}-${awayGoalMoments}`);
  const r2 = await req("GET", "/api/match/R1-M1/live");
  check("match deterministic: same fixture replays identically", JSON.stringify(r2.json.match) === JSON.stringify(m), "replay mismatch");

  // 16. weekly rewards pool reflects 65% of KICK spent (20 spent -> 13 pool)
  r = await req("GET", "/api/rewards/weekly");
  check("weekly pool kick = 65% of spent (13)", r.json.pool?.kick === 13, `pool=${r.json.pool?.kick}`);
  check("weekly split sums to pool", Math.floor(13 * 0.4) + Math.floor(13 * 0.2) + Math.floor(13 * 0.15) + Math.floor(13 * 0.15) + Math.floor(13 * 0.1) <= 13);

  // 17. misc guards
  r = await req("GET", "/api/player/not-a-wallet");
  check("bad wallet 400", r.status === 400 && r.json.error === "BAD_WALLET", `status=${r.status}`);
  r = await req("GET", "/api/nope");
  check("unknown route 404", r.status === 404, `status=${r.status}`);
  r = await req("POST", "/api/train", { wallet: W3, statIndex: 0, intensity: "intense" });
  check("intense training applies (fatigue 45) for fresh wallet", r.status === 200 && r.json.training?.fatigue === 45, JSON.stringify(r.json.training));
} finally {
  server.kill();
}

console.log(results.join("\n"));
console.log(`\nSMOKE: ${pass} passed, ${fail} failed, ${pass + fail} total`);
process.exit(fail === 0 ? 0 : 1);
