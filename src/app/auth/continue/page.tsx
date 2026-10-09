import { redirect } from "next/navigation";
import { currentActor } from "@/server/auth/current";
import { getContext } from "@/server/context";
import { getOnboarding, homeFor } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function ContinuePage() {
  const { actor } = await currentActor();
  if (!actor) redirect("/sign-in");
  if (!actor.emailVerified) redirect("/verify-email");
  const onboarding = await getOnboarding(getContext(), actor);
  redirect(homeFor(onboarding.onboarding.currentStep, true));
}
