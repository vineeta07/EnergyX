"use client";
import { useAuth } from "@/store/auth";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const token = useAuth.getState().token;
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(isForm ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = {};
  try { json = text ? JSON.parse(text) : {}; } catch { json = { error: text }; }
  if (res.status === 401 && token) {
    useAuth.getState().clear();
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) location.href = "/login?expired=1";
  }
  if (!res.ok) {
    const detail = Array.isArray(json.details) ? `: ${json.details.map((d: any) => `${d.path} ${d.message}`).join("; ")}` : "";
    throw new ApiError(res.status, (json.error ?? `Request failed (${res.status})`) + detail, json.details);
  }
  return json as T;
}

export const api = {
  get: <T = any>(p: string) => request<T>("GET", p),
  post: <T = any>(p: string, b?: unknown) => request<T>("POST", p, b ?? {}),
  put: <T = any>(p: string, b?: unknown) => request<T>("PUT", p, b),
  patch: <T = any>(p: string, b?: unknown) => request<T>("PATCH", p, b),
  upload: <T = any>(p: string, form: FormData) => request<T>("POST", p, form, true),
  /** A file behind auth (an <img> cannot send the token), as an object URL. */
  blobUrl: async (p: string) => {
    const token = useAuth.getState().token;
    const res = await fetch(`/api${p}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new ApiError(res.status, `Request failed (${res.status})`);
    return URL.createObjectURL(await res.blob());
  },
};

/** WebSocket endpoint: explicit env, else same origin (CloudFront/ALB route /ws to the API), else the local API port in dev. */
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? (typeof window === "undefined" || ["localhost:3000", "127.0.0.1:3000"].includes(window.location.host)
  ? "ws://localhost:4000/ws"
  : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`);
