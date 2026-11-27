import { useState } from "react";
import { DUELS, DEMO_PLAYER } from "../demoData";
import { DEPLOYED } from "../config";
import { DemoBanner, ActionGate } from "../components/shared";
import { LiveMoment, MomentKind } from "../components/LiveMoment";

export default function Duels() {
  const p = DEMO_PLAYER;
  const [kind, setKind] = useState<MomentKind>("Shoot");
  const [shootout, setShootout] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [accepted, setAccepted] = useState<number[]>([]);
  const onResult = (r: string) => setLog((l) => [r, ...l]);
  return (
    <div>
      <DemoBanner />
      <h1>Duels / Arena</h1>
      <div className="meta">
        Daily 1v1 duels are live, ~30 seconds: Striker vs GK penalty, Defender vs Striker 1v1 dribble,
        Mid vs Mid passing battle. Same pick-a-zone + timing system, different stats. Duel win +20 $KICK.
        Your record (demo): {p.duelsWon}W – {p.duelsLost}L.
      </div>

      <h2>Open challenges</h2>
      {DUELS.open.map((d) => (
        <div className="card" key={d.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span><b>{d.challenger}</b> — {d.type} · stake {d.stake}</span>
            <button disabled={accepted.includes(d.id)} onClick={() => setAccepted((a) => [...a, d.id])}>
              {accepted.includes(d.id) ? "Accepted (demo)" : "Accept duel"}
            </button>
          </div>
        </div>
      ))}

      <h2>Named callouts</h2>
      {DUELS.callouts.map((c) => (
        <div className="card warn" key={c.id}>
          <div className="meta"><b>{c.from}</b> to <b>{c.to}</b>:</div>
          <div>"{c.text}"</div>
          <button className="ghost" onClick={() => setAccepted((a) => [...a, 100 + c.id])}>Answer the callout (demo)</button>
        </div>
      ))}

      <h2>Live penalty shootout</h2>
      <div className="card">
        <div className="meta">
          Shootout screen reusing the live-moment component — pick a corner + power timing as the shooter,
          or pick a dive zone + timing as the keeper. 10 seconds per kick.
        </div>
        <div className="row">
          <button className={kind === "Shoot" ? "chip selected" : "chip"} onClick={() => { setKind("Shoot"); setShootout(true); }}>Shoot (as Forward)</button>
          <button className={kind === "Save" ? "chip selected" : "chip"} onClick={() => { setKind("Save"); setShootout(true); }}>Save (as GK)</button>
        </div>
        {shootout && <LiveMoment kind={kind} onResult={onResult} />}
        {!shootout && <button onClick={() => setShootout(true)}>Simulate a shootout moment (demo)</button>}
        {log.map((l, i) => <div className="meta" key={i} style={{ marginTop: 4 }}>• {l}</div>)}
      </div>

      <h2>Duel history</h2>
      <div className="card">
        <table>
          <thead><tr><th>Opponent</th><th>Type</th><th>Result</th><th className="num">$KICK</th></tr></thead>
          <tbody>
            {DUELS.history.map((d) => (
              <tr key={d.id}><td>{d.opponent}</td><td>{d.type}</td><td>{d.result}</td><td className="num">{d.kick}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <ActionGate action="issue or accept a duel">
        <div className="meta">{DEPLOYED ? "Live contract is deployed, but wallet connection is not wired in this build yet — accepts and shootout results above are local only for now." : "Demo mode: accepts and shootout results above are local only — no duel is created on-chain."}</div>
      </ActionGate>
    </div>
  );
}
