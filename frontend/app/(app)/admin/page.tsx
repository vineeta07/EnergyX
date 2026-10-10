"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ErrorBox, Kpi, Loading, PageHeader, Panel, Select, Status, Td, Th } from "@/components/ui";
import { dateTime, n, NONE } from "@/lib/format";

import { t, tEnum } from "@/lib/i18n";
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
      <PageHeader title={t("Admin")} subtitle={t("What is on the network, whether each service is up, who has access, and a log of every change.")} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {Object.entries(c).map(([k, v]) => <Kpi key={k} label={tEnum(k)} value={n(v as number)} />)}
      </div>
      <Panel title={t("Services")}>
        <div className="flex flex-wrap gap-6 text-sm">
          <div>{t("API")} <Status s="online" /></div>
          <div>{t("Database")}: <span className="text-ink">{ov.data.services.database}</span></div>
          <div>{t("Prediction service")} <Status s={ov.data.services.ai === "ok" ? "online" : "offline"} /></div>
          {ov.data.services.ai_models && Object.entries(ov.data.services.ai_models).map(([k, m]: any) => <div key={k} className="text-xs text-ink-3">{tEnum(k)}: <span className="num text-ink-2">{m.version ?? NONE}</span></div>)}
        </div>
      </Panel>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title={t("Users")} bodyClass="p-0">
          <table className="w-full"><thead><tr><Th>{t("Name")}</Th><Th>{t("Email")}</Th><Th>{t("Organisation")}</Th><Th>{t("Role")}</Th></tr></thead>
            <tbody>{users.data?.map((u) => <tr key={u.id}><Td className="text-ink">{u.name}</Td><Td>{u.email}</Td><Td>{u.organization}</Td>
              <Td><Select className="h-8 w-40 text-xs" value={u.role} onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value })}><option value="generator">{t("Waste generator")}</option><option value="fleet">{t("Fleet operator")}</option><option value="hub">{t("Hub operator")}</option><option value="facility">{t("Plant operator")}</option><option value="admin">{t("System operator")}</option></Select></Td></tr>)}</tbody></table>
          {setRole.error && <div className="p-3"><ErrorBox error={setRole.error} /></div>}
        </Panel>
        <Panel title={t("Audit log")} bodyClass="p-0">
          <div className="max-h-[520px] overflow-y-auto"><table className="w-full"><thead><tr><Th>{t("When")}</Th><Th>{t("User")}</Th><Th>{t("Action")}</Th><Th>{t("Entity")}</Th></tr></thead>
            <tbody>{audit.data?.map((a) => <tr key={a.id}><Td className="whitespace-nowrap text-xs">{dateTime(a.created_at)}</Td><Td className="text-xs">{a.email ?? t("System")}</Td><Td className="num text-xs text-ink">{a.action}</Td><Td className="text-xs">{a.entity} {a.entity_id}</Td></tr>)}</tbody></table></div>
        </Panel>
      </div>
    </div>
  );
}
