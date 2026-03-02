import { z } from "zod";

export const ListMessagesQuerySchema = z.object({
  memberId: z.string().optional(),
  channel: z.enum(["WHATSAPP", "EMAIL"]).optional(),
  status: z.enum(["SENT", "FAILED", "PENDING"]).optional(),
  template: z.string().optional(),
  /** ISO datetime — lower bound on createdAt */
  dateFrom: z.iso.datetime().optional(),
  /** ISO datetime — upper bound on createdAt */
  dateTo: z.iso.datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;

export interface MessageListItem {
  id: string;
  memberId: string;
  channel: "WHATSAPP" | "EMAIL";
  template: string;
  status: "SENT" | "FAILED" | "PENDING";
  sentAt: Date | null;
  failReason: string | null;
  createdAt: Date;
}

export interface MessageListResult {
  data: MessageListItem[];
  total: number;
  page: number;
  limit: number;
}
