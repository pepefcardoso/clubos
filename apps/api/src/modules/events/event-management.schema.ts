import { z } from "zod";

const EventSectorInputSchema = z.object({
  name: z.string().min(1).max(100),
  capacity: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
});

export const CreateEventSchema = z.object({
  opponent: z.string().min(1).max(120),
  eventDate: z
    .string()
    .refine(
      (v) => !isNaN(new Date(v).getTime()),
      "eventDate must be a valid ISO datetime string",
    ),
  venue: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  sectors: z.array(EventSectorInputSchema).min(1).max(20),
});

export const UpdateEventSchema = z
  .object({
    opponent: z.string().min(1).max(120).optional(),
    eventDate: z
      .string()
      .refine(
        (v) => !isNaN(new Date(v).getTime()),
        "eventDate must be a valid ISO datetime string",
      )
      .optional(),
    venue: z.string().min(1).max(200).optional(),
    description: z.string().max(1000).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

export const ListEventsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["SCHEDULED", "LIVE", "COMPLETED", "CANCELLED"]).optional(),
});

export type CreateEventInput = z.infer<typeof CreateEventSchema>;
export type UpdateEventInput = z.infer<typeof UpdateEventSchema>;
export type ListEventsQuery = z.infer<typeof ListEventsQuerySchema>;

export interface EventSectorResponse {
  id: string;
  name: string;
  capacity: number;
  sold: number;
  priceCents: number;
}

export interface EventResponse {
  id: string;
  opponent: string;
  eventDate: Date;
  venue: string;
  description: string | null;
  status: string;
  sectors: EventSectorResponse[];
  createdAt: Date;
  updatedAt: Date;
}
