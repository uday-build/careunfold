"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Notice, TextField } from "@/components/shell";
import {
  CAREGIVER_PERMISSIONS,
  DEFAULT_SHARED_SCOPES,
  UNKNOWN_PLAN_BENEFITS,
  type PlanBenefits,
  type Scope,
} from "@/server/domain/validation";

type Organizing = "self" | "someone_else" | "both";
type Authority = "self" | "adult_invitation" | "minor_representative" | "dependent_adult_representative";

export type PatientDraft = {
  clientKey: string;
  givenName: string;
  familyName: string;
  preferredName: string | null;
  birthDate: string;
  relationship: string;
  authorityCategory: string;
  invitedEmail?: string | null;
  requestedScopes?: string[];
  id?: string;
  status?: { code: string; label: string; detail: string };
  invitation?: { id: string; status: string; invitedEmail: string; requestedScopes?: string[] } | null;
};

type MoneyBenefit = PlanBenefits["deductible"];
type PercentBenefit = PlanBenefits["coinsurance"];

export type CoverageDraft = {
  clientKey: string;
  insurer: string;
  planName: string;
  subscriberName: string;
  subscriberPatientId: string;
  memberId: string;
  groupNumber: string;
  startState: "known" | "unknown";
  startValue: string;
  endState: "known" | "unknown";
  endValue: string;
  coveredPatientIds: string[];
  benefits: PlanBenefits;
};

type Onboarding = {
  displayName: string | null;
  organizingFor: Organizing | null;
  patients: PatientDraft[];
  coverage: CoverageSource[];
};

type CoverageSource = {
  clientKey: string;
  insurer?: string | null;
  planName?: string | null;
  subscriberName?: string | null;
  subscriberPatientId?: string | null;
  memberId?: string | null;
  memberIdMasked?: string | null;
  groupNumber?: string | null;
  coveredPatientIds?: string[];
  startState?: "known" | "unknown";
  startValue?: string;
  endState?: "known" | "unknown";
  endValue?: string;
  start?: { state: string; value?: string | null };
  end?: { state: string; value?: string | null };
  benefits?: PlanBenefits | null;
};

export function ProfileForm({ onboarding }: { onboarding: Onboarding }) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const [displayName, setDisplayName] = useState(onboarding.displayName ?? "");
  const [organizingFor, setOrganizingFor] = useState<Organizing>(onboarding.organizingFor ?? "self");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError("");
        const result = await api("/api/onboarding/profile", {
          method: "POST",
          idempotencyKey: key.current,
          body: { displayName, organizingFor },
        });
        setPending(false);
        if (!result.ok) {
          setError(result.data.error.message);
          return;
        }
        key.current = crypto.randomUUID();
        router.push("/onboarding/family");
        router.refresh();
      }}
    >
      <TextField id="displayName" label="Name of the primary account holder" autoComplete="name" required value={displayName} onChange={setDisplayName} />
      <fieldset className="stack">
        <legend>Who are you organizing care for?</legend>
        <div className="choice-row">
          <Choice pressed={organizingFor === "self"} onClick={() => setOrganizingFor("self")} title="Myself" detail="Create a patient profile for the account holder. You can still add others next." />
          <Choice pressed={organizingFor === "someone_else"} onClick={() => setOrganizingFor("someone_else")} title="Someone else" detail="Caregiver only. No patient profile is created for you." />
          <Choice pressed={organizingFor === "both"} onClick={() => setOrganizingFor("both")} title="Both" detail="You are a patient, and you can add other people." />
        </div>
      </fieldset>
      {error ? <p className="form-error" role="alert">Error: {error}</p> : null}
      <button className="primary" type="submit" disabled={pending}>{pending ? "Saving" : "Save and continue"}</button>
    </form>
  );
}

