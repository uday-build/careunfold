import { z } from "zod";
import { HttpError } from "../http/errors";
import {
  extractionConfigured,
  fileContentPart,
  openRouterChat,
  openRouterConfigured,
  openRouterModels,
  openRouterPrivacy,
  parseJsonObject,
} from "./openrouter";

const nullableText = z.string().trim().nullable();
const nullableMoney = z
  .string()
  .trim()
  .nullable()
  .transform((value) => (value ? value.replace(/^\$/, "").replace(/,/g, "") : null));

export const extractedCoverageSchema = z.object({
  insurer: nullableText,
  planName: nullableText,
  subscriberName: nullableText,
  memberId: nullableText,
  groupNumber: nullableText,
  startDate: nullableText,
  endDate: nullableText,
  coveredPatientNames: z.array(z.string().trim()).nullable(),
  deductibleUsd: nullableMoney,
  innFamilyDeductibleUsd: nullableMoney,
  officeVisitCopayUsd: nullableMoney,
  specialistCopayUsd: nullableMoney,
  urgentCareCopayUsd: nullableMoney,
  emergencyCopayUsd: nullableMoney,
  outOfPocketMaxUsd: nullableMoney,
  innFamilyOutOfPocketMaxUsd: nullableMoney,
  coinsurancePercent: z.number().min(0).max(100).nullable(),
  memberServicesName: nullableText,
  memberServicesPhone: nullableText,
  memberServicesUrl: nullableText,
  rxBin: nullableText,
  rxPcn: nullableText,
  rxGrp: nullableText,
  pharmacyWebsiteUrl: nullableText,
  pharmacyMemberServicesPhone: nullableText,
  pharmacyPhone: nullableText,
  claimsAddress: nullableText,
  claimsPhone: nullableText,
  claimsUrl: nullableText,
  providerSupportPhone: nullableText,
});

export type ExtractedCoverageFields = z.infer<typeof extractedCoverageSchema>;

export type CoverageExtractRequest = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  patients: Array<{ id: string; givenName: string; familyName: string }>;
};

export async function extractCoverageFields(input: CoverageExtractRequest): Promise<ExtractedCoverageFields> {
  if (openRouterConfigured()) return extractCoverageWithOpenRouter(input);
  return extractCoverageWithGateway(input);
}

export async function extractCoverageWithGateway(input: CoverageExtractRequest): Promise<ExtractedCoverageFields> {
  if (!extractionConfigured()) {
    throw new HttpError(
      503,
      "extract_unconfigured",
      "Document extraction is not configured yet. You can still enter coverage by hand.",
    );
  }
  const { generateText, Output } = await import("ai");
  try {
    const result = await generateText({
      model: process.env.AI_VISIT_MODEL?.trim() || "google/gemini-3.8-flash",
      output: Output.object({ schema: extractedCoverageSchema }),
      instructions: coverageInstructions(input),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract insurance coverage fields from this document. Leave a field null rather than guessing. The user will review and edit every value before anything is saved.",
            },
            {
              type: "file",
              data: input.bytes,
              mediaType: input.mimeType,
              filename: input.filename,
            },
          ],
        },
      ],
    });
    if (!result.output) {
      throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved. You can enter coverage by hand.");
    }
    return result.output;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved. You can enter coverage by hand.");
  }
}

async function extractCoverageWithOpenRouter(input: CoverageExtractRequest): Promise<ExtractedCoverageFields> {
  try {
    const { text } = await openRouterChat({
      model: openRouterModels().extract,
      provider: { ...openRouterPrivacy, only: ["google-vertex", "google-ai-studio"] },
      plugins: input.mimeType === "application/pdf" ? [{ id: "file-parser", pdf: { engine: "native" } }] : undefined,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "coverage_extraction",
          strict: true,
          schema: coverageJsonSchema,
        },
      },
      messages: [
        { role: "system", content: coverageInstructions(input) },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract insurance coverage fields from this document. Leave a field null rather than guessing. The user will review and edit every value before anything is saved.",
            },
            fileContentPart(input.filename, input.mimeType, input.bytes),
          ],
        },
      ],
    });
    const parsed = extractedCoverageSchema.safeParse(parseJsonObject(text));
    if (!parsed.success) {
      throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved. You can enter coverage by hand.");
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved. You can enter coverage by hand.");
  }
}

