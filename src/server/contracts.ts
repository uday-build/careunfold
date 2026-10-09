/**
 * Contracts for later increments. These types describe boundaries only.
 * No extraction, messaging, or reconciliation behavior is implemented here.
 */
export type ExtractionWorkerInput = {
  documentVersionId: string;
  requestedByUserId: string;
};

export type ExtractionWorkerOutput = {
  documentVersionId: string;
  fields: Array<{ name: string; value: string | null; uncertain: boolean; source: string }>;
};

export type ReconciliationInput = {
  currency: string;
  obligationsMinor: number[];
  allocationsMinor: number[];
};

export type ReconciliationOutput = {
  currency: string;
  expectedRemainingMinor: number | null;
  uncertainty: "supported" | "insufficient_information" | "unsupported";
};
