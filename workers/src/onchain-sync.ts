// Agent Football — lazy on-chain player sync (Worker entry point only).
//
// Problem it fixes: GET /api/player/:wallet returned PLAYER_NOT_FOUND for a
// wallet that had minted on-chain, because nothing ever copied the mint into
// D1. The fix is lazy: when the store has no row for a wallet, the Worker
// reads the live contract (playerOf + playerStats + surplusPointsOf +
// unlockedStatsOf) over BSC RPC and inserts the row, then serves it.
//
// Design rules (do not weaken them):
// - Miss-only. An existing D1 row is NEVER overwritten from the chain here:
//   off-chain training gains live in D1 (S1 training is off-chain), so a
//   refresh would clobber them. On-chain-only changes (coachSession,
//   position change, surplus unlocks) are picked up for wallets that have
//   no D1 row yet, or by a future explicit re-sync endpoint.
// - Never throws. Any RPC failure, revert, or decode problem returns null,
//   and the caller falls back to its previous behaviour (404 in prod).
//   An RPC outage must not turn a player lookup into a 500.
// - No dependencies. Raw eth_call + manual ABI decoding, so this file works
//   in the Worker, in Node, and in the esbuild bundle alike.
// - playerOf reverts for wallets with no player, so hasPlayer is checked
//   first; tokenId 0 is a real player (Velt), never treat it as "none".

import { CONTRACT_ADDRESS, POSITION_STATS } from "./config.js";
import type { Position } from "./config.js";
import type { Player } from "./core.js";

const RPCS = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.bnbchain.org",
];
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const RPC_TIMEOUT_MS = 8000;

// Selectors = first 4 bytes of keccak256(signature); verified with ethers:
//   ethers.id("hasPlayer(address)").slice(0, 10) === "0x0cc88021", etc.
const SEL_HAS_PLAYER = "0x0cc88021"; // hasPlayer(address) -> bool
const SEL_PLAYER_OF = "0xef75e3d1"; // playerOf(address) -> uint256
const SEL_PLAYER_STATS = "0xb776fc73"; // playerStats(uint256) -> (uint8[5],uint8,string,uint256,uint256)
const SEL_SURPLUS = "0xc23a2aec"; // surplusPointsOf(address) -> uint256
const SEL_UNLOCKED = "0x38c8c315"; // unlockedStatsOf(address) -> (uint8[],uint8[])

const POSITION_BY_INDEX: Position[] = ["GK", "DF", "MF", "FW"];

// New-stat id -> name, mirroring the contract's newStatName() table
// (specialists 10-12 GK, 20-22 DF, 30-32 MF, 40-42 FW; universals 50-54).
const NEW_STAT_NAMES: Record<number, string> = {
  10: "Penalty Saving", 11: "Command of Area", 12: "Sweeper Keeper",
  20: "Anticipation", 21: "Ball Playing", 22: "Leadership",
  30: "Set Pieces", 31: "Creativity / Flair", 32: "Work Rate",
  40: "Weak Foot", 41: "Composure / Clutch", 42: "Skill Moves",
  50: "Leadership", 51: "Clutch", 52: "Durability",
  53: "Consistency", 54: "Versatility",
};

function encAddress(wallet: string): string {
  return wallet.toLowerCase().replace("0x", "").padStart(64, "0");
}
function encUint(n: number | bigint): string {
  return BigInt(n).toString(16).padStart(64, "0");
}

async function ethCall(data: string): Promise<string | null> {
  const body = JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_call",
    params: [{ to: CONTRACT_ADDRESS, data }, "latest"],
  });
  for (const url of RPCS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), RPC_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", "user-agent": UA },
          body, signal: ctrl.signal,
        });
        if (!res.ok) continue;
        const json = (await res.json()) as { result?: string; error?: { message?: string } };
        if (json.error || typeof json.result !== "string" || json.result === "0x") return null;
        return json.result;
      } finally {
        clearTimeout(timer);
      }
    } catch {
      continue; // next RPC
    }
  }
  return null;
}

