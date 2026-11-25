import Link from "next/link";
import { Shell } from "@/components/app-shell";
import { CoverageSkipButton, CoverageStartChoices } from "@/components/coverage-forms";
import { loadSetup } from "../../load";

export const dynamic = "force-dynamic";

export default async function CoverageStepPage() {
  await loadSetup("coverage");
  return (
    <Shell>
      <section className="stack">
        <p className="eyebrow">Step 3 of 4 · Coverage</p>
        <h1>Insurance coverage</h1>
        <p className="lede">Optional. Type the details from an insurance ID card, or upload a card or benefits summary. Both paths use the same fields. Nothing is saved until you confirm or skip.</p>
        <p><Link href="/onboarding/family">Edit people and relationships</Link></p>
        <CoverageStartChoices typeHref="/onboarding/coverage/manual" uploadHref="/onboarding/coverage/extract" />
        <CoverageSkipButton />
      </section>
    </Shell>
  );
}
