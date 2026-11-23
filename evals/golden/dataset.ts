import { readFileSync } from "node:fs";
import path from "node:path";
import type { DocumentKind } from "@/server/domain/validation";

export type GoldenExpected = {
  eob_responsibility_cents: number | null;
  verified_patient_payments_cents: number | null;
  supported_remaining_cents: number | null;
  provider_statement_balance_cents: number | null;
  primary_responsibility_cents?: number | null;
  secondary_payment_cents?: number | null;
  remaining_deductible_cents?: number | null;
  remaining_oop_cents?: number | null;
  arithmetic_eob_net_cents?: number | null;
  refund_cents?: number | null;
  net_patient_payments_cents?: number | null;
  balances_by_account_cents?: Record<string, number>;
};

export type GoldenCase = {
  id: string;
  caseId: string;
  release: string;
  prompt: string;
  inputDocumentIds: string[];
  status: string;
  expected: GoldenExpected;
  requiredFindings: string[];
  missingEvidence: string[];
  forbiddenClaims: string[];
  alternate: boolean;
};

export type GoldenDocument = {
  documentId: string;
  kind: string;
  productKind: DocumentKind;
  filename: string;
  path: string;
  bytes: Buffer;
};

const PRODUCT_KIND: Record<string, DocumentKind> = {
  bill: "bill",
  adjusted_bill: "adjusted_bill",
  eob: "eob",
  eob_secondary: "eob",
  receipt: "receipt",
};

export function goldenRoot(cwd = process.cwd()) {
  return path.resolve(cwd, "data/CareUnfold_Golden_v1_1");
}

export function loadGoldenCases(options: { includeAlternate?: boolean; root?: string } = {}): GoldenCase[] {
  const root = options.root ?? goldenRoot();
  const lines = readFileSync(path.join(root, "owner/eval_cases.jsonl"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const cases = lines.map(parseGoldenCase);
  if (options.includeAlternate) return cases;
  return cases.filter((item) => !item.alternate);
}

export function loadManifest(root = goldenRoot()) {
  const text = readFileSync(path.join(root, "owner/document_manifest.csv"), "utf8");
  const [headerLine, ...rows] = text.trim().split(/\r?\n/);
  const headers = (headerLine ?? "").split(",");
  const documentIdIndex = headers.indexOf("document_id");
  const kindIndex = headers.indexOf("kind");
  const pathIndex = headers.indexOf("path");
  const files = new Map<string, { documentId: string; kind: string; relativePath: string }>();
  for (const row of rows) {
    const cells = splitCsv(row);
    const documentId = cells[documentIdIndex];
    const kind = cells[kindIndex];
    const relativePath = cells[pathIndex];
    if (!documentId || !kind || !relativePath) continue;
    files.set(documentId, { documentId, kind, relativePath });
  }
  return files;
}

export function resolveGoldenDocuments(item: GoldenCase, root = goldenRoot()): GoldenDocument[] {
  const manifest = loadManifest(root);
  return item.inputDocumentIds.map((documentId) => {
    const entry = manifest.get(documentId);
    if (!entry) throw new Error(`Document ${documentId} is missing from the golden manifest.`);
    const filePath = path.join(root, "tester_packets", entry.relativePath);
    return {
      documentId,
      kind: entry.kind,
      productKind: PRODUCT_KIND[entry.kind] ?? "other",
      filename: path.basename(filePath),
      path: filePath,
      bytes: readFileSync(filePath),
    };
  });
}

export function parseGoldenCase(line: string): GoldenCase {
  const raw = JSON.parse(line) as Record<string, unknown>;
  const id = asString(raw.id);
  return {
    id,
    caseId: asString(raw.case_id),
    release: asString(raw.release),
    prompt: asString(raw.prompt),
    inputDocumentIds: asStringArray(raw.input_document_ids),
    status: asString(raw.status),
    expected: raw.expected as GoldenExpected,
    requiredFindings: asStringArray(raw.required_findings),
    missingEvidence: asStringArray(raw.missing_evidence),
    forbiddenClaims: asStringArray(raw.forbidden_claims),
    alternate: id.endsWith("-X"),
  };
}

function asString(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new Error("Golden case is missing a required string field.");
  return value;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error("Golden case is missing a required string array.");
  }
  return value;
}

function splitCsv(line: string) {
  return line.split(",");
}
