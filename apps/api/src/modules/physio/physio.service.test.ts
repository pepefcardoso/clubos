import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PrismaClient } from "../../../generated/prisma/index.js";
import {
  getPhysioClubs,
  validatePhysioClubSwitch,
  grantPhysioClubAccess,
  revokePhysioClubAccess,
} from "./physio.service.js";
import { ForbiddenError, NotFoundError } from "../../lib/errors.js";

function makePrisma(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(base),
    ),
    $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    user: {
      findUnique: vi.fn(),
    },
    physioClubAccess: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    ...overrides,
  };
  return base as unknown as PrismaClient;
}

const USER_ID = "user_physio_001";
const CLUB_PRIMARY = "clubabc0000000000001";
const CLUB_EXTRA = "clubxyz0000000000002";
const ADMIN_ID = "user_admin_001";

const PHYSIO_USER_ROW = {
  clubId: CLUB_PRIMARY,
  role: "PHYSIO",
  club: { id: CLUB_PRIMARY, name: "Clube Principal", logoUrl: null },
  physioClubAccess: [
    {
      clubId: CLUB_EXTRA,
      isActive: true,
      club: {
        id: CLUB_EXTRA,
        name: "Clube Extra",
        logoUrl: "https://example.com/logo.png",
      },
    },
  ],
};

describe("getPhysioClubs()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
  });

  it("returns primary club as first entry with isPrimary=true", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      PHYSIO_USER_ROW as never,
    );
    const clubs = await getPhysioClubs(prisma, USER_ID);
    expect(clubs[0]).toMatchObject({
      clubId: CLUB_PRIMARY,
      isPrimary: true,
    });
  });

  it("returns additional club with isPrimary=false", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      PHYSIO_USER_ROW as never,
    );
    const clubs = await getPhysioClubs(prisma, USER_ID);
    expect(clubs[1]).toMatchObject({
      clubId: CLUB_EXTRA,
      isPrimary: false,
      clubName: "Clube Extra",
    });
  });

  it("includes logoUrl from club row", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(
      PHYSIO_USER_ROW as never,
    );
    const clubs = await getPhysioClubs(prisma, USER_ID);
    expect(clubs[1]!.clubLogoUrl).toBe("https://example.com/logo.png");
  });

  it("returns only primary club when no additional access rows exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...PHYSIO_USER_ROW,
      physioClubAccess: [],
    } as never);
    const clubs = await getPhysioClubs(prisma, USER_ID);
    expect(clubs).toHaveLength(1);
    expect(clubs[0]!.isPrimary).toBe(true);
  });

  it("deduplicates: primary club appearing in physioClubAccess is not returned twice", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...PHYSIO_USER_ROW,
      physioClubAccess: [
        {
          clubId: CLUB_PRIMARY,
          isActive: true,
          club: { id: CLUB_PRIMARY, name: "Clube Principal", logoUrl: null },
        },
        {
          clubId: CLUB_EXTRA,
          isActive: true,
          club: { id: CLUB_EXTRA, name: "Clube Extra", logoUrl: null },
        },
      ],
    } as never);
    const clubs = await getPhysioClubs(prisma, USER_ID);
    const primaryCount = clubs.filter((c) => c.clubId === CLUB_PRIMARY).length;
    expect(primaryCount).toBe(1);
  });

  it("throws NotFoundError when user does not exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(getPhysioClubs(prisma, "nonexistent")).rejects.toThrowError(
      NotFoundError,
    );
  });

  it("throws ForbiddenError when user is ADMIN, not PHYSIO", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...PHYSIO_USER_ROW,
      role: "ADMIN",
    } as never);
    await expect(getPhysioClubs(prisma, USER_ID)).rejects.toThrowError(
      ForbiddenError,
    );
  });

  it("throws ForbiddenError when user is TREASURER, not PHYSIO", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      ...PHYSIO_USER_ROW,
      role: "TREASURER",
    } as never);
    await expect(getPhysioClubs(prisma, USER_ID)).rejects.toThrowError(
      ForbiddenError,
    );
  });
});

describe("validatePhysioClubSwitch()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
  });

  it("resolves for primary club without querying physioClubAccess", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      clubId: CLUB_PRIMARY,
      role: "PHYSIO",
    } as never);
    await expect(
      validatePhysioClubSwitch(prisma, USER_ID, CLUB_PRIMARY),
    ).resolves.not.toThrow();
    expect(prisma.physioClubAccess.findUnique).not.toHaveBeenCalled();
  });

  it("resolves for club with active access row", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      clubId: CLUB_PRIMARY,
      role: "PHYSIO",
    } as never);
    vi.mocked(prisma.physioClubAccess.findUnique).mockResolvedValue({
      isActive: true,
    } as never);
    await expect(
      validatePhysioClubSwitch(prisma, USER_ID, CLUB_EXTRA),
    ).resolves.not.toThrow();
  });

  it("throws ForbiddenError when access row is inactive", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      clubId: CLUB_PRIMARY,
      role: "PHYSIO",
    } as never);
    vi.mocked(prisma.physioClubAccess.findUnique).mockResolvedValue({
      isActive: false,
    } as never);
    await expect(
      validatePhysioClubSwitch(prisma, USER_ID, CLUB_EXTRA),
    ).rejects.toThrowError(ForbiddenError);
  });

  it("throws ForbiddenError when no access row exists", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      clubId: CLUB_PRIMARY,
      role: "PHYSIO",
    } as never);
    vi.mocked(prisma.physioClubAccess.findUnique).mockResolvedValue(null);
    await expect(
      validatePhysioClubSwitch(prisma, USER_ID, CLUB_EXTRA),
    ).rejects.toThrowError(ForbiddenError);
  });

  it("throws ForbiddenError when user is not PHYSIO", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      clubId: CLUB_PRIMARY,
      role: "ADMIN",
    } as never);
    await expect(
      validatePhysioClubSwitch(prisma, USER_ID, CLUB_EXTRA),
    ).rejects.toThrowError(ForbiddenError);
  });

  it("throws ForbiddenError (not NotFoundError) when user is missing", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    const err = await validatePhysioClubSwitch(prisma, "bad", CLUB_EXTRA).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(ForbiddenError);
  });
});

