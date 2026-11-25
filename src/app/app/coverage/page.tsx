import Link from "next/link";
import { Notice } from "@/components/shell";
import { loadApp } from "../../load";
import { getContext } from "@/server/context";
import { getHousehold } from "@/server/domain/service";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  const { actor } = await loadApp();
  const household = await getHousehold(getContext(), actor);
  const home = household.households[0];
  const records = home?.coverage ?? [];
  return (
    <section className="stack">
      <p className="eyebrow">Coverage</p>
      <h1>Coverage</h1>
      <p className="lede">Insurance ID cards and typed plan details. Add a card by hand or from a document. Saving here does not contact an insurer.</p>
      {!home ? (
        <p className="muted">Coverage editing belongs to the household administrator. Access to a person does not include this household’s coverage list.</p>
      ) : records.length === 0 ? (
        <>
          <Notice tone="info" title="No coverage yet">There are no insurance records on file. You can type an ID card or upload a photo of one.</Notice>
          <p>
            <Link className="button" href="/app/coverage/new">Add coverage</Link>
          </p>
        </>
      ) : (
        <>
          <div className="actions">
            <Link className="button" href="/app/coverage/new">Add coverage</Link>
            <Link className="secondary" href="/app/coverage/edit">Edit typed details</Link>
          </div>
          <ul className="list">
            {records.map((record) => (
              <li className="card stack" key={record.id ?? record.clientKey}>
                <strong>{[record.insurer, record.planName].filter(Boolean).join(" · ") || "Insurance ID card"}</strong>
                <p className="muted">
                  {[
                    record.subscriberName,
                    record.groupNumber ? `Group ${record.groupNumber}` : null,
                    record.memberIdMasked ? `Member ${record.memberIdMasked}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {record.documents && record.documents.length > 0 ? (
                  <ul className="list">
                    {record.documents.map((file: { id: string; filename: string }) => (
                      <li className="split" key={file.id}>
                        <span>{file.filename}</span>
                        <a href={`/api/documents/${file.id}`}>Download</a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
