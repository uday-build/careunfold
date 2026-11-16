import { HttpError } from "../http/errors";
import { openRouterDecision, openRouterModels } from "./openrouter";

export const BILLING_ISSUES = ["explain_charge", "payment_missing", "track_correction", "other"] as const;
export type BillingIssue = (typeof BILLING_ISSUES)[number];

export const ISSUE_LABELS: Record<BillingIssue, string> = {
  explain_charge: "Explain this charge",
  payment_missing: "Payment missing",
  track_correction: "Track a correction",
  other: "Something else",
};

const CHOICE_CONFIDENCE_MIN = 0.75;

export type ClassifyIssueRequest = {
  request: string;
};

export type IssueClassification = {
  issue: BillingIssue;
  confidence: number;
  probabilities: Record<BillingIssue, number>;
  needsDocument: number;
  uncertain: boolean;
  route: "investigate" | "track" | "needs_confirmation" | "other";
};

export async function classifyBillingIssue(input: ClassifyIssueRequest): Promise<IssueClassification> {
  const request = input.request.trim();
  if (!request) {
    throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", { request: "Enter what you want to look into." });
  }
  const data = await openRouterDecision({
    model: openRouterModels().classify,
    state: { request },
    questions: {
      issue: {
        type: "choice",
        instructions: "Which single billing issue is the member asking about?",
        criteria: {
          explain_charge: "Explain this charge, copay, deductible, coinsurance, or a line on a bill or explanation of benefits.",
          payment_missing: "A payment, refund, or claim payment is missing, not posted, or not applied.",
          track_correction: "Track a correction, appeal, resubmission, or an already-opened dispute.",
          other: "Anything else, or not enough information to tell.",
        },
      },
      needs_document: {
        type: "noul",
        instructions: "Does answering this request require a bill, explanation of benefits, receipt, or similar claim document?",
      },
    },
  });
  return classificationFromDecision(data);
}

export function classificationFromDecision(data: Record<string, unknown>): IssueClassification {
  const answers = data.answers;
  if (!answers || typeof answers !== "object") {
    throw new HttpError(502, "classify_failed", "The request could not be classified. Nothing was saved.");
  }
  const issueAnswer = (answers as { issue?: Record<string, unknown> }).issue;
  const documentAnswer = (answers as { needs_document?: Record<string, unknown> }).needs_document;
  const issue = BILLING_ISSUES.find((value) => value === issueAnswer?.choice);
  const confidence = asUnit(issueAnswer?.confidence);
  const needsDocument = asUnit(documentAnswer?.noul);
  if (!issue || confidence === null || needsDocument === null) {
    throw new HttpError(502, "classify_failed", "The request could not be classified. Nothing was saved.");
  }
  const raw = issueAnswer?.probabilities;
  const probabilities = Object.fromEntries(
    BILLING_ISSUES.map((value) => [value, asUnit((raw as Record<string, unknown> | undefined)?.[value]) ?? 0]),
  ) as Record<BillingIssue, number>;
  const uncertain = confidence < CHOICE_CONFIDENCE_MIN;
  const route = uncertain
    ? "needs_confirmation"
    : issue === "explain_charge" || issue === "payment_missing"
      ? "investigate"
      : issue === "track_correction"
        ? "track"
        : "other";
  return { issue, confidence, probabilities, needsDocument, uncertain, route };
}

function asUnit(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}