describe("grantPhysioClubAccess()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: "PHYSIO",
    } as never);
    vi.mocked(prisma.physioClubAccess.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.physioClubAccess.create).mockResolvedValue({
      id: "access_001",
    } as never);
  });

  it("creates a new access row and returns its id", async () => {
    const result = await grantPhysioClubAccess(
      prisma,
      ADMIN_ID,
      CLUB_PRIMARY,
      USER_ID,
      CLUB_PRIMARY,
    );
    expect(result.id).toBe("access_001");
    expect(prisma.physioClubAccess.create).toHaveBeenCalledOnce();
  });

  it("re-activates an inactive row instead of inserting a duplicate", async () => {
    vi.mocked(prisma.physioClubAccess.findUnique).mockResolvedValue({
      id: "access_existing",
      isActive: false,
    } as never);
    const result = await grantPhysioClubAccess(
      prisma,
      ADMIN_ID,
      CLUB_PRIMARY,
      USER_ID,
      CLUB_PRIMARY,
    );
    expect(prisma.physioClubAccess.update).toHaveBeenCalledOnce();
    expect(prisma.physioClubAccess.create).not.toHaveBeenCalled();
    expect(result.id).toBe("access_existing");
  });

  it("is idempotent — returns existing id when already active", async () => {
    vi.mocked(prisma.physioClubAccess.findUnique).mockResolvedValue({
      id: "access_existing",
      isActive: true,
    } as never);
    const result = await grantPhysioClubAccess(
      prisma,
      ADMIN_ID,
      CLUB_PRIMARY,
      USER_ID,
      CLUB_PRIMARY,
    );
    expect(prisma.physioClubAccess.create).not.toHaveBeenCalled();
    expect(result.id).toBe("access_existing");
  });

  it("throws ForbiddenError when adminClubId !== targetClubId", async () => {
    await expect(
      grantPhysioClubAccess(
        prisma,
        ADMIN_ID,
        CLUB_PRIMARY,
        USER_ID,
        CLUB_EXTRA,
      ),
    ).rejects.toThrowError(ForbiddenError);
  });

  it("throws ForbiddenError when target user is not PHYSIO", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      role: "TREASURER",
    } as never);
    await expect(
      grantPhysioClubAccess(
        prisma,
        ADMIN_ID,
        CLUB_PRIMARY,
        USER_ID,
        CLUB_PRIMARY,
      ),
    ).rejects.toThrowError(ForbiddenError);
  });

  it("throws NotFoundError when target user does not exist", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    await expect(
      grantPhysioClubAccess(
        prisma,
        ADMIN_ID,
        CLUB_PRIMARY,
        USER_ID,
        CLUB_PRIMARY,
      ),
    ).rejects.toThrowError(NotFoundError);
  });
});

describe("revokePhysioClubAccess()", () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    vi.clearAllMocks();
    vi.mocked(prisma.physioClubAccess.findUnique).mockResolvedValue({
      clubId: CLUB_PRIMARY,
      isActive: true,
    } as never);
    vi.mocked(prisma.physioClubAccess.update).mockResolvedValue({} as never);
  });

  it("sets isActive=false on an active row", async () => {
    await revokePhysioClubAccess(prisma, CLUB_PRIMARY, "access_001");
    expect(prisma.physioClubAccess.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isActive: false } }),
    );
  });

  it("is idempotent — no update when already revoked", async () => {
    vi.mocked(prisma.physioClubAccess.findUnique).mockResolvedValue({
      clubId: CLUB_PRIMARY,
      isActive: false,
    } as never);
    await revokePhysioClubAccess(prisma, CLUB_PRIMARY, "access_001");
    expect(prisma.physioClubAccess.update).not.toHaveBeenCalled();
  });

  it("throws ForbiddenError when adminClubId does not match row clubId", async () => {
    vi.mocked(prisma.physioClubAccess.findUnique).mockResolvedValue({
      clubId: CLUB_EXTRA,
      isActive: true,
    } as never);
    await expect(
      revokePhysioClubAccess(prisma, CLUB_PRIMARY, "access_001"),
    ).rejects.toThrowError(ForbiddenError);
  });

  it("throws NotFoundError for unknown accessId", async () => {
    vi.mocked(prisma.physioClubAccess.findUnique).mockResolvedValue(null);
    await expect(
      revokePhysioClubAccess(prisma, CLUB_PRIMARY, "nonexistent"),
    ).rejects.toThrowError(NotFoundError);
  });
});
