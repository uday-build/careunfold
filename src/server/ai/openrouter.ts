import { HttpError } from "../http/errors";

const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

export function openRouterConfigured(source: NodeJS.ProcessEnv = process.env) {
  return Boolean(source.OPENROUTER_API_KEY?.trim());
}

export function extractionConfigured(source: NodeJS.ProcessEnv = process.env) {
  return openRouterConfigured(source) || Boolean(source.AI_GATEWAY_API_KEY?.trim() || source.VERCEL_OIDC_TOKEN?.trim());
}

export function openRouterModels(source: NodeJS.ProcessEnv = process.env) {
  return {
    classify: normalizeModelId(source.OPENROUTER_CLASSIFY_MODEL, "typesafe/jev-1.14"),
    extract: normalizeModelId(source.OPENROUTER_EXTRACT_MODEL, "google/gemini-3.8-flash"),
    investigate: normalizeModelId(source.OPENROUTER_INVESTIGATE_MODEL, "anthropic/claude-sonnet-5.5"),
  };
}

function normalizeModelId(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith("~")) return trimmed;
  if (/^[a-z0-9-]+\/[a-z0-9._-]+-latest$/i.test(trimmed)) return `~${trimmed}`;
  return trimmed;
}

export function requireOpenRouter(source: NodeJS.ProcessEnv = process.env, message = "This look-into step is not configured yet.") {
  const apiKey = source.OPENROUTER_API_KEY?.trim();
  if (!apiKey) throw new HttpError(503, "openrouter_unconfigured", message);
  return apiKey;
}

export async function openRouterDecision(body: Record<string, unknown>) {
  return requestJson(DECISIONS_URL, body, "The request could not be classified. Nothing was saved.");
}

export async function openRouterChat(body: Record<string, unknown>) {
  const data = await requestJson(`${OPENROUTER_URL}/chat/completions`, body, "The model could not complete that step. Nothing was saved.");
  const text = messageText(data);
  if (!text) {
    throw new HttpError(502, "openrouter_failed", "The model could not complete that step. Nothing was saved.");
  }
  return { data, text };
}

function requestHeaders(apiKey: string) {
  const origin = process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": origin,
    "X-Title": "CareUnfold",
  };
}

async function requestJson(url: string, body: Record<string, unknown>, failedMessage: string) {
  const apiKey = requireOpenRouter();
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: requestHeaders(apiKey),
      body: JSON.stringify(body),
    });
  } catch {
    throw new HttpError(502, "openrouter_failed", failedMessage);
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    throw new HttpError(502, "openrouter_failed", failedMessage);
  }
  if (!response.ok) {
    throw new HttpError(502, "openrouter_failed", apiErrorMessage(data, failedMessage));
  }
  return data as Record<string, unknown>;
}

function apiErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const error = (data as { error?: unknown }).error;
  const text =
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error && typeof error.message === "string"
        ? error.message
        : "";
  const trimmed = text.replace(/\s+/g, " ").trim().slice(0, 240);
  return trimmed ? `${fallback} ${trimmed}` : fallback;
}

function messageText(data: Record<string, unknown>) {
  const choices = data.choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return "";
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

export function parseJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // The model did not return JSON. The caller maps this to a user-facing failure.
  }
  throw new HttpError(502, "openrouter_failed", "The model could not complete that step. Nothing was saved.");
}

export function fileContentPart(filename: string, mimeType: string, bytes: Uint8Array) {
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  if (mimeType === "application/pdf") {
    return { type: "file", file: { filename, file_data: dataUrl } };
  }
  return { type: "image_url", image_url: { url: dataUrl } };
}

export const openRouterPrivacy = {
  zdr: true,
  data_collection: "deny" as const,
  require_parameters: true,
};
