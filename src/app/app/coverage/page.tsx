import { CoverageForm } from "@/components/onboarding-forms";
import { Notice } from "@/components/shell";
import { loadApp } from "../../load";
import { getContext } from "@/server/context";
import { getHousehold } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  const { actor, onboarding } = await loadApp();
  const household = await getHousehold(getContext(), actor);
  const home = household.households[0];
  return (
    <section className="stack">
      <h1>Coverage</h1>
      <Notice tone="info" title="Typed coverage only">Member IDs are masked in lists. Skipping or saving here does not read a card or contact an insurer.</Notice>
      {home ? (
        <CoverageForm
          onboarding={{ ...onboarding, patients: home.patients, coverage: home.coverage }}
          continueTo="/app/coverage"
        />
      ) : (
        <p className="muted">Coverage editing belongs to the household administrator. Access to a person does not include this household’s coverage list.</p>
      )}
    </section>
  );
}
