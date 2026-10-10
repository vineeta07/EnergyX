import express from "express";
import http from "node:http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { WebSocketServer } from "ws";
import { config } from "./config.ts";
import { initDb } from "./database/db.ts";
import { seed } from "./database/seed.ts";
import { errorHandler } from "./middleware/http.ts";
import { requireAuth, requireService, verifyToken } from "./middleware/auth.ts";
import { authRouter } from "./api/auth.ts";
import { networkRouter } from "./api/network.ts";
import { opsRouter } from "./api/operations.ts";
import { aiRouter } from "./api/intelligence.ts";
import { platformRouter } from "./api/platform.ts";
import { internalRouter } from "./api/internal.ts";
import { plannerRouter } from "./api/planner.ts";
import { attachSocket, subscribe } from "./services/events.ts";
import { initRoads, ensureRoadMatrix } from "./services/roads.ts";
import { startFleetSimulator } from "./workers/fleet.ts";
import { startScheduler } from "./workers/scheduler.ts";

async function main() {
  await initDb();
  if (await seed(false)) console.log("[db] Seeded Delhi network (real zones & facilities; simulated daily operations)");
  await initRoads();
  // New fixed points get real road distances too.
  for (const t of ["WasteSourceRegistered", "FacilityRegistered"] as const) {
    subscribe(t, () => { ensureRoadMatrix().catch((e) => console.warn("[roads] refresh failed:", e.message)); });
  }

  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ crossOriginResourcePolicy: { policy: "same-site" } }));
  app.use(cors({ origin: config.corsOrigin, credentials: false }));
  app.use(express.json({ limit: "1mb" }));

  // Global API rate limit (per IP). Auth routes have a stricter limiter of their own.
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

  app.get("/health", (_req, res) => res.json({ status: "ok", service: "wattcycle-api" }));
  app.use("/api/auth", authRouter);
  // Public endpoints (landing/impact pages)
  app.use("/api", (req, res, next) => (req.path.startsWith("/public/") ? platformRouter(req, res, next) : next()));
  // Everything else requires a valid JWT; per-route RBAC inside routers.
  app.use("/api", requireAuth, networkRouter, opsRouter, aiRouter, platformRouter, plannerRouter);
  app.use("/internal", requireService, internalRouter);
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  app.use(errorHandler);

  const server = http.createServer(app);
  // Real-time channel: domain events + vehicle telemetry. Token passed as ?token= (browsers cannot set WS headers).
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", "http://x");
    const user = verifyToken(url.searchParams.get("token") ?? "");
    if (!user) return ws.close(4401, "unauthorized");
    attachSocket(ws);
    ws.send(JSON.stringify({ kind: "hello", user: user.name }));
  });

  server.listen(config.port, () => {
    console.log(`[api] WattCycle API on http://localhost:${config.port}  (db: ${config.databaseUrl ? "postgresql" : "embedded PGlite"})`);
    console.log(`[api] AI service expected at ${config.aiServiceUrl}`);
  });
  if (config.simulateFleet) startFleetSimulator();
  startScheduler();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
