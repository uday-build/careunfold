import { Shell } from "@/components/app-shell";
import { CoverageExtractForm } from "@/components/coverage-forms";
import { loadSetup } from "../../../load";
import { getContext } from "@/server/context";

export const dynamic = "force-dynamic";

export default async function ExtractCoverageStepPage() {
  const { onboarding } = await loadSetup("coverage");
  return (
    <Shell>
      <section className="stack">
        <CoverageExtractForm
          onboarding={onboarding}
          continueTo="/onboarding/review"
          storageConfigured={getContext().storage.available}
          backHref="/onboarding/coverage"
        />
      </section>
    </Shell>
  );
}
