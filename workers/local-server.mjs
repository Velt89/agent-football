// Agent Football — local dev server (NO Cloudflare, NO deploy).
// Serves the SAME handler logic as the Worker (workers/src/core.ts, compiled to
// workers/dist/) backed by an in-memory store, so the API can be smoke-tested
// locally. Dev mode auto-provisions a deterministic demo player for any wallet
// (production Worker returns 404 PLAYER_NOT_FOUND until the player is minted).
//   node workers/local-server.mjs [port]     default port 8787 (AGENT_FOOTBALL_PORT)
// All state is in-memory and resets on restart.
import http from "node:http";
import { handleRequest, MemoryStore } from "./dist/core.js";

const PORT = Number(process.env.AGENT_FOOTBALL_PORT ?? process.argv[2] ?? 8787);
const store = new MemoryStore();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  let body = null;
  if (req.method === "POST" || req.method === "PUT") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  }
  const query = {};
  url.searchParams.forEach((v, k) => { query[k] = v; });
  try {
    const result = await handleRequest(req.method ?? "GET", url.pathname, query, body, store, { devMode: true });
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(JSON.stringify(result.body));
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "SERVER_ERROR", message: String(e?.message ?? e) }));
  }
});

server.listen(PORT, () => {
  console.log(`Agent Football local API on http://localhost:${PORT} (dev mode, in-memory store)`);
  console.log(`Try: curl http://localhost:${PORT}/api/health`);
});
