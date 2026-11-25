import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentUploadForm } from "@/components/app-actions";
import { VisitAskForm } from "@/components/visit-forms";
import { Notice } from "@/components/shell";
import { loadApp } from "../../../load";
import { getContext } from "@/server/context";
import { getVisit } from "@/server/domain/service";
import { HttpError } from "@/server/http/errors";
import {
  ALLERGY_SEVERITIES,
  DOCUMENT_KINDS,
  ENCOUNTER_MODALITIES,
  MEDICATION_KINDS,
  PROVIDER_ROLES,
} from "@/server/domain/validation";

export const dynamic = "force-dynamic";

export default async function VisitPage({ params }: { params: Promise<{ visitId: string }> }) {
  const { visitId } = await params;
  const { actor } = await loadApp();
  try {
    const view = await getVisit(getContext(), actor, visitId);
    const visit = view.visit;
    const when = visit.startTime ? `${visit.visitDate} at ${visit.startTime}` : visit.visitDate;
    const providerLine = [visit.provider, roleLabel(visit.providerRole)].filter(Boolean).join(" · ");
    return (
      <section className="stack">
        <p><Link href="/app/visits">Back to visits</Link></p>
        <p className="eyebrow">Visit</p>
        <h1>{visit.patientName}</h1>
        <p className="lede">{when}{providerLine ? ` · ${providerLine}` : ""}</p>
        <section className="card stack">
          <h2>Encounter details</h2>
          <p>{modalityLabel(visit.modality)}</p>
          {!visit.modality && !providerLine ? <p className="muted">No additional encounter details.</p> : null}
        </section>
        <section className="card stack">
          <h2>Patient health entry</h2>
          {visit.chiefComplaint ? <p>{visit.chiefComplaint}</p> : <p className="muted">No chief complaint recorded.</p>}
          <h3>Allergies and reactions</h3>
          {visit.allergies.length === 0 ? (
            <p className="muted">No allergies recorded.</p>
          ) : (
            <ul className="list">
              {visit.allergies.map((row) => (
                <li key={`${row.substance}-${row.severity}`}>{row.substance} · {severityLabel(row.severity)}</li>
              ))}
            </ul>
          )}
          <h3>Medication reconciliation</h3>
          {visit.medications.length === 0 ? (
            <p className="muted">No current medications recorded.</p>
          ) : (
            <ul className="list">
              {visit.medications.map((row) => (
                <li key={`${row.name}-${row.kind}`}>
                  {row.name}{row.dosage ? ` · ${row.dosage}` : ""} · {medicationKindLabel(row.kind)}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card stack">
          <h2>Documents</h2>
          <p className="muted">A visit can have more than one bill. Add later bills or adjusted bills from the provider here. Files stay private.</p>
          {view.documents.length === 0 ? (
            <Notice tone="info" title="No documents yet">Upload bills, adjusted bills, an explanation of benefits, or a receipt for this visit.</Notice>
          ) : (
            groupedDocuments(view.documents).map((group) => (
              <div className="stack" key={group.value}>
                <h3>{group.label}</h3>
                <ul className="list">
                  {group.files.map((file) => {
                    const meta = documentMeta(file);
                    return (
                      <li className="stack" key={file.id}>
                        <div className="split">
                          <span>{file.filename}</span>
                          <a href={`/api/documents/${file.id}`}>Download</a>
                        </div>
                        {meta ? <p className="muted">{meta}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
          {view.canUpload ? <DocumentUploadForm visitId={view.visit.id} storageConfigured={view.storageConfigured} /> : (
            <p className="muted">This account can view the visit but cannot add documents.</p>
          )}
        </section>
        <section className="card stack">
          <VisitAskForm visitId={view.visit.id} />
        </section>
      </section>
    );
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 403)) notFound();
    throw error;
  }
}

function roleLabel(value: string | null) {
  return PROVIDER_ROLES.find((item) => item.value === value)?.label ?? null;
}

function modalityLabel(value: string | null) {
  return ENCOUNTER_MODALITIES.find((item) => item.value === value)?.label ?? "Modality not recorded";
}

function severityLabel(value: string) {
  return ALLERGY_SEVERITIES.find((item) => item.value === value)?.label ?? value;
}

function medicationKindLabel(value: string) {
  return MEDICATION_KINDS.find((item) => item.value === value)?.label ?? value;
}

function groupedDocuments(
  documents: Array<{
    id: string;
    kind: string;
    filename: string;
    dueOn?: string | null;
    statedProvider?: string | null;
    memberNote?: string | null;
  }>,
) {
  return DOCUMENT_KINDS.map((kind) => ({
    ...kind,
    files: documents.filter((file) => file.kind === kind.value),
  })).filter((group) => group.files.length > 0);
}

function documentMeta(file: { dueOn?: string | null; statedProvider?: string | null; memberNote?: string | null }) {
  return [
    file.dueOn ? `Due ${file.dueOn}` : null,
    file.statedProvider,
    file.memberNote,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}
