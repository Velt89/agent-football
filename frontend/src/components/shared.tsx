import { overallOf } from "../demoData";
import { DEPLOYED, CONTRACT_ADDRESS } from "../config";

const BSCSCAN_CONTRACT_URL = `https://bscscan.com/address/${CONTRACT_ADDRESS}`;

export interface Stat { name: string; value: number }

// FIFA-style flat vector player card: overall, position badge, 5 stats,
// team colour stripe. GKs get a distinct kit colour (bright yellow).
export function PlayerCard(props: {
  name: string;
  position: string;
  stats: Stat[];
  team: string;
  teamColour: string;
  compact?: boolean;
}) {
  const overall = overallOf(props.stats);
  const isGk = props.position === "Goalkeeper";
  const kit = isGk ? "#ffd23f" : props.teamColour;
  return (
    <div className="player-card" style={{ borderTopColor: kit }}>
      <div className="pc-head">
        <div className="pc-overall">
          <span className="pc-ov-num">{overall}</span>
          <span className="pc-pos">{props.position.slice(0, 3).toUpperCase()}</span>
        </div>
        <div className="pc-identity">
          <div className="pc-name">{props.name}</div>
          <div className="pc-team">
            <span className="pc-stripe" style={{ background: kit }} />
            {props.team} · {props.position}
          </div>
        </div>
        <div className="pc-kit" style={{ background: kit }}>
          {isGk ? "GK" : "⚽"}
        </div>
      </div>
      <div className="pc-stats">
        {props.stats.map((s) => (
          <div className="pc-stat" key={s.name}>
            <span>{s.name}</span>
            <span className="pc-stat-val">{s.value}</span>
            <div className="pc-bar">
              <div style={{ width: `${s.value}%`, background: kit }} />
            </div>
          </div>
        ))}
      </div>
      {!props.compact && (
        <div className="pc-foot">Overall = average of the 5 stats · Cap 99 per stat</div>
      )}
    </div>
  );
}

// Inline SVG radar chart of the 5 stats (no chart library).
export function RadarChart(props: { stats: Stat[]; size?: number }) {
  const size = props.size ?? 260;
  const c = size / 2;
  const r = size / 2 - 34;
  const n = props.stats.length;
  const pt = (i: number, v: number) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    const d = (v / 99) * r;
    return [c + Math.cos(a) * d, c + Math.sin(a) * d] as const;
  };
  const poly = props.stats.map((s, i) => pt(i, s.value).join(",")).join(" ");
  const grid = [0.25, 0.5, 0.75, 1].map((f) =>
    props.stats.map((_, i) => pt(i, 99 * f).join(",")).join(" "),
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="radar">
      {grid.map((g, i) => (
        <polygon key={i} points={g} fill="none" stroke="#22e6ff22" strokeWidth="1" />
      ))}
      {props.stats.map((s, i) => {
        const [x, y] = pt(i, 99);
        return <line key={s.name} x1={c} y1={c} x2={x} y2={y} stroke="#22e6ff22" />;
      })}
      <polygon points={poly} fill="#22e6ff33" stroke="#22e6ff" strokeWidth="2" />
      {props.stats.map((s, i) => {
        const [x, y] = pt(i, s.value);
        return <circle key={s.name} cx={x} cy={y} r="4" fill="#22e6ff" />;
      })}
      {props.stats.map((s, i) => {
        const [x, y] = pt(i, 118);
        return (
          <text key={s.name} x={x} y={y} textAnchor="middle" dominantBaseline="middle" className="radar-label">
            {s.name} {s.value}
          </text>
        );
      })}
    </svg>
  );
}

// Agent ID gate: every ACTION requires Agent ID; League / Clubs / Live
// Match Center are public view. The contract is LIVE on BSC and wallet
// reads are wired (connect to load your live player). Writes (mint, coach,
// unlock, use item) are NOT wired in this build — no transaction can be
// sent from this site yet; live actions go through the agent CLI / API.
export function ActionGate(props: { action: string; children?: React.ReactNode }) {
  return (
    <div className="gate">
      <strong>🔒 Agent ID required to {props.action}.</strong>
      <div className="meta">
        {DEPLOYED ? (
          <>
            Connect a wallet holding an Agent ID to play. Contract is LIVE on
            BSC at{" "}
            <a href={BSCSCAN_CONTRACT_URL} target="_blank" rel="noreferrer">
              {CONTRACT_ADDRESS}
            </a>{" "}
            (Sourcify verified). Reads are live; the buttons below show the
            flow, but no transaction can be sent from this site yet.
          </>
        ) : (
          <>
            Connect a wallet holding an Agent ID to play. Demo mode: the
            contract is not deployed yet, so actions are disabled — the
            buttons below show what the flow will be.
          </>
        )}
      </div>
      {props.children}
    </div>
  );
}

export function DemoBanner() {
  if (DEPLOYED) {
    return (
      <div className="demo-banner">
        Live on BSC — contract{" "}
        <a href={BSCSCAN_CONTRACT_URL} target="_blank" rel="noreferrer">
          {CONTRACT_ADDRESS}
        </a>{" "}
        (Sourcify verified). Connect your wallet to load your live player;
        anything labelled demo below is placeholder data, not a live read.
        No transaction can be sent from this page.
      </div>
    );
  }
  return (
    <div className="demo-banner">
      Demo data — contract not deployed yet. Nothing here is live; no wallet
      is connected and no transaction can be sent from this page.
    </div>
  );
}
