import { describe, it, expect, vi } from "vitest";
import {
  signQrToken,
  verifyQrToken,
  validateFieldAccess,
} from "./field-access.service.js";
import type { ValidateAccessOptions } from "./field-access.service.js";

const SECRET = "test-access-qr-secret-32chars-min!!";

describe("verifyQrToken", () => {
  it("accepts a valid token", () => {
    const token = signQrToken(
      { sub: "m1", eventId: "evt1", type: "field_access" },
      SECRET,
    );
    const payload = verifyQrToken(token, SECRET);
    expect(payload.sub).toBe("m1");
    expect(payload.eventId).toBe("evt1");
    expect(payload.type).toBe("field_access");
  });

  it("accepts a valid token with null eventId", () => {
    const token = signQrToken(
      { sub: "m1", eventId: null, type: "field_access" },
      SECRET,
    );
    const payload = verifyQrToken(token, SECRET);
    expect(payload.eventId).toBeNull();
  });

  it("throws on tampered signature", () => {
    const token = signQrToken(
      { sub: "m1", eventId: "evt1", type: "field_access" },
      SECRET,
    );
    const parts = token.split(".");
    const tampered = `${parts[0]}.${parts[1]}.invalidsig`;
    expect(() => verifyQrToken(tampered, SECRET)).toThrow(
      "Assinatura inválida.",
    );
  });

  it("throws when signed with a different secret", () => {
    const token = signQrToken(
      { sub: "m1", eventId: "evt1", type: "field_access" },
      SECRET,
    );
    expect(() =>
      verifyQrToken(token, "wrong-secret-32-chars-minimum!!!"),
    ).toThrow("Assinatura inválida.");
  });

  it("throws on wrong token type", () => {
    const wrongType = signQrToken(
      {
        sub: "m1",
        eventId: "evt1",
        type: "member_card" as unknown as "field_access",
      },
      SECRET,
    );
    expect(() => verifyQrToken(wrongType, SECRET)).toThrow(
      "Tipo de token inválido.",
    );
  });

  it("throws on expired token", async () => {
    const { createHmac } = await import("node:crypto");
    const now = Math.floor(Date.now() / 1000);

    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const body = Buffer.from(
      JSON.stringify({
        sub: "m1",
        eventId: "evt1",
        type: "field_access",
        iat: now - 7200,
        exp: now - 1,
      }),
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const sig = createHmac("sha256", SECRET)
      .update(`${header}.${body}`)
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    expect(() => verifyQrToken(`${header}.${body}.${sig}`, SECRET)).toThrow(
      "QR Code expirado.",
    );
  });

  it("throws on malformed token (not 3 parts)", () => {
    expect(() => verifyQrToken("not-a-token", SECRET)).toThrow(
      "Formato de token inválido.",
    );
  });

  it("throws on malformed token (2 parts only)", () => {
    expect(() => verifyQrToken("header.payload", SECRET)).toThrow(
      "Formato de token inválido.",
    );
  });
});

describe("signQrToken", () => {
  it("produces a 3-part compact token", () => {
    const token = signQrToken(
      { sub: "m1", eventId: "evt1", type: "field_access" },
      SECRET,
    );
    expect(token.split(".")).toHaveLength(3);
  });

  it("embeds iat and exp claims automatically", () => {
    const before = Math.floor(Date.now() / 1000);
    const token = signQrToken(
      { sub: "m1", eventId: "evt1", type: "field_access" },
      SECRET,
    );
    const payload = verifyQrToken(token, SECRET);
    const after = Math.floor(Date.now() / 1000);

    expect(payload.iat).toBeGreaterThanOrEqual(before);
    expect(payload.iat).toBeLessThanOrEqual(after);
    expect(payload.exp).toBe(payload.iat + 4 * 60 * 60);
  });

  it("different secrets produce different signatures", () => {
    const a = signQrToken(
      { sub: "m1", eventId: "evt1", type: "field_access" },
      SECRET,
    );
    const b = signQrToken(
      { sub: "m1", eventId: "evt1", type: "field_access" },
      "other-secret-32-chars-minimum!!!",
    );
    const aSig = a.split(".")[2];
    const bSig = b.split(".")[2];
    expect(aSig).not.toBe(bSig);
  });
});

describe("validateFieldAccess", () => {
  /**
   * Builds a minimal Prisma mock that simulates withTenantSchema behaviour.
   * withTenantSchema calls prisma.$transaction(fn) passing a tx client.
   * We mock $transaction to call fn directly with a scoped tx object.
   */
  function makePrismaMock(
    overrides: {
      findUnique?: ReturnType<typeof vi.fn>;
      create?: ReturnType<typeof vi.fn>;
    } = {},
  ) {
    const fieldAccessLog = {
      findUnique: overrides.findUnique ?? vi.fn().mockResolvedValue(null),
      create: overrides.create ?? vi.fn().mockResolvedValue({ id: "log-1" }),
    };
    const auditLog = {
      create: vi.fn().mockResolvedValue({}),
    };

    const txClient = {
      fieldAccessLog,
      auditLog,
      $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
    };

    return {
      $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) =>
        fn(txClient),
      ),
      fieldAccessLog: {
        findUnique: overrides.findUnique ?? vi.fn().mockResolvedValue(null),
      },
      txClient,
      auditLog,
    };
  }

  function makeOptions(
    overrides: Partial<ValidateAccessOptions> = {},
  ): ValidateAccessOptions {
    return {
      clubId: "testclub123456789012345",
      actorId: "user-1",
      eventId: "evt-1",
      input: {
        token: signQrToken(
          { sub: "m1", eventId: "evt-1", type: "field_access" },
          SECRET,
        ),
        idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
      },
      secret: SECRET,
      ...overrides,
    };
  }

  it("returns valid=true for a correct token with matching eventId", async () => {
    const prisma = makePrismaMock();

    const result = await validateFieldAccess(
      prisma as unknown as import("../../../generated/prisma/index.js").PrismaClient,
      makeOptions(),
    );

    expect(result.valid).toBe(true);
    expect(result.accessLogId).toBe("log-1");
    expect(result.reason).toBeUndefined();
  });

  it("returns valid=false when token eventId does not match path param", async () => {
    const prisma = makePrismaMock({
      create: vi.fn().mockResolvedValue({ id: "log-2" }),
    });

    const tokenWithDifferentEvent = signQrToken(
      { sub: "m1", eventId: "evt-OTHER", type: "field_access" },
      SECRET,
    );

    const result = await validateFieldAccess(
      prisma as unknown as import("../../../generated/prisma/index.js").PrismaClient,
      makeOptions({
        input: {
          token: tokenWithDifferentEvent,
          idempotencyKey: "550e8400-e29b-41d4-a716-446655440001",
        },
        eventId: "evt-1",
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("QR Code não corresponde a este evento.");
  });

  it("returns valid=true when token has null eventId (open ticket)", async () => {
    const prisma = makePrismaMock();

    const nullEventToken = signQrToken(
      { sub: "m1", eventId: null, type: "field_access" },
      SECRET,
    );

    const result = await validateFieldAccess(
      prisma as unknown as import("../../../generated/prisma/index.js").PrismaClient,
      makeOptions({
        input: {
          token: nullEventToken,
          idempotencyKey: "550e8400-e29b-41d4-a716-446655440002",
        },
      }),
    );

    expect(result.valid).toBe(true);
  });

  it("returns valid=false for an invalid signature", async () => {
    const prisma = makePrismaMock({
      create: vi.fn().mockResolvedValue({ id: "log-3" }),
    });

    const result = await validateFieldAccess(
      prisma as unknown as import("../../../generated/prisma/index.js").PrismaClient,
      makeOptions({
        input: {
          token: "header.payload.badsig",
          idempotencyKey: "550e8400-e29b-41d4-a716-446655440003",
        },
      }),
    );

    expect(result.valid).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("returns stored result on duplicate idempotencyKey (no new insert)", async () => {
    const storedScannedAt = new Date("2025-10-15T20:30:00.000Z");
    const existingRow = {
      id: "existing-log-id",
      isValid: true,
      rejectionReason: null,
      scannedAt: storedScannedAt,
    };

    const prisma = makePrismaMock({
      findUnique: vi.fn().mockResolvedValue(existingRow),
    });

    const result = await validateFieldAccess(
      prisma as unknown as import("../../../generated/prisma/index.js").PrismaClient,
      makeOptions(),
    );

    expect(result.valid).toBe(true);
    expect(result.accessLogId).toBe("existing-log-id");
    expect(result.scannedAt).toBe(storedScannedAt.toISOString());
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("uses client-provided scannedAt when present", async () => {
    const prisma = makePrismaMock();
    const clientTime = "2025-10-15T20:30:00.000Z";

    const result = await validateFieldAccess(
      prisma as unknown as import("../../../generated/prisma/index.js").PrismaClient,
      makeOptions({
        input: {
          token: signQrToken(
            { sub: "m1", eventId: "evt-1", type: "field_access" },
            SECRET,
          ),
          idempotencyKey: "550e8400-e29b-41d4-a716-446655440004",
          scannedAt: clientTime,
        },
      }),
    );

    expect(result.scannedAt).toBe(clientTime);
  });

  it("proceeds without idempotencyKey (no dedup)", async () => {
    const prisma = makePrismaMock();

    const result = await validateFieldAccess(
      prisma as unknown as import("../../../generated/prisma/index.js").PrismaClient,
      makeOptions({
        input: {
          token: signQrToken(
            { sub: "m1", eventId: "evt-1", type: "field_access" },
            SECRET,
          ),
        },
      }),
    );

    expect(result.valid).toBe(true);
    expect(result.accessLogId).toBe("log-1");
  });
});
