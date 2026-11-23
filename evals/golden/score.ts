import type { BillingInvestigation } from "@/server/ai/investigate-billing";
import type { GoldenCase, GoldenExpected } from "./dataset";

export type GoldenCheck = {
  id: string;
  ok: boolean;
  detail: string;
  hard: boolean;
};

export type GoldenScore = {
  passed: boolean;
  checks: GoldenCheck[];
};

const CENTS_FIELDS: Array<[keyof GoldenExpected, string]> = [
  ["eob_responsibility_cents", "eobResponsibilityCents"],
  ["verified_patient_payments_cents", "verifiedPatientPaymentsCents"],
  ["supported_remaining_cents", "supportedRemainingCents"],
  ["provider_statement_balance_cents", "providerStatementBalanceCents"],
  ["primary_responsibility_cents", "primaryResponsibilityCents"],
  ["secondary_payment_cents", "secondaryPaymentCents"],
  ["remaining_deductible_cents", "remainingDeductibleCents"],
  ["remaining_oop_cents", "remainingOopCents"],
  ["arithmetic_eob_net_cents", "arithmeticEobNetCents"],
  ["refund_cents", "refundCents"],
  ["net_patient_payments_cents", "netPatientPaymentsCents"],
];

export function scoreGoldenCase(actual: BillingInvestigation, item: Pick<GoldenCase, "expected" | "requiredFindings" | "forbiddenClaims">): GoldenScore {
  const blob = [...actual.explanations, ...actual.missingInformation, ...actual.assumptions].join("\n");
  const checks: GoldenCheck[] = [];
  const totals = actual.totalsCents;

  for (const [expectedKey, actualKey] of CENTS_FIELDS) {
    if (!(expectedKey in item.expected)) continue;
    const expected = item.expected[expectedKey];
    if (expected !== null && typeof expected !== "number") continue;
    const value = totals ? (totals as Record<string, unknown>)[actualKey] : undefined;
    checks.push(sameCents(expectedKey, value, expected));
  }

  if (item.expected.balances_by_account_cents) {
    const actualAccounts = Object.fromEntries((totals?.balancesByAccountCents ?? []).map((row) => [row.accountId, row.cents]));
    for (const [accountId, cents] of Object.entries(item.expected.balances_by_account_cents)) {
      checks.push(sameCents(`balances_by_account_cents.${accountId}`, actualAccounts[accountId], cents));
    }
  }

  for (const phrase of item.forbiddenClaims) {
    checks.push({
      id: `forbidden:${phrase}`,
      ok: !includesPhrase(blob, phrase),
      detail: `must not claim “${phrase}”`,
      hard: true,
    });
  }

  for (const phrase of item.requiredFindings) {
    checks.push({
      id: `required:${phrase}`,
      ok: includesPhrase(blob, phrase),
      detail: `missing “${phrase}”`,
      hard: false,
    });
  }

  return {
    passed: checks.filter((check) => check.hard).every((check) => check.ok),
    checks,
  };
}

export function modelPayloadLeak(haystack: string, item: Pick<GoldenCase, "expected" | "requiredFindings" | "forbiddenClaims" | "status">) {
  const needles = [
    "eob_responsibility_cents",
    "verified_patient_payments_cents",
    "supported_remaining_cents",
    "provider_statement_balance_cents",
    "required_findings",
    "forbidden_claims",
    "missing_evidence",
    item.status,
    ...item.requiredFindings,
    ...item.forbiddenClaims,
  ];
  return needles.filter((needle) => needle && haystack.includes(needle));
}

function sameCents(id: string, actual: unknown, expected: number | null): GoldenCheck {
  if (actual === undefined) {
    return { id, ok: false, detail: `missing ${id}`, hard: true };
  }
  const left = actual === null ? null : Math.round(Number(actual));
  const right = expected === null ? null : Math.round(expected);
  if (actual !== null && !Number.isFinite(left)) {
    return { id, ok: false, detail: `${id} ${String(actual)} vs ${String(expected)}`, hard: true };
  }
  return { id, ok: left === right, detail: `${id} ${String(left)} vs ${String(right)}`, hard: true };
}

function includesPhrase(haystack: string, needle: string) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}
