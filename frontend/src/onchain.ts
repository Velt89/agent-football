// Read-only on-chain reads (viem) against the LIVE AgentFootball contract.
// No signing, no broadcast — these are eth_call reads only.
// Verified against the deployed contract 0xD033236A4450DE1703CF63888355c2a29B4D62D8
// (Sourcify exact_match) and against live reads on 2026-11-27:
//   name() = "AgentFootball", symbol() = "AFB", totalMinted() = 2, playersCount() = 1
//   playerStats(0) = [44, 47, 44, 59, 47], position 2 (Midfielder),
//   name "Velt", total 241, overall 48.
import { useEffect, useState } from "react";
import { createPublicClient, fallback, http } from "viem";
import { bsc } from "viem/chains";
import { agentFootballAbi } from "./abi";
import { CONTRACT_ADDRESS, POSITIONS, type PositionName } from "./config";

export const publicClient = createPublicClient({
  chain: bsc,
  transport: fallback([
    http("https://bsc-rpc.publicnode.com"),
    http("https://bsc-dataseed.binance.org"),
    http("https://bsc-dataseed1.bnbchain.org"),
  ]),
});

export interface LiveStat {
  name: string;
  value: number;
}

export interface LivePlayer {
  tokenId: number;
  name: string;
  positionIndex: number;
  position: PositionName;
  stats: LiveStat[];
  total: number;
  overall: number;
  surplus: number;
  unlocked: { id: number; name: string; value: number }[];
}

export interface LiveContract {
  name: string;
  symbol: string;
  totalMinted: number;
  playersCount: number;
  creator: string;
}

const POSITION_ORDER: PositionName[] = ["Goalkeeper", "Defender", "Midfielder", "Forward"];

const NEW_STAT_NAMES: Record<number, string> = {
  10: "Penalty Saving", 11: "Command of Area", 12: "Sweeper Keeper",
  20: "Anticipation", 21: "Ball Playing", 22: "Leadership",
  30: "Set Pieces", 31: "Creativity / Flair", 32: "Work Rate",
  40: "Weak Foot", 41: "Composure / Clutch", 42: "Skill Moves",
  50: "Leadership", 51: "Clutch", 52: "Durability",
  53: "Consistency", 54: "Versatility",
};

export async function getContractMeta(): Promise<LiveContract> {
  const [name, symbol, totalMinted, playersCount, creator] = await Promise.all([
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: agentFootballAbi, functionName: "name" }),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: agentFootballAbi, functionName: "symbol" }),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: agentFootballAbi, functionName: "totalMinted" }),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: agentFootballAbi, functionName: "playersCount" }),
    publicClient.readContract({ address: CONTRACT_ADDRESS, abi: agentFootballAbi, functionName: "creator" }),
  ]);
  return {
    name: name as string,
    symbol: symbol as string,
    totalMinted: Number(totalMinted),
    playersCount: Number(playersCount),
    creator: creator as string,
  };
}

export async function getPlayerByTokenId(tokenId: number): Promise<LivePlayer | null> {
  const [stats, position, playerName, total, overall] = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: agentFootballAbi,
    functionName: "playerStats",
    args: [BigInt(tokenId)],
  });
  const positionIndex = Number(position);
  const positionName = POSITION_ORDER[positionIndex];
  const statNames = POSITIONS[positionName];
  return {
    tokenId,
    name: playerName as string,
    positionIndex,
    position: positionName,
    stats: (stats as readonly number[]).map((v, i) => ({ name: statNames[i], value: Number(v) })),
    total: Number(total),
    overall: Number(overall),
    surplus: 0,
    unlocked: [],
  };
}

export async function getPlayerByAddress(wallet: string): Promise<LivePlayer | null> {
  const hasPlayer = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: agentFootballAbi,
    functionName: "hasPlayer",
    args: [wallet as `0x${string}`],
  });
  if (!hasPlayer) return null;
  const tokenId = await publicClient.readContract({
    address: CONTRACT_ADDRESS,
    abi: agentFootballAbi,
    functionName: "playerOf",
    args: [wallet as `0x${string}`],
  });
  const player = await getPlayerByTokenId(Number(tokenId));
  if (!player) return null;
  const [surplus, unlocked] = await Promise.all([
    publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: agentFootballAbi,
      functionName: "surplusPointsOf",
      args: [wallet as `0x${string}`],
    }),
    publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: agentFootballAbi,
      functionName: "unlockedStatsOf",
      args: [wallet as `0x${string}`],
    }),
  ]);
  const [ids, values] = unlocked as [readonly number[], readonly number[]];
  player.surplus = Number(surplus);
  player.unlocked = ids.map((id, i) => ({
    id: Number(id),
    name: NEW_STAT_NAMES[Number(id)] || `Extra Stat ${id}`,
    value: Number(values[i]),
  }));
  return player;
}

export interface OnChainState {
  meta: LiveContract | null;
  player: LivePlayer | null;
  hasPlayer: boolean | null; // null = unknown / not connected
  loading: boolean;
  error: string | null;
}

/** Live contract + connected-wallet player reads. Returns nulls (not demo
 *  data) when no wallet is connected — callers show the demo preview. */
export function useOnChain(wallet: string | null): OnChainState {
  const [state, setState] = useState<OnChainState>({
    meta: null,
    player: null,
    hasPlayer: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meta = await getContractMeta();
        if (cancelled) return;
        if (!wallet) {
          setState({ meta, player: null, hasPlayer: null, loading: false, error: null });
          return;
        }
        const player = await getPlayerByAddress(wallet);
        if (cancelled) return;
        setState({ meta, player, hasPlayer: player !== null, loading: false, error: null });
      } catch (e) {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  return state;
}
