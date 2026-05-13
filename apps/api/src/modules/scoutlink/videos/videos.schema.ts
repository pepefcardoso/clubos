import { z } from "zod";

export const VideoParamsSchema = z.object({
  athleteId: z.string().min(1),
});

export const VideoIdParamsSchema = z.object({
  athleteId: z.string().min(1),
  videoId: z.string().min(1),
});

export const ReorderVideosSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(5),
});

export interface VideoResponse {
  id: string;
  athleteId: string;
  clubId: string;
  r2Key: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  order: number;
  uploadedAt: Date;
}