function word(hex: string, i: number): bigint {
  return BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
}
function decodeString(hex: string, offsetWord: number): string {
  // offsetWord is a byte offset (from the start of the return data) to the
  // string's length word, followed by the UTF-8 bytes.
  const byteOff = Number(word(hex, offsetWord));
  const len = Number(BigInt("0x" + hex.slice(2 + byteOff * 2, 2 + byteOff * 2 + 64)));
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(2 + (byteOff + 32 + i) * 2, 2 + (byteOff + 32 + i) * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

/** Read a minted player from the live contract. Returns null when the wallet has no player or the chain cannot be read. */
export async function syncPlayerFromChain(wallet: string): Promise<Player | null> {
  try {
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return null;
    const w = wallet.toLowerCase();

    const hasRaw = await ethCall(SEL_HAS_PLAYER + encAddress(w));
    if (hasRaw === null || word(hasRaw, 0) === 0n) return null;

    const tokenRaw = await ethCall(SEL_PLAYER_OF + encAddress(w));
    if (tokenRaw === null) return null;
    const tokenId = Number(word(tokenRaw, 0));

    const statsRaw = await ethCall(SEL_PLAYER_STATS + encUint(tokenId));
    if (statsRaw === null) return null;
    // Layout: words 0-4 stats, word 5 position, word 6 string offset,
    // word 7 total, word 8 overall, then the name string.
    const stats = [0, 1, 2, 3, 4].map((i) => Number(word(statsRaw, i)));
    const positionIndex = Number(word(statsRaw, 5));
    const position = POSITION_BY_INDEX[positionIndex];
    if (!position) return null;
    const name = decodeString(statsRaw, 6);
    if (!name) return null;

    const surplusRaw = await ethCall(SEL_SURPLUS + encAddress(w));
    const surplus = surplusRaw === null ? 0 : Number(word(surplusRaw, 0));

    const unlocked: Record<string, number> = {};
    const unlockedRaw = await ethCall(SEL_UNLOCKED + encAddress(w));
    if (unlockedRaw !== null) {
      // Layout: word 0 = offset of ids array, word 1 = offset of values
      // array; each array is length word + one 32-byte word per element.
      const idsOff = Number(word(unlockedRaw, 0));
      const valsOff = Number(word(unlockedRaw, 1));
      const idsLen = Number(BigInt("0x" + unlockedRaw.slice(2 + idsOff * 2, 2 + idsOff * 2 + 64)));
      const valsLen = Number(BigInt("0x" + unlockedRaw.slice(2 + valsOff * 2, 2 + valsOff * 2 + 64)));
      const n = Math.min(idsLen, valsLen);
      for (let i = 0; i < n; i++) {
        const id = Number(BigInt("0x" + unlockedRaw.slice(2 + (idsOff + 32 + i * 32) * 2, 2 + (idsOff + 32 + i * 32) * 2 + 64)));
        const value = Number(BigInt("0x" + unlockedRaw.slice(2 + (valsOff + 32 + i * 32) * 2, 2 + (valsOff + 32 + i * 32) * 2 + 64)));
        const statName = NEW_STAT_NAMES[id];
        if (statName) unlocked[statName] = value;
      }
    }

    const statNames = POSITION_STATS[position];
    const baseStats: Record<string, number> = {};
    statNames.forEach((s, i) => { baseStats[s] = stats[i] ?? 40; });

    return {
      wallet: w, agent_id: null, player_token_id: tokenId,
      name, position, base_stats: baseStats, unlocked_stats: unlocked,
      surplus_points: surplus, fatigue: 0, injury_until: null, injury_type: null,
      team_id: null, created_at: new Date().toISOString(),
      buffs: { kneeBraceRemaining: 0, ankleTapeDate: null, vitaminNext: false, muscleRubDate: null, tackleBonusDate: null },
      badges: [], legend_nft: null, immortal_claimed: false,
      extra_light_remaining: 0, extra_light_date: null, sleep_mask_night: false,
      last_seen_date: null, kick_balance: 0, weekly_earned: {},
    };
  } catch (e) {
    console.warn("onchain sync failed for", wallet, String((e as Error)?.message ?? e));
    return null;
  }
}
