import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredFileStore } from "@/server/storage/files";
import type { AppContext } from "@/server/domain/service";
import { HttpError } from "@/server/http/errors";
import { dispatch } from "@/server/http/router";
import {
  adultPatient,
  api,
  createTestContext,
  origin,
  register,
  resetData,
  saveProfile,
  selfPatient,
} from "./support";

let ctx: AppContext;
let closeDatabase: () => Promise<void>;

beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: "pglite:memory",
    BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-chars",
    BETTER_AUTH_URL: origin,
    EMAIL_DELIVERY: "memory",
  });
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
  const harness = await createTestContext();
  ctx = harness.ctx;
  closeDatabase = harness.close;
});

beforeEach(async () => {
  await resetData(ctx);
  ctx.extractVisit = undefined;
  ctx.classifyIssue = undefined;
  ctx.extractClaim = undefined;
  ctx.investigateBilling = undefined;
});

afterAll(async () => {
  await closeDatabase();
});

async function completeSelf(email: string) {
  const created = await register(ctx, email);
  const slug = email.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40);
  await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
  const family = await api(ctx, "/api/onboarding/family", {
    method: "POST",
    cookie: created.cookie,
    idempotencyKey: `family-${slug}`,
    body: { patients: [selfPatient(`self-${slug}`)] },
  });
  await api(ctx, "/api/onboarding/coverage", {
    method: "POST",
    cookie: created.cookie,
    idempotencyKey: `coverage-${slug}`,
    body: { skip: true },
  });
  await api(ctx, "/api/onboarding/review", {
    method: "POST",
    cookie: created.cookie,
    idempotencyKey: `review-${slug}`,
    body: {},
  });
  return { cookie: created.cookie, patientId: family.data.onboarding.patients[0].id as string };
}

