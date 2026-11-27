/**
 * Cloudflare Pages Function: GET /metadata/<tokenId>
 * Dynamic NFT metadata for Agent Football (Fateborn Mutant pattern, NOT IPFS).
 *
 * Reads tokenKind / tokenItem / playerStats from the LIVE contract via a
 * public BSC RPC and returns OpenSea/Element-compatible JSON. The image and
 * attributes update on every mutation because they are computed from live
 * chain state — a frozen IPFS file could never do this (a training player
 * must change).
 *
 * Selectors are precomputed because Cloudflare Workers have no keccak256
 * in WebCrypto (verified against contracts/AgentFootball.sol):
 *   tokenKind(uint256)        -> 0x6496f269
 *   tokenItem(uint256)        -> 0x27780974
 *   playerStats(uint256)      -> 0xb776fc73  (uint8[5], uint8, string, uint256, uint256)
 *   ownerOf(uint256)          -> 0x6352211e
 *   unlockedStatsOf(address)  -> 0x38c8c315  (uint8[], uint8[])
 *   dailyItemName(uint8)      -> 0xe729e71a
 *   supermarketItemName(uint8) -> 0xff4e2569
 *   legendName(uint8)         -> 0xe527f6f3
 *   newStatName(uint8)        -> 0x02b52654
 *
 * Env var: AGENT_FOOTBALL_ADDRESS (overrides the live address below).
 * No API key needed: public BSC RPCs.
 *
 * ---------------------------------------------------------------------------
 * KNOWN LIMIT — READ BEFORE DEPLOYING THIS ENDPOINT AS tokenURI:
 * setBaseURI() on the contract reverts once ANY token exists
 * (require(_tokens.length == 0, "base URI frozen after first mint")).
 * Tokens 0 and 1 were already minted on 2026-11-27, so the on-chain
 * baseURI is permanently "" and tokenURI() returns "" for every token.
 * This endpoint CANNOT be wired as the contract's tokenURI without a
 * new contract deployment. It is still the correct metadata source for
 * the site itself and for marketplaces that accept a manually-set
 * metadata URL (e.g. Element's manual branding form). Do not claim
 * setBaseURI will fix it — it will revert.
 * ---------------------------------------------------------------------------
 */

const CONTRACT_ADDRESS = "0xD033236A4450DE1703CF63888355c2a29B4D62D8";
const RPC_URLS = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.bnbchain.org",
];
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 8000;

const SEL = {
  tokenKind: "0x6496f269",
  tokenItem: "0x27780974",
  playerStats: "0xb776fc73",
  ownerOf: "0x6352211e",
  unlockedStatsOf: "0x38c8c315",
  dailyItemName: "0xe729e71a",
  supermarketItemName: "0xff4e2569",
  legendName: "0xe527f6f3",
  newStatName: "0x02b52654",
};

const POSITION_NAMES = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
const STAT_NAMES = {
  0: ["Reflexes", "Diving", "Handling", "Distribution", "Positioning"],
  1: ["Tackling", "Marking", "Heading", "Strength", "Pace"],
  2: ["Passing", "Vision", "Dribbling", "Stamina", "Long Shots"],
  3: ["Finishing", "Pace", "Dribbling", "Heading", "Off the Ball"],
};
const DAILY_ITEMS = ["Protein Shake", "Vitamin", "Electrolyte Drink", "Banana", "Ice Bath"];
const SUPERMARKET_ITEMS = {
  10: "Recovery Shake Pro", 11: "Energy Gel", 12: "Sleep Mask Pro",
  13: "Knee Brace", 14: "Ankle Tape", 15: "Muscle Rub",
  16: "Physio Session", 17: "Medical Kit", 18: "Cryotherapy",
};
const LEGEND_NAMES = {
  30: "Golden Boot Legend", 31: "Golden Glove Legend",
  32: "Golden Shield Legend", 33: "Golden Playmaker Legend",
};
const NEW_STAT_NAMES = {
  10: "Penalty Saving", 11: "Command of Area", 12: "Sweeper Keeper",
  20: "Anticipation", 21: "Ball Playing", 22: "Leadership",
  30: "Set Pieces", 31: "Creativity / Flair", 32: "Work Rate",
  40: "Weak Foot", 41: "Composure / Clutch", 42: "Skill Moves",
  50: "Leadership", 51: "Clutch", 52: "Durability",
  53: "Consistency", 54: "Versatility",
};

