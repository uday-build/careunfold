import { Shell } from "@/components/app-shell";
import { FamilyForm } from "@/components/onboarding-forms";
import { loadSetup } from "../../load";

export const dynamic = "force-dynamic";

export default async function FamilyStepPage() {
  const { onboarding } = await loadSetup("family");
  return (
    <Shell>
      <section className="stack">
        <p className="eyebrow">Step 2 of 4</p>
        <h1>People in this household</h1>
        <p className="lede">Saving a person does not send an invitation. Adult access stays pending until they accept. Representative authority stays pending until a policy authorizes it.</p>
        <FamilyForm onboarding={onboarding} />
      </section>
    </Shell>
  );
}