export function FamilyForm({ onboarding, continueTo = "/onboarding/coverage" }: { onboarding: Onboarding; continueTo?: string }) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const organizing = onboarding.organizingFor ?? "self";
  const [people, setPeople] = useState<PatientDraft[]>(() => initialPeople(onboarding.patients, organizing));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");

  function update(index: number, patch: Partial<PatientDraft>) {
    setPeople((current) => current.map((person, itemIndex) => (itemIndex === index ? { ...person, ...patch } : person)));
  }

  return (
    <form
      className="stack"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setFormError("");
        setErrors({});
        const result = await api<{ onboarding: Onboarding }>("/api/onboarding/family", {
          method: "POST",
          idempotencyKey: key.current,
          body: {
            patients: people.map((person) => ({
              ...person,
              preferredName: person.preferredName || null,
              invitedEmail: person.invitedEmail || null,
              requestedScopes: person.requestedScopes ?? DEFAULT_SHARED_SCOPES,
            })),
          },
        });
        setPending(false);
        if (!result.ok) {
          setErrors(result.data.error.fields ?? {});
          setFormError(result.data.error.message);
          return;
        }
        key.current = crypto.randomUUID();
        router.push(continueTo);
        router.refresh();
      }}
    >
      <RelationshipGraph displayName={onboarding.displayName} organizing={organizing} people={people} />
      {people.map((person, index) => (
        <section className="card stack" key={person.clientKey}>
          <h2>{person.authorityCategory === "self" ? "Primary account holder" : `Patient ${index + (people[0]?.authorityCategory === "self" ? 0 : 1)}`}</h2>
          {person.status ? <Notice tone={person.status.code === "active" ? "active" : "pending"} title={person.status.label}>{person.status.detail}</Notice> : null}
          <div className="person-grid">
            <TextField id={`given-${person.clientKey}`} label="Given name" required value={person.givenName} error={errors[`patients.${index}.givenName`]} onChange={(givenName) => update(index, { givenName })} />
            <TextField id={`family-${person.clientKey}`} label="Family name" required value={person.familyName} error={errors[`patients.${index}.familyName`]} onChange={(familyName) => update(index, { familyName })} />
            <TextField id={`preferred-${person.clientKey}`} label="Preferred name (optional)" value={person.preferredName ?? ""} onChange={(preferredName) => update(index, { preferredName })} />
            <TextField id={`birth-${person.clientKey}`} label="Birth date" type="date" required value={person.birthDate} error={errors[`patients.${index}.birthDate`]} onChange={(birthDate) => update(index, { birthDate })} />
          </div>
          {person.authorityCategory !== "self" ? (
            <>
              <label htmlFor={`relationship-${person.clientKey}`}>Relationship to the primary account holder</label>
              <select id={`relationship-${person.clientKey}`} value={person.relationship} onChange={(event) => update(index, { relationship: event.target.value })}>
                <option value="spouse">Spouse</option>
                <option value="parent">Parent</option>
                <option value="child">Child</option>
                <option value="sibling">Sibling</option>
                <option value="other_adult">Another adult</option>
                <option value="other">Other</option>
              </select>
              <label htmlFor={`authority-${person.clientKey}`}>Caregiver access</label>
              <select
                id={`authority-${person.clientKey}`}
                value={person.authorityCategory}
                onChange={(event) => update(index, { authorityCategory: event.target.value as Authority })}
              >
                <option value="adult_invitation">Another adult, pending their acceptance</option>
                <option value="minor_representative">Minor, representative authority pending review</option>
                <option value="dependent_adult_representative">Dependent adult, representative authority pending review</option>
              </select>
              {person.authorityCategory === "adult_invitation" ? (
                <TextField id={`email-${person.clientKey}`} label="Their email" type="email" value={person.invitedEmail ?? ""} error={errors[`patients.${index}.invitedEmail`]} onChange={(invitedEmail) => update(index, { invitedEmail })} />
              ) : (
                <p className="muted">Representative authority stays pending. CareUnfold does not decide guardianship.</p>
              )}
              <fieldset className="stack">
                <legend>Caregiver permissions</legend>
                <p className="muted">
                  {person.authorityCategory === "adult_invitation"
                    ? "These permissions are requested. They stay inactive until the adult accepts."
                    : "These permissions are claimed. They stay inactive until a policy authorizes this relationship."}
                </p>
                <div className="permission-list">
                  {CAREGIVER_PERMISSIONS.map((permission) => {
                    const checked = (person.requestedScopes ?? DEFAULT_SHARED_SCOPES).includes(permission.scope);
                    return (
                      <label key={permission.scope} htmlFor={`${person.clientKey}-${permission.scope}`}>
                        <input
                          id={`${person.clientKey}-${permission.scope}`}
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            const current = new Set(person.requestedScopes ?? DEFAULT_SHARED_SCOPES);
                            if (event.target.checked) current.add(permission.scope);
                            else current.delete(permission.scope);
                            update(index, { requestedScopes: Array.from(current) as Scope[] });
                          }}
                        />
                        <span>
                          <strong>{permission.label}</strong>
                          <span className="muted"> {permission.detail}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </>
          ) : (
            <p className="muted">Your own profile has full access to records that belong to you.</p>
          )}
          <div className="actions">
            {person.invitation && (person.invitation.status === "draft" || person.invitation.status === "send_failed") ? (
              <button
                className="secondary"
                type="button"
                onClick={async () => {
                  const sent = await api<{ delivery?: string }>(`/api/invitations/${person.invitation?.id}/send`, { method: "POST" });
                  if (!sent.ok) {
                    setNotice(sent.data.error.message);
                    return;
                  }
                  setNotice(sent.data.delivery === "dev-sink"
                    ? "The invitation is in the local development outbox. It was not delivered to an inbox."
                    : sent.data.delivery === "unconfigured"
                      ? "Email delivery is not configured, so the invitation was not sent."
                      : "The invitation was handed to email delivery. Access stays pending until they accept.");
                  router.refresh();
                }}
              >
                Send invitation
              </button>
            ) : null}
            {person.id && person.authorityCategory !== "self" ? (
              <button
                className="danger"
                type="button"
                onClick={async () => {
                  const removed = await api(`/api/patients/${person.id}/remove`, { method: "POST" });
                  if (!removed.ok) {
                    setNotice(removed.data.error.message);
                    return;
                  }
                  setPeople((current) => current.filter((item) => item.clientKey !== person.clientKey));
                  router.refresh();
                }}
              >
                Remove pending profile
              </button>
            ) : null}
          </div>
        </section>
      ))}
      <button
        className="secondary"
        type="button"
        onClick={() => setPeople((current) => [...current, emptyPerson("adult_invitation")])}
      >
        Add a person
      </button>
      {formError ? <p className="form-error" role="alert">Error: {formError}</p> : null}
      {notice ? <Notice tone="info" title="Invitation status">{notice}</Notice> : null}
      <div className="actions">
        <button className="primary" type="submit" disabled={pending}>{pending ? "Saving" : "Save and continue"}</button>
      </div>
    </form>
  );
}

