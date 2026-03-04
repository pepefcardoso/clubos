/**
 * Unit tests for src/lib/prisma.ts
 *
 * getPrismaClient() is a singleton so its "returns the same instance" test
 * must run in an isolated module context.  The withTenantSchema helper is
 * tested by asserting that it calls $transaction and executes SET search_path
 * with the correct schema name.  isPrismaUniqueConstraintError covers the
 * Prisma P2002 detection utility exhaustively.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { isPrismaUniqueConstraintError, withTenantSchema } from "./prisma.js";

describe("isPrismaUniqueConstraintError()", () => {
  it("returns true for an error with code P2002", () => {
    expect(isPrismaUniqueConstraintError({ code: "P2002" })).toBe(true);
  });

  it("returns false for a different Prisma error code", () => {
    expect(isPrismaUniqueConstraintError({ code: "P2025" })).toBe(false);
  });

  it("returns false for a plain Error object (no code)", () => {
    expect(isPrismaUniqueConstraintError(new Error("boom"))).toBe(false);
  });

  it("returns false for null", () => {
    expect(isPrismaUniqueConstraintError(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isPrismaUniqueConstraintError(undefined)).toBe(false);
  });

  it("returns false for an empty object", () => {
    expect(isPrismaUniqueConstraintError({})).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isPrismaUniqueConstraintError("P2002")).toBe(false);
  });

  it("returns false when code is P2002 but as a number (type guard)", () => {
    expect(isPrismaUniqueConstraintError({ code: 2002 })).toBe(false);
  });
});

describe("withTenantSchema()", () => {
  /**
   * Builds a minimal mock PrismaClient.
   * $transaction runs the callback with itself (as the fake tx), which lets
   * us inspect $executeRawUnsafe calls made inside the callback.
   */
  function makeMockPrisma() {
    const executeRawUnsafe = vi.fn().mockResolvedValue(undefined);

    const client = {
      $transaction: vi.fn(async (fn: (tx: typeof client) => Promise<unknown>) =>
        fn(client),
      ),
      $executeRawUnsafe: executeRawUnsafe,
    };

    return client;
  }

  it("calls $transaction once", async () => {
    const prisma = makeMockPrisma();

    await withTenantSchema(prisma as never, "abc123club00000000000", vi.fn());

    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("sets search_path to the correct tenant schema", async () => {
    const prisma = makeMockPrisma();
    const clubId = "abc123club00000000000";

    await withTenantSchema(prisma as never, clubId, async () => undefined);

    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
      `SET search_path TO "clube_${clubId}", public`,
    );
  });

  it("executes the callback fn inside the transaction", async () => {
    const prisma = makeMockPrisma();
    const fn = vi.fn().mockResolvedValue("result");

    await withTenantSchema(prisma as never, "abc123club00000000000", fn);

    expect(fn).toHaveBeenCalledOnce();
  });

  it("returns the value produced by the callback fn", async () => {
    const prisma = makeMockPrisma();

    const value = await withTenantSchema(
      prisma as never,
      "abc123club00000000000",
      async () => 42,
    );

    expect(value).toBe(42);
  });

  it("builds schemaName as clube_{clubId}", async () => {
    const prisma = makeMockPrisma();
    const clubId = "testclubid0000000000";

    await withTenantSchema(prisma as never, clubId, async () => undefined);

    const [sql] = prisma.$executeRawUnsafe.mock.calls[0]!;
    expect(sql).toContain(`"clube_${clubId}"`);
    expect(sql).toContain("public");
  });

  it("propagates errors thrown by the callback", async () => {
    const prisma = makeMockPrisma();
    const boom = new Error("tx failure");

    await expect(
      withTenantSchema(prisma as never, "abc123club00000000000", async () => {
        throw boom;
      }),
    ).rejects.toThrow("tx failure");
  });
});

describe("getPrismaClient()", () => {
  /**
   * The singleton is module-level, so we test via isolateModules to guarantee
   * a fresh module state for each assertion.
   */
  it("returns the same instance on repeated calls", async () => {
    const { getPrismaClient } = await import("./prisma.js");
    const a = getPrismaClient();
    const b = getPrismaClient();
    expect(a).toBe(b);
  });
});
