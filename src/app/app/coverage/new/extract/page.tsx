import { CoverageExtractForm } from "@/components/coverage-forms";
import { loadApp } from "../../../../load";
import { getContext } from "@/server/context";
import { getHousehold } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function ExtractCoveragePage() {
  const { actor, onboarding } = await loadApp();
  const ctx = getContext();
  const household = await getHousehold(ctx, actor);
  const home = household.households[0];
  if (!home) {
    return (
      <section className="stack">
        <p className="muted">Coverage editing belongs to the household administrator.</p>
      </section>
    );
  }
  return (
    <section className="stack">
      <CoverageExtractForm
        onboarding={{ ...onboarding, patients: home.patients, coverage: home.coverage }}
        continueTo="/app/coverage"
        storageConfigured={ctx.storage.available}
      />
    </section>
  );
}
