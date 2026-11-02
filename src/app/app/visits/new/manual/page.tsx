import Link from "next/link";
import { VisitForm } from "@/components/visit-forms";
import { loadVisitPeople } from "../../people";

export const dynamic = "force-dynamic";

export default async function ManualVisitPage() {
  const { patients, clinicians } = await loadVisitPeople();
  return (
    <section className="stack">
      <p><Link href="/app/visits/new">Back to add a visit</Link></p>
      <p className="eyebrow">New visit · By hand</p>
      <h1>Visit details</h1>
      <p className="lede">Enter the encounter and the pre-visit intake. You can change these fields before saving.</p>
      <VisitForm patients={patients} clinicians={clinicians} />
    </section>
  );
}
