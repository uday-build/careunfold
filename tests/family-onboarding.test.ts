import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "@/server/domain/service";
import { dispatch } from "@/server/http/router";
import { adultPatient, api, createTestContext, origin, register, resetData, saveProfile, selfPatient } from "./support";

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
  ctx.extractCoverage = undefined;
});

afterAll(async () => {
  await closeDatabase();
});

describe("family onboarding", () => {
  it("sends an approved user to family setup and records relationships, permissions, and benefits", async () => {
    const created = await register(ctx, "family-setup@example.com");
    const me = await api(ctx, "/api/me", { cookie: created.cookie });
    expect(me.data.home).toBe("/onboarding");

    await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-graph",
      body: {
        patients: [
          selfPatient("self-graph"),
          adultPatient("adult-graph", "jordan@example.com", ["profile.read", "coverage.read", "records.write"]),
        ],
      },
    });
    expect(family.status).toBe(200);
    expect(family.data.onboarding.organizingFor).toBe("both");
    expect(family.data.onboarding.patients).toHaveLength(2);
    const adult = family.data.onboarding.patients.find((person: { authorityCategory: string }) => person.authorityCategory === "adult_invitation");
    expect(adult.relationship).toBe("spouse");
    expect(adult.birthDate).toBe("1988-07-09");
    expect(adult.requestedScopes).toEqual(["profile.read", "coverage.read", "records.write"]);

    const self = family.data.onboarding.patients.find((person: { authorityCategory: string }) => person.authorityCategory === "self");
    const coverage = await api(ctx, "/api/onboarding/coverage", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "coverage-benefits",
      body: {
        records: [
          {
            clientKey: "coverage-graph",
            insurer: "Northwind Health",
            planName: "Outpatient",
            subscriberName: "Avery Quinn",
            subscriberPatientId: self.id,
            memberId: "MEM-889900",
            groupNumber: "G-12",
            start: { state: "known", value: "2026-01-01" },
            end: { state: "unknown" },
            coveredPatientIds: [self.id, adult.id],
            benefits: {
              deductible: { state: "known", amountUsd: "1500" },
              officeVisitCopay: { state: "known", amountUsd: "40" },
              coinsurance: { state: "known", percent: 20 },
              outOfPocketMax: { state: "unknown" },
            },
          },
        ],
      },
    });
    expect(coverage.status).toBe(200);
    expect(coverage.data.onboarding.coverage[0].insurer).toBe("Northwind Health");
    expect(coverage.data.onboarding.coverage[0].memberIdMasked).toBe("••00");
    expect(coverage.data.onboarding.coverage[0].benefits).toEqual({
      deductible: { state: "known", amountUsd: "1500" },
      officeVisitCopay: { state: "known", amountUsd: "40" },
      coinsurance: { state: "known", percent: 20 },
      outOfPocketMax: { state: "unknown" },
      innFamilyDeductible: { state: "unknown" },
      innFamilyOutOfPocketMax: { state: "unknown" },
      specialistCopay: { state: "unknown" },
      urgentCareCopay: { state: "unknown" },
      emergencyCopay: { state: "unknown" },
    });
  });

  it("requires group ID, member name, and member ID, and stores the rest of the ID card", async () => {
    const created = await register(ctx, "family-card@example.com");
    await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-card",
      body: { patients: [selfPatient("self-card")] },
    });
    const missing = await api(ctx, "/api/onboarding/coverage", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "coverage-card-missing",
      body: {
        records: [
          {
            clientKey: "coverage-card-missing",
            start: { state: "unknown" },
            end: { state: "unknown" },
            coveredPatientIds: [],
          },
        ],
      },
    });
    expect(missing.status).toBe(422);

    const selfId = family.data.onboarding.patients[0].id as string;
    const saved = await api(ctx, "/api/onboarding/coverage", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "coverage-card-full",
      body: {
        records: [
          {
            clientKey: "coverage-card-full",
            subscriberName: "Avery Quinn",
            memberId: "MEM-4411",
            groupNumber: "GRP-77",
            start: { state: "unknown" },
            end: { state: "unknown" },
            coveredPatientIds: [selfId],
            benefits: {
              deductible: { state: "known", amountUsd: "500" },
              officeVisitCopay: { state: "known", amountUsd: "25" },
              coinsurance: { state: "known", percent: 10 },
              outOfPocketMax: { state: "known", amountUsd: "4000" },
              innFamilyDeductible: { state: "known", amountUsd: "1000" },
              innFamilyOutOfPocketMax: { state: "known", amountUsd: "8000" },
              specialistCopay: { state: "known", amountUsd: "50" },
              urgentCareCopay: { state: "unknown" },
              emergencyCopay: { state: "known", amountUsd: "250" },
            },
            memberServicesName: "Northwind Member Services",
            memberServicesPhone: "800-555-0100",
            memberServicesUrl: "https://northwind.example/members",
            rxBin: "004336",
            rxPcn: "ADV",
            rxGrp: "RX77",
            pharmacyWebsiteUrl: "https://northwind.example/rx",
            pharmacyMemberServicesPhone: "800-555-0199",
            pharmacyPhone: "800-555-0188",
            claimsAddress: "PO Box 100, Portland OR 97201",
            claimsPhone: "800-555-0177",
            claimsUrl: "https://northwind.example/claims",
            providerSupportPhone: "800-555-0166",
          },
        ],
      },
    });
    expect(saved.status).toBe(200);
    const card = saved.data.onboarding.coverage[0];
    expect(card.groupNumber).toBe("GRP-77");
    expect(card.subscriberName).toBe("Avery Quinn");
    expect(card.memberIdMasked).toBe("••11");
    expect(card.rxBin).toBe("004336");
    expect(card.rxPcn).toBe("ADV");
    expect(card.rxGrp).toBe("RX77");
    expect(card.memberServicesName).toBe("Northwind Member Services");
    expect(card.claimsAddress).toBe("PO Box 100, Portland OR 97201");
    expect(card.providerSupportPhone).toBe("800-555-0166");
    expect(card.benefits.innFamilyDeductible).toEqual({ state: "known", amountUsd: "1000" });
    expect(card.benefits.specialistCopay).toEqual({ state: "known", amountUsd: "50" });
  });

  it("lets the relationship graph be corrected after coverage and before review", async () => {
    const created = await register(ctx, "family-edit@example.com");
    await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-edit-save",
      body: {
        patients: [
          selfPatient("self-edit"),
          adultPatient("adult-edit", "jordan-edit@example.com", ["profile.read", "coverage.read"]),
        ],
      },
    });
    expect(family.status).toBe(200);
    await api(ctx, "/api/onboarding/coverage", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "coverage-edit-skip",
      body: { skip: true },
    });
    const corrected = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-edit-correct",
      body: {
        patients: [
          { ...selfPatient("self-edit"), givenName: "Avery", familyName: "Quinn" },
          {
            ...adultPatient("adult-edit", "jordan-edit@example.com", ["profile.read", "coverage.read", "records.read"]),
            givenName: "Jordan",
            relationship: "sibling",
          },
        ],
      },
    });
    expect(corrected.status).toBe(200);
    expect(corrected.data.onboarding.currentStep).toBe("review");
    const adult = corrected.data.onboarding.patients.find((person: { authorityCategory: string }) => person.authorityCategory === "adult_invitation");
    expect(adult.relationship).toBe("sibling");
    expect(adult.requestedScopes).toEqual(["profile.read", "coverage.read", "records.read"]);
    const review = await api(ctx, "/api/onboarding/review", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "review-after-edit",
      body: {},
    });
    expect(review.status).toBe(200);
    expect(review.data.onboarding.currentStep).toBe("complete");
  });

  it("drafts coverage fields from a document without saving coverage", async () => {
    const created = await register(ctx, "coverage-extract@example.com");
    await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
    await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-coverage-extract",
      body: { patients: [selfPatient("self-coverage-extract")] },
    });
    ctx.extractCoverage = async (input) => {
      expect(input.patients.map((person) => `${person.givenName} ${person.familyName}`)).toContain("Avery Quinn");
      return {
        insurer: "Northwind Health",
        planName: "Gold PPO",
        subscriberName: "Avery Quinn",
        memberId: "MEM-4411",
        groupNumber: "GRP-77",
        startDate: "2026-01-01",
        endDate: null,
        coveredPatientNames: ["Avery Quinn"],
        deductibleUsd: "500.00",
        innFamilyDeductibleUsd: "1000",
        officeVisitCopayUsd: "25",
        specialistCopayUsd: "50",
        urgentCareCopayUsd: null,
        emergencyCopayUsd: "250",
        outOfPocketMaxUsd: "4000",
        innFamilyOutOfPocketMaxUsd: "8000",
        coinsurancePercent: 10,
        memberServicesName: "Northwind Member Services",
        memberServicesPhone: "800-555-0100",
        memberServicesUrl: "https://northwind.example/members",
        rxBin: "004336",
        rxPcn: "ADV",
        rxGrp: "RX77",
        pharmacyWebsiteUrl: null,
        pharmacyMemberServicesPhone: null,
        pharmacyPhone: null,
        claimsAddress: "PO Box 100, Portland OR 97201",
        claimsPhone: null,
        claimsUrl: null,
        providerSupportPhone: null,
      };
    };
    const form = new FormData();
    form.set("file", new File([new Uint8Array([37, 80, 68, 70, 45, 49])], "northwind-card.pdf", { type: "application/pdf" }));
    const extracted = await dispatch(
      new Request(`${origin}/api/coverage/extract`, {
        method: "POST",
        headers: { origin, cookie: created.cookie },
        body: form,
      }),
      ctx,
    );
    expect(extracted.status).toBe(200);
    const body = await extracted.json();
    expect(body.persisted).toBe(false);
    expect(body.draft.insurer).toBe("Northwind Health");
    expect(body.draft.groupNumber).toBe("GRP-77");
    expect(body.draft.memberId).toBe("MEM-4411");
    expect(body.draft.startState).toBe("known");
    expect(body.draft.startValue).toBe("2026-01-01");
    expect(body.draft.benefits.officeVisitCopay).toEqual({ state: "known", amountUsd: "25" });
    expect(body.draft.benefits.coinsurance).toEqual({ state: "known", percent: 10 });
    const household = await api(ctx, "/api/onboarding", { cookie: created.cookie });
    expect(household.data.onboarding.coverage).toEqual([]);
  });

  it("does not invent coverage when extraction is not configured", async () => {
    const created = await register(ctx, "coverage-noai@example.com");
    await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
    await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-coverage-noai",
      body: { patients: [selfPatient("self-coverage-noai")] },
    });
    const form = new FormData();
    form.set("file", new File([new Uint8Array([37, 80, 68, 70])], "card.pdf", { type: "application/pdf" }));
    const extracted = await dispatch(
      new Request(`${origin}/api/coverage/extract`, {
        method: "POST",
        headers: { origin, cookie: created.cookie },
        body: form,
      }),
      ctx,
    );
    expect(extracted.status).toBe(503);
    expect((await extracted.json()).error.code).toBe("extract_unconfigured");
  });

  it("stores the coverage card after the drafted record is saved", async () => {
    const created = await register(ctx, "coverage-cardfile@example.com");
    await saveProfile(ctx, created.cookie, "Avery Quinn", "self");
    const family = await api(ctx, "/api/onboarding/family", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "family-coverage-cardfile",
      body: { patients: [selfPatient("self-coverage-cardfile")] },
    });
    const saved = await api(ctx, "/api/onboarding/coverage", {
      method: "POST",
      cookie: created.cookie,
      idempotencyKey: "coverage-cardfile",
      body: {
        records: [
          {
            clientKey: "coverage-cardfile-key",
            subscriberName: "Avery Quinn",
            subscriberPatientId: family.data.onboarding.patients[0].id,
            memberId: "MEM-4411",
            groupNumber: "GRP-77",
            start: { state: "unknown" },
            end: { state: "unknown" },
            coveredPatientIds: [family.data.onboarding.patients[0].id],
          },
        ],
      },
    });
    expect(saved.status).toBe(200);
    const coverageId = saved.data.onboarding.coverage[0].id as string;
    const form = new FormData();
    form.set("file", new File([new Uint8Array([37, 80, 68, 70, 45, 57])], "northwind-card.pdf", { type: "application/pdf" }));
    const uploaded = await dispatch(
      new Request(`${origin}/api/coverage/${coverageId}/documents`, {
        method: "POST",
        headers: { origin, cookie: created.cookie },
        body: form,
      }),
      ctx,
    );
    expect(uploaded.status).toBe(201);
    const opened = await api(ctx, "/api/household", { cookie: created.cookie });
    expect(opened.data.households[0].coverage[0].documents).toEqual([
      expect.objectContaining({ filename: "northwind-card.pdf", kind: "id_card" }),
    ]);
  });
});
