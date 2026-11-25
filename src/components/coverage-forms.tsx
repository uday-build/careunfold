"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Notice } from "@/components/shell";
import { DocumentTrustNote } from "@/components/document-upload";
import { CoverageForm, type CoverageDraft, type Onboarding } from "@/components/onboarding-forms";

export function CoverageStartChoices({
  typeHref = "/app/coverage/new/manual",
  uploadHref = "/app/coverage/new/extract",
}: {
  typeHref?: string;
  uploadHref?: string;
}) {
  return (
    <div className="choice-row">
      <Link className="choice" href={typeHref}>
        <strong>Enter by hand</strong>
        <div className="muted">Type Group ID, member name, member ID, and any plan details you have. You can change every field before saving.</div>
      </Link>
      <Link className="choice" href={uploadHref}>
        <strong>Fill from a document</strong>
        <div className="muted">Upload an insurance ID card or benefits summary. CareUnfold drafts the same fields. Nothing is saved until you confirm.</div>
      </Link>
    </div>
  );
}

export function CoverageSkipButton({ continueTo = "/onboarding/review" }: { continueTo?: string }) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="stack">
      {error ? <p className="form-error" role="alert">Error: {error}</p> : null}
      <button
        className="secondary"
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          const result = await api("/api/onboarding/coverage", {
            method: "POST",
            idempotencyKey: key.current,
            body: { skip: true },
          });
          setPending(false);
          if (!result.ok) {
            setError(result.data.error.message);
            return;
          }
          router.push(continueTo);
          router.refresh();
        }}
      >
        {pending ? "Skipping" : "Skip coverage"}
      </button>
    </div>
  );
}

export function CoverageExtractForm({
  onboarding,
  continueTo = "/app/coverage",
  storageConfigured,
  backHref = "/app/coverage/new",
}: {
  onboarding: Onboarding;
  continueTo?: string;
  storageConfigured: boolean;
  backHref?: string;
}) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [draft, setDraft] = useState<(CoverageDraft & { warnings: string[] }) | null>(null);

  if (draft) {
    return (
      <div className="stack">
        <p><Link href={backHref}>Back to add coverage</Link></p>
        <p className="eyebrow">Coverage · From a document</p>
        <h1>Review coverage details</h1>
        <p className="lede">These are the same ID card and benefits fields as the typed form. Change anything that is wrong, then confirm. Nothing is saved until you confirm.</p>
        <CoverageForm
          onboarding={onboarding}
          continueTo={continueTo}
          allowSkip={false}
          extracted
          warnings={draft.warnings}
          initialRecords={[draft]}
          pendingFiles={files}
          storageConfigured={storageConfigured}
        />
        <button className="secondary" type="button" onClick={() => { setDraft(null); setMessage(""); }}>
          Choose a different document
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
          response = await fetch("/api/coverage/extract", { method: "POST", body, credentials: "same-origin" });
        } catch {
          setPending(false);
          setMessage("We couldn't reach CareUnfold. Nothing was saved.");
          return;
        }
        const data = (await response.json()) as {
          draft?: CoverageDraft & { warnings: string[] };
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
      <p><Link href={backHref}>Back to add coverage</Link></p>
      <p className="eyebrow">Coverage · From a document</p>
      <h1>Upload a coverage document</h1>
      <p className="lede">CareUnfold reads an insurance ID card or benefits summary and fills the same fields you would type by hand. You can change every value before saving.</p>
      {pending ? <Notice tone="info" title="Reading the document">This can take a few seconds. Coverage is not saved yet.</Notice> : null}
      <label htmlFor="coverage-file">File (PDF or image, 4 MB or smaller)</label>
      <input
        id="coverage-file"
        name="file"
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        required
        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
      />
      <p className="muted">Supported files: PDF, JPEG, PNG, or WebP.</p>
      <DocumentTrustNote />
      {message ? <p className="form-error" role="alert">Error: {message}</p> : null}
      <div className="actions">
        <button className="primary" type="submit" disabled={pending}>{pending ? "Reading" : "Read document"}</button>
        <Link className="secondary" href={backHref.includes("/onboarding") ? "/onboarding/coverage/manual" : "/app/coverage/new/manual"}>Enter by hand instead</Link>
      </div>
    </form>
  );
}
