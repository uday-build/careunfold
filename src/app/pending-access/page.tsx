import { redirect } from "next/navigation";
import { Shell } from "@/components/app-shell";
import { Notice } from "@/components/shell";
import { currentActor } from "@/server/auth/current";

export const dynamic = "force-dynamic";

export default async function PendingAccessPage() {
  const { actor } = await currentActor();
  if (!actor) redirect("/sign-in");
  if (!actor.emailVerified) redirect("/verify-email");
  if (actor.accessStatus === "approved") redirect("/auth/continue");
  const denied = actor.accessStatus === "denied";
  return (
    <Shell>
      <section className="hero stack">
        <p className="eyebrow">Access review</p>
        <h1>{denied ? "Access was not approved" : "Waiting for approval"}</h1>
        {denied ? (
          <Notice tone="closed" title="This account cannot open the workspace">
            Registration was stored. An administrator did not approve access. You can sign out and use a different account if you were given one.
          </Notice>
        ) : (
          <Notice tone="pending" title="Your account is stored and waiting">
            You can register with Google or with email and password. Opening CareUnfold stays closed until an administrator approves access. Nothing in the workspace is available yet.
          </Notice>
        )}
        <p className="muted">Signed in as {actor.email}.</p>
      </section>
    </Shell>
  );
}
