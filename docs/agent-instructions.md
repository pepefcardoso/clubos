# AGENT_INSTRUCTIONS.md — ClubOS

<!-- Single source of truth for AI coding agents. Do not split this file. -->
<!-- Generated from: architecture-skills.md, security-skills.md, ui-ux-skills.md, design-docs.md -->
<!-- Active version: v2.0 "O Vestiário" | Weeks 15–20 -->

---

## 0. STACK SNAPSHOT

```yaml
runtime:       Node 20 LTS
framework_api: Fastify 5.x + TypeScript 5.x strict
framework_web: Next.js 16.x App Router + React 19 + TypeScript 5.x strict
orm:           Prisma 6.x (schema-per-tenant via search_path)
db_primary:    PostgreSQL 16 (Supabase managed)
db_cache:      Redis 7 (BullMQ queues + rate limiting + session)
queue:         BullMQ (max concurrency: 5 for charge jobs)
validation:    Zod 4.x (shared between web and api via packages/shared-types)
css:           Tailwind CSS 3.4.x + shadcn/ui
state_client:  TanStack Query 5.x + Zustand
offline:       Workbox 7.x + Dexie.js 4.x (IndexedDB)
testing:       Vitest (unit/integration) + Playwright (E2E)
ci:            GitHub Actions (lint → typecheck → test → build)
monitoring:    Sentry + Logtail
deploy:        Railway / Render (PaaS) via git push
```

---

## 1. MONOREPO STRUCTURE

```
clubos/
├── apps/
│   ├── api/src/
│   │   ├── modules/          # Feature modules (auth, members, charges, payments…)
│   │   │   ├── payments/gateways/   # ONLY place for concrete gateway imports
│   │   ├── jobs/             # BullMQ workers
│   │   ├── plugins/          # Fastify plugins (auth, sensible, security-headers)
│   │   └── lib/              # prisma, redis, crypto, tokens, env
│   └── web/src/app/
│       ├── (marketing)/      # Public pages — NO auth/app imports allowed
│       ├── (app)/            # Authenticated panel — auth guard + AppShell
│       ├── (auth)/
│       └── (onboarding)/
├── packages/
│   ├── shared-types/         # JSDoc ALLOWED here ONLY
│   ├── ui/                   # Shared components
│   └── config/               # tsconfig, eslint, prettier bases
```

### File-Path Coupling Rules

| When editing…                             | You MUST also check…                                                |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `modules/charges/**`                      | `modules/payments/`, `jobs/charge-generation/`, `modules/webhooks/` |
| `modules/payments/gateways/**`            | `GatewayRegistry` index, `PaymentGateway` interface, webhook worker |
| `modules/webhooks/**`                     | BullMQ worker idempotency, `gateway_txid` dedup, HMAC validation    |
| Any BullMQ job payload                    | Confirm payload contains IDs ONLY — no PII                          |
| `lib/env.ts`                              | `.env.example`, Zod schema, `validateEnv()` call at bootstrap       |
| `provisionTenantSchema`                   | All tenant DDL migrations; ensure idempotency                       |
| `modules/medical/**` or `return_to_play`  | Role guards (`requireRole('PHYSIO','ADMIN')`), `data_access_log`    |
| `modules/saf/**` or `balance_sheets`      | SHA-256 hash generation, immutability constraint, `audit_log`       |
| Any route handler receiving a resource ID | `assertXxxBelongsToClub(prisma, id, clubId)` call                   |
| SSE events (`sse-bus.ts`)                 | React Query invalidation keys in the corresponding web module       |
| `packages/shared-types/`                  | JSDoc is allowed here; forbidden everywhere else                    |

---

## 2. ABSOLUTE BLOCKERS

> Any code violating a rule below MUST NOT be generated, committed, or approved.
> 🔴 = merge-blocking | ⚫ = security incident risk

### 2.1 TypeScript

