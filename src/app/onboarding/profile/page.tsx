import { Shell } from "@/components/app-shell";
import { ProfileForm } from "@/components/onboarding-forms";
import { loadSetup } from "../../load";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { onboarding } = await loadSetup("profile");
  return (
    <Shell>
      <section className="stack">
        <p className="eyebrow">Step 1 of 4</p>
        <h1>Your account</h1>
        <p className="lede">Your name is saved on the server. Choosing “someone else” does not create a patient profile for you.</p>
        <ProfileForm onboarding={onboarding} />
      </section>
    </Shell>
  );
}
