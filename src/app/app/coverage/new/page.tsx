import Link from "next/link";
import { CoverageStartChoices } from "@/components/coverage-forms";

export const dynamic = "force-dynamic";

export default function NewCoveragePage() {
  return (
    <section className="stack">
      <p><Link href="/app/coverage">Back to coverage</Link></p>
      <p className="eyebrow">New coverage</p>
      <h1>How do you want to add coverage?</h1>
      <p className="lede">Both paths use the same ID card and benefits fields. A document is read into a draft you can edit. Nothing is saved until you confirm.</p>
      <CoverageStartChoices />
    </section>
  );
}