```
🔴 explicit `any` anywhere                          → correct type or `unknown` + type guard
🔴 @ts-ignore without explanatory comment           → fix type or document reason inline
🔴 float for any monetary value                     → integer cents ONLY; display via formatBRL()
```

### 2.2 Architecture

```
🔴 Frontend accessing DB directly                   → all reads/writes through API
🔴 Business logic in frontend                       → backend only
🔴 Concrete gateway import outside modules/payments/gateways/
                                                    → GatewayRegistry.get() or .forMethod()
🔴 Provider-specific field in DB schema             → gatewayMeta (JSONB) on Charge entity
🔴 Synchronous webhook processing                   → HTTP 200 immediately; enqueue to BullMQ
🔴 TODO/FIXME without ticket ref on main/develop    → // TODO: [TICKET-ID] — description
🔴 Commented-out dead code                          → delete; use git log for history
🔴 JSDoc outside shared-types/ or PaymentGateway    → remove; rely on types and naming
🔴 (marketing) route importing from (app)           → shared components go in packages/ui/
```

### 2.3 Security — Authentication

```
⚫ ACCESS_TOKEN in localStorage or sessionStorage   → in-memory AuthProvider ONLY
⚫ REFRESH_TOKEN outside httpOnly cookie            → httpOnly cookie ONLY
⚫ Sharing JWT_SECRET across environments           → unique secret per env
⚫ BCRYPT_ROUNDS below 12                           → MUST be exactly 12
⚫ Returning user-not-found vs wrong-password signal→ always "Credenciais inválidas."
⚫ Skipping constant-time dummy hash on 404 user    → always bcrypt.compare even if user absent
```

### 2.4 Security — Multi-Tenancy

```
⚫ Query executed without withTenantSchema()        → every query outside public schema MUST set search_path
⚫ clubId read from body or query params            → MUST read from JWT only
⚫ Cross-schema JOIN between different club schemas → strictly FORBIDDEN
⚫ Returning tenant A data on tenant B JWT          → return 404, never confirm cross-tenant existence
⚫ Schema interpolation without assertValidClubId() → validate cuid2 format first
```

### 2.5 Security — API & Data

```
⚫ origin: '*' with httpOnly cookies in use         → explicit origins list only
⚫ error.stack / error.cause in 5xx response        → "Ocorreu um erro inesperado. Nossa equipe foi notificada."
⚫ request.body passed directly to Prisma           → Schema.parse(request.body) ALWAYS
⚫ Original upload filename used in filesystem path → randomUUID() + validated extension
⚫ Content-Type header trusted for file validation  → magic bytes via file-type library
⚫ PII (CPF, phone, name) in BullMQ job payload    → IDs only; fetch PII inside the worker
⚫ CPF, phone, tokens logged in plaintext           → pino-redact with sensitive fields
⚫ sslmode=require in DATABASE_URL                  → sslmode=verify-full&sslrootcert=<path>
⚫ rediss:// absent in non-local REDIS_URL          → rediss:// enforces TLS; redis:// forbidden in prod
⚫ HIGH/CRITICAL open in pnpm audit                 → fix or document exception with ticket ref
```

### 2.6 Security — Webhooks

```
⚫ Webhook processed without HMAC-SHA256 validation → parseWebhook() + timingSafeEqual FIRST
⚫ Missing timestamp replay check on webhook        → reject if timestamp outside ±5 min
⚫ Webhook dedup skipped                            → Redis SET NX TTL 24h before enqueue
⚫ Webhook routes behind JWT middleware             → MUST be in PUBLIC_ROUTES
```

### 2.7 Financial Integrity

```
🔴 Confirmed payment deleted                        → cancel with recorded reason only
🔴 audit_log entry deleted or updated              → IMMUTABLE; MUST NOT be touched
🔴 balance_sheets row updated or deleted           → IMMUTABLE; hash + URL are permanent
🔴 PR on charges/payments/webhooks/jobs < 2 approvals → requires ≥ 2 approvals
🔴 Test coverage < 80% on financial modules        → enforced in CI via Vitest threshold
```

