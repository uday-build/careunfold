import Link from "next/link";
import { CoverageForm } from "@/components/onboarding-forms";
import { loadApp } from "../../../../load";
import { getContext } from "@/server/context";
import { getHousehold } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function ManualCoveragePage() {
  const { actor, onboarding } = await loadApp();
  const household = await getHousehold(getContext(), actor);
  const home = household.households[0];
  return (
    <section className="stack">
      <p><Link href="/app/coverage/new">Back to add coverage</Link></p>
      <p className="eyebrow">New coverage · By hand</p>
      <h1>Type coverage details</h1>
      <p className="lede">Enter Group ID, member name, and member ID from the card. Other sections are optional.</p>
      {home ? (
        <CoverageForm
          onboarding={{ ...onboarding, patients: home.patients, coverage: [] }}
          continueTo="/app/coverage"
          allowSkip={false}
        />
      ) : (
        <p className="muted">Coverage editing belongs to the household administrator.</p>
      )}
    </section>
  );
}
