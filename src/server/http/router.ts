import { HttpError, isDatabaseUnavailable } from "./errors";
import type { AppContext } from "../domain/service";
import {
  acceptInvitation,
  addHouseholdMember,
  cancelInvitation,
  completeReview,
  createPrivacyRequest,
  getDevOutbox,
  getHousehold,
  getHouseholdById,
  getMe,
  getOnboarding,
  getPatient,
  getPublicConfig,
  getSettings,
  mutateProtectedRecords,
  previewInvitation,
  readProtectedRecords,
  rejectInvitation,
  removeHouseholdMember,
  removePendingPatient,
  revokeGrant,
  revokeOtherSessions,
  revokeSessionById,
  saveCoverageStep,
  saveFamily,
  saveProfile,
  sendInvitation,
  updatePreferences,
  type AppContext as Context,
} from "../domain/service";
import type { Actor } from "../domain/access";

export async function dispatch(request: Request, ctx: Context): Promise<Response> {
  try {
    assertOrigin(request, ctx.env.trustedOrigins);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const actor = await actorFrom(request, ctx);
    return await route(request, ctx, path, actor);
  } catch (error) {
    return errorResponse(error);
  }
}

async function route(request: Request, ctx: AppContext, path: string, actor: Actor | null): Promise<Response> {
  if (request.method === "GET" && path === "/api/public-config") return json(200, await getPublicConfig(ctx));
  if (request.method === "GET" && path === "/api/dev/outbox") return json(200, await getDevOutbox(ctx));

  const invitationLink = path.match(/^\/api\/invitation-links\/([^/]+)$/);
  if (request.method === "GET" && invitationLink) {
    return json(200, await previewInvitation(ctx, actor, decodeURIComponent(invitationLink[1])));
  }
  const invitationAccept = path.match(/^\/api\/invitation-links\/([^/]+)\/accept$/);
  if (request.method === "POST" && invitationAccept) {
    return json(200, await acceptInvitation(ctx, requireActor(actor), decodeURIComponent(invitationAccept[1])));
  }
  const invitationReject = path.match(/^\/api\/invitation-links\/([^/]+)\/reject$/);
  if (request.method === "POST" && invitationReject) {
    return json(200, await rejectInvitation(ctx, requireActor(actor), decodeURIComponent(invitationReject[1])));
  }

  if (!path.startsWith("/api/invitation-links")) {
    // Authenticated application routes continue below.
  }

  if (request.method === "GET" && path === "/api/me") {
    return json(200, await getMe(ctx, requireActor(actor)));
  }
  if (request.method === "GET" && path === "/api/onboarding") return json(200, await getOnboarding(ctx, requireActor(actor)));
  if (request.method === "POST" && path === "/api/onboarding/profile") {
    const result = await saveProfile(ctx, requireActor(actor), await readJson(request), idempotencyKey(request));
    return json(result.status, result.body);
  }
  if (request.method === "POST" && path === "/api/onboarding/family") {
    const result = await saveFamily(ctx, requireActor(actor), await readJson(request), idempotencyKey(request));
    return json(result.status, result.body);
  }
  if (request.method === "POST" && path === "/api/onboarding/coverage") {
    const result = await saveCoverageStep(ctx, requireActor(actor), await readJson(request), idempotencyKey(request));
    return json(result.status, result.body);
  }
  if (request.method === "POST" && path === "/api/onboarding/review") {
    const result = await completeReview(ctx, requireActor(actor), await readJson(request), idempotencyKey(request));
    return json(result.status, result.body);
  }
  if (request.method === "GET" && path === "/api/household") return json(200, await getHousehold(ctx, requireActor(actor)));
  const householdMatch = path.match(/^\/api\/households\/([^/]+)$/);
  if (request.method === "GET" && householdMatch) {
    return json(200, await getHouseholdById(ctx, requireActor(actor), householdMatch[1]));
  }
  if (request.method === "POST" && path === "/api/household/members") {
    const result = await addHouseholdMember(ctx, requireActor(actor), await readJson(request), idempotencyKey(request));
    return json(result.status, result.body);
  }
  if (request.method === "POST" && path === "/api/household/members/remove") {
    return json(200, await removeHouseholdMember(ctx, requireActor(actor), await readJson(request)));
  }

  const patientRecords = path.match(/^\/api\/patients\/([^/]+)\/records$/);
  if (patientRecords && request.method === "GET") {
    return json(200, await readProtectedRecords(ctx, requireActor(actor), patientRecords[1]));
  }
  if (patientRecords && request.method === "POST") {
    return json(200, await mutateProtectedRecords(ctx, requireActor(actor), patientRecords[1]));
  }
  const patientDocument = path.match(/^\/api\/patients\/([^/]+)\/documents\/([^/]+)$/);
  if (patientDocument && request.method === "GET") {
    return json(200, await readProtectedRecords(ctx, requireActor(actor), patientDocument[1]));
  }
  const patientRevoke = path.match(/^\/api\/patients\/([^/]+)\/grants\/revoke$/);
  if (patientRevoke && request.method === "POST") {
    return json(200, await revokeGrant(ctx, requireActor(actor), patientRevoke[1], await readJson(request)));
  }
  const patientRemove = path.match(/^\/api\/patients\/([^/]+)\/remove$/);
  if (patientRemove && request.method === "POST") {
    return json(200, await removePendingPatient(ctx, requireActor(actor), patientRemove[1]));
  }
  const patientMatch = path.match(/^\/api\/patients\/([^/]+)$/);
  if (patientMatch && request.method === "GET") {
    return json(200, await getPatient(ctx, requireActor(actor), patientMatch[1]));
  }

  const inviteSend = path.match(/^\/api\/invitations\/([^/]+)\/send$/);
  if (inviteSend && request.method === "POST") {
    return json(200, await sendInvitation(ctx, requireActor(actor), inviteSend[1]));
  }
  const inviteCancel = path.match(/^\/api\/invitations\/([^/]+)\/cancel$/);
  if (inviteCancel && request.method === "POST") {
    return json(200, await cancelInvitation(ctx, requireActor(actor), inviteCancel[1]));
  }

  if (request.method === "GET" && path === "/api/settings") {
    return json(200, await getSettings(ctx, requireActor(actor), request));
  }
  const revokeSession = path.match(/^\/api\/settings\/sessions\/([^/]+)\/revoke$/);
  if (revokeSession && request.method === "POST") {
    return json(200, await revokeSessionById(ctx, requireActor(actor), request, revokeSession[1]));
  }
  if (request.method === "POST" && path === "/api/settings/sessions/revoke-other") {
    return json(200, await revokeOtherSessions(ctx, requireActor(actor), request));
  }
  if (request.method === "POST" && path === "/api/settings/preferences") {
    return json(200, await updatePreferences(ctx, requireActor(actor), await readJson(request)));
  }
  if (request.method === "POST" && path === "/api/settings/privacy-requests") {
    return json(200, await createPrivacyRequest(ctx, requireActor(actor), await readJson(request)));
  }

  throw new HttpError(404, "not_found", "That page was not found.");
}

async function actorFrom(request: Request, ctx: AppContext): Promise<Actor | null> {
  const session = await ctx.auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    emailVerified: Boolean(session.user.emailVerified),
  };
}

function requireActor(actor: Actor | null): Actor {
  if (!actor) throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  return actor;
}

function assertOrigin(request: Request, origins: string[]) {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") return;
  const origin = request.headers.get("origin");
  if (!origin || !origins.includes(origin)) {
    throw new HttpError(403, "origin_rejected", "This action was rejected.");
  }
}

function idempotencyKey(request: Request): string {
  return request.headers.get("idempotency-key")?.trim() ?? "";
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "invalid_json", "The request could not be read.");
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return json(error.status, { ok: false, error: { code: error.code, message: error.message, fields: error.fields } });
  }
  if (isDatabaseUnavailable(error)) {
    return json(503, {
      ok: false,
      error: {
        code: "unavailable",
        message: "We couldn't complete that. Nothing was confirmed. Your password is not stored in this browser.",
      },
    });
  }
  console.error(JSON.stringify({ event: "request_failed" }));
  return json(500, {
    ok: false,
    error: { code: "internal", message: "Something went wrong. Nothing was confirmed." },
  });
}
