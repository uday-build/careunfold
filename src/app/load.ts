import { redirect } from "next/navigation";
import { requireVerifiedActor } from "@/server/auth/current";
import { getContext } from "@/server/context";
import { getPublicConfig } from "@/server/domain/service";

const order = ["profile", "family", "coverage", "review", "complete"] as const;

export async function loadPublicConfig() {
  const config = await getPublicConfig(getContext());
  return {
    googleSignIn: config.googleSignIn,
    emailDelivery: config.emailDelivery,
  };
}

export async function loadSetup(step: "profile" | "family" | "coverage" | "review") {
  const loaded = await requireVerifiedActor();
  const current = loaded.onboarding.currentStep;
  if (current === "complete") redirect("/app");
  if (order.indexOf(step) > order.indexOf(current)) redirect(`/onboarding/${current}`);
  return loaded;
}

export async function loadApp() {
  const loaded = await requireVerifiedActor();
  if (loaded.onboarding.currentStep !== "complete") redirect(loaded.home);
  return loaded;
}
