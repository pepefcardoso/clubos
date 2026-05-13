import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../../../../generated/prisma/index.js";
import { withTenantSchema } from "../../../lib/prisma.js";
import { assertAthleteExists } from "../../../lib/assert-tenant-ownership.js";
import { uploadToR2, deleteFromR2 } from "../../../lib/r2.js";
import {
  validateVideoMagicBytes,
  InvalidVideoMagicBytesError,
  ALLOWED_VIDEO_MIME_TYPES,
} from "../../../lib/file-validation.js";
import { assertVideoDurationWithinLimit } from "../../../lib/ffprobe.js";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../../../lib/errors.js";
import type { VideoResponse } from "./videos.schema.js";

export const MAX_VIDEOS_PER_ATHLETE = 5;
export const MAX_VIDEO_SIZE_BYTES = 100 * 1024 * 1024;

export class VideoLimitExceededError extends ConflictError {
  constructor() {
    super(
      `Limite de ${MAX_VIDEOS_PER_ATHLETE} vídeos por atleta atingido. ` +
        "Remova um vídeo antes de adicionar outro.",
    );
  }
}

export class VideoTooLargeError extends ValidationError {
  constructor() {
    super("Arquivo excede o limite de 100 MB.");
  }
}

export class InvalidVideoTypeError extends ValidationError {
  constructor(detected: string) {
    super(
      `Tipo de arquivo não permitido: "${detected}". ` +
        "Envie um vídeo MP4 ou WebM.",
    );
  }
}

export class VideoNotFoundError extends NotFoundError {
  constructor() {
    super("Vídeo não encontrado.");
  }
}

function toVideoResponse(v: {
  id: string;
  athleteId: string;
  clubId: string;
  r2Key: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
  order: number;
  uploadedAt: Date;
}): VideoResponse {
  return {
    id: v.id,
    athleteId: v.athleteId,
    clubId: v.clubId,
    r2Key: v.r2Key,
    durationSeconds: v.durationSeconds,
    thumbnailUrl: v.thumbnailUrl,
    order: v.order,
    uploadedAt: v.uploadedAt,
  };
}

/**
 * Validates, uploads, and persists a showcase video for an athlete.
 *
 * Pipeline (order is significant — R2 upload before DB row):
 *  1. Athlete exists in tenant schema [SEC-TEN][SEC-OBJ]
 *  2. Size guard (belt-and-suspenders; route-level multipart limit already applied)
 *  3. Declared MIME fast-fail (before the async magic bytes check)
 *  4. Magic bytes validation — authoritative over client Content-Type [SEC-FILE]
 *  5. FFprobe duration — client-supplied metadata ignored [SEC-FILE]
 *  6. 5-video cap check (app-layer enforcement per T-166 spec)
 *  7. Upload to R2 using randomUUID key — original filename discarded [SEC-FILE]
 *  8. Persist in tenant schema; order = current count (append-at-end)
 *
 * If R2 upload succeeds but the DB insert fails, the orphaned R2 object is
 * deleted in the catch block so storage and DB stay consistent.
 */
export async function uploadAthleteVideo(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
  buffer: Buffer,
  mimetype: string,
): Promise<VideoResponse> {
  await withTenantSchema(prisma, clubId, async (tx) => {
    await assertAthleteExists(tx, athleteId);
  });

  if (buffer.length > MAX_VIDEO_SIZE_BYTES) {
    throw new VideoTooLargeError();
  }

  if (!ALLOWED_VIDEO_MIME_TYPES.has(mimetype)) {
    throw new InvalidVideoTypeError(mimetype);
  }

  try {
    await validateVideoMagicBytes(buffer);
  } catch (err) {
    if (err instanceof InvalidVideoMagicBytesError) {
      throw new InvalidVideoTypeError(
        (err.message.match(/detectado: ([^)]+)/) ?? [])[1] ?? mimetype,
      );
    }
    throw err;
  }

  const durationSeconds = await assertVideoDurationWithinLimit(buffer);

  const currentCount = await withTenantSchema(prisma, clubId, async (tx) => {
    return tx.showcaseVideo.count({ where: { athleteId } });
  });
  if (currentCount >= MAX_VIDEOS_PER_ATHLETE) {
    throw new VideoLimitExceededError();
  }

  const r2Key = randomUUID();
  await uploadToR2(r2Key, buffer, mimetype);

  let video: VideoResponse;
  try {
    video = await withTenantSchema(prisma, clubId, async (tx) => {
      const orderIndex = await tx.showcaseVideo.count({ where: { athleteId } });
      const row = await tx.showcaseVideo.create({
        data: {
          id: randomUUID(),
          athleteId,
          clubId,
          r2Key,
          durationSeconds,
          thumbnailUrl: null,
          order: orderIndex,
        },
        select: {
          id: true,
          athleteId: true,
          clubId: true,
          r2Key: true,
          durationSeconds: true,
          thumbnailUrl: true,
          order: true,
          uploadedAt: true,
        },
      });
      return toVideoResponse(row);
    });
  } catch (err) {
    await deleteFromR2(r2Key).catch((delErr) => {
      console.error("[videos] R2 cleanup after DB failure:", delErr);
    });
    throw err;
  }

  return video;
}

