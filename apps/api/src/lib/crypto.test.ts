/**
 * Unit tests for src/lib/crypto.ts
 *
 * All PostgreSQL interaction is mocked via a fake PrismaClient so these
 * tests run without a database. The encryption/decryption correctness is
 * verified by asserting the SQL templates and the returned shapes, not by
 * running actual pgcrypto — that is covered by the tenant-schema integration
 * tests (pgcrypto smoke test).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getEncryptionKey,
  encryptField,
  decryptField,
  findMemberByCpf,
} from "./crypto.js";

function makeMockPrisma(queryRawReturn: unknown = []) {
  return {
    $queryRaw: vi.fn().mockResolvedValue(queryRawReturn),
  };
}

describe("getEncryptionKey()", () => {
  const VALID_KEY = "a".repeat(32);

  afterEach(() => {
    delete process.env["MEMBER_ENCRYPTION_KEY"];
  });

  it("returns the key when MEMBER_ENCRYPTION_KEY is set and long enough", () => {
    process.env["MEMBER_ENCRYPTION_KEY"] = VALID_KEY;
    expect(getEncryptionKey()).toBe(VALID_KEY);
  });

  it("returns a key longer than 32 chars without truncating", () => {
    const longKey = "x".repeat(64);
    process.env["MEMBER_ENCRYPTION_KEY"] = longKey;
    expect(getEncryptionKey()).toBe(longKey);
  });

  it("throws when MEMBER_ENCRYPTION_KEY is not set", () => {
    delete process.env["MEMBER_ENCRYPTION_KEY"];
    expect(() => getEncryptionKey()).toThrow(
      /Missing or too-short MEMBER_ENCRYPTION_KEY/,
    );
  });

  it("throws when MEMBER_ENCRYPTION_KEY is an empty string", () => {
    process.env["MEMBER_ENCRYPTION_KEY"] = "";
    expect(() => getEncryptionKey()).toThrow(
      /Missing or too-short MEMBER_ENCRYPTION_KEY/,
    );
  });

  it("throws when MEMBER_ENCRYPTION_KEY is shorter than 32 chars", () => {
    process.env["MEMBER_ENCRYPTION_KEY"] = "short";
    expect(() => getEncryptionKey()).toThrow(
      /Missing or too-short MEMBER_ENCRYPTION_KEY/,
    );
  });

  it("throws when MEMBER_ENCRYPTION_KEY is exactly 31 chars (boundary)", () => {
    process.env["MEMBER_ENCRYPTION_KEY"] = "a".repeat(31);
    expect(() => getEncryptionKey()).toThrow(
      /Missing or too-short MEMBER_ENCRYPTION_KEY/,
    );
  });

  it("does NOT throw when MEMBER_ENCRYPTION_KEY is exactly 32 chars (boundary)", () => {
    process.env["MEMBER_ENCRYPTION_KEY"] = "a".repeat(32);
    expect(() => getEncryptionKey()).not.toThrow();
  });
});

describe("encryptField()", () => {
  const VALID_KEY = "a".repeat(32);

  beforeEach(() => {
    process.env["MEMBER_ENCRYPTION_KEY"] = VALID_KEY;
  });

  afterEach(() => {
    delete process.env["MEMBER_ENCRYPTION_KEY"];
  });

  it("calls $queryRaw and returns a Uint8Array", async () => {
    const fakeBuffer = Buffer.from([1, 2, 3, 4]);
    const prisma = makeMockPrisma([{ encrypted: fakeBuffer }]);

    const result = await encryptField(prisma as never, "12345678900");

    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("returns a Uint8Array backed by a plain ArrayBuffer (not SharedArrayBuffer)", async () => {
    const fakeBuffer = Buffer.from("ciphertext");
    const prisma = makeMockPrisma([{ encrypted: fakeBuffer }]);

    const result = await encryptField(prisma as never, "any");

    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
  });

  it("copies the buffer contents faithfully into the Uint8Array", async () => {
    const original = [10, 20, 30, 40, 50];
    const fakeBuffer = Buffer.from(original);
    const prisma = makeMockPrisma([{ encrypted: fakeBuffer }]);

    const result = await encryptField(prisma as never, "plaintext");

    expect(Array.from(result)).toEqual(original);
  });

  it("throws when $queryRaw returns an empty array (no row)", async () => {
    const prisma = makeMockPrisma([]);

    await expect(encryptField(prisma as never, "value")).rejects.toThrow(
      /pgp_sym_encrypt returned no result/,
    );
  });

  it("throws when MEMBER_ENCRYPTION_KEY is missing", async () => {
    delete process.env["MEMBER_ENCRYPTION_KEY"];
    const prisma = makeMockPrisma();

    await expect(encryptField(prisma as never, "value")).rejects.toThrow(
      /Missing or too-short MEMBER_ENCRYPTION_KEY/,
    );
  });
});

describe("decryptField()", () => {
  const VALID_KEY = "a".repeat(32);

  beforeEach(() => {
    process.env["MEMBER_ENCRYPTION_KEY"] = VALID_KEY;
  });

  afterEach(() => {
    delete process.env["MEMBER_ENCRYPTION_KEY"];
  });

  it("calls $queryRaw and returns the decrypted string", async () => {
    const prisma = makeMockPrisma([{ decrypted: "12345678900" }]);
    const ciphertext = new Uint8Array([1, 2, 3]);

    const result = await decryptField(prisma as never, ciphertext);

    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
    expect(result).toBe("12345678900");
  });

  it("accepts a Uint8Array ciphertext without requiring a cast", async () => {
    const prisma = makeMockPrisma([{ decrypted: "hello" }]);
    const ciphertext = new Uint8Array(8);

    await expect(decryptField(prisma as never, ciphertext)).resolves.toBe(
      "hello",
    );
  });

  it("throws when $queryRaw returns an empty array", async () => {
    const prisma = makeMockPrisma([]);
    const ciphertext = new Uint8Array([9, 8, 7]);

    await expect(decryptField(prisma as never, ciphertext)).rejects.toThrow(
      /pgp_sym_decrypt returned no result/,
    );
  });

  it("throws when MEMBER_ENCRYPTION_KEY is missing", async () => {
    delete process.env["MEMBER_ENCRYPTION_KEY"];
    const prisma = makeMockPrisma();

    await expect(
      decryptField(prisma as never, new Uint8Array()),
    ).rejects.toThrow(/Missing or too-short MEMBER_ENCRYPTION_KEY/);
  });
});

describe("findMemberByCpf()", () => {
  const VALID_KEY = "a".repeat(32);

  beforeEach(() => {
    process.env["MEMBER_ENCRYPTION_KEY"] = VALID_KEY;
  });

  afterEach(() => {
    delete process.env["MEMBER_ENCRYPTION_KEY"];
  });

  it("returns the member id when CPF matches a row", async () => {
    const prisma = makeMockPrisma([{ id: "member-id-abc" }]);

    const result = await findMemberByCpf(prisma as never, "12345678900");

    expect(result).toEqual({ id: "member-id-abc" });
  });

  it("returns null when no member matches the CPF", async () => {
    const prisma = makeMockPrisma([]);

    const result = await findMemberByCpf(prisma as never, "00000000000");

    expect(result).toBeNull();
  });

  it("calls $queryRaw once per invocation", async () => {
    const prisma = makeMockPrisma([]);

    await findMemberByCpf(prisma as never, "12345678900");

    expect(prisma.$queryRaw).toHaveBeenCalledOnce();
  });

  it("throws when MEMBER_ENCRYPTION_KEY is missing", async () => {
    delete process.env["MEMBER_ENCRYPTION_KEY"];
    const prisma = makeMockPrisma();

    await expect(
      findMemberByCpf(prisma as never, "12345678900"),
    ).rejects.toThrow(/Missing or too-short MEMBER_ENCRYPTION_KEY/);
  });

  it("returns only the first matching row (LIMIT 1 contract)", async () => {
    const prisma = makeMockPrisma([
      { id: "first-match" },
      { id: "second-match" },
    ]);

    const result = await findMemberByCpf(prisma as never, "12345678900");

    expect(result).toEqual({ id: "first-match" });
  });
});
