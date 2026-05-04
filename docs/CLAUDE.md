<!-- docs/CLAUDE.md -->

# CLAUDE.md — ClubOS

> Paste this file + brief.md at the start of every session.
> Load ONE skill file per task domain — rule lives in rpi-prompt.md §0.

---

## Architecture

Monorepo: apps/api (Fastify 5 + Node 20 + TS strict) | apps/web (Next.js 16 App Router + React 19)
DB: PostgreSQL 16 via Prisma 6 · schema-per-tenant (clube\_{id}) · public = global registry
Cache: Redis 7 — BullMQ · rate limiting · session · SSE pub/sub
Auth: JWT 15min in-memory + httpOnly refresh cookie 7d single-use Redis
Queue: BullMQ · max concurrency 5 · WhatsApp 30 msg/min per club
Validation: Zod 4 shared via packages/shared-types
CSS: Tailwind 3.4 + shadcn/ui · tokens in tailwind.config.ts
State: TanStack Query 5 + Zustand · offline: Workbox 7 + Dexie.js 4
Deploy: Railway/Render · CI: lint → tsc → vitest → build

## Critical Dependency Map

ChargeService → GatewayRegistry → PaymentGateway interface → concrete gateways (Asaas/Pagarme/Stripe)
WebhookRoute → parseWebhook (HMAC) → Redis dedup → BullMQ → Worker → Payment row
AuthProvider → in-memory accessToken ↔ httpOnly refreshToken ↔ Redis
withTenantSchema(prisma, clubId) → every query outside public schema
sse-bus.ts → queryClient.invalidateQueries() in matching web module

## Hard Rules (merge-blocking)

**TypeScript:** `strict: true` · zero `any` · no `@ts-ignore` without comment

**Money:** Integer cents only — never float · display via `formatBRL(cents)` + `font-mono`

**Architecture:**

- Frontend never accesses DB · business logic in backend only
- `clubId` from JWT only — never from body or query params
- Concrete gateway imports only in `modules/payments/gateways/` — always via `GatewayRegistry`
- Webhook: HTTP 200 immediately → BullMQ · never synchronous
- BullMQ payloads: IDs only — no CPF, phone, name, any PII
- `TODO`/`FIXME` without ticket ref on main/develop → `// TODO: [T-xxx] — desc`
- No commented-out code · No JSDoc outside `shared-types/` or `PaymentGateway` interface

**Security:**

- `ACCESS_TOKEN` in-memory only · `REFRESH_TOKEN` httpOnly cookie only
- `BCRYPT_ROUNDS = 12`
- CPF/phone: `BYTEA` via `pgp_sym_encrypt` — uniqueness at application layer only
- Every `medical_records` read → insert `data_access_log` (actorId, athleteId, IP, timestamp)
- File uploads: magic bytes via `file-type` · filename = `randomUUID()`
- Webhook: HMAC-SHA256 + `timingSafeEqual` → timestamp ±5min → Redis SET NX dedup

**UI:**

- `formatBRL()` + `font-mono` on every monetary value
- `Intl.DateTimeFormat('pt-BR')` for all user-facing dates
- Every `<input>` → `<label htmlFor={id}>` · icon-only buttons → `aria-label`
- Status badges need text label · one primary button per context · danger requires confirmation modal

## Mandatory Patterns (signatures — full implementations in skill files)

```typescript
// Tenant query — EVERY handler outside public schema
const { clubId } = request.user;           // JWT only
await assertValidClubId(clubId);
await withTenantSchema(prisma, clubId, async (tx) => { ... });

// Resource ownership — EVERY single-resource handler
await assertMemberBelongsToClub(prisma, request.params.memberId, clubId);
// Return 404 — never 403 — when resource belongs to another tenant

// Webhook — mandatory step order
// 1. timestamp ±5min → 401
// 2. HMAC-SHA256 parseWebhook() + timingSafeEqual → 401
// 3. Redis SET NX dedup TTL 24h → 200 if duplicate
// 4. HTTP 200 immediately
// 5. BullMQ enqueue
// 6. Worker: check gateway_txid before creating Payment row

// Gateway — never import concrete class
const gateway = GatewayRegistry.forMethod('PIX');

// Bootstrap — must be first call
validateEnv();
```

## Never Touch

- `apps/api/src/migrations/` — Prisma-generated only
- `audit_log` rows — immutable, no UPDATE or DELETE
- `balance_sheets` rows — immutable after INSERT (hash + URL permanent)
- `packages/shared-types/` — changes require team discussion
- Any confirmed payment — cancel with recorded reason; never delete

## Naming Conventions

variables/functions: camelCase classes/types: PascalCase
constants: SCREAMING_SNAKE component files: PascalCase.tsx
service/util files: kebab-case.ts gateway files: kebab-case.gateway.ts
api routes: kebab-case plural webhook routes: POST /webhooks/:gateway
code language: English ui strings: Portuguese

## RBAC — v2.5 Active Roles: ADMIN > TREASURER > COACH > PHYSIO

| Endpoint                              | ADMIN | TREASURER | COACH       | PHYSIO |
| ------------------------------------- | ----- | --------- | ----------- | ------ |
| POST/PUT /api/members                 | ✅    | ✅        | 403         | 403    |
| DELETE /api/members/:id               | ✅    | 403       | 403         | 403    |
| POST /api/charges/generate            | ✅    | ✅        | 403         | 403    |
| GET /api/dashboard/\*                 | ✅    | ✅        | ✅          | 403    |
| GET\|POST /api/medical/\*             | ✅    | 403       | 403         | ✅     |
| GET /api/athletes/:id/rtp             | full  | 403       | status only | full   |
| GET /api/saf/\*                       | ✅    | ✅        | 403         | 403    |
| POST /api/saf/balance-sheets          | ✅    | 403       | 403         | 403    |
| GET /api/events/\*                    | ✅    | ✅        | 403         | 403    |
| GET /api/events/:id/report            | ✅    | ✅        | 403         | 403    |
| POST /api/events/:id/tickets/validate | ✅    | 403       | 403         | 403    |
| GET\|POST /api/events/:id/pos/\*      | ✅    | ✅        | 403         | 403    |

Every RBAC row MUST have a unit test verifying the exact HTTP status code.

## Financial PR Gate

Any PR touching `charges/`, `payments/`, `webhooks/`, `jobs/`: ≥ 2 approvals + ≥ 80% coverage on modified modules.

## Current Sprint — v2.5 "A Arquibancada" (S12–S15, Weeks 21–28)

| ID          | Title                                             | Status  | Sprint  |
| ----------- | ------------------------------------------------- | ------- | ------- |
| T-136       | Schema Prisma + DDL tenant v2.5                   | ✅ DONE | S12     |
| T-137       | CRUD de eventos                                   | ✅ DONE | S12     |
| T-138       | UI de configuração de evento                      | TODO    | S12     |
| T-139       | Geração de cobrança PIX por ingresso              | TODO    | S12     |
| T-140       | Worker `confirm-ticket` + QR Code SHA-256         | TODO    | S12     |
| T-141       | Página pública de compra de ingresso              | TODO    | S12     |
| T-142       | Cancelamento de ingresso com reembolso            | TODO    | S12     |
| T-143       | Backend de validação de ingresso (HMAC)           | TODO    | S13     |
| T-144–T-160 | Gate UI · Relatórios · CRM · PDV · Testes · Infra | TODO    | S13–S15 |

> Full task specs → `docs/backlog.md`