function coverageInstructions(input: CoverageExtractRequest) {
  const people = input.patients.map((person) => `${person.givenName} ${person.familyName}`.trim()).filter(Boolean);
  return [
    "Extract insurance ID card, summary of benefits, or similar coverage document fields.",
    "Return the same fields a person would type: insurer, plan name, member name, member ID, group ID, coverage start and end dates, covered people, in-network deductibles and out-of-pocket maximums, copays, coinsurance, member services, pharmacy (RXBIN, RXPCN, RXGRP), claims, and provider support.",
    "Use null or empty arrays when a field is not clearly printed. Do not invent a member ID, group ID, dollar amount, date, or phone number.",
    "Dates must be YYYY-MM-DD. Money must be USD decimal strings such as 1500 or 40.00, without a currency symbol. Coinsurance must be a percent from 0 to 100.",
    people.length > 0
      ? `Known household patients: ${people.join("; ")}. If the document names one of these people, return that exact name in subscriberName or coveredPatientNames.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const coverageJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "insurer",
    "planName",
    "subscriberName",
    "memberId",
    "groupNumber",
    "startDate",
    "endDate",
    "coveredPatientNames",
    "deductibleUsd",
    "innFamilyDeductibleUsd",
    "officeVisitCopayUsd",
    "specialistCopayUsd",
    "urgentCareCopayUsd",
    "emergencyCopayUsd",
    "outOfPocketMaxUsd",
    "innFamilyOutOfPocketMaxUsd",
    "coinsurancePercent",
    "memberServicesName",
    "memberServicesPhone",
    "memberServicesUrl",
    "rxBin",
    "rxPcn",
    "rxGrp",
    "pharmacyWebsiteUrl",
    "pharmacyMemberServicesPhone",
    "pharmacyPhone",
    "claimsAddress",
    "claimsPhone",
    "claimsUrl",
    "providerSupportPhone",
  ],
  properties: {
    insurer: { type: ["string", "null"] },
    planName: { type: ["string", "null"] },
    subscriberName: { type: ["string", "null"] },
    memberId: { type: ["string", "null"] },
    groupNumber: { type: ["string", "null"] },
    startDate: { type: ["string", "null"] },
    endDate: { type: ["string", "null"] },
    coveredPatientNames: { type: ["array", "null"], items: { type: "string" } },
    deductibleUsd: { type: ["string", "null"] },
    innFamilyDeductibleUsd: { type: ["string", "null"] },
    officeVisitCopayUsd: { type: ["string", "null"] },
    specialistCopayUsd: { type: ["string", "null"] },
    urgentCareCopayUsd: { type: ["string", "null"] },
    emergencyCopayUsd: { type: ["string", "null"] },
    outOfPocketMaxUsd: { type: ["string", "null"] },
    innFamilyOutOfPocketMaxUsd: { type: ["string", "null"] },
    coinsurancePercent: { type: ["number", "null"] },
    memberServicesName: { type: ["string", "null"] },
    memberServicesPhone: { type: ["string", "null"] },
    memberServicesUrl: { type: ["string", "null"] },
    rxBin: { type: ["string", "null"] },
    rxPcn: { type: ["string", "null"] },
    rxGrp: { type: ["string", "null"] },
    pharmacyWebsiteUrl: { type: ["string", "null"] },
    pharmacyMemberServicesPhone: { type: ["string", "null"] },
    pharmacyPhone: { type: ["string", "null"] },
    claimsAddress: { type: ["string", "null"] },
    claimsPhone: { type: ["string", "null"] },
    claimsUrl: { type: ["string", "null"] },
    providerSupportPhone: { type: ["string", "null"] },
  },
};
