# Backlog — ClubOS

## Overview

- **Repo:** github.com/[org]/clubos
- **Stack:** Node 20 / Fastify 5 / Next.js 16 / PostgreSQL 16 / Redis 7
- **Last updated:** 2026-04-28
- **Active version:** v2.5 "A Arquibancada" (Sprints 12–15, Weeks 21–28)

---

## Status Board

| ID | Title | Status | Priority | Sprint | Area |
|----|-------|--------|----------|--------|------|
| T-136 | Schema Prisma + DDL tenant (events, tickets, fan_profiles, pos_sales) | DONE | HIGH | S12 | Infra |
| T-137 | CRUD de eventos (`/api/events`) | DONE | HIGH | S12 | API |
| T-138 | UI de configuração de evento (`EventFormModal` + `EventsPage`) | TODO | HIGH | S12 | Web |
| T-139 | Geração de cobrança PIX por ingresso | TODO | HIGH | S12 | API |
| T-140 | Worker BullMQ `confirm-ticket` + QR Code SHA-256 | TODO | HIGH | S12 | Jobs |
| T-141 | Página pública de compra de ingresso (`/eventos/:clubSlug/:eventId`) | TODO | HIGH | S12 | Web |
| T-142 | Cancelamento de ingresso com reembolso | TODO | HIGH | S12 | API |
| T-143 | Backend de validação de ingresso (HMAC + Redis dedup) | TODO | HIGH | S13 | API |
| T-144 | UI de portaria mobile-first (`TicketScannerPage`) offline-first | TODO | HIGH | S13 | Web |
| T-145 | Relatório de bilheteria pós-jogo (`/api/events/:id/report`) | TODO | HIGH | S13 | API |
| T-146 | CRM de torcedor (`fan_profiles` + `FanProfilesPage`) | TODO | MEDIUM | S13 | Full |
| T-147 | Funil torcedor → sócio (BullMQ `fan-to-member-funnel`) | TODO | HIGH | S13 | Jobs |
| T-148 | Campos de patrocínio em `events` (logo + CTA) | TODO | MEDIUM | S13 | Full |
| T-149 | Job BullMQ `game-logistics-notice` (48h antes do evento) | TODO | MEDIUM | S14 | Jobs |
| T-150 | CRUD de checklist de operações de jogo | TODO | MEDIUM | S14 | API |
| T-151 | UI de checklist de jogo (`GameOpsChecklist`) offline-first | TODO | MEDIUM | S14 | Web |
| T-152 | Catálogo de produtos do PDV (`/api/clubs/:id/pos-products`) | TODO | MEDIUM | S14 | Full |
| T-153 | Integração mPOS Stone/SumUp com fallback PIX | TODO | HIGH | S14 | API |
| T-154 | UI de PDV mobile (`PosTerminalPage`) offline-first | TODO | HIGH | S14 | Web |
| T-155 | Provisionamento DDL tenant v2.5 (idempotente) | TODO | HIGH | S12 | Infra |
| T-156 | Rotas SSE v2.5 (`TICKET_SOLD`, `CHECKIN_CONFIRMED`, `EVENT_CAPACITY_UPDATED`) | TODO | HIGH | S12 | Infra |
| T-157 | Testes E2E ArenaPass (evento → venda → QR → check-in → relatório) | TODO | HIGH | S15 | Test |
| T-158 | Rate limiting PDV e tickets (Redis) | TODO | MEDIUM | S15 | Infra |
| T-159 | Matriz RBAC v2.5 (testes unitários dos novos endpoints) | TODO | HIGH | S15 | Test |
| T-160 | Checklist de deploy ArenaPass (env vars + `validateEnv()`) | TODO | HIGH | S15 | Infra |

> v3.0 tasks (T-161 → T-184): listed in **Icebox** below. DO NOT start before v2.5 go/no-go.

---

## In Progress

#### T-138 | [TODO] UI de configuração de evento (`EventFormModal` + `EventsPage`)

