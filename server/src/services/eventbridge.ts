/**
 * Publishes domain events to Amazon EventBridge when EVENT_BUS_NAME is set.
 * Events are buffered and sent in batches of up to 10 (the PutEvents limit) once a second,
 * so the request path never waits on AWS. Failures are counted and logged, never thrown.
 */
import { config } from "../config.ts";

const SOURCE = "wattcycle.api";
let queue: { type: string; detail: unknown }[] = [];
let client: any = null;
let timer: NodeJS.Timeout | null = null;
export const ebStats = { sent: 0, failed: 0, lastError: null as string | null };

export const eventBridgeEnabled = () => !!config.eventBusName;

export function enqueue(type: string, detail: unknown) {
  if (!config.eventBusName) return;
  queue.push({ type, detail });
  if (!timer) timer = setInterval(flush, 1000);
}

export async function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0, 10);
  try {
    const { EventBridgeClient, PutEventsCommand } = await import("@aws-sdk/client-eventbridge");
    client ??= new EventBridgeClient({ region: config.awsRegion });
    const out = await client.send(new PutEventsCommand({
      Entries: batch.map((e) => ({ EventBusName: config.eventBusName, Source: SOURCE, DetailType: e.type, Detail: JSON.stringify(e.detail) })),
    }));
    const failed = out.FailedEntryCount ?? 0;
    ebStats.sent += batch.length - failed;
    ebStats.failed += failed;
    if (failed) ebStats.lastError = out.Entries?.find((x: any) => x.ErrorCode)?.ErrorCode ?? "FailedEntry";
  } catch (e: any) {
    ebStats.failed += batch.length;
    ebStats.lastError = e?.name ?? String(e);
    console.warn(`[eventbridge] PutEvents failed: ${ebStats.lastError}`);
  }
}
