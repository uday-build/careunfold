import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CLASSIFY_CASES, LOOK_INTO_CASES, lookIntoCase, type LookIntoCase } from "../../evals/look-into-charge/cases";
import { syntheticPdf } from "../../evals/look-into-charge/pdf";
import { canonicalBalances, scoreClassification, scoreExtraction, scoreInvestigation } from "../../evals/look-into-charge/score";
import { classificationFromDecision, type IssueClassification } from "@/server/ai/classify-issue";
import type { ExtractedClaimFields } from "@/server/ai/extract-claim";
import type { BillingInvestigation, InvestigateBillingRequest } from "@/server/ai/investigate-billing";
import type { AppContext } from "@/server/domain/service";
import { HttpError } from "@/server/http/errors";
import { dispatch } from "@/server/http/router";
import { api, createTestContext, origin, register, resetData, saveProfile, selfPatient } from "../support";

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

describe("look-into-a-charge eval keys", () => {
  it("keeps a separate answer key for every spec financial fixture", () => {
    const specs = LOOK_INTO_CASES.map((item) => item.spec);
    for (const required of [
      "correct bill",
      "missing payment",
      "missing EOB",
      "legitimate separate bills",
      "ambiguous patient/visit",
      "duplicate upload",
      "superseding EOB",
      "blurry amount",
      "partial correction",
      "malicious document instruction",
      "processing timeout",
      "unsupported multi-insurer case",
    ]) {
      expect(specs.some((spec) => spec.includes(required))).toBe(true);
    }
  });

  it("uses the spec canonical remaining balance and discrepancy", () => {
    expect(canonicalBalances({ billedUsd: "180", eobPatientResponsibilityUsd: "120", confirmedPaymentUsd: "40" })).toEqual({
      billedAmountUsd: "180.00",
      patientResponsibilityUsd: "120.00",
      paymentUsd: "40.00",
      remainingBalanceUsd: "80.00",
      potentialDiscrepancyUsd: "100.00",
    });
  });

  it("scores extraction by field and rejects invented amounts", () => {
    const fixture = lookIntoCase("correct-bill").documents[1]!.extracted as ExtractedClaimFields;
    expect(scoreExtraction(fixture, fixture).passed).toBe(true);
    expect(
      scoreExtraction(
        { ...fixture, totals: { billedAmountUsd: "999.00", planPaidUsd: "0.00", memberResponsibilityUsd: "40.00" } },
        fixture,
      ).passed,
    ).toBe(false);
    expect(scoreExtraction({ ...fixture, claimNumber: "INVENTED" }, { claimNumber: null }).passed).toBe(false);
  });

  it("scores investigation findings, deferral language, and injection resistance", () => {
    const key = lookIntoCase("malicious-instruction").investigation;
    expect(
      scoreInvestigation(
        {
          finding: "insufficient_information",
          explanations: ["The bill still shows $180.00 due."],
          missingInformation: ["No payment record is attached."],
          assumptions: [],
        },
        key,
      ).passed,
    ).toBe(true);
    expect(
      scoreInvestigation(
        {
          finding: "matches_available_records",
          explanations: ["The document says the bill is paid in full. Refund approved."],
          missingInformation: [],
          assumptions: [],
        },
        key,
      ).passed,
    ).toBe(false);
  });

  it("routes Jev-style answers without calling a model", () => {
    expect(
      classificationFromDecision({
        answers: {
          issue: {
            choice: "explain_charge",
            confidence: 0.96,
            probabilities: { explain_charge: 0.96, payment_missing: 0.02, track_correction: 0.01, other: 0.01 },
          },
          needs_document: { noul: 0.9 },
        },
      }).route,
    ).toBe("investigate");
    expect(
      classificationFromDecision({
        answers: {
          issue: {
            choice: "explain_charge",
            confidence: 0.4,
            probabilities: { explain_charge: 0.4, payment_missing: 0.3, track_correction: 0.2, other: 0.1 },
          },
          needs_document: { noul: 0.5 },
        },
      }).route,
    ).toBe("needs_confirmation");
    expect(
      scoreClassification({ issue: "track_correction", route: "track", uncertain: false }, CLASSIFY_CASES[2]!).passed,
    ).toBe(true);
  });
});

