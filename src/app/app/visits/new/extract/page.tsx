import { VisitExtractForm } from "@/components/visit-forms";
import { loadVisitPeople } from "../../people";

export const dynamic = "force-dynamic";

export default async function ExtractVisitPage() {
  const { patients, clinicians, storageConfigured } = await loadVisitPeople();
  return (
    <section className="stack">
      <VisitExtractForm patients={patients} clinicians={clinicians} storageConfigured={storageConfigured} />
    </section>
  );
}
