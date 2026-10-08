import { EventEmitter } from "node:events";
import type { WebSocket } from "ws";
import { insert } from "../database/db.ts";
import { cache } from "./cache.ts";

/**
 * Domain event bus. Every important state transition in the closed loop is
 * published here, persisted to the `events` table, and fanned out to:
 *   - WebSocket clients (live dashboard activity feed / map)
 *   - in-process subscribers (alerting, auto-retraining triggers)
 * In AWS mode the same envelope is put on EventBridge (bus: wattcycle-domain),
 * which routes to SQS queues consumed by workers — see infra/aws/README.md.
 */
export type DomainEventType =
  | "WastePickupRequested" | "CollectionOptimizationStarted" | "RouteOptimized" | "PickupAssigned"
  | "VehicleEnRoute" | "WasteCollected" | "WasteArrivedAtHub" | "WasteClassificationCompleted"
  | "ClassificationReviewed" | "EnergyPotentialCalculated" | "FacilitySelected" | "DestinationApproved"
  | "WasteDispatched" | "EnergyGenerationCompleted" | "ActualOutputRecorded" | "AITrainingDataCreated"
  | "ModelRetrainingStarted" | "ModelRetrained" | "AlertRaised" | "WasteSourceRegistered" | "FacilityRegistered"
  | "VehiclePositions" | "DemoStage";

export interface DomainEvent { id?: number; type: DomainEventType; message: string; payload?: any; created_at?: string }

const bus = new EventEmitter();
bus.setMaxListeners(50);
const sockets = new Set<WebSocket>();

export function attachSocket(ws: WebSocket) {
  sockets.add(ws);
  ws.on("close", () => sockets.delete(ws));
}

export function broadcast(msg: unknown) {
  const data = JSON.stringify(msg);
  for (const ws of sockets) if (ws.readyState === 1) ws.send(data);
}

/** Publish + persist. Ephemeral types (vehicle telemetry, demo progress) are not persisted. */
export async function publish(type: DomainEventType, message: string, payload: any = {}) {
  const ephemeral = type === "VehiclePositions" || type === "DemoStage";
  const ev: DomainEvent = ephemeral
    ? { type, message, payload, created_at: new Date().toISOString() }
    : await insert<DomainEvent>("events", { type, message, payload });
  if (!ephemeral) cache.invalidate("dashboard");
  broadcast({ kind: "event", event: ev });
  bus.emit(type, ev);
  bus.emit("*", ev);
  return ev;
}

export function subscribe(type: DomainEventType | "*", fn: (e: DomainEvent) => void) {
  bus.on(type, (e) => {
    try { fn(e); } catch (err) { console.error("[event handler]", err); }
  });
}
