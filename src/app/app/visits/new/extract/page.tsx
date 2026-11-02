import Link from "next/link";
import { VisitExtractForm } from "@/components/visit-forms";
import { loadVisitPeople } from "../../people";

export const dynamic = "force-dynamic";

export default async function ExtractVisitPage() {
  const { patients, clinicians, storageConfigured } = await loadVisitPeople();
  return (
    <section className="stack">
      <p><Link href="/app/visits/new">Back to add a visit</Link></p>
      <p className="eyebrow">New visit · From a document</p>
      <h1>Upload a document</h1>
      <p className="lede">CareUnfold reads the file and fills the same encounter and intake fields you would type by hand. Review and change them before saving. Nothing is stored until you save.</p>
      <VisitExtractForm patients={patients} clinicians={clinicians} storageConfigured={storageConfigured} />
    </section>
  );
}