function word(hex, i) {
  return BigInt("0x" + hex.slice(2 + i * 64, 2 + (i + 1) * 64));
}

function decodeString(hex) {
  // ABI string return: word0 = offset, then length + UTF-8 bytes.
  if (!hex || hex === "0x") return "";
  const offset = Number(word(hex, 0)) * 2 + 2;
  const len = Number(BigInt("0x" + hex.slice(offset, offset + 64)));
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(hex.slice(offset + 64 + i * 2, offset + 66 + i * 2), 16);
  }
  return new TextDecoder().decode(bytes);
}

function decodeUint8Array(hex) {
  // ABI (uint8[], uint8[]) return: word0/word1 = offsets to each array.
  // Each array: length word, then one word per element.
  const out = [];
  for (let a = 0; a < 2; a++) {
    const offset = Number(word(hex, a)) * 2 + 2;
    const len = Number(BigInt("0x" + hex.slice(offset, offset + 64)));
    const arr = [];
    for (let i = 0; i < len; i++) {
      arr.push(Number(BigInt("0x" + hex.slice(offset + 64 + i * 64, offset + 128 + i * 64))));
    }
    out.push(arr);
  }
  return out;
}

function padUint256(n) {
  return BigInt(n).toString(16).padStart(64, "0");
}
function padAddress(addr) {
  return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

async function ethCall(address, data) {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: address, data }, "latest"] });
  let lastErr = null;
  for (const url of RPC_URLS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": UA },
        body,
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message || "rpc error");
      if (!json.result || json.result === "0x") throw new Error("empty result (no code / reverted call)");
      return json.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("all RPCs failed");
}

async function callString(address, selector, argHex) {
  try {
    return decodeString(await ethCall(address, selector + argHex));
  } catch {
    return "";
  }
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-cache" },
  });
}

