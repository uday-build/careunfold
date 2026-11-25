"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Notice, TextArea, TextField } from "@/components/shell";
import {
  DocumentOptionalDetails,
  DocumentTrustNote,
  EMPTY_DOCUMENT_DETAILS,
  type DocumentOptionalDetailsValue,
} from "@/components/document-upload";
import {
  ALLERGY_SEVERITIES,
  DOCUMENT_KINDS,
  ENCOUNTER_MODALITIES,
  MEDICATION_KINDS,
  PROVIDER_ROLES,
} from "@/server/domain/validation";

export type VisitPerson = { id: string; givenName: string; familyName: string };
export type VisitClinician = { id: string; displayName: string; role: string };

export type VisitDraft = {
  patientId: string;
  visitDate: string;
  startTime: string;
  provider: string;
  providerRole: string;
  modality: string;
  location: string;
  reason: string;
  chiefComplaint: string;
  allergies: Array<{ substance: string; severity: string }>;
  medications: Array<{ name: string; dosage: string | null; kind: string }>;
};

type AllergyRow = { key: string; substance: string; severity: string };
type MedicationRow = { key: string; name: string; dosage: string; kind: string };

export function VisitStartChoices() {
  return (
    <div className="choice-row">
      <Link className="choice" href="/app/visits/new/manual">
        <strong>Enter by hand</strong>
        <div className="muted">Type encounter details and pre-visit intake. You can change every field before saving.</div>
      </Link>
      <Link className="choice" href="/app/visits/new/extract">
        <strong>Fill from a document</strong>
        <div className="muted">Upload one or more bills, an adjusted bill, or an explanation. CareUnfold drafts the same fields. Nothing is saved until you confirm.</div>
      </Link>
    </div>
  );
}