export function CoverageForm({ onboarding, continueTo = "/onboarding/review" }: { onboarding: Onboarding; continueTo?: string }) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const [records, setRecords] = useState<CoverageDraft[]>(
    onboarding.coverage.length > 0
      ? onboarding.coverage.map(toCoverageDraft)
      : [],
  );
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function save(skip: boolean) {
    setPending(true);
    setError("");
    const result = await api("/api/onboarding/coverage", {
      method: "POST",
      idempotencyKey: key.current,
      body: skip
        ? { skip: true }
        : {
            records: records.map((record) => ({
              clientKey: record.clientKey,
              insurer: record.insurer || null,
              planName: record.planName || null,
              subscriberName: record.subscriberName || null,
              subscriberPatientId: record.subscriberPatientId || null,
              memberId: record.memberId || null,
              groupNumber: record.groupNumber || null,
              start: record.startState === "known" ? { state: "known", value: record.startValue } : { state: "unknown" },
              end: record.endState === "known" ? { state: "known", value: record.endValue } : { state: "unknown" },
              coveredPatientIds: record.coveredPatientIds,
              benefits: record.benefits,
            })),
          },
    });
    setPending(false);
    if (!result.ok) {
      setError(result.data.error.message);
      return;
    }
    key.current = crypto.randomUUID();
    router.push(continueTo);
    router.refresh();
  }

  return (
    <div className="stack">
      <p className="muted">Coverage is optional. Member IDs are masked in lists. Benefits are stored only as you type them. No coverage card is uploaded in this version.</p>
      {records.map((record, index) => (
        <section className="card stack" key={record.clientKey}>
          <h2>Coverage record</h2>
          <div className="person-grid">
            <TextField id={`insurer-${record.clientKey}`} label="Insurer" value={record.insurer} onChange={(insurer) => updateRecord(setRecords, index, { insurer })} />
            <TextField id={`plan-${record.clientKey}`} label="Plan name" value={record.planName} onChange={(planName) => updateRecord(setRecords, index, { planName })} />
            <TextField id={`subscriber-${record.clientKey}`} label="Subscriber name" value={record.subscriberName} onChange={(subscriberName) => updateRecord(setRecords, index, { subscriberName })} />
            <TextField id={`member-${record.clientKey}`} label="Member ID" value={record.memberId} onChange={(memberId) => updateRecord(setRecords, index, { memberId })} />
            <TextField id={`group-${record.clientKey}`} label="Group number" value={record.groupNumber} onChange={(groupNumber) => updateRecord(setRecords, index, { groupNumber })} />
          </div>
          <label htmlFor={`subscriber-person-${record.clientKey}`}>Subscriber in this household</label>
          <select
            id={`subscriber-person-${record.clientKey}`}
            value={record.subscriberPatientId}
            onChange={(event) => updateRecord(setRecords, index, { subscriberPatientId: event.target.value })}
          >
            <option value="">Unknown</option>
            {onboarding.patients.map((person) => (
              <option key={person.id ?? person.clientKey} value={person.id}>{person.givenName} {person.familyName}</option>
            ))}
          </select>
          <fieldset className="stack">
            <legend>Covered people</legend>
            <div className="permission-list">
              {onboarding.patients.map((person) => {
                const id = person.id ?? "";
                return (
                  <label key={person.clientKey} htmlFor={`covered-${record.clientKey}-${person.clientKey}`}>
                    <input
                      id={`covered-${record.clientKey}-${person.clientKey}`}
                      type="checkbox"
                      checked={Boolean(id) && record.coveredPatientIds.includes(id)}
                      disabled={!id}
                      onChange={(event) => {
                        const next = new Set(record.coveredPatientIds);
                        if (event.target.checked) next.add(id);
                        else next.delete(id);
                        updateRecord(setRecords, index, { coveredPatientIds: Array.from(next) });
                      }}
                    />
                    <span>{person.givenName} {person.familyName}</span>
                  </label>
                );
              })}
            </div>
            {onboarding.patients.length === 0 ? <p className="muted">Save people in the family step before linking coverage.</p> : null}
          </fieldset>
          <div className="two">
            <DateChoice label="Coverage start" state={record.startState} value={record.startValue} onState={(startState) => updateRecord(setRecords, index, { startState })} onValue={(startValue) => updateRecord(setRecords, index, { startValue })} />
            <DateChoice label="Coverage end" state={record.endState} value={record.endValue} onState={(endState) => updateRecord(setRecords, index, { endState })} onValue={(endValue) => updateRecord(setRecords, index, { endValue })} />
          </div>
          <fieldset className="stack">
            <legend>Simplified plan benefits</legend>
            <p className="muted">Each benefit is stored as known or unknown. CareUnfold does not infer missing amounts.</p>
            <div className="person-grid">
              <MoneyBenefitField
                id={`deductible-${record.clientKey}`}
                label="Annual deductible"
                value={record.benefits.deductible}
                onChange={(deductible) => updateRecord(setRecords, index, { benefits: { ...record.benefits, deductible } })}
              />
              <MoneyBenefitField
                id={`copay-${record.clientKey}`}
                label="Office visit copay"
                value={record.benefits.officeVisitCopay}
                onChange={(officeVisitCopay) => updateRecord(setRecords, index, { benefits: { ...record.benefits, officeVisitCopay } })}
              />
              <PercentBenefitField
                id={`coinsurance-${record.clientKey}`}
                label="Coinsurance"
                value={record.benefits.coinsurance}
                onChange={(coinsurance) => updateRecord(setRecords, index, { benefits: { ...record.benefits, coinsurance } })}
              />
              <MoneyBenefitField
                id={`oop-${record.clientKey}`}
                label="Out-of-pocket maximum"
                value={record.benefits.outOfPocketMax}
                onChange={(outOfPocketMax) => updateRecord(setRecords, index, { benefits: { ...record.benefits, outOfPocketMax } })}
              />
            </div>
          </fieldset>
        </section>
      ))}
      <button className="secondary" type="button" onClick={() => setRecords((current) => [...current, emptyCoverage()])}>Add coverage</button>
      {error ? <p className="form-error" role="alert">Error: {error}</p> : null}
      <div className="actions">
        <button className="primary" type="button" disabled={pending} onClick={() => save(false)}>Save and continue</button>
        <button className="secondary" type="button" disabled={pending} onClick={() => save(true)}>Skip coverage</button>
      </div>
    </div>
  );
}

