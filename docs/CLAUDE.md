# CLAUDE.md — ClubOS

> Paste this file in full at the start of every session, together with brief.md.
> Full specs live in docs/agent-instructions.md and docs/*-skills.md — load those per task domain only.

---

## Architecture

```
Monorepo: apps/api (Fastify 5 + Node 20 + TS strict) | apps/web (Next.js 16 App Router + React 19)
DB:       PostgreSQL 16 via Prisma 6 · schema-per-tenant (clube_{id}) · public schema = global registry
Cache:    Redis 7 — BullMQ queues · rate limiting · session · SSE pub/sub
Auth:     JWT (15min, in-memory) + httpOnly refresh cookie (7d, single-use Redis)
Queue:    BullMQ · max concurrency 5 for charge jobs · WhatsApp 30 msg/min per club
Validation: Zod 4 shared between api and web via packages/shared-types
CSS:      Tailwind 3.4 + shadcn/ui · design tokens in tailwind.config.ts
State:    TanStack Query 5 + Zustand · offline: Workbox 7 + Dexie.js 4
Deploy:   Railway/Render via git push · CI: lint → tsc → vitest → build
```

## Critical Dependency Map

```
ChargeService → GatewayRegistry → PaymentGateway interface → concrete gateways (Asaas/Pagarme/Stripe)
WebhookRoute  → parseWebhook (HMAC) → Redis dedup → BullMQ → Worker → Payment row
AuthProvider  → in-memory accessToken ↔ httpOnly refreshToken cookie ↔ Redis
withTenantSchema(prisma, clubId) → every query outside public schema
provisionTenantSchema → all tenant DDL migrations (idempotent)
sse-bus.ts → queryClient.invalidateQueries() in matching web module
```

## Code Standards

**TypeScript**
- `strict: true` · zero `any` · no `@ts-ignore` without comment explaining why
- All monetary values: **integer cents only** — never float · display via `formatBRL(cents)`

**Architecture**
- Frontend never accesses DB · business logic in backend only
- Concrete gateway imports only inside `modules/payments/gateways/` — always via `GatewayRegistry`
- `clubId` from JWT only — never from body or query params
- Webhook: HTTP 200 immediately → enqueue to BullMQ · never process synchronously
- BullMQ job payloads: IDs only — no CPF, phone, name, or any PII
- Comments: intent only (WHY, never WHAT) · no commented-out code · no JSDoc outside shared-types/

**Security**
- `ACCESS_TOKEN`: in-memory AuthProvider only — never localStorage/sessionStorage
- `REFRESH_TOKEN`: httpOnly cookie only
- `BCRYPT_ROUNDS = 12` — never lower
- CPF/phone: stored as `BYTEA` via `pgp_sym_encrypt` — uniqueness at application layer only
- Every `medical_records` read: insert into `data_access_log` (actorId, athleteId, IP, timestamp)
- File uploads: magic bytes via `file-type` — never trust Content-Type · filename = `randomUUID()`
- Webhook: HMAC-SHA256 + `timingSafeEqual` → timestamp ±5min check → Redis SET NX dedup
- CORS: explicit origins list only when httpOnly cookies are in use

**UI**
- `formatBRL(cents)` + `font-mono` on every monetary value — no exceptions
- `Intl.DateTimeFormat('pt-BR')` for all user-facing dates — never ISO or EN format
- Every `<input>` needs `<label htmlFor={id}>` · icon-only buttons need `aria-label`
- Status badges need text label in addition to color
- One primary button per visual context · danger buttons require confirmation modal

## Never Touch

- `apps/api/src/migrations/` — Prisma-generated only
- `audit_log` rows — immutable, no UPDATE or DELETE ever
- `balance_sheets` rows — immutable after INSERT (hash + URL permanent)
- `packages/shared-types/` — changes require team discussion
- Any confirmed payment — cancel with recorded reason; never delete

## Patterns to Follow

**Tenant query (mandatory on every handler outside public schema)**
```typescript
const { clubId } = request.user;           // JWT only
await assertValidClubId(clubId);           // validates cuid2 format
await withTenantSchema(prisma, clubId, async (tx) => { /* queries */ });
```

**Resource ownership (mandatory on every single-resource handler)**
```typescript
await assertMemberBelongsToClub(prisma, request.params.memberId, clubId);
// Return 404 — never 403 — when resource belongs to another tenant
```

**Webhook pipeline (mandatory order)**
```typescript
// 1. timestamp ±5min → 401 if stale
// 2. HMAC-SHA256 via parseWebhook() + timingSafeEqual → 401 if invalid
// 3. Redis SET NX dedup TTL 24h → 200 if duplicate (idempotent)
// 4. HTTP 200 immediately
// 5. Enqueue to BullMQ
// 6. Worker: check gateway_txid in DB before creating Payment row
```

**Monetary display**
```typescript
const formatBRL = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
// Pair with className="font-mono" · negative values add text-danger
```

**Gateway resolution**
```typescript
const gateway = GatewayRegistry.forMethod('PIX');  // never import AsaasGateway directly
```

**Environment bootstrap**
```typescript
validateEnv(); // MUST be the first call in application bootstrap
```

## Skill File Loading (load ONE per task domain)

| Task domain | Load |
|---|---|
| UI / component / styling | `docs/ui-ux-skills.md` |
| Auth / RBAC / crypto / webhooks | `docs/security-skills.md` |
| DB schema / API / layers / payments | `docs/architecture-skills.md` |
| Two domains | Load both; justify inline |
| Three+ domains | `docs/architecture-skills.md` + most specific |

## RBAC — Active Roles (v2.0)

`ADMIN > TREASURER > COACH > PHYSIO` · `SCOUT` exists in schema (activates v3.0)

| Endpoint | ADMIN | TREASURER | COACH | PHYSIO |
|---|---|---|---|---|
| POST/PUT /api/members | ✅ | ✅ | 403 | 403 |
| DELETE /api/members/:id | ✅ | 403 | 403 | 403 |
| POST /api/charges/generate | ✅ | ✅ | 403 | 403 |
| GET /api/dashboard/* | ✅ | ✅ | ✅ | 403 |
| GET/POST /api/medical/* | ✅ | 403 | 403 | ✅ |
| GET /api/athletes/:id/rtp | full | 403 | status only | full |
| GET /api/saf/* | ✅ | ✅ | 403 | 403 |
| POST /api/saf/balance-sheets | ✅ | 403 | 403 | 403 |

Every RBAC row MUST have a unit test verifying the exact HTTP status code.

## Current Work State — v2.5 "A Arquibancada" (Sprints 12–15)

v1.0, v1.5, v2.0: 100% ✅

| Sprint | Focus | Tasks | Status |
|---|---|---|---|
| S12 (Weeks 21–22) | Events infra + PIX ticket sales | T-136 → T-143, T-155, T-156 | 🟡 In progress |
| S13 (Weeks 23–24) | Gate validation + CRM + Sponsorship | T-144 → T-148 | ⬜ Pending |
| S14 (Weeks 25–26) | Game ops + mPOS | T-149 → T-154 | ⬜ Pending |
| S15 (Weeks 27–28) | E2E tests + hardening | T-157 → T-160 | ⬜ Pending |

v3.0 "A Vitrine" (ScoutLink): DO NOT implement — scope locked until v2.5 go/no-go.
v3.5 "A Liga" (CampeonatOS): DO NOT implement.

## Naming Conventions

```yaml
variables / functions: camelCase
classes / types / interfaces: PascalCase
constants: SCREAMING_SNAKE
component files: PascalCase.tsx
service / util files: kebab-case.ts
gateway files: kebab-case.gateway.ts
env vars: SCREAMING_SNAKE
api routes: kebab-case plural  (GET /api/members)
webhook routes: parametric     (POST /webhooks/:gateway)
code language: English (all vars, functions, comments, commits)
ui strings: Portuguese (all user-facing text, error messages, WhatsApp templates)
```

## Financial PR Gate

Any PR touching `charges/`, `payments/`, `webhooks/`, or `jobs/` requires:
- ≥ 2 approvals
- ≥ 80% test coverage on modified modules (enforced in CI via Vitest threshold)
