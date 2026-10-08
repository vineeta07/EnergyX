"use client";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { WS_URL } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { useLive } from "@/store/live";

/** Which react-query caches each domain event invalidates. */
const INVALIDATE: Record<string, string[]> = {
  WastePickupRequested: ["pickups", "dashboard", "sources", "map"],
  RouteOptimized: ["routes", "pickups", "map", "dashboard"],
  PickupAssigned: ["pickups", "routes"],
  VehicleEnRoute: ["routes", "pickups", "map", "vehicles"],
  WasteCollected: ["pickups", "routes", "map"],
  WasteArrivedAtHub: ["shipments", "dashboard", "pickups", "routes", "map"],
  WasteClassificationCompleted: ["shipments", "shipment"],
  ClassificationReviewed: ["shipments", "shipment", "models"],
  EnergyPotentialCalculated: ["shipment"],
  FacilitySelected: ["decisions", "shipment", "dashboard"],
  DestinationApproved: ["decisions", "shipment", "routes", "facility"],
  WasteDispatched: ["routes", "facility", "facilities", "map"],
  ActualOutputRecorded: ["energy", "dashboard", "facility", "facilities", "decisions", "shipment"],
  AITrainingDataCreated: ["models"],
  ModelRetrainingStarted: ["models"],
  ModelRetrained: ["models", "dashboard"],
  AlertRaised: ["alerts", "dashboard"],
  WasteSourceRegistered: ["sources", "map"],
  FacilityRegistered: ["facilities", "map"],
};

export function useLiveSocket() {
  const token = useAuth((s) => s.token);
  const qc = useQueryClient();
  useEffect(() => {
    if (!token) return;
    let ws: WebSocket | null = null;
    let stop = false;
    let retry = 1000;
    const connect = () => {
      ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);
      ws.onopen = () => { retry = 1000; useLive.getState().setConnected(true); };
      ws.onclose = () => {
        useLive.getState().setConnected(false);
        if (!stop) setTimeout(connect, (retry = Math.min(retry * 2, 15000)));
      };
      ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        const live = useLive.getState();
        if (msg.kind === "positions") return live.setPositions(msg.positions);
        if (msg.kind !== "event") return;
        const ev = msg.event;
        if (ev.type === "DemoStage") {
          const p = ev.payload ?? {};
          if (p.failed) live.demoFinish({ error: p.error });
          else if (p.done) live.demoFinish({ shipmentId: p.shipment_id, decisionId: p.decision_id });
          else live.demoStage({ stage: p.stage, key: p.key, label: p.label, message: ev.message, data: p.data, at: Date.now() });
          qc.invalidateQueries();
          return;
        }
        if (ev.type === "VehiclePositions") return;
        live.pushEvent(ev);
        for (const k of INVALIDATE[ev.type] ?? ["dashboard"]) qc.invalidateQueries({ queryKey: [k] });
      };
    };
    connect();
    return () => { stop = true; ws?.close(); };
  }, [token, qc]);
}