export function ReviewForm({ onboarding }: { onboarding: Onboarding }) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const [error, setError] = useState("");
  return (
    <div className="stack">
      <RelationshipGraph displayName={onboarding.displayName} organizing={onboarding.organizingFor ?? "self"} people={onboarding.patients} />
      <ul className="list">
        {onboarding.patients.map((person) => (
          <li className="card stack" key={person.clientKey}>
            <strong>{person.givenName} {person.familyName}</strong>
            <div className="muted">{relationshipLabel(person.relationship)} · born {person.birthDate}</div>
            <div>{person.status?.label ?? "Saved"}</div>
            <p className="muted">{person.status?.detail}</p>
            {person.requestedScopes?.length ? (
              <p className="muted">Permissions: {person.requestedScopes.map(permissionLabel).join(", ")}</p>
            ) : null}
          </li>
        ))}
      </ul>
      {onboarding.coverage.length === 0 ? <p className="muted">No coverage records saved.</p> : null}
      <ul className="list">
        {onboarding.coverage.map((record) => (
          <li className="card stack" key={record.clientKey}>
            <strong>{record.insurer || "Insurer unknown"}</strong>
            <div>{record.planName || "Plan name unknown"}</div>
            <div>Member ID {record.memberIdMasked || "unknown"}</div>
            <p className="muted">{benefitSummary(record.benefits)}</p>
          </li>
        ))}
      </ul>
      {error ? <p className="form-error" role="alert">Error: {error}</p> : null}
      <button
        className="primary"
        type="button"
        onClick={async () => {
          const result = await api("/api/onboarding/review", { method: "POST", idempotencyKey: key.current, body: {} });
          if (!result.ok) {
            setError(result.data.error.message);
            return;
          }
          router.push("/app");
          router.refresh();
        }}
      >
        Confirm family setup
      </button>
    </div>
  );
}

