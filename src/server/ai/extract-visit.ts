import { z } from "zod";
import { HttpError } from "../http/errors";
import { allergyRowSchema, medicationRowSchema } from "../domain/validation";

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
};

export async function extractVisitWithGateway(input: VisitExtractRequest): Promise<ExtractedVisitFields> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
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
      instructions:
        "Extract encounter details and pre-visit intake from a medical bill, explanation of benefits, receipt, or similar care document. Use null or empty arrays when a field is not clearly present. Do not invent a patient name, date, time, provider, modality, chief complaint, allergy, or medication. Dates must be YYYY-MM-DD. Times must be HH:MM in 24-hour time. Provider role must be physician, nurse, therapist, or other. Modality must be in_person_outpatient, telehealth_video, phone, or home_visit. Allergy severity must be mild, moderate, or anaphylactic. Medication kind must be prescription or supplement.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the patient name, visit date, start time, care provider name and role, encounter modality, chief complaint in the patient's words, allergies with reaction severity, and current medications with dosages. Leave a field null rather than guessing.",
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
