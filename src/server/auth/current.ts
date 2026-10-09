import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getContext } from "@/server/context";
import type { Actor } from "@/server/domain/access";
import { getOnboarding, homeFor } from "@/server/domain/service";

export async function currentActor(): Promise<{ actor: Actor | null }> {
  const context = getContext();
  const session = await context.auth.api.getSession({ headers: await headers() });
  if (!session) return { actor: null };
  return {
    actor: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      emailVerified: Boolean(session.user.emailVerified),
    },
  };
}

export async function requireVerifiedActor() {
  const { actor } = await currentActor();
  if (!actor) redirect("/sign-in");
  if (!actor.emailVerified) redirect("/verify-email");
  const context = getContext();
  const onboarding = await getOnboarding(context, actor);
  return { actor, context, onboarding: onboarding.onboarding, home: homeFor(onboarding.onboarding.currentStep, true) };
}
