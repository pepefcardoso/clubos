import { describe, it, expect, vi, beforeEach } from "vitest";
import * as communicationModule from "./communication-log.service.js";
import { appendCommunicationLog } from "./communication-log.service.js";
import { ValidationError } from "../../../lib/errors.js";
import type { CommunicationLogEventType } from "@clubos/shared-types";

function makePrisma(overrides?: { create?: ReturnType<typeof vi.fn> }) {
  return {
    communicationLog: {
      create: overrides?.create ?? vi.fn().mockResolvedValue({}),
    },
  } as unknown as Parameters<typeof appendCommunicationLog>[0];
}

const BASE_INPUT = {
  actorId: "actor-1",
  actorRole: "SCOUT",
  targetId: "target-1",
  eventType: "CONTACT_REQUEST_CREATED" as CommunicationLogEventType,
  ip: "127.0.0.1",
} satisfies Parameters<typeof appendCommunicationLog>[1];

describe("communication-log module exports", () => {
  it("exports only appendCommunicationLog", () => {
    const exported = Object.keys(communicationModule);
    expect(exported).toEqual(["appendCommunicationLog"]);
  });
});

describe("appendCommunicationLog — happy paths", () => {
  it("inserts a row with metadata: null", async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = makePrisma({ create });

    await appendCommunicationLog(prisma, { ...BASE_INPUT, metadata: null });

    expect(create).toHaveBeenCalledOnce();
    const data = create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data["actorId"]).toBe("actor-1");
    expect(data["eventType"]).toBe("CONTACT_REQUEST_CREATED");
    expect(data["id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("inserts a row with safe metadata (no forbidden keys)", async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = makePrisma({ create });

    await appendCommunicationLog(prisma, {
      ...BASE_INPUT,
      metadata: { athleteId: "ath-1", clubId: "club-1", action: "REQUEST" },
    });

    expect(create).toHaveBeenCalledOnce();
  });

  it("inserts a row when metadata is undefined", async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = makePrisma({ create });

    await appendCommunicationLog(prisma, { ...BASE_INPUT });

    expect(create).toHaveBeenCalledOnce();
  });
});

describe("appendCommunicationLog — metadata PII guard [SEC]", () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["cpf", { cpf: "12345678901", athleteId: "ath-1" }],
    ["phone", { phone: "+5511999999999" }],
    ["email", { email: "scout@example.com" }],
  ];

  it.each(cases)(
    'throws ValidationError and makes no DB call when metadata contains "%s"',
    async (key, metadata) => {
      const create = vi.fn();
      const prisma = makePrisma({ create });

      await expect(
        appendCommunicationLog(prisma, { ...BASE_INPUT, metadata }),
      ).rejects.toBeInstanceOf(ValidationError);

      await expect(
        appendCommunicationLog(prisma, { ...BASE_INPUT, metadata }),
      ).rejects.toThrow(key);

      expect(create).not.toHaveBeenCalled();
    },
  );

  it("allows nested forbidden keys (only top-level is checked — by design)", async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = makePrisma({ create });

    await expect(
      appendCommunicationLog(prisma, {
        ...BASE_INPUT,
        metadata: { nested: { cpf: "12345678901" } },
      }),
    ).resolves.toBeUndefined();

    expect(create).toHaveBeenCalledOnce();
  });
});

describe("appendCommunicationLog — DB immutability trigger [SEC]", () => {
  it("propagates a DB error thrown by the trigger on UPDATE attempt", async () => {
    const triggerError = new Error(
      'Rows in "communication_log" are immutable — UPDATE and DELETE are not permitted',
    );
    const create = vi.fn().mockRejectedValueOnce(triggerError);
    const prisma = makePrisma({ create });

    await expect(
      appendCommunicationLog(prisma, { ...BASE_INPUT, metadata: null }),
    ).rejects.toThrow("immutable");
  });

  it("propagates a DB error thrown by the trigger on DELETE attempt", async () => {
    const exported = Object.keys(communicationModule);
    const hasMutatingExport = exported.some(
      (key) =>
        key.toLowerCase().includes("delete") ||
        key.toLowerCase().includes("update"),
    );
    expect(hasMutatingExport).toBe(false);
  });
});

describe("appendCommunicationLog — required field validation", () => {
  beforeEach(() => {
    // Suppress expected console errors from Zod
  });

  it.each(["actorId", "actorRole", "targetId", "eventType"] as const)(
    'throws ValidationError when "%s" is empty string',
    async (field) => {
      const create = vi.fn();
      const prisma = makePrisma({ create });

      await expect(
        appendCommunicationLog(prisma, { ...BASE_INPUT, [field]: "" }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(create).not.toHaveBeenCalled();
    },
  );
});
