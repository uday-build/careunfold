import Link from "next/link";
import { Shell } from "@/components/app-shell";
import { CoverageForm } from "@/components/onboarding-forms";
import { loadSetup } from "../../../load";

export const dynamic = "force-dynamic";

export default async function ManualCoverageStepPage() {
  const { onboarding } = await loadSetup("coverage");
  return (
    <Shell>
      <section className="stack">
        <p><Link href="/onboarding/coverage">Back to add coverage</Link></p>
        <p className="eyebrow">Step 3 of 4 · Coverage</p>
        <h1>Type coverage details</h1>
        <p className="lede">Enter Group ID, member name, and member ID from the card. Other sections are optional.</p>
        <CoverageForm onboarding={onboarding} />
      </section>
    </Shell>
  );
}
