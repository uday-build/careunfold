"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Notice, TextArea, TextField } from "@/components/shell";
import {
  CAREGIVER_PERMISSIONS,
  DEFAULT_SHARED_SCOPES,
  UNKNOWN_PLAN_BENEFITS,
  type PlanBenefits,
  type Scope,
} from "@/server/domain/validation";

const RELATIONSHIPS = [
  { value: "spouse", label: "Spouse" },
  { value: "parent", label: "Parent" },
  { value: "child", label: "Child" },
  { value: "sibling", label: "Sibling" },
  { value: "other_adult", label: "Another adult" },
  { value: "other", label: "Other" },
] as const;

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
  memberServicesName: string;
  memberServicesPhone: string;
  memberServicesUrl: string;
  rxBin: string;
  rxPcn: string;
  rxGrp: string;
  pharmacyWebsiteUrl: string;
  pharmacyMemberServicesPhone: string;
  pharmacyPhone: string;
  claimsAddress: string;
  claimsPhone: string;
  claimsUrl: string;
  providerSupportPhone: string;
};

type Onboarding = {
  displayName: string | null;
  organizingFor: Organizing | null;
  currentStep?: "profile" | "family" | "coverage" | "review" | "complete";
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
  memberServicesName?: string | null;
  memberServicesPhone?: string | null;
  memberServicesUrl?: string | null;
  rxBin?: string | null;
  rxPcn?: string | null;
  rxGrp?: string | null;
  pharmacyWebsiteUrl?: string | null;
  pharmacyMemberServicesPhone?: string | null;
  pharmacyPhone?: string | null;
  claimsAddress?: string | null;
  claimsPhone?: string | null;
  claimsUrl?: string | null;
  providerSupportPhone?: string | null;
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

export function FamilyForm({
  onboarding,
  continueTo,
  onSaved,
  onCancel,
  saveLabel = "Save and continue",
}: {
  onboarding: Onboarding;
  continueTo?: string;
  onSaved?: (onboarding: Onboarding) => void;
  onCancel?: () => void;
  saveLabel?: string;
}) {
  const router = useRouter();
  const key = useRef(crypto.randomUUID());
  const organizing = onboarding.organizingFor ?? "self";
  const [people, setPeople] = useState<PatientDraft[]>(() => initialPeople(onboarding.patients, organizing));
  const [selectedKey, setSelectedKey] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const nextStep = continueTo ?? familyContinueTo(onboarding.currentStep);
  const selected = people.find((person) => person.clientKey === selectedKey) ?? people[0];
  const selectedIndex = selected ? people.indexOf(selected) : -1;

  function update(index: number, patch: Partial<PatientDraft>) {
    setPeople((current) => current.map((person, itemIndex) => (itemIndex === index ? { ...person, ...patch } : person)));
  }

  function addPerson() {
    const next = emptyPerson("adult_invitation");
    setPeople((current) => [...current, next]);
    setSelectedKey(next.clientKey);
  }

  async function removePerson(person: PatientDraft) {
    if (person.authorityCategory === "self") return;
    if (person.id) {
      const removed = await api(`/api/patients/${person.id}/remove`, { method: "POST" });
      if (!removed.ok) {
        setNotice(removed.data.error.message);
        return;
      }
    }
    setPeople((current) => current.filter((item) => item.clientKey !== person.clientKey));
    setSelectedKey((currentKey) => (currentKey === person.clientKey ? "" : currentKey));
    if (person.id) router.refresh();
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
          const fields = result.data.error.fields ?? {};
          setErrors(fields);
          setFormError(result.data.error.message);
          const errorIndex = firstPatientErrorIndex(fields);
          if (errorIndex != null && people[errorIndex]) setSelectedKey(people[errorIndex].clientKey);
          return;
        }
        key.current = crypto.randomUUID();
        if (onSaved) {
          onSaved(result.data.onboarding);
          return;
        }
        router.push(nextStep);
        router.refresh();
      }}
    >
      <RelationshipGraph
        displayName={onboarding.displayName}
        organizing={organizing}
        people={people}
        selectedKey={selected?.clientKey}
        editable
        onSelect={setSelectedKey}
        onRelationshipChange={(clientKey, relationship) => {
          setPeople((current) => current.map((person) => (person.clientKey === clientKey ? { ...person, relationship } : person)));
        }}
        onRemove={removePerson}
        onAdd={addPerson}
      />
      {selected ? (
        <PersonEditor
          person={selected}
          index={selectedIndex}
          errors={errors}
          onChange={(patch) => update(selectedIndex, patch)}
          onRemove={() => removePerson(selected)}
          onSendInvitation={async () => {
            const sent = await api<{ delivery?: string }>(`/api/invitations/${selected.invitation?.id}/send`, { method: "POST" });
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
        />
      ) : (
        <p className="muted">Add a person on the graph to edit their details.</p>
      )}
      {formError ? <p className="form-error" role="alert">Error: {formError}</p> : null}
      {notice ? <Notice tone="info" title="Invitation status">{notice}</Notice> : null}
      <div className="actions">
        <button className="primary" type="submit" disabled={pending}>{pending ? "Saving" : saveLabel}</button>
        {onCancel ? <button className="secondary" type="button" onClick={onCancel}>Cancel</button> : null}
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
      : [emptyCoverage()],
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
              subscriberName: record.subscriberName,
              subscriberPatientId: record.subscriberPatientId || null,
              memberId: record.memberId,
              groupNumber: record.groupNumber,
              start: record.startState === "known" ? { state: "known", value: record.startValue } : { state: "unknown" },
              end: record.endState === "known" ? { state: "known", value: record.endValue } : { state: "unknown" },
              coveredPatientIds: record.coveredPatientIds,
              benefits: record.benefits,
              memberServicesName: record.memberServicesName || null,
              memberServicesPhone: record.memberServicesPhone || null,
              memberServicesUrl: record.memberServicesUrl || null,
              rxBin: record.rxBin || null,
              rxPcn: record.rxPcn || null,
              rxGrp: record.rxGrp || null,
              pharmacyWebsiteUrl: record.pharmacyWebsiteUrl || null,
              pharmacyMemberServicesPhone: record.pharmacyMemberServicesPhone || null,
              pharmacyPhone: record.pharmacyPhone || null,
              claimsAddress: record.claimsAddress || null,
              claimsPhone: record.claimsPhone || null,
              claimsUrl: record.claimsUrl || null,
              providerSupportPhone: record.providerSupportPhone || null,
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
      <p className="muted">Coverage is optional. If you add an ID card, Group ID, member name, and member ID are required. Member IDs are masked in lists. Nothing is read from a photo in this version.</p>
      {records.map((record, index) => (
        <section className="card stack" key={record.clientKey}>
          <h2>Insurance ID card</h2>
          <fieldset className="stack">
            <legend>Member identifiers</legend>
            <div className="person-grid">
              <TextField id={`group-${record.clientKey}`} label="Group ID" required value={record.groupNumber} onChange={(groupNumber) => updateRecord(setRecords, index, { groupNumber })} />
              <TextField id={`subscriber-${record.clientKey}`} label="Member name" required value={record.subscriberName} onChange={(subscriberName) => updateRecord(setRecords, index, { subscriberName })} />
              <TextField id={`member-${record.clientKey}`} label="Member ID" required value={record.memberId} onChange={(memberId) => updateRecord(setRecords, index, { memberId })} />
              <TextField id={`insurer-${record.clientKey}`} label="Insurer" value={record.insurer} onChange={(insurer) => updateRecord(setRecords, index, { insurer })} />
              <TextField id={`plan-${record.clientKey}`} label="Plan name" value={record.planName} onChange={(planName) => updateRecord(setRecords, index, { planName })} />
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
          </fieldset>
          <fieldset className="stack">
            <legend>Network and benefits (optional)</legend>
            <p className="muted">In-network single and family amounts, and what the member pays. Each value is stored as known or unknown. CareUnfold does not infer missing amounts.</p>
            <div className="person-grid">
              <MoneyBenefitField
                id={`inn-ind-deductible-${record.clientKey}`}
                label="In-network individual deductible"
                value={record.benefits.deductible}
                onChange={(deductible) => updateRecord(setRecords, index, { benefits: { ...record.benefits, deductible } })}
              />
              <MoneyBenefitField
                id={`inn-fam-deductible-${record.clientKey}`}
                label="In-network family deductible"
                value={record.benefits.innFamilyDeductible ?? { state: "unknown" }}
                onChange={(innFamilyDeductible) => updateRecord(setRecords, index, { benefits: { ...record.benefits, innFamilyDeductible } })}
              />
              <MoneyBenefitField
                id={`inn-ind-oop-${record.clientKey}`}
                label="In-network individual out-of-pocket max"
                value={record.benefits.outOfPocketMax}
                onChange={(outOfPocketMax) => updateRecord(setRecords, index, { benefits: { ...record.benefits, outOfPocketMax } })}
              />
              <MoneyBenefitField
                id={`inn-fam-oop-${record.clientKey}`}
                label="In-network family out-of-pocket max"
                value={record.benefits.innFamilyOutOfPocketMax ?? { state: "unknown" }}
                onChange={(innFamilyOutOfPocketMax) => updateRecord(setRecords, index, { benefits: { ...record.benefits, innFamilyOutOfPocketMax } })}
              />
              <MoneyBenefitField
                id={`copay-${record.clientKey}`}
                label="Primary care / office visit copay"
                value={record.benefits.officeVisitCopay}
                onChange={(officeVisitCopay) => updateRecord(setRecords, index, { benefits: { ...record.benefits, officeVisitCopay } })}
              />
              <MoneyBenefitField
                id={`specialist-${record.clientKey}`}
                label="Specialist copay"
                value={record.benefits.specialistCopay ?? { state: "unknown" }}
                onChange={(specialistCopay) => updateRecord(setRecords, index, { benefits: { ...record.benefits, specialistCopay } })}
              />
              <MoneyBenefitField
                id={`urgent-${record.clientKey}`}
                label="Urgent care copay"
                value={record.benefits.urgentCareCopay ?? { state: "unknown" }}
                onChange={(urgentCareCopay) => updateRecord(setRecords, index, { benefits: { ...record.benefits, urgentCareCopay } })}
              />
              <MoneyBenefitField
                id={`er-${record.clientKey}`}
                label="Emergency copay"
                value={record.benefits.emergencyCopay ?? { state: "unknown" }}
                onChange={(emergencyCopay) => updateRecord(setRecords, index, { benefits: { ...record.benefits, emergencyCopay } })}
              />
              <PercentBenefitField
                id={`coinsurance-${record.clientKey}`}
                label="Coinsurance"
                value={record.benefits.coinsurance}
                onChange={(coinsurance) => updateRecord(setRecords, index, { benefits: { ...record.benefits, coinsurance } })}
              />
            </div>
          </fieldset>
          <fieldset className="stack">
            <legend>Member services (optional)</legend>
            <div className="person-grid">
              <TextField id={`ms-name-${record.clientKey}`} label="Name" value={record.memberServicesName} onChange={(memberServicesName) => updateRecord(setRecords, index, { memberServicesName })} />
              <TextField id={`ms-phone-${record.clientKey}`} label="Contact number" type="tel" value={record.memberServicesPhone} onChange={(memberServicesPhone) => updateRecord(setRecords, index, { memberServicesPhone })} />
              <TextField id={`ms-url-${record.clientKey}`} label="Website URL" value={record.memberServicesUrl} onChange={(memberServicesUrl) => updateRecord(setRecords, index, { memberServicesUrl })} />
            </div>
          </fieldset>
          <fieldset className="stack">
            <legend>Pharmacy plan (optional)</legend>
            <div className="person-grid">
              <TextField id={`rxbin-${record.clientKey}`} label="RXBIN" value={record.rxBin} onChange={(rxBin) => updateRecord(setRecords, index, { rxBin })} />
              <TextField id={`rxpcn-${record.clientKey}`} label="RXPCN" value={record.rxPcn} onChange={(rxPcn) => updateRecord(setRecords, index, { rxPcn })} />
              <TextField id={`rxgrp-${record.clientKey}`} label="RXGRP" value={record.rxGrp} onChange={(rxGrp) => updateRecord(setRecords, index, { rxGrp })} />
              <TextField id={`rx-url-${record.clientKey}`} label="Website URL" value={record.pharmacyWebsiteUrl} onChange={(pharmacyWebsiteUrl) => updateRecord(setRecords, index, { pharmacyWebsiteUrl })} />
              <TextField id={`rx-ms-${record.clientKey}`} label="Member services number" type="tel" value={record.pharmacyMemberServicesPhone} onChange={(pharmacyMemberServicesPhone) => updateRecord(setRecords, index, { pharmacyMemberServicesPhone })} />
              <TextField id={`rx-phone-${record.clientKey}`} label="Pharmacy number" type="tel" value={record.pharmacyPhone} onChange={(pharmacyPhone) => updateRecord(setRecords, index, { pharmacyPhone })} />
            </div>
          </fieldset>
          <fieldset className="stack">
            <legend>Claims submission</legend>
            <TextArea id={`claims-address-${record.clientKey}`} label="Address" value={record.claimsAddress} onChange={(claimsAddress) => updateRecord(setRecords, index, { claimsAddress })} />
            <div className="person-grid">
              <TextField id={`claims-phone-${record.clientKey}`} label="Phone number" type="tel" value={record.claimsPhone} onChange={(claimsPhone) => updateRecord(setRecords, index, { claimsPhone })} />
              <TextField id={`claims-url-${record.clientKey}`} label="Website URL" value={record.claimsUrl} onChange={(claimsUrl) => updateRecord(setRecords, index, { claimsUrl })} />
            </div>
          </fieldset>
          <fieldset className="stack">
            <legend>Provider services</legend>
            <TextField id={`provider-phone-${record.clientKey}`} label="Provider support number" type="tel" value={record.providerSupportPhone} onChange={(providerSupportPhone) => updateRecord(setRecords, index, { providerSupportPhone })} />
          </fieldset>
          <button className="danger" type="button" onClick={() => setRecords((current) => current.filter((item) => item.clientKey !== record.clientKey))}>Remove this card</button>
        </section>
      ))}
      <button className="secondary" type="button" onClick={() => setRecords((current) => [...current, emptyCoverage()])}>Add an ID card</button>
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
  const [editingFamily, setEditingFamily] = useState(false);
  const [household, setHousehold] = useState(onboarding);

  if (editingFamily) {
    return (
      <div className="stack">
        <p className="muted">Change people or relationships on the graph, then save to return here before you confirm.</p>
        <FamilyForm
          onboarding={household}
          onSaved={(next) => {
            setHousehold(next);
            setEditingFamily(false);
            router.refresh();
          }}
          onCancel={() => setEditingFamily(false)}
          saveLabel="Save changes"
        />
      </div>
    );
  }

  return (
    <div className="stack">
      <RelationshipGraph displayName={household.displayName} organizing={household.organizingFor ?? "self"} people={household.patients} />
      <div className="actions">
        <button className="secondary" type="button" onClick={() => setEditingFamily(true)}>Edit people and relationships</button>
        <Link className="secondary" href="/onboarding/coverage">Edit coverage</Link>
      </div>
      <ul className="list">
        {household.patients.map((person) => (
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
      {household.coverage.length === 0 ? <p className="muted">No coverage records saved.</p> : null}
      <ul className="list">
        {household.coverage.map((record) => (
          <li className="card stack" key={record.clientKey}>
            <strong>{record.insurer || "Insurer unknown"}</strong>
            <div>{record.planName || "Plan name unknown"}</div>
            <div>Member {record.subscriberName || "unknown"} · Group {record.groupNumber || "unknown"}</div>
            <div>Member ID {record.memberIdMasked || "unknown"}</div>
            {record.rxBin ? <div className="muted">Pharmacy RXBIN {record.rxBin}</div> : null}
            {record.claimsAddress ? <div className="muted">Claims: {record.claimsAddress}</div> : null}
            {record.providerSupportPhone ? <div className="muted">Provider support {record.providerSupportPhone}</div> : null}
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
  selectedKey,
  editable = false,
  onSelect,
  onRelationshipChange,
  onRemove,
  onAdd,
}: {
  displayName: string | null;
  organizing: Organizing;
  people: PatientDraft[];
  selectedKey?: string;
  editable?: boolean;
  onSelect?: (clientKey: string) => void;
  onRelationshipChange?: (clientKey: string, relationship: string) => void;
  onRemove?: (person: PatientDraft) => void;
  onAdd?: () => void;
}) {
  const holder = people.find((person) => person.authorityCategory === "self");
  const others = people.filter((person) => person.authorityCategory !== "self");
  const holderName = holder
    ? [holder.givenName, holder.familyName].filter(Boolean).join(" ") || "Primary account holder"
    : displayName || "Primary account holder";
  const holderSelected = Boolean(holder && selectedKey === holder.clientKey);
  return (
    <section className="card stack graph" aria-label="Family relationship graph">
      <p className="eyebrow">Relationship graph</p>
      {editable ? <p className="muted">Select a person to edit their details. Relationship can be changed on each connected person.</p> : null}
      <div className={`graph-node graph-node-primary${holderSelected ? " graph-node-selected" : ""}`}>
        {holder && onSelect ? (
          <button className="ghost graph-select" type="button" aria-pressed={holderSelected} onClick={() => onSelect(holder.clientKey)}>
            <span className="eyebrow">Primary account holder</span>
            <strong>{holderName}</strong>
            <span className="muted">Patient profile · born {holder.birthDate || "date not entered"}</span>
          </button>
        ) : (
          <>
            <p className="eyebrow">Primary account holder</p>
            <strong>{holderName}</strong>
            {holder ? (
              <p className="muted">Patient profile · born {holder.birthDate || "date not entered"}</p>
            ) : (
              <p className="muted">{organizing === "someone_else" ? "Caregiver only. No patient profile for this account." : "Save a self profile to place the account holder on the graph."}</p>
            )}
          </>
        )}
      </div>
      {others.length > 0 ? (
        <ul className="graph-edges">
          {others.map((person) => {
            const selected = selectedKey === person.clientKey;
            return (
              <li className={selected ? "graph-node-selected" : undefined} key={person.clientKey}>
                {onSelect ? (
                  <button className="ghost graph-select" type="button" aria-pressed={selected} onClick={() => onSelect(person.clientKey)}>
                    <span className="eyebrow">{relationshipLabel(person.relationship)}</span>
                    <strong>{[person.givenName, person.familyName].filter(Boolean).join(" ") || "Person not named yet"}</strong>
                    <span className="muted">Born {person.birthDate || "date not entered"}</span>
                    <span className="muted">{permissionSummary(person)}</span>
                  </button>
                ) : (
                  <>
                    <p className="eyebrow">{relationshipLabel(person.relationship)}</p>
                    <strong>{[person.givenName, person.familyName].filter(Boolean).join(" ") || "Person not named yet"}</strong>
                    <p className="muted">Born {person.birthDate || "date not entered"}</p>
                    <p className="muted">{permissionSummary(person)}</p>
                  </>
                )}
                {editable ? (
                  <div className="graph-node-edit">
                    <label htmlFor={`graph-relationship-${person.clientKey}`}>Relationship</label>
                    <select
                      id={`graph-relationship-${person.clientKey}`}
                      value={person.relationship}
                      onChange={(event) => onRelationshipChange?.(person.clientKey, event.target.value)}
                    >
                      {RELATIONSHIPS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    {onRemove ? (
                      <button className="danger" type="button" onClick={() => onRemove(person)}>
                        {person.id ? "Remove pending profile" : "Remove from graph"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">Add a person to show a relationship from the primary account holder.</p>
      )}
      {editable && onAdd ? (
        <button className="secondary" type="button" onClick={onAdd}>Add a person</button>
      ) : null}
    </section>
  );
}

function PersonEditor({
  person,
  index,
  errors,
  onChange,
  onRemove,
  onSendInvitation,
}: {
  person: PatientDraft;
  index: number;
  errors: Record<string, string>;
  onChange: (patch: Partial<PatientDraft>) => void;
  onRemove: () => void;
  onSendInvitation: () => void;
}) {
  return (
    <section className="card stack" key={person.clientKey}>
      <h2>{person.authorityCategory === "self" ? "Primary account holder" : relationshipLabel(person.relationship)}</h2>
      {person.status ? <Notice tone={person.status.code === "active" ? "active" : "pending"} title={person.status.label}>{person.status.detail}</Notice> : null}
      <div className="person-grid">
        <TextField id={`given-${person.clientKey}`} label="Given name" required value={person.givenName} error={errors[`patients.${index}.givenName`]} onChange={(givenName) => onChange({ givenName })} />
        <TextField id={`family-${person.clientKey}`} label="Family name" required value={person.familyName} error={errors[`patients.${index}.familyName`]} onChange={(familyName) => onChange({ familyName })} />
        <TextField id={`preferred-${person.clientKey}`} label="Preferred name (optional)" value={person.preferredName ?? ""} onChange={(preferredName) => onChange({ preferredName })} />
        <TextField id={`birth-${person.clientKey}`} label="Birth date" type="date" required value={person.birthDate} error={errors[`patients.${index}.birthDate`]} onChange={(birthDate) => onChange({ birthDate })} />
      </div>
      {person.authorityCategory !== "self" ? (
        <>
          <label htmlFor={`relationship-${person.clientKey}`}>Relationship to the primary account holder</label>
          <select id={`relationship-${person.clientKey}`} value={person.relationship} onChange={(event) => onChange({ relationship: event.target.value })}>
            {RELATIONSHIPS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <label htmlFor={`authority-${person.clientKey}`}>Caregiver access</label>
          <select
            id={`authority-${person.clientKey}`}
            value={person.authorityCategory}
            disabled={Boolean(person.id)}
            onChange={(event) => onChange({ authorityCategory: event.target.value as Authority })}
          >
            <option value="adult_invitation">Another adult, pending their acceptance</option>
            <option value="minor_representative">Minor, representative authority pending review</option>
            <option value="dependent_adult_representative">Dependent adult, representative authority pending review</option>
          </select>
          {person.id ? <p className="muted">A saved person's access type cannot be changed. Remove the pending profile and add it again.</p> : null}
          {person.authorityCategory === "adult_invitation" ? (
            <TextField id={`email-${person.clientKey}`} label="Their email" type="email" value={person.invitedEmail ?? ""} error={errors[`patients.${index}.invitedEmail`]} onChange={(invitedEmail) => onChange({ invitedEmail })} />
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
                        onChange({ requestedScopes: Array.from(current) as Scope[] });
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
          <button className="secondary" type="button" onClick={onSendInvitation}>Send invitation</button>
        ) : null}
        {person.authorityCategory !== "self" ? (
          <button className="danger" type="button" onClick={onRemove}>
            {person.id ? "Remove pending profile" : "Remove from graph"}
          </button>
        ) : null}
      </div>
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

function familyContinueTo(step?: Onboarding["currentStep"]) {
  if (step === "review") return "/onboarding/review";
  if (step === "complete") return "/app/family";
  return "/onboarding/coverage";
}

function firstPatientErrorIndex(fields: Record<string, string>) {
  for (const key of Object.keys(fields)) {
    const match = key.match(/^patients\.(\d+)\./);
    if (match) return Number(match[1]);
  }
  return null;
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
    memberServicesName: "",
    memberServicesPhone: "",
    memberServicesUrl: "",
    rxBin: "",
    rxPcn: "",
    rxGrp: "",
    pharmacyWebsiteUrl: "",
    pharmacyMemberServicesPhone: "",
    pharmacyPhone: "",
    claimsAddress: "",
    claimsPhone: "",
    claimsUrl: "",
    providerSupportPhone: "",
  };
}

function toCoverageDraft(record: CoverageSource): CoverageDraft {
  return {
    ...emptyCoverage(),
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
    benefits: { ...UNKNOWN_PLAN_BENEFITS, ...record.benefits },
    memberServicesName: record.memberServicesName ?? "",
    memberServicesPhone: record.memberServicesPhone ?? "",
    memberServicesUrl: record.memberServicesUrl ?? "",
    rxBin: record.rxBin ?? "",
    rxPcn: record.rxPcn ?? "",
    rxGrp: record.rxGrp ?? "",
    pharmacyWebsiteUrl: record.pharmacyWebsiteUrl ?? "",
    pharmacyMemberServicesPhone: record.pharmacyMemberServicesPhone ?? "",
    pharmacyPhone: record.pharmacyPhone ?? "",
    claimsAddress: record.claimsAddress ?? "",
    claimsPhone: record.claimsPhone ?? "",
    claimsUrl: record.claimsUrl ?? "",
    providerSupportPhone: record.providerSupportPhone ?? "",
    clientKey: record.clientKey,
  };
}

function updateRecord(setRecords: React.Dispatch<React.SetStateAction<CoverageDraft[]>>, index: number, patch: Partial<CoverageDraft>) {
  setRecords((current) => current.map((record, itemIndex) => (itemIndex === index ? { ...record, ...patch } : record)));
}

function relationshipLabel(value: string) {
  if (value === "self") return "Self";
  return RELATIONSHIPS.find((item) => item.value === value)?.label ?? "Related";
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
  const plan = { ...UNKNOWN_PLAN_BENEFITS, ...benefits };
  const parts = [
    plan.deductible.state === "known" ? `INN individual deductible $${plan.deductible.amountUsd}` : "INN individual deductible unknown",
    plan.innFamilyDeductible?.state === "known" ? `INN family deductible $${plan.innFamilyDeductible.amountUsd}` : "INN family deductible unknown",
    plan.officeVisitCopay.state === "known" ? `Office copay $${plan.officeVisitCopay.amountUsd}` : "Office copay unknown",
    plan.coinsurance.state === "known" ? `Coinsurance ${plan.coinsurance.percent}%` : "Coinsurance unknown",
    plan.outOfPocketMax.state === "known" ? `INN individual out-of-pocket max $${plan.outOfPocketMax.amountUsd}` : "INN individual out-of-pocket max unknown",
  ];
  return parts.join(" · ");
}
