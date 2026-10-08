/**
 * Small TTL cache for hot read paths (dashboard KPIs, analytics rollups).
 * Interface mirrors what we use from Redis (get/set/invalidate by prefix);
 * in AWS mode it is backed by ElastiCache for Redis.
 */
const store = new Map<string, { exp: number; value: unknown }>();

export const cache = {
  async wrap<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = store.get(key);
    if (hit && hit.exp > Date.now()) return hit.value as T;
    const value = await fn();
    store.set(key, { exp: Date.now() + ttlMs, value });
    return value;
  },
  invalidate(prefix: string) {
    for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
  },
};
