"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ErrorBox, Loading, PageHeader } from "@/components/ui";
import { DecisionView } from "@/features/decisions/DecisionView";

export function DecisionPage({ id }: { id: string }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["decisions", id], queryFn: () => api.get<any>(`/ai-decisions/${id}`), refetchInterval: 8000 });
  if (isLoading) return <Loading />;
  if (error) return <ErrorBox error={error} />;
  const d = data.decision;
  return (
    <div>
      <PageHeader crumb={<><Link href="/ai-decisions">AI Engine</Link> / {d.code}</>} title="Facility Optimization"
        subtitle={<>Shipment <Link href={`/hub/classification/${d.shipment_id}`} className="num text-accent">{d.shipment_code}</Link> · {d.source_label}{d.decided_by_name ? ` · decided by ${d.decided_by_name}` : ""}</>} />
      <DecisionView d={d} outcome={data.feedback} />
    </div>
  );
}