function RelationshipGraph({
  displayName,
  organizing,
  people,
}: {
  displayName: string | null;
  organizing: Organizing;
  people: PatientDraft[];
}) {
  const holder = people.find((person) => person.authorityCategory === "self");
  const others = people.filter((person) => person.authorityCategory !== "self");
  const holderName = holder
    ? [holder.givenName, holder.familyName].filter(Boolean).join(" ") || "Primary account holder"
    : displayName || "Primary account holder";
  return (
    <section className="card stack graph" aria-label="Family relationship graph">
      <p className="eyebrow">Relationship graph</p>
      <div className="graph-node graph-node-primary">
        <p className="eyebrow">Primary account holder</p>
        <strong>{holderName}</strong>
        {holder ? (
          <p className="muted">Patient profile · born {holder.birthDate || "date not entered"}</p>
        ) : (
          <p className="muted">{organizing === "someone_else" ? "Caregiver only. No patient profile for this account." : "Save a self profile to place the account holder on the graph."}</p>
        )}
      </div>
      {others.length > 0 ? (
        <ul className="graph-edges">
          {others.map((person) => (
            <li key={person.clientKey}>
              <p className="eyebrow">{relationshipLabel(person.relationship)}</p>
              <strong>{[person.givenName, person.familyName].filter(Boolean).join(" ") || "Person not named yet"}</strong>
              <p className="muted">Born {person.birthDate || "date not entered"}</p>
              <p className="muted">{permissionSummary(person)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Add a person to show a relationship from the primary account holder.</p>
      )}
    </section>
  );
}

function Choice({ pressed, onClick, title, detail }: { pressed: boolean; onClick: () => void; title: string; detail: string }) {
  return (
    <button className="choice" type="button" aria-pressed={pressed} onClick={onClick}>
      <strong>{title}</strong>
      <div className="muted">{detail}</div>
    </button>
  );
}

function DateChoice({ label, state, value, onState, onValue }: { label: string; state: "known" | "unknown"; value: string; onState: (state: "known" | "unknown") => void; onValue: (value: string) => void }) {
  const id = label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="stack">
      <label htmlFor={id}>{label}</label>
      <select id={`${id}-state`} value={state} onChange={(event) => onState(event.target.value as "known" | "unknown")}>
        <option value="unknown">Unknown</option>
        <option value="known">Known</option>
      </select>
      {state === "known" ? <input id={id} type="date" value={value} onChange={(event) => onValue(event.target.value)} /> : <p className="muted">Saved as unknown.</p>}
    </div>
  );
}

function MoneyBenefitField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: MoneyBenefit;
  onChange: (value: MoneyBenefit) => void;
}) {
  return (
    <div className="stack">
      <label htmlFor={id}>{label}</label>
      <select id={`${id}-state`} value={value.state} onChange={(event) => onChange(event.target.value === "known" ? { state: "known", amountUsd: value.state === "known" ? value.amountUsd : "" } : { state: "unknown" })}>
        <option value="unknown">Unknown</option>
        <option value="known">Known</option>
      </select>
      {value.state === "known" ? (
        <input id={id} inputMode="decimal" placeholder="1500" value={value.amountUsd} onChange={(event) => onChange({ state: "known", amountUsd: event.target.value })} />
      ) : (
        <p className="muted">Saved as unknown.</p>
      )}
    </div>
  );
}

function PercentBenefitField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: PercentBenefit;
  onChange: (value: PercentBenefit) => void;
}) {
  return (
    <div className="stack">
      <label htmlFor={id}>{label}</label>
      <select id={`${id}-state`} value={value.state} onChange={(event) => onChange(event.target.value === "known" ? { state: "known", percent: value.state === "known" ? value.percent : 0 } : { state: "unknown" })}>
        <option value="unknown">Unknown</option>
        <option value="known">Known</option>
      </select>
      {value.state === "known" ? (
        <input id={id} type="number" min={0} max={100} value={value.percent} onChange={(event) => onChange({ state: "known", percent: Number(event.target.value) })} />
      ) : (
        <p className="muted">Saved as unknown.</p>
      )}
    </div>
  );
}

