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

  const eobByAccount = currentEobByAccount(eobs);
  const statementByAccount = currentStatementByAccount(collections, statements);

  const eobResponsibilityCents = sumAccountCents(eobByAccount);
  const verifiedPatientPaymentsCents = receipts.length === 0 ? 0 : sumAmounts(receipts, receiptAmount);
  const providerStatementBalanceCents = sumAccountCents(statementByAccount);
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
    balancesByAccountCents: namedAccountBalances(statementByAccount),
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
    balancesByAccountCents: computed.balancesByAccountCents ?? base.balancesByAccountCents ?? null,
  };
}

function currentEobByAccount(eobs: EvidenceRow[]) {
  const result = new Map<string, AccountAmount>();
  for (const [key, rows] of groupBy(eobs, accountKey)) {
    const secondaries = rows.filter((row) => hasKind(row, "eob_secondary"));
    const cents =
      secondaries.length > 0
        ? lastAmount(secondaries, eobAmount)
        : sumAccountCents(
            new Map(
              [...groupBy(rows, claimKey)].flatMap(([claim, claimRows]) => {
                const amount = lastAmount(claimRows, eobAmount);
                return amount === null ? [] : [[claim, { accountId: displayAccountId(claimRows), cents: amount }]];
              }),
            ),
          );
    if (cents === null) continue;
    result.set(key, { accountId: displayAccountId(rows), cents });
  }
  return result;
}

function currentStatementByAccount(collections: EvidenceRow[], statements: EvidenceRow[]) {
  const result = new Map<string, AccountAmount>();
  const keys = new Set([...collections, ...statements].map(accountKey));
  for (const key of keys) {
    const collectionRows = collections.filter((row) => accountKey(row) === key);
    const statementRows = statements.filter((row) => accountKey(row) === key);
    const cents = lastAmount(collectionRows, statementAmount) ?? lastAmount(statementRows, statementAmount);
    if (cents === null) continue;
    result.set(key, { accountId: displayAccountId([...statementRows, ...collectionRows]), cents });
  }
  return result;
}

function namedAccountBalances(byAccount: Map<string, AccountAmount>) {
  const rows = [...byAccount.values()].filter((row) => !row.accountId.startsWith("doc:"));
  return rows.length > 0 ? rows : null;
}

function sumAccountCents(byAccount: Map<string, AccountAmount>) {
  if (byAccount.size === 0) return null;
  return [...byAccount.values()].reduce((sum, row) => sum + row.cents, 0);
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

function accountKey(row: EvidenceRow) {
  return idKey(row.extracted.accountNumber) ?? idKey(row.extracted.claimNumber) ?? idKey(row.extracted.providerName) ?? `doc:${row.filename}`;
}

function claimKey(row: EvidenceRow) {
  return idKey(row.extracted.claimNumber) ?? accountKey(row);
}

function displayAccountId(rows: EvidenceRow[]) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const account = rows[index]?.extracted.accountNumber?.trim();
    if (account) return account;
  }
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const claim = rows[index]?.extracted.claimNumber?.trim();
    if (claim) return claim;
  }
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const provider = rows[index]?.extracted.providerName?.trim();
    if (provider) return provider;
  }
  return `doc:${rows[rows.length - 1]?.filename ?? "account"}`;
}

function idKey(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.replace(/\s+/g, " ").toLowerCase() : null;
}

function groupBy(rows: EvidenceRow[], keyFor: (row: EvidenceRow) => string) {
  const groups = new Map<string, EvidenceRow[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

type AccountAmount = { accountId: string; cents: number };
