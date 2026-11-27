// Agent Football — Durable Object: live Saturday match room.
// CODE ONLY — not deployed. One MatchRoom instance per match (id = fixture id).
// State: score, game minute, current moment, connected players, spectators.
// The 10-minute real-time match is driven by the match engine (workers/src/match.ts);
// this object is the live coordination point: it fans out "your turn" moments,
// accepts a player's pick-a-zone + timing input inside the 10s window, and
// auto-plays on stats when the window expires or the player is offline.
//
// Wiring (wrangler.toml): [[durable_objects.bindings]] name = "MATCH_ROOM",
// class_name = "MatchRoom", plus a [[migrations]] tag v1 new_classes = ["MatchRoom"].
// In production the Worker routes /api/match/:id/live through
// env.MATCH_ROOM.idFromName(matchId).get(env.MATCH_ROOM, ...).
// Types are deliberately loose (no @cloudflare/workers-types dep in this repo);
// run `npm i -D @cloudflare/workers-types` and tighten before deploy.

export interface RoomState {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeGoals: number;
  awayGoals: number;
  minute: number; // game minute 0-90
  startedAt: string | null;
  currentMoment: Record<string, unknown> | null;
  momentDeadline: number | null; // epoch ms — 10s window
  players: string[]; // wallets of connected starters/subs
  spectators: number;
  momentsWon: Record<string, number>; // wallet -> live moments won (Man of the Match)
}

export class MatchRoom {
  state: unknown; // DurableObjectState in production
  env: unknown;
  room: RoomState | null = null;

  constructor(state: unknown, env: unknown) {
    this.state = state;
    this.env = env;
  }

  private storage(): {
    get(key: string): Promise<unknown>;
    put(key: string, value: unknown): Promise<void>;
  } {
    return (this.state as { storage: { get(k: string): Promise<unknown>; put(k: string, v: unknown): Promise<void> } }).storage;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const action = url.pathname.split("/").pop() ?? "";
    if (action === "join" && request.method === "POST") {
      const { matchId, wallet, role } = (await request.json()) as { matchId: string; wallet: string; role: string };
      if (!this.room) {
        this.room = {
          matchId, homeTeam: "", awayTeam: "", homeGoals: 0, awayGoals: 0, minute: 0,
          startedAt: null, currentMoment: null, momentDeadline: null,
          players: [], spectators: 0, momentsWon: {},
        };
      }
      if (role === "spectator") this.room.spectators++;
      else if (!this.room.players.includes(wallet)) this.room.players.push(wallet);
      await this.storage().put("room", this.room);
      return Response.json({ ok: true, room: this.room });
    }
    if (action === "state") {
      const saved = (await this.storage().get("room")) as RoomState | undefined;
      return Response.json({ ok: true, room: saved ?? this.room });
    }
    if (action === "moment" && request.method === "POST") {
      // A live moment opened: { moment, minute, team }. 10s window starts now.
      const { moment, minute } = (await request.json()) as { moment: Record<string, unknown>; minute: number };
      if (!this.room) return Response.json({ ok: false, error: "ROOM_NOT_STARTED" }, { status: 400 });
      this.room.currentMoment = moment;
      this.room.minute = minute;
      this.room.momentDeadline = Date.now() + 10_000;
      await this.storage().put("room", this.room);
      return Response.json({ ok: true, deadlineMs: this.room.momentDeadline });
    }
    if (action === "play" && request.method === "POST") {
      // Player input inside the window: { wallet, zone, timing }.
      // After the deadline (or no input) the caller auto-plays on stats instead.
      const { wallet } = (await request.json()) as { wallet: string; zone?: string; timing?: number };
      if (!this.room || !this.room.currentMoment) {
        return Response.json({ ok: false, error: "NO_LIVE_MOMENT" }, { status: 400 });
      }
      if (this.room.momentDeadline && Date.now() > this.room.momentDeadline) {
        return Response.json({ ok: false, error: "WINDOW_EXPIRED", autoPlay: true }, { status: 408 });
      }
      this.room.momentsWon[wallet] = (this.room.momentsWon[wallet] ?? 0) + 1;
      this.room.currentMoment = null;
      this.room.momentDeadline = null;
      await this.storage().put("room", this.room);
      return Response.json({ ok: true, momentsWon: this.room.momentsWon[wallet] });
    }
    if (action === "goal" && request.method === "POST") {
      const { team } = (await request.json()) as { team: "home" | "away" };
      if (!this.room) return Response.json({ ok: false, error: "ROOM_NOT_STARTED" }, { status: 400 });
      if (team === "home") this.room.homeGoals++;
      else this.room.awayGoals++;
      await this.storage().put("room", this.room);
      return Response.json({ ok: true, score: `${this.room.homeGoals}-${this.room.awayGoals}` });
    }
    return Response.json({ ok: false, error: "UNKNOWN_ROOM_ACTION" }, { status: 404 });
  }
}
