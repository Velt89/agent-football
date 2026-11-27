import { useEffect, useState } from "react";
import { NEXT_MATCH_ISO, KICK, artImage, CONTRACT_ADDRESS } from "../config";
import { DEMO_PLAYER, GROUP_A_TABLE, overallOf } from "../demoData";
import { PlayerCard, DemoBanner, ActionGate } from "../components/shared";
import { useWallet } from "../wallet";
import { useOnChain } from "../onchain";

function useCountdown(targetIso: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(targetIso).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

export default function Home() {
  const countdown = useCountdown(NEXT_MATCH_ISO);
  const wallet = useWallet();
  const { meta, player, loading, error } = useOnChain(wallet);
  const p = DEMO_PLAYER;
  const overall = overallOf(p.stats);
  const groupPos = GROUP_A_TABLE.findIndex((r) => r.team === p.team) + 1;
  const fatigue = p.fatigue;
  const fatigueColour = fatigue > 90 ? "#ff4d4d" : fatigue > 70 ? "#ffd23f" : "#22e6ff";
  return (
    <div>
      <DemoBanner />
      {/* Live contract strip — read from the chain, never demo data. */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="title">Live on BSC — {meta ? `${meta.name} (${meta.symbol})` : "AgentFootball (AFB)"}</div>
        <div className="meta">
          {loading
            ? "Loading live contract data…"
            : error
              ? `Live read failed: ${error}`
              : `${meta!.totalMinted} tokens minted · ${meta!.playersCount} player(s) · contract `}
          {!loading && !error && (
            <a href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
              {CONTRACT_ADDRESS}
            </a>
          )}
        </div>
      </div>
      <div className="hero">
        <img src={artImage("night-stadium.webp")} alt="Flat vector night stadium under floodlights — neon" />
        <div className="hero-text">
          <h1>Agent Football</h1>
          <div className="meta">Agent ID Football Growth — train, grow, play live. One player per Agent ID, soulbound.</div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="badge pub">Public view</span>
            <span className="badge">Season 1 starts Tue Dec 1, 2026</span>
            <span className="badge hot">Pre-season open Nov 27-30 — mint + train now</span>
          </div>
        </div>
      </div>

      <div className="grid2">
        <div>
          {player ? (
            <>
              <PlayerCard name={player.name} position={player.position} stats={player.stats} team="—" teamColour="#22e6ff" />
              <div className="meta" style={{ marginTop: 6 }}>
                Live player — token #{player.tokenId}, overall {player.overall}, {player.position}.
                Read from the contract just now.
              </div>
            </>
          ) : (
            <>
              <PlayerCard name={p.name} position={p.position} stats={p.stats} team={p.team} teamColour={p.teamColour} />
              <div className="meta" style={{ marginTop: 6 }}>
                Demo preview — {p.name}, overall {overall}, {p.position}, {p.team}. These are placeholder
                stats, not a live read. Connect your wallet to see your live player. Mint is gas-only and
                bundles your player + Day 1 item draw in one transaction.
              </div>
            </>
          )}
        </div>
        <div>
          <div className="card">
            <div className="title">Next match</div>
            <div className="meta">Round 1 · Sat Dec 5, 2026 · 19:00 WIB · {p.team} vs Team B</div>
            <div className="countdown">{countdown}</div>
          </div>
          <div className="card">
            <div className="title">League position</div>
            <div className="meta">
              {p.team} — Group A, {groupPos === 0 ? "unranked (pre-season)" : `#${groupPos} of 8`} (demo table, 3 rounds played).
              16 teams, 2 groups of 8, 7 league rounds + finals week.
            </div>
          </div>
          <div className="card">
            <div className="title">Fatigue — {fatigue}/100 (demo)</div>
            <div className="meter"><div style={{ width: `${fatigue}%`, background: fatigueColour }} /></div>
            <div className="meta">
              {fatigue > 90 ? "Over 90 — forced to rest." : fatigue > 70 ? "Over 70 — injury chance doubles. Rest or use a shake." : "Manageable. Light +10, Standard +25, Intense +45 fatigue."}
            </div>
          </div>
          <div className="card">
            <div className="title">$KICK balance — {p.kickBalance} $KICK (demo)</div>
            <div className="meta">
              Earned {p.kickEarnedThisWeek} this week (cap {KICK.maxEarnedPerWeek}/week, max hold {KICK.maxHeld}).
              Training +10, duel win +20, match win +50. Season 1: off-chain points, no price, no trading.
            </div>
          </div>
        </div>
      </div>

      <ActionGate action="mint a player, train, or play">
        <div className="meta" style={{ marginTop: 6 }}>
          Mint: choose your player name (never changes, unique, first-come) + position.
          1 player per Agent ID. Pre-season (Nov 27-30) is the bug-test window and
          the early advantage is intentional — 4 days × 3 trainings ≈ +24 stats.
        </div>
        <button disabled>Mint player (disabled — demo mode)</button>{" "}
        <button className="ghost" disabled>Daily free draw (disabled — demo mode)</button>
      </ActionGate>

      <h2>How a season works</h2>
      <div className="grid2">
        <div className="card"><div className="title">Daily</div><div className="meta">3 free trainings, 1 free item draw, live 1v1 duels, earn $KICK.</div></div>
        <div className="card"><div className="title">Saturday</div><div className="meta">Live 10-min 11v11 league match — 12-15 live key moments, your turn on the ball.</div></div>
        <div className="card"><div className="title">Sunday</div><div className="meta">Weekly rewards in an Envelope (BNB + $KICK): Team of the Week 40%, Top Scorer 20%, Best GK 15%, Man of the Week 15%, Hardest Trainer 10%.</div></div>
        <div className="card"><div className="title">Season</div><div className="meta">2 months, 8 Saturdays, 16 teams, 240 players. Finals Day Jan 23, 2027.</div></div>
      </div>
    </div>
  );
}
