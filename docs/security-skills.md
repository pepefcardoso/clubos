# ClubOS v1.0 — Agent Skills: Security

> Machine-optimized. RFC-style. No prose justification.
> Architecture invariants (layer separation, payment abstraction, financial rules) live in
> `architecture-skills.md`. This file covers auth, authz, data protection, and transport only.

---

## SKILL: AUTH_INVARIANTS

### Token Storage & Lifetime

```yaml
ACCESS_TOKEN:
  ttl: 15min
  storage: in-memory (AuthProvider) ONLY
  MUST NOT store in: localStorage | sessionStorage | non-httpOnly cookie

REFRESH_TOKEN:
  ttl: 7 days
  storage: httpOnly cookie ONLY
  rotation: single-use — invalidate previous token in Redis on every use

SSE_TOKEN:
  transport: query param (?token=)
  MUST redact in logs via pino-redact
```

### Hashing & Password Policy

- `BCRYPT_ROUNDS = 12` — MUST NOT decrease.
- Password schema (Zod, `packages/shared-types/src/auth.schemas.ts`):
  - Minimum length: **12 chars**
  - MUST contain: uppercase + lowercase + digit + special character

### Brute-Force Protection — L-01 `[BLOCKER]`

```yaml
lock_target: email (NOT ip)
MAX_ATTEMPTS: 5
LOCKOUT_WINDOW_SECONDS: 900
backend: Redis
error_message_on_any_failure: "Credenciais inválidas." # no enumeration signal
```

- MUST execute in order: `checkLoginAttempts → bcrypt.compare → recordFailedAttempt`
- MUST use constant-time dummy hash when user is not found.

### Mandatory Audit Events — `audit_log`

```
LOGIN_SUCCESS | LOGIN_FAILED | LOGIN_LOCKED | LOGOUT
TOKEN_REFRESH | WEBHOOK_SIGNATURE_INVALID | UNAUTHORIZED_ACCESS | MEMBER_EXPORT
```

---

## SKILL: AUTHORIZATION_AND_RBAC

### Object-Level Authorization — L-04 `[BLOCKER]`

- Every handler receiving a resource ID MUST verify it belongs to the `clubId` in the JWT.
- Return **404** (not 403) when resource belongs to another tenant — never confirm cross-tenant existence.
- `clubId` MUST be read from JWT only. MUST NOT trust body or query params for ownership.

```typescript
// REQUIRED in every single-resource handler:
const { clubId } = request.user;
await assertMemberBelongsToClub(prisma, request.params.memberId, clubId);
// Equivalent assertors MUST exist for: charges, plans, payments, athletes, templates, messages
```

### RBAC Matrix

```yaml
"POST/PUT /api/members": { ADMIN: allow, TREASURER: allow }
"DELETE /api/members/:id": { ADMIN: allow, TREASURER: 403 }
"POST/PUT/DELETE /api/plans": { ADMIN: allow, TREASURER: 403 }
"POST /api/charges/generate": { ADMIN: allow, TREASURER: allow }
"GET /api/dashboard/*": { ADMIN: allow, TREASURER: allow }
"PUT/DELETE /api/templates/:key": { ADMIN: allow, TREASURER: 403 }
"POST /api/clubs/:id/logo": { ADMIN: allow, TREASURER: 403 }
"GET /api/messages": { ADMIN: allow, TREASURER: allow }
"GET /api/athletes": { ADMIN: allow, TREASURER: allow }
"POST /api/athletes": { ADMIN: allow, TREASURER: 403 }
"GET /api/members/:id/payments": { ADMIN: allow, TREASURER: allow }
```

> MUST have one unit test per row verifying the exact HTTP status code.

---

## SKILL: DATA_PROTECTION

### SSL — PostgreSQL — L-14 `[BLOCKER]`

```yaml
ALLOWED: verify-full (requires sslrootcert) | verify-ca
MUST NOT: require | prefer | allow | disable | (absent)
```

```
# Preferred:
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=verify-full&sslrootcert=/path/to/ca.pem"
# Accepted:
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=verify-ca"
```

Startup validator in `src/lib/env.ts` MUST reject process if `sslmode=verify-full` is set without `sslrootcert`.

### Redis — TLS & Auth — L-08 `[BLOCKER]`

```
REDIS_URL="rediss://:STRONG_PASSWORD@host:6380"
# rediss:// enforces TLS. redis:// MUST NOT be used in non-local environments.
```

- MUST configure `lazyConnect: true` on ioredis.
- MUST call `process.exit(1)` on auth failure at startup.

### Environment Variable Validation — L-09 `[BLOCKER]`

`validateEnv()` MUST be the **first line** of application bootstrap.

```yaml
required_env_vars:
  NODE_ENV: present
  DATABASE_URL: present
  REDIS_URL: present
  JWT_SECRET: min 32 chars
  JWT_REFRESH_SECRET: min 32 chars
  ASAAS_API_KEY: present
  ASAAS_WEBHOOK_SECRET: min 32 chars
  ENCRYPTION_KEY: min 32 chars
```

### CPF & Phone Encryption

- Stored as `BYTEA` using `pgcrypto` `pgp_sym_encrypt` / `pgp_sym_decrypt`.
- Uniqueness enforced at application layer via `findMemberByCpf` (no DB `UNIQUE` constraint — ciphertext differs per call).
- MUST support key rotation via `ENCRYPTION_KEY_V1`, `ENCRYPTION_KEY_V2`, … with `ENCRYPTION_KEY_VERSION` pointing to current. Decryption MUST attempt all versions.

