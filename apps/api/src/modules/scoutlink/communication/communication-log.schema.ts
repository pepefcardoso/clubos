import { z } from "zod";
import type { CommunicationLogEventType } from "@clubos/shared-types";

/**
 * Top-level keys forbidden in communication_log.metadata. [SEC]
 * Nested occurrences are NOT checked — only top-level keys are forbidden.
 * This is intentional and tested explicitly.
 */
const FORBIDDEN_METADATA_KEYS = ["cpf", "phone", "email"] as const;

export const CommunicationLogMetadataSchema = z
  .record(z.string(), z.unknown())
  .nullable()
  .optional()
  .superRefine((val, ctx) => {
    if (!val) return;
    for (const key of FORBIDDEN_METADATA_KEYS) {
      if (Object.prototype.hasOwnProperty.call(val, key)) {
        ctx.addIssue({
          code: "custom",
          message: `communication_log.metadata must not contain key "${key}" — PII forbidden. [SEC]`,
        });
      }
    }
  });

export const AppendCommunicationLogInputSchema = z.object({
  actorId: z.string().min(1),
  actorRole: z.string().min(1),
  targetId: z.string().min(1),
  eventType: z.string().min(1) as z.ZodType<CommunicationLogEventType>,
  metadata: CommunicationLogMetadataSchema,
  ip: z.string().optional(),
});

export type AppendCommunicationLogInput = z.infer<
  typeof AppendCommunicationLogInputSchema
>;
