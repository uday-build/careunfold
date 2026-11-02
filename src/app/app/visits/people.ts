import { loadApp } from "../../load";
import { getContext } from "@/server/context";
import { getHousehold } from "@/server/domain/service";

export async function loadVisitPeople() {
  const loaded = await loadApp();
  const household = await getHousehold(getContext(), loaded.actor);
  const patients = [
    ...household.households.flatMap((item) => item.patients),
    ...household.grantedPatients.map((grant) => ({
      id: grant.patientId,
      givenName: grant.givenName,
      familyName: grant.familyName,
    })),
  ].filter((person, index, list) => list.findIndex((item) => item.id === person.id) === index);
  const clinicians = household.households.flatMap((item) => item.clinicians ?? []).filter(
    (person, index, list) => list.findIndex((item) => item.id === person.id) === index,
  );
  return {
    ...loaded,
    patients: patients.map((person) => ({
      id: person.id,
      givenName: person.givenName,
      familyName: person.familyName,
    })),
    clinicians,
    storageConfigured: getContext().storage.available,
  };
}