### 2.8 Medical Data (v2.0)

```
⚫ medical_records read without audit entry         → every read MUST insert into data_access_log
⚫ clinicalNotes/diagnosis exposed to COACH/TREASURER → project only RTP status enum
⚫ medical_records accessed outside requireRole('PHYSIO','ADMIN') → 403 hard stop
```

### 2.9 UI / Frontend

```
🔴 Monetary value rendered without formatBRL()     → Intl.NumberFormat pt-BR always
🔴 Monetary value rendered without font-mono       → font-mono on all monetary displays
🔴 Float cents displayed in UI                     → divide by 100 THEN formatBRL()
🔴 More than 1 primary button per visual context   → one primary CTA per page/modal
🔴 Danger button without confirmation modal        → destructive action requires modal
🔴 <input> without matching <label htmlFor={id}>   → A11Y_BLOCKER
🔴 Icon-only button without aria-label             → A11Y_BLOCKER
🔴 Status badge without text label (color only)    → A11Y_BLOCKER
🔴 Table with empty data and no empty state        → always implement empty state
🔴 Arbitrary spacing not on Tailwind 4px scale     → never p-[18px], gap-[7px], etc.
🔴 ISO/EN date format in user-facing UI            → Intl.DateTimeFormat pt-BR always
🔴 Hardcoded HEX not in design token palette       → use token classes only
```

---

## 3. MANDATORY PATTERNS

### 3.1 Environment Bootstrap

```typescript
// lib/env.ts — MUST be first call in application bootstrap
validateEnv(); // Zod schema validates: NODE_ENV, DATABASE_URL, REDIS_URL,
// JWT_SECRET (≥32), JWT_REFRESH_SECRET (≥32), ASAAS_API_KEY,
// ASAAS_WEBHOOK_SECRET (≥32), ENCRYPTION_KEY (≥32)
```

### 3.2 Tenant Query Pattern

```typescript
// EVERY handler outside public schema:
const { clubId } = request.user; // from JWT ONLY
await assertValidClubId(clubId); // validates cuid2 format
await withTenantSchema(prisma, clubId, async (tx) => {
  /* queries here */
});
```

### 3.3 Resource Ownership Check

```typescript
// EVERY single-resource handler:
await assertMemberBelongsToClub(prisma, request.params.memberId, clubId);
// Equivalents required for: charges, plans, payments, athletes, templates, messages
// Return 404 (NOT 403) when resource belongs to another tenant
```

### 3.4 Webhook Processing

```typescript
// Step order is MANDATORY:
// 1. Validate timestamp ±5min → 401 if stale
// 2. HMAC-SHA256 via parseWebhook() + timingSafeEqual → 401 if invalid
// 3. Redis SET NX dedup (TTL 24h) → 200 if duplicate (idempotent)
// 4. Respond HTTP 200 immediately
// 5. Enqueue to BullMQ
// 6. Worker: check gateway_txid in DB before creating Payment row
```

### 3.5 Monetary Display

```typescript
const formatBRL = (cents: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
// Input: 149000 → Output: "R$ 1.490,00"
// ALWAYS pair with className="font-mono"
// Negative values (refunds): add text-danger class
```

### 3.6 Date Display

```typescript
// Tables/cards:
new Intl.DateTimeFormat("pt-BR").format(date); // → "15/03/2025"
// Logs/audit:
new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(date); // → "15/03/2025 às 14:32"
```

### 3.7 BullMQ Job Payload Contract

```typescript
// ALLOWED: IDs only
{
  clubId: string;
  memberId: string;
  chargeId: string;
}
// FORBIDDEN: CPF, phone, fullName, email, any PII
// Job ID pattern: "generate-{clubId}-{YYYY-MM}" | "d3-{clubId}-{date}"
// Queue prefix: "{clubos:production}" | "{clubos:staging}"
```

### 3.8 Gateway Resolution

