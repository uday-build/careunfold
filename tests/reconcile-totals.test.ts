import { describe, expect, it } from "vitest";
import type { ExtractedClaimFields } from "@/server/ai/extract-claim";
import { usdToCents } from "@/server/ai/money";
import { mergeInvestigationTotals, reconcileClaimTotals } from "@/server/ai/reconcile-totals";

describe("reconcileClaimTotals", () => {
  it("converts extracted dollars into the four core cents fields", () => {
    const totals = reconcileClaimTotals([
      { filename: "eob.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "165.00", billedAmountUsd: "1440.00" }) },
      { filename: "receipt.pdf", kind: "receipt", extracted: claim({ amountPaidUsd: "75.00" }) },
      { filename: "bill.pdf", kind: "bill", extracted: claim({ billedAmountUsd: "1440.00", statementBalanceUsd: "165.00" }) },
    ]);
    expect(totals.eobResponsibilityCents).toBe(16500);
    expect(totals.verifiedPatientPaymentsCents).toBe(7500);
    expect(totals.supportedRemainingCents).toBe(9000);
    expect(totals.providerStatementBalanceCents).toBe(16500);
  });

  it("uses the later EOB and treats a missing receipt as zero payments", () => {
    const totals = reconcileClaimTotals([
      { filename: "eob-v1.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "1537.00" }) },
      { filename: "eob-v2.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "312.00" }) },
      { filename: "bill.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "1537.00" }) },
    ]);
    expect(totals.eobResponsibilityCents).toBe(31200);
    expect(totals.verifiedPatientPaymentsCents).toBe(0);
    expect(totals.supportedRemainingCents).toBe(31200);
    expect(totals.providerStatementBalanceCents).toBe(153700);
  });

  it("fills model nulls from computed cents", () => {
    const computed = reconcileClaimTotals([
      { filename: "eob.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "40.00" }) },
      { filename: "receipt.pdf", kind: "receipt", extracted: claim({ amountPaidUsd: "10.00" }) },
      { filename: "bill.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "40.00" }) },
    ]);
    const merged = mergeInvestigationTotals(computed, {
      ...computed,
      eobResponsibilityCents: null,
      verifiedPatientPaymentsCents: null,
      supportedRemainingCents: null,
      providerStatementBalanceCents: null,
      balancesByAccountCents: null,
    });
    expect(merged.eobResponsibilityCents).toBe(4000);
    expect(merged.verifiedPatientPaymentsCents).toBe(1000);
    expect(merged.supportedRemainingCents).toBe(3000);
    expect(merged.providerStatementBalanceCents).toBe(4000);
  });

  it("sums current balances across accounts and keeps a $0 professional account", () => {
    const totals = reconcileClaimTotals([
      {
        filename: "hospital-eob.pdf",
        kind: "eob",
        extracted: claim({ memberResponsibilityUsd: "1700.00" }, { claimNumber: "SYN-C003", accountNumber: "SYN-A003", providerName: "Cedar Medical" }),
      },
      {
        filename: "hospital-bill.pdf",
        kind: "bill",
        extracted: claim({ statementBalanceUsd: "1700.00" }, { claimNumber: "SYN-C003", accountNumber: "SYN-A003", providerName: "Cedar Medical" }),
      },
      {
        filename: "reader-eob.pdf",
        kind: "eob",
        extracted: claim({ memberResponsibilityUsd: "0.00" }, { claimNumber: "SYN-C003-R", accountNumber: "SYN-A003-R", providerName: "Harbor Radiology" }),
      },
      {
        filename: "reader-bill.pdf",
        kind: "bill",
        extracted: claim({ statementBalanceUsd: "0.00" }, { claimNumber: "SYN-C003-R", accountNumber: "SYN-A003-R", providerName: "Harbor Radiology" }),
      },
    ]);
    expect(totals.eobResponsibilityCents).toBe(170000);
    expect(totals.verifiedPatientPaymentsCents).toBe(0);
    expect(totals.supportedRemainingCents).toBe(170000);
    expect(totals.providerStatementBalanceCents).toBe(170000);
    expect(totals.balancesByAccountCents).toEqual([
      { accountId: "SYN-A003", cents: 170000 },
      { accountId: "SYN-A003-R", cents: 0 },
    ]);
  });

  it("does not add a secondary EOB to primary responsibility on the same account", () => {
    const totals = reconcileClaimTotals([
      {
        filename: "primary-eob.pdf",
        kind: "eob",
        extracted: claim({ memberResponsibilityUsd: "3000.00" }, { claimNumber: "SYN-C009-PRIMARY", accountNumber: "SYN-A009" }),
      },
      {
        filename: "secondary-eob.pdf",
        kind: "eob",
        sourceKind: "eob_secondary",
        extracted: claim({ memberResponsibilityUsd: "500.00" }, { claimNumber: "SYN-C009", accountNumber: "SYN-A009" }),
      },
      {
        filename: "bill.pdf",
        kind: "bill",
        extracted: claim({ statementBalanceUsd: "500.00" }, { claimNumber: "SYN-C009", accountNumber: "SYN-A009" }),
      },
    ]);
    expect(totals.eobResponsibilityCents).toBe(50000);
    expect(totals.supportedRemainingCents).toBe(50000);
    expect(totals.providerStatementBalanceCents).toBe(50000);
  });

  it("sums current EOBs per claim when they share one member account", () => {
    const member = { accountNumber: "SYN-A014", providerName: "Cedar Medical" };
    const totals = reconcileClaimTotals([
      { filename: "eob-f.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "400.00" }, { ...member, claimNumber: "SYN-C014-F" }) },
      { filename: "eob-c.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "100.00" }, { ...member, claimNumber: "SYN-C014-C" }) },
      { filename: "eob-p.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "30.00" }, { ...member, claimNumber: "SYN-C014-P" }) },
      { filename: "eob-a.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "80.00" }, { ...member, claimNumber: "SYN-C014-A" }) },
      { filename: "eob-f-v2.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "300.00" }, { ...member, claimNumber: "SYN-C014-F" }) },
      { filename: "bill-f.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "200.00" }, facility) },
      { filename: "bill-c.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "100.00" }, clinician) },
      { filename: "bill-p.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "30.00" }, pathology) },
      { filename: "bill-a.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "80.00" }, anesthesia) },
      { filename: "receipt-f.pdf", kind: "receipt", extracted: claim({ amountPaidUsd: "100.00" }, facility) },
    ]);
    expect(totals.eobResponsibilityCents).toBe(51000);
    expect(totals.verifiedPatientPaymentsCents).toBe(10000);
    expect(totals.supportedRemainingCents).toBe(41000);
    expect(totals.providerStatementBalanceCents).toBe(41000);
  });

  it("sums four visit accounts and uses the latest statement on each", () => {
    const totals = reconcileClaimTotals([
      { filename: "eob-f.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "400.00" }, facility) },
      { filename: "bill-f.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "400.00" }, facility) },
      { filename: "eob-c.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "100.00" }, clinician) },
      { filename: "bill-c.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "100.00" }, clinician) },
      { filename: "eob-p.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "30.00" }, pathology) },
      { filename: "bill-p.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "30.00" }, pathology) },
      { filename: "eob-a.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "80.00" }, anesthesia) },
      { filename: "bill-a.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "80.00" }, anesthesia) },
      { filename: "eob-f-v2.pdf", kind: "eob", extracted: claim({ memberResponsibilityUsd: "300.00" }, facility) },
      { filename: "bill-f-v2.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "300.00" }, facility) },
      { filename: "receipt-f.pdf", kind: "receipt", extracted: claim({ amountPaidUsd: "100.00" }, facility) },
      { filename: "bill-f-v3.pdf", kind: "bill", extracted: claim({ statementBalanceUsd: "200.00" }, facility) },
    ]);
    expect(totals.eobResponsibilityCents).toBe(51000);
    expect(totals.verifiedPatientPaymentsCents).toBe(10000);
    expect(totals.supportedRemainingCents).toBe(41000);
    expect(totals.providerStatementBalanceCents).toBe(41000);
    expect(totals.balancesByAccountCents).toEqual([
      { accountId: "SYN-A014-F", cents: 20000 },
      { accountId: "SYN-A014-C", cents: 10000 },
      { accountId: "SYN-A014-P", cents: 3000 },
      { accountId: "SYN-A014-A", cents: 8000 },
    ]);
  });

  it("rounds dollars to cents without dropping nulls", () => {
    expect(usdToCents("75.00")).toBe(7500);
    expect(usdToCents(null)).toBeNull();
  });
});

const facility = { claimNumber: "SYN-C014-F", accountNumber: "SYN-A014-F", providerName: "Facility" };
const clinician = { claimNumber: "SYN-C014-C", accountNumber: "SYN-A014-C", providerName: "Clinician" };
const pathology = { claimNumber: "SYN-C014-P", accountNumber: "SYN-A014-P", providerName: "Pathology" };
const anesthesia = { claimNumber: "SYN-C014-A", accountNumber: "SYN-A014-A", providerName: "Anesthesia" };

function claim(
  totals: Partial<NonNullable<ExtractedClaimFields["totals"]>>,
  identity: { claimNumber?: string; accountNumber?: string; providerName?: string } = {},
): ExtractedClaimFields {
  return {
    patientName: "Avery Rivera",
    providerName: identity.providerName ?? "Cedar Medical",
    visitDate: "2026-04-10",
    claimNumber: identity.claimNumber ?? "SYN-C001",
    accountNumber: identity.accountNumber ?? "SYN-A001",
    documentKind: "other",
    serviceLines: [],
    totals: {
      billedAmountUsd: totals.billedAmountUsd ?? null,
      planPaidUsd: totals.planPaidUsd ?? null,
      memberResponsibilityUsd: totals.memberResponsibilityUsd ?? null,
      amountPaidUsd: totals.amountPaidUsd ?? null,
      statementBalanceUsd: totals.statementBalanceUsd ?? null,
    },
  };
}
