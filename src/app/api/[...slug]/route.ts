import { dispatch } from "@/server/http/router";
import { getContext } from "@/server/context";

async function handle(request: Request) {
  const url = new URL(request.url);
  const context = getContext();
  if (url.pathname === "/api/auth" || url.pathname.startsWith("/api/auth/")) {
    return context.auth.handler(request);
  }
  return dispatch(request, context);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
