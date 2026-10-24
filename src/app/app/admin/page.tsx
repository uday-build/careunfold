import { Notice } from "@/components/shell";
import { AccessReviewList } from "@/components/admin-actions";
import { requireSiteAdmin } from "@/server/auth/current";
import { getContext } from "@/server/context";
import { listAccessRequests } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { actor } = await requireSiteAdmin();
  const listing = await listAccessRequests(getContext(), actor);
  const incoming = listing.users.filter((item) => item.accessStatus === "pending" && item.emailVerified && item.role !== "admin");
  return (
    <section className="stack">
      <p className="eyebrow">Admin</p>
      <h1>Incoming access requests</h1>
      <p className="lede">Approve or deny people who have registered. The workspace stays closed until you decide.</p>
      {incoming.length === 0 ? (
        <Notice tone="active" title="No incoming requests">Verified accounts waiting for a decision appear here.</Notice>
      ) : (
        <Notice tone="pending" title={`${incoming.length} waiting`}>
          Approving opens onboarding. Denying keeps the workspace closed.
        </Notice>
      )}
      {incoming.length > 0 ? <AccessReviewList users={incoming} currentUserId={actor.id} /> : null}
    </section>
  );
}
