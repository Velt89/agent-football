// OFF-CHAIN ONLY. Builds the BAW contract-call inputData for the
// deterministic CREATE2 proxy 0x4e59b44847b379578588920cA78FbF26c0B4956C.
// Proxy expects raw calldata = 32-byte salt + initCode (no selector).
// initCode = creation bytecode + abi-encoded constructor args
// (registry, creator W). No signing, no broadcast.
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");

const REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const CREATOR_W = "0x0518AE367CA3612872Aa2f0897BF3B5FaFCE893A";
const CREATE2_PROXY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";
const SALT_LABEL = "velt.agentfootball.v1";

async function main() {
  const artifact = await hre.artifacts.readArtifact("AgentFootball");
  const initCode = ethers.concat([
    artifact.bytecode,
    ethers.AbiCoder.defaultAbiCoder().encode(["address", "address"], [REGISTRY, CREATOR_W]),
  ]);
  const salt = ethers.keccak256(ethers.toUtf8Bytes(SALT_LABEL));
  const predicted = ethers.getCreate2Address(CREATE2_PROXY, salt, ethers.keccak256(initCode));
  const inputData = ethers.concat([salt, initCode]);
  const out = {
    proxy: CREATE2_PROXY,
    salt,
    saltLabel: SALT_LABEL,
    predictedAddress: predicted,
    initCodeBytes: (initCode.length - 2) / 2,
    inputDataBytes: (inputData.length - 2) / 2,
    inputData,
  };
  fs.writeFileSync(path.join(__dirname, "..", "deploy-package", "inputData.json"), JSON.stringify(out, null, 2) + "\n");
  console.log(JSON.stringify({ predictedAddress: predicted, inputDataBytes: out.inputDataBytes, salt }, null, 2));
  console.log("inputData written to deploy-package/inputData.json");
}
main().catch((e) => { console.error(e); process.exit(1); });
