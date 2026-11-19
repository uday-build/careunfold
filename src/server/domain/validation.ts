import { z } from "zod";
import { HttpError } from "../http/errors";

export const SCOPES = [
  "profile.read",
  "profile.write",
  "coverage.read",
  "coverage.write",
  "records.read",
  "records.write",
] as const;

export type Scope = (typeof SCOPES)[number];

export const SELF_SCOPES: Scope[] = [...SCOPES];
export const DEFAULT_SHARED_SCOPES: Scope[] = ["profile.read", "coverage.read", "records.read"];

export const CAREGIVER_PERMISSIONS: Array<{ scope: Scope; label: string; detail: string }> = [
  { scope: "profile.read", label: "View profile", detail: "Name, birth date, and relationship." },
  { scope: "profile.write", label: "Edit profile", detail: "Change saved family details." },
  { scope: "coverage.read", label: "View coverage", detail: "Plan identifiers and stated benefits." },
  { scope: "coverage.write", label: "Edit coverage", detail: "Change typed coverage records." },
  { scope: "records.read", label: "View records", detail: "Bills and explanations, when that work exists." },
  { scope: "records.write", label: "Add or correct records", detail: "Upload or correct documents, when that work exists." },
];

export const scopeSchema = z.enum(SCOPES);

const requiredName = z.string().trim().min(1, "Enter a name.").max(80, "Use 80 characters or fewer.");
const optionalText = z
  .string()
  .trim()
  .max(80)
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

const optionalPhone = z
  .string()
  .trim()
  .max(40)
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

const optionalUrl = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

const optionalAddress = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

export const profileInputSchema = z.object({
  displayName: requiredName,
  organizingFor: z.enum(["self", "someone_else", "both"]),
});

export const patientInputSchema = z.object({
  clientKey: z.string().trim().min(8).max(80),
  givenName: requiredName,
  familyName: requiredName,
  preferredName: optionalText,
  birthDate: z.string().trim(),
  relationship: z.enum(["self", "spouse", "parent", "child", "sibling", "other_adult", "other"]),
  authorityCategory: z.enum([
    "self",
    "adult_invitation",
    "minor_representative",
    "dependent_adult_representative",
  ]),
  invitedEmail: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value ? value.toLowerCase() : null)),
  requestedScopes: z.array(scopeSchema).optional(),
});

export const familyInputSchema = z.object({
  patients: z.array(patientInputSchema).max(12),
});

const dateFieldSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unknown") }),
  z.object({ state: z.literal("known"), value: z.string().trim() }),
]);

const moneyBenefitSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unknown") }),
  z.object({
    state: z.literal("known"),
    amountUsd: z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "Enter a dollar amount, such as 1500 or 40.00."),
  }),
]);

const percentBenefitSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("unknown") }),
  z.object({
    state: z.literal("known"),
    percent: z.coerce.number().min(0, "Use 0 to 100.").max(100, "Use 0 to 100."),
  }),
]);

export const planBenefitsSchema = z.object({
  deductible: moneyBenefitSchema,
  officeVisitCopay: moneyBenefitSchema,
  coinsurance: percentBenefitSchema,
  outOfPocketMax: moneyBenefitSchema,
  innFamilyDeductible: moneyBenefitSchema.optional(),
  innFamilyOutOfPocketMax: moneyBenefitSchema.optional(),
  specialistCopay: moneyBenefitSchema.optional(),
  urgentCareCopay: moneyBenefitSchema.optional(),
  emergencyCopay: moneyBenefitSchema.optional(),
});

export type PlanBenefits = z.infer<typeof planBenefitsSchema>;

export const UNKNOWN_PLAN_BENEFITS: PlanBenefits = {
  deductible: { state: "unknown" },
  officeVisitCopay: { state: "unknown" },
  coinsurance: { state: "unknown" },
  outOfPocketMax: { state: "unknown" },
  innFamilyDeductible: { state: "unknown" },
  innFamilyOutOfPocketMax: { state: "unknown" },
  specialistCopay: { state: "unknown" },
  urgentCareCopay: { state: "unknown" },
  emergencyCopay: { state: "unknown" },
};

export const coverageInputSchema = z.object({
  clientKey: z.string().trim().min(8).max(80),
  insurer: optionalText,
  planName: optionalText,
  subscriberName: z.string().trim().min(1, "Enter the member name.").max(80, "Use 80 characters or fewer."),
  subscriberPatientId: z.string().trim().optional().nullable(),
  memberId: z.string().trim().min(1, "Enter the member ID.").max(64, "Use 64 characters or fewer."),
  groupNumber: z.string().trim().min(1, "Enter the group ID.").max(80, "Use 80 characters or fewer."),
  start: dateFieldSchema,
  end: dateFieldSchema,
  coveredPatientIds: z.array(z.string().trim()).max(12),
  benefits: planBenefitsSchema.optional(),
  memberServicesName: optionalText,
  memberServicesPhone: optionalPhone,
  memberServicesUrl: optionalUrl,
  rxBin: optionalText,
  rxPcn: optionalText,
  rxGrp: optionalText,
  pharmacyWebsiteUrl: optionalUrl,
  pharmacyMemberServicesPhone: optionalPhone,
  pharmacyPhone: optionalPhone,
  claimsAddress: optionalAddress,
  claimsPhone: optionalPhone,
  claimsUrl: optionalUrl,
  providerSupportPhone: optionalPhone,
});

