import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { one, insert } from "../database/db.ts";
import { ah, parse, HttpError } from "../middleware/http.ts";
import { signToken, requireAuth, revokeToken, bearer, type AuthUser } from "../middleware/auth.ts";
import { audit } from "../services/audit.ts";

export const authRouter = Router();

// Brute-force protection on credential endpoints.
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

const RegisterSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(8).max(128),
  name: z.string().min(2).max(100),
  role: z.enum(["generator", "fleet", "hub", "facility"]), // admin accounts are provisioned, not self-registered
  organization: z.string().max(200).optional(),
});

const publicUser = (u: any): AuthUser & { organization?: string } => ({
  id: u.id, email: u.email, name: u.name, role: u.role, facility_id: u.facility_id, hub_id: u.hub_id, organization: u.organization,
});

authRouter.post("/register", authLimiter, ah(async (req, res) => {
  const body = parse(RegisterSchema, req.body);
  const exists = await one("SELECT id FROM users WHERE lower(email)=lower($1)", [body.email]);
  if (exists) throw new HttpError(409, "An account with this email already exists");
  const user = await insert<any>("users", { ...body, email: body.email.toLowerCase(), password: undefined, password_hash: await bcrypt.hash(body.password, 12) });
  await audit(req, "auth.register", "user", user.id, { role: user.role });
  res.status(201).json({ token: signToken(publicUser(user)), user: publicUser(user) });
}));

authRouter.post("/login", authLimiter, ah(async (req, res) => {
  const body = parse(z.object({ email: z.string().max(200), password: z.string().max(128) }), req.body);
  const user = await one<any>("SELECT * FROM users WHERE lower(email)=lower($1)", [body.email]);
  const ok = user && (await bcrypt.compare(body.password, user.password_hash));
  if (!ok) {
    await audit(req, "auth.login_failed", "user", undefined, { email: body.email });
    throw new HttpError(401, "Invalid email or password");
  }
  await audit({ ...req, user: publicUser(user) } as any, "auth.login", "user", user.id);
  res.json({ token: signToken(publicUser(user)), user: publicUser(user) });
}));

authRouter.post("/logout", requireAuth, ah(async (req, res) => {
  const t = bearer(req);
  if (t) revokeToken(t);
  await audit(req, "auth.logout", "user", req.user!.id);
  res.json({ ok: true });
}));

authRouter.get("/me", requireAuth, ah(async (req, res) => {
  const u = await one<any>("SELECT * FROM users WHERE id=$1", [req.user!.id]);
  if (!u) throw new HttpError(401, "User no longer exists");
  res.json(publicUser(u));
}));
