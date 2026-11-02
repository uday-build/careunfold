import Link from "next/link";
import { Notice } from "@/components/shell";
import { loadApp } from "../../load";
import { getContext } from "@/server/context";
import { listVisits } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function VisitsPage() {
  const { actor } = await loadApp();
  const { visits } = await listVisits(getContext(), actor);
  return (
    <section className="stack">
      <p className="eyebrow">Visits</p>
      <h1>Visits</h1>
      <p className="lede">Every visit starts here. Open a previous visit, or add a new one.</p>
      {visits.length === 0 ? (
        <>
          <Notice tone="info" title="No visits yet">There are no visits on file. Adding a visit does not contact a provider or create a bill.</Notice>
          <p>
            <Link className="button" href="/app/visits/new">Add a visit</Link>
          </p>
        </>
      ) : (
        <>
          <p>
            <Link className="button" href="/app/visits/new">Add a visit</Link>
          </p>
          <ul className="list">
            {visits.map((item) => (
              <li className="card split" key={item.id}>
                <div>
                  <strong>{item.patientName}</strong>
                  <div className="muted">{item.startTime ? `${item.visitDate} at ${item.startTime}` : item.visitDate}{item.provider ? ` · ${item.provider}` : ""}</div>
                </div>
                <Link href={`/app/visits/${item.id}`}>Open visit</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
