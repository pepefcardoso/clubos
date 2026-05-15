import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../../lib/errors.js";

vi.mock("../../../lib/prisma.js", () => ({
  withTenantSchema: vi.fn(),
}));

vi.mock("../communication/communication-log.service.js", () => ({
  appendCommunicationLog: vi.fn().mockResolvedValue(undefined),
}));

import { withTenantSchema } from "../../../lib/prisma.js";
import { appendCommunicationLog } from "../communication/communication-log.service.js";
import { createContactRequest } from "./contact.service.js";

const SCOUT_ID = "scout-001";
const ATHLETE_ID = "athlete-001";
const CLUB_ID = "club-001";
const CONTACT_REQ_ID = "cr-001";

const ADULT_BIRTH_DATE = new Date("2000-01-01");
const MINOR_BIRTH_DATE = new Date("2015-01-01");

function makePrisma(overrides: Record<string, unknown> = {}) {
  return {
    scoutShowcase: {
      findFirst: vi.fn().mockResolvedValue({
        id: "showcase-001",
        clubId: CLUB_ID,
        athleteId: ATHLETE_ID,
      }),
    },
    scoutProfile: {
      findUnique: vi.fn().mockResolvedValue({
        subscriptionStatus: "ACTIVE",
        subscriptionExpiresAt: null,
      }),
    },
    parentalConsent: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    contactRequest: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: CONTACT_REQ_ID }),
    },
    ...overrides,
  };
}

