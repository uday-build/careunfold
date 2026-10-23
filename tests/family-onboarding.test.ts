import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AppContext } from "@/server/domain/service";
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
  const harness = await createTestContext();
  ctx = harness.ctx;
  closeDatabase = harness.close;
});

beforeEach(async () => {
  await resetData(ctx);
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
    });
  });
});
