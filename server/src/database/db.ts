import fs from "node:fs";
import path from "node:path";
import { config } from "../config.ts";

/**
 * Thin query layer over either embedded PGlite (zero-install local demo) or a
 * real PostgreSQL / RDS instance via `pg`. Both speak the same SQL dialect and
 * the same `query(text, params) -> { rows }` contract.
 */
type Row = Record<string, any>;
interface Driver {
  query(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
  exec(text: string): Promise<unknown>;
  close(): Promise<void>;
}

let driver: Driver | null = null;

async function createDriver(): Promise<Driver> {
  if (config.databaseUrl) {
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: config.databaseUrl, max: 10 });
    return {
      query: (t, p) => pool.query(t, p as any[]),
      exec: (t) => pool.query(t),
      close: () => pool.end(),
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  fs.mkdirSync(config.pgliteDir, { recursive: true });
  const db = await PGlite.create(config.pgliteDir);
  return {
    query: (t, p) => db.query(t, p as any[]) as Promise<{ rows: Row[] }>,
    exec: (t) => db.exec(t),
    close: () => db.close(),
  };
}

export async function initDb(): Promise<void> {
  if (driver) return;
  driver = await createDriver();
  const schema = fs.readFileSync(path.join(config.root, "src", "database", "schema.sql"), "utf8");
  await driver.exec(schema);
}

function d(): Driver {
  if (!driver) throw new Error("Database not initialised");
  return driver;
}

// PGlite serialises queries internally; we add a tiny mutex so multi-statement
// transactions are not interleaved with concurrent requests.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export async function query<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  if (config.databaseUrl) return (await d().query(text, params)).rows as T[];
  return serial(async () => (await d().query(text, params)).rows as T[]);
}

export async function one<T = Row>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function exec(text: string): Promise<void> {
  await serial(() => d().exec(text));
}

/** Insert a row from a plain object; JSON values are stringified. Returns the inserted row. */
export async function insert<T = Row>(table: string, data: Record<string, unknown>): Promise<T> {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  const values = keys.map((k) => jsonify(data[k]));
  const sql = `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING *`;
  return (await one<T>(sql, values))!;
}

export async function update<T = Row>(table: string, id: number, data: Record<string, unknown>): Promise<T | null> {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (!keys.length) return one<T>(`SELECT * FROM ${table} WHERE id=$1`, [id]);
  const sets = keys.map((k, i) => `${k}=$${i + 1}`).join(",");
  return one<T>(`UPDATE ${table} SET ${sets} WHERE id=$${keys.length + 1} RETURNING *`, [...keys.map((k) => jsonify(data[k])), id]);
}

function jsonify(v: unknown): unknown {
  if (v === null || v instanceof Date) return v;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

export async function closeDb() {
  if (driver) await driver.close();
  driver = null;
}
