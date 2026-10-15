import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { user } from "@/server/db/schema";
import { readMemoryMailbox } from "@/server/email/delivery";
import type { AppContext } from "@/server/domain/service";
import { api, createTestContext, origin, registerPending, resetData } from "./support";

const adminEmail = "operator@example.com";
const memberEmail = "waiting@example.com";

let ctx: AppContext;
let closeDatabase: () => Promise<void>;

beforeAll(async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: "pglite:memory",
    BETTER_AUTH_SECRET: "test-secret-must-be-at-least-32-chars",
    BETTER_AUTH_URL: origin,
    EMAIL_DELIVERY: "memory",
    ADMIN_EMAIL: adminEmail,
  });
  const harness = await createTestContext({ adminEmail });
  ctx = harness.ctx;
  closeDatabase = harness.close;
});

beforeEach(async () => {
  await resetData(ctx);
});

afterAll(async () => {
  await closeDatabase();
});

describe("access approval", () => {
  it("keeps a verified member out of the workspace until an admin approves", async () => {
    const member = await registerPending(ctx, memberEmail);
    const users = await ctx.db.select().from(user);
    expect(users[0]).toMatchObject({ email: memberEmail, accessStatus: "pending", role: "member" });
    expect(readMemoryMailbox().some((message) => message.purpose === "access_request")).toBe(true);

    const blockedMe = await api(ctx, "/api/me", { cookie: member.cookie });
    expect(blockedMe.status).toBe(200);
    expect(blockedMe.data.home).toBe("/pending-access");

    const blockedOnboarding = await api(ctx, "/api/onboarding", { cookie: member.cookie });
    expect(blockedOnboarding.status).toBe(403);
    expect(blockedOnboarding.data.error.code).toBe("access_pending");

    const operator = await registerPending(ctx, adminEmail);
    const adminUsers = await ctx.db.select().from(user);
    expect(adminUsers.find((row) => row.email === adminEmail)).toMatchObject({ role: "admin", accessStatus: "approved" });

    const listing = await api(ctx, "/api/admin/access-requests", { cookie: operator.cookie });
    expect(listing.status).toBe(200);
    expect(listing.data.users.some((item: { email: string; accessStatus: string }) => item.email === memberEmail && item.accessStatus === "pending")).toBe(true);

    const memberId = adminUsers.find((row) => row.email === memberEmail)?.id as string;
    const approved = await api(ctx, `/api/admin/users/${memberId}/access`, {
      method: "POST",
      cookie: operator.cookie,
      body: { decision: "approved" },
    });
    expect(approved.status).toBe(200);
    const allowed = await api(ctx, "/api/me", { cookie: member.cookie });
    expect(allowed.data.home).toBe("/onboarding/profile");
  });

  it("refuses admin routes to members and does not let an admin deny themselves", async () => {
    const member = await registerPending(ctx, memberEmail);
    expect((await api(ctx, "/api/admin/access-requests", { cookie: member.cookie })).status).toBe(403);
    const operator = await registerPending(ctx, adminEmail);
    const self = await api(ctx, `/api/admin/users/${(await ctx.db.select().from(user)).find((row) => row.email === adminEmail)?.id}/access`, {
      method: "POST",
      cookie: operator.cookie,
      body: { decision: "denied" },
    });
    expect(self.status).toBe(409);
  });
});