**Context:** Admins need a UI to create events and configure sectors with inline pricing.  
**Architectural context:** `[UI-BRL]` `formatBRL()` + `font-mono` on all price displays; `[UI-A11Y]` status badge with text + color; visible to `ADMIN` only.  
**Files:** `apps/web/src/app/(app)/access/page.tsx`, `apps/web/src/app/(app)/access/components/EventFormModal.tsx`, `EventSectorsTable.tsx`  
**Acceptance criteria:**
- [ ] `EventsPage` accessible at `/access`
- [ ] `EventFormModal` with opponent, date, venue fields and inline editable sectors table
- [ ] Sector prices displayed with `formatBRL()` + `font-mono`
- [ ] Status badge includes text label (not color only)
- [ ] Visible to `ADMIN` only; other roles see 403
**Out of scope:** Ticket sales UI (T-141), gate scanner (T-144)  
**Pattern reference:** `apps/web/src/app/(app)/members/` modal pattern

---

## Todo

### Priority: HIGH

#### T-139 | [TODO] Geração de cobrança PIX por ingresso

**Context:** Fans need to purchase tickets via PIX; the system must create a charge and a pending ticket atomically.  
**Architectural context:** `[ARCH-GW]` via `GatewayRegistry.forMethod('PIX')`; `[FIN]` `price_cents` integer; `[SEC-OBJ]` `assertEventBelongsToClub`; `[SEC-TEN]`; `[PR-FIN]` ≥ 2 approvals.  
**Files:** `apps/api/src/modules/events/tickets/tickets.routes.ts`, `tickets.service.ts`  
**Acceptance criteria:**
- [ ] `POST /api/events/:id/tickets/purchase` creates `Ticket` (status `PENDING`) and PIX charge
- [ ] Idempotent by `fan_email + event_id + sector_id`
- [ ] Rejects purchase when `event_sector.sold >= event_sector.capacity`
- [ ] `assertEventBelongsToClub` called before any mutation
- [ ] No concrete gateway import — `GatewayRegistry.forMethod('PIX')` only
**Out of scope:** QR Code delivery (T-140), cancellation (T-142)  
**Pattern reference:** `apps/api/src/modules/charges/charges.service.ts`

---

#### T-140 | [TODO] Worker BullMQ `confirm-ticket` + QR Code SHA-256

**Context:** On payment confirmation, the ticket must be activated and a QR code delivered to the fan.  
**Architectural context:** `[SEC-JOB]` payload IDs only — fetch PII inside worker; `[ARCH-JOB]` idempotent; rate limit 30 msg/min via Redis; failure → Sentry.  
**Files:** `apps/api/src/jobs/confirm-ticket.worker.ts`, `apps/api/src/modules/events/tickets/tickets.service.ts`  
**Acceptance criteria:**
- [ ] Worker triggered by webhook payment confirmation
- [ ] Sets `Ticket.status = PAID`, generates QR Code via HMAC-SHA256 (`ticket_id + event_id + secret`)
- [ ] Job payload contains `ticketId`, `eventId`, `clubId` only — no email, no name
- [ ] Rate limit 30 msg/min per club enforced via Redis
- [ ] Idempotent — reprocessing does not generate duplicate QR or messages
- [ ] Exceptions logged to Sentry
**Out of scope:** Webhook pipeline itself (T-142), gate validation (T-143)  
**Pattern reference:** `apps/api/src/jobs/webhook-events/` worker pattern

---

#### T-141 | [TODO] Página pública de compra de ingresso

**Context:** Fans without an account need to purchase tickets via a public link shared by the club.  
**Architectural context:** Route group `(marketing)` — no auth, no imports from `(app)/`; `[UI-BRL]` `formatBRL(price_cents)`; polling every 10s for availability.  
**Files:** `apps/web/src/app/(marketing)/eventos/[clubSlug]/[eventId]/page.tsx`  
**Acceptance criteria:**
- [ ] Page accessible without authentication
- [ ] Displays event name, opponent, date, sectors with `formatBRL(price_cents)` and remaining capacity
- [ ] Purchase form with `name`, `email`, `phone`, sector selection, PIX integration inline
- [ ] Availability updates via polling every 10s
- [ ] Zero imports from `(app)/` — shared components in `packages/ui/` only
**Out of scope:** Authenticated management UI (T-138), QR Code delivery (T-140)  
**Pattern reference:** `apps/web/src/app/(marketing)/peneiras/page.tsx`

---

#### T-142 | [TODO] Cancelamento de ingresso com reembolso

