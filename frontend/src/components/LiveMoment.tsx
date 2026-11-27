import { useEffect, useRef, useState } from "react";

// The live-moment mechanic (DESIGN.md, locked): pick a zone + hit a timing
// bar, 10 seconds, mobile-friendly. Skill + stats, not pure stat roll.
//   Forward — Shoot: pick a corner + power timing
//   Goalkeeper — Save: pick a dive zone + timing
//   Defender — Tackle: hit the green on a timing bar (too early = foul,
//     too late = beaten)
//   Midfielder — Pass: pick a lane (safe / through ball / risky killer pass)
//     + timing
// If offline / the 10-second window is missed, it auto-plays on stats only.

export type MomentKind = "Shoot" | "Save" | "Tackle" | "Pass";

const ZONES = [
  "Top left", "Top centre", "Top right",
  "Mid left", "Centre", "Mid right",
  "Bottom left", "Bottom centre", "Bottom right",
];

const KIND_LABEL: Record<MomentKind, { title: string; hint: string }> = {
  Shoot: { title: "Your turn — SHOOT", hint: "Pick a corner, then stop the power bar in the green." },
  Save: { title: "Your turn — SAVE", hint: "Pick a dive zone, then stop the timing bar in the green." },
  Tackle: { title: "Your turn — TACKLE", hint: "Hit the green on the timing bar. Too early = foul, too late = beaten." },
  Pass: { title: "Your turn — PASS", hint: "Pick a lane, then stop the timing bar in the green." },
};

export function LiveMoment(props: {
  kind: MomentKind;
  onResult?: (result: string) => void;
  compact?: boolean;
}) {
  const [zone, setZone] = useState<number | null>(null);
  const [lane, setLane] = useState<string | null>(null);
  const [pos, setPos] = useState(0); // timing bar 0..100
  const [dir, setDir] = useState(1);
  const [seconds, setSeconds] = useState(10);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const bar = useRef<number | null>(null);

  const stop = () => {
    if (timer.current) window.clearInterval(timer.current);
    if (bar.current) window.clearInterval(bar.current);
    timer.current = null;
    bar.current = null;
  };
  useEffect(() => stop, []);

  const start = () => {
    setResult(null);
    setZone(null);
    setLane(null);
    setSeconds(10);
    setPos(0);
    setDir(1);
    setRunning(true);
    timer.current = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          stop();
          setRunning(false);
          const auto = "Time up — auto-played on stats only, no skill bonus.";
          setResult(auto);
          props.onResult?.(auto);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    bar.current = window.setInterval(() => {
      setPos((p) => {
        let next = p + dir * 4;
        if (next >= 100) { setDir(-1); next = 100; }
        if (next <= 0) { setDir(1); next = 0; }
        return next;
      });
    }, 40);
  };

  const commit = () => {
    if (!running) return;
    stop();
    setRunning(false);
    // Green zone is 42-58. Demo outcome: green = success, near = close,
    // far = miss. Zone pick is flavour in demo mode.
    const inGreen = pos >= 42 && pos <= 58;
    const near = pos >= 30 && pos <= 70;
    const pick = props.kind === "Pass" ? (lane ?? "no lane") : (zone !== null ? ZONES[zone] : "no zone");
    let text: string;
    if (props.kind === "Tackle" && !inGreen) {
      text = pos < 42 ? `Too early — FOUL. (${pick}, bar ${Math.round(pos)})` : `Too late — BEATEN. (${pick}, bar ${Math.round(pos)})`;
    } else if (inGreen) {
      text = props.kind === "Shoot" ? `GOAL! Top bins — ${pick}, perfect power.` :
        props.kind === "Save" ? `SAVED! Full-stretch dive to ${pick}.` :
        props.kind === "Tackle" ? `Won the ball cleanly — ${pick}.` :
        `Killer pass splits the defence — ${pick}.`;
    } else if (near) {
      text = props.kind === "Shoot" ? `Off the post! ${pick} was close (bar ${Math.round(pos)}).` :
        props.kind === "Save" ? `Got a hand to it but it squeezes in. ${pick} (bar ${Math.round(pos)}).` :
        props.kind === "Tackle" ? `Half a step off — attacker gets past. (bar ${Math.round(pos)})` :
        `Pass intercepted — ${pick} was nearly on (bar ${Math.round(pos)}).`;
    } else {
      text = props.kind === "Shoot" ? `Blazed over. ${pick} (bar ${Math.round(pos)}).` :
        props.kind === "Save" ? `Wrong way — ${pick} (bar ${Math.round(pos)}).` :
        props.kind === "Tackle" ? `Nowhere near it. (bar ${Math.round(pos)})` :
        `Pass goes astray — ${pick} (bar ${Math.round(pos)}).`;
    }
    setResult(text);
    props.onResult?.(text);
  };

  const label = KIND_LABEL[props.kind];
  return (
    <div className="card moment">
      <div className="title">{label.title}</div>
      <div className="meta">{label.hint}</div>
      {!running && !result && (
        <button onClick={start}>Start moment (10 seconds)</button>
      )}
      {running && (
        <>
          <div className="countdown">⏱ {seconds}s left</div>
          {props.kind === "Pass" ? (
            <div className="row">
              {["Safe", "Through ball", "Risky killer pass"].map((l) => (
                <button key={l} className={lane === l ? "chip selected" : "chip"} onClick={() => setLane(l)}>{l}</button>
              ))}
            </div>
          ) : (
            <div className="zone-grid">
              {ZONES.map((z, i) => (
                <button key={z} className={zone === i ? "zone selected" : "zone"} onClick={() => setZone(i)}>
                  {z}
                </button>
              ))}
            </div>
          )}
          <div className="timing-bar">
            <div className="timing-green" />
            <div className="timing-marker" style={{ left: `${pos}%` }} />
          </div>
          <button onClick={commit} disabled={props.kind === "Pass" ? lane === null : zone === null}>
            {props.kind === "Shoot" ? "SHOOT!" : props.kind === "Save" ? "DIVE!" : props.kind === "Tackle" ? "TACKLE!" : "PLAY PASS"}
          </button>
          <div className="meta">Pick a {props.kind === "Pass" ? "lane" : "zone"} first, then stop the bar in the green.</div>
        </>
      )}
      {result && (
        <div className="moment-result">{result}</div>
      )}
      {result && <button onClick={start}>Play again</button>}
    </div>
  );
}