```typescript
// ALWAYS via registry — never import concrete gateway directly:
const gateway = GatewayRegistry.forMethod("PIX");
const gateway = GatewayRegistry.get(params.gateway);
// New gateway MUST: implement full PaymentGateway interface + parseWebhook + register in gateways/index.ts
```

### 3.9 CPF/Phone Encryption

```typescript
// Store: pgp_sym_encrypt(value, ENCRYPTION_KEY) as BYTEA
// Read:  pgp_sym_decrypt(column, ENCRYPTION_KEY)
// Uniqueness: application-layer via findMemberByCpf() — NO DB UNIQUE constraint
// Key rotation: ENCRYPTION_KEY_V1…Vn; ENCRYPTION_KEY_VERSION points to current
```

---

## 4. NAMING CONVENTIONS

```yaml
variables_functions: camelCase # generateCharge, memberStatus
classes_types: PascalCase # ChargeService, PaymentGateway
interfaces: PascalCase # CreateChargeInput
constants: SCREAMING_SNAKE # MAX_RETRY_ATTEMPTS
component_files: PascalCase # MemberCard.tsx
service_util_files: kebab-case # charge-service.ts
gateway_files: kebab-case+suffix # asaas.gateway.ts
env_vars: SCREAMING_SNAKE # DATABASE_URL
api_routes: kebab-case plural # GET /api/members
webhook_routes: parametric # POST /webhooks/:gateway
code_language: English # all vars, functions, comments, commits
ui_strings: Portuguese # all user-facing text, error messages, WhatsApp templates
```

---

## 5. GIT & CI RULES

```yaml
branches:
  main:              Protected. PR + ≥1 approval. Auto-deploy prod.
  develop:           Base for features. Auto-deploy staging.
  feature/TICKET-*:  Always branch from develop.
  fix/TICKET-*:      From develop (hotfix: from main).

commit_format: "<type>(<scope>): <description>"
  types: feat | fix | docs | style | refactor | test | chore

ci_pipeline:          lint (zero warnings) → tsc --noEmit → vitest run → build
financial_gate:       PR annotated if touching charges/, payments/, webhooks/, jobs/
coverage_threshold:   ≥80% on financial modules (charges, payments, webhooks, jobs)
approvals_required:   ≥2 on any PR touching financial modules
```

---

## 6. RBAC MATRIX (Current — v2.0)

```yaml
# Active roles: ADMIN | TREASURER | COACH | PHYSIO
# Pending (v3.0): SCOUT — schema exists, guards not yet active

endpoints:
  "POST/PUT /api/members":
    { ADMIN: allow, TREASURER: allow, COACH: 403, PHYSIO: 403 }
  "DELETE /api/members/:id":
    { ADMIN: allow, TREASURER: 403, COACH: 403, PHYSIO: 403 }
  "POST/PUT/DELETE /api/plans":
    { ADMIN: allow, TREASURER: 403, COACH: 403, PHYSIO: 403 }
  "POST /api/charges/generate":
    { ADMIN: allow, TREASURER: allow, COACH: 403, PHYSIO: 403 }
  "GET /api/dashboard/*":
    { ADMIN: allow, TREASURER: allow, COACH: allow, PHYSIO: 403 }
  "GET /api/athletes":
    { ADMIN: allow, TREASURER: allow, COACH: allow, PHYSIO: allow }
  "POST /api/athletes":
    { ADMIN: allow, TREASURER: 403, COACH: 403, PHYSIO: 403 }
  "GET /api/athletes/:id/rtp":
    { ADMIN: full, TREASURER: 403, COACH: status_only, PHYSIO: full }
  "POST /api/athletes/:id/rtp":
    { ADMIN: allow, TREASURER: 403, COACH: 403, PHYSIO: allow }
  "GET|POST /api/medical/*":
    { ADMIN: allow, TREASURER: 403, COACH: 403, PHYSIO: allow }
  "GET /api/saf/*": { ADMIN: allow, TREASURER: allow, COACH: 403, PHYSIO: 403 }
  "POST /api/saf/balance-sheets":
    { ADMIN: allow, TREASURER: 403, COACH: 403, PHYSIO: 403 }
  "GET /api/training/*":
    { ADMIN: allow, TREASURER: 403, COACH: allow, PHYSIO: 403 }
  "GET /api/workload/*":
    { ADMIN: allow, TREASURER: 403, COACH: allow, PHYSIO: allow }

invariants:
  - Every RBAC row MUST have a unit test verifying exact HTTP status code
  - data_access_log entry on EVERY medical_records read (actorId, athleteId, timestamp, IP)
  - COACH receives only { status } on GET /api/athletes/:id/rtp — never clinicalNotes
```