**Context:** Admins and fans need to cancel tickets within the allowed window; confirmed payments must be cancelled, never deleted.  
**Architectural context:** `[FIN]` confirmed payment cannot be deleted — cancel with recorded reason; `[PR-FIN]` ≥ 2 approvals; `[SEC-OBJ]` `assertTicketBelongsToClub`.  
**Files:** `apps/api/src/modules/events/tickets/tickets.routes.ts`, `tickets.service.ts`  
**Acceptance criteria:**
- [ ] `DELETE /api/tickets/:id` reverses gateway charge, sets `Ticket.status = CANCELLED`, records reason in `audit_log`
- [ ] Returns 400 if `ticket.checkedIn = true`
- [ ] Rejects cancellation if event is within 24h
- [ ] Payment is cancelled with reason — never deleted
- [ ] `assertTicketBelongsToClub` required
**Out of scope:** Bulk cancellation (future scope)  
**Pattern reference:** Payment cancellation pattern in `apps/api/src/modules/payments/`

---

#### T-143 | [TODO] Backend de validação de ingresso (HMAC + Redis dedup)

**Context:** Gate staff need to validate tickets in real-time; duplicate scan attempts must return 409.  
**Architectural context:** `[SEC-WH]` HMAC-SHA256 + `timingSafeEqual`; Redis `SET NX` dedup TTL 24h; `[SEC-TEN]`; `[SEC-OBJ]` `assertEventBelongsToClub`.  
**Files:** `apps/api/src/modules/events/tickets/validate.routes.ts`, `validate.service.ts`  
**Acceptance criteria:**
- [ ] `POST /api/events/:id/tickets/validate` verifies HMAC-SHA256 signature via `timingSafeEqual`
- [ ] Rejects duplicate scans via Redis `SET NX` (TTL 24h) — returns 409
- [ ] Sets `Ticket.checked_in = true`, records in `field_access_logs` with `actor_id`, `timestamp`, `ip`
- [ ] `assertEventBelongsToClub` required
- [ ] SSE event `CHECKIN_CONFIRMED` emitted after successful validation
**Out of scope:** Scanner UI (T-144)  
**Pattern reference:** `apps/api/src/modules/webhooks/` HMAC validation pattern

---

#### T-147 | [TODO] Funil torcedor → sócio (BullMQ `fan-to-member-funnel`)

**Context:** After check-in, a conversion message should be sent to the fan with a membership offer.  
**Architectural context:** `[SEC-JOB]` payload `fan_id + event_id` only — fetch name/contact inside worker; `[ARCH-JOB]` idempotent 1 message per `fan_id + event_id`; results recorded in `messages`.  
**Files:** `apps/api/src/jobs/fan-to-member-funnel.worker.ts`  
**Acceptance criteria:**
- [ ] Job enqueued after `CHECKIN_CONFIRMED` event
- [ ] Payload contains `fanId`, `eventId`, `clubId` only
- [ ] Sends conversion message once per `fan_id + event_id` combination (idempotent)
- [ ] Result recorded in `messages` table for audit
- [ ] Failure logged to Sentry
**Out of scope:** Message templates (managed separately), CRM UI (T-146)  
**Pattern reference:** `apps/api/src/jobs/billing-reminders/` idempotency pattern

---

#### T-153 | [TODO] Integração mPOS Stone/SumUp com fallback PIX

**Context:** Event staff need to accept card payments at the venue; fallback to PIX if terminal is unavailable.  
**Architectural context:** `[ARCH-GW]` fallback via `GatewayRegistry.forMethod('PIX')` — never direct import; `[FIN]` `amount_cents` as integer; `[PR-FIN]` ≥ 2 approvals.  
**Files:** `apps/api/src/modules/events/pos/pos.routes.ts`, `pos.service.ts`  
**Acceptance criteria:**
- [ ] `POST /api/events/:id/pos/charge` creates charge via `POS_PROVIDER` SDK (Stone or SumUp)
- [ ] Records sale in `pos_sales` with `amount_cents` as integer
- [ ] Falls back to `GatewayRegistry.forMethod('PIX')` if terminal unavailable
- [ ] `POS_PROVIDER` resolved from env — no hardcoded provider name
**Out of scope:** PDV UI (T-154), product catalog (T-152)  
**Pattern reference:** `apps/api/src/modules/payments/gateways/` registry pattern

---

#### T-155 | [TODO] Provisionamento DDL tenant v2.5 (idempotente)

