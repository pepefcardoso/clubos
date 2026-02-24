/**
 * One-time data migration: encrypt existing plaintext CPF and phone values.
 *
 * Run this script BEFORE deploying the T-046 schema migration on any environment
 * that already has member rows with plaintext CPF/phone columns.
 *
 * Greenfield deployments (no existing member data) do NOT need this script.
 *
 * Usage:
 *   MEMBER_ENCRYPTION_KEY=<your-key> DATABASE_URL=<url> pnpm tsx scripts/migrate-encrypt-members.ts
 *
 * The script:
 *   1. Fetches all clubs from the public schema.
 *   2. For each club, sets search_path to that club's tenant schema.
 *   3. Reads members with plaintext (TEXT) cpf and phone.
 *   4. Re-writes them as pgcrypto bytea ciphertext in a single transaction.
 *
 * Safety:
 *   - Idempotent: rows that are already bytea are skipped.
 *   - Dry-run mode: set DRY_RUN=true to log what would be changed without writing.
 *   - Runs in a transaction per club — failure in one club does not affect others.
 */

import { PrismaClient } from "../apps/api/generated/prisma/index.js";
import { getEncryptionKey } from "../apps/api/src/lib/crypto.js";

const DRY_RUN = process.env["DRY_RUN"] === "true";

async function main() {
  const key = getEncryptionKey();
  const prisma = new PrismaClient({ log: ["warn", "error"] });

  console.log(
    DRY_RUN
      ? "[DRY RUN] No changes will be written."
      : "[LIVE] Writing changes.",
  );

  try {
    // Fetch all clubs from the public schema
    const clubs = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT id, name FROM clubs ORDER BY "createdAt" ASC
    `;

    console.log(`Found ${clubs.length} club(s) to process.`);

    for (const club of clubs) {
      const schemaName = `clube_${club.id}`;
      console.log(`\nProcessing club "${club.name}" (schema: ${schemaName})`);

      await prisma.$transaction(async (tx) => {
        // Set tenant search path
        await tx.$executeRawUnsafe(
          `SET search_path TO "${schemaName}", public`,
        );

        // Read members — we use text() cast to detect plaintext rows.
        // In a mixed state (some encrypted, some not), length-based heuristic:
        // pgcrypto output is always > 40 bytes. Plaintext CPF is 11 chars.
        const members = await tx.$queryRaw<
          Array<{ id: string; cpf: unknown; phone: unknown }>
        >`
          SELECT id, cpf, phone FROM members
        `;

        let encrypted = 0;
        let skipped = 0;

        for (const member of members) {
          // Detect if already encrypted: Buffer means bytea (already encrypted)
          // or very long content. String <= 20 chars = likely plaintext.
          const cpfIsPlaintext =
            typeof member.cpf === "string" && member.cpf.length <= 20;
          const phoneIsPlaintext =
            typeof member.phone === "string" && member.phone.length <= 20;

          if (!cpfIsPlaintext && !phoneIsPlaintext) {
            skipped++;
            continue;
          }

          if (DRY_RUN) {
            console.log(`  [DRY RUN] Would encrypt member ${member.id}`);
            encrypted++;
            continue;
          }

          // Encrypt and update
          await tx.$executeRaw`
            UPDATE members
            SET
              cpf   = pgp_sym_encrypt(${member.cpf as string}::text, ${key}::text),
              phone = pgp_sym_encrypt(${member.phone as string}::text, ${key}::text)
            WHERE id = ${member.id}
          `;
          encrypted++;
        }

        console.log(
          `  → Encrypted: ${encrypted}, Already encrypted (skipped): ${skipped}`,
        );
      });
    }

    console.log("\nMigration complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