describe("visits and documents", () => {
  it("saves a visit for a patient the account can write", async () => {
    const account = await completeSelf("cases-owner@example.com");
    const created = await api(ctx, "/api/cases", {
      method: "POST",
      cookie: account.cookie,
      idempotencyKey: "visit-owner-1",
      body: { patientId: account.patientId, visitDate: "2026-10-02", provider: "Harbor Clinic", location: "Oakland", reason: "Annual" },
    });
    expect(created.status).toBe(201);
    expect(created.data.visit.patientName).toBe("Avery Quinn");
    const listed = await api(ctx, "/api/cases", { cookie: account.cookie });
    expect(listed.data.visits).toHaveLength(1);
    const opened = await api(ctx, `/api/cases/${created.data.visit.id}`, { cookie: account.cookie });
    expect(opened.status).toBe(200);
    expect(opened.data.visit.reason).toBe("Annual");
    expect(opened.data.visit.chiefComplaint).toBe("Annual");
  });

  it("saves encounter details and pre-visit intake, and remembers the clinician", async () => {
    const account = await completeSelf("visits-intake@example.com");
    const created = await api(ctx, "/api/visits", {
      method: "POST",
      cookie: account.cookie,
      idempotencyKey: "visit-intake-1",
      body: {
        patientId: account.patientId,
        visitDate: "2026-10-08",
        startTime: "09:15",
        provider: "Dr. Elena Park",
        providerRole: "physician",
        modality: "in_person_outpatient",
        chiefComplaint: "I have had a sore throat for three days.",
        allergies: [{ substance: "Penicillin", severity: "anaphylactic" }],
        medications: [{ name: "Vitamin D", dosage: "2000 IU daily", kind: "supplement" }],
      },
    });
    expect(created.status).toBe(201);
    expect(created.data.visit.startTime).toBe("09:15");
    expect(created.data.visit.modality).toBe("in_person_outpatient");
    expect(created.data.visit.chiefComplaint).toBe("I have had a sore throat for three days.");
    expect(created.data.visit.allergies).toEqual([{ substance: "Penicillin", severity: "anaphylactic" }]);
    expect(created.data.visit.medications[0].name).toBe("Vitamin D");
    const household = await api(ctx, "/api/household", { cookie: account.cookie });
    expect(household.data.households[0].clinicians).toEqual([
      expect.objectContaining({ displayName: "Dr. Elena Park", role: "physician" }),
    ]);
  });

  it("stores and returns a private document for that visit", async () => {
    const account = await completeSelf("cases-docs@example.com");
    const created = await api(ctx, "/api/cases", {
      method: "POST",
      cookie: account.cookie,
      idempotencyKey: "visit-docs-1",
      body: { patientId: account.patientId, visitDate: "2026-10-03", provider: "", location: "", reason: "" },
    });
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]);
    const form = new FormData();
    form.set("kind", "bill");
    form.set("file", new File([bytes], "harbor-bill.pdf", { type: "application/pdf" }));
    const uploaded = await dispatch(
      new Request(`${origin}/api/cases/${created.data.visit.id}/documents`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: form,
      }),
      ctx,
    );
    expect(uploaded.status).toBe(201);
    const body = await uploaded.json();
    expect(body.document.filename).toBe("harbor-bill.pdf");
    const opened = await api(ctx, `/api/cases/${created.data.visit.id}`, { cookie: account.cookie });
    expect(opened.data.documents).toHaveLength(1);
    const download = await dispatch(
      new Request(`${origin}/api/documents/${body.document.id}`, { headers: { cookie: account.cookie } }),
      ctx,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    const saved = new Uint8Array(await download.arrayBuffer());
    expect(Array.from(saved)).toEqual(Array.from(bytes));
  });

  it("stores multiple bills and an adjusted bill on the same visit", async () => {
    const account = await completeSelf("cases-multibill@example.com");
    const created = await api(ctx, "/api/visits", {
      method: "POST",
      cookie: account.cookie,
      idempotencyKey: "visit-multibill",
      body: { patientId: account.patientId, visitDate: "2026-10-03", provider: "Harbor Clinic" },
    });
    const bills = new FormData();
    bills.set("kind", "bill");
    bills.append("file", new File([new Uint8Array([37, 80, 68, 70, 45, 49])], "harbor-professional.pdf", { type: "application/pdf" }));
    bills.append("file", new File([new Uint8Array([37, 80, 68, 70, 45, 50])], "harbor-facility.pdf", { type: "application/pdf" }));
    const uploadedBills = await dispatch(
      new Request(`${origin}/api/visits/${created.data.visit.id}/documents`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: bills,
      }),
      ctx,
    );
    expect(uploadedBills.status).toBe(201);
    const billBody = await uploadedBills.json();
    expect(billBody.documents).toHaveLength(2);
    const adjusted = new FormData();
    adjusted.set("kind", "adjusted_bill");
    adjusted.append("file", new File([new Uint8Array([37, 80, 68, 70, 45, 51])], "harbor-professional-adjusted.pdf", { type: "application/pdf" }));
    const uploadedAdjusted = await dispatch(
      new Request(`${origin}/api/visits/${created.data.visit.id}/documents`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: adjusted,
      }),
      ctx,
    );
    expect(uploadedAdjusted.status).toBe(201);
    const opened = await api(ctx, `/api/visits/${created.data.visit.id}`, { cookie: account.cookie });
    expect(opened.data.documents.map((file: { kind: string; filename: string }) => `${file.kind}:${file.filename}`)).toEqual([
      "bill:harbor-professional.pdf",
      "bill:harbor-facility.pdf",
      "adjusted_bill:harbor-professional-adjusted.pdf",
    ]);
  });

  it("does not create a second document when the same file is uploaded again", async () => {
    const account = await completeSelf("cases-dupbill@example.com");
    const created = await api(ctx, "/api/visits", {
      method: "POST",
      cookie: account.cookie,
      idempotencyKey: "visit-dupbill",
      body: { patientId: account.patientId, visitDate: "2026-10-03" },
    });
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 57]);
    const first = new FormData();
    first.set("kind", "bill");
    first.set("file", new File([bytes], "harbor-bill.pdf", { type: "application/pdf" }));
    const uploaded = await dispatch(
      new Request(`${origin}/api/visits/${created.data.visit.id}/documents`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: first,
      }),
      ctx,
    );
    const firstBody = await uploaded.json();
    const again = new FormData();
    again.set("kind", "adjusted_bill");
    again.set("file", new File([bytes], "harbor-bill-again.pdf", { type: "application/pdf" }));
    const duplicate = await dispatch(
      new Request(`${origin}/api/visits/${created.data.visit.id}/documents`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: again,
      }),
      ctx,
    );
    const duplicateBody = await duplicate.json();
    expect(duplicateBody.document.id).toBe(firstBody.document.id);
    const opened = await api(ctx, `/api/visits/${created.data.visit.id}`, { cookie: account.cookie });
    expect(opened.data.documents).toHaveLength(1);
  });

  it("does not let household administration stand in for record access", async () => {
    const caregiver = await register(ctx, "cases-caregiver@example.com");
    await saveProfile(ctx, caregiver.cookie, "Casey Quinn", "someone_else");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: caregiver.cookie,
      idempotencyKey: "family-cases-caregiver",
      body: { patients: [adultPatient("adult-cases", "adult-cases@example.com")] },
    });
    const created = await api(ctx, "/api/cases", {
      method: "POST",
      cookie: caregiver.cookie,
      idempotencyKey: "visit-denied",
      body: { patientId: family.data.onboarding.patients[0].id, visitDate: "2026-10-04" },
    });
    expect(created.status).toBe(403);
    expect(created.data.error.code).toBe("grant_required");
  });

  it("keeps visit details if document storage is not configured", async () => {
    const account = await completeSelf("cases-nostore@example.com");
    const created = await api(ctx, "/api/cases", {
      method: "POST",
      cookie: account.cookie,
      idempotencyKey: "visit-nostore",
      body: { patientId: account.patientId, visitDate: "2026-10-05" },
    });
    const previous = ctx.storage;
    ctx.storage = createUnconfiguredFileStore();
    const form = new FormData();
    form.set("kind", "bill");
    form.set("file", new File([new Uint8Array([37, 80, 68, 70])], "bill.pdf", { type: "application/pdf" }));
    const uploaded = await dispatch(
      new Request(`${origin}/api/cases/${created.data.visit.id}/documents`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: form,
      }),
      ctx,
    );
    ctx.storage = previous;
    expect(uploaded.status).toBe(503);
    expect((await uploaded.json()).error.code).toBe("storage_unconfigured");
  });

  it("lists no visits until one is saved", async () => {
    const account = await completeSelf("visits-empty@example.com");
    const listed = await api(ctx, "/api/visits", { cookie: account.cookie });
    expect(listed.status).toBe(200);
    expect(listed.data.visits).toEqual([]);
  });

  it("drafts visit fields from a document without saving a visit", async () => {
    const account = await completeSelf("visits-extract@example.com");
    let seenPatients: string[] = [];
    ctx.extractVisit = async (input) => {
      seenPatients = input.patients.map((person) => `${person.givenName} ${person.familyName}`);
      return {
        patientName: "Avery Quinn",
        visitDate: "2026-10-02",
        startTime: "14:30",
        provider: "Harbor Clinic",
        providerRole: "physician",
        modality: "in_person_outpatient",
        location: "Oakland",
        reason: "Annual",
        chiefComplaint: "I've had a persistent cough for two weeks.",
        allergies: [{ substance: "Latex", severity: "mild" }],
        medications: [{ name: "Lisinopril", dosage: "10 mg", kind: "prescription" }],
      };
    };
    const form = new FormData();
    form.set("file", new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "harbor-bill.pdf", { type: "application/pdf" }));
    const extracted = await dispatch(
      new Request(`${origin}/api/visits/extract`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: form,
      }),
      ctx,
    );
    expect(extracted.status).toBe(200);
    const body = await extracted.json();
    expect(body.persisted).toBe(false);
    expect(seenPatients).toContain("Avery Quinn");
    expect(body.draft.visitDate).toBe("2026-10-02");
    expect(body.draft.startTime).toBe("14:30");
    expect(body.draft.provider).toBe("Harbor Clinic");
    expect(body.draft.providerRole).toBe("physician");
    expect(body.draft.modality).toBe("in_person_outpatient");
    expect(body.draft.chiefComplaint).toBe("I've had a persistent cough for two weeks.");
    expect(body.draft.allergies).toEqual([{ substance: "Latex", severity: "mild" }]);
    expect(body.draft.medications).toEqual([{ name: "Lisinopril", dosage: "10 mg", kind: "prescription" }]);
    expect(body.draft.patientId).toBe(account.patientId);
    const listed = await api(ctx, "/api/visits", { cookie: account.cookie });
    expect(listed.data.visits).toEqual([]);
    ctx.extractVisit = undefined;
  });

  it("asks the user to fill a missing start time after extraction", async () => {
    const account = await completeSelf("visits-extract-time@example.com");
    ctx.extractVisit = async () => ({
      patientName: "Avery Quinn",
      visitDate: "2026-10-02",
      startTime: null,
      provider: "Dr. Elena Park",
      providerRole: "physician",
      modality: "telehealth_video",
      location: null,
      reason: null,
      chiefComplaint: "Follow-up",
      allergies: [],
      medications: [],
    });
    const form = new FormData();
    form.set("file", new File([new Uint8Array([37, 80, 68, 70])], "note.pdf", { type: "application/pdf" }));
    const extracted = await dispatch(
      new Request(`${origin}/api/visits/extract`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: form,
      }),
      ctx,
    );
    expect(extracted.status).toBe(200);
    const body = await extracted.json();
    expect(body.persisted).toBe(false);
    expect(body.draft.startTime).toBe("");
    expect(body.draft.warnings).toContain("No start time was read. Enter the time before saving.");
    ctx.extractVisit = undefined;
  });

  it("does not invent a visit when extraction is not configured", async () => {
    const account = await completeSelf("visits-noai@example.com");
    ctx.extractVisit = undefined;
    const form = new FormData();
    form.set("file", new File([new Uint8Array([37, 80, 68, 70])], "bill.pdf", { type: "application/pdf" }));
    const extracted = await dispatch(
      new Request(`${origin}/api/visits/extract`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: form,
      }),
      ctx,
    );
    expect(extracted.status).toBe(503);
    expect((await extracted.json()).error.code).toBe("extract_unconfigured");
    const listed = await api(ctx, "/api/visits", { cookie: account.cookie });
    expect(listed.data.visits).toEqual([]);
  });

  it("does not look into a charge when classification is not configured", async () => {
    const account = await completeSelf("visits-ask-noai@example.com");
    const created = await api(ctx, "/api/visits", {
      method: "POST",
      cookie: account.cookie,
      idempotencyKey: "visit-ask-noai",
      body: { patientId: account.patientId, visitDate: "2026-10-02" },
    });
    const asked = await api(ctx, `/api/visits/${created.data.visit.id}/ask`, {
      method: "POST",
      cookie: account.cookie,
      body: { request: "Explain this charge." },
    });
    expect(asked.status).toBe(503);
    expect(asked.data.error.code).toBe("openrouter_unconfigured");
  });

  it("classifies a billing question without saving, and skips investigation when uncertain", async () => {
    const account = await completeSelf("visits-ask-uncertain@example.com");
    const created = await api(ctx, "/api/visits", {
      method: "POST",
      cookie: account.cookie,
      idempotencyKey: "visit-ask-uncertain",
      body: { patientId: account.patientId, visitDate: "2026-10-02", provider: "Harbor Clinic" },
    });
    let investigated = false;
    ctx.classifyIssue = async () => ({
      issue: "explain_charge",
      confidence: 0.41,
      probabilities: { explain_charge: 0.4, payment_missing: 0.3, track_correction: 0.2, other: 0.1 },
      needsDocument: 0.9,
      uncertain: true,
      route: "needs_confirmation",
    });
    ctx.investigateBilling = async () => {
      investigated = true;
      return { finding: "possible_discrepancy", explanations: ["Should not run"], missingInformation: [], assumptions: [] };
    };
    const asked = await api(ctx, `/api/visits/${created.data.visit.id}/ask`, {
      method: "POST",
      cookie: account.cookie,
      body: { request: "Something looks off on this bill." },
    });
    expect(asked.status).toBe(200);
    expect(asked.data.persisted).toBe(false);
    expect(asked.data.classification.route).toBe("needs_confirmation");
    expect(asked.data.investigation).toBeNull();
    expect(investigated).toBe(false);
  });

  it("extracts claim evidence and compares it with typed coverage without saving", async () => {
    const account = await completeSelf("visits-ask-investigate@example.com");
    const created = await api(ctx, "/api/visits", {
      method: "POST",
      cookie: account.cookie,
      idempotencyKey: "visit-ask-investigate",
      body: { patientId: account.patientId, visitDate: "2026-10-02", provider: "Harbor Clinic" },
    });
    const form = new FormData();
    form.set("kind", "eob");
    form.set("file", new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "harbor-eob.pdf", { type: "application/pdf" }));
    await dispatch(
      new Request(`${origin}/api/visits/${created.data.visit.id}/documents`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: form,
      }),
      ctx,
    );
    let seenRequest = "";
    ctx.classifyIssue = async (input) => {
      seenRequest = input.request;
      return {
        issue: "explain_charge",
        confidence: 0.96,
        probabilities: { explain_charge: 0.96, payment_missing: 0.02, track_correction: 0.01, other: 0.01 },
        needsDocument: 0.91,
        uncertain: false,
        route: "investigate",
      };
    };
    ctx.extractClaim = async () => ({
      patientName: "Avery Quinn",
      providerName: "Harbor Clinic",
      visitDate: "2026-10-02",
      claimNumber: "CL-100",
      accountNumber: null,
      documentKind: "eob",
      serviceLines: [{ description: "Office visit", serviceDate: "2026-10-02", billedAmountUsd: "180.00", allowedAmountUsd: "120.00", planPaidUsd: "80.00", memberResponsibilityUsd: "40.00" }],
      totals: { billedAmountUsd: "180.00", planPaidUsd: "80.00", memberResponsibilityUsd: "40.00" },
    });
    ctx.investigateBilling = async (input) => {
      expect(input.evidence[0]?.extracted.claimNumber).toBe("CL-100");
      expect(input.planPassages.length).toBeGreaterThan(0);
      return {
        finding: "possible_discrepancy",
        explanations: ["The EOB assigns $40 member responsibility. Confirm whether that matches the office visit copay on file."],
        missingInformation: ["No payment record is attached to this visit."],
        assumptions: ["The EOB is treated as applicable until a later adjustment is on file."],
      };
    };
    const asked = await api(ctx, `/api/visits/${created.data.visit.id}/ask`, {
      method: "POST",
      cookie: account.cookie,
      body: { request: "Explain this $40 charge." },
    });
    expect(asked.status).toBe(200);
    expect(seenRequest).toBe("Explain this $40 charge.");
    expect(asked.data.persisted).toBe(false);
    expect(asked.data.investigation.finding).toBe("possible_discrepancy");
    expect(asked.data.evidence[0].extracted.totals.memberResponsibilityUsd).toBe("40.00");
  });

  it("does not invent claim lines when an attached document cannot be read", async () => {
    const account = await completeSelf("visits-ask-unread@example.com");
    const created = await api(ctx, "/api/visits", {
      method: "POST",
      cookie: account.cookie,
      idempotencyKey: "visit-ask-unread",
      body: { patientId: account.patientId, visitDate: "2026-10-02", provider: "Harbor Clinic" },
    });
    const form = new FormData();
    form.set("kind", "bill");
    form.set("file", new File([new Uint8Array([37, 80, 68, 70])], "blurry.pdf", { type: "application/pdf" }));
    await dispatch(
      new Request(`${origin}/api/visits/${created.data.visit.id}/documents`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: form,
      }),
      ctx,
    );
    let investigated = false;
    ctx.classifyIssue = async () => ({
      issue: "explain_charge",
      confidence: 0.94,
      probabilities: { explain_charge: 0.94, payment_missing: 0.03, track_correction: 0.02, other: 0.01 },
      needsDocument: 0.88,
      uncertain: false,
      route: "investigate",
    });
    ctx.extractClaim = async () => {
      throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved.");
    };
    ctx.investigateBilling = async () => {
      investigated = true;
      return { finding: "possible_discrepancy", explanations: ["Should not run"], missingInformation: [], assumptions: [] };
    };
    const asked = await api(ctx, `/api/visits/${created.data.visit.id}/ask`, {
      method: "POST",
      cookie: account.cookie,
      body: { request: "Explain this charge." },
    });
    expect(asked.status).toBe(200);
    expect(asked.data.persisted).toBe(false);
    expect(asked.data.investigation.finding).toBe("insufficient_information");
    expect(asked.data.investigation.missingInformation[0]).toContain("blurry.pdf");
    expect(investigated).toBe(false);
  });
});