**Context:** Existing clubs must automatically receive the new v2.5 tables on next provisioning run.  
**Architectural context:** `[SEC-TEN]` DDL must be idempotent; `provisionTenantSchema` is the only place for tenant DDL changes.  
**Files:** `apps/api/src/lib/provision-tenant-schema.ts`  
**Acceptance criteria:**
- [ ] `events`, `event_sectors`, `tickets`, `fan_profiles`, `pos_sales`, `game_checklists` added to `provisionTenantSchema`
- [ ] Existing clubs receive tables on next execution without errors
- [ ] DDL wrapped in `IF NOT EXISTS` guards
**Out of scope:** Data migration, seeding  
**Pattern reference:** existing `provisionTenantSchema` implementation

---

#### T-156 | [TODO] Rotas SSE v2.5

**Context:** Clients need real-time updates for ticket sales and check-ins without polling.  
**Architectural context:** `sse-bus.ts` coupling — React Query invalidation keys must be updated in matching web modules.  
**Files:** `apps/api/src/modules/events/sse-bus.ts`, matching web query files  
**Acceptance criteria:**
- [ ] `TICKET_SOLD`, `CHECKIN_CONFIRMED`, `EVENT_CAPACITY_UPDATED` events added to `sse-bus.ts`
- [ ] `EVENT_QUERY_KEY` and `TICKETS_QUERY_KEY` invalidated in `queryClient` on receipt
- [ ] Scaling note in code: replace `EventEmitter` with `redis.publish/subscribe` when > 1 process
**Out of scope:** New SSE transport implementation (scaling concern)  
**Pattern reference:** `apps/api/src/modules/events/sse-bus.ts` + `PAYMENT_CONFIRMED` pattern

---

### Priority: MEDIUM

#### T-144 | [TODO] UI de portaria mobile-first (`TicketScannerPage`) offline-first

**Context:** Gate staff need a fast QR scanner that works without internet connectivity during events.  
**Architectural context:** Offline queue via Dexie.js + Background Sync; dedup by `ticket_id` in local queue; `[UI-A11Y]` check-in status badge with text.  
**Files:** `apps/web/src/app/(app)/access/TicketScannerPage.tsx`  
**Acceptance criteria:**
- [ ] Camera scans QR Code and displays result in < 1s
- [ ] Works offline: local Dexie.js queue with Background Sync on reconnect
- [ ] Deduplicates by `ticket_id` — no duplicate check-in submissions
- [ ] Check-in counter per sector via SSE `CHECKIN_CONFIRMED`
- [ ] Status badge includes text label beyond color
**Out of scope:** Backend validation (T-143)  
**Pattern reference:** offline attendance pattern in `apps/web/src/app/(app)/training/`

---

#### T-145 | [TODO] Relatório de bilheteria pós-jogo

**Context:** Admins and treasurers need a post-event revenue report with sector breakdown.  
**Architectural context:** `[FIN]` revenue = `price_cents × sold` as integer; `[PR-FIN]` ≥ 2 approvals; guard `requireRole('ADMIN', 'TREASURER')`.  
**Files:** `apps/api/src/modules/events/reports/reports.routes.ts`, `reports.service.ts`  
**Acceptance criteria:**
- [ ] `GET /api/events/:id/report` returns total revenue by sector, occupancy rate, check-ins, no-shows
- [ ] All revenue in integer cents — no floats
- [ ] PDF generation via `react-pdf` with club logo; SHA-256 hash recorded in `audit_log`
- [ ] Requires `ADMIN` or `TREASURER` role
**Out of scope:** CRM data (T-146), CSV export of fans  
**Pattern reference:** `apps/api/src/jobs/monthly-report/` PDF pattern

---

#### T-146 | [TODO] CRM de torcedor

**Context:** Clubs need a database of fans built from ticket purchases to enable re-engagement campaigns.  
**Architectural context:** `[FIN]` `total_spent_cents` as integer; `[SEC]` CSV export must sanitize injection characters.  
**Files:** `apps/api/src/modules/events/fans/fans.routes.ts`, `apps/web/src/app/(app)/access/FanProfilesPage.tsx`  
**Acceptance criteria:**
- [ ] `GET /api/fans` with search by email/phone, pagination, sort by `total_spent_cents`
- [ ] `FanProfilesPage` with filters and CSV export
- [ ] CSV export prefixes `=`, `+`, `-`, `@` fields with `'` to prevent injection
- [ ] `total_spent_cents` stored and displayed as integer cents with `formatBRL()`
**Out of scope:** Fan-to-member conversion messaging (T-147)  
**Pattern reference:** `apps/web/src/app/(app)/members/MembersPage.tsx`

