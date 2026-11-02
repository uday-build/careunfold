import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function CaseRedirectPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  redirect(`/app/visits/${caseId}`);
}
