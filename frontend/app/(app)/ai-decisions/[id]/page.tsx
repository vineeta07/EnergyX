import { DecisionPage } from "./DecisionPage";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DecisionPage id={id} />;
}
