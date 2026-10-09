import Link from "next/link";
import { Notice } from "@/components/shell";
import { loadApp } from "../load";
import { getContext } from "@/server/context";
import { getHousehold } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { actor } = await loadApp();
  const household = await getHousehold(getContext(), actor);
  const patients = household.households.flatMap((item) => item.patients);
  const tasks = patients.flatMap((person) => person.tasks);
  return (
    <section className="stack">
      <h1>Home</h1>
      <p className="lede">Saved family setup and access tasks. There are no balances, bills, or documents in this version.</p>
      {household.households.some((item) => item.origin === "synthetic_fixture") ? (
        <Notice tone="info" title="Synthetic fixture">This household was loaded for development. It is not a live care record.</Notice>
      ) : null}
      {tasks.length === 0 ? <Notice tone="active" title="No pending access tasks">Profiles you can open are listed below.</Notice> : null}
      <ul className="list">
        {tasks.map((task) => (
          <li key={`${task.patientId}-${task.code}`}>
            <Notice tone="pending" title={task.label}>{task.detail}</Notice>
          </li>
        ))}
      </ul>
      <ul className="list">
        {patients.map((person) => (
          <li className="card split" key={person.id}>
            <div>
              <strong>{person.givenName} {person.familyName}</strong>
              <div className="muted">{person.status.label}</div>
            </div>
            <Link href={`/app/family/${person.id}`}>Open profile</Link>
          </li>
        ))}
        {household.grantedPatients
          .filter((grant) => !patients.some((person) => person.id === grant.patientId))
          .map((grant) => (
            <li className="card split" key={grant.patientId}>
              <div>
                <strong>{grant.givenName} {grant.familyName}</strong>
                <div className="muted">Access through an accepted relationship</div>
              </div>
              <Link href={`/app/family/${grant.patientId}`}>Open profile</Link>
            </li>
          ))}
      </ul>
      {patients.length === 0 && household.grantedPatients.length === 0 ? <p className="muted">No people are saved yet.</p> : null}
    </section>
  );
}