---

#### T-148 | [TODO] Campos de patrocínio em `events`

**Context:** Clubs want to display sponsor branding on ticket confirmation and the public event page.  
**Architectural context:** `[SEC-FILE]` logo validated by magic bytes — never trust `Content-Type`; filename via `randomUUID()`.  
**Files:** `apps/api/src/modules/events/events.service.ts`, Prisma schema  
**Acceptance criteria:**
- [ ] `sponsor_name`, `sponsor_logo_url`, `sponsor_cta_url` fields added to `events`
- [ ] Logo validated by magic bytes via `file-type`; filename = `randomUUID()`
- [ ] Minimum logo dimensions 200×60px enforced via Sharp
- [ ] Logo displayed in `confirm-ticket` worker output and public event page
**Out of scope:** Sponsorship analytics, programmatic ad serving  
**Pattern reference:** logo upload in `apps/api/src/modules/clubs/clubs.service.ts`

---

#### T-149 | [TODO] Job BullMQ `game-logistics-notice`

**Context:** Club captains need an automated WhatsApp notification 48h before each event with squad and logistics details.  
**Architectural context:** `[ARCH-JOB]` idempotent by `event_id`; `[SEC-JOB]` payload `event_id + clubId` only.  
**Files:** `apps/api/src/jobs/game-logistics-notice.worker.ts`  
**Acceptance criteria:**
- [ ] Job enqueued at `event_date - 48h`
- [ ] Sends WhatsApp message to captain with squad, time, venue, checklist link
- [ ] Idempotent by `event_id` — re-enqueue does not send duplicate
- [ ] Configurable per club; failure → Sentry
**Out of scope:** Checklist CRUD (T-150), UI (T-151)  
**Pattern reference:** `apps/api/src/jobs/due-today-notices/` timing pattern

---

#### T-150 | [TODO] CRUD de checklist de operações de jogo

**Context:** Event staff need a structured checklist to track pre-game logistics per event.  
**Architectural context:** `[SEC-TEN]`; `[SEC-OBJ]` `assertEventBelongsToClub`; guard `requireRole('ADMIN')`.  
**Files:** `apps/api/src/modules/events/checklist/checklist.routes.ts`  
**Acceptance criteria:**
- [ ] `GET /api/events/:id/checklist` returns items pre-populated by category
- [ ] `PATCH /api/events/:id/checklist/:itemId` toggles `completed` and records `completed_by`
- [ ] `assertEventBelongsToClub` required
**Out of scope:** Checklist UI (T-151), logistics notification (T-149)  
**Pattern reference:** `apps/api/src/modules/training/` session pattern

---

#### T-151 | [TODO] UI de checklist de jogo (`GameOpsChecklist`) offline-first

**Context:** Staff need to work through the game-day checklist even without connectivity at the venue.  
**Architectural context:** Offline Dexie.js with dedup by `itemId`; `[UI-A11Y]`.  
**Files:** `apps/web/src/app/(app)/access/GameOpsChecklist.tsx`  
**Acceptance criteria:**
- [ ] List grouped by category with toggle, progress indicator (e.g. 7/10), and completion timestamp
- [ ] Visible to `ADMIN` only
- [ ] Works offline with Dexie.js queue; dedup by `itemId` on sync
**Out of scope:** Backend CRUD (T-150)  
**Pattern reference:** attendance list in `apps/web/src/app/(app)/training/`

---

#### T-152 | [TODO] Catálogo de produtos do PDV

**Context:** Clubs need to configure the products available at the venue point-of-sale before events.  
**Architectural context:** `[FIN]` `price_cents` integer; `[UI-BRL]` `formatBRL()`; guard `requireRole('ADMIN')`.  
**Files:** `apps/api/src/modules/events/pos/products.routes.ts`, `apps/web/src/app/(app)/access/PosProductsPage.tsx`  
**Acceptance criteria:**
- [ ] `GET/POST/PUT/DELETE /api/clubs/:id/pos-products` with `name`, `price_cents`, `category`, `stock`
- [ ] `PosProductsPage` with `formatBRL(price_cents)` and `font-mono`
- [ ] Guard `requireRole('ADMIN')`
**Out of scope:** mPOS integration (T-153), PDV terminal UI (T-154)  
**Pattern reference:** `apps/api/src/modules/plans/` CRUD pattern

---

