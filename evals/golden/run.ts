import { classifyBillingIssue, type IssueClassification } from "@/server/ai/classify-issue";
import { extractClaimEvidence, type ExtractedClaimFields } from "@/server/ai/extract-claim";
import { investigateBilling, type BillingInvestigation, type InvestigateBillingRequest } from "@/server/ai/investigate-billing";
import { loadGoldenCases, resolveGoldenDocuments, type GoldenCase, type GoldenDocument } from "./dataset";
import { modelPayloadLeak, scoreGoldenCase, type GoldenScore } from "./score";

export type GoldenRunner = {
  classify?: (input: { request: string }) => Promise<IssueClassification>;
  extract?: (input: { filename: string; mimeType: string; bytes: Uint8Array; kind: string }) => Promise<ExtractedClaimFields>;
  investigate?: (input: InvestigateBillingRequest) => Promise<BillingInvestigation>;
};

export type GoldenRun = {
  id: string;
  score: GoldenScore;
  leaks: string[];
  unread: string[];
  investigation: BillingInvestigation;
};

const PLAN_PASSAGES = ["No typed plan benefits are on file for this person."];

export function listedGoldenCases() {
  return loadGoldenCases({ includeAlternate: false });
}

export async function runGoldenCase(item: GoldenCase, runner: GoldenRunner = {}, root?: string): Promise<GoldenRun> {
  const documents = resolveGoldenDocuments(item, root);
  const classify = runner.classify ?? classifyBillingIssue;
  const extract = runner.extract ?? extractClaimEvidence;
  const investigate = runner.investigate ?? investigateBilling;

  const classifyInput = { request: item.prompt };
  const classification = await classify(classifyInput);
  const extracted = await mapPool(documents, 3, async (document) => {
    try {
      return {
        filename: document.filename,
        kind: document.productKind,
        sourceKind: document.kind,
        extracted: await extract({
          filename: document.filename,
          mimeType: "application/pdf",
          bytes: document.bytes,
          kind: document.productKind,
        }),
      };
    } catch (error) {
      return {
        filename: document.filename,
        kind: document.productKind,
        sourceKind: document.kind,
        extracted: null,
        error: error instanceof Error ? error.message : "The document could not be read.",
      };
    }
  });
  const evidence = [];
  const unread = [];
  for (const row of extracted) {
    if (row.extracted) {
      evidence.push({
        filename: row.filename,
        kind: row.kind,
        sourceKind: row.sourceKind,
        extracted: row.extracted,
      });
    } else {
      unread.push("error" in row && row.error ? `${row.filename}: ${row.error}` : row.filename);
    }
  }
  const investigateInput = investigationInput(item, classification, evidence, documents);
  const leaks = modelPayloadLeak(JSON.stringify({ classifyInput, investigateInput: serializeInvestigateInput(investigateInput) }), item);
  const investigation = await investigate(investigateInput);
  return {
    id: item.id,
    score: scoreGoldenCase(investigation, item),
    leaks,
    unread,
    investigation,
  };
}

export function investigationInput(
  item: GoldenCase,
  classification: IssueClassification,
  evidence: Array<{ filename: string; kind: string; sourceKind?: string; extracted: ExtractedClaimFields }>,
  documents: GoldenDocument[] = [],
): InvestigateBillingRequest {
  return {
    request: item.prompt,
    classification,
    visit: visitFromEvidence(evidence, documents),
    evidence,
    planPassages: PLAN_PASSAGES,
  };
}

function visitFromEvidence(
  evidence: Array<{ extracted: ExtractedClaimFields }>,
  documents: GoldenDocument[],
) {
  const names = evidence.map((row) => row.extracted.patientName).filter((value): value is string => Boolean(value));
  const dates = evidence.map((row) => row.extracted.visitDate).filter((value): value is string => Boolean(value));
  const providers = evidence.map((row) => row.extracted.providerName).filter((value): value is string => Boolean(value));
  return {
    patientName: majority(names) ?? "Patient",
    visitDate: majority(dates) ?? "1970-01-01",
    provider: majority(providers) ?? documents[0]?.filename ?? null,
  };
}

function serializeInvestigateInput(input: InvestigateBillingRequest) {
  return {
    request: input.request,
    classification: input.classification,
    visit: input.visit,
    planPassages: input.planPassages,
    evidence: input.evidence.map((row) => ({ filename: row.filename, kind: row.kind, extracted: row.extracted })),
  };
}

function majority(values: string[]) {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () => worker()));
  return out;
}
