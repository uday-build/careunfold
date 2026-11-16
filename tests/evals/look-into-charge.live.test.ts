import { describe, expect, it } from "vitest";
import { CLASSIFY_CASES, lookIntoCase } from "../../evals/look-into-charge/cases";
import { syntheticPdf } from "../../evals/look-into-charge/pdf";
import { scoreClassification, scoreExtraction, scoreInvestigation } from "../../evals/look-into-charge/score";
import { classifyBillingIssue } from "@/server/ai/classify-issue";
import { extractClaimEvidence } from "@/server/ai/extract-claim";
import { investigateBilling } from "@/server/ai/investigate-billing";

const live = process.env.CAREUNFOLD_EVAL_LIVE === "1" && Boolean(process.env.OPENROUTER_API_KEY?.trim());

describe.skipIf(!live)("look-into-a-charge live models", () => {
  it("classifies member requests into the four billing issues", async () => {
    for (const fixture of CLASSIFY_CASES) {
      const actual = await classifyBillingIssue({ request: fixture.request });
      const score = scoreClassification(actual, fixture, { allowUncertain: true });
      expect(score.passed, `${fixture.request}: ${score.checks.filter((check) => !check.ok).map((check) => check.detail).join("; ")}`).toBe(true);
    }
  }, 120_000);

  it("extracts canonical bill fields without inventing a claim number", async () => {
    const document = lookIntoCase("correct-bill").documents[0]!;
    const actual = await extractClaimEvidence({
      filename: document.filename,
      mimeType: "application/pdf",
      bytes: syntheticPdf(document.sourceText),
      kind: document.kind,
    });
    const score = scoreExtraction(actual, {
      patientName: "Avery Quinn",
      providerName: "Harbor Clinic",
      visitDate: "2026-10-02",
      documentKind: "bill",
      totals: { billedAmountUsd: "180.00", planPaidUsd: null, memberResponsibilityUsd: null },
    });
    expect(score.passed, score.checks.filter((check) => !check.ok).map((check) => check.detail).join("; ")).toBe(true);
  }, 120_000);

  it("does not follow a malicious instruction in a bill", async () => {
    const fixture = lookIntoCase("malicious-instruction");
    const extracted = fixture.documents[0]!.extracted;
    if (extracted === "unreadable") throw new Error("malicious fixture must have extracted fields");
    const actual = await investigateBilling({
      request: fixture.request,
      classification: {
        issue: "explain_charge",
        confidence: 0.96,
        probabilities: { explain_charge: 0.96, payment_missing: 0.01, track_correction: 0.01, other: 0.02 },
        needsDocument: 0.9,
        uncertain: false,
        route: "investigate",
      },
      visit: fixture.visit,
      evidence: [{ filename: "injected-bill.pdf", kind: "bill", extracted }],
      planPassages: ["No typed plan benefits are on file for this person."],
    });
    const score = scoreInvestigation(actual, fixture.investigation);
    expect(score.passed, score.checks.filter((check) => !check.ok).map((check) => check.detail).join("; ")).toBe(true);
  }, 120_000);
});
