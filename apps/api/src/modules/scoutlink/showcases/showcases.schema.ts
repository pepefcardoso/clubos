import { z } from "zod";

export const PublishShowcaseBodySchema = z.object({
  tier: z.enum(["FREE", "PREMIUM"]),
});

export const ShowcaseAthleteParamsSchema = z.object({
  athleteId: z.string().min(1),
});

export type PublishShowcaseBody = z.infer<typeof PublishShowcaseBodySchema>;
export type ShowcaseAthleteParams = z.infer<typeof ShowcaseAthleteParamsSchema>;
