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

## Current Sprint — v3.0 "A Vitrine" (S16–S21, Weeks 29–40)

| ID    | Title                                                           | Status | Sprint |
| ----- | --------------------------------------------------------------- | ------ | ------ |
| T-161 | Schema `public` cross-tenant (ScoutLink tables)                 | TODO   | S16    |
| T-162 | Auth e onboarding de scout (role `SCOUT` + JWT)                 | TODO   | S16    |
| T-163 | Guard de pré-requisito de dados longitudinais                   | TODO   | S16    |
| T-174 | Log imutável de comunicação (`communication_log`)               | TODO   | S16    |
| T-164 | API de showcase de atleta verificado (ACWR + SHA-256)           | TODO   | S17    |
| T-165 | UI de gestão de showcase (`ShowcaseManagerPage`)                | TODO   | S17    |
| T-181 | Rotas SSE v3.0 (`SHOWCASE_UPDATED`, `CONTACT_REQUEST_RECEIVED`) | TODO   | S17    |
| T-166 | Backend de upload de vídeos (Cloudflare R2 + magic bytes)       | TODO   | S18    |
| T-167 | UI de gestão de vídeos (`AthleteVideoManager`)                  | TODO   | S18    |
| T-168 | API de busca filtrada de atletas (freemium enforced)            | TODO   | S18    |
| T-169 | UI de busca ScoutLink (`ScoutSearchPage`)                       | TODO   | S18    |
| T-170 | Perfil público de atleta (`/scout/athletes/:id`)                | TODO   | S19    |
| T-171 | Job BullMQ `scout-curation-report` (curadoria mensal PDF)       | TODO   | S19    |
| T-172 | API de solicitação de contato mediada (hard stop menores)       | TODO   | S19    |
| T-173 | Fluxo de resposta do clube (accept/reject)                      | TODO   | S19    |
| T-175 | UI de inbox mediada para scouts (`ScoutInboxPage`)              | TODO   | S20    |
| T-176 | UI de gestão de contatos para o clube                           | TODO   | S20    |
| T-177 | Consentimento parental para contato scout (< 18 anos)           | TODO   | S20    |
| T-178 | Transferência de histórico de showcase                          | TODO   | S20    |
| T-179 | Modelo freemium no showcase (`showcase_tier`)                   | TODO   | S21    |
| T-180 | Billing mensal de scout (R$ 299/mês via GatewayRegistry)        | TODO   | S21    |
| T-182 | Matriz RBAC v3.0 (testes + hard stop menores em CI)             | TODO   | S21    |
| T-183 | Testes E2E ScoutLink                                            | TODO   | S21    |
| T-184 | Checklist de deploy ScoutLink (env vars + `validateEnv()`)      | TODO   | S21    |

> Full task specs → `docs/backlog.md`