function setupWithTenantSchema(birthDate: Date) {
  vi.mocked(withTenantSchema).mockImplementation(
    async (_prisma, _clubId, fn) => {
      const fakeTx = {
        athlete: {
          findUnique: vi.fn().mockResolvedValue({ birthDate }),
        },
      };
      return fn(fakeTx as never);
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createContactRequest", () => {
  describe("happy path — adult athlete", () => {
    it("returns 201 payload and logs CONTACT_REQUEST_CREATED", async () => {
      const prisma = makePrisma();
      setupWithTenantSchema(ADULT_BIRTH_DATE);

      const result = await createContactRequest(
        prisma as never,
        SCOUT_ID,
        { athleteId: ATHLETE_ID, reason: "Interested in midfielder" },
        "1.2.3.4",
      );

      expect(result).toEqual({
        contactRequestId: CONTACT_REQ_ID,
        status: "PENDING",
        athleteId: ATHLETE_ID,
        clubId: CLUB_ID,
      });

      expect(prisma.contactRequest.create).toHaveBeenCalledOnce();

      expect(appendCommunicationLog).toHaveBeenCalledOnce();
      expect(vi.mocked(appendCommunicationLog).mock.calls[0]![1]).toMatchObject(
        {
          eventType: "CONTACT_REQUEST_CREATED",
          actorId: SCOUT_ID,
          targetId: ATHLETE_ID,
        },
      );
    });
  });

  describe("happy path — minor WITH parental consent", () => {
    it("creates the request when consent row exists", async () => {
      const prisma = makePrisma({
        parentalConsent: {
          findFirst: vi.fn().mockResolvedValue({ id: "consent-001" }),
        },
      });
      setupWithTenantSchema(MINOR_BIRTH_DATE);

      const result = await createContactRequest(prisma as never, SCOUT_ID, {
        athleteId: ATHLETE_ID,
      });

      expect(result.status).toBe("PENDING");
      expect(prisma.contactRequest.create).toHaveBeenCalledOnce();
      expect(vi.mocked(appendCommunicationLog).mock.calls[0]![1]).toMatchObject(
        {
          eventType: "CONTACT_REQUEST_CREATED",
        },
      );
    });
  });

  describe("hard stop — minor WITHOUT parental consent", () => {
    it("throws ForbiddenError and logs CONTACT_BLOCKED_MINOR without creating a row", async () => {
      const prisma = makePrisma();
      setupWithTenantSchema(MINOR_BIRTH_DATE);

      await expect(
        createContactRequest(
          prisma as never,
          SCOUT_ID,
          { athleteId: ATHLETE_ID },
          "1.2.3.4",
        ),
      ).rejects.toThrow(ForbiddenError);

      expect(prisma.contactRequest.create).not.toHaveBeenCalled();

      expect(appendCommunicationLog).toHaveBeenCalledOnce();
      expect(vi.mocked(appendCommunicationLog).mock.calls[0]![1]).toMatchObject(
        {
          eventType: "CONTACT_BLOCKED_MINOR",
          actorId: SCOUT_ID,
          targetId: ATHLETE_ID,
          ip: "1.2.3.4",
        },
      );
    });
  });

  describe("subscription gate", () => {
    it("throws ForbiddenError and logs CONTACT_BLOCKED_NO_SUBSCRIPTION when status is INACTIVE", async () => {
      const prisma = makePrisma({
        scoutProfile: {
          findUnique: vi.fn().mockResolvedValue({
            subscriptionStatus: "INACTIVE",
            subscriptionExpiresAt: null,
          }),
        },
      });
      setupWithTenantSchema(ADULT_BIRTH_DATE);

      await expect(
        createContactRequest(prisma as never, SCOUT_ID, {
          athleteId: ATHLETE_ID,
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(prisma.contactRequest.create).not.toHaveBeenCalled();
      expect(vi.mocked(appendCommunicationLog).mock.calls[0]![1]).toMatchObject(
        {
          eventType: "CONTACT_BLOCKED_NO_SUBSCRIPTION",
        },
      );
    });

    it("throws ForbiddenError when subscription is ACTIVE but expired", async () => {
      const prisma = makePrisma({
        scoutProfile: {
          findUnique: vi.fn().mockResolvedValue({
            subscriptionStatus: "ACTIVE",
            subscriptionExpiresAt: new Date("2020-01-01"),
          }),
        },
      });

      await expect(
        createContactRequest(prisma as never, SCOUT_ID, {
          athleteId: ATHLETE_ID,
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(prisma.contactRequest.create).not.toHaveBeenCalled();
    });
  });

  describe("30-day duplicate check", () => {
    it("throws ConflictError and logs CONTACT_DUPLICATE_BLOCKED when duplicate exists", async () => {
      const prisma = makePrisma({
        contactRequest: {
          findFirst: vi.fn().mockResolvedValue({ id: "existing-cr" }),
          create: vi.fn(),
        },
      });
      setupWithTenantSchema(ADULT_BIRTH_DATE);

      await expect(
        createContactRequest(prisma as never, SCOUT_ID, {
          athleteId: ATHLETE_ID,
        }),
      ).rejects.toThrow(ConflictError);

      expect(prisma.contactRequest.create).not.toHaveBeenCalled();
      expect(vi.mocked(appendCommunicationLog).mock.calls[0]![1]).toMatchObject(
        {
          eventType: "CONTACT_DUPLICATE_BLOCKED",
        },
      );
    });
  });

  describe("showcase not found", () => {
    it("throws NotFoundError before any log or db write", async () => {
      const prisma = makePrisma({
        scoutShowcase: { findFirst: vi.fn().mockResolvedValue(null) },
      });

      await expect(
        createContactRequest(prisma as never, SCOUT_ID, {
          athleteId: ATHLETE_ID,
        }),
      ).rejects.toThrow(NotFoundError);

      expect(appendCommunicationLog).not.toHaveBeenCalled();
      expect(prisma.contactRequest.create).not.toHaveBeenCalled();
    });
  });

  describe("security — [SEC-TEN]", () => {
    it("never passes null to withTenantSchema", async () => {
      const prisma = makePrisma();
      setupWithTenantSchema(ADULT_BIRTH_DATE);

      await createContactRequest(prisma as never, SCOUT_ID, {
        athleteId: ATHLETE_ID,
      });

      const [, clubIdArg] = vi.mocked(withTenantSchema).mock.calls[0]!;
      expect(clubIdArg).not.toBeNull();
      expect(clubIdArg).toBe(CLUB_ID);
    });
  });

  describe("appendCommunicationLog called exactly once per outcome", () => {
    it("happy path → exactly 1 log call", async () => {
      const prisma = makePrisma();
      setupWithTenantSchema(ADULT_BIRTH_DATE);

      await createContactRequest(prisma as never, SCOUT_ID, {
        athleteId: ATHLETE_ID,
      });

      expect(appendCommunicationLog).toHaveBeenCalledTimes(1);
    });

    it("blocked minor → exactly 1 log call", async () => {
      const prisma = makePrisma();
      setupWithTenantSchema(MINOR_BIRTH_DATE);

      await expect(
        createContactRequest(prisma as never, SCOUT_ID, {
          athleteId: ATHLETE_ID,
        }),
      ).rejects.toThrow(ForbiddenError);

      expect(appendCommunicationLog).toHaveBeenCalledTimes(1);
    });
  });
});
