import { insert, one } from "../database/db.ts";
import { publish } from "./events.ts";

export interface AlertInput {
  severity: "info" | "warning" | "critical";
  type: string;
  title: string;
  message: string;
  causes?: string[];
  entity_type?: string;
  entity_id?: number | null;
}

/** Raise an alert; `dedupe` suppresses an identical open alert type raised in the last hour. */
export async function raiseAlert(a: AlertInput, dedupe = false) {
  if (dedupe) {
    const dup = await one("SELECT id FROM alerts WHERE type=$1 AND status='open' AND created_at > now() - interval '1 hour'", [a.type]);
    if (dup) return null;
  }
  const row = await insert<any>("alerts", { ...a, causes: a.causes ?? null, entity_type: a.entity_type ?? null, entity_id: a.entity_id ?? null });
  await publish("AlertRaised", `${a.severity.toUpperCase()}: ${a.title}`, { alert_id: row.id });
  return row;
}
