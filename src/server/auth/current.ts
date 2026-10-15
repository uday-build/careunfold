import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getContext } from "@/server/context";
import { loadActor, type Actor } from "@/server/domain/access";
import { getOnboarding, homeFor } from "@/server/domain/service";

export async function currentActor(): Promise<{ actor: Actor | null }> {
  const context = getContext();
  const session = await context.auth.api.getSession({ headers: await headers() });
  if (!session) return { actor: null };
  return {
    actor: await loadActor(context.db, context.env, session.user, context.now()),
  };
}

export async function requireVerifiedActor() {
  const { actor } = await currentActor();
  if (!actor) redirect("/sign-in");
  if (!actor.emailVerified) redirect("/verify-email");
  if (actor.accessStatus !== "approved") redirect("/pending-access");
  const context = getContext();
  const onboarding = await getOnboarding(context, actor);
  return { actor, context, onboarding: onboarding.onboarding, home: homeFor(onboarding.onboarding.currentStep, actor) };
}

export async function requireSiteAdmin() {
  const loaded = await requireVerifiedActor();
  if (loaded.actor.role !== "admin") redirect("/app");
  return loaded;
}
