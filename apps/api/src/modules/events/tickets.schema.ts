import { z } from "zod";

export const PurchaseTicketInputSchema = z.object({
  sectorId: z.string().min(1),
  fanName: z.string().min(2).max(120),
  fanEmail: z.email(),
  fanPhone: z.string().min(10).max(20),
  /**
   * CPF required by Brazilian payment gateways for PIX charge creation.
   * Passed directly to the gateway — NOT persisted in the database.
   * LGPD note: this data transits through the gateway only; review under T-160.
   */
  fanCpf: z
    .string()
    .length(11)
    .regex(/^\d{11}$/, "CPF must be 11 digits"),
});

export type PurchaseTicketInput = z.infer<typeof PurchaseTicketInputSchema>;

export interface PurchaseTicketResponse {
  ticketId: string;
  status: "PENDING";
  fanEmail: string;
  sectorName: string;
  amountCents: number;
  gatewayMeta: {
    qrCodeBase64?: string;
    pixCopyPaste?: string;
    [key: string]: unknown;
  };
}