#### T-154 | [TODO] UI de PDV mobile (`PosTerminalPage`) offline-first

**Context:** Venue staff need a mobile POS interface to register product sales during events.  
**Architectural context:** `[UI-BRL]` `formatBRL()` + `font-mono` on all values; offline Dexie.js queue; visible to `ADMIN | TREASURER`.  
**Files:** `apps/web/src/app/(app)/access/PosTerminalPage.tsx`  
**Acceptance criteria:**
- [ ] Product grid, charge button, event sales history, total revenue with `formatBRL()` + `font-mono`
- [ ] Offline: Dexie.js queue with sync on reconnect
- [ ] Visible to `ADMIN` and `TREASURER`
**Out of scope:** mPOS SDK integration (T-153)  
**Pattern reference:** attendance board in `apps/web/src/app/(app)/training/`

---

#### T-158 | [TODO] Rate limiting PDV e tickets

**Context:** Popular event ticket sales can spike; rate limiting prevents gateway and DB overload.  
**Files:** `apps/api/src/plugins/rate-limit.ts`  
**Acceptance criteria:**
- [ ] Redis key `pos:{clubId}` limited to 200 req/min
- [ ] Redis key `ticket-purchase:{eventId}` limited to 50 req/min
- [ ] Added to `@fastify/rate-limit` configuration
**Out of scope:** Adjustable limits per club tier (future)  
**Pattern reference:** existing rate-limit plugin configuration

---

### Priority: HIGH — Test & Hardening (Sprint 15)

#### T-157 | [TODO] Testes E2E ArenaPass

**Context:** Full ArenaPass flow must be validated end-to-end before release.  
**Architectural context:** `[PR-FIN]` ≥ 2 approvals; ≥ 80% coverage on `events`, `tickets`, `pos_sales`.  
**Files:** `apps/api/src/modules/events/__tests__/`, Playwright specs  
**Acceptance criteria:**
- [ ] Full flow covered: create event → PIX purchase → QR Code generated → gate check-in → billing report
- [ ] Idempotency: duplicate check-in attempt returns 409
- [ ] Coverage ≥ 80% on `events`, `tickets`, `pos_sales` modules
- [ ] All RBAC rows for new endpoints covered by unit tests with exact HTTP status codes
**Out of scope:** Load/stress testing  
**Pattern reference:** `apps/api/src/modules/charges/__tests__/`

---

#### T-159 | [TODO] Matriz RBAC v2.5

**Context:** New endpoints introduced in v2.5 need documented and tested access control.  
**Files:** `apps/api/src/modules/events/__tests__/rbac.test.ts`  
**Acceptance criteria:**
- [ ] `TREASURER` can access billing report (read-only)
- [ ] `ADMIN` has full CRUD on events
- [ ] `COACH` cannot access events module (403)
- [ ] Each RBAC row covered by a unit test with exact HTTP status code
**Out of scope:** Role changes for existing v1/v2 endpoints  
**Pattern reference:** `apps/api/src/modules/members/__tests__/rbac.test.ts`

---

#### T-160 | [TODO] Checklist de deploy ArenaPass

**Context:** New env vars for PDV integration must be validated at bootstrap to prevent silent failures.  
**Files:** `apps/api/src/lib/env.ts`, `apps/api/.env.example`  
**Acceptance criteria:**
- [ ] `POS_PROVIDER`, `STONE_API_KEY` / `SUMUP_API_KEY` added to Zod schema in `lib/env.ts`
- [ ] `validateEnv()` is the first call in bootstrap (no change needed if already so)
- [ ] `.env.example` updated with new vars
- [ ] Manual PDV smoke test: 3 sales in staging before enabling in production
**Out of scope:** Automated PDV integration tests (requires physical device)  
**Pattern reference:** existing `apps/api/src/lib/env.ts` Zod schema

---

## Done

### T-136 | [DONE] Schema Prisma + DDL tenant v2.5

**Files:** `apps/api/src/lib/provision-tenant-schema.ts`, Prisma schema  
**Acceptance criteria:**
- [x] Tables `events`, `event_sectors`, `tickets`, `fan_profiles`, `pos_sales`, `game_checklists` created
- [x] Index on `event_date` and `status`; trigger on `event_sector.capacity`
- [x] DDL idempotent; all monetary fields as integer cents
**Completed:** 2026-04-22

#### T-137 | [DONE] CRUD de eventos (`/api/events`)

