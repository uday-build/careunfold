import type { BillingIssue, IssueClassification } from "@/server/ai/classify-issue";
import type { ExtractedClaimFields } from "@/server/ai/extract-claim";
import type { BillingInvestigation } from "@/server/ai/investigate-billing";

export type Check = {
  id: string;
  ok: boolean;
  detail: string;
};

export type Score = {
  passed: boolean;
  checks: Check[];
};

export function moneyNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function moneyString(value: number) {
  return value.toFixed(2);
}

export function canonicalBalances(input: {
  billedUsd: string;
  eobPatientResponsibilityUsd: string;
  confirmedPaymentUsd: string;
}) {
  const billed = moneyNumber(input.billedUsd) ?? 0;
  const patient = moneyNumber(input.eobPatientResponsibilityUsd) ?? 0;
  const paid = moneyNumber(input.confirmedPaymentUsd) ?? 0;
  const remaining = Math.round((patient - paid) * 100) / 100;
  const discrepancy = Math.round((billed - remaining) * 100) / 100;
  return {
    billedAmountUsd: moneyString(billed),
    patientResponsibilityUsd: moneyString(patient),
    paymentUsd: moneyString(paid),
    remainingBalanceUsd: moneyString(remaining),
    potentialDiscrepancyUsd: moneyString(discrepancy),
  };
}

export function scoreClassification(
  actual: Pick<IssueClassification, "issue" | "route" | "uncertain">,
  expected: { issue: BillingIssue; route: IssueClassification["route"] },
  options: { allowUncertain?: boolean } = {},
): Score {
  const routeOk =
    actual.route === expected.route ||
    Boolean(options.allowUncertain && actual.uncertain && actual.route === "needs_confirmation");
  const checks: Check[] = [
    check("issue", actual.issue === expected.issue, `issue ${actual.issue} vs ${expected.issue}`),
    check("route", routeOk, `route ${actual.route} vs ${expected.route}`),
  ];
  return summarize(checks);
}

export function scoreExtraction(actual: ExtractedClaimFields, expected: Partial<ExtractedClaimFields>): Score {
  const checks: Check[] = [];
  for (const key of ["patientName", "providerName", "visitDate", "claimNumber", "documentKind"] as const) {
    if (!(key in expected)) continue;
    checks.push(sameText(key, actual[key], expected[key] ?? null));
  }
  if (expected.totals) {
    for (const key of ["billedAmountUsd", "planPaidUsd", "memberResponsibilityUsd"] as const) {
      checks.push(sameMoney(`totals.${key}`, actual.totals?.[key] ?? null, expected.totals[key] ?? null));
    }
  }
  if (expected.serviceLines) {
    const actualLines = actual.serviceLines ?? [];
    checks.push(
      check(
        "serviceLineCount",
        actualLines.length === expected.serviceLines.length,
        `${actualLines.length} lines vs ${expected.serviceLines.length}`,
      ),
    );
    expected.serviceLines.forEach((line, index) => {
      checks.push(sameMoney(`line.${index}.billed`, actualLines[index]?.billedAmountUsd ?? null, line.billedAmountUsd));
      checks.push(sameMoney(`line.${index}.member`, actualLines[index]?.memberResponsibilityUsd ?? null, line.memberResponsibilityUsd));
    });
  }
  return summarize(checks);
}

export function scoreInvestigation(
  actual: BillingInvestigation,
  expected: {
    finding: BillingInvestigation["finding"];
    requiredPhrases?: string[];
    forbiddenPhrases?: string[];
    allowedAmountsUsd?: string[];
  },
): Score {
  const blob = [...actual.explanations, ...actual.missingInformation, ...actual.assumptions].join("\n");
  const checks: Check[] = [
    check("finding", actual.finding === expected.finding, `finding ${actual.finding} vs ${expected.finding}`),
  ];
  for (const phrase of expected.requiredPhrases ?? []) {
    checks.push(check(`required:${phrase}`, includesPhrase(blob, phrase), `missing “${phrase}”`));
  }
  for (const phrase of expected.forbiddenPhrases ?? []) {
    checks.push(check(`forbidden:${phrase}`, !includesPhrase(blob, phrase), `must not claim “${phrase}”`));
  }
  if (expected.allowedAmountsUsd) {
    const allowed = new Set(expected.allowedAmountsUsd.map((value) => moneyString(moneyNumber(value) ?? NaN)));
    for (const amount of amountsIn(blob)) {
      checks.push(check(`amount:${amount}`, allowed.has(amount), `invented or extra amount ${amount}`));
    }
  }
  return summarize(checks);
}

function sameText(id: string, actual: string | null | undefined, expected: string | null) {
  const left = normalize(actual);
  const right = normalize(expected);
  return check(id, left === right, `${left || "null"} vs ${right || "null"}`);
}

function sameMoney(id: string, actual: string | null | undefined, expected: string | null | undefined) {
  const left = moneyNumber(actual);
  const right = moneyNumber(expected);
  if (right === null) {
    return check(id, left === null, `${actual ?? "null"} should be omitted`);
  }
  return check(id, left === right, `${actual ?? "null"} vs ${expected}`);
}

function amountsIn(text: string) {
  return [...text.matchAll(/\$\s*(\d{1,6}(?:\.\d{1,2})?)/g)]
    .map((match) => moneyString(Number.parseFloat(match[1]!)))
    .filter((value) => value !== "0.00");
}

function includesPhrase(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function normalize(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function check(id: string, ok: boolean, detail: string): Check {
  return { id, ok, detail };
}

function summarize(checks: Check[]): Score {
  return { passed: checks.every((item) => item.ok), checks };
}
