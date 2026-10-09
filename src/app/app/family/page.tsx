import { Notice } from "@/components/shell";
import { FamilyForm } from "@/components/onboarding-forms";
import { MemberAdmin, RemoveMemberButton } from "@/components/app-actions";
import { loadApp } from "../../load";
import { getContext } from "@/server/context";
import { getHousehold } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function FamilyPage() {
  const { actor, onboarding } = await loadApp();
  const household = await getHousehold(getContext(), actor);
  const home = household.households[0];
  return (
    <section className="stack">
      <h1>Family</h1>
      <Notice tone="info" title="Household administration is separate from patient access">
        Adding someone to the household does not let them open protected records. Access comes only from a self profile, an accepted invitation, or a policy-backed representative approval.
      </Notice>
      {home ? (
        <>
          <section className="card stack">
            <h2>{home.displayName}</h2>
            <p className="muted">Your household role: {home.yourAdminRole}. {home.administrationNote}</p>
            <ul className="list">
              {home.members.map((member) => (
                <li className="split" key={member.userId}>
                  <span>{member.displayName || member.email} · {member.adminRole}</span>
                  {home.yourAdminRole === "owner" && member.userId !== actor.id ? <RemoveMemberButton userId={member.userId} /> : null}
                </li>
              ))}
            </ul>
            {home.yourAdminRole === "owner" ? <MemberAdmin currentUserId={actor.id} /> : null}
          </section>
          <FamilyForm
            onboarding={{ ...onboarding, patients: home.patients, coverage: home.coverage }}
            continueTo="/app/family"
          />
        </>
      ) : (
        <p className="muted">You are not administering a household. Profiles shared with you appear on Home.</p>
      )}
    </section>
  );
}
