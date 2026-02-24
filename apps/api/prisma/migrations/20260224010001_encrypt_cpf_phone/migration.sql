-- Encrypt CPF and phone at rest using pgcrypto AES-256.
--
-- Changes:
--   1. Drop the unique index on members.cpf (cannot use DB-level uniqueness on
--      encrypted bytea — identical plaintexts produce different ciphertexts).
--      Uniqueness is now enforced at the application layer via findMemberByCpf().
--   2. Convert cpf and phone columns from TEXT to BYTEA so they can store
--      pgcrypto binary ciphertext.
--
-- IMPORTANT: This migration assumes the members table is empty OR that a
-- separate re-encryption script has already converted existing plaintext rows.
-- Running this migration against a table with existing plaintext TEXT data in
-- cpf/phone will fail — the ALTER COLUMN TYPE cast from text → bytea requires
-- an explicit USING clause and the rows must already be encrypted.
-- See scripts/migrate-encrypt-members.ts for the pre-migration data script.

-- Step 1: Drop the unique constraint and index on cpf
DROP INDEX IF EXISTS "members_cpf_key";
ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_cpf_key";

-- Step 2: Change column types to bytea
-- The USING clause handles an empty table or already-binary data.
-- For a table with existing plaintext rows, run the encryption script first.
ALTER TABLE "members"
  ALTER COLUMN "cpf"   TYPE BYTEA USING "cpf"::BYTEA,
  ALTER COLUMN "phone" TYPE BYTEA USING "phone"::BYTEA;