export const coverageSaveSchema = z.object({
  skip: z.boolean().optional(),
  records: z.array(coverageInputSchema).max(12).optional(),
});

export const memberAddSchema = z.object({
  email: z.email("Enter a valid email address."),
  adminRole: z.enum(["admin", "member"]),
});

export const memberRemoveSchema = z.object({
  userId: z.string().trim().min(1),
});

export const revokeSchema = z.object({
  userId: z.string().trim().min(1),
});

export const preferenceSchema = z.object({
  timeZone: z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_/+-]+$/, "Enter a time zone name."),
  locale: z.string().trim().regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Enter a locale such as en or en-US."),
});

export const privacyRequestSchema = z.object({
  kind: z.enum(["export", "deletion"]),
});

const optionalNote = z
  .string()
  .trim()
  .max(200)
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

const optionalLongNote = z
  .string()
  .trim()
  .max(4000)
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

export const PROVIDER_ROLES = [
  { value: "physician", label: "Physician" },
  { value: "nurse", label: "Nurse" },
  { value: "therapist", label: "Therapist" },
  { value: "other", label: "Other" },
] as const;

export const ENCOUNTER_MODALITIES = [
  { value: "in_person_outpatient", label: "In-person outpatient" },
  { value: "telehealth_video", label: "Telehealth video" },
  { value: "phone", label: "Phone consultation" },
  { value: "home_visit", label: "Home visit" },
] as const;

export const ALLERGY_SEVERITIES = [
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "anaphylactic", label: "Anaphylactic" },
] as const;

export const MEDICATION_KINDS = [
  { value: "prescription", label: "Prescription" },
  { value: "supplement", label: "Supplement" },
] as const;

export const allergyRowSchema = z.object({
  substance: z.string().trim().min(1, "Enter a substance.").max(80, "Use 80 characters or fewer."),
  severity: z.enum(["mild", "moderate", "anaphylactic"]),
});

export const medicationRowSchema = z.object({
  name: z.string().trim().min(1, "Enter a medication or supplement.").max(80, "Use 80 characters or fewer."),
  dosage: z.string().trim().max(80, "Use 80 characters or fewer.").optional().nullable().transform((value) => (value ? value : null)),
  kind: z.enum(["prescription", "supplement"]),
});

export const visitInputSchema = z.object({
  patientId: z.string().trim().min(1),
  visitDate: z.string().trim(),
  startTime: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((value) => (value ? value : null)),
  provider: optionalNote,
  providerRole: z.enum(["physician", "nurse", "therapist", "other"]).optional().nullable(),
  modality: z.enum(["in_person_outpatient", "telehealth_video", "phone", "home_visit"]).optional().nullable(),
  location: optionalNote,
  reason: optionalNote,
  chiefComplaint: optionalLongNote,
  allergies: z.array(allergyRowSchema).max(40).optional().default([]),
  medications: z.array(medicationRowSchema).max(40).optional().default([]),
});

export const DOCUMENT_KINDS = [
  { value: "bill", label: "Bill" },
  { value: "adjusted_bill", label: "Adjusted bill" },
  { value: "eob", label: "Explanation of benefits" },
  { value: "receipt", label: "Receipt" },
  { value: "other", label: "Other" },
] as const;

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]["value"];

export const documentKindSchema = z.enum(DOCUMENT_KINDS.map((item) => item.value) as [DocumentKind, ...DocumentKind[]]);

export const visitAskSchema = z.object({
  request: z
    .string()
    .trim()
    .min(1, "Enter what you want to look into.")
    .max(500, "Use 500 characters or fewer."),
});

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join(".") : "form";
      if (!fields[key]) fields[key] = issue.message;
    }
    throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", fields);
  }
  return result.data;
}

export function assertRealDate(value: string, field: string, options?: { notFuture?: boolean; now?: Date }): string {
  if (!isRealDate(value)) {
    throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
      [field]: "Enter a real calendar date.",
    });
  }
  if (value < "1900-01-01" || value > "2200-12-31") {
    throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
      [field]: "Enter a date between 1900 and 2200.",
    });
  }
  if (options?.notFuture && options.now) {
    const today = options.now.toISOString().slice(0, 10);
    if (value > today) {
      throw new HttpError(422, "invalid_fields", "Check the highlighted fields.", {
        [field]: "Birth date cannot be in the future.",
      });
    }
  }
  return value;
}

export function isRealTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isRealDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
