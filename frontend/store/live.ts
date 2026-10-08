"use client";
import { create } from "zustand";

export interface LiveEvent { id?: number; type: string; message: string; payload?: any; created_at?: string }
export interface Position { vehicle_id: number; route_id: number; lat: number; lng: number; heading: number; progress: number }
export interface DemoStage { stage: number; key: string; label: string; message: string; data?: any; at: number }

interface LiveState {
  connected: boolean;
  events: LiveEvent[];
  positions: Record<number, Position>;
  demo: { running: boolean; stages: DemoStage[]; done: boolean; error?: string; shipmentId?: number; decisionId?: number; open: boolean };
  setConnected: (c: boolean) => void;
  pushEvent: (e: LiveEvent) => void;
  setPositions: (p: Position[]) => void;
  demoStart: () => void;
  demoStage: (s: DemoStage) => void;
  demoFinish: (r: { error?: string; shipmentId?: number; decisionId?: number }) => void;
  demoOpen: (open: boolean) => void;
}

export const useLive = create<LiveState>()((set) => ({
  connected: false,
  events: [],
  positions: {},
  demo: { running: false, stages: [], done: false, open: false },
  setConnected: (connected) => set({ connected }),
  pushEvent: (e) => set((s) => ({ events: [e, ...s.events].slice(0, 80) })),
  setPositions: (p) => set((s) => {
    const next = { ...s.positions };
    for (const x of p) next[x.vehicle_id] = x;
    return { positions: next };
  }),
  demoStart: () => set({ demo: { running: true, stages: [], done: false, open: true } }),
  demoStage: (st) => set((s) => ({ demo: { ...s.demo, running: true, stages: [...s.demo.stages.filter((x) => x.stage !== st.stage), st] } })),
  demoFinish: (r) => set((s) => ({ demo: { ...s.demo, running: false, done: !r.error, error: r.error, shipmentId: r.shipmentId, decisionId: r.decisionId } })),
  demoOpen: (open) => set((s) => ({ demo: { ...s.demo, open } })),
}));
