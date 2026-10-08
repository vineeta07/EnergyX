import type { Request } from "express";
import { insert } from "../database/db.ts";

export async function audit(req: Request | null, action: string, entity?: string, entityId?: string | number, details?: unknown) {
  try {
    await insert("audit_logs", {
      user_id: req?.user?.id ?? null,
      action,
      entity: entity ?? null,
      entity_id: entityId != null ? String(entityId) : null,
      details: details ?? null,
      ip: req?.ip ?? null,
    });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}