function initialPeople(patients: PatientDraft[], organizing: Organizing): PatientDraft[] {
  const mapped = patients.map((person) => ({
    ...person,
    preferredName: person.preferredName ?? "",
    invitedEmail: person.invitedEmail ?? person.invitation?.invitedEmail ?? "",
    requestedScopes: person.requestedScopes ?? person.invitation?.requestedScopes ?? DEFAULT_SHARED_SCOPES,
  }));
  if ((organizing === "self" || organizing === "both") && !mapped.some((person) => person.authorityCategory === "self")) {
    return [emptyPerson("self"), ...mapped];
  }
  if (mapped.length === 0 && organizing === "someone_else") return [emptyPerson("adult_invitation")];
  return mapped;
}

function emptyPerson(authority: Authority): PatientDraft {
  return {
    clientKey: crypto.randomUUID(),
    givenName: "",
    familyName: "",
    preferredName: "",
    birthDate: "",
    relationship: authority === "self" ? "self" : "spouse",
    authorityCategory: authority,
    invitedEmail: "",
    requestedScopes: [...DEFAULT_SHARED_SCOPES],
  };
}

function emptyCoverage(): CoverageDraft {
  return {
    clientKey: crypto.randomUUID(),
    insurer: "",
    planName: "",
    subscriberName: "",
    subscriberPatientId: "",
    memberId: "",
    groupNumber: "",
    startState: "unknown",
    startValue: "",
    endState: "unknown",
    endValue: "",
    coveredPatientIds: [],
    benefits: { ...UNKNOWN_PLAN_BENEFITS },
  };
}

