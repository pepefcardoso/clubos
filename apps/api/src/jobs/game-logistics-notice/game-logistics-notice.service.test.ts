import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendGameLogisticsNotice } from "./game-logistics-notice.service.js";

vi.mock("../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(
    async (_prisma: unknown, _clubId: string, fn: (tx: unknown) => unknown) =>
      fn(makeTenantTx()),
  ),
}));

const mockSendEmail = vi.fn();
vi.mock("../../lib/email.js", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

import { withTenantSchema } from "../../lib/prisma.js";

const CLUB_ID = "club-abc";
const EVENT_ID = "evt-001";

const BASE_EVENT = {
  opponent: "Flamengo",
  eventDate: new Date("2025-08-10T20:00:00Z"),
  venue: "Estádio Municipal",
  status: "SCHEDULED",
};

const BASE_ATHLETES = [
  { name: "João Silva", position: "Atacante" },
  { name: "Pedro Costa", position: null },
];

function makeTenantTx(
  eventOverride?: typeof BASE_EVENT | null,
  athletesOverride?: typeof BASE_ATHLETES,
) {
  return {
    event: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          eventOverride === null ? null : (eventOverride ?? BASE_EVENT),
        ),
    },
    athlete: {
      findMany: vi.fn().mockResolvedValue(athletesOverride ?? BASE_ATHLETES),
    },
  };
}

function makePublicPrisma(opts: {
  club?: { name: string } | null;
  users?: Array<{ email: string }>;
}) {
  return {
    club: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          opts.club !== undefined ? opts.club : { name: "Clube Teste" },
        ),
    },
    user: {
      findMany: vi
        .fn()
        .mockResolvedValue(opts.users ?? [{ email: "admin@clube.com" }]),
    },
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(withTenantSchema).mockImplementation(async (_prisma, _clubId, fn) =>
    fn(makeTenantTx() as never),
  );
  mockSendEmail.mockResolvedValue(undefined);
});

describe("sendGameLogisticsNotice() — skips", () => {
  it("returns skipped when club not found", async () => {
    const prisma = makePublicPrisma({ club: null });
    const result = await sendGameLogisticsNotice(prisma, CLUB_ID, EVENT_ID);
    expect(result).toEqual({
      clubId: CLUB_ID,
      sent: 0,
      skipped: 1,
      reason: "club_not_found",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns skipped when no ADMIN users exist", async () => {
    const prisma = makePublicPrisma({ users: [] });
    const result = await sendGameLogisticsNotice(prisma, CLUB_ID, EVENT_ID);
    expect(result).toEqual({
      clubId: CLUB_ID,
      sent: 0,
      skipped: 1,
      reason: "no_admin_users",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns skipped when event not found in tenant schema", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce(async (_p, _c, fn) =>
      fn(makeTenantTx(null) as never),
    );
    const prisma = makePublicPrisma({});
    const result = await sendGameLogisticsNotice(prisma, CLUB_ID, EVENT_ID);
    expect(result).toEqual({
      clubId: CLUB_ID,
      sent: 0,
      skipped: 1,
      reason: "event_not_found_or_cancelled",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("returns skipped when event is CANCELLED", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce(async (_p, _c, fn) =>
      fn(makeTenantTx({ ...BASE_EVENT, status: "CANCELLED" }) as never),
    );
    const prisma = makePublicPrisma({});
    const result = await sendGameLogisticsNotice(prisma, CLUB_ID, EVENT_ID);
    expect(result.skipped).toBe(1);
    expect(result.reason).toBe("event_not_found_or_cancelled");
  });
});

describe("sendGameLogisticsNotice() — happy path", () => {
  it("sends email to each ADMIN user and returns correct sent count", async () => {
    const prisma = makePublicPrisma({
      users: [{ email: "a@clube.com" }, { email: "b@clube.com" }],
    });
    const result = await sendGameLogisticsNotice(prisma, CLUB_ID, EVENT_ID);
    expect(result.sent).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it("does not call withTenantSchema for club/user lookup", async () => {
    const prisma = makePublicPrisma({});
    await sendGameLogisticsNotice(prisma, CLUB_ID, EVENT_ID);
    expect(vi.mocked(withTenantSchema)).toHaveBeenCalledOnce();
  });

  it("passes clubId to withTenantSchema [SEC-TEN]", async () => {
    const prisma = makePublicPrisma({});
    await sendGameLogisticsNotice(prisma, CLUB_ID, EVENT_ID);
    expect(vi.mocked(withTenantSchema)).toHaveBeenCalledWith(
      expect.anything(),
      CLUB_ID,
      expect.any(Function),
    );
  });
});

describe("sendGameLogisticsNotice() — email error isolation", () => {
  it("records error for failing recipient and continues sending to others", async () => {
    const prisma = makePublicPrisma({
      users: [{ email: "a@clube.com" }, { email: "b@clube.com" }],
    });
    mockSendEmail
      .mockRejectedValueOnce(new Error("Resend quota exceeded"))
      .mockResolvedValueOnce(undefined);

    const result = await sendGameLogisticsNotice(prisma, CLUB_ID, EVENT_ID);

    expect(result.sent).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors![0]).toContain("Resend quota exceeded");
  });

  it("returns sent=0 and errors when all sends fail", async () => {
    const prisma = makePublicPrisma({
      users: [{ email: "a@clube.com" }],
    });
    mockSendEmail.mockRejectedValueOnce(new Error("Provider down"));

    const result = await sendGameLogisticsNotice(prisma, CLUB_ID, EVENT_ID);

    expect(result.sent).toBe(0);
    expect(result.errors).toHaveLength(1);
  });
});

describe("sendGameLogisticsNotice() — no active athletes", () => {
  it("sends email with empty roster — does not throw", async () => {
    vi.mocked(withTenantSchema).mockImplementationOnce(async (_p, _c, fn) =>
      fn(makeTenantTx(undefined, []) as never),
    );
    const prisma = makePublicPrisma({});
    const result = await sendGameLogisticsNotice(prisma, CLUB_ID, EVENT_ID);
    expect(result.sent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledOnce();
  });
});