**Context:** Admins need to create and manage events with configurable sectors before tickets can be sold.  
**Architectural context:** `[SEC-TEN]` `withTenantSchema` + `assertValidClubId`; `clubId` from JWT only; soft-delete via `status = CANCELLED`; `[FIN]` `price_cents` as integer.  
**Files:** `apps/api/src/modules/events/events.routes.ts`, `apps/api/src/modules/events/events.service.ts`  
**Acceptance criteria:**
- [x] `POST /api/events` creates event with `opponent`, `event_date`, `venue`, `description` and nested `event_sectors`
- [x] `GET /api/events` returns paginated list with `page` + `limit`
- [x] `PUT /api/events/:id` updates event; `assertEventBelongsToClub` required
- [x] `DELETE /api/events/:id` soft-deletes via `status = CANCELLED`
- [x] Zod validation on all inputs; guard `requireRole('ADMIN')`
**Out of scope:** Ticket purchase flow (T-139), UI (T-138)  
**Pattern reference:** `apps/api/src/modules/members/members.routes.ts`
**Completed:** 2026-04-30


---

## Icebox

> v3.0 "A Vitrine" (ScoutLink) — Weeks 29–40. DO NOT start before v2.5 go/no-go criteria are met.
> Pre-requisite: ≥ 6 months of continuous `workload_metrics` and `medical_records` data in production.

- [ ] [T-161] Schema `public` cross-tenant (ScoutLink tables)
- [ ] [T-162] Auth e onboarding de scout (role `SCOUT` + JWT)
- [ ] [T-163] Guard de pré-requisito de dados longitudinais
- [ ] [T-164] API de showcase de atleta verificado (ACWR + SHA-256)
- [ ] [T-165] UI de gestão de showcase (`ShowcaseManagerPage`)
- [ ] [T-166] Backend de upload de vídeos (Cloudflare R2 + magic bytes)
- [ ] [T-167] UI de gestão de vídeos (`AthleteVideoManager`)
- [ ] [T-168] API de busca filtrada de atletas (freemium enforced)
- [ ] [T-169] UI de busca ScoutLink (`ScoutSearchPage`)
- [ ] [T-170] Perfil público de atleta (`/scout/athletes/:id`)
- [ ] [T-171] Job BullMQ `scout-curation-report` (curadoria mensal PDF)
- [ ] [T-172] API de solicitação de contato mediada (hard stop para menores)
- [ ] [T-173] Fluxo de resposta do clube (accept/reject)
- [ ] [T-174] Log imutável de comunicação (`communication_log`)
- [ ] [T-175] UI de inbox mediada para scouts (`ScoutInboxPage`)
- [ ] [T-176] UI de gestão de contatos para o clube
- [ ] [T-177] Consentimento parental para contato scout (< 18 anos)
- [ ] [T-178] Transferência de histórico de showcase
- [ ] [T-179] Modelo freemium no showcase (`showcase_tier`)
- [ ] [T-180] Billing mensal de scout (R$ 299/mês via GatewayRegistry)
- [ ] [T-181] Rotas SSE v3.0 (`SHOWCASE_UPDATED`, `CONTACT_REQUEST_RECEIVED`)
- [ ] [T-182] Matriz RBAC v3.0 (testes + hard stop menores em CI)
- [ ] [T-183] Testes E2E ScoutLink
- [ ] [T-184] Checklist de deploy ScoutLink (Cloudflare R2 + FFprobe env vars)

---

## Notes & Decisions

- **2026-04-22:** T-136 merged — v2.5 tenant DDL provisioned. Sprints 12–15 now unblocked.
- **2026-04-22:** v2.0 go/no-go criteria confirmed met (FisioBase + SAF Full 100% ✅).
- **Architecture:** ScoutLink (v3.0) must not launch before 6 months of BaseForte + FisioBase data in production. A showcase with no longitudinal data does not retain scouts.
- **Architecture:** `sse-bus.ts` EventEmitter approach is acceptable until > 1 process. At that point, swap to `redis.publish/subscribe` — the `sse-bus.ts` interface stays identical.
- **Architecture:** PostgreSQL schema-per-tenant scales to ~1,000 clubs. Plan RLS migration analysis at 300 active clubs.
- **Security:** `COACH` must never receive `clinicalNotes` or `diagnosis` from `medical_records` — projection is enforced in the service layer, not only at the route level.