function toCoverageDraft(record: CoverageSource): CoverageDraft {
  return {
    ...emptyCoverage(),
    ...record,
    insurer: record.insurer ?? "",
    planName: record.planName ?? "",
    subscriberName: record.subscriberName ?? "",
    subscriberPatientId: record.subscriberPatientId ?? "",
    memberId: record.memberId ?? "",
    groupNumber: record.groupNumber ?? "",
    startState: record.start?.state === "known" ? "known" : record.startState === "known" ? "known" : "unknown",
    startValue: record.start?.value ?? record.startValue ?? "",
    endState: record.end?.state === "known" ? "known" : record.endState === "known" ? "known" : "unknown",
    endValue: record.end?.value ?? record.endValue ?? "",
    coveredPatientIds: record.coveredPatientIds ?? [],
    benefits: record.benefits ?? { ...UNKNOWN_PLAN_BENEFITS },
  };
}

function updateRecord(setRecords: React.Dispatch<React.SetStateAction<CoverageDraft[]>>, index: number, patch: Partial<CoverageDraft>) {
  setRecords((current) => current.map((record, itemIndex) => (itemIndex === index ? { ...record, ...patch } : record)));
}

function relationshipLabel(value: string) {
  switch (value) {
    case "self":
      return "Self";
    case "spouse":
      return "Spouse";
    case "parent":
      return "Parent";
    case "child":
      return "Child";
    case "sibling":
      return "Sibling";
    case "other_adult":
      return "Another adult";
    default:
      return "Related";
  }
}

function permissionLabel(scope: string) {
  return CAREGIVER_PERMISSIONS.find((item) => item.scope === scope)?.label ?? scope;
}

function permissionSummary(person: PatientDraft) {
  if (person.authorityCategory === "self") return "Full access to this profile";
  const scopes = person.requestedScopes ?? person.invitation?.requestedScopes ?? DEFAULT_SHARED_SCOPES;
  if (scopes.length === 0) return "No caregiver permissions selected";
  return scopes.map(permissionLabel).join(" · ");
}

function benefitSummary(benefits: PlanBenefits | null | undefined) {
  const plan = benefits ?? UNKNOWN_PLAN_BENEFITS;
  const parts = [
    plan.deductible.state === "known" ? `Deductible $${plan.deductible.amountUsd}` : "Deductible unknown",
    plan.officeVisitCopay.state === "known" ? `Office copay $${plan.officeVisitCopay.amountUsd}` : "Office copay unknown",
    plan.coinsurance.state === "known" ? `Coinsurance ${plan.coinsurance.percent}%` : "Coinsurance unknown",
    plan.outOfPocketMax.state === "known" ? `Out-of-pocket max $${plan.outOfPocketMax.amountUsd}` : "Out-of-pocket max unknown",
  ];
  return parts.join(" · ");
}
