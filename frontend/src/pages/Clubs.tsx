import { useState } from "react";
import { CLUBS } from "../demoData";
import { DemoBanner, ActionGate } from "../components/shared";

export default function Clubs() {
  const [selected, setSelected] = useState(CLUBS[0].name);
  const [joined, setJoined] = useState<string | null>(null);
  const club = CLUBS.find((c) => c.name === selected)!;
  const starters = club.squad.filter((s) => s.starter);
  const subs = club.squad.filter((s) => !s.starter);
  return (
    <div>
      <DemoBanner />
      <h1>Clubs <span className="badge pub">Public view</span></h1>
      <div className="meta">
        16 teams, 11 starters + 4 subs = 15 squad, 240 players total. First-come, first-served —
        the first 15 to join a team fill it. Team names are placeholders (Team A..P); captains name
        their team at formation. Transfer window Week 4: 1 move per team.
      </div>
      <div className="grid2">
        <div>
          <h2>All clubs</h2>
          {(["A", "B"] as const).map((g) => (
            <div key={g}>
              <h3>Group {g}</h3>
              {CLUBS.filter((c) => c.group === g).map((c) => (
                <div className="card" key={c.name} style={selected === c.name ? { borderColor: c.colour } : undefined}>
                  <div className="row">
                    <span className="pc-stripe" style={{ background: c.colour, width: 28 }} />
                    <b>{c.name}</b>
                    <span className="badge">Captain: {c.captain}</span>
                    <span className={c.slotsLeft === 0 ? "badge lock" : "badge hot"}>
                      {c.slotsLeft === 0 ? "FULL" : `${c.slotsLeft} slots left`}
                    </span>
                  </div>
                  <button className="ghost" onClick={() => setSelected(c.name)}>View squad</button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div>
          <h2>{club.name} — detail</h2>
          <div className="card">
            <div className="row">
              <span className="pc-stripe" style={{ background: club.colour, width: 36 }} />
              <div>
                <div className="title" style={{ margin: 0 }}>{club.name} · Group {club.group}</div>
                <div className="meta">Captain: {club.captain} · {club.slotsLeft === 0 ? "Squad full (15/15)" : `${15 - club.slotsLeft}/15 filled — ${club.slotsLeft} slots left`}</div>
              </div>
            </div>
            <ActionGate action="join a team">
              <button
                disabled={club.slotsLeft === 0 || joined === club.name}
                onClick={() => setJoined(club.name)}
              >
                {joined === club.name ? "Request sent (demo — local only)" : club.slotsLeft === 0 ? "Squad full" : `Request to join ${club.name} (demo)`}
              </button>
            </ActionGate>
          </div>
          <div className="card">
            <div className="title">Starters (11)</div>
            <table>
              <thead><tr><th>Player</th><th>Position</th><th className="num">Overall</th></tr></thead>
              <tbody>
                {starters.map((s, i) => (
                  <tr key={i}><td>{s.name}</td><td>{s.position}</td><td className="num">{s.overall}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="title" style={{ marginTop: 12 }}>Subs (4)</div>
            <table>
              <tbody>
                {subs.map((s, i) => (
                  <tr key={i}><td>{s.name}</td><td>{s.position}</td><td className="num">{s.overall}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="meta" style={{ marginTop: 8 }}>
              If a starter is offline / injured a sub covers them automatically. If subs are also out,
              that spot auto-plays on stats only — no forfeit for missing 1-2 players.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
