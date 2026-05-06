import { z } from "zod";

export const ValidateTicketBodySchema = z.object({
  qrPayload: z.string().min(1),
});

export type ValidateTicketBody = z.infer<typeof ValidateTicketBodySchema>;

export interface ValidateTicketResponse {
  ticketId: string;
  fanName: string;
  sectorName: string;
  eventId: string;
  checkedInAt: string;
}
