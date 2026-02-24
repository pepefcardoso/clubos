-- Enable pgcrypto extension (idempotent).
-- Required for pgp_sym_encrypt / pgp_sym_decrypt used to encrypt CPF and phone
-- fields in the members table.
-- This runs in the public schema and is available to all tenant schemas on the
-- same PostgreSQL instance.
CREATE EXTENSION IF NOT EXISTS pgcrypto;