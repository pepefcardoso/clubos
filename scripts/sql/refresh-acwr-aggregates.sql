-- scripts/sql/refresh-acwr-aggregates.sql
--
-- Standalone ops/DBA script for manually triggering an ACWR view refresh.
--
-- Usage:
--   psql "$DATABASE_URL" \
--     -v clube_id=<club_cuid2_here> \
--     -f scripts/sql/refresh-acwr-aggregates.sql
--
-- Example:
--   psql "$DATABASE_URL" \
--     -v clube_id=abc123def456ghi789jk \
--     -f scripts/sql/refresh-acwr-aggregates.sql
--
-- Requirements:
--   - pgcrypto extension must be present in the public schema.
--   - The unique index acwr_aggregates_athlete_date_key must exist on the view
--   - Run as a database user with USAGE on the target schema and SELECT
--     privilege on acwr_aggregates.
--
-- Notes on CONCURRENTLY:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY cannot run inside a transaction
--   block (including DO $$ ... $$ blocks). This script handles the first-run
--   case automatically inside a DO block. For subsequent runs, it prints the
--   exact statement the operator must run manually outside a transaction.
--   The application service (acwr-refresh.service.ts) handles both cases
--   programmatically by calling $executeRawUnsafe on the root Prisma client.

\set schema_name 'clube_' :clube_id

\echo ''
\echo '── ACWR Aggregate Refresh ────────────────────────────────────────────'
\echo 'Schema:' :"schema_name"
\echo ''

SET search_path TO :"schema_name", public;

DO $$
DECLARE
  v_row_count bigint;
  v_schema    text := current_schema();
BEGIN
  SELECT COUNT(*) INTO v_row_count FROM acwr_aggregates LIMIT 1;

  IF v_row_count > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE 'View contains % row(s) — CONCURRENTLY is required.', v_row_count;
    RAISE NOTICE 'Reads will NOT be blocked. Run this statement outside a transaction:';
    RAISE NOTICE '';
    RAISE NOTICE '  REFRESH MATERIALIZED VIEW CONCURRENTLY "%" . "acwr_aggregates";', v_schema;
    RAISE NOTICE '';
    RAISE NOTICE 'Or use psql directly:';
    RAISE NOTICE '  psql "$DATABASE_URL" -c ''SET search_path TO "%" , public; REFRESH MATERIALIZED VIEW CONCURRENTLY "acwr_aggregates";''', v_schema;
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE 'View is empty (first run) — running full (locking) refresh.';
    RAISE NOTICE 'This will briefly block reads on acwr_aggregates.';
    REFRESH MATERIALIZED VIEW acwr_aggregates;
    RAISE NOTICE 'First-run refresh complete.';
    RAISE NOTICE '';
    RAISE NOTICE 'Future refreshes will use CONCURRENTLY (reads unblocked).';
    RAISE NOTICE 'Schedule the BullMQ job to run every 4 hours.';
  END IF;
END $$;

\echo ''
\echo '── Done ──────────────────────────────────────────────────────────────'
\echo ''