export function VisitForm({
  patients,
  clinicians = [],
  initial,
  warnings = [],
  extracted,
  pendingFiles = [],
  pendingDetails = EMPTY_DOCUMENT_DETAILS,
  pendingEobFiles = [],
  documentKind,
  storageConfigured = false,
}: {
  patients: VisitPerson[];
  clinicians?: VisitClinician[];
  initial?: Partial<VisitDraft>;
  warnings?: string[];
  extracted?: boolean;
  pendingFiles?: File[];
  pendingDetails?: DocumentOptionalDetailsValue;
  pendingEobFiles?: File[];
  documentKind?: string;
  storageConfigured?: boolean;
}) {
  const router = useRouter();
  const [patientId, setPatientId] = useState(initial?.patientId ?? patients[0]?.id ?? "");
  const [visitDate, setVisitDate] = useState(initial?.visitDate ?? "");
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [providerRole, setProviderRole] = useState(() => initial?.providerRole || matchingClinician(initial?.provider ?? "", clinicians)?.role || "physician");
  const [selectedClinician, setSelectedClinician] = useState(() => matchingClinician(initial?.provider ?? "", clinicians)?.id ?? "");
  const [modality, setModality] = useState(initial?.modality || "in_person_outpatient");
  const [chiefComplaint, setChiefComplaint] = useState(initial?.chiefComplaint ?? initial?.reason ?? "");
  const [allergies, setAllergies] = useState<AllergyRow[]>(() => rowsFromAllergies(initial?.allergies));
  const [medications, setMedications] = useState<MedicationRow[]>(() => rowsFromMedications(initial?.medications));
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage("");
        const result = await api<{ visit: { id: string } }>("/api/visits", {
          method: "POST",
          idempotencyKey: crypto.randomUUID(),
          body: {
            patientId,
            visitDate,
            startTime,
            provider,
            providerRole: provider ? providerRole : null,
            modality,
            chiefComplaint,
            allergies: allergies
              .filter((row) => row.substance.trim())
              .map((row) => ({ substance: row.substance, severity: row.severity })),
            medications: medications
              .filter((row) => row.name.trim())
              .map((row) => ({ name: row.name, dosage: row.dosage, kind: row.kind })),
          },
        });
        if (!result.ok) {
          setPending(false);
          setMessage(result.data.error.message);
          return;
        }
        if (pendingFiles.length > 0 && storageConfigured) {
          const form = new FormData();
          form.set("kind", documentKind || "bill");
          for (const file of pendingFiles) form.append("file", file);
          if (pendingDetails.dueOn) form.set("dueOn", pendingDetails.dueOn);
          if (pendingDetails.statedProvider) form.set("statedProvider", pendingDetails.statedProvider);
          if (pendingDetails.memberNote) form.set("memberNote", pendingDetails.memberNote);
          for (const file of pendingEobFiles) form.append("eob", file);
          try {
            await fetch(`/api/visits/${result.data.visit.id}/documents`, {
              method: "POST",
              body: form,
              credentials: "same-origin",
            });
          } catch {
            // The visit is already saved. More documents can be added from the visit page.
          }
        }
        router.push(`/app/visits/${result.data.visit.id}`);
      }}
    >
      {extracted ? (
        <Notice tone="info" title="Drafted from the document">
          These fields are not saved yet. Change anything that is wrong, then save.
          {pendingFiles.length > 0
            ? ` ${pendingFiles.length === 1 ? "This file" : "These files"} will be stored with the visit: ${pendingFiles.map((file) => file.name).join(", ")}.`
            : ""}
        </Notice>
      ) : null}
      {warnings.map((warning) => (
        <Notice key={warning} tone="pending" title="Check this field">{warning}</Notice>
      ))}

      <fieldset className="card stack">
        <legend>Encounter details</legend>
        <label htmlFor="visit-patient">Patient</label>
        <select id="visit-patient" value={patientId} onChange={(event) => setPatientId(event.target.value)} required={patients.length > 0}>
          {patients.length === 0 ? <option value="">No patient profiles yet</option> : null}
          {patients.map((person) => (
            <option key={person.id} value={person.id}>{person.givenName} {person.familyName}</option>
          ))}
        </select>
        <div className="two">
          <TextField id="visitDate" label="Encounter date" type="date" value={visitDate} onChange={setVisitDate} required />
          <TextField id="startTime" label="Start time" type="time" value={startTime} onChange={setStartTime} required />
        </div>
        {clinicians.length > 0 ? (
          <>
            <label htmlFor="saved-clinician">Active clinicians, nurses, and therapists</label>
            <select
              id="saved-clinician"
              value={selectedClinician}
              onChange={(event) => {
                const id = event.target.value;
                setSelectedClinician(id);
                const found = clinicians.find((person) => person.id === id);
                if (found) {
                  setProvider(found.displayName);
                  setProviderRole(found.role);
                }
              }}
            >
              <option value="">Type a new name</option>
              {clinicians.map((person) => (
                <option key={person.id} value={person.id}>{person.displayName} · {roleLabel(person.role)}</option>
              ))}
            </select>
          </>
        ) : (
          <p className="muted">The first named clinician is saved to this household. Later visits can pick from that list.</p>
        )}
        <div className="two">
          <TextField id="provider" label="Care provider name" value={provider} onChange={(value) => { setProvider(value); setSelectedClinician(""); }} />
          <div className="field">
            <label htmlFor="providerRole">Role</label>
            <select id="providerRole" value={providerRole} onChange={(event) => setProviderRole(event.target.value)}>
              {PROVIDER_ROLES.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>
        </div>
        <fieldset className="stack">
          <legend>Encounter modality</legend>
          <div className="permission-list">
            {ENCOUNTER_MODALITIES.map((item) => (
              <label key={item.value} htmlFor={`modality-${item.value}`}>
                <input
                  id={`modality-${item.value}`}
                  type="radio"
                  name="modality"
                  checked={modality === item.value}
                  onChange={() => setModality(item.value)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>

      <fieldset className="card stack">
        <legend>Patient health entry (pre-visit intake)</legend>
        <TextArea id="chiefComplaint" label="Chief complaint, in the patient's own words" value={chiefComplaint} onChange={setChiefComplaint} />
        <div className="stack">
          <p>Allergies and reactions</p>
          <ul className="intake-rows">
            {allergies.map((row, index) => (
              <li className="intake-row" key={row.key}>
                <TextField id={`allergy-substance-${row.key}`} label="Substance" value={row.substance} onChange={(substance) => setAllergies((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, substance } : item)))} />
                <div className="field">
                  <label htmlFor={`allergy-severity-${row.key}`}>Reaction severity</label>
                  <select
                    id={`allergy-severity-${row.key}`}
                    value={row.severity}
                    onChange={(event) => setAllergies((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, severity: event.target.value } : item)))}
                  >
                    {ALLERGY_SEVERITIES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <button className="danger" type="button" onClick={() => setAllergies((current) => current.filter((item) => item.key !== row.key))}>Remove</button>
              </li>
            ))}
          </ul>
          <button className="secondary" type="button" onClick={() => setAllergies((current) => [...current, emptyAllergy(nextRowIndex(current, "allergy"))])}>Add an allergy</button>
        </div>
        <div className="stack">
          <p>Medication reconciliation</p>
          <p className="muted">List active prescriptions, supplements, and dosages currently taken.</p>
          <ul className="intake-rows">
            {medications.map((row, index) => (
              <li className="intake-row" key={row.key}>
                <TextField id={`medication-name-${row.key}`} label="Name" value={row.name} onChange={(name) => setMedications((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, name } : item)))} />
                <TextField id={`medication-dosage-${row.key}`} label="Dosage" value={row.dosage} onChange={(dosage) => setMedications((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, dosage } : item)))} />
                <div className="field">
                  <label htmlFor={`medication-kind-${row.key}`}>Type</label>
                  <select
                    id={`medication-kind-${row.key}`}
                    value={row.kind}
                    onChange={(event) => setMedications((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, kind: event.target.value } : item)))}
                  >
                    {MEDICATION_KINDS.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </div>
                <button className="danger" type="button" onClick={() => setMedications((current) => current.filter((item) => item.key !== row.key))}>Remove</button>
              </li>
            ))}
          </ul>
          <button className="secondary" type="button" onClick={() => setMedications((current) => [...current, emptyMedication(nextRowIndex(current, "medication"))])}>Add a medication</button>
        </div>
      </fieldset>

      {message ? <p className="form-error" role="alert">Error: {message}</p> : null}
      <button className="primary" type="submit" disabled={pending || patients.length === 0}>
        {pending ? "Saving" : extracted ? "Confirm and save visit" : "Save visit"}
      </button>
    </form>
  );
}

