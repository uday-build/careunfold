import { z } from "zod";
import { HttpError } from "../http/errors";
import type { ExtractedClaimFields } from "./extract-claim";
import type { IssueClassification } from "./classify-issue";
import { ISSUE_LABELS } from "./classify-issue";
import { openRouterChat, openRouterModels, openRouterPrivacy, parseJsonObject } from "./openrouter";

export const billingInvestigationSchema = z.object({
  finding: z.enum(["matches_available_records", "possible_discrepancy", "insufficient_information"]),
  explanations: z.array(z.string().trim().min(1).max(500)).max(8),
  missingInformation: z.array(z.string().trim().min(1).max(500)).max(8),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(8),
});

export type BillingInvestigation = z.infer<typeof billingInvestigationSchema>;

export type InvestigateBillingRequest = {
  request: string;
  classification: IssueClassification;
  visit: { patientName: string; visitDate: string; provider: string | null };
  evidence: Array<{ filename: string; kind: string; extracted: ExtractedClaimFields }>;
  planPassages: string[];
};

export async function investigateBilling(input: InvestigateBillingRequest): Promise<BillingInvestigation> {
  const { text } = await openRouterChat({
    model: openRouterModels().investigate,
    provider: { ...openRouterPrivacy, only: ["anthropic"] },
    reasoning: { effort: "high" },
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "billing_investigation",
        strict: true,
        schema: investigationJsonSchema,
      },
    },
    messages: [
      {
        role: "system",
        content: [
          "Compare extracted billing evidence with the typed plan passages.",
          "Propose explanations for discrepancies and name missing information.",
          "Do not invent plan terms, payments, or document values.",
          "Do not say a bill is paid unless the evidence shows a payment that covers it.",
          "A promised correction is not evidence of correction.",
          "finding must be matches_available_records, possible_discrepancy, or insufficient_information.",
          "Write short factual sentences the member can review. Nothing is sent to an insurer.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          memberRequest: input.request,
          classifiedAs: ISSUE_LABELS[input.classification.issue],
          classificationConfidence: input.classification.confidence,
          visit: input.visit,
          extractedEvidence: input.evidence,
          planPassages: input.planPassages,
        }),
      },
    ],
  });
  const parsed = billingInvestigationSchema.safeParse(parseJsonObject(text));
  if (!parsed.success) {
    throw new HttpError(502, "investigate_failed", "The records could not be compared. Nothing was saved.");
  }
  return parsed.data;
}

const investigationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["finding", "explanations", "missingInformation", "assumptions"],
  properties: {
    finding: {
      type: "string",
      enum: ["matches_available_records", "possible_discrepancy", "insufficient_information"],
    },
    explanations: { type: "array", items: { type: "string" } },
    missingInformation: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
  },
};