/**
 * Deletes a showcase video from R2 and the tenant DB.
 *
 * Ownership is verified by querying within the authenticated club's tenant
 * schema — a row from Club A cannot appear in Club B's schema. [SEC-TEN][SEC-OBJ]
 *
 * R2 deletion is attempted first; if it fails the DB row is kept so the
 * operator can retry R2 cleanup manually without losing the reference.
 */
export async function deleteAthleteVideo(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
  videoId: string,
): Promise<void> {
  const r2Key = await withTenantSchema(prisma, clubId, async (tx) => {
    const row = await tx.showcaseVideo.findFirst({
      where: { id: videoId, athleteId, clubId },
      select: { r2Key: true },
    });
    if (!row) throw new VideoNotFoundError();
    return row.r2Key;
  });

  await deleteFromR2(r2Key);

  await withTenantSchema(prisma, clubId, async (tx) => {
    await tx.showcaseVideo.delete({ where: { id: videoId } });

    const remaining = await tx.showcaseVideo.findMany({
      where: { athleteId },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    await Promise.all(
      remaining.map((v, i) =>
        tx.showcaseVideo.update({
          where: { id: v.id },
          data: { order: i },
        }),
      ),
    );
  });
}

/**
 * Reorders an athlete's showcase videos.
 *
 * `orderedIds` must contain exactly the IDs of all current videos for this
 * athlete in the desired order. Extra or missing IDs → ValidationError.
 */
export async function reorderAthleteVideos(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
  orderedIds: string[],
): Promise<VideoResponse[]> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    await assertAthleteExists(tx, athleteId);

    const existing = await tx.showcaseVideo.findMany({
      where: { athleteId, clubId },
      select: { id: true },
    });

    const existingIds = new Set(existing.map((v) => v.id));
    const inputIds = new Set(orderedIds);

    if (
      existingIds.size !== inputIds.size ||
      [...existingIds].some((id) => !inputIds.has(id))
    ) {
      throw new ValidationError(
        "orderedIds deve conter exatamente os IDs de todos os vídeos do atleta.",
      );
    }

    await Promise.all(
      orderedIds.map((id, i) =>
        tx.showcaseVideo.update({
          where: { id },
          data: { order: i },
        }),
      ),
    );

    const updated = await tx.showcaseVideo.findMany({
      where: { athleteId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        athleteId: true,
        clubId: true,
        r2Key: true,
        durationSeconds: true,
        thumbnailUrl: true,
        order: true,
        uploadedAt: true,
      },
    });

    return updated.map(toVideoResponse);
  });
}

export async function listAthleteVideos(
  prisma: PrismaClient,
  clubId: string,
  athleteId: string,
): Promise<VideoResponse[]> {
  return withTenantSchema(prisma, clubId, async (tx) => {
    await assertAthleteExists(tx, athleteId);
    const rows = await tx.showcaseVideo.findMany({
      where: { athleteId, clubId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        athleteId: true,
        clubId: true,
        r2Key: true,
        durationSeconds: true,
        thumbnailUrl: true,
        order: true,
        uploadedAt: true,
      },
    });
    return rows.map(toVideoResponse);
  });
}
