import Link from "next/link";
import { Notice } from "@/components/shell";
import { loadApp } from "../../load";
import { getContext } from "@/server/context";
import { listVisits } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function CasesPage() {
  const { actor } = await loadApp();
  const { visits } = await listVisits(getContext(), actor);
  return (
    <section className="stack">
      <p className="eyebrow">Cases</p>
      <h1>Cases</h1>
      <p className="lede">Each case starts with the details of one visit. Documents can be added after that visit is saved.</p>
      <p>
        <Link className="button" href="/app/cases/new">Start a case</Link>
      </p>
      {visits.length === 0 ? (
        <Notice tone="info" title="No cases yet">There are no visits on file. Starting a case does not contact a provider or create a bill.</Notice>
      ) : (
        <ul className="list">
          {visits.map((item) => (
            <li className="card split" key={item.id}>
              <div>
                <strong>{item.patientName}</strong>
                <div className="muted">{item.visitDate}{item.provider ? ` · ${item.provider}` : ""}</div>
              </div>
              <Link href={`/app/cases/${item.id}`}>Open case</Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
