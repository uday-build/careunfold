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
    });
    expect(merged.eobResponsibilityCents).toBe(4000);
    expect(merged.verifiedPatientPaymentsCents).toBe(1000);
    expect(merged.supportedRemainingCents).toBe(3000);
    expect(merged.providerStatementBalanceCents).toBe(4000);
  });

  it("rounds dollars to cents without dropping nulls", () => {
    expect(usdToCents("75.00")).toBe(7500);
    expect(usdToCents(null)).toBeNull();
  });
});

function claim(totals: Partial<NonNullable<ExtractedClaimFields["totals"]>>): ExtractedClaimFields {
  return {
    patientName: "Avery Rivera",
    providerName: "Cedar Medical",
    visitDate: "2026-04-10",
    claimNumber: "SYN-C001",
    accountNumber: "SYN-A001",
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