export function VisitExtractForm({
  patients,
  clinicians = [],
  storageConfigured,
}: {
  patients: VisitPerson[];
  clinicians?: VisitClinician[];
  storageConfigured: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("bill");
  const [files, setFiles] = useState<File[]>([]);
  const [details, setDetails] = useState<DocumentOptionalDetailsValue>(EMPTY_DOCUMENT_DETAILS);
  const [eobFiles, setEobFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<(VisitDraft & { warnings: string[] }) | null>(null);

  if (draft) {
    return (
      <div className="stack">
        <p><Link href="/app/visits/new">Back to add a visit</Link></p>
        <p className="eyebrow">New visit · From a document</p>
        <h1>Review visit details</h1>
        <p className="lede">These are the same encounter and intake fields as the manual form. Change anything that is wrong, then confirm. Nothing is saved until you confirm.</p>
        <VisitForm
          key={`${draft.patientId}-${draft.visitDate}-${draft.provider}`}
          patients={patients}
          clinicians={clinicians}
          initial={draft}
          warnings={draft.warnings}
          extracted
          pendingFiles={files}
          pendingDetails={details}
          pendingEobFiles={eobFiles}
          documentKind={kind}
          storageConfigured={storageConfigured}
        />
        <button className="secondary" type="button" onClick={() => { setDraft(null); setMessage(""); setDetails(EMPTY_DOCUMENT_DETAILS); setEobFiles([]); }}>
          Choose different documents
        </button>
      </div>
    );
  }

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        const selected = files.length > 0
          ? files
          : Array.from((event.currentTarget.elements.namedItem("file") as HTMLInputElement | null)?.files ?? []);
        const primary = selected[0];
        if (!primary) {
          setMessage("Choose a file to upload.");
          return;
        }
        setPending(true);
        setMessage("");
        const body = new FormData();
        body.set("file", primary);
        let response: Response;
        try {
          response = await fetch("/api/visits/extract", { method: "POST", body, credentials: "same-origin" });
        } catch {
          setPending(false);
          setMessage("We couldn't reach CareUnfold. Nothing was saved.");
          return;
        }
        const data = (await response.json()) as {
          draft?: VisitDraft & { warnings: string[] };
          error?: { message: string };
        };
        setPending(false);
        if (!response.ok || !data.draft) {
          setMessage(data.error?.message ?? "The document could not be read. Nothing was saved.");
          return;
        }
        setFiles(selected);
        setDraft(data.draft);
      }}
    >
      <p><Link href="/app/visits/new">Back to add a visit</Link></p>
      <p className="eyebrow">New visit · From a document</p>
      <h1>Upload documents</h1>
      <p className="lede">CareUnfold reads the first file and fills the same encounter and intake fields you would type by hand. Additional bills stay queued and are stored when you confirm. You can add adjusted bills after the visit is saved.</p>
      {pending ? <Notice tone="info" title="Reading the document">This can take a few seconds. The visit is not saved yet.</Notice> : null}
      <label htmlFor="extract-kind">Document type</label>
      <select id="extract-kind" value={kind} onChange={(event) => setKind(event.target.value)}>
        {DOCUMENT_KINDS.map((item) => (
          <option key={item.value} value={item.value}>{item.label}</option>
        ))}
      </select>
      <label htmlFor="extract-file">Files (PDF or image, 4 MB or smaller each)</label>
      <input
        id="extract-file"
        name="file"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        multiple
        required
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
      />
      <p className="muted">Supported files: PDF, JPEG, PNG, or WebP. The first file is read into the draft. Extra files of this type are stored with the visit after you confirm.</p>
      {files.length > 1 ? <p role="status">{files.length} files selected. The first file is used to draft the visit.</p> : null}
      <DocumentTrustNote />
      <DocumentOptionalDetails
        value={details}
        onChange={setDetails}
        eobFiles={eobFiles}
        onEobFiles={setEobFiles}
        showEob={kind !== "eob"}
      />
      {message ? <p className="form-error" role="alert">Error: {message}</p> : null}
      <div className="actions">
        <button className="primary" type="submit" disabled={pending || patients.length === 0}>{pending ? "Reading" : "Read document"}</button>
        <Link className="secondary" href="/app/visits/new/manual">Enter by hand instead</Link>
      </div>
    </form>
  );
}

