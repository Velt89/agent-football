import { useState } from "react";
import {
  POSITIONS, SPECIALIST_UNLOCKS, UNIVERSAL_UNLOCKS, SURPLUS_UNLOCK_COST,
  NEW_STAT_START, IMMORTAL_BADGE, IMMORTAL_NFT, ALL_99_TOTAL, POSITION_CHANGE,
} from "../config";
import { DEMO_PLAYER, overallOf } from "../demoData";
import { PlayerCard, RadarChart, DemoBanner, ActionGate } from "../components/shared";
import { useWallet } from "../wallet";
import { useOnChain, type LivePlayer } from "../onchain";

// Live player view — stats, surplus and unlocked extra stats are read
// from the contract (viem readContract). Training history / inventory /
// record have no live source yet (Workers API not deployed) and are shown
// as "not live yet", never as invented numbers.
function LivePlayerView(props: { player: LivePlayer }) {
  const p = props.player;
  const total = p.total;
  const statsAt99 = p.stats.filter((s) => s.value >= 99).length;
  const specialist = SPECIALIST_UNLOCKS[p.position as keyof typeof POSITIONS];
  const unlockedNames = new Set(p.unlocked.map((u) => u.name));
  return (
    <div>
      <div className="meta">
        Live player — token #{p.tokenId} · {p.name} · {p.position} · read from the contract just now.
        Name never changes. Position can change once per season for {POSITION_CHANGE.priceBnb} BNB (total stats preserved, allocation re-randomised).
      </div>
      <div className="grid2">
        <div>
          <PlayerCard name={p.name} position={p.position} stats={p.stats} team="—" teamColour="#22e6ff" />
          <div className="card">
            <div className="title">Record</div>
            <div className="meta">Match record, goals, saves and duels live in the Workers API — not deployed yet, so no record is shown here. Nothing below is invented.</div>
            <div className="kv"><span>Token ID</span><b>#{p.tokenId}</b></div>
            <div className="kv"><span>Position changes used</span><b>— (on-chain, see contract)</b></div>
          </div>
        </div>
        <div>
          <div className="card">
            <div className="title">Radar — 5 stats (overall {p.overall}, total {total})</div>
            <RadarChart stats={p.stats} />
          </div>
          <div className="card">
            <div className="title">Surplus Pool — {p.surplus} points</div>
            <div className="meta">
              When a stat hits 99, further training on it becomes surplus (1 per +1).
              Spend {SURPLUS_UNLOCK_COST} surplus to unlock a new stat, starting at {NEW_STAT_START},
              then train it up like a normal one (cap 99). Unlocks are on-chain writes and are
              not wired in this build yet — no transaction can be sent from this page.
            </div>
            {p.unlocked.length > 0 && (
              <>
                <h3>Unlocked extra stats (live)</h3>
                {p.unlocked.map((u) => (
                  <div className="kv" key={u.id}><span>{u.name}</span><b>{u.value}</b></div>
                ))}
              </>
            )}
            <h3>Specialist unlocks — {p.position}</h3>
            {specialist.map((name) => (
              <div className="row" key={name} style={{ justifyContent: "space-between" }}>
                <span>{name}{unlockedNames.has(name) ? ` — unlocked (${p.unlocked.find((u) => u.name === name)?.value})` : ""}</span>
                <button disabled>{unlockedNames.has(name) ? "Unlocked" : `Unlock — ${SURPLUS_UNLOCK_COST} surplus`}</button>
              </div>
            ))}
            <h3>Universal unlocks — any position</h3>
            {UNIVERSAL_UNLOCKS.map((name) => (
              <div className="row" key={name} style={{ justifyContent: "space-between" }}>
                <span>{name}{unlockedNames.has(name) ? ` — unlocked (${p.unlocked.find((u) => u.name === name)?.value})` : ""}</span>
                <button disabled>{unlockedNames.has(name) ? "Unlocked" : `Unlock — ${SURPLUS_UNLOCK_COST} surplus`}</button>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="title">Immortal XI progress — {statsAt99}/5 stats at 99</div>
            <div className="meter"><div style={{ width: `${(statsAt99 / 5) * 100}%`, background: "#ffd23f" }} /></div>
            <div className="meta">
              Trigger: ONLY when ALL 5 base stats reach 99 (total {ALL_99_TOTAL}, overall 99).
              A single 99 gives surplus, not the reward. Reward: soulbound <b>{IMMORTAL_BADGE}</b> badge
              + tradeable NFT <b>{IMMORTAL_NFT[p.position as keyof typeof POSITIONS]}</b>.
            </div>
            <ActionGate action="claim the Immortal XI reward">
              <button disabled>Claim Immortal XI reward (disabled — writes not wired yet)</button>
            </ActionGate>
          </div>
        </div>
      </div>

      <h2>Inventory</h2>
      <div className="card">
        <div className="meta">Your item NFTs live on-chain (tokenKind / tokenItem). The item list for your wallet is not wired in this build yet — nothing is shown here rather than invented inventory.</div>
      </div>
      <ActionGate action="change position or use items">
        <button disabled>Change position — {POSITION_CHANGE.priceBnb} BNB (disabled — writes not wired yet)</button>
      </ActionGate>
    </div>
  );
}

// Demo preview — shown ONLY when no wallet is connected. Every number is
// invented placeholder data from demoData.ts and is labelled as such.
function DemoPlayerView() {
  const p = DEMO_PLAYER;
  const overall = overallOf(p.stats);
  const total = p.stats.reduce((s, x) => s + x.value, 0);
  const statsAt99 = p.stats.filter((s) => s.value >= 99).length;
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [surplus, setSurplus] = useState(p.surplusPool);
  const canUnlock = surplus >= SURPLUS_UNLOCK_COST;
  const unlock = (name: string) => {
    if (!canUnlock || unlocked.includes(name)) return;
    setSurplus((s) => s - SURPLUS_UNLOCK_COST);
    setUnlocked((u) => [...u, name]);
  };
  const specialist = SPECIALIST_UNLOCKS[p.position as keyof typeof POSITIONS];
  return (
    <div>
      <div className="meta">
        Demo preview — connect your wallet to load your live player. This card is placeholder data, not a live read.
        Name never changes. Position can change once per season for {POSITION_CHANGE.priceBnb} BNB (total stats preserved, allocation re-randomised).
      </div>
      <div className="grid2">
        <div>
          <PlayerCard name={p.name} position={p.position} stats={p.stats} team={p.team} teamColour={p.teamColour} />
          <div className="card">
            <div className="title">Injury status (demo)</div>
            <div className="meta">✅ Fit — no injury. Minor Strain = out 1 day, Sprain = 3 days, Serious = 7 days.</div>
            <div className="title" style={{ marginTop: 12 }}>Record (demo)</div>
            <div className="kv"><span>Goals</span><b>{p.goals}</b></div>
            <div className="kv"><span>Saves</span><b>{p.saves}</b></div>
            <div className="kv"><span>Duels</span><b>{p.duelsWon}W – {p.duelsLost}L</b></div>
            <div className="kv"><span>Live moments won</span><b>{p.liveMomentsWon}</b></div>
            <div className="kv"><span>Season streak</span><b>{p.streak} days</b></div>
            <div className="kv"><span>Trainings this week</span><b>{p.trainingsThisWeek}</b></div>
          </div>
        </div>
        <div>
          <div className="card">
            <div className="title">Radar — 5 stats (overall {overall}, total {total}) (demo)</div>
            <RadarChart stats={p.stats} />
          </div>
          <div className="card">
            <div className="title">Surplus Pool — {surplus} points (demo)</div>
            <div className="meta">
              When a stat hits 99, further training on it becomes surplus (1 per +1).
              Spend {SURPLUS_UNLOCK_COST} surplus to unlock a new stat, starting at {NEW_STAT_START},
              then train it up like a normal one (cap 99).
            </div>
            <h3>Specialist unlocks — {p.position}</h3>
            {specialist.map((name) => (
              <div className="row" key={name} style={{ justifyContent: "space-between" }}>
                <span>{name}{unlocked.includes(name) ? " — unlocked (40)" : ""}</span>
                <button disabled={!canUnlock || unlocked.includes(name)} onClick={() => unlock(name)}>
                  {unlocked.includes(name) ? "Unlocked" : `Unlock — ${SURPLUS_UNLOCK_COST} surplus`}
                </button>
              </div>
            ))}
            <h3>Universal unlocks — any position</h3>
            {UNIVERSAL_UNLOCKS.map((name) => (
              <div className="row" key={name} style={{ justifyContent: "space-between" }}>
                <span>{name}{unlocked.includes(name) ? " — unlocked (40)" : ""}</span>
                <button disabled={!canUnlock || unlocked.includes(name)} onClick={() => unlock(name)}>
                  {unlocked.includes(name) ? "Unlocked" : `Unlock — ${SURPLUS_UNLOCK_COST} surplus`}
                </button>
              </div>
            ))}
            {!canUnlock && <div className="meta" style={{ marginTop: 6 }}>Demo: {surplus} surplus — need {SURPLUS_UNLOCK_COST} to unlock. Train a 99 stat to earn more.</div>}
          </div>
          <div className="card">
            <div className="title">Immortal XI progress — {statsAt99}/5 stats at 99 (demo)</div>
            <div className="meter"><div style={{ width: `${(statsAt99 / 5) * 100}%`, background: "#ffd23f" }} /></div>
            <div className="meta">
              Trigger: ONLY when ALL 5 base stats reach 99 (total {ALL_99_TOTAL}, overall 99).
              A single 99 gives surplus, not the reward. Reward: soulbound <b>{IMMORTAL_BADGE}</b> badge
              + tradeable NFT <b>{IMMORTAL_NFT[p.position as keyof typeof POSITIONS]}</b>.
            </div>
            <ActionGate action="claim the Immortal XI reward">
              <button disabled>Claim Immortal XI reward (disabled — demo mode)</button>
            </ActionGate>
          </div>
        </div>
      </div>

      <h2>Training history (demo)</h2>
      <div className="card">
        <table>
          <thead><tr><th>Day</th><th>Drill</th><th>Stat</th><th className="num">Gain</th><th className="num">$KICK</th></tr></thead>
          <tbody>
            {p.trainingHistory.map((t, i) => (
              <tr key={i}><td>{t.day}</td><td>{t.drill}</td><td>{t.stat}</td><td className="num">{t.gain}</td><td className="num">{t.kick}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Inventory (demo)</h2>
      <div className="card">
        <div className="meta">Items are NFTs, tradeable before use, burned after use. Max 3 Supermarket items/day, max 1 injury-recovery item/day.</div>
        {p.inventory.map((it) => (
          <div className="kv" key={it.id}>
            <span>{it.name} ×{it.owned} <span className="badge">{it.source}</span> — {it.effect}</span>
            <span><button disabled style={{ marginTop: 0 }}>Use (demo)</button></span>
          </div>
        ))}
      </div>
      <ActionGate action="change position or use items">
        <button disabled>Change position — {POSITION_CHANGE.priceBnb} BNB (disabled — demo mode)</button>
      </ActionGate>
    </div>
  );
}

export default function MyPlayer() {
  const wallet = useWallet();
  const { meta, player, hasPlayer, loading, error } = useOnChain(wallet);
  return (
    <div>
      <DemoBanner />
      <h1>My Player</h1>
      {loading && <div className="card"><div className="meta">Loading live data from the contract…</div></div>}
      {!loading && error && (
        <div className="card warn"><div className="meta">Live read failed: {error}. Showing the demo preview instead.</div></div>
      )}
      {!loading && !error && wallet && hasPlayer === false && (
        <div className="card">
          <div className="title">No player yet</div>
          <div className="meta">
            Wallet {wallet.slice(0, 6)}…{wallet.slice(-4)} holds an Agent ID but has no player.
            Mint is gas-only and bundles your player + Day 1 item draw in one transaction.
            Minting is an on-chain write and is not wired in this build yet — use the agent CLI.
          </div>
        </div>
      )}
      {!loading && !error && wallet && player && <LivePlayerView player={player} />}
      {!loading && (!wallet || error) && <DemoPlayerView />}
      {!loading && meta && (
        <div className="meta" style={{ marginTop: 8 }}>
          Live contract: {meta.name} ({meta.symbol}) — {meta.totalMinted} tokens minted, {meta.playersCount} player(s).
        </div>
      )}
    </div>
  );
}