export async function onRequestGet(context) {
  const id = context.params.id;
  const address = context.env.AGENT_FOOTBALL_ADDRESS || CONTRACT_ADDRESS;
  const tokenId = Number(id);
  if (!Number.isInteger(tokenId) || tokenId < 0 || !address) {
    return jsonResponse({ error: "not found" }, 404);
  }
  const origin = new URL(context.request.url).origin;
  const idHex = padUint256(tokenId);

  let kindHex;
  try {
    kindHex = await ethCall(address, SEL.tokenKind + idHex);
  } catch {
    return jsonResponse({ error: "token not found" }, 404);
  }
  const kind = Number(word(kindHex, 0));
  const item = Number(word(await ethCall(address, SEL.tokenItem + idHex), 0));

  const stadiumImg = `${origin}/art/night-stadium.webp`;
  const itemsImg = `${origin}/art/items.webp`;

  // --- Kind 0: Player — live stats, position, name, total, overall ---
  if (kind === 0) {
    const hex = await ethCall(address, SEL.playerStats + idHex);
    const stats = [0, 1, 2, 3, 4].map((i) => Number(word(hex, i)));
    const position = Number(word(hex, 5));
    const nameOffset = Number(word(hex, 6)) * 2 + 2;
    const nameLen = Number(BigInt("0x" + hex.slice(nameOffset, nameOffset + 64)));
    const nameBytes = new Uint8Array(nameLen);
    for (let i = 0; i < nameLen; i++) {
      nameBytes[i] = parseInt(hex.slice(nameOffset + 64 + i * 2, nameOffset + 66 + i * 2), 16);
    }
    const playerName = new TextDecoder().decode(nameBytes);
    const total = Number(word(hex, 7));
    const overall = Number(word(hex, 8));
    const positionName = POSITION_NAMES[position] || "Unknown";
    const statNames = STAT_NAMES[position] || ["Stat 1", "Stat 2", "Stat 3", "Stat 4", "Stat 5"];

    // Unlocked extra stats (surplus unlocks), if any.
    const attributes = [
      { trait_type: "Kind", value: "Player" },
      { trait_type: "Position", value: positionName },
      ...statNames.map((n, i) => ({ trait_type: n, value: stats[i] })),
      { trait_type: "Total", value: total },
      { trait_type: "Overall", value: overall },
      { trait_type: "Soulbound", value: "Yes" },
      { trait_type: "Season", value: 1 },
    ];
    try {
      const ownerHex = await ethCall(address, SEL.ownerOf + idHex);
      const owner = "0x" + ownerHex.slice(26);
      const [ids, values] = decodeUint8Array(await ethCall(address, SEL.unlockedStatsOf + padAddress(owner)));
      for (let i = 0; i < ids.length; i++) {
        const extraName = (await callString(address, SEL.newStatName, padUint256(ids[i]))) || NEW_STAT_NAMES[ids[i]] || `Extra Stat ${ids[i]}`;
        attributes.push({ trait_type: extraName, value: values[i] });
      }
    } catch {
      // Extra stats are best-effort; base stats above are the source of truth.
    }

    return jsonResponse({
      name: `${playerName} — ${positionName} #${tokenId}`,
      description: `Agent Football player "${playerName}", a ${positionName} (overall ${overall}, total ${total}/495). One player per Agent ID, soulbound. Train, grow, play live — Season 1.`,
      image: stadiumImg,
      external_url: `${origin}/#/player`,
      attributes,
    });
  }

  // --- Kind 1: Item (daily draw or supermarket) ---
  if (kind === 1) {
    let itemName = "";
    if (item < 5) itemName = (await callString(address, SEL.dailyItemName, padUint256(item))) || DAILY_ITEMS[item];
    else if (item >= 10 && item <= 18) itemName = (await callString(address, SEL.supermarketItemName, padUint256(item))) || SUPERMARKET_ITEMS[item];
    else itemName = `Item ${item}`;
    const source = item < 5 ? "Daily free draw" : item >= 10 && item <= 18 ? "Supermarket" : "Unknown";
    return jsonResponse({
      name: `Agent Football — ${itemName}`,
      description: `A ${itemName} item (${source}). Items are NFTs, tradeable before use, burned after use.`,
      image: itemsImg,
      external_url: `${origin}/#/market`,
      attributes: [
        { trait_type: "Kind", value: "Item" },
        { trait_type: "Item", value: itemName },
        { trait_type: "Item ID", value: item },
        { trait_type: "Source", value: source },
        { trait_type: "Burned after use", value: "Yes" },
      ],
    });
  }

  // --- Kind 2: Immortal XI Badge (soulbound) ---
  if (kind === 2) {
    return jsonResponse({
      name: "Agent Football — Immortal XI Badge",
      description: "Immortal XI badge — awarded only when all 5 base stats reach 99 (total 495). Soulbound, cannot be sold or transferred.",
      image: stadiumImg,
      external_url: `${origin}/#/player`,
      attributes: [
        { trait_type: "Kind", value: "Immortal XI Badge" },
        { trait_type: "Soulbound", value: "Yes" },
        { trait_type: "Requirement", value: "All 5 stats at 99" },
      ],
    });
  }

  // --- Kind 3: Legend NFT (tradeable, by position) ---
  if (kind === 3) {
    const legendName = (await callString(address, SEL.legendName, padUint256(item))) || LEGEND_NAMES[item] || `Legend ${item}`;
    return jsonResponse({
      name: `Agent Football — ${legendName}`,
      description: `${legendName} — the all-99 Legend NFT, tradeable. Awarded with the soulbound Immortal XI badge when all 5 base stats reach 99.`,
      image: stadiumImg,
      external_url: `${origin}/#/player`,
      attributes: [
        { trait_type: "Kind", value: "Legend NFT" },
        { trait_type: "Legend", value: legendName },
        { trait_type: "Soulbound", value: "No" },
      ],
    });
  }

  return jsonResponse({ error: "unknown token kind" }, 404);
}
