"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ErrorBox, Kpi, Loading, PageHeader, Panel, Select, Status, Td, Th } from "@/components/ui";
import { dateTime, n } from "@/lib/format";

export default function Admin() {
  const qc = useQueryClient();
  const ov = useQuery({ queryKey: ["admin", "overview"], queryFn: () => api.get<any>("/admin/overview"), refetchInterval: 15_000 });
  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => api.get<any[]>("/admin/users") });
  const audit = useQuery({ queryKey: ["admin", "audit"], queryFn: () => api.get<any[]>("/admin/audit"), refetchInterval: 15_000 });
  const setRole = useMutation({ mutationFn: ({ id, role }: { id: number; role: string }) => api.patch(`/admin/users/${id}`, { role }), onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }) });
  if (ov.isLoading) return <Loading />;
  if (ov.error) return <ErrorBox error={ov.error} />;
  const c = ov.data.counts;
  return (
    <div className="space-y-5">
      <PageHeader title="Admin" subtitle="Network inventory, service health, users and the audit trail of every state-changing action." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {Object.entries(c).map(([k, v]) => <Kpi key={k} label={k.replace(/_/g, " ")} value={n(v as number)} />)}
      </div>
      <Panel title="Services">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>API <Status s="online" /></div>
          <div>Database: <span className="text-ink">{ov.data.services.database}</span></div>
          <div>AI service <Status s={ov.data.services.ai === "ok" ? "online" : "offline"} /></div>
          {ov.data.services.ai_models && Object.entries(ov.data.services.ai_models).map(([k, m]: any) => <div key={k} className="text-xs text-ink-3">{k}: <span className="num text-ink-2">{m.version ?? "—"}</span></div>)}
        </div>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Users" bodyClass="p-0">
          <table className="w-full"><thead><tr><Th>Name</Th><Th>Email</Th><Th>Organisation</Th><Th>Role</Th></tr></thead>
            <tbody>{users.data?.map((u) => <tr key={u.id}><Td className="text-ink">{u.name}</Td><Td>{u.email}</Td><Td>{u.organization}</Td>
              <Td><Select className="h-8 w-32 text-xs" value={u.role} onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value })}><option value="generator">generator</option><option value="fleet">fleet</option><option value="hub">hub</option><option value="facility">facility</option><option value="admin">admin</option></Select></Td></tr>)}</tbody></table>
          {setRole.error && <div className="p-3"><ErrorBox error={setRole.error} /></div>}
        </Panel>
        <Panel title="Audit log" bodyClass="p-0">
          <div className="max-h-[520px] overflow-y-auto"><table className="w-full"><thead><tr><Th>When</Th><Th>User</Th><Th>Action</Th><Th>Entity</Th></tr></thead>
            <tbody>{audit.data?.map((a) => <tr key={a.id}><Td className="whitespace-nowrap text-xs">{dateTime(a.created_at)}</Td><Td className="text-xs">{a.email ?? "system"}</Td><Td className="num text-xs text-ink">{a.action}</Td><Td className="text-xs">{a.entity} {a.entity_id}</Td></tr>)}</tbody></table></div>
        </Panel>
      </div>
    </div>
  );
}
