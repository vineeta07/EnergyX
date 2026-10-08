import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z, ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what: string) => new HttpError(404, `${what} not found`);

/** Wrap async handlers so rejections reach the error middleware. */
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

/** Strip HTML tags / control chars from every string in a payload (defence in depth on top of zod). */
export function sanitize<T>(v: T): T {
  if (typeof v === "string") return v.replace(/<[^>]*>/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim() as T;
  if (Array.isArray(v)) return v.map(sanitize) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitize(x)])) as T;
  return v;
}

export function parse<S extends ZodType>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(sanitize(data));
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Validation failed", details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large (max 8 MB)" });
  console.error("[error]", err);
  res.status(500).json({ error: "Internal server error" });
}

export const idParam = (req: Request) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Invalid id");
  return id;
};
