import { Shell } from "@/components/shell";
import { CoverageForm } from "@/components/onboarding-forms";
import { loadSetup } from "../../load";

export const dynamic = "force-dynamic";

export default async function CoverageStepPage() {
  const { onboarding } = await loadSetup("coverage");
  return (
    <Shell>
      <section className="stack">
        <p className="muted">Step 3 of 4</p>
        <h1>Coverage you already know</h1>
        <p className="lede">This is optional. You type the details. Nothing is read from a card or a document.</p>
        <CoverageForm onboarding={onboarding} />
      </section>
    </Shell>
  );
}
