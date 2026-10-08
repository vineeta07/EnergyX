"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { Button, ErrorBox, Input, Loading, PageHeader, Panel, Select } from "@/components/ui";
import { ShipmentTable } from "@/features/hub/ShipmentTable";

export default function Incoming() {
  const role = useAuth((s) => s.user?.role);
  const qc = useQueryClient();
  const [hub, setHub] = useState("");
  const hubs = useQuery({ queryKey: ["hubs"], queryFn: () => api.get<any[]>("/hubs") });
  const ships = useQuery({ queryKey: ["shipments", "incoming", hub], queryFn: () => api.get<any[]>(`/hub/shipments?status=in_transit,awaiting_classification${hub ? `&hub_id=${hub}` : ""}`), refetchInterval: 10_000 });
  const [w, setW] = useState<{ id: string; kg: string }>({ id: "", kg: "" });
  const weigh = useMutation({ mutationFn: () => api.post(`/hub/shipments/${w.id}/weigh`, { measured_kg: Number(w.kg) }), onSuccess: () => { qc.invalidateQueries(); setW({ id: "", kg: "" }); } });
  const canAct = role === "hub" || role === "admin";
  return (
    <div className="space-y-5">
      <PageHeader crumb={<Link href="/hub">Processing Hub</Link>} title="Incoming Waste" subtitle="Loads in transit and on the receiving floor."
        actions={<Select className="w-56" value={hub} onChange={(e) => setHub(e.target.value)}><option value="">All hubs</option>{hubs.data?.map((h) => <option key={h.id} value={h.id}>{h.code} · {h.name}</option>)}</Select>} />
      {canAct && (
        <Panel title={<span className="flex items-center gap-2"><Scale className="size-4 text-warn" />Weighbridge</span>} subtitle="Record the measured weight of a received load (overrides the declared total; in-transit loads are marked received)">
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); weigh.mutate(); }}>
            <Select className="w-64" value={w.id} onChange={(e) => setW({ ...w, id: e.target.value })} required><option value="">Select shipment…</option>{ships.data?.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.source_label.slice(0, 30)}</option>)}</Select>
            <Input className="w-40" type="number" min={1} placeholder="Measured kg" value={w.kg} onChange={(e) => setW({ ...w, kg: e.target.value })} required />
            <Button variant="primary" loading={weigh.isPending}>Record weight</Button>
          </form>
          {weigh.error && <div className="mt-3"><ErrorBox error={weigh.error} /></div>}
        </Panel>
      )}
      <Panel bodyClass="p-0">{ships.isLoading ? <Loading /> : <ShipmentTable rows={ships.data ?? []} canAct={canAct} />}</Panel>
    </div>
  );
}
