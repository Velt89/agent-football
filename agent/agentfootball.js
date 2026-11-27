#!/usr/bin/env node
// Agent Football — agent CLI. No external deps, plain node:http(s).
// Talks to the Agent Football API (local dev server by default).
//   AGENT_FOOTBALL_API=http://localhost:8787 node agent/agentfootball.js <command>
//   node agent/agentfootball.js --demo <command>   (demo wallet, local server)
// No wallet signing, no broadcast, no deploy — read + server-enforced actions only.
const http = require("node:http");
const https = require("node:https");

const API = process.env.AGENT_FOOTBALL_API || "http://localhost:8787";
const DEMO_WALLET = "0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A"; // BAW main wallet (demo player in dev mode)
const DEMO_OPPONENT = "0x1111111111111111111111111111111111111111";

function apiCall(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API + path);
    const lib = url.protocol === "https:" ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const req = lib.request(url, {
      method,
      headers: { "content-type": "application/json", ...(data ? { "content-length": Buffer.byteLength(data) } : {}) },
    }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) }); }
        catch { resolve({ status: res.statusCode, json: {} }); }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function show(title, obj) {
  console.log(`== ${title} ==`);
  console.log(JSON.stringify(obj, null, 2));
}
function fail(r, what) {
  console.error(`${what} failed [${r.status}]: ${r.json.error || "?"} — ${r.json.message || ""}`);
  process.exitCode = 1;
}
function walletArg(a, fallback) {
  const w = a || fallback;
  if (!/^0x[0-9a-fA-F]{40}$/.test(w || "")) {
    console.error(`Bad wallet: ${w} (need a 0x 40-hex address)`);
    process.exit(1);
  }
  return w;
}

