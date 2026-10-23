import Link from "next/link";
import { CaseStartForm } from "@/components/app-actions";
import { Notice } from "@/components/shell";
import { loadApp } from "../../../load";
import { getContext } from "@/server/context";
import { getHousehold } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function NewCasePage() {
  const { actor } = await loadApp();
  const household = await getHousehold(getContext(), actor);
  const patients = [
    ...household.households.flatMap((item) => item.patients),
    ...household.grantedPatients.map((grant) => ({
      id: grant.patientId,
      givenName: grant.givenName,
      familyName: grant.familyName,
    })),
  ].filter((person, index, list) => list.findIndex((item) => item.id === person.id) === index);
  return (
    <section className="stack">
      <p><Link href="/app/cases">Back to cases</Link></p>
      <p className="eyebrow">New case</p>
      <h1>Visit details</h1>
      <p className="lede">A case begins with who was seen, when, and where. Saving a visit is not enabled yet.</p>
      <Notice tone="info" title="Visit first">Upload, comparison, and a draft question stay closed until visit details can be kept.</Notice>
      <CaseStartForm
        patients={patients.map((person) => ({
          id: person.id,
          givenName: person.givenName,
          familyName: person.familyName,
        }))}
      />
    </section>
  );
}
