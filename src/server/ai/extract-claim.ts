import { z } from "zod";
import { HttpError } from "../http/errors";
import { fileContentPart, openRouterChat, openRouterModels, openRouterPrivacy, parseJsonObject } from "./openrouter";

const money = z.string().trim().nullable();

export const extractedClaimSchema = z.object({
  patientName: z.string().trim().nullable(),
  providerName: z.string().trim().nullable(),
  visitDate: z.string().trim().nullable(),
  claimNumber: z.string().trim().nullable(),
  accountNumber: z.string().trim().nullable(),
  documentKind: z.enum(["bill", "adjusted_bill", "eob", "receipt", "other"]).nullable(),
  serviceLines: z
    .array(
      z.object({
        description: z.string().trim().nullable(),
        serviceDate: z.string().trim().nullable(),
        billedAmountUsd: money,
        allowedAmountUsd: money,
        planPaidUsd: money,
        memberResponsibilityUsd: money,
      }),
    )
    .nullable(),
  totals: z
    .object({
      billedAmountUsd: money,
      planPaidUsd: money,
      memberResponsibilityUsd: money,
    })
    .nullable(),
});

export type ExtractedClaimFields = z.infer<typeof extractedClaimSchema>;

export type ClaimExtractRequest = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  kind?: string;
};

export async function extractClaimEvidence(input: ClaimExtractRequest): Promise<ExtractedClaimFields> {
  const { text } = await openRouterChat({
    model: openRouterModels().extract,
    provider: { ...openRouterPrivacy, only: ["google"] },
    plugins: input.mimeType === "application/pdf" ? [{ id: "file-parser", pdf: { engine: "native" } }] : undefined,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "claim_extraction",
        strict: true,
        schema: claimJsonSchema,
      },
    },
    messages: [
      {
        role: "system",
        content:
          "Extract billing evidence from a medical bill, adjusted bill, explanation of benefits, receipt, or similar claim document. Return patient name, provider, dates, claim or account references, service lines, and amounts. Use null or empty arrays when a field is not clearly present. Do not invent amounts, dates, names, or claim numbers. Dates must be YYYY-MM-DD. Money must be decimal strings such as 40.00. If the document is a corrected or adjusted bill, set documentKind to adjusted_bill.",
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Extract the claim fields from this ${input.kind || "document"}. Leave a field null rather than guessing. The user will review the result.`,
          },
          fileContentPart(input.filename, input.mimeType, input.bytes),
        ],
      },
    ],
  });
  const parsed = extractedClaimSchema.safeParse(parseJsonObject(text));
  if (!parsed.success) {
    throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved.");
  }
  return parsed.data;
}

const claimJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "patientName",
    "providerName",
    "visitDate",
    "claimNumber",
    "accountNumber",
    "documentKind",
    "serviceLines",
    "totals",
  ],
  properties: {
    patientName: { type: ["string", "null"] },
    providerName: { type: ["string", "null"] },
    visitDate: { type: ["string", "null"] },
    claimNumber: { type: ["string", "null"] },
    accountNumber: { type: ["string", "null"] },
    documentKind: { type: ["string", "null"], enum: ["bill", "adjusted_bill", "eob", "receipt", "other", null] },
    serviceLines: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "serviceDate", "billedAmountUsd", "allowedAmountUsd", "planPaidUsd", "memberResponsibilityUsd"],
        properties: {
          description: { type: ["string", "null"] },
          serviceDate: { type: ["string", "null"] },
          billedAmountUsd: { type: ["string", "null"] },
          allowedAmountUsd: { type: ["string", "null"] },
          planPaidUsd: { type: ["string", "null"] },
          memberResponsibilityUsd: { type: ["string", "null"] },
        },
      },
    },
    totals: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["billedAmountUsd", "planPaidUsd", "memberResponsibilityUsd"],
      properties: {
        billedAmountUsd: { type: ["string", "null"] },
        planPaidUsd: { type: ["string", "null"] },
        memberResponsibilityUsd: { type: ["string", "null"] },
      },
    },
  },
};
