import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/shell";
import { InvitationActions, RevokeButton } from "@/components/app-actions";
import { loadApp } from "../../../load";
import { getContext } from "@/server/context";
import { getPatient } from "@/server/domain/service";
import { HttpError } from "@/server/http/errors";

export const dynamic = "force-dynamic";

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  const { actor } = await loadApp();
  try {
    const result = await getPatient(getContext(), actor, patientId);
    const person = result.patient;
    const canAdminister = result.householdRole === "owner" || result.householdRole === "admin";
    return (
      <section className="stack">
        <p><Link href="/app/family">Back to family</Link></p>
        <h1>{person.givenName} {person.familyName}</h1>
        <Notice tone={person.status.code === "active" ? "active" : person.status.code === "revoked" ? "closed" : "pending"} title={person.status.label}>
          {person.status.detail}
        </Notice>
        <p>Relationship: {person.relationship.replaceAll("_", " ")}</p>
        {canAdminister ? <p>Birth date: {person.birthDate}</p> : null}
        {person.authorityReview ? (
          <Notice tone="pending" title="Representative authority is pending">
            Claimed relationship: {person.authorityReview.claimedAuthority}. Policy reference: {person.authorityReview.policyReference ?? "none"}. There is no approval action in this version.
          </Notice>
        ) : null}
        {canAdminister ? <InvitationActions invitation={person.invitation} /> : null}
        <h2>Access</h2>
        <ul className="list">
          {person.grants.map((grant) => (
            <li className="card stack" key={grant.userId}>
              <strong>{grant.displayName || grant.email}</strong>
              <div>{grant.status} · {grant.authorityBasis.replaceAll("_", " ")}</div>
              <div className="muted">{grant.scopes.join(", ")}</div>
              {canAdminister && grant.status === "active" ? (
                <RevokeButton patientId={person.id} userId={grant.userId} label="Revoke access" />
              ) : null}
            </li>
          ))}
        </ul>
        <section className="card stack">
          <h2>Records</h2>
          <p>
            {result.protectedRecords === "not_in_this_release"
              ? "Bills, explanations of benefits, and documents are not part of this version. There is nothing to upload or download."
              : "Protected records are unavailable for this profile."}
          </p>
        </section>
      </section>
    );
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}