---

## SKILL: API_SECURITY

### CORS — L-03 `[BLOCKER]`

```typescript
const ALLOWED_ORIGINS =
  process.env.NODE_ENV === "production"
    ? ["https://app.clubos.com.br", "https://clubos.com.br"]
    : ["http://localhost:3000"];

// MUST NOT use origin: '*' when httpOnly cookies are in use.
```

### Error Handling — L-12 `[BLOCKER]`

- 5xx responses in production MUST return: `"Ocorreu um erro inesperado. Nossa equipe foi notificada."`
- MUST NOT expose: `error.stack` | `error.cause` | query details | internal paths.

### Payload Size Limits — L-06

```yaml
logo_upload: max 2MB, 1 file per request
json_routes: max 512KB
csv_import: max 5MB (5,000 rows), override on specific route only
```

### Mass Assignment Prevention `[BLOCKER]`

```typescript
// MUST NOT:
await prisma.member.create({ data: request.body as any });

// MUST:
const parsed = CreateMemberSchema.parse(request.body);
await prisma.member.create({ data: parsed });
```

### CSV Injection — L-07

- **Exports:** MUST prefix with `'` any field starting with `=` | `+` | `-` | `@` | `\t` | `\r`.
- **Imports:** MUST reject with `ValidationError` any field starting with those characters.

---

## SKILL: WEBHOOK_SECURITY

### Processing Pipeline — All `/webhooks/:gateway` routes `[BLOCKER]`

```yaml
step_1: validate timestamp within ±5 min → reject replays
step_2: validate HMAC-SHA256 via parseWebhook() using timingSafeEqual → HTTP 401 if invalid
step_3: deduplication check in Redis (SET NX, TTL 24h) before enqueuing
step_4: respond HTTP 200 immediately → enqueue to BullMQ
step_5: check idempotency by gateway_txid in DB before creating Payment row
```

- Webhook routes MUST be excluded from JWT middleware (see `PUBLIC_ROUTES`).
- MUST NOT process webhook logic synchronously.

---

## SKILL: MULTI_TENANCY_ISOLATION

### Absolute Rules `[BLOCKER]`

- MUST use `withTenantSchema(prisma, clubId, ...)` for every query outside the `public` schema.
- MUST call `assertValidClubId(clubId)` (validates cuid2 format) before any schema name interpolation.
- MUST NOT execute queries without a tenant context.
- MUST NOT write JOINs between schemas of different clubs.
- MUST NOT return data from tenant A in a request authenticated as tenant B.

### Required CI Isolation Tests

```yaml
test_cross_tenant_access:
  action: access resource from Club A using Club B JWT
  expected: 404

test_cross_tenant_search:
  action: search with a term present only in another tenant
  expected: result contains only authenticated tenant's data
```

---

## SKILL: FILE_UPLOAD_POLICIES

### Magic Bytes Validation — L-05 `[BLOCKER]`

- MUST validate file content using the `file-type` library (magic bytes).
- MUST NOT trust the `Content-Type` header declared by the client.
- Allowed MIME types: `image/png` | `image/jpeg` | `image/webp` | `image/gif`

### Safe Filename Generation `[BLOCKER]`

```typescript
// MUST NOT use the original filename (path traversal risk).
const safeFilename = `${clubId}-${randomUUID()}.webp`;
// MUST verify final path starts within the expected uploads directory.
```

---

## SKILL: ASYNC_JOBS_SECURITY

### BullMQ Payload Rules `[BLOCKER]`

```yaml
job_payloads:
  MUST contain:     IDs only
  MUST NOT contain: CPF | phone | full name | any PII
  reason:           payloads are exposed in Redis logs

job_id_pattern: "generate-{clubId}-{YYYY-MM}" | "d3-{clubId}-{date}"
  reason: stable IDs guarantee deduplication on crash/restart

queue_prefix: "{clubos:production}" | "{clubos:staging}"
  reason: prevents queue collision across environments

idempotency: MUST — reprocessing the same job MUST NOT create duplicate charges or messages
```

---

## SKILL: INFRASTRUCTURE_AND_SECRETS

### Dependency Auditing

- `pnpm audit --audit-level=high` MUST run at workspace root in CI.
- MUST fail on HIGH or CRITICAL severity.
- Exceptions MUST be documented in `.audit-exceptions.json` + `pnpm.auditConfig.ignoreCves`, committed with written justification and ticket reference.

### Secret Generation & Rotation

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```yaml
rotation_schedule:
  JWT_SECRET: every 6 months
  JWT_REFRESH_SECRET: every 6 months
  ASAAS_WEBHOOK_SECRET: every 6 months
  on_suspected_compromise: immediate

env_isolation: MUST NOT share any secret across dev / staging / prod
  MUST NOT hardcode secrets in YAML, source code, or CI config files
```

### Required Security Headers (Production)

```yaml
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: present
Strict-Transport-Security: max-age=63072000
CSP: restrictive, configured in Next.js
MUST remove: X-Powered-By | Server
```

### Sentry — Safe Configuration

```yaml
tracesSampleRate: 0.1
beforeSend:
  MUST strip: refresh_token (cookies) | password (body) | cpf (body)
ignore_errors:
  - UnauthorizedError
  - ForbiddenError
  - NotFoundError
  - ValidationError
  - TooManyRequestsError
```
