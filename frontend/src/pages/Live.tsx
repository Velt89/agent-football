import { useState } from "react";
import { COMMENTARY, GROUP_A_TABLE } from "../demoData";
import { DemoBanner, ActionGate } from "../components/shared";
import { LiveMoment, MomentKind } from "../components/LiveMoment";

export default function Live() {
  const [score, setScore] = useState({ home: 1, away: 0 });
  const [feed, setFeed] = useState<string[]>([]);
  const [kind, setKind] = useState<MomentKind>("Shoot");
  const [showMoment, setShowMoment] = useState(false);
  const [momentsWon, setMomentsWon] = useState(0);
  const onResult = (r: string) => {
    setFeed((f) => [`${new Date().toLocaleTimeString()} — ${r}`, ...f]);
    if (r.startsWith("GOAL") || r.startsWith("SAVED") || r.startsWith("Won") || r.startsWith("Killer")) {
      setMomentsWon((m) => m + 1);
      if (r.startsWith("GOAL")) setScore((s) => ({ ...s, home: s.home + 1 }));
    }
  };
  return (
    <div>
      <DemoBanner />
      <h1>Live Match Center <span className="badge pub">Public view</span></h1>
      <div className="meta">
        Live 10-min Saturday match (10 min real time = 90 min game time), 12-15 live key moments.
        Most of the match auto-sims on trained stats; when the ball comes to you it stops and it is
        your turn live. Off-season / pre-season: next fixtures + last highlights below.
      </div>

      <div className="card">
        <div className="title">Team A {score.home} — {score.away} Team B · 67'</div>
        <div className="meta">Round 1 · Sat Dec 5 · 19:00 WIB · Demo live score — updates after every goal in the moment simulator.</div>
        <div className="kv"><span>Live moments won (you)</span><b>{momentsWon}</b></div>
        <div className="kv"><span>Man of the Match so far</span><b>Most live moments won, not just highest overall</b></div>
      </div>

      <div className="grid2">
        <div>
          <h2>Minute-by-minute</h2>
          {feed.map((f, i) => <div className="commentary" key={i}>{f}</div>)}
          {COMMENTARY.map((c) => (
            <div className="commentary" key={c.minute}><span className="min">{c.minute}</span>{c.text}</div>
          ))}
          <h2>Last highlights</h2>
          <div className="card placeholder">
            <div className="meta">Pre-season — no matches played yet. Last highlights will appear here after Round 1 (Sat Dec 5).</div>
          </div>
        </div>
        <div>
          <h2>Your turn — live moment</h2>
          <div className="row">
            {(["Shoot", "Save", "Tackle", "Pass"] as MomentKind[]).map((k) => (
              <button key={k} className={kind === k ? "chip selected" : "chip"} onClick={() => { setKind(k); setShowMoment(true); }}>{k}</button>
            ))}
          </div>
          <div className="meta">Pick the moment type for your position (Forward — Shoot, GK — Save, Defender — Tackle, Midfielder — Pass), then play it. 10 seconds, pick-a-zone + timing bar.</div>
          {showMoment && <LiveMoment kind={kind} onResult={onResult} />}
          {!showMoment && (
            <button onClick={() => setShowMoment(true)}>Simulate a moment (demo)</button>
          )}
          <ActionGate action="play a live moment in a real match">
            <div className="meta">In a real match, poll this page — when it is your turn you have 10 seconds to send pick-a-zone + timing. Miss it and it auto-plays on stats only, no skill bonus.</div>
          </ActionGate>
          <h2>Live table (Group A)</h2>
          <div className="card">
            <table>
              <thead><tr><th>#</th><th>Team</th><th className="num">P</th><th className="num">Pts</th></tr></thead>
              <tbody>
                {GROUP_A_TABLE.slice(0, 4).map((r, i) => (
                  <tr key={r.team}><td>{i + 1}</td><td>{r.team}</td><td className="num">{r.p}</td><td className="num"><b>{r.pts}</b></td></tr>
                ))}
              </tbody>
            </table>
            <div className="meta">Full table on the League page — it updates after every goal.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
