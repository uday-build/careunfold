import { Shell } from "@/components/app-shell";
import { ReviewForm } from "@/components/onboarding-forms";
import { loadSetup } from "../../load";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const { onboarding } = await loadSetup("review");
  return (
    <Shell>
      <section className="stack">
        <p className="eyebrow">Step 4 of 4</p>
        <h1>Review and confirm</h1>
        <p className="lede">Confirming saves this setup. It does not grant access that is still pending, and it does not contact a provider.</p>
        <ReviewForm onboarding={onboarding} />
      </section>
    </Shell>
  );
}
