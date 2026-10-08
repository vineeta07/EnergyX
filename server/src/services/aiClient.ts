import { config } from "../config.ts";
import { HttpError } from "../middleware/http.ts";

/**
 * Client for the Python AI service (FastAPI). All ML inference, optimisation
 * (OR-Tools), training and the assistant run there; this API owns data,
 * auth and orchestration. Calls are authenticated with the shared service key.
 */
async function call<T>(path: string, body?: unknown, timeoutMs = 15_000, method = "POST"): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.aiServiceUrl}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-service-key": config.serviceKey },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new HttpError(res.status === 503 ? 503 : 502, json.detail ?? json.error ?? `AI service error ${res.status}`);
    return json as T;
  } catch (e: any) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(503, `AI service unavailable (${config.aiServiceUrl}). Start it with: cd ai-service && python -m uvicorn app.main:app --port 8000`);
  } finally {
    clearTimeout(t);
  }
}

export const ai = {
  health: () => call<{ status: string; models: Record<string, any> }>("/health", undefined, 3000, "GET"),
  forecast: (body: unknown) => call<any>("/v1/forecast", body),
  classify: (body: unknown) => call<any>("/v1/classify", body),
  predictEnergy: (body: unknown) => call<any>("/v1/predict-energy", body),
  rankFacilities: (body: unknown) => call<any>("/v1/rank-facilities", body),
  optimizeRoutes: (body: unknown) => call<any>("/v1/optimize-routes", body, 30_000),
  train: (body: unknown) => call<any>("/v1/train", body, 10_000),
  assistant: (body: unknown) => call<any>("/v1/assistant/chat", body, 90_000),
};