async function main() {
  let args = process.argv.slice(2);
  let demo = false;
  if (args[0] === "--demo") { demo = true; args = args.slice(1); }
  const defWallet = demo ? DEMO_WALLET : undefined;
  const cmd = args[0];
  const rest = args.slice(1);

  if (!cmd || cmd === "help" || cmd === "--help") {
    console.log(`Agent Football CLI — API base ${API}${demo ? " (--demo, wallet " + DEMO_WALLET + ")" : ""}

Usage: node agent/agentfootball.js [--demo] <command> [args]

  status                              API health + config (deployed? caps, season)
  player [wallet]                     Player card: stats, overall, fatigue, injury, $KICK, inventory
  train <wallet> <stat|index> <light|standard|intense>
                                      Train one stat (3/day UTC, server-enforced)
  coach <wallet> <statIndex>          1-on-1 Coach Session intent (0.001 BNB, 1/day, NOT broadcast)
  draw [wallet]                       Daily free item draw (1/day)
  inventory [wallet]                  Owned items (daily + Supermarket)
  items buy <wallet> <itemId>         Buy a Supermarket item with $KICK (30/65/5 split)
  items use <wallet> <itemId>         Use an owned item (3/day, max 1 recovery/day)
  league                              League tables (Group A + B) and top scorers
  fixtures [round]                    All fixtures, or one round (1-7 group, 8 finals)
  teams [id]                          All 16 teams, or one team (squad + captain)
  teams join <wallet> <teamId>        Join a team (first-come, 15 max, 11 starters + 4 subs)
  duel challenge <wallet> <opponent> [penalty|dribble|passing]
  duel play <duelId> <wallet> [zone] [timing 0..1]
                                      Play a duel; omit zone/timing for stats-only auto-play
  duel list                           Open + completed duels
  match <fixtureId> [seed]            Live match simulation (12-15 moments, deterministic)
  kick [wallet]                       $KICK balance + weekly ledger
  kick topup <wallet> <amountKick>    Top-up intent (100 KICK = 0.001 BNB, max 500/day, PENDING only)
  surplus unlock <wallet> <statId>    Unlock a new stat (20 surplus, starts at 40)
  immortal [wallet]                   Claim Immortal XI badge + Legend NFT (all 5 base stats 99)
  rewards                             This week's reward pool + split (40/20/15/15/10)

Examples:
  node agent/agentfootball.js --demo status
  node agent/agentfootball.js --demo player
  node agent/agentfootball.js --demo train ${DEMO_WALLET} 0 intense
  node agent/agentfootball.js --demo fixtures 1
  node agent/agentfootball.js --demo match R1-M1
`);
    return;
  }

  switch (cmd) {
    case "status": {
      const h = await apiCall("GET", "/api/health");
      const c = await apiCall("GET", "/api/config");
      if (!h.json.ok) return fail(h, "health");
      show("health", h.json);
      show("config", {
        contract_address: c.json.contract_address, deployed: c.json.deployed,
        registry: c.json.registry, season: c.json.season,
        kick: c.json.kick, coach: c.json.coach,
      });
      break;
    }
    case "player": {
      const w = walletArg(rest[0], defWallet);
      const r = await apiCall("GET", `/api/player/${w}`);
      if (!r.json.ok) return fail(r, "player");
      const p = r.json.player;
      console.log(`== Player ${p.name} (${p.position}) ==`);
      console.log(`wallet: ${p.wallet}  overall: ${p.overall}  team: ${p.team_id || "-"}`);
      console.log(`base stats: ${Object.entries(p.base_stats).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      if (Object.keys(p.unlocked_stats).length) console.log(`unlocked: ${Object.entries(p.unlocked_stats).map(([k, v]) => `${k} ${v}`).join(", ")}`);
      console.log(`surplus: ${p.surplus_points}  fatigue: ${p.fatigue}/100  injury: ${p.injury_type || "fit"}${p.injury_until ? " until " + p.injury_until : ""}`);
      console.log(`$KICK: ${p.kick_balance}  badges: ${p.badges.join(", ") || "-"}  legend NFT: ${p.legend_nft || "-"}`);
      console.log(`inventory: ${JSON.stringify(p.inventory)}`);
      break;
    }
    case "train": {
      const w = walletArg(rest[0], defWallet);
      const stat = rest[1];
      const intensity = rest[2];
      if (stat === undefined || !["light", "standard", "intense"].includes(intensity || "")) {
        console.error("Usage: train <wallet> <stat|index> <light|standard|intense>"); process.exit(1);
      }
      const body = { wallet: w, intensity };
      if (/^\d+$/.test(stat)) body.statIndex = Number(stat); else body.stat = stat;
      const r = await apiCall("POST", "/api/train", body);
      if (!r.json.ok) return fail(r, "train");
      show("training", r.json);
      break;
    }
    case "coach": {
      const w = walletArg(rest[0], defWallet);
      const statIndex = Number(rest[1]);
      if (!Number.isInteger(statIndex)) { console.error("Usage: coach <wallet> <statIndex 0-4>"); process.exit(1); }
      const r = await apiCall("POST", "/api/coach", { wallet: w, statIndex });
      if (!r.json.ok) return fail(r, "coach");
      show("coach intent (NOT broadcast — frontend uses this at deploy time)", r.json);
      break;
    }
    case "draw": {
      const w = walletArg(rest[0], defWallet);
      const r = await apiCall("POST", "/api/items/draw", { wallet: w });
      if (!r.json.ok) return fail(r, "draw");
      show("daily draw", r.json);
      break;
    }
    case "inventory": {
      const w = walletArg(rest[0], defWallet);
      const r = await apiCall("GET", `/api/player/${w}`);
      if (!r.json.ok) return fail(r, "inventory");
      show("inventory", { wallet: w, inventory: r.json.player.inventory });
      break;
    }
    case "items": {
      const sub = rest[0];
      const w = walletArg(rest[1], defWallet);
      const itemId = rest[2];
      if (sub === "buy") {
        if (!itemId) { console.error("Usage: items buy <wallet> <itemId>"); process.exit(1); }
        const r = await apiCall("POST", "/api/items/buy", { wallet: w, itemId });
        if (!r.json.ok) return fail(r, "buy");
        show("bought", r.json);
      } else if (sub === "use") {
        if (!itemId) { console.error("Usage: items use <wallet> <itemId>"); process.exit(1); }
        const r = await apiCall("POST", "/api/items/use", { wallet: w, itemId });
        if (!r.json.ok) return fail(r, "use");
        show("used", r.json);
      } else {
        const r = await apiCall("GET", "/api/items");
        show("supermarket catalogue", r.json);
      }
      break;
    }
    case "league": {
      const t = await apiCall("GET", "/api/league/table");
      const s = await apiCall("GET", "/api/league/scorers");
      const fmt = (rows) => rows.map((r) => `${r.team.padEnd(8)} P${r.p} W${r.w} D${r.d} L${r.l} ${r.gf}-${r.ga} GD${r.gd >= 0 ? "+" : ""}${r.gd} ${r.pts}pts`).join("\n");
      console.log("== League — Group A ==\n" + fmt(t.json.groups?.A ?? []));
      console.log("== League — Group B ==\n" + fmt(t.json.groups?.B ?? []));
      show("top scorers", s.json);
      break;
    }
    case "fixtures": {
      const round = rest[0];
      const r = await apiCall("GET", `/api/league/fixtures${round ? `?round=${round}` : ""}`);
      if (!r.json.ok) return fail(r, "fixtures");
      for (const f of r.json.fixtures) {
        console.log(`R${f.round} ${f.match_date} ${f.slot_wib} WIB  ${f.home_team} vs ${f.away_team}  [${f.group}] ${f.status}${f.home_goals !== null ? `  ${f.home_goals}-${f.away_goals}` : ""}`);
      }
      console.log(`(${r.json.fixtures.length} fixtures)`);
      break;
    }
    case "teams": {
      if (rest[0] === "join") {
        const w = walletArg(rest[1], defWallet);
        const teamId = (rest[2] || "").toUpperCase();
        const r = await apiCall("POST", "/api/teams/join", { wallet: w, teamId });
        if (!r.json.ok) return fail(r, "join");
        show("joined team", r.json);
      } else if (rest[0]) {
        const r = await apiCall("GET", `/api/teams/${rest[0]}`);
        if (!r.json.ok) return fail(r, "team");
        show(`team ${rest[0].toUpperCase()}`, r.json.team);
      } else {
        const r = await apiCall("GET", "/api/teams");
        for (const t of r.json.teams) {
          console.log(`${t.id} [Group ${t.group}] ${t.name} — ${t.members.length}/15 (${t.members.filter((m) => m.role === "starter").length} starters) captain: ${t.captain_wallet || "-"}`);
        }
      }
      break;
    }
    case "duel": {
      const sub = rest[0];
      if (sub === "challenge") {
        const w = walletArg(rest[1], defWallet);
        const opp = walletArg(rest[2], DEMO_OPPONENT);
        const type = rest[3] || "penalty";
        const r = await apiCall("POST", "/api/duels/challenge", { wallet: w, opponent: opp, type });
        if (!r.json.ok) return fail(r, "duel challenge");
        show("duel challenged", r.json);
      } else if (sub === "play") {
        const duelId = rest[1];
        const w = walletArg(rest[2], defWallet);
        const body = { duelId, wallet: w };
        if (rest[3]) body.zone = rest[3];
        if (rest[4] !== undefined) body.timing = Number(rest[4]);
        const r = await apiCall("POST", "/api/duels/play", body);
        if (!r.json.ok) return fail(r, "duel play");
        show("duel result", r.json);
      } else {
        const r = await apiCall("GET", "/api/duels");
        show("duels", r.json);
      }
      break;
    }
    case "match": {
      const id = rest[0];
      if (!id) { console.error("Usage: match <fixtureId> [seed]  (e.g. match R1-M1)"); process.exit(1); }
      const r = await apiCall("GET", `/api/match/${id}/live${rest[1] ? `?seed=${rest[1]}` : ""}`);
      if (!r.json.ok) return fail(r, "match");
      const m = r.json.match;
      console.log(`== ${m.homeTeam} ${m.homeGoals} - ${m.awayGoals} ${m.awayTeam} ==  (${m.moments.length} moments, 10 min real = 90 game min)`);
      for (const mo of m.moments) {
        console.log(` ${String(mo.minute).padStart(2)}' [${mo.type}] ${mo.description} — ${mo.outcome} (${mo.team}, ${mo.positions.join(" vs ")})`);
      }
      console.log(`Halftime: ${m.halftime.homeGoals}-${m.halftime.awayGoals}  |  Man of the Match: ${m.manOfTheMatch.position} (${m.manOfTheMatch.momentsWon} moments won)`);
      break;
    }
    case "kick": {
      if (rest[0] === "topup") {
        const w = walletArg(rest[1], defWallet);
        const amountKick = Number(rest[2]);
        const r = await apiCall("POST", "/api/kick/topup", { wallet: w, amountKick });
        if (!r.json.ok) return fail(r, "topup");
        show("top-up intent (PENDING — $KICK credits only on confirmed on-chain TopUp)", r.json);
      } else {
        const w = walletArg(rest[0], defWallet);
        const r = await apiCall("GET", `/api/player/${w}`);
        if (!r.json.ok) return fail(r, "kick");
        show("$KICK", { wallet: w, balance: r.json.player.kick_balance, ledger: r.json.ledger });
      }
      break;
    }
    case "surplus": {
      if (rest[0] !== "unlock") { console.error("Usage: surplus unlock <wallet> <statId>"); process.exit(1); }
      const w = walletArg(rest[1], defWallet);
      const statId = rest[2];
      const r = await apiCall("POST", "/api/surplus/unlock", { wallet: w, statId });
      if (!r.json.ok) return fail(r, "surplus unlock");
      show("surplus unlocked", r.json);
      break;
    }
    case "immortal": {
      const w = walletArg(rest[0], defWallet);
      const r = await apiCall("POST", "/api/immortal/claim", { wallet: w });
      if (!r.json.ok) return fail(r, "immortal claim");
      show("immortal claim", r.json);
      break;
    }
    case "rewards": {
      const r = await apiCall("GET", "/api/rewards/weekly");
      show("weekly rewards", r.json);
      break;
    }
    default:
      console.error(`Unknown command: ${cmd} (try: help)`);
      process.exitCode = 1;
  }
}

main().catch((e) => { console.error("CLI error:", e.message); process.exit(1); });
