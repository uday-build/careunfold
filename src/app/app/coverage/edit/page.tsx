import Link from "next/link";
import { CoverageForm } from "@/components/onboarding-forms";
import { loadApp } from "../../../load";
import { getContext } from "@/server/context";
import { getHousehold } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function EditCoveragePage() {
  const { actor, onboarding } = await loadApp();
  const household = await getHousehold(getContext(), actor);
  const home = household.households[0];
  return (
    <section className="stack">
      <p><Link href="/app/coverage">Back to coverage</Link></p>
      <p className="eyebrow">Coverage</p>
      <h1>Edit typed details</h1>
      <p className="lede">Change any saved ID card or benefits field. Member IDs are masked in lists. Saving here does not contact an insurer.</p>
      {home ? (
        <CoverageForm
          onboarding={{ ...onboarding, patients: home.patients, coverage: home.coverage }}
          continueTo="/app/coverage"
          allowSkip={false}
        />
      ) : (
        <p className="muted">Coverage editing belongs to the household administrator.</p>
      )}
    </section>
  );
}
