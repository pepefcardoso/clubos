import { z } from "zod";

export const INJURY_GRADES = [
  "GRADE_1",
  "GRADE_2",
  "GRADE_3",
  "COMPLETE",
] as const;

export const INJURY_MECHANISMS = [
  "CONTACT",
  "NON_CONTACT",
  "OVERUSE",
  "UNKNOWN",
] as const;

export const CreateMedicalRecordSchema = z.object({
  athleteId: z.string().min(1, "athleteId is required"),
  protocolId: z.string().optional(),
  occurredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "occurredAt must be YYYY-MM-DD"),
  structure: z
    .string()
    .min(1, "structure is required")
    .max(200, "structure must be at most 200 characters"),
  grade: z.enum(INJURY_GRADES),
  mechanism: z.enum(INJURY_MECHANISMS).default("UNKNOWN"),
  clinicalNotes: z
    .string()
    .max(5000, "clinicalNotes must be at most 5000 characters")
    .optional(),
  diagnosis: z
    .string()
    .max(2000, "diagnosis must be at most 2000 characters")
    .optional(),
  treatmentDetails: z
    .string()
    .max(5000, "treatmentDetails must be at most 5000 characters")
    .optional(),
});

export const UpdateMedicalRecordSchema = z
  .object({
    protocolId: z.string().nullable().optional(),
    occurredAt: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "occurredAt must be YYYY-MM-DD")
      .optional(),
    structure: z
      .string()
      .min(1)
      .max(200, "structure must be at most 200 characters")
      .optional(),
    grade: z.enum(INJURY_GRADES).optional(),
    mechanism: z.enum(INJURY_MECHANISMS).optional(),
    clinicalNotes: z
      .string()
      .max(5000, "clinicalNotes must be at most 5000 characters")
      .nullable()
      .optional(),
    diagnosis: z
      .string()
      .max(2000, "diagnosis must be at most 2000 characters")
      .nullable()
      .optional(),
    treatmentDetails: z
      .string()
      .max(5000, "treatmentDetails must be at most 5000 characters")
      .nullable()
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const ListMedicalRecordsQuerySchema = z.object({
  athleteId: z.string().optional(),
  grade: z.enum(INJURY_GRADES).optional(),
  /** ISO date string — lower bound of the occurredAt date range (inclusive). */
  from: z.iso.date().optional(),
  /** ISO date string — upper bound of the occurredAt date range (inclusive). */
  to: z.iso.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateMedicalRecordInput = z.infer<
  typeof CreateMedicalRecordSchema
>;
export type UpdateMedicalRecordInput = z.infer<
  typeof UpdateMedicalRecordSchema
>;
export type ListMedicalRecordsQuery = z.infer<
  typeof ListMedicalRecordsQuerySchema
>;

/**
 * Full medical record response — returned by POST (create), GET /:id, and PUT.
 * Contains decrypted clinical fields. Only accessible to PHYSIO | ADMIN.
 */
export interface MedicalRecordResponse {
  id: string;
  athleteId: string;
  athleteName: string;
  protocolId: string | null;
  /** ISO date string YYYY-MM-DD */
  occurredAt: string;
  structure: string;
  grade: string;
  mechanism: string;
  /** Decrypted clinical note — null if not set */
  clinicalNotes: string | null;
  /** Decrypted diagnosis — null if not set */
  diagnosis: string | null;
  /** Decrypted treatment details — null if not set */
  treatmentDetails: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Summary returned by the list endpoint — no clinical field decryption.
 * Reduces LGPD exposure surface and avoids bulk pgcrypto round-trips.
 * Fields kept as plaintext (structure, grade, mechanism) are sufficient
 * for dashboard analytics and injury timeline views.
 */
export interface MedicalRecordSummary {
  id: string;
  athleteId: string;
  athleteName: string;
  protocolId: string | null;
  /** ISO date string YYYY-MM-DD */
  occurredAt: string;
  structure: string;
  grade: string;
  mechanism: string;
  createdBy: string;
  createdAt: string;
}