export function VisitAskForm({ visitId }: { visitId: string }) {
  const [request, setRequest] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<AskResult | null>(null);

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setMessage("");
        const response = await api<AskResult>(`/api/visits/${visitId}/ask`, {
          method: "POST",
          body: { request },
        });
        setPending(false);
        if (!response.ok) {
          setResult(null);
          setMessage(response.data.error.message);
          return;
        }
        setResult(response.data);
      }}
    >
      <h2>Look into a charge</h2>
      <p className="muted">Ask about a charge, a missing payment, or a correction. CareUnfold classifies the request, reads the bills and adjusted bills attached to this visit when needed, and compares them with typed plan details. Nothing is sent to an insurer, and the result is not saved on the visit.</p>
      <TextArea id="visit-ask" label="What do you want to look into?" value={request} onChange={setRequest} required />
      {pending ? <Notice tone="info" title="Looking into this">This can take a little while. Nothing is saved yet.</Notice> : null}
      {message ? <p className="form-error" role="alert">Error: {message}</p> : null}
      {result ? <AskResultView result={result} /> : null}
      <button className="primary" type="submit" disabled={pending || !request.trim()}>{pending ? "Looking" : "Look into this"}</button>
    </form>
  );
}

function AskResultView({ result }: { result: AskResult }) {
  const issue = ISSUE_LABELS[result.classification.issue] ?? result.classification.issue;
  return (
    <div className="stack">
      <Notice tone={result.classification.uncertain ? "pending" : "info"} title={issue}>
        {result.classification.uncertain
          ? "The classifier is not sure enough to route this automatically."
          : `Confidence ${Math.round(result.classification.confidence * 100)}%.`}
      </Notice>
      {result.message ? <p>{result.message}</p> : null}
      {result.investigation ? (
        <>
          <p><strong>{FINDING_LABELS[result.investigation.finding]}</strong></p>
          {result.investigation.explanations.length > 0 ? (
            <>
              <p>Possible explanations</p>
              <ul className="list">
                {result.investigation.explanations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
          {result.investigation.missingInformation.length > 0 ? (
            <>
              <p>Missing information</p>
              <ul className="list">
                {result.investigation.missingInformation.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
          {result.investigation.assumptions.length > 0 ? (
            <>
              <p>Assumptions</p>
              <ul className="list">
                {result.investigation.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const ISSUE_LABELS: Record<string, string> = {
  explain_charge: "Explain this charge",
  payment_missing: "Payment missing",
  track_correction: "Track a correction",
  other: "Something else",
};

const FINDING_LABELS: Record<string, string> = {
  matches_available_records: "Matches the records on file",
  possible_discrepancy: "Possible discrepancy",
  insufficient_information: "Not enough information",
};

type AskResult = {
  classification: {
    issue: string;
    confidence: number;
    uncertain: boolean;
    route: string;
  };
  investigation: {
    finding: string;
    explanations: string[];
    missingInformation: string[];
    assumptions: string[];
  } | null;
  message: string | null;
};

function matchingClinician(provider: string, clinicians: VisitClinician[]) {
  const needle = provider.trim().toLowerCase();
  if (!needle) return null;
  return clinicians.find((person) => person.displayName.trim().toLowerCase() === needle)
    ?? clinicians.find((person) => {
      const name = person.displayName.trim().toLowerCase();
      return name.includes(needle) || needle.includes(name);
    })
    ?? null;
}

function nextRowIndex(rows: Array<{ key: string }>, prefix: string) {
  const used = rows.map((row) => Number(row.key.slice(prefix.length + 1))).filter((value) => Number.isFinite(value));
  return Math.max(-1, ...used) + 1;
}

function emptyAllergy(index: number): AllergyRow {
  return { key: `allergy-${index}`, substance: "", severity: "mild" };
}

function emptyMedication(index: number): MedicationRow {
  return { key: `medication-${index}`, name: "", dosage: "", kind: "prescription" };
}

function rowsFromAllergies(rows?: Array<{ substance: string; severity: string }>) {
  if (!rows?.length) return [emptyAllergy(0)];
  return rows.map((row, index) => ({ key: `allergy-${index}`, substance: row.substance, severity: row.severity }));
}

function rowsFromMedications(rows?: Array<{ name: string; dosage: string | null; kind: string }>) {
  if (!rows?.length) return [emptyMedication(0)];
  return rows.map((row, index) => ({
    key: `medication-${index}`,
    name: row.name,
    dosage: row.dosage ?? "",
    kind: row.kind,
  }));
}

function roleLabel(value: string) {
  return PROVIDER_ROLES.find((item) => item.value === value)?.label ?? value;
}
