import Link from "next/link";
import { Shell, Notice } from "@/components/shell";
import { InvitationResponse } from "@/components/app-actions";
import { currentActor } from "@/server/auth/current";
import { getContext } from "@/server/context";
import { previewInvitation } from "@/server/domain/service";
import { HttpError } from "@/server/http/errors";

export const dynamic = "force-dynamic";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { actor } = await currentActor();
  try {
    const preview = await previewInvitation(getContext(), actor, token);
    const next = `/invitations/${token}`;
    return (
      <Shell>
        <section className="hero stack">
          <h1>Invitation</h1>
          <p>{preview.invitation.requesterName} asked to organize care information for {preview.invitation.patientGivenName}.</p>
          <p>Requested access: {preview.invitation.scopeLabels.join(", ")}.</p>
          <Notice tone="pending" title="Nothing is granted until you accept">Rejecting closes this invitation. It cannot be reused.</Notice>
          {!preview.invitation.signedIn ? <p><Link href={`/sign-in?next=${encodeURIComponent(next)}`}>Sign in to respond</Link></p> : null}
          {preview.invitation.signedIn && !preview.invitation.emailVerified ? <p><Link href="/verify-email">Verify your email before responding</Link></p> : null}
          {preview.invitation.signedIn && preview.invitation.emailVerified && !preview.invitation.emailMatches ? (
            <Notice tone="closed" title="This invitation is for a different email">Sign in with the email address that received this invitation.</Notice>
          ) : null}
          {preview.invitation.emailMatches && preview.invitation.emailVerified ? <InvitationResponse token={token} /> : null}
        </section>
      </Shell>
    );
  } catch (error) {
    const message = error instanceof HttpError ? error.message : "This invitation is not available.";
    return (
      <Shell>
        <section className="hero stack">
          <h1>Invitation unavailable</h1>
          <Notice tone="closed" title={message}>You can return home and sign in with your own account.</Notice>
          <Link href="/">Home</Link>
        </section>
      </Shell>
    );
  }
}
