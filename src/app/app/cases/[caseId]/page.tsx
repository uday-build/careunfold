import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentUploadForm } from "@/components/app-actions";
import { Notice } from "@/components/shell";
import { loadApp } from "../../../load";
import { getContext } from "@/server/context";
import { getVisit } from "@/server/domain/service";
import { HttpError } from "@/server/http/errors";

export const dynamic = "force-dynamic";

const kindLabel: Record<string, string> = {
  bill: "Bill",
  eob: "Explanation of benefits",
  receipt: "Receipt",
  other: "Other",
};

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const { actor } = await loadApp();
  try {
    const view = await getVisit(getContext(), actor, caseId);
    return (
      <section className="stack">
        <p><Link href="/app/cases">Back to cases</Link></p>
        <p className="eyebrow">Case</p>
        <h1>{view.visit.patientName}</h1>
        <p className="lede">{view.visit.visitDate}{view.visit.provider ? ` · ${view.visit.provider}` : ""}</p>
        <section className="card stack">
          <h2>Visit</h2>
          {view.visit.location ? <p>{view.visit.location}</p> : null}
          {view.visit.reason ? <p>{view.visit.reason}</p> : null}
          {!view.visit.location && !view.visit.reason ? <p className="muted">No additional visit notes.</p> : null}
        </section>
        <section className="card stack">
          <h2>Documents</h2>
          {view.documents.length === 0 ? (
            <Notice tone="info" title="No documents yet">Upload a bill, explanation of benefits, or receipt for this visit. Files stay private.</Notice>
          ) : (
            <ul className="list">
              {view.documents.map((file) => (
                <li className="split" key={file.id}>
                  <span>{kindLabel[file.kind] ?? file.kind} · {file.filename}</span>
                  <a href={`/api/documents/${file.id}`}>Download</a>
                </li>
              ))}
            </ul>
          )}
          {view.canUpload ? <DocumentUploadForm caseId={view.visit.id} storageConfigured={view.storageConfigured} /> : (
            <p className="muted">This account can view the visit but cannot add documents.</p>
          )}
        </section>
      </section>
    );
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
}
