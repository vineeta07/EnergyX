"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth, ROLE_LABEL } from "@/store/auth";
import { Button, ErrorBox, PageHeader, Panel } from "@/components/ui";

const LABELS: Record<string, [string, string]> = {
  energy: ["Expected energy output", "+"], efficiency: ["Facility efficiency", "+"], compatibility: ["Waste compatibility", "+"], capacity: ["Available capacity", "+"],
  transport_cost: ["Transport cost", "−"], carbon: ["Carbon emissions", "−"], distance: ["Distance", "−"],
};

export default function Settings() {
  const user = useAuth((s) => s.user)!;
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["optimizer"], queryFn: () => api.get<any>("/settings/optimizer") });
  const [w, setW] = useState<Record<string, number> | null>(null);
  useEffect(() => { if (data && !w) setW(data.weights); }, [data, w]);
  const save = useMutation({ mutationFn: () => api.put("/settings/optimizer", w), onSuccess: (r: any) => { setW(r.weights); qc.invalidateQueries({ queryKey: ["optimizer"] }); } });
  const admin = user.role === "admin";
  const sum = w ? Object.values(w).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-5">
      <PageHeader title="Settings" />
      <Panel title="Profile">
        <dl className="grid max-w-md grid-cols-2 gap-y-2 text-sm"><dt className="text-ink-3">Name</dt><dd>{user.name}</dd><dt className="text-ink-3">Email</dt><dd>{user.email}</dd><dt className="text-ink-3">Role</dt><dd>{ROLE_LABEL[user.role]}</dd><dt className="text-ink-3">Organisation</dt><dd>{user.organization ?? "—"}</dd></dl>
      </Panel>
      <Panel title="Destination optimizer weights" subtitle="U = Σ wᵢ · benefitᵢ − Σ wⱼ · costⱼ. Weights are normalised to sum to 1 on save and recorded on every decision for traceability.">
        {w && (
          <div className="max-w-2xl space-y-3">
            {Object.entries(LABELS).map(([k, [label, sign]]) => (
              <div key={k} className="grid grid-cols-[200px_1fr_56px] items-center gap-3 text-sm">
                <span className="text-ink-2"><span className={sign === "+" ? "text-accent" : "text-crit"}>{sign}</span> {label}</span>
                <input type="range" min={0} max={0.6} step={0.01} disabled={!admin} value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
                <span className="num text-right">{(w[k] / sum).toFixed(2)}</span>
              </div>
            ))}
            {admin ? <div className="flex gap-2 pt-2"><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save weights</Button><Button variant="ghost" onClick={() => setW(data.defaults)}>Reset to defaults</Button></div>
              : <p className="text-xs text-ink-3">Only system operators can change optimizer weights.</p>}
            {save.error && <ErrorBox error={save.error} />}
          </div>
        )}
      </Panel>
      {data?.retrain_policy && (
        <Panel title="Retraining policy"><pre className="num text-xs text-ink-2">{JSON.stringify(data.retrain_policy, null, 2)}</pre></Panel>
      )}
    </div>
  );
}
