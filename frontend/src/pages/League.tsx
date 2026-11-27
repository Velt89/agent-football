import { MATCHDAYS, WEEKLY_REWARDS, CONTRACT_ADDRESS } from "../config";
import { GROUP_A_TABLE, GROUP_B_TABLE, FIXTURES, TOP_SCORERS, TOP_SAVERS, gd, TableRow } from "../demoData";
import { DemoBanner } from "../components/shared";
import { useWallet } from "../wallet";
import { useOnChain } from "../onchain";

function Table(props: { rows: TableRow[]; group: string }) {
  return (
    <table>
      <thead><tr><th>#</th><th>Team</th><th className="num">P</th><th className="num">W</th><th className="num">D</th><th className="num">L</th><th className="num">GF</th><th className="num">GA</th><th className="num">GD</th><th className="num">Pts</th><th>Form</th></tr></thead>
      <tbody>
        {props.rows.map((r, i) => (
          <tr key={r.team}>
            <td>{i + 1}</td><td><b>{r.team}</b></td>
            <td className="num">{r.p}</td><td className="num">{r.w}</td><td className="num">{r.d}</td><td className="num">{r.l}</td>
            <td className="num">{r.gf}</td><td className="num">{r.ga}</td><td className="num">{gd(r)}</td>
            <td className="num"><b>{r.pts}</b></td>
            <td>{r.form.map((f, j) => <span key={j} className={`form-w ${f}`}>{f}</span>)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function League() {
  const wallet = useWallet();
  const { meta, loading, error } = useOnChain(wallet);
  return (
    <div>
      <DemoBanner />
      <h1>League <span className="badge pub">Public view</span></h1>
      {/* Live contract strip — read from the chain. Tables below are still demo placeholders. */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="title">Live contract</div>
        <div className="meta">
          {loading
            ? "Loading live contract data…"
            : error
              ? `Live read failed: ${error}`
              : `${meta!.name} (${meta!.symbol}) — ${meta!.totalMinted} tokens minted, ${meta!.playersCount} player(s), ${meta!.creator.slice(0, 6)}…${meta!.creator.slice(-4)} is creator. `}
          {!loading && !error && (
            <a href={`https://bscscan.com/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noreferrer">
              {CONTRACT_ADDRESS}
            </a>
          )}
        </div>
      </div>
      <div className="meta">
        Season 1: 16 teams, 2 groups of 8, 7 league rounds + finals week. Win 3, Draw 1, Loss 0.
        Tiebreak: Goal Difference, Goals For, Head-to-Head, Live Moments Won.
        Matchdays Saturdays Dec 5, 12, 19, 26, Jan 2, 9, 16, Finals Jan 23, 2027 — 19:00 and 20:00 WIB.
      </div>

      <h2>Group A</h2>
      <div className="card"><Table rows={GROUP_A_TABLE} group="A" /></div>
      <h2>Group B</h2>
      <div className="card"><Table rows={GROUP_B_TABLE} group="B" /></div>
      <div className="meta">Demo table — placeholder results (3 rounds "played"). Captains TBD; team names are placeholders (Team A..P) until captains name their teams at formation.</div>

      <h2>Fixtures — all 8 rounds</h2>
      <div className="card">
        {MATCHDAYS.map((m) => (
          <div key={m.round}>
            <h3>{m.label} — {m.date}</h3>
            {FIXTURES.filter((f) => f.round === m.round).map((f, i) => (
              <div className="kv" key={i}>
                <span>{f.home} vs {f.away}</span>
                <b>{f.date} · {f.time}{f.score ? ` — ${f.score}` : " — TBD"}</b>
              </div>
            ))}
            {FIXTURES.filter((f) => f.round === m.round).length === 0 && (
              <div className="meta">Fixtures TBD — group round-robin, everyone in your group plays everyone once.</div>
            )}
          </div>
        ))}
      </div>

      <div className="grid2">
        <div className="card">
          <div className="title">Top Scorers</div>
          {TOP_SCORERS.map((s, i) => <div className="kv" key={i}><span>{i + 1}. {s.player}</span><b>{s.goals} goals</b></div>)}
        </div>
        <div className="card">
          <div className="title">Top Savers</div>
          {TOP_SAVERS.map((s, i) => <div className="kv" key={i}><span>{i + 1}. {s.player}</span><b>{s.saves} saves</b></div>)}
        </div>
      </div>

      <h2>Weekly rewards — Sunday Envelope</h2>
      <div className="card">
        <div className="meta">Pool that week = 90% of BNB sales that week + 65% of $KICK spent that week, paid in BNB + $KICK together. Plus a soulbound weekly badge; Team of the Week gets 1 free Coach Session each next week.</div>
        {WEEKLY_REWARDS.map((r) => (
          <div className="kv" key={r.name}><span>{r.name} — {r.note}</span><b>{r.pct}%</b></div>
        ))}
      </div>
    </div>
  );
}