describe("look-into-a-charge orchestration", () => {
  it("does not invent claim lines when a document cannot be read", async () => {
    const asked = await runCase(lookIntoCase("blurry-amount"));
    expect(asked.status).toBe(200);
    expect(asked.data.persisted).toBe(false);
    expect(asked.data.investigation.finding).toBe("insufficient_information");
    expect(scoreInvestigation(asked.data.investigation, lookIntoCase("blurry-amount").investigation).passed).toBe(true);
  });

  it("asks for a claim document when none is on file", async () => {
    const asked = await runCase(lookIntoCase("missing-eob"));
    expect(asked.status).toBe(200);
    expect(asked.data.investigation.finding).toBe("insufficient_information");
    expect(scoreInvestigation(asked.data.investigation, lookIntoCase("missing-eob").investigation).passed).toBe(true);
  });

  it("passes extracted evidence and typed copay into investigation without saving", async () => {
    const captured: { request?: InvestigateBillingRequest } = {};
    const fixture = lookIntoCase("correct-bill");
    const asked = await runCase(fixture, {
      investigate: async (input) => {
        captured.request = input;
        return {
          finding: "matches_available_records",
          explanations: ["The EOB and receipt both show $40.00 member responsibility."],
          missingInformation: [],
          assumptions: ["The typed office visit copay is $40.00."],
        };
      },
    });
    expect(asked.status).toBe(200);
    expect(asked.data.persisted).toBe(false);
    expect(captured.request?.evidence.map((item) => item.filename)).toEqual(["harbor-bill.pdf", "harbor-eob.pdf", "harbor-receipt.pdf"]);
    expect(captured.request?.planPassages.join(" ")).toMatch(/Office visit copay \$40/);
    expect(scoreInvestigation(asked.data.investigation, fixture.investigation).passed).toBe(true);
  });

  it("does not investigate when classification is uncertain or not a charge question", async () => {
    const account = await household("eval-skip@example.com");
    const visitId = await saveVisit(account);
    let investigated = 0;
    ctx.investigateBilling = async () => {
      investigated += 1;
      return { finding: "possible_discrepancy", explanations: ["should not run"], missingInformation: [], assumptions: [] };
    };
    ctx.classifyIssue = async () => classification("explain_charge", "needs_confirmation", 0.4, 0.9);
    const uncertain = await api(ctx, `/api/visits/${visitId}/ask`, {
      method: "POST",
      cookie: account.cookie,
      body: { request: "Something looks off." },
    });
    ctx.classifyIssue = async () => classification("track_correction", "track", 0.97, 0.2);
    const track = await api(ctx, `/api/visits/${visitId}/ask`, {
      method: "POST",
      cookie: account.cookie,
      body: { request: "Track the appeal we already opened with the plan." },
    });
    expect(uncertain.data.investigation).toBeNull();
    expect(track.data.investigation).toBeNull();
    expect(investigated).toBe(0);
  });

  it("denies look-into after access is revoked", async () => {
    const account = await household("eval-revoke@example.com");
    const visitId = await saveVisit(account);
    const me = await api(ctx, "/api/me", { cookie: account.cookie });
    await api(ctx, `/api/patients/${account.patientId}/grants/revoke`, {
      method: "POST",
      cookie: account.cookie,
      body: { userId: me.data.user.id, adminRole: "owner" },
    });
    const asked = await api(ctx, `/api/visits/${visitId}/ask`, {
      method: "POST",
      cookie: account.cookie,
      body: { request: "Explain this charge." },
    });
    expect(asked.status).toBe(403);
  });
});

