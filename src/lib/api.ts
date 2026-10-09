export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; fields?: Record<string, string> };
};

export async function api<T>(path: string, init: { method?: string; body?: unknown; idempotencyKey?: string } = {}) {
  const headers = new Headers();
  if (init.body !== undefined) headers.set("content-type", "application/json");
  if (init.idempotencyKey) headers.set("idempotency-key", init.idempotencyKey);
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    return {
      ok: false as const,
      status: 0,
      data: {
        ok: false as const,
        error: {
          code: "unavailable",
          message: "We couldn't reach CareUnfold. Nothing was confirmed. Your password is only kept in this form until you leave the page.",
        },
      },
    };
  }
  const data = (await response.json()) as T | ApiFailure;
  if (!response.ok) return { ok: false as const, status: response.status, data: data as ApiFailure };
  return { ok: true as const, status: response.status, data: data as T };
}

export function safeNext(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}
