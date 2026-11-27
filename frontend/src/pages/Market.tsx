import { useState } from "react";
import { SUPERMARKET_ITEMS, KICK, DAILY_DRAW_POOL, artImage, DEPLOYED } from "../config";
import { DEMO_PLAYER } from "../demoData";
import { DemoBanner, ActionGate } from "../components/shared";

const CAT_LABEL: Record<string, string> = {
  fatigue: "Fatigue — cyan / blue",
  prevention: "Prevention — green",
  recovery: "Recovery — purple / pink",
};

export default function Market() {
  const p = DEMO_PLAYER;
  const [balance, setBalance] = useState(p.kickBalance);
  const [owned, setOwned] = useState<Record<string, number>>({ "Recovery Shake Pro": 1, "Ankle Tape": 1 });
  const [usedToday, setUsedToday] = useState(0);
  const [recoveryUsed, setRecoveryUsed] = useState(0);
  const [topUp, setTopUp] = useState(100);
  const [msg, setMsg] = useState("");

  const buy = (name: string, price: number) => {
    if (balance < price) { setMsg(`Not enough $KICK for ${name} (${price} needed, ${balance} held).`); return; }
    setBalance((b) => b - price);
    setOwned((o) => ({ ...o, [name]: (o[name] ?? 0) + 1 }));
    const burn = Math.round(price * KICK.spendBurnPct / 100);
    const pool = Math.round(price * KICK.spendRewardPoolPct / 100);
    const creator = price - burn - pool;
    setMsg(`Bought ${name} for ${price} $KICK — split: ${burn} burned, ${pool} to reward pool, ${creator} to creator.`);
  };
  const useItem = (name: string, recovery?: boolean) => {
    if (usedToday >= 3) { setMsg("Daily cap: max 3 Supermarket items used per day."); return; }
    if (recovery && recoveryUsed >= 1) { setMsg("Daily cap: max 1 injury-recovery item per day."); return; }
    if ((owned[name] ?? 0) <= 0) return;
    setOwned((o) => ({ ...o, [name]: o[name] - 1 }));
    setUsedToday((u) => u + 1);
    if (recovery) setRecoveryUsed((r) => r + 1);
    setMsg(`Used ${name} — item NFT burned after use. (${usedToday + 1}/3 used today${recovery ? ", recovery item used" : ""}.)`);
  };

  return (
    <div>
      <DemoBanner />
      <h1>Supermarket</h1>
      <div className="meta">
        Targeted, stronger items — you choose what you need. All items are NFTs, tradeable
        before use, <b>burned after use</b>. No direct BNB items in v1 — BNB only buys $KICK top-up,
        plus the Coach Session (0.001 BNB).
      </div>
      <div className="art-note"><img src={artImage("items.webp")} alt="Flat vector item icons sheet — fatigue cyan, prevention green, recovery purple" /></div>
      <div className="card">
        <div className="title">Your $KICK — {balance}</div>
        <div className="meta">
          Max hold {KICK.maxHeld}, max earned {KICK.maxEarnedPerWeek}/week. Every $KICK spent splits:
          {KICK.spendBurnPct}% burned, {KICK.spendRewardPoolPct}% to reward pool, {KICK.spendCreatorPct}% to creator.
          Used today: {usedToday}/3 items ({recoveryUsed}/1 recovery).
        </div>
        {msg && <div className="meta" style={{ marginTop: 6, color: "#ffd23f" }}>{msg}</div>}
      </div>

      <h2>Items — priced in $KICK</h2>
      <div className="shop-grid">
        {SUPERMARKET_ITEMS.map((it) => (
          <div className={`shop-item ${it.category}`} key={it.name}>
            <div className="cat-tag">{CAT_LABEL[it.category]}{it.recovery ? " · injury-recovery" : ""}</div>
            <div className="title">{it.name}</div>
            <div className="meta">{it.effect}</div>
            <div className="shop-price">{it.price} $KICK</div>
            <div className="meta">Owned: {owned[it.name] ?? 0}</div>
            <div className="row">
              <button disabled={balance < it.price} onClick={() => buy(it.name, it.price)}>Buy</button>
              <button className="ghost" disabled={(owned[it.name] ?? 0) <= 0} onClick={() => useItem(it.name, it.recovery)}>Use (burns)</button>
              <button className="ghost" disabled={(owned[it.name] ?? 0) <= 0} onClick={() => { setOwned((o) => ({ ...o, [it.name]: o[it.name] - 1 })); setMsg(`${it.name} listed for sale in the in-site market (demo — no listing created).`); }}>Sell</button>
            </div>
          </div>
        ))}
      </div>
      <ActionGate action="buy or use Supermarket items">
        <div className="meta">{DEPLOYED ? "Live contract is deployed, but wallet connection is not wired in this build yet — Buy / Use / Sell above only update this page locally for now." : "Demo mode: Buy / Use / Sell above only update this page locally — nothing is sent on-chain."}</div>
      </ActionGate>

      <h2>$KICK top-up</h2>
      <div className="card">
        <div className="meta">
          {KICK.topUpKickPerBnb} $KICK = {KICK.topUpPriceBnb} BNB, max {KICK.topUpMaxPerDay} $KICK bought per day
          per player. Top-up $KICK comes from the capped {KICK.season1TopUpReserve.toLocaleString()} reserve,
          first-come — it stops when the reserve is gone. BNB split: {KICK.bnbRewardPct}% weekly reward,{" "}
          {KICK.bnbBuybackPct}% buyback treasury (accrues in BNB in S1, for Season 2), {KICK.bnbCreatorPct}% creator.
        </div>
        <label>
          Amount ($KICK, multiples of 100, max {KICK.topUpMaxPerDay}/day)
          <select value={topUp} onChange={(e) => setTopUp(Number(e.target.value))}>
            {[100, 200, 300, 400, 500].map((v) => (
              <option key={v} value={v}>{v} $KICK — {(v / 100 * 0.001).toFixed(3)} BNB</option>
            ))}
          </select>
        </label>
        <ActionGate action="top up $KICK">
          <button disabled>Top up {topUp} $KICK for {(topUp / 100 * 0.001).toFixed(3)} BNB (disabled — demo mode)</button>
        </ActionGate>
      </div>

      <h2>Daily free draw — gas only</h2>
      <div className="card">
        <div className="meta">1 free draw a day, random, all legal real-life items. Day 1 is bundled into the mint transaction; from Day 2 it is its own tx, still gas only.</div>
        {DAILY_DRAW_POOL.map((it) => (
          <div className="kv" key={it.name}><span>{it.name}</span><b>{it.effect}</b></div>
        ))}
        <ActionGate action="draw today's free item">
          <button disabled>Daily free draw (disabled — demo mode)</button>
        </ActionGate>
      </div>
    </div>
  );
}
