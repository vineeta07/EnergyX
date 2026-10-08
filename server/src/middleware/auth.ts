import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { config } from "../config.ts";

export type Role = "generator" | "fleet" | "hub" | "facility" | "admin";
export interface AuthUser { id: number; email: string; name: string; role: Role; facility_id?: number | null; hub_id?: number | null }

declare global {
  namespace Express {
    interface Request { user?: AuthUser }
  }
}

export function signToken(u: AuthUser) {
  return jwt.sign({ sub: u.id, email: u.email, name: u.name, role: u.role, facility_id: u.facility_id, hub_id: u.hub_id }, config.jwtSecret, {
    expiresIn: config.jwtTtl as any,
  });
}

// Revoked token ids (logout). In AWS mode this set lives in ElastiCache/Redis.
const revoked = new Set<string>();
export function revokeToken(token: string) {
  revoked.add(crypto.createHash("sha256").update(token).digest("hex"));
}

export function verifyToken(token: string): AuthUser | null {
  if (revoked.has(crypto.createHash("sha256").update(token).digest("hex"))) return null;
  try {
    const p = jwt.verify(token, config.jwtSecret) as any;
    return { id: Number(p.sub), email: p.email, name: p.name, role: p.role, facility_id: p.facility_id, hub_id: p.hub_id };
  } catch {
    return null;
  }
}

export function bearer(req: Request) {
  const h = req.headers.authorization;
  return h?.startsWith("Bearer ") ? h.slice(7) : null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearer(req);
  const user = token ? verifyToken(token) : null;
  if (!user) return res.status(401).json({ error: "Authentication required" });
  req.user = user;
  next();
}

/** Role-based access control. Admin can do everything. */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (req.user.role !== "admin" && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(" | ")}` });
    }
    next();
  };
}

/** Service-to-service auth for the Python AI service (constant-time compare). */
export function requireService(req: Request, res: Response, next: NextFunction) {
  const key = req.headers["x-service-key"];
  const a = Buffer.from(String(key ?? ""));
  const b = Buffer.from(config.serviceKey);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Invalid service key" });
  next();
}
