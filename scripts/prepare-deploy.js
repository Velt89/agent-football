/**
 * prepare-deploy.js — OFF-CHAIN ONLY. Nothing is broadcast, signed,
 * or deployed. No private key is read or used.
 *
 * Run: npx hardhat run scripts/prepare-deploy.js
 *
 * - Reads the compiled AgentFootball artifact (bytecode + ABI) and
 *   computes the CREATE2 predicted address for the deterministic proxy
 *   route (salt keccak256("velt.agentfootball.v1"), constructor args =
 *   the real Agent ID registry + creator wallet W).
 * - Prints the locked config values (fees, caps, splits, item tables)
 *   so they can be eyeballed against DESIGN.md before any deploy.
 * - Exports deploy-package/AgentFootball.abi.json and
 *   deploy-package/prediction.json.
 *
 * The prediction is informational only — deployment needs a separate
 * user go-ahead, and the frontend config keeps the zero address until
 * a deployment is verified on-chain.
 */
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const CREATOR_W = "0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A";
const CREATE2_PROXY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const SALT_LABEL = "velt.agentfootball.v1";

async function main() {
  const artifact = await hre.artifacts.readArtifact("AgentFootball");
  const runtimeBytes = (artifact.deployedBytecode.length - 2) / 2;
  const creationBytes = (artifact.bytecode.length - 2) / 2;

  // --- CREATE2 prediction (pure off-chain math; no deployment) ---
  const initCode = ethers.concat([
    artifact.bytecode,
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address"],
      [REGISTRY, CREATOR_W]
    ),
  ]);
  const salt = ethers.keccak256(ethers.toUtf8Bytes(SALT_LABEL));
  const predicted = ethers.getCreate2Address(CREATE2_PROXY, salt, ethers.keccak256(initCode));

  const config = {
    contract: "AgentFootball",
    symbol: "AFB",
    seasonId: 1,
    creatorW: CREATOR_W,
    agentIdRegistry: REGISTRY,
    fees: {
      mintPlayer: "gas only (non-payable)",
      dailyDraw: "gas only (non-payable)",
      coachSession: "0.001 BNB exactly, +4 to one stat, max 1/day",
      positionChange: "0.001 BNB exactly, max 1/season, total preserved",
      topUpKick: "100 KICK per 0.001 BNB, 100-500/call, max 500/day",
    },
    feeSplit: "90% rewardPool / 8% buybackTreasury / 2% creator (immediate)",
    royalty: "ERC-2981 5% to the contract (reward pool)",
    unlockCost: "20 surplus points per new stat, starts at 40, cap 99",
    immortalReward: "all 5 base stats == 99 -> soulbound Immortal XI Badge + position Legend NFT (FW 30 / GK 31 / DF 32 / MF 33)",
    dailyItems: ["Protein Shake", "Vitamin", "Electrolyte Drink", "Banana", "Ice Bath"],
    supermarketItems: {
      note: "S1 OFF-CHAIN inventory only — no on-chain mint function exists for these ids",
      10: "Recovery Shake Pro", 11: "Energy Gel", 12: "Sleep Mask Pro",
      13: "Knee Brace", 14: "Ankle Tape", 15: "Muscle Rub",
      16: "Physio Session", 17: "Medical Kit", 18: "Cryotherapy",
    },
    kick: "S1 $KICK is off-chain points (Workers ledger). No $KICK ERC-20 in this contract.",
  };

  const out = {
    contract: "AgentFootball",
    compiler: "solc 0.8.24, optimizer 200 runs, evm paris, viaIR true",
    runtimeBytes,
    creationBytes,
    config,
    create2: {
      proxy: CREATE2_PROXY,
      saltLabel: SALT_LABEL,
      salt,
      constructorArgs: { registry: REGISTRY, creator: CREATOR_W },
      predictedAddress: predicted,
      note: "PREDICTION ONLY — nothing deployed, nothing signed. Frontend config stays zero-address until a real deployment is verified on-chain.",
    },
  };

  const pkgDir = path.join(__dirname, "..", "deploy-package");
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "AgentFootball.abi.json"),
    JSON.stringify(artifact.abi, null, 2) + "\n"
  );
  fs.writeFileSync(path.join(pkgDir, "prediction.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
