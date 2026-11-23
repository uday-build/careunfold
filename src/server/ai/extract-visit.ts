import { z } from "zod";
import { HttpError } from "../http/errors";
import { allergyRowSchema, medicationRowSchema } from "../domain/validation";
import {
  extractionConfigured,
  fileContentPart,
  openRouterChat,
  openRouterConfigured,
  openRouterModels,
  openRouterPrivacy,
  parseJsonObject,
} from "./openrouter";

export const extractedVisitSchema = z.object({
  patientName: z.string().trim().nullable(),
  visitDate: z.string().trim().nullable(),
  startTime: z.string().trim().nullable(),
  provider: z.string().trim().nullable(),
  providerRole: z.enum(["physician", "nurse", "therapist", "other"]).nullable(),
  modality: z.enum(["in_person_outpatient", "telehealth_video", "phone", "home_visit"]).nullable(),
  location: z.string().trim().nullable(),
  reason: z.string().trim().nullable(),
  chiefComplaint: z.string().trim().nullable(),
  allergies: z.array(allergyRowSchema).nullable(),
  medications: z.array(medicationRowSchema).nullable(),
});

export type ExtractedVisitFields = z.infer<typeof extractedVisitSchema>;

export type VisitExtractRequest = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
  patients: Array<{ id: string; givenName: string; familyName: string }>;
  clinicians: Array<{ displayName: string; role: string }>;
};

export async function extractVisitFields(input: VisitExtractRequest): Promise<ExtractedVisitFields> {
  if (openRouterConfigured()) return extractVisitWithOpenRouter(input);
  return extractVisitWithGateway(input);
}

export async function extractVisitWithGateway(input: VisitExtractRequest): Promise<ExtractedVisitFields> {
  if (!extractionConfigured()) {
    throw new HttpError(
      503,
      "extract_unconfigured",
      "Document extraction is not configured yet. You can still enter the visit by hand.",
    );
  }
  const { generateText, Output } = await import("ai");
  try {
    const result = await generateText({
      model: process.env.AI_VISIT_MODEL?.trim() || "google/gemini-3.8-flash",
      output: Output.object({ schema: extractedVisitSchema }),
      instructions: visitInstructions(input),
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the visit fields from this document. Leave a field null rather than guessing. The user will review and edit every value before anything is saved.",
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
      throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved. You can enter the visit by hand.");
    }
    return result.output;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved. You can enter the visit by hand.");
  }
}

async function extractVisitWithOpenRouter(input: VisitExtractRequest): Promise<ExtractedVisitFields> {
  try {
    const { text } = await openRouterChat({
      model: openRouterModels().extract,
      provider: { ...openRouterPrivacy, only: ["google-vertex", "google-ai-studio"] },
      plugins: input.mimeType === "application/pdf" ? [{ id: "file-parser", pdf: { engine: "native" } }] : undefined,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "visit_extraction",
          strict: true,
          schema: visitJsonSchema,
        },
      },
      messages: [
        { role: "system", content: visitInstructions(input) },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the visit fields from this document. Leave a field null rather than guessing. The user will review and edit every value before anything is saved.",
            },
            fileContentPart(input.filename, input.mimeType, input.bytes),
          ],
        },
      ],
    });
    const parsed = extractedVisitSchema.safeParse(parseJsonObject(text));
    if (!parsed.success) {
      throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved. You can enter the visit by hand.");
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "extract_failed", "The document could not be read. Nothing was saved. You can enter the visit by hand.");
  }
}

function visitInstructions(input: VisitExtractRequest) {
  return [
    "Extract encounter details and pre-visit intake from a medical bill, explanation of benefits, receipt, after-visit summary, or similar care document.",
    "Return the same fields a person would type: patient name, encounter date, start time, care provider name and role, encounter modality, chief complaint in the patient's words, allergies with reaction severity, and current medications with dosages.",
    "Use null or empty arrays when a field is not clearly present. Do not invent a patient name, date, time, provider, modality, chief complaint, allergy, or medication.",
    "Dates must be YYYY-MM-DD. Times must be HH:MM in 24-hour time.",
    "Provider role must be physician, nurse, therapist, or other.",
    "Modality must be in_person_outpatient, telehealth_video, phone, or home_visit.",
    "Allergy severity must be mild, moderate, or anaphylactic.",
    "Medication kind must be prescription or supplement.",
    householdContext(input),
  ].join(" ");
}

function householdContext(input: VisitExtractRequest) {
  const people = input.patients.map((person) => `${person.givenName} ${person.familyName}`.trim()).filter(Boolean);
  const clinicians = input.clinicians.map((person) => `${person.displayName} (${person.role})`.trim()).filter(Boolean);
  const parts = [];
  if (people.length > 0) {
    parts.push(`Known household patients: ${people.join("; ")}. If the document names one of these people, return that exact name.`);
  }
  if (clinicians.length > 0) {
    parts.push(`Known clinicians, nurses, and therapists: ${clinicians.join("; ")}. If the document names one of these people, return that exact display name and role.`);
  }
  return parts.join(" ");
}

const visitJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "patientName",
    "visitDate",
    "startTime",
    "provider",
    "providerRole",
    "modality",
    "location",
    "reason",
    "chiefComplaint",
    "allergies",
    "medications",
  ],
  properties: {
    patientName: { type: ["string", "null"] },
    visitDate: { type: ["string", "null"] },
    startTime: { type: ["string", "null"] },
    provider: { type: ["string", "null"] },
    providerRole: { type: ["string", "null"], enum: ["physician", "nurse", "therapist", "other", null] },
    modality: {
      type: ["string", "null"],
      enum: ["in_person_outpatient", "telehealth_video", "phone", "home_visit", null],
    },
    location: { type: ["string", "null"] },
    reason: { type: ["string", "null"] },
    chiefComplaint: { type: ["string", "null"] },
    allergies: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["substance", "severity"],
        properties: {
          substance: { type: "string" },
          severity: { type: "string", enum: ["mild", "moderate", "anaphylactic"] },
        },
      },
    },
    medications: {
      type: ["array", "null"],
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "dosage", "kind"],
        properties: {
          name: { type: "string" },
          dosage: { type: ["string", "null"] },
          kind: { type: "string", enum: ["prescription", "supplement"] },
        },
      },
    },
  },
};
