/**
 * Unit tests for videos.service.ts
 *
 * External dependencies are mocked:
 *  - r2.ts (uploadToR2, deleteFromR2)
 *  - ffprobe.ts (assertVideoDurationWithinLimit)
 *  - file-validation.ts (validateVideoMagicBytes)
 *  - prisma.ts (withTenantSchema — passes callback through with a mock tx)
 *  - assert-tenant-ownership.ts (assertAthleteExists)
 *
 * Tests verify business rules:
 *  1. 5-video cap → VideoLimitExceededError (409)
 *  2. Size guard → VideoTooLargeError (413)
 *  3. Declared MIME not in allowlist → InvalidVideoTypeError (415)
 *  4. Magic bytes mismatch → InvalidVideoTypeError (415)
 *  5. Duration exceeded → VideoDurationExceededError (422)
 *  6. Athlete not in tenant → NotFoundError (404)
 *  7. Happy path — R2 key is randomUUID (not original filename)
 *  8. R2 cleanup on DB failure
 *  9. deleteAthleteVideo — video not found → VideoNotFoundError
 * 10. deleteAthleteVideo — R2 deleted before DB row removed
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUploadToR2 = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockDeleteFromR2 = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../lib/r2.js", () => ({
  uploadToR2: mockUploadToR2,
  deleteFromR2: mockDeleteFromR2,
}));

const mockAssertVideoDuration = vi.hoisted(() => vi.fn().mockResolvedValue(45));
vi.mock("../../../lib/ffprobe.js", () => ({
  assertVideoDurationWithinLimit: mockAssertVideoDuration,
  VideoDurationExceededError: class VideoDurationExceededError extends Error {
    readonly statusCode = 422;
    constructor(s: number) {
      super(`Vídeo excede o limite de 90s (duração detectada: ${s}s).`);
      this.name = "VideoDurationExceededError";
    }
  },
  VideoProbeError: class VideoProbeError extends Error {
    readonly statusCode = 422;
    constructor() {
      super("Não foi possível determinar a duração do vídeo.");
      this.name = "VideoProbeError";
    }
  },
}));

const mockValidateVideoMagicBytes = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
vi.mock("../../../lib/file-validation.js", () => ({
  ALLOWED_VIDEO_MIME_TYPES: new Set(["video/mp4", "video/webm"]),
  validateVideoMagicBytes: mockValidateVideoMagicBytes,
  InvalidVideoMagicBytesError: class InvalidVideoMagicBytesError extends Error {
    constructor(mime?: string) {
      super(
        mime
          ? `Formato de vídeo inválido (detectado: ${mime}). Envie MP4 ou WebM.`
          : "Arquivo não reconhecido como vídeo. Envie MP4 ou WebM.",
      );
      this.name = "InvalidVideoMagicBytesError";
    }
  },
  ALLOWED_IMAGE_MIME_TYPES: new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
  ]),
  validateImageMagicBytes: vi.fn(),
  validatePdfMagicBytes: vi.fn(),
  assertSafePath: vi.fn(),
  InvalidMagicBytesError: class extends Error {},
  InvalidPdfMagicBytesError: class extends Error {},
}));

const mockAssertAthleteExists = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);
vi.mock("../../../lib/assert-tenant-ownership.js", () => ({
  assertAthleteExists: mockAssertAthleteExists,
  assertMemberExists: vi.fn(),
  assertChargeExists: vi.fn(),
  assertPlanExists: vi.fn(),
  assertContractExists: vi.fn(),
  assertPaymentExists: vi.fn(),
  assertRulesConfigExists: vi.fn(),
  assertClubBelongsToUser: vi.fn(),
  assertEventExists: vi.fn(),
  assertEventSectorExists: vi.fn(),
  assertTicketExists: vi.fn(),
  assertPosProductExists: vi.fn(),
  assertShowcaseBelongsToClub: vi.fn(),
  assertExpenseExists: vi.fn(),
}));

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (
      _prisma: unknown,
      _clubId: string,
      fn: (tx: never) => Promise<unknown>,
    ) => fn(makeMockTx() as never),
  ),
  isPrismaUniqueConstraintError: vi.fn(),
}));

import {
  uploadAthleteVideo,
  deleteAthleteVideo,
  VideoLimitExceededError,
  VideoTooLargeError,
  InvalidVideoTypeError,
  VideoNotFoundError,
  MAX_VIDEOS_PER_ATHLETE,
  MAX_VIDEO_SIZE_BYTES,
} from "./videos.service.js";
import { NotFoundError } from "../../../lib/errors.js";
import { withTenantSchema } from "../../../lib/prisma.js";

function makeFakeVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: "vid-001",
    athleteId: "ath-001",
    clubId: "club-001",
    r2Key: "00000000-0000-0000-0000-000000000000",
    durationSeconds: 45,
    thumbnailUrl: null,
    order: 0,
    uploadedAt: new Date(),
    ...overrides,
  };
}

function makeMockTx(videoCount = 0, existingVideos: unknown[] = []) {
  return {
    showcaseVideo: {
      count: vi.fn().mockResolvedValue(videoCount),
      create: vi.fn().mockResolvedValue(makeFakeVideo()),
      findFirst: vi
        .fn()
        .mockResolvedValue(existingVideos.length ? existingVideos[0] : null),
      findMany: vi.fn().mockResolvedValue(existingVideos),
      delete: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
    },
  };
}

const VALID_BUFFER = Buffer.from("fake-video-data");
const VALID_MIME = "video/mp4";
const CLUB_ID = "club-001";
const ATHLETE_ID = "ath-001";

beforeEach(() => {
  vi.clearAllMocks();
  mockUploadToR2.mockResolvedValue(undefined);
  mockDeleteFromR2.mockResolvedValue(undefined);
  mockAssertVideoDuration.mockResolvedValue(45);
  mockValidateVideoMagicBytes.mockResolvedValue(undefined);
  mockAssertAthleteExists.mockResolvedValue(undefined);

  vi.mocked(withTenantSchema).mockImplementation(async (_prisma, _clubId, fn) =>
    fn(makeMockTx(0) as never),
  );
});

describe("uploadAthleteVideo() — validation guards", () => {
  it("throws VideoTooLargeError when buffer exceeds MAX_VIDEO_SIZE_BYTES", async () => {
    const bigBuffer = Buffer.alloc(MAX_VIDEO_SIZE_BYTES + 1);
    await expect(
      uploadAthleteVideo(
        {} as never,
        CLUB_ID,
        ATHLETE_ID,
        bigBuffer,
        VALID_MIME,
      ),
    ).rejects.toBeInstanceOf(VideoTooLargeError);
  });

  it("does NOT call R2 or ffprobe when size guard fires", async () => {
    const bigBuffer = Buffer.alloc(MAX_VIDEO_SIZE_BYTES + 1);
    await uploadAthleteVideo(
      {} as never,
      CLUB_ID,
      ATHLETE_ID,
      bigBuffer,
      VALID_MIME,
    ).catch(() => {});
    expect(mockUploadToR2).not.toHaveBeenCalled();
    expect(mockAssertVideoDuration).not.toHaveBeenCalled();
  });

  it("throws InvalidVideoTypeError for a MIME not in allowlist (application/pdf)", async () => {
    await expect(
      uploadAthleteVideo(
        {} as never,
        CLUB_ID,
        ATHLETE_ID,
        VALID_BUFFER,
        "application/pdf",
      ),
    ).rejects.toBeInstanceOf(InvalidVideoTypeError);
  });

  it("throws InvalidVideoTypeError when magic bytes validation fails", async () => {
    const { InvalidVideoMagicBytesError } =
      await import("../../../lib/file-validation.js");
    mockValidateVideoMagicBytes.mockRejectedValueOnce(
      new (InvalidVideoMagicBytesError as new (m?: string) => Error)(
        "image/jpeg",
      ),
    );
    await expect(
      uploadAthleteVideo(
        {} as never,
        CLUB_ID,
        ATHLETE_ID,
        VALID_BUFFER,
        VALID_MIME,
      ),
    ).rejects.toBeInstanceOf(InvalidVideoTypeError);
  });

  it("throws VideoDurationExceededError when ffprobe reports duration > 90s", async () => {
    const { VideoDurationExceededError } =
      await import("../../../lib/ffprobe.js");
    mockAssertVideoDuration.mockRejectedValueOnce(
      new (VideoDurationExceededError as new (s: number) => Error)(120),
    );
    await expect(
      uploadAthleteVideo(
        {} as never,
        CLUB_ID,
        ATHLETE_ID,
        VALID_BUFFER,
        VALID_MIME,
      ),
    ).rejects.toBeInstanceOf(VideoDurationExceededError);
  });

  it("throws VideoLimitExceededError when athlete already has MAX_VIDEOS_PER_ATHLETE videos", async () => {
    vi.mocked(withTenantSchema).mockImplementation(
      async (_prisma, _clubId, fn) =>
        fn(makeMockTx(MAX_VIDEOS_PER_ATHLETE) as never),
    );
    await expect(
      uploadAthleteVideo(
        {} as never,
        CLUB_ID,
        ATHLETE_ID,
        VALID_BUFFER,
        VALID_MIME,
      ),
    ).rejects.toBeInstanceOf(VideoLimitExceededError);
  });

  it("throws NotFoundError (wrapped) when assertAthleteExists fails", async () => {
    mockAssertAthleteExists.mockRejectedValueOnce(
      new NotFoundError("Atleta não encontrado."),
    );
    await expect(
      uploadAthleteVideo(
        {} as never,
        CLUB_ID,
        ATHLETE_ID,
        VALID_BUFFER,
        VALID_MIME,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("uploadAthleteVideo() — happy path", () => {
  it("resolves with a VideoResponse on valid input", async () => {
    const result = await uploadAthleteVideo(
      {} as never,
      CLUB_ID,
      ATHLETE_ID,
      VALID_BUFFER,
      VALID_MIME,
    );
    expect(result).toMatchObject({
      athleteId: "ath-001",
      clubId: "club-001",
      durationSeconds: 45,
    });
  });

  it("calls uploadToR2 exactly once", async () => {
    await uploadAthleteVideo(
      {} as never,
      CLUB_ID,
      ATHLETE_ID,
      VALID_BUFFER,
      VALID_MIME,
    );
    expect(mockUploadToR2).toHaveBeenCalledOnce();
  });

  it("uses the validated MIME as R2 ContentType", async () => {
    await uploadAthleteVideo(
      {} as never,
      CLUB_ID,
      ATHLETE_ID,
      VALID_BUFFER,
      VALID_MIME,
    );
    const [, , contentType] = mockUploadToR2.mock.calls[0]!;
    expect(contentType).toBe(VALID_MIME);
  });

  it("R2 key is a UUID (not original filename or athleteId)", async () => {
    await uploadAthleteVideo(
      {} as never,
      CLUB_ID,
      ATHLETE_ID,
      VALID_BUFFER,
      VALID_MIME,
    );
    const [r2Key] = mockUploadToR2.mock.calls[0]!;
    expect(r2Key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("R2 key does not contain athleteId or clubId", async () => {
    await uploadAthleteVideo(
      {} as never,
      CLUB_ID,
      ATHLETE_ID,
      VALID_BUFFER,
      VALID_MIME,
    );
    const [r2Key] = mockUploadToR2.mock.calls[0]!;
    expect(r2Key).not.toContain(ATHLETE_ID);
    expect(r2Key).not.toContain(CLUB_ID);
  });

  it("4th video (count=3) succeeds — cap is 5", async () => {
    vi.mocked(withTenantSchema).mockImplementation(
      async (_prisma, _clubId, fn) => fn(makeMockTx(3) as never),
    );
    await expect(
      uploadAthleteVideo(
        {} as never,
        CLUB_ID,
        ATHLETE_ID,
        VALID_BUFFER,
        VALID_MIME,
      ),
    ).resolves.toBeDefined();
  });
});

describe("uploadAthleteVideo() — R2 rollback on DB failure", () => {
  it("calls deleteFromR2 with the same key when DB create throws", async () => {
    const capturedKey = { value: "" };

    mockUploadToR2.mockImplementationOnce(async (key: string) => {
      capturedKey.value = key;
    });

    vi.mocked(withTenantSchema)
      .mockImplementationOnce(async (_p, _c, fn) => fn(makeMockTx(0) as never))
      .mockImplementationOnce(async (_p, _c, fn) => fn(makeMockTx(0) as never))
      .mockImplementationOnce(async () => {
        throw new Error("DB connection lost");
      });

    await uploadAthleteVideo(
      {} as never,
      CLUB_ID,
      ATHLETE_ID,
      VALID_BUFFER,
      VALID_MIME,
    ).catch(() => {});

    expect(mockDeleteFromR2).toHaveBeenCalledWith(capturedKey.value);
  });

  it("re-throws the original DB error after cleanup", async () => {
    vi.mocked(withTenantSchema)
      .mockImplementationOnce(async (_p, _c, fn) => fn(makeMockTx(0) as never))
      .mockImplementationOnce(async (_p, _c, fn) => fn(makeMockTx(0) as never))
      .mockImplementationOnce(async () => {
        throw new Error("unique constraint");
      });

    await expect(
      uploadAthleteVideo(
        {} as never,
        CLUB_ID,
        ATHLETE_ID,
        VALID_BUFFER,
        VALID_MIME,
      ),
    ).rejects.toThrow("unique constraint");
  });
});

describe("deleteAthleteVideo()", () => {
  it("throws VideoNotFoundError when the video row is not found", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce(async (_p, _c, fn) =>
      fn({
        showcaseVideo: { findFirst: vi.fn().mockResolvedValue(null) },
      } as never),
    );
    await expect(
      deleteAthleteVideo({} as never, CLUB_ID, ATHLETE_ID, "ghost-id"),
    ).rejects.toBeInstanceOf(VideoNotFoundError);
  });

  it("calls deleteFromR2 with the video's r2Key", async () => {
    const fakeRow = { r2Key: "r2-key-abc" };
    vi.mocked(withTenantSchema)
      .mockImplementationOnce(async (_p, _c, fn) =>
        fn({
          showcaseVideo: { findFirst: vi.fn().mockResolvedValue(fakeRow) },
        } as never),
      )
      .mockImplementationOnce(async (_p, _c, fn) =>
        fn({
          showcaseVideo: {
            delete: vi.fn().mockResolvedValue(undefined),
            findMany: vi.fn().mockResolvedValue([]),
            update: vi.fn(),
          },
        } as never),
      );

    await deleteAthleteVideo({} as never, CLUB_ID, ATHLETE_ID, "vid-001");
    expect(mockDeleteFromR2).toHaveBeenCalledWith("r2-key-abc");
  });

  it("calls deleteFromR2 before DB delete (R2 first)", async () => {
    const order: string[] = [];
    const fakeRow = { r2Key: "r2-key-xyz" };

    mockDeleteFromR2.mockImplementationOnce(async () => {
      order.push("r2");
    });

    vi.mocked(withTenantSchema)
      .mockImplementationOnce(async (_p, _c, fn) =>
        fn({
          showcaseVideo: { findFirst: vi.fn().mockResolvedValue(fakeRow) },
        } as never),
      )
      .mockImplementationOnce(async (_p, _c, fn) => {
        const result = await fn({
          showcaseVideo: {
            delete: vi.fn().mockImplementation(async () => {
              order.push("db");
            }),
            findMany: vi.fn().mockResolvedValue([]),
            update: vi.fn(),
          },
        } as never);
        return result;
      });

    await deleteAthleteVideo({} as never, CLUB_ID, ATHLETE_ID, "vid-001");
    expect(order).toEqual(["r2", "db"]);
  });
});
