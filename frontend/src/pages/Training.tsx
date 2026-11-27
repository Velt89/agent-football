import { useState } from "react";
import { TRAINING_TYPES, COACH_SESSION, MAX_FREE_TRAININGS_PER_DAY, POSITIONS } from "../config";
import { DEMO_PLAYER } from "../demoData";
import { DemoBanner, ActionGate } from "../components/shared";

type Intensity = "light" | "standard" | "intense";

const INJURY_BASE: Record<Intensity, string> = { light: "0-2%", standard: "5-8%", intense: "15-25%" };

const COACH_LABEL: Record<string, string> = {
  Goalkeeper: "GK Shot-Stopping Coach",
  Defender: "Defender Tackling Masterclass",
  Midfielder: "Midfielder Passing Masterclass",
  Forward: "Forward Finishing Coach",
};

export default function Training() {
  const p = DEMO_PLAYER;
  const [intensity, setIntensity] = useState<Intensity>("standard");
  const [stat, setStat] = useState(p.stats[0].name);
  const [coachStat, setCoachStat] = useState(p.stats[0].name);
  const [done, setDone] = useState(1); // demo: 1 of 3 free slots used today
  const [log, setLog] = useState<string[]>([]);
  const slotsLeft = MAX_FREE_TRAININGS_PER_DAY - done;
  const picked = TRAINING_TYPES.find((t) => t.id === intensity)!;
  const fatigueAfter = Math.min(100, p.fatigue + picked.fatigue);
  const injuryDoubles = p.fatigue > 70;
  const confirm = () => {
    if (slotsLeft <= 0) return;
    setDone((d) => d + 1);
    setLog((l) => [`${picked.name} — ${stat} ${picked.gain} · fatigue ${p.fatigue} → ${fatigueAfter} · injury ${INJURY_BASE[intensity]}${injuryDoubles ? " (doubled — fatigue over 70)" : ""}`, ...l]);
  };
  return (
    <div>
      <DemoBanner />
      <h1>Training Ground</h1>
      <div className="meta">
        Up to {MAX_FREE_TRAININGS_PER_DAY} free trainings a day, off-chain in Season 1.
        Recommended day: 1 Intense + 1 Standard + 1 Light ≈ 90-120 min in-game.
        Training resolves instantly in ~30 seconds of play — the minutes are in-game time, not a real wait.
      </div>

      <div className="card">
        <div className="title">Free slots today — {slotsLeft} of {MAX_FREE_TRAININGS_PER_DAY} left</div>
        <div className="meter"><div style={{ width: `${(done / MAX_FREE_TRAININGS_PER_DAY) * 100}%`, background: "#22e6ff" }} /></div>
        <div className="meta">Current fatigue {p.fatigue}/100 — over 70 injury chance doubles, over 90 forced to rest.</div>
      </div>

      <div className="grid2">
        {TRAINING_TYPES.map((t) => (
          <div className="card" key={t.id} style={intensity === t.id ? { borderColor: "#22e6ff" } : undefined}>
            <div className="title">{t.name}</div>
            <div className="meta">{t.minutes} · {t.gain} · injury {t.injury} · fatigue +{t.fatigue}</div>
            <div className="meta" style={{ marginTop: 4 }}>e.g. {t.examples}</div>
            <button className={intensity === t.id ? "" : "ghost"} onClick={() => setIntensity(t.id as Intensity)}>
              {intensity === t.id ? "Selected" : "Select"}
            </button>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="title">Confirm training — risk shown BEFORE you commit</div>
        <label>
          Stat to train
          <select value={stat} onChange={(e) => setStat(e.target.value)}>
            {p.stats.map((s) => <option key={s.name} value={s.name}>{s.name} (now {s.value})</option>)}
          </select>
        </label>
        <div className="kv"><span>Intensity</span><b>{picked.name} — {picked.minutes}</b></div>
        <div className="kv"><span>Expected gain</span><b>{picked.gain} {stat}</b></div>
        <div className="kv"><span>Injury risk</span><b>{INJURY_BASE[intensity]}{injuryDoubles ? " ×2 (fatigue over 70)" : ""}</b></div>
        <div className="kv"><span>Fatigue after</span><b>{p.fatigue} → {fatigueAfter}/100</b></div>
        <div className="kv"><span>$KICK earned</span><b>+10</b></div>
        <ActionGate action="train">
          <button disabled={slotsLeft <= 0} onClick={confirm}>
            {slotsLeft <= 0 ? "No free slots left today" : `Confirm ${picked.name} training (demo — records locally only)`}
          </button>
        </ActionGate>
        {log.map((l, i) => <div className="meta" key={i} style={{ marginTop: 4 }}>✓ {l}</div>)}
      </div>

      <div className="card">
        <div className="title">1-on-1 Coach Session — {COACH_SESSION.priceBnb} BNB</div>
        <div className="meta">
          Once a day, extra on top of the 3 free trainings. 60 min in-game, pick 1 stat,
          +{COACH_SESSION.gain} to that stat, only {COACH_SESSION.injury} injury (coach watches form),
          +{COACH_SESSION.fatigue} fatigue. Per position: {COACH_LABEL[p.position]}.
        </div>
        <label>
          Stat for the coach session
          <select value={coachStat} onChange={(e) => setCoachStat(e.target.value)}>
            {POSITIONS[p.position as keyof typeof POSITIONS].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <ActionGate action="book a Coach Session">
          <button disabled>Book Coach Session — {COACH_SESSION.priceBnb} BNB, +4 {coachStat} (disabled — demo mode)</button>
        </ActionGate>
      </div>
    </div>
  );
}
