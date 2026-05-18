import { describe, it, expect, vi, beforeEach } from "vitest";
import { transferShowcase } from "./showcase-transfer.service.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../lib/errors.js";
import * as ownership from "../../../lib/assert-tenant-ownership.js";
import * as tenantSchema from "../../../lib/tenant-schema.js";
import * as commLog from "../communication/communication-log.service.js";
import * as sseBus from "../../../lib/sse-bus.js";

const CLUB_A = "aaaabbbbccccddddeeee1234";
const CLUB_B = "bbbbccccddddeeeeaaaa1234";
const ATHLETE_ID = "athlete-cuid2-000000000001";
const ACTOR_ID = "actor-id-001";
const SOURCE_SHOWCASE_ID = "showcase-source-001";

function makeSourceShowcase(overrides: Record<string, unknown> = {}) {
  return {
    id: SOURCE_SHOWCASE_ID,
    clubId: CLUB_A,
    athleteId: ATHLETE_ID,
    tier: "FREE",
    snapshot: { athleteId: ATHLETE_ID },
    snapshotHash: "abc123",
    isPublished: true,
    publishedAt: new Date("2025-01-01T00:00:00Z"),
    transferredAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    club: {
      findUnique: vi.fn().mockResolvedValue({ id: CLUB_B }),
    },
    scoutShowcase: {
      findUnique: vi.fn().mockResolvedValue(makeSourceShowcase()),
      upsert: vi
        .fn()
        .mockResolvedValue({ id: "showcase-target-001", tier: "FREE" }),
      update: vi.fn().mockResolvedValue({}),
    },
    parentalConsent: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    ...overrides,
  } as unknown as Parameters<typeof transferShowcase>[0];
}

beforeEach(() => {
  vi.spyOn(ownership, "assertShowcaseBelongsToClub").mockResolvedValue(
    SOURCE_SHOWCASE_ID,
  );
  vi.spyOn(tenantSchema, "assertValidClubId").mockReturnValue(undefined);
  vi.spyOn(commLog, "appendCommunicationLog").mockResolvedValue(undefined);
  vi.spyOn(sseBus, "emitShowcaseUpdated").mockReturnValue(undefined);
});

describe("transferShowcase", () => {
  it("happy path — transfers showcase and returns correct shape", async () => {
    const prisma = makePrisma();
    const result = await transferShowcase(
      prisma,
      CLUB_A,
      ATHLETE_ID,
      ACTOR_ID,
      {
        targetClubId: CLUB_B,
      },
    );

    expect(result.sourceClubId).toBe(CLUB_A);
    expect(result.targetClubId).toBe(CLUB_B);
    expect(result.athleteId).toBe(ATHLETE_ID);
    expect(result.sourceShowcaseId).toBe(SOURCE_SHOWCASE_ID);
    expect(result.transferredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(prisma.scoutShowcase.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: SOURCE_SHOWCASE_ID } }),
    );
  });

  it("happy path (minor) — consentHash matches stored hash", async () => {
    const prisma = makePrisma({
      parentalConsent: {
        findFirst: vi.fn().mockResolvedValue({ consentHash: "valid-hash" }),
      },
    });
    await expect(
      transferShowcase(prisma, CLUB_A, ATHLETE_ID, ACTOR_ID, {
        targetClubId: CLUB_B,
        consentHash: "valid-hash",
      }),
    ).resolves.not.toThrow();
  });

  it("emits SSE for both source and target clubs on success", async () => {
    const prisma = makePrisma();
    await transferShowcase(prisma, CLUB_A, ATHLETE_ID, ACTOR_ID, {
      targetClubId: CLUB_B,
    });

    expect(sseBus.emitShowcaseUpdated).toHaveBeenCalledWith(
      CLUB_A,
      expect.objectContaining({ athleteId: ATHLETE_ID }),
    );
    expect(sseBus.emitShowcaseUpdated).toHaveBeenCalledWith(
      CLUB_B,
      expect.objectContaining({ athleteId: ATHLETE_ID }),
    );
  });

  it("calls appendCommunicationLog with SHOWCASE_TRANSFERRED", async () => {
    const prisma = makePrisma();
    await transferShowcase(prisma, CLUB_A, ATHLETE_ID, ACTOR_ID, {
      targetClubId: CLUB_B,
    });

    expect(commLog.appendCommunicationLog).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        eventType: "SHOWCASE_TRANSFERRED",
        targetId: ATHLETE_ID,
      }),
    );
  });

  it("409 — targetClubId equals sourceClubId", async () => {
    await expect(
      transferShowcase(makePrisma(), CLUB_A, ATHLETE_ID, ACTOR_ID, {
        targetClubId: CLUB_A,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("409 — showcase already has transferredAt set", async () => {
    const prisma = makePrisma({
      scoutShowcase: {
        findUnique: vi
          .fn()
          .mockResolvedValue(makeSourceShowcase({ transferredAt: new Date() })),
        upsert: vi.fn(),
        update: vi.fn(),
      },
    });
    await expect(
      transferShowcase(prisma, CLUB_A, ATHLETE_ID, ACTOR_ID, {
        targetClubId: CLUB_B,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("404 — target club not found in clubs table", async () => {
    const prisma = makePrisma({
      club: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    await expect(
      transferShowcase(prisma, CLUB_A, ATHLETE_ID, ACTOR_ID, {
        targetClubId: CLUB_B,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404 — source showcase not found (assertShowcaseBelongsToClub throws)", async () => {
    vi.spyOn(ownership, "assertShowcaseBelongsToClub").mockRejectedValue(
      new NotFoundError("Showcase não encontrado."),
    );
    await expect(
      transferShowcase(makePrisma(), CLUB_A, ATHLETE_ID, ACTOR_ID, {
        targetClubId: CLUB_B,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("403 — minor athlete, consentHash absent", async () => {
    const prisma = makePrisma({
      parentalConsent: {
        findFirst: vi.fn().mockResolvedValue({ consentHash: "stored-hash" }),
      },
    });
    await expect(
      transferShowcase(prisma, CLUB_A, ATHLETE_ID, ACTOR_ID, {
        targetClubId: CLUB_B,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("403 — minor athlete, wrong consentHash", async () => {
    const prisma = makePrisma({
      parentalConsent: {
        findFirst: vi.fn().mockResolvedValue({ consentHash: "stored-hash" }),
      },
    });
    await expect(
      transferShowcase(prisma, CLUB_A, ATHLETE_ID, ACTOR_ID, {
        targetClubId: CLUB_B,
        consentHash: "wrong-hash",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does not call appendCommunicationLog when service throws before upsert", async () => {
    const prisma = makePrisma({
      club: { findUnique: vi.fn().mockResolvedValue(null) },
    });
    await expect(
      transferShowcase(prisma, CLUB_A, ATHLETE_ID, ACTOR_ID, {
        targetClubId: CLUB_B,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(commLog.appendCommunicationLog).not.toHaveBeenCalled();
  });
});
