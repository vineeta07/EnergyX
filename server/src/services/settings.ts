import { one, query } from "../database/db.ts";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await one<{ value: T }>("SELECT value FROM system_settings WHERE key=$1", [key]);
  return row?.value ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await query(
    "INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [key, JSON.stringify(value)],
  );
}

export async function nextCode(table: string, prefix: string, start: number) {
  const row = await one<{ n: number }>(
    `SELECT COALESCE(MAX(CAST(SUBSTRING(code FROM '[0-9]+$') AS INT)), $1)::int AS n FROM ${table} WHERE code LIKE $2`,
    [start, `${prefix}-%`],
  );
  return `${prefix}-${(row?.n ?? start) + 1}`;
}
