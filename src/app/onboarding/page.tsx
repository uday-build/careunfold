import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/app-shell";
import { Notice } from "@/components/shell";
import { requireVerifiedActor } from "@/server/auth/current";

export const dynamic = "force-dynamic";

const steps = [
  { name: "Primary account holder", detail: "Your name, and whether you are a patient, a caregiver, or both." },
  { name: "Family and permissions", detail: "People, birth dates, relationships, and what a caregiver may see." },
  { name: "Coverage", detail: "Insurer, member identifiers, dates, and the benefits you already know." },
  { name: "Review", detail: "Confirm the household. Pending invitations and authority reviews stay pending." },
];

export default async function OnboardingStartPage() {
  const loaded = await requireVerifiedActor();
  if (loaded.onboarding.currentStep === "complete") redirect("/app");
  if (loaded.onboarding.currentStep !== "profile") redirect(`/onboarding/${loaded.onboarding.currentStep}`);
  return (
    <Shell>
      <section className="stack">
        <p className="eyebrow">Family setup</p>
        <h1>Set up your family</h1>
        <p className="lede">
          Access is approved. CareUnfold now needs the people in this household, how they are related, and any coverage you already know. You can finish with yourself alone, or add patients and caregivers.
        </p>
        <Notice tone="info" title="Nothing is sent automatically">
          Saving a person does not send an invitation. Coverage is typed by you. Consequential actions stay with you.
        </Notice>
        <ol className="stage-grid">
          {steps.map((step, index) => (
            <li className="card stack" key={step.name}>
              <span className="eyebrow">{String(index + 1).padStart(2, "0")}</span>
              <h2>{step.name}</h2>
              <p className="muted">{step.detail}</p>
            </li>
          ))}
        </ol>
        <div className="actions">
          <Link className="button" href="/onboarding/profile">Start family setup</Link>
        </div>
      </section>
    </Shell>
  );
}
