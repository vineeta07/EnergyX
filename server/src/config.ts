import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var ${name}`);
  return v;
}

const isProd = process.env.NODE_ENV === "production";

export const config = {
  root,
  isProd,
  port: Number(process.env.PORT ?? 4000),
  // Empty DATABASE_URL => embedded PGlite (real PostgreSQL compiled to WASM) under ./data/pg.
  databaseUrl: process.env.DATABASE_URL ?? "",
  pgliteDir: process.env.PGLITE_DIR ?? path.join(root, "data", "pg"),
  jwtSecret: required("JWT_SECRET", isProd ? undefined : "dev-only-change-me-wattcycle"),
  jwtTtl: process.env.JWT_TTL ?? "12h",
  // Shared secret between this API and the Python AI service (never sent to the browser).
  serviceKey: required("SERVICE_KEY", isProd ? undefined : "dev-service-key"),
  aiServiceUrl: process.env.AI_SERVICE_URL ?? "http://127.0.0.1:8000",
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:3000").split(","),
  uploadDir: process.env.UPLOAD_DIR ?? path.join(root, "data", "uploads"),
  s3Bucket: process.env.S3_BUCKET ?? "",
  simulateFleet: (process.env.SIMULATE_FLEET ?? "true") === "true",
};
