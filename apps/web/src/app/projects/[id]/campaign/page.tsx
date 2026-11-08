import CampaignStudio from "@/components/CampaignStudio";
import { notFound } from "next/navigation";

export default async function CampaignPage({ params }: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const projectId = Number(id);
  if (!Number.isSafeInteger(projectId) || projectId < 1) notFound();
  return <CampaignStudio key={id} id={projectId} />;
}
