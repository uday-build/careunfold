import Link from "next/link";
import { Shell } from "@/components/app-shell";
import { CoverageForm } from "@/components/onboarding-forms";
import { loadSetup } from "../../load";

export const dynamic = "force-dynamic";

export default async function CoverageStepPage() {
  const { onboarding } = await loadSetup("coverage");
  return (
    <Shell>
      <section className="stack">
        <p className="eyebrow">Step 3 of 4 · Coverage</p>
        <h1>Insurance coverage</h1>
        <p className="lede">Optional. Type the insurer, subscriber and member identifiers, coverage dates, and the plan benefits you already know. Nothing is read from a card.</p>
        <p><Link href="/onboarding/family">Edit people and relationships</Link></p>
        <CoverageForm onboarding={onboarding} />
      </section>
    </Shell>
  );
}
