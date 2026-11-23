import { z } from "zod";
import { HttpError } from "../http/errors";
import type { ExtractedClaimFields } from "./extract-claim";
import type { IssueClassification } from "./classify-issue";
import { ISSUE_LABELS } from "./classify-issue";
import { openRouterChat, openRouterModels, openRouterPrivacy, parseJsonObject } from "./openrouter";
import { mergeInvestigationTotals, reconcileClaimTotals } from "./reconcile-totals";

const nullableCents = z.number().nullable();

export const investigationTotalsSchema = z.object({
  eobResponsibilityCents: nullableCents,
  verifiedPatientPaymentsCents: nullableCents,
  supportedRemainingCents: nullableCents,
  providerStatementBalanceCents: nullableCents,
  primaryResponsibilityCents: nullableCents,
  secondaryPaymentCents: nullableCents,
  remainingDeductibleCents: nullableCents,
  remainingOopCents: nullableCents,
  arithmeticEobNetCents: nullableCents,
  refundCents: nullableCents,
  netPatientPaymentsCents: nullableCents,
  balancesByAccountCents: z
    .array(
      z.object({
        accountId: z.string().trim().min(1),
        cents: z.number(),
      }),
    )
    .nullable(),
});

export const billingInvestigationSchema = z.object({
  finding: z.enum(["matches_available_records", "possible_discrepancy", "insufficient_information"]),
  explanations: z.array(z.string().trim().min(1).max(500)).max(8),
  missingInformation: z.array(z.string().trim().min(1).max(500)).max(8),
  assumptions: z.array(z.string().trim().min(1).max(500)).max(8),
  totalsCents: investigationTotalsSchema.optional(),
});

export type BillingInvestigation = z.infer<typeof billingInvestigationSchema>;

export type InvestigateBillingRequest = {
  request: string;
  classification: IssueClassification;
  visit: { patientName: string; visitDate: string; provider: string | null };
  evidence: Array<{ filename: string; kind: string; sourceKind?: string; extracted: ExtractedClaimFields }>;
  planPassages: string[];
};

export async function investigateBilling(input: InvestigateBillingRequest): Promise<BillingInvestigation> {
  const computedTotals = reconcileClaimTotals(input.evidence);
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
          "Extracted money fields are USD dollars. totalsCents values are integer USD cents: multiply dollars by 100.",
          "Copy precomputedTotalsCents for the four core totals unless a document clearly contradicts them.",
          "Do not leave eobResponsibilityCents, verifiedPatientPaymentsCents, supportedRemainingCents, or providerStatementBalanceCents null when precomputedTotalsCents has a number.",
          "null means unknown or not applicable, never a guess. null is not zero.",
          "eobResponsibilityCents is patient responsibility on the current applicable EOB.",
          "verifiedPatientPaymentsCents is gross receipts supported by evidence.",
          "supportedRemainingCents is the evidence-supported net amount remaining, not a legal ruling.",
          "providerStatementBalanceCents is the current requested balance; a collection demand takes precedence when it is the active request.",
          "A zero EOB-based amount does not mean the provider account is closed.",
          "Do not assert fraud or tell the member to send, pay, appeal, or contact an organization.",
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
          precomputedTotalsCents: computedTotals,
          planPassages: input.planPassages,
        }),
      },
    ],
  });
  const parsed = billingInvestigationSchema.safeParse(normalizeInvestigation(parseJsonObject(text)));
  if (!parsed.success) {
    throw new HttpError(502, "investigate_failed", "The records could not be compared. Nothing was saved.");
  }
  return {
    ...parsed.data,
    totalsCents: mergeInvestigationTotals(computedTotals, parsed.data.totalsCents),
  };
}

function normalizeInvestigation(raw: Record<string, unknown>) {
  const totals = raw.totalsCents && typeof raw.totalsCents === "object" && !Array.isArray(raw.totalsCents) ? (raw.totalsCents as Record<string, unknown>) : {};
  return {
    finding: raw.finding,
    explanations: clipStrings(raw.explanations),
    missingInformation: clipStrings(raw.missingInformation),
    assumptions: clipStrings(raw.assumptions),
    totalsCents: {
      eobResponsibilityCents: asCents(totals.eobResponsibilityCents),
      verifiedPatientPaymentsCents: asCents(totals.verifiedPatientPaymentsCents),
      supportedRemainingCents: asCents(totals.supportedRemainingCents),
      providerStatementBalanceCents: asCents(totals.providerStatementBalanceCents),
      primaryResponsibilityCents: asCents(totals.primaryResponsibilityCents),
      secondaryPaymentCents: asCents(totals.secondaryPaymentCents),
      remainingDeductibleCents: asCents(totals.remainingDeductibleCents),
      remainingOopCents: asCents(totals.remainingOopCents),
      arithmeticEobNetCents: asCents(totals.arithmeticEobNetCents),
      refundCents: asCents(totals.refundCents),
      netPatientPaymentsCents: asCents(totals.netPatientPaymentsCents),
      balancesByAccountCents: asAccountBalances(totals.balancesByAccountCents),
    },
  };
}

function clipStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim().slice(0, 500) : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function asCents(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseFloat(value.replace(/[$,]/g, "")) : Number.NaN;
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

function asAccountBalances(value: unknown) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const rows = value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const accountId = typeof row.accountId === "string" ? row.accountId.trim() : "";
      const cents = asCents(row.cents);
      return accountId && cents !== null ? [{ accountId, cents }] : [];
    });
    return rows.length > 0 ? rows : null;
  }
  if (typeof value === "object") {
    const rows = Object.entries(value as Record<string, unknown>).flatMap(([accountId, cents]) => {
      const amount = asCents(cents);
      return accountId && amount !== null ? [{ accountId, cents: amount }] : [];
    });
    return rows.length > 0 ? rows : null;
  }
  return null;
}

const centsOrNull = { type: ["integer", "null"] };

const investigationJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["finding", "explanations", "missingInformation", "assumptions", "totalsCents"],
  properties: {
    finding: {
      type: "string",
      enum: ["matches_available_records", "possible_discrepancy", "insufficient_information"],
    },
    explanations: { type: "array", items: { type: "string" } },
    missingInformation: { type: "array", items: { type: "string" } },
    assumptions: { type: "array", items: { type: "string" } },
    totalsCents: {
      type: "object",
      additionalProperties: false,
      required: [
        "eobResponsibilityCents",
        "verifiedPatientPaymentsCents",
        "supportedRemainingCents",
        "providerStatementBalanceCents",
        "primaryResponsibilityCents",
        "secondaryPaymentCents",
        "remainingDeductibleCents",
        "remainingOopCents",
        "arithmeticEobNetCents",
        "refundCents",
        "netPatientPaymentsCents",
        "balancesByAccountCents",
      ],
      properties: {
        eobResponsibilityCents: centsOrNull,
        verifiedPatientPaymentsCents: centsOrNull,
        supportedRemainingCents: centsOrNull,
        providerStatementBalanceCents: centsOrNull,
        primaryResponsibilityCents: centsOrNull,
        secondaryPaymentCents: centsOrNull,
        remainingDeductibleCents: centsOrNull,
        remainingOopCents: centsOrNull,
        arithmeticEobNetCents: centsOrNull,
        refundCents: centsOrNull,
        netPatientPaymentsCents: centsOrNull,
        balancesByAccountCents: {
          type: ["array", "null"],
          items: {
            type: "object",
            additionalProperties: false,
            required: ["accountId", "cents"],
            properties: {
              accountId: { type: "string" },
              cents: { type: "integer" },
            },
          },
        },
      },
    },
  },
};
