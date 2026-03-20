/**
 * Unit tests for src/lib/assert-tenant-ownership.ts — T-066 / L-04
 *
 * All Prisma interaction is mocked with a minimal fake client. Tests verify:
 *   1. Resolves (void) when the resource exists
 *   2. Throws NotFoundError when the resource is absent
 *   3. NotFoundError carries statusCode 404 and isOperational true
 *   4. The query uses `select: { id: true }` (minimal projection)
 *   5. The WHERE clause targets the correct ID field
 */

import { describe, it, expect, vi } from "vitest";
import {
  assertMemberExists,
  assertChargeExists,
  assertPlanExists,
  assertAthleteExists,
  assertContractExists,
  assertPaymentExists,
  assertRulesConfigExists,
  assertClubBelongsToUser,
} from "./assert-tenant-ownership.js";
import { NotFoundError } from "./errors.js";

function makeMockPrisma(returnValue: unknown) {
  const findUnique = vi.fn().mockResolvedValue(returnValue);
  return {
    member: { findUnique },
    charge: { findUnique },
    plan: { findUnique },
    athlete: { findUnique },
    contract: { findUnique },
    payment: { findUnique },
    rulesConfig: { findUnique },
  };
}

function describeAssertHelper(
  label: string,
  fn: (prisma: ReturnType<typeof makeMockPrisma>, id: string) => Promise<void>,
  expectedErrorMessage: string,
  modelKey: keyof ReturnType<typeof makeMockPrisma>,
  idParam: string,
) {
  describe(label, () => {
    it("resolves (void) when the resource is found", async () => {
      const prisma = makeMockPrisma({ id: idParam });
      await expect(fn(prisma, idParam)).resolves.toBeUndefined();
    });

    it("throws NotFoundError when the resource returns null", async () => {
      const prisma = makeMockPrisma(null);
      await expect(fn(prisma, "ghost")).rejects.toBeInstanceOf(NotFoundError);
    });

    it("thrown NotFoundError has statusCode 404", async () => {
      const prisma = makeMockPrisma(null);
      try {
        await fn(prisma, "ghost");
      } catch (e) {
        expect((e as NotFoundError).statusCode).toBe(404);
      }
    });

    it("thrown NotFoundError is operational (isOperational: true)", async () => {
      const prisma = makeMockPrisma(null);
      try {
        await fn(prisma, "ghost");
      } catch (e) {
        expect((e as NotFoundError).isOperational).toBe(true);
      }
    });

    it("error message matches the expected Portuguese string", async () => {
      const prisma = makeMockPrisma(null);
      try {
        await fn(prisma, "ghost");
      } catch (e) {
        expect((e as NotFoundError).message).toBe(expectedErrorMessage);
      }
    });

    it("queries exactly `select: { id: true }` (minimal projection)", async () => {
      const prisma = makeMockPrisma({ id: idParam });
      await fn(prisma, idParam);
      expect(prisma[modelKey].findUnique).toHaveBeenCalledWith({
        where: { id: idParam },
        select: { id: true },
      });
    });

    it("calls findUnique exactly once per invocation", async () => {
      const prisma = makeMockPrisma({ id: idParam });
      await fn(prisma, idParam);
      expect(prisma[modelKey].findUnique).toHaveBeenCalledOnce();
    });

    it("passes the provided ID to the WHERE clause unchanged", async () => {
      const customId = "specific-id-12345";
      const prisma = makeMockPrisma({ id: customId });
      await fn(prisma, customId);
      const callArgs = prisma[modelKey].findUnique.mock.calls[0]?.[0] as {
        where: { id: string };
      };
      expect(callArgs.where.id).toBe(customId);
    });
  });
}

describeAssertHelper(
  "assertMemberExists()",
  (p, id) => assertMemberExists(p as never, id),
  "Sócio não encontrado.",
  "member",
  "mem-001",
);

describeAssertHelper(
  "assertChargeExists()",
  (p, id) => assertChargeExists(p as never, id),
  "Cobrança não encontrada.",
  "charge",
  "chg-001",
);

describeAssertHelper(
  "assertPlanExists()",
  (p, id) => assertPlanExists(p as never, id),
  "Plano não encontrado.",
  "plan",
  "pln-001",
);

describeAssertHelper(
  "assertAthleteExists()",
  (p, id) => assertAthleteExists(p as never, id),
  "Atleta não encontrado.",
  "athlete",
  "ath-001",
);

describeAssertHelper(
  "assertContractExists()",
  (p, id) => assertContractExists(p as never, id),
  "Contrato não encontrado.",
  "contract",
  "ctr-001",
);

describeAssertHelper(
  "assertPaymentExists()",
  (p, id) => assertPaymentExists(p as never, id),
  "Pagamento não encontrado.",
  "payment",
  "pay-001",
);

describeAssertHelper(
  "assertRulesConfigExists()",
  (p, id) => assertRulesConfigExists(p as never, id),
  "Configuração de regras não encontrada.",
  "rulesConfig",
  "rc-001",
);

describe("assertClubBelongsToUser()", () => {
  it("resolves (void) when clubIds match exactly", async () => {
    await expect(
      assertClubBelongsToUser({} as never, "club-1", "club-1"),
    ).resolves.toBeUndefined();
  });

  it("throws NotFoundError when clubIds differ", async () => {
    await expect(
      assertClubBelongsToUser({} as never, "club-2", "club-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("thrown error has statusCode 404 (not 403)", async () => {
    try {
      await assertClubBelongsToUser({} as never, "club-2", "club-1");
    } catch (e) {
      expect((e as NotFoundError).statusCode).toBe(404);
    }
  });

  it("thrown error is operational", async () => {
    try {
      await assertClubBelongsToUser({} as never, "club-2", "club-1");
    } catch (e) {
      expect((e as NotFoundError).isOperational).toBe(true);
    }
  });

  it("does NOT throw when both IDs are the same non-trivial string", async () => {
    const id = "clxyz1234567890abcdef";
    await expect(
      assertClubBelongsToUser({} as never, id, id),
    ).resolves.toBeUndefined();
  });

  it("throws when one ID is an empty string and the other is not", async () => {
    await expect(
      assertClubBelongsToUser({} as never, "", "club-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("is case-sensitive (uppercase vs lowercase differ)", async () => {
    await expect(
      assertClubBelongsToUser({} as never, "Club-1", "club-1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("error message is 'Clube não encontrado.'", async () => {
    try {
      await assertClubBelongsToUser({} as never, "club-other", "club-mine");
    } catch (e) {
      expect((e as NotFoundError).message).toBe("Clube não encontrado.");
    }
  });
});
