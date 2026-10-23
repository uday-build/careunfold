import { Shell } from "@/components/app-shell";
import { ProfileForm } from "@/components/onboarding-forms";
import { loadSetup } from "../../load";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { onboarding } = await loadSetup("profile");
  return (
    <Shell>
      <section className="stack">
        <p className="eyebrow">Step 1 of 4 · Primary account holder</p>
        <h1>Who is this account for?</h1>
        <p className="lede">The primary account holder administers the household. A patient profile is created for you only if you include yourself.</p>
        <ProfileForm onboarding={onboarding} />
      </section>
    </Shell>
  );
}
