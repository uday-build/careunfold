"use client";

export type DocumentOptionalDetailsValue = {
  dueOn: string;
  statedProvider: string;
  memberNote: string;
};

export const EMPTY_DOCUMENT_DETAILS: DocumentOptionalDetailsValue = {
  dueOn: "",
  statedProvider: "",
  memberNote: "",
};

export function DocumentTrustNote() {
  return (
    <p className="trust-line">
      <LockIcon />
      Only you and CareUnfold will see this document.
    </p>
  );
}

export function DocumentOptionalDetails({
  value,
  onChange,
  eobFiles,
  onEobFiles,
  showEob = true,
}: {
  value?: DocumentOptionalDetailsValue;
  onChange?: (value: DocumentOptionalDetailsValue) => void;
  eobFiles?: File[];
  onEobFiles?: (files: File[]) => void;
  showEob?: boolean;
}) {
  const controlled = Boolean(onChange);
  const current = value ?? EMPTY_DOCUMENT_DETAILS;
  return (
    <details className="optional-details">
      <summary>
        Add a due date, provider, note, or EOB
        <span className="muted">optional</span>
      </summary>
      <div className="stack">
        <div className="two">
          <div className="field">
            <label htmlFor="dueOn">Due date</label>
            <input
              id="dueOn"
              name="dueOn"
              type="date"
              {...(controlled
                ? { value: current.dueOn, onChange: (event) => onChange?.({ ...current, dueOn: event.target.value }) }
                : {})}
            />
          </div>
          <div className="field">
            <label htmlFor="statedProvider">Provider</label>
            <input
              id="statedProvider"
              name="statedProvider"
              type="text"
              maxLength={80}
              autoComplete="organization"
              {...(controlled
                ? {
                    value: current.statedProvider,
                    onChange: (event) => onChange?.({ ...current, statedProvider: event.target.value }),
                  }
                : {})}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="memberNote">Note</label>
          <textarea
            id="memberNote"
            name="memberNote"
            rows={3}
            maxLength={500}
            {...(controlled
              ? {
                  value: current.memberNote,
                  onChange: (event) => onChange?.({ ...current, memberNote: event.target.value }),
                }
              : {})}
          />
        </div>
        {showEob ? (
          <div className="field">
            <label htmlFor="eob">Explanation of benefits</label>
            <input
              id="eob"
              name="eob"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => onEobFiles?.(Array.from(event.target.files ?? []))}
            />
            <p className="muted">PDF or image, 4 MB or smaller. Stored with this visit.</p>
            {eobFiles && eobFiles.length > 0 ? <p role="status">{eobFiles[0].name} selected.</p> : null}
          </div>
        ) : null}
      </div>
    </details>
  );
}

function LockIcon() {
  return (
    <svg className="trust-lock" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}
