import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredFileStore } from "@/server/storage/files";
import type { AppContext } from "@/server/domain/service";
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

describe("cases and documents", () => {
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
});
