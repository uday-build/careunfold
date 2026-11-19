import Link from "next/link";
import { VisitStartChoices } from "@/components/visit-forms";

export const dynamic = "force-dynamic";

export default function NewVisitPage() {
  return (
    <section className="stack">
      <p><Link href="/app/visits">Back to visits</Link></p>
      <p className="eyebrow">New visit</p>
      <h1>How do you want to add this visit?</h1>
      <p className="lede">Both paths use the same visit fields. A document is read into a draft you can edit. You can store more than one bill on the visit, including later or adjusted bills. Nothing is saved until you confirm.</p>
      <VisitStartChoices />
    </section>
  );
}
