import type { ExtractedClaimFields } from "./extract-claim";
import { usdToCents } from "./money";

export type EvidenceRow = {
  filename: string;
  kind: string;
  sourceKind?: string;
  extracted: ExtractedClaimFields;
};

export type ReconciledTotals = {
  eobResponsibilityCents: number | null;
  verifiedPatientPaymentsCents: number | null;
  supportedRemainingCents: number | null;
  providerStatementBalanceCents: number | null;
  primaryResponsibilityCents: number | null;
  secondaryPaymentCents: number | null;
  remainingDeductibleCents: number | null;
  remainingOopCents: number | null;
  arithmeticEobNetCents: number | null;
  refundCents: number | null;
  netPatientPaymentsCents: number | null;
  balancesByAccountCents: Array<{ accountId: string; cents: number }> | null;
};

const emptyTotals: ReconciledTotals = {
  eobResponsibilityCents: null,
  verifiedPatientPaymentsCents: null,
  supportedRemainingCents: null,
  providerStatementBalanceCents: null,
  primaryResponsibilityCents: null,
  secondaryPaymentCents: null,
  remainingDeductibleCents: null,
  remainingOopCents: null,
  arithmeticEobNetCents: null,
  refundCents: null,
  netPatientPaymentsCents: null,
  balancesByAccountCents: null,
};

export function reconcileClaimTotals(evidence: EvidenceRow[]): ReconciledTotals {
  const eobs = evidence.filter((row) => hasKind(row, "eob", "eob_secondary"));
  const receipts = evidence.filter((row) => hasKind(row, "receipt"));
  const collections = evidence.filter((row) => hasKind(row, "collection"));
  const statements = evidence.filter((row) => hasKind(row, "bill", "adjusted_bill"));

  const eobResponsibilityCents = lastAmount(eobs, eobAmount);
  const verifiedPatientPaymentsCents = receipts.length === 0 ? 0 : sumAmounts(receipts, receiptAmount);
  const providerStatementBalanceCents =
    lastAmount(collections, statementAmount) ?? lastAmount(statements, statementAmount);
  const supportedRemainingCents =
    eobResponsibilityCents === null || verifiedPatientPaymentsCents === null
      ? null
      : eobResponsibilityCents - verifiedPatientPaymentsCents;

  return {
    ...emptyTotals,
    eobResponsibilityCents,
    verifiedPatientPaymentsCents,
    supportedRemainingCents,
    providerStatementBalanceCents,
  };
}

export function mergeInvestigationTotals(
  computed: ReconciledTotals,
  modeled: ReconciledTotals | undefined,
): ReconciledTotals {
  const base = modeled ?? emptyTotals;
  return {
    ...base,
    eobResponsibilityCents: computed.eobResponsibilityCents ?? base.eobResponsibilityCents ?? null,
    verifiedPatientPaymentsCents: computed.verifiedPatientPaymentsCents ?? base.verifiedPatientPaymentsCents ?? null,
    supportedRemainingCents: computed.supportedRemainingCents ?? base.supportedRemainingCents ?? null,
    providerStatementBalanceCents: computed.providerStatementBalanceCents ?? base.providerStatementBalanceCents ?? null,
  };
}

function hasKind(row: EvidenceRow, ...kinds: string[]) {
  const actual = [row.sourceKind, row.kind, row.extracted.documentKind]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());
  return kinds.some((kind) => actual.includes(kind));
}

function lastAmount(rows: EvidenceRow[], read: (row: EvidenceRow) => number | null) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const amount = read(rows[index]!);
    if (amount !== null) return amount;
  }
  return null;
}

function sumAmounts(rows: EvidenceRow[], read: (row: EvidenceRow) => number | null) {
  const amounts = rows.map(read).filter((value): value is number => value !== null);
  if (amounts.length === 0) return null;
  return amounts.reduce((sum, value) => sum + value, 0);
}

function eobAmount(row: EvidenceRow) {
  return usdToCents(row.extracted.totals?.memberResponsibilityUsd) ?? sumLineMemberCents(row);
}

function receiptAmount(row: EvidenceRow) {
  return (
    usdToCents(row.extracted.totals?.amountPaidUsd) ??
    usdToCents(row.extracted.totals?.billedAmountUsd) ??
    usdToCents(row.extracted.totals?.memberResponsibilityUsd)
  );
}

function statementAmount(row: EvidenceRow) {
  return (
    usdToCents(row.extracted.totals?.statementBalanceUsd) ??
    usdToCents(row.extracted.totals?.memberResponsibilityUsd) ??
    usdToCents(row.extracted.totals?.billedAmountUsd)
  );
}

function sumLineMemberCents(row: EvidenceRow) {
  const lines = row.extracted.serviceLines ?? [];
  const amounts = lines.map((line) => usdToCents(line.memberResponsibilityUsd)).filter((value): value is number => value !== null);
  if (amounts.length === 0) return null;
  return amounts.reduce((sum, value) => sum + value, 0);
}
