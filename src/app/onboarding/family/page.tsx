import { Shell } from "@/components/app-shell";
import { FamilyForm } from "@/components/onboarding-forms";
import { loadSetup } from "../../load";

export const dynamic = "force-dynamic";

export default async function FamilyStepPage() {
  const { onboarding } = await loadSetup("family");
  return (
    <Shell>
      <section className="stack">
        <p className="eyebrow">Step 2 of 4 · Family</p>
        <h1>People, relationships, and permissions</h1>
        <p className="lede">Record each person, their birth date, how they relate to the primary account holder, and what a caregiver may see. Saving does not send an invitation.</p>
        <FamilyForm onboarding={onboarding} />
      </section>
    </Shell>
  );
}
