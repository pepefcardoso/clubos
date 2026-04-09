import { z } from "zod";

export const RTP_STATUSES = [
  "AFASTADO",
  "RETORNO_PROGRESSIVO",
  "LIBERADO",
] as const;

export const UpdateRtpSchema = z
  .object({
    status: z.enum(RTP_STATUSES),
    medicalRecordId: z.string().nullable().optional(),
    protocolId: z.string().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .strip();

export type UpdateRtpInput = z.infer<typeof UpdateRtpSchema>;

/** Full payload — PHYSIO | ADMIN only */
export interface RtpFullResponse {
  athleteId: string;
  status: string;
  medicalRecordId: string | null;
  protocolId: string | null;
  clearedAt: string | null;
  clearedBy: string | null;
  notes: string | null;
  updatedAt: string;
}

/** Restricted payload — COACH | TREASURER */
export interface RtpRestrictedResponse {
  athleteId: string;
  status: string | null;
}

export type RtpResponse = RtpFullResponse | RtpRestrictedResponse;
