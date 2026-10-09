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

export const scopeSchema = z.enum(SCOPES);

const requiredName = z.string().trim().min(1, "Enter a name.").max(80, "Use 80 characters or fewer.");
const optionalText = z
  .string()
  .trim()
  .max(80)
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

export const coverageInputSchema = z.object({
  clientKey: z.string().trim().min(8).max(80),
  insurer: optionalText,
  planName: optionalText,
  subscriberName: optionalText,
  subscriberPatientId: z.string().trim().optional().nullable(),
  memberId: optionalText,
  groupNumber: optionalText,
  start: dateFieldSchema,
  end: dateFieldSchema,
  coveredPatientIds: z.array(z.string().trim()).max(12),
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
