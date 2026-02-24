import type { PrismaClient } from "../../generated/prisma/index.js";

/**
 * Retrieves the symmetric encryption key from the environment.
 *
 * Throws at startup if the key is missing or too short — fail-fast is
 * intentional so misconfigured deployments surface immediately rather than
 * silently storing plaintext sensitive data.
 *
 * Generate a suitable key with:
 *   openssl rand -base64 32
 */
export function getEncryptionKey(): string {
  const key = process.env["MEMBER_ENCRYPTION_KEY"];
  if (!key || key.length < 32) {
    throw new Error(
      "Missing or too-short MEMBER_ENCRYPTION_KEY env var. " +
        "Must be at least 32 characters. " +
        "Generate one with: openssl rand -base64 32",
    );
  }
  return key;
}

/**
 * Encrypts a plaintext string using PostgreSQL's pgp_sym_encrypt (AES-256).
 *
 * Returns the ciphertext as a Uint8Array<ArrayBuffer> — the exact type Prisma 6
 * expects for `Bytes` fields. Each call produces different ciphertext for the
 * same input (pgcrypto uses a random session key prefix), which is why @unique
 * cannot be used on these columns — use findMemberByCpf() instead.
 *
 * Why Uint8Array and not Buffer?
 *   Prisma 6 types Bytes fields as Uint8Array<ArrayBuffer>. Node's Buffer is
 *   typed as Buffer<ArrayBufferLike>, where ArrayBufferLike includes
 *   SharedArrayBuffer. TypeScript rejects the assignment because
 *   SharedArrayBuffer is not assignable to ArrayBuffer. Wrapping in
 *   `new Uint8Array(buffer)` copies into a plain ArrayBuffer-backed view,
 *   which satisfies the stricter Prisma type without losing any data.
 *
 * @param prisma    - A Prisma client or transaction client with search_path set.
 * @param plaintext - The value to encrypt (CPF digits, phone digits, etc.)
 */
export async function encryptField(
  prisma: PrismaClient,
  plaintext: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const key = getEncryptionKey();
  const result = await prisma.$queryRaw<[{ encrypted: Buffer }]>`
    SELECT pgp_sym_encrypt(${plaintext}::text, ${key}::text) AS encrypted
  `;
  const row = result[0];
  if (!row) {
    throw new Error(
      "pgp_sym_encrypt returned no result — check pgcrypto extension",
    );
  }
  // Buffer<ArrayBufferLike> → Uint8Array<ArrayBuffer>: copy into a strict
  // ArrayBuffer so TypeScript accepts the value as a Prisma Bytes field.
  return new Uint8Array(row.encrypted);
}

/**
 * Decrypts a Uint8Array ciphertext using PostgreSQL's pgp_sym_decrypt.
 *
 * Accepts Uint8Array (the Prisma 6 Bytes type) so callers never need a cast
 * when passing a value read directly from a model field.
 *
 * @param prisma     - A Prisma client or transaction client with search_path set.
 * @param ciphertext - Uint8Array value read from a `cpf` or `phone` bytea column.
 */
export async function decryptField(
  prisma: PrismaClient,
  ciphertext: Uint8Array,
): Promise<string> {
  const key = getEncryptionKey();
  // Prisma passes Uint8Array as a bytea parameter correctly — no cast needed.
  const result = await prisma.$queryRaw<[{ decrypted: string }]>`
    SELECT pgp_sym_decrypt(${ciphertext}::bytea, ${key}::text) AS decrypted
  `;
  const row = result[0];
  if (!row) {
    throw new Error(
      "pgp_sym_decrypt returned no result — check pgcrypto extension",
    );
  }
  return row.decrypted;
}

/**
 * Looks up a member by their plaintext CPF using an in-database decrypt scan.
 *
 * Replaces the removed @unique constraint on Member.cpf. Because encrypted
 * bytea values cannot be compared for equality at the DB level without
 * decrypting, this does a full-table decrypt scan — acceptable for v1 club
 * sizes (hundreds of members). If performance degrades, add a HMAC index:
 *   hmac(cpf_plaintext, secret, 'sha256') stored alongside the ciphertext for
 *   fast exact-match lookups without exposing plaintext.
 *
 * @param prisma - A Prisma client or transaction client with search_path set.
 * @param cpf    - 11-digit plaintext CPF (no mask).
 * @returns      The matching member's id, or null if not found.
 */
export async function findMemberByCpf(
  prisma: PrismaClient,
  cpf: string,
): Promise<{ id: string } | null> {
  const key = getEncryptionKey();
  const result = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM members
    WHERE pgp_sym_decrypt(cpf::bytea, ${key}::text) = ${cpf}
    LIMIT 1
  `;
  return result[0] ?? null;
}
