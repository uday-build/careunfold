import { Notice } from "@/components/shell";
import { AccessReviewList } from "@/components/admin-actions";
import { requireSiteAdmin } from "@/server/auth/current";
import { getContext } from "@/server/context";
import { listAccessRequests } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { actor } = await requireSiteAdmin();
  const listing = await listAccessRequests(getContext(), actor);
  const pending = listing.users.filter((item) => item.accessStatus === "pending" && item.emailVerified);
  return (
    <section className="stack">
      <p className="eyebrow">Administration</p>
      <h1>Access review</h1>
      <p className="lede">People can register with Google or email. They cannot open the workspace until you approve them.</p>
      {pending.length === 0 ? (
        <Notice tone="active" title="No verified accounts are waiting">New registrations appear here after email verification or a Google sign-in.</Notice>
      ) : (
        <Notice tone="pending" title={`${pending.length} waiting for a decision`}>
          Approving opens onboarding for that account. Denying keeps the workspace closed.
        </Notice>
      )}
      <AccessReviewList users={listing.users} currentUserId={actor.id} />
    </section>
  );
}