---

## 7. ASYNC JOBS POLICY

```yaml
idempotency: REQUIRED — reprocessing MUST NOT produce duplicate charges or messages
concurrency: MAX 5 for charge jobs
whatsapp_rate: 30 msg/min per club via Redis sliding window
retry_backoff: 1h → 6h → 24h (exponential)
after_3_fails: status = PENDING_RETRY + dashboard alert
wa_fallback: after 2 failed WhatsApp attempts → email via Resend
silent_failure: FORBIDDEN — every caught exception MUST log to Sentry

job_id_patterns:
  charge: "generate-{clubId}-{YYYY-MM}"
  reminder: "d3-{clubId}-{date}"
  dedup_key: Redis SET NX TTL 24h
```

---

## 8. API DESIGN CONTRACT

```yaml
format: REST, kebab-case plural resources
error_shape: { statusCode: number, error: string, message: string }
pagination: page + limit query params on all list endpoints
validation: Zod on ALL route bodies and query params
versioning: path prefix /api/v2/... NOT headers
ssl_mode: sslmode=verify-full (preferred) or sslmode=verify-ca
rate_limit: 100 req/min per IP via @fastify/rate-limit + Redis

payload_limits:
  json: 512KB
  logo: 2MB, image/png|jpeg|webp|gif (magic bytes, not Content-Type)
  csv: 5MB (5000 rows)

security_headers_prod:
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=63072000
  X-Powered-By: REMOVE
  Server: REMOVE
```

---

## 9. DATABASE SCHEMA OVERVIEW

### Tenant Schema: `clube_{id}`

```
Financial (v1.0 ✅):    members, plans, member_plans, charges, payments, expenses, audit_log
Communication (v1.0 ✅): messages, message_templates
Sports (v1.0–v1.5 ✅):  athletes, contracts, training_sessions, attendance_logs, workload_metrics
Financial Ext (v1.5 ✅): bank_reconciliations, consent_records
Medical (v2.0 🟡):      medical_records*, injury_protocols, return_to_play, data_access_log*
Compliance (v2.0 🟡):   balance_sheets*, creditor_disclosures
Operations (v2.0 🟡):   field_access_logs
# * = AES-256 encrypted fields or immutable table
```

### Public Schema (cross-tenant)

```
clubs, users (global registry only)
```

### Key Invariants

```yaml
monetary:        integer cents ONLY — never float
payments:        IMMUTABLE — no DELETE, reversal = new CANCELLED record with reason
audit_log:       IMMUTABLE — no UPDATE or DELETE permitted
balance_sheets:  IMMUTABLE — hash + URL permanent after INSERT
medical_records: AES-256 on clinicalNotes, diagnosis, treatmentDetails
                 plaintext: status, structure, grade, mechanism (needed for ACWR query)
cpf_phone:       BYTEA pgp_sym_encrypt — uniqueness at application layer only
```

---

## 10. CURRENT WORK STATE

### v2.0 "O Vestiário" — IN PROGRESS (Weeks 15–20)

**All v1.0 and v1.5 items: 100% ✅**