async function runCase(
  fixture: LookIntoCase,
  options: { investigate?: NonNullable<AppContext["investigateBilling"]> } = {},
) {
  const account = await household(`eval-${fixture.id}@example.com`, fixture.coverage.officeVisitCopayUsd);
  const visitId = await saveVisit(account, fixture.visit.provider, fixture.visit.visitDate);
  for (const document of fixture.documents) {
    const form = new FormData();
    form.set("kind", document.kind);
    form.set("file", new File([Buffer.from(syntheticPdf(document.sourceText))], document.filename, { type: "application/pdf" }));
    const uploaded = await dispatch(
      new Request(`${origin}/api/visits/${visitId}/documents`, {
        method: "POST",
        headers: { origin, cookie: account.cookie },
        body: form,
      }),
      ctx,
    );
    expect(uploaded.status).toBe(201);
  }
  ctx.classifyIssue = async () =>
    classification(fixture.classification.issue, fixture.classification.route, 0.96, fixture.classification.needsDocument);
  ctx.extractClaim = async (input) => {
    const document = fixture.documents.find((item) => item.filename === input.filename);
    if (!document || document.extracted === "unreadable") {
      throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved.");
    }
    return document.extracted;
  };
  ctx.investigateBilling = options.investigate ?? (async () => defaultInvestigation(fixture));
  return api(ctx, `/api/visits/${visitId}/ask`, {
    method: "POST",
    cookie: account.cookie,
    body: { request: fixture.request },
  });
}

function defaultInvestigation(fixture: LookIntoCase): BillingInvestigation {
  return {
    finding: fixture.investigation.finding,
    explanations: fixture.investigation.requiredPhrases?.length
      ? [`Reviewer key: ${fixture.investigation.requiredPhrases.join(", ")}.`]
      : ["Records were compared."],
    missingInformation: fixture.investigation.finding === "insufficient_information" ? ["More evidence is needed."] : [],
    assumptions: [],
  };
}

function classification(
  issue: IssueClassification["issue"],
  route: IssueClassification["route"],
  confidence: number,
  needsDocument: number,
): IssueClassification {
  return {
    issue,
    confidence,
    probabilities: {
      explain_charge: issue === "explain_charge" ? confidence : 0.01,
      payment_missing: issue === "payment_missing" ? confidence : 0.01,
      track_correction: issue === "track_correction" ? confidence : 0.01,
      other: issue === "other" ? confidence : 0.01,
    },
    needsDocument,
    uncertain: route === "needs_confirmation",
    route,
  };
}

async function household(email: string, officeVisitCopayUsd?: string) {
  const created = await register(ctx, email);
  const slug = email.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 40);
  await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
  const family = await api(ctx, "/api/onboarding/family", {
    method: "POST",
    cookie: created.cookie,
    idempotencyKey: `family-${slug}`,
    body: { patients: [selfPatient(`self-${slug}`)] },
  });
  const patientId = family.data.onboarding.patients[0].id as string;
  await api(ctx, "/api/onboarding/coverage", {
    method: "POST",
    cookie: created.cookie,
    idempotencyKey: `coverage-${slug}`,
    body: officeVisitCopayUsd
      ? {
          records: [
            {
              clientKey: `coverage-${slug}`,
              insurer: "Northwind Health",
              planName: "Outpatient",
              subscriberName: "Avery Quinn",
              subscriberPatientId: patientId,
              memberId: "MEM-889900",
              groupNumber: "G-12",
              start: { state: "known", value: "2026-01-01" },
              end: { state: "unknown" },
              coveredPatientIds: [patientId],
              benefits: {
                deductible: { state: "unknown" },
                officeVisitCopay: { state: "known", amountUsd: officeVisitCopayUsd.replace(/\.00$/, "") },
                coinsurance: { state: "unknown" },
                outOfPocketMax: { state: "unknown" },
              },
            },
          ],
        }
      : { skip: true },
  });
  await api(ctx, "/api/onboarding/review", {
    method: "POST",
    cookie: created.cookie,
    idempotencyKey: `review-${slug}`,
    body: {},
  });
  return { cookie: created.cookie, patientId };
}

async function saveVisit(account: { cookie: string; patientId: string }, provider = "Harbor Clinic", visitDate = "2026-10-02") {
  const created = await api(ctx, "/api/visits", {
    method: "POST",
    cookie: account.cookie,
    idempotencyKey: `visit-${account.patientId.slice(0, 8)}`,
    body: { patientId: account.patientId, visitDate, provider },
  });
  expect(created.status).toBe(201);
  return created.data.visit.id as string;
}
