import { describe, expect, it } from "vitest";
import { investigationInput, runGoldenCase } from "../../evals/golden/run";
import { loadGoldenCases, parseGoldenCase, resolveGoldenDocuments } from "../../evals/golden/dataset";
import { modelPayloadLeak, scoreGoldenCase } from "../../evals/golden/score";
import type { IssueClassification } from "@/server/ai/classify-issue";
import type { BillingInvestigation } from "@/server/ai/investigate-billing";

const sampleLine =
  '{"case_id":"S01","prompt":"Why are there two visit codes, and did my payment count?","id":"S01-A","release":"A","input_document_ids":["S01-D01"],"status":"payment_allocation_unresolved","expected":{"eob_responsibility_cents":16500,"verified_patient_payments_cents":7500,"supported_remaining_cents":9000,"provider_statement_balance_cents":16500},"required_findings":["Five lines; 99244 has zero responsibility under this EOB."],"missing_evidence":["Allocation ledger"],"forbidden_claims":["Provider definitely double-billed","Fraud or legal liability conclusively established without evidence"]}';

describe("golden regression dataset", () => {
  it("loads every main stage and keeps S16-X out of the default suite", () => {
    const main = loadGoldenCases();
    const all = loadGoldenCases({ includeAlternate: true });
    expect(main.map((item) => item.id)).not.toContain("S16-X");
    expect(all.map((item) => item.id)).toContain("S16-X");
    expect(main).toHaveLength(31);
    expect(all).toHaveLength(32);
  });

  it("resolves listed PDFs for the first case", () => {
    const [first] = loadGoldenCases();
    if (!first) throw new Error("golden cases are missing");
    const documents = resolveGoldenDocuments(first);
    expect(documents.map((item) => item.documentId)).toEqual(first.inputDocumentIds);
    expect(documents.every((item) => item.bytes.length > 0)).toBe(true);
  });

  it("never puts answer-key fields in the model payload", () => {
    const item = parseGoldenCase(sampleLine);
    const classification = sampleClassification();
    const payload = investigationInput(item, classification, []);
    const leaks = modelPayloadLeak(JSON.stringify({ request: item.prompt, payload }), item);
    expect(leaks).toEqual([]);
  });

  it("scores exact cents and treats null as different from zero", () => {
    const item = parseGoldenCase(sampleLine);
    const matching = scoreGoldenCase(sampleInvestigation(item.expected.eob_responsibility_cents, 7500, 9000, 16500), item);
    expect(matching.passed).toBe(true);
    const zeroInsteadOfNull = scoreGoldenCase(
      sampleInvestigation(0, 7500, 9000, 16500),
      {
        ...item,
        expected: { ...item.expected, eob_responsibility_cents: null },
      },
    );
    expect(zeroInsteadOfNull.passed).toBe(false);
  });

  it("fails a forbidden claim even when cents match", () => {
    const item = parseGoldenCase(sampleLine);
    const actual = sampleInvestigation(16500, 7500, 9000, 16500);
    actual.explanations = ["Provider definitely double-billed the visit."];
    expect(scoreGoldenCase(actual, item).passed).toBe(false);
  });

  it("does not send expected totals into a live runner", async () => {
    const item = parseGoldenCase(sampleLine);
    const seen: string[] = [];
    const result = await runGoldenCase(item, {
      classify: async (input) => {
        seen.push(JSON.stringify(input));
        return sampleClassification();
      },
      extract: async (input) => {
        seen.push(JSON.stringify({ filename: input.filename, kind: input.kind }));
        return {
          patientName: "Pat",
          providerName: "Clinic",
          visitDate: "2026-04-10",
          claimNumber: null,
          accountNumber: null,
          documentKind: "other",
          serviceLines: [],
          totals: { billedAmountUsd: null, planPaidUsd: null, memberResponsibilityUsd: null },
        };
      },
      investigate: async (input) => {
        seen.push(JSON.stringify(input));
        return sampleInvestigation(16500, 7500, 9000, 16500);
      },
    });
    expect(result.leaks).toEqual([]);
    expect(seen.join("\n")).not.toContain("eob_responsibility_cents");
    expect(seen.join("\n")).not.toContain("required_findings");
    expect(result.score.passed).toBe(true);
  });
});

function sampleClassification(): IssueClassification {
  return {
    issue: "explain_charge",
    confidence: 0.96,
    probabilities: { explain_charge: 0.96, payment_missing: 0.02, track_correction: 0.01, other: 0.01 },
    needsDocument: 0.9,
    uncertain: false,
    route: "investigate",
  };
}

function sampleInvestigation(
  eobResponsibilityCents: number | null,
  verifiedPatientPaymentsCents: number | null,
  supportedRemainingCents: number | null,
  providerStatementBalanceCents: number | null,
): BillingInvestigation {
  return {
    finding: "possible_discrepancy",
    explanations: ["Receipt supports 75 paid; net 90 if applied to this encounter."],
    missingInformation: ["Allocation ledger"],
    assumptions: [],
    totalsCents: {
      eobResponsibilityCents,
      verifiedPatientPaymentsCents,
      supportedRemainingCents,
      providerStatementBalanceCents,
      primaryResponsibilityCents: null,
      secondaryPaymentCents: null,
      remainingDeductibleCents: null,
      remainingOopCents: null,
      arithmeticEobNetCents: null,
      refundCents: null,
      netPatientPaymentsCents: null,
      balancesByAccountCents: null,
    },
  };
}