| ID  | Feature                                                 | API | Web |
| --- | ------------------------------------------------------- | --- | --- |
| M15 | PHYSIO role (RBAC + guards + JWT)                       | ⬜  | ⬜  |
| M16 | medical_records schema + CRUD (AES-256)                 | ⬜  | ⬜  |
| M17 | RTP status per athlete with role isolation              | ⬜  | ⬜  |
| M18 | Injury protocol library (20 FIFA Medical protocols)     | ⬜  | ⬜  |
| M19 | Workload × injury correlation (ACWR + medical_records)  | ⬜  | ⬜  |
| M20 | data_access_log for medical reads (LGPD)                | ⬜  | —   |
| M21 | SAF dashboard with shareholder KPIs                     | ⬜  | ⬜  |
| M22 | Creditor disclosures (CRUD + SHA-256 PDF)               | ⬜  | ⬜  |
| M23 | Integrated revenue statement (members+charges+expenses) | ⬜  | ⬜  |
| M24 | Balance sheet publication (SHA-256 + public URL)        | ⬜  | ⬜  |
| M25 | Tenant DDL provisioning v2.0 (idempotent)               | ⬜  | —   |

**Estimated effort remaining: ~10.5 dev-days**

**Go/No-Go criteria:**

- Injury recurrence reduction documented in ≥ 3 clubs
- Physiotherapist uses system for ≥ 4 consecutive weeks
- ≥ 1 club gets insurance reimbursement using platform report
- ≥ 3 SAFs in compliance with Lei 14.193/2021 via dashboard

### Next versions (DO NOT implement — scope locked)

```
v2.5 "A Arquibancada": ArenaPass (Weeks 21–28) — T-136 to T-160
v3.0 "A Vitrine":      ScoutLink  (Weeks 29–40) — T-161 to T-184
```

---

## 11. UI DESIGN TOKENS (Critical Subset)

```typescript
// Colors — extend tailwind.config.ts exactly:
primary:  { 500: '#2d7d2d', 600: '#236023' }  // main brand green
accent:   { 300: '#f0b429' }                   // warning/accent gold
danger:   '#c0392b'
success:  '#2d7d2d'  // same as primary-500
neutral:  { 200: '#e8e6e0', 500: '#78746a', 700: '#3d3a33' }

// Typography:
font-sans: Inter           // all UI text (default — do not declare explicitly)
font-mono: JetBrains Mono  // monetary values, CPF, technical IDs

// Spacing: Tailwind 4px scale only. No arbitrary values.
// Cards: p-6 | Page desktop: px-6 py-8 | Page mobile: px-4 py-6
// Max width: max-w-7xl mx-auto

// Shadows — elevation only, never decorative:
// modal: shadow-lg | dropdown: shadow-md | card: shadow-sm
```

---

## 12. SSE EVENT CATALOG

```typescript
// apps/api/src/modules/events/ — sse-bus.ts
// v1.0: PAYMENT_CONFIRMED
// v2.0 adds: RTP_STATUS_CHANGED | BALANCE_PUBLISHED
// Invalidation: queryClient.invalidateQueries(QUERY_KEY) in web counterpart

// Scaling note: when > 1 process, replace EventEmitter with redis.publish/subscribe
// Interface in sse-bus.ts remains identical — only transport changes
```

---

## 13. OFFLINE-FIRST RULES (PWA)

```yaml
storage:  Dexie.js (IndexedDB) for: attendance_logs, workload_metrics, field_access_logs
sync:     Background Sync API → POST /api/... on reconnect, retry 3x exponential
conflict: timestamp + last-write-wins
dedup:    ticket/attendance IDs prevent duplicate sync submissions
tables_with_offline: training presence, RPE, QR gate validation (v2.0), game checklist (v2.5)
```

---

## 14. COMMENT POLICY

```yaml
FORBIDDEN (merge-blocking):
  - commented-out executable code
  - redundant comments restating the type system
  - inline changelog (date+author+change)
  - section dividers (// ===, // ---)
  - TODO/FIXME without ticket ref on main/develop

ALLOWED:
  - intent comments (WHY, never WHAT)
  - warnings for billable/irreversible ops
  - third-party quirks with reference URL
  - JSDoc: ONLY in packages/shared-types/ and PaymentGateway interface
```
