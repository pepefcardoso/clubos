# Backlog — ClubOS

## Overview

- **Repo:** github.com/[org]/clubos
- **Stack:** Node 20 / Fastify 5 / Next.js 16 / PostgreSQL 16 / Redis 7
- **Last updated:** 2026-05-11
- **Active version:** v3.0 "A Vitrine" (Sprints 16–21, Weeks 29–40)
- **Pre-requisite gate:** ≥ 6 months of continuous `workload_metrics` + `medical_records` data in production before PREMIUM showcase unlock (enforced in T-163)

---

## Status Board

| ID    | Title                                                           | Status | Priority | Sprint | Area  |
| ----- | --------------------------------------------------------------- | ------ | -------- | ------ | ----- |
| T-161 | Schema `public` cross-tenant (ScoutLink tables)                 | DONE   | HIGH     | S16    | Infra |
| T-162 | Auth e onboarding de scout (role `SCOUT` + JWT)                 | DONE   | HIGH     | S16    | API   |
| T-163 | Guard de pré-requisito de dados longitudinais                   | DONE   | HIGH     | S16    | API   |
| T-174 | Log imutável de comunicação (`communication_log`)               | DONE   | HIGH     | S16    | Infra |
| T-164 | API de showcase de atleta verificado (ACWR + SHA-256)           | DONE   | HIGH     | S17    | API   |
| T-165 | UI de gestão de showcase (`ShowcaseManagerPage`)                | DONE   | HIGH     | S17    | Web   |
| T-181 | Rotas SSE v3.0 (`SHOWCASE_UPDATED`, `CONTACT_REQUEST_RECEIVED`) | DONE   | HIGH     | S17    | Infra |
| T-166 | Backend de upload de vídeos (Cloudflare R2 + magic bytes)       | DONE   | HIGH     | S18    | API   |
| T-167 | UI de gestão de vídeos (`AthleteVideoManager`)                  | DONE   | MEDIUM   | S18    | Web   |
| T-168 | API de busca filtrada de atletas (freemium enforced)            | DONE   | HIGH     | S18    | API   |
| T-169 | UI de busca ScoutLink (`ScoutSearchPage`)                       | DONE   | HIGH     | S18    | Web   |
| T-170 | Perfil público de atleta (`/scout/athletes/:id`)                | DONE   | HIGH     | S19    | Web   |
| T-171 | Job BullMQ `scout-curation-report` (curadoria mensal PDF)       | DONE   | MEDIUM   | S19    | Jobs  |
| T-172 | API de solicitação de contato mediada (hard stop menores)       | DONE   | HIGH     | S19    | API   |
| T-173 | Fluxo de resposta do clube (accept/reject)                      | DONE   | HIGH     | S19    | API   |
| T-175 | UI de inbox mediada para scouts (`ScoutInboxPage`)              | DONE   | HIGH     | S20    | Web   |
| T-176 | UI de gestão de contatos para o clube                           | DONE   | HIGH     | S20    | Web   |
| T-177 | Consentimento parental para contato scout (< 18 anos)           | TODO   | HIGH     | S20    | API   |
| T-178 | Transferência de histórico de showcase                          | TODO   | MEDIUM   | S20    | API   |
| T-179 | Modelo freemium no showcase (`showcase_tier`)                   | TODO   | HIGH     | S21    | Full  |
| T-180 | Billing mensal de scout (R$ 299/mês via GatewayRegistry)        | TODO   | HIGH     | S21    | API   |
| T-182 | Matriz RBAC v3.0 (testes + hard stop menores em CI)             | TODO   | HIGH     | S21    | Test  |
| T-183 | Testes E2E ScoutLink                                            | TODO   | HIGH     | S21    | Test  |
| T-184 | Checklist de deploy ScoutLink (env vars + `validateEnv()`)      | TODO   | HIGH     | S21    | Infra |

> v3.5 tasks (T-185+): listed in **Icebox** below. DO NOT start before v3.0 go/no-go.
> Pre-requisite: ≥ 3 scouts with active subscription; ≥ 1 formal contact mediated; zero LGPD incidents.

---

## In Progress

### T-177 | [TODO] Consentimento parental para contato scout (< 18 anos)

**Context:** Any scout contact request targeting an athlete under 18 requires verifiable parental consent before the club can accept. The consent record is immutable after creation.  
**Architectural context:** `[SEC]` consent hash = SHA-256(`guardianName + athleteId + timestamp + CONSENT_SECRET`); `guardianCpf` stored as `BYTEA` via `pgp_sym_encrypt`; IP recorded; row immutable via DB trigger (same pattern as `communication_log`).  
**Files:** `apps/api/src/modules/scoutlink/contact/parental-consent.routes.ts`, `parental-consent.service.ts`, `apps/web/src/app/(app)/athletes/[id]/parental-consent/page.tsx`  
**Acceptance criteria:**

- [ ] `POST /api/athletes/:id/parental-consent` creates `parental_consents` row: `guardian_name`, `guardian_cpf` (BYTEA AES-256), `consent_hash`, `ip`, `timestamp`
- [ ] `consent_hash` = SHA-256(`guardianName + athleteId + isoTimestamp + CONSENT_SECRET`) — computed server-side only
- [ ] Row immutable — DB trigger prevents UPDATE/DELETE (reuse `prevent_communication_log_mutation` pattern)
- [ ] `assertMemberBelongsToClub` required; `requireRole('ADMIN')`
- [ ] UI: form with guardian name, CPF input, explicit consent checkbox; `consent_hash` displayed post-submit in `font-mono` for guardian's records

**Out of scope:** Contact request hard stop itself (T-172)  
**Pattern reference:** aceite parental in `apps/api/src/modules/athletes/` (v1.5 peneiras pattern)

---

## Todo

### T-178 | [TODO] Transferência de histórico de showcase

**Context:** When an athlete transfers clubs, their showcase history can follow them with explicit digital consent from the source club; source club retains a read-only copy.  
**Architectural context:** `[SEC-TEN]` `assertValidClubId(targetClubId)`; `appendCommunicationLog` on transfer with both club IDs; source row gets `transferred_at` — never deleted; consent hash validated before any mutation.  
**Files:** `apps/api/src/modules/scoutlink/showcases/showcase-transfer.routes.ts`, `showcase-transfer.service.ts`  
**Acceptance criteria:**

- [ ] `POST /api/athletes/:id/showcase/transfer` accepts `{ targetClubId, consentHash }`
- [ ] Validates `consentHash` matches stored `parental_consents` or admin consent record before proceeding — rejects with 403 if mismatch
- [ ] Copies `scout_showcases` snapshot reference to `targetClubId`; source row updated with `transferred_at` timestamp — never deleted
- [ ] `assertValidClubId(targetClubId)` called; `assertMemberBelongsToClub` on source
- [ ] `appendCommunicationLog` records `event_type: SHOWCASE_TRANSFERRED` with `metadata: { sourceClubId, targetClubId }`
- [ ] `requireRole('ADMIN')`

**Out of scope:** Athlete contract transfer (separate `contracts` module concern)  
**Pattern reference:** `balance_sheets` immutability pattern for source row preservation

---

### T-179 | [TODO] Modelo freemium no showcase (`showcase_tier`)

**Context:** The freemium projection must be the single source of truth used by search (T-168), profile (T-170), and curation (T-171) — no duplication of gating logic across routes.  
**Architectural context:** `null` returned for gated fields — never omitted — so frontend can render blurred placeholders consistently; `upgrade_required` flag present whenever any field is gated.  
**Files:** `apps/api/src/modules/scoutlink/showcases/showcase.service.ts`  
**Acceptance criteria:**

- [ ] `projectShowcase(snapshot, scoutSubscriptionStatus, showcaseTier)` handles all 4 combinations:
  - FREE scout + FREE tier → initials only, no ACWR, `upgrade_required: true`
  - FREE scout + PREMIUM tier → same as above (scout tier is binding ceiling)
  - PREMIUM scout + FREE tier → full identity fields visible, no ACWR (showcase tier is binding floor)
  - PREMIUM scout + PREMIUM tier → full projection, `upgrade_required: false`
- [ ] Gated fields returned as `null`, not omitted — Zod output schema enforces this
- [ ] Unit tests cover all 4 combinations with snapshot assertions
- [ ] `projectShowcase` imported and used in search service (T-168) — no inline projection logic in routes

**Out of scope:** Billing/subscription management (T-180)  
**Pattern reference:** conditional projection pattern in `apps/api/src/modules/athletes/` RTP status service

---

### T-180 | [TODO] Billing mensal de scout (R$ 299/mês via GatewayRegistry)

**Context:** Scout PREMIUM subscription charged monthly via PIX; lapsed subscription immediately gates to FREE tier without manual intervention.  
**Architectural context:** `[ARCH-GW]` `GatewayRegistry.forMethod('PIX')` — no concrete gateway import; `[FIN]` `29900` cents; `[PR-FIN]` ≥ 2 approvals; webhook confirmation updates `subscription_status`; lapsed gate enforced by cron — not lazily on read.  
**Files:** `apps/api/src/modules/scoutlink/billing/scout-billing.routes.ts`, `scout-billing.service.ts`, `apps/api/src/jobs/scout-subscription-renewal.worker.ts`  
**Acceptance criteria:**

- [ ] `POST /api/scout/billing/subscribe` generates PIX charge of `29900` cents via `GatewayRegistry.forMethod('PIX')`
- [ ] Webhook confirmation sets `subscription_status = ACTIVE`, `subscription_expires_at = now() + 30d`
- [ ] Job `scout-subscription-renewal` enqueued 3 days before `subscription_expires_at`; idempotent by `scoutId + billingCycle`
- [ ] Daily cron: sets `subscription_status = INACTIVE` for all rows where `subscription_expires_at < now()` — runs before business hours
- [ ] `GET /api/scout/billing/status` returns `{ status, expiresAt, nextRenewalAt }`
- [ ] All amounts as integer cents; `requireRole('SCOUT')`

**Out of scope:** Card payment for scouts (future); multi-currency (WON'T HAVE)  
**Pattern reference:** `apps/api/src/modules/charges/charges.service.ts`; `apps/api/src/jobs/billing-reminders/` cron pattern

---

### T-182 | [TODO] Matriz RBAC v3.0 (testes + hard stop menores em CI)

**Context:** The SCOUT role and all new v3.0 endpoints require full RBAC coverage; the minor hard stop must be an explicit CI assertion that fails the build if removed.  
**Files:** `apps/api/src/modules/scoutlink/__tests__/rbac.test.ts`  
**Acceptance criteria:**

- [ ] `SCOUT` receives 403 on all `(app)/` routes (members, charges, dashboard, medical, events, etc.)
- [ ] `ADMIN`, `TREASURER`, `COACH`, `PHYSIO` receive 403 on all `/api/scout/` routes
- [ ] Minor hard stop CI assertion: athlete age < 18 + no `parental_consents` → `POST /api/scout/contact-requests` returns 403; `communication_log` contains blocked attempt
- [ ] CI step runs `rbac.test.ts` with `--bail`; removing the minor hard stop test causes build failure via required test count assertion
- [ ] Every RBAC row covered by unit test with exact HTTP status code

**Out of scope:** Role changes for v1/v2 endpoints  
**Pattern reference:** `apps/api/src/modules/members/__tests__/rbac.test.ts`

---

### T-183 | [TODO] Testes E2E ScoutLink

**Context:** Full ScoutLink flow must be validated end-to-end before release.  
**Architectural context:** `[PR-FIN]` ≥ 2 approvals; ≥ 80% coverage on all `scoutlink/` modules.  
**Files:** `apps/api/src/modules/scoutlink/__tests__/`, Playwright specs  
**Acceptance criteria:**

- [ ] Full happy path: publish showcase (ADMIN) → scout search → view profile → contact request → club accept → `communication_log` entry verified
- [ ] Minor hard stop: contact attempt without parental consent → 403; `communication_log` contains `CONTACT_BLOCKED_MINOR` entry
- [ ] Freemium: FREE scout receives `null` on PREMIUM fields; `upgrade_required: true` in response
- [ ] Duplicate contact request within 30 days → 409
- [ ] Longitudinal guard: PREMIUM showcase publish with < 180 days data → 409
- [ ] Coverage ≥ 80% on all `scoutlink/` modules; `[PR-FIN]` ≥ 2 approvals required

**Out of scope:** Load/stress testing  
**Pattern reference:** `apps/api/src/modules/events/__tests__/` E2E pattern

---

### T-184 | [TODO] Checklist de deploy ScoutLink

**Context:** New env vars for Cloudflare R2, FFprobe, and consent hash secret must be validated at bootstrap to prevent silent runtime failures.  
**Files:** `apps/api/src/lib/env.ts`, `apps/api/.env.example`  
**Acceptance criteria:**

- [ ] `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ENDPOINT`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `FFPROBE_PATH`, `CONSENT_SECRET` added to Zod schema in `lib/env.ts`
- [ ] `validateEnv()` remains the first call in bootstrap — verify, do not move
- [ ] `.env.example` updated with all new vars and inline comments
- [ ] Manual smoke test before production enable: 1 video upload + 1 showcase publish + 1 contact request (including blocked minor attempt) in staging

**Out of scope:** Automated PDV integration tests (physical device required)  
**Pattern reference:** `apps/api/src/lib/env.ts` existing Zod schema

---

## Done

### T-161 | [DONE] Schema `public` cross-tenant (ScoutLink tables)

**Context:** ScoutLink operates across tenant boundaries — scout profiles, showcase snapshots, and contact logs live in the `public` schema, not in `clube_{id}`.  
**Architectural context:** DDL idempotent; `public` schema only for cross-tenant entities; `clube_{id}` athlete identity linked via composite `club_id + athlete_id` — no cross-schema FK, enforced at application layer; `[SEC]` no PII in showcase snapshot — aggregated metrics only.  
**Files:** `apps/api/src/lib/provision-public-schema.ts`, Prisma schema  
**Acceptance criteria:**

- [x] Tables `scout_profiles`, `scout_showcases`, `showcase_videos`, `contact_requests`, `communication_log`, `parental_consents` created in `public` schema
- [x] `showcase_tier` enum: `FREE | PREMIUM`; `contact_request_status` enum: `PENDING | ACCEPTED | REJECTED`
- [x] All monetary fields as integer cents; DDL wrapped in `IF NOT EXISTS`
- [x] `communication_log` append-only enforced via DB trigger — UPDATE/DELETE raise exception
- [x] `parental_consents` immutable after INSERT — same trigger pattern

**Out of scope:** Scout auth (T-162), showcase API (T-164)  
**Pattern reference:** `apps/api/src/lib/provision-tenant-schema.ts`

### T-162 | [DONE] Auth e onboarding de scout (role `SCOUT` + JWT)

**Context:** Scouts are external subscribers who auth independently of club staff.  
**Architectural context:** `[SEC-AUTH]` role `SCOUT` in JWT payload; `clubId` absent from SCOUT token — `withTenantSchema` must never be called in scout handlers; `BCRYPT_ROUNDS = 12`; refresh token rotation identical to club auth.  
**Files:** `apps/api/src/modules/auth/auth.routes.ts`, `apps/api/src/modules/scoutlink/scouts/scouts.routes.ts`, `apps/web/src/app/(auth)/scout-login/page.tsx`, `apps/web/src/app/(onboarding)/scout-onboarding/page.tsx`  
**Acceptance criteria:**

- [x] `POST /api/auth/scout/register` creates `scout_profiles` row + issues JWT with `role: SCOUT`, no `clubId`
- [x] `POST /api/auth/scout/login` validates credentials; same refresh token rotation as club auth
- [x] `requireRole('SCOUT')` guard blocks club staff from scout routes; club roles blocked from scout routes (403)
- [x] `clubId` is `null` in SCOUT JWT — any handler calling `withTenantSchema` with a SCOUT token must throw immediately
- [x] Scout onboarding wizard: name, CRM number (optional), specialization, target positions, target age ranges

**Out of scope:** Billing/subscription status (T-180), longitudinal data guard (T-163)  
**Pattern reference:** `apps/api/src/modules/auth/auth.routes.ts`

### T-163 | [DONE] Guard de pré-requisito de dados longitudinais

**Context:** A showcase with fewer than 6 months of workload data provides no analytical value and would erode scout trust. FREE tier has no minimum — only PREMIUM tier requires the gate.  
**Architectural context:** Gate enforced at service layer only — `assertLongitudinalDataSufficient` reads `workload_metrics` date range via `withTenantSchema`; FREE tier bypasses entirely.  
**Files:** `apps/api/src/modules/scoutlink/showcases/showcase.service.ts`  
**Acceptance criteria:**

- [x] `assertLongitudinalDataSufficient(prisma, clubId, athleteId)` throws `409` if `workload_metrics` span < 180 days for `tier = PREMIUM` requests
- [x] FREE tier bypasses guard unconditionally
- [x] Guard called before any `INSERT` or `UPDATE` on `scout_showcases` with `tier = PREMIUM`
- [x] Unit test: 179 days → 409; 180 days → passes; FREE with 0 days → passes

**Out of scope:** Showcase API itself (T-164)  
**Pattern reference:** `assertMemberBelongsToClub` guard pattern

### T-174 | [DONE] Log imutável de comunicação (`communication_log`)

**Context:** LGPD compliance requires an immutable record of every scout–club interaction; any mutation attempt must fail at the DB level, not only the application layer.  
**Architectural context:** `[SEC]` append-only; `actorId`, `actorRole`, `targetId`, `eventType`, `ip`, `timestamp` always recorded; `metadata` JSONB must never contain CPF, phone, or email.  
**Files:** `apps/api/src/lib/provision-public-schema.ts` (trigger DDL), `apps/api/src/modules/scoutlink/communication/communication-log.service.ts`  
**Acceptance criteria:**

- [x] `appendCommunicationLog(entry)` inserts row — service layer has no UPDATE/DELETE methods
- [x] DB trigger `prevent_communication_log_mutation` raises exception on UPDATE or DELETE at DB level
- [x] Fields: `id`, `actor_id`, `actor_role`, `target_id`, `event_type`, `metadata` (JSONB), `ip`, `created_at`
- [x] Unit test verifies trigger fires and rolls back on mutation attempt
- [x] `metadata` schema validated by Zod before insert — rejects keys `cpf`, `phone`, `email`

**Out of scope:** Contact request flow (T-172), parental consent (T-177)  
**Pattern reference:** `audit_log` immutability pattern in `apps/api/src/modules/`

### T-164 | [DONE] API de showcase de atleta verificado (ACWR + SHA-256)

**Context:** Clubs publish verified athlete snapshots — ACWR trends, RTP status, evaluation scores — signed with SHA-256 to prevent tampering after publication. Clinical data is never included.  
**Architectural context:** `[SEC]` snapshot excludes `clinicalNotes`, `diagnosis`, `treatmentDetails`; ACWR from `acwr_weekly_view` materialized view; SHA-256 of serialized snapshot JSON stored as `snapshot_hash`; `[SEC-TEN]` `withTenantSchema` for all source data reads; `[PR-FIN]` ≥ 2 approvals (athlete data publication).  
**Files:** `apps/api/src/modules/scoutlink/showcases/showcases.routes.ts`, `showcases.service.ts`  
**Acceptance criteria:**

- [x] `POST /api/athletes/:id/showcase` creates/updates snapshot: position, age, dominant foot, ACWR 4-week array, RTP status, evaluation scores — zero clinical fields
- [x] Snapshot serialized → SHA-256 → stored as `snapshot_hash`; scouts can verify hash client-side
- [x] `GET /api/athletes/:id/showcase` returns snapshot + `snapshot_hash` + `tier`
- [x] `assertMemberBelongsToClub` required; `requireRole('ADMIN')` for write; `requireRole('SCOUT', 'ADMIN')` for read
- [x] `appendCommunicationLog` called on every publish with `event_type: SHOWCASE_PUBLISHED`
- [x] `assertLongitudinalDataSufficient` called before PREMIUM tier publish (T-163)

**Out of scope:** Video attachments (T-166), freemium projection (T-179)  
**Pattern reference:** `apps/api/src/modules/charges/charges.service.ts` for atomic write pattern; SHA-256 pattern from `balance_sheets`

### T-165 | [DONE] UI de gestão de showcase (`ShowcaseManagerPage`)

**Context:** ADMINs preview, configure, and publish athlete showcases with tier selection and visibility control.  
**Architectural context:** `[UI-A11Y]`; tier badge with text label; PREMIUM locked behind longitudinal guard — show inline warning if data < 180 days; confirmation modal before publish; one primary action per context.  
**Files:** `apps/web/src/app/(app)/athletes/[id]/showcase/page.tsx`, `ShowcaseManagerPage.tsx`  
**Acceptance criteria:**

- [x] Snapshot preview: ACWR 4-week Recharts line chart, RTP badge (text + color), evaluation score grid
- [x] Tier selector (FREE / PREMIUM); inline warning banner if `workload_metrics` span < 180 days
- [x] Publish/unpublish toggle with confirmation modal; unpublish requires reason
- [x] `snapshot_hash` displayed as monospace string post-publish
- [x] Visible to `ADMIN` only; other roles → 403

**Out of scope:** Video management (T-167), contact request responses (T-176)  
**Pattern reference:** `apps/web/src/app/(app)/members/` modal pattern; `apps/web/src/app/(app)/saf/` hash display pattern

### T-181 | [DONE] Rotas SSE v3.0

**Context:** Scout clients need real-time updates when showcases change or contact requests receive a response; club clients need real-time incoming contact request notifications.  
**Architectural context:** `sse-bus.ts` coupling — add events without renaming existing; React Query keys must be invalidated in matching web modules; SCOUT token must not receive club-scoped events; scaling note required in code.  
**Files:** `apps/api/src/modules/events/sse-bus.ts`, matching web query files  
**Acceptance criteria:**

- [x] `SHOWCASE_UPDATED` and `CONTACT_REQUEST_RECEIVED` added to `sse-bus.ts`
- [x] `SHOWCASE_QUERY_KEY` invalidated on `SHOWCASE_UPDATED`; `CONTACT_REQUESTS_QUERY_KEY` on `CONTACT_REQUEST_RECEIVED`
- [x] Scout SSE stream (`GET /api/scout/events`) authenticated by `role: SCOUT` JWT — club-tenant events not forwarded to scout clients
- [x] Scaling note in `sse-bus.ts`: replace `EventEmitter` with `redis.publish/subscribe` when > 1 process — interface stays identical

**Out of scope:** New SSE transport (scaling concern)  
**Pattern reference:** `apps/api/src/modules/events/sse-bus.ts` + `PAYMENT_CONFIRMED` pattern

### T-166 | [DONE] Backend de upload de vídeos (Cloudflare R2 + magic bytes)

**Context:** Clubs upload short clips (≤ 90s) to enrich showcases; strict validation at every layer prevents malicious or oversized uploads.  
**Architectural context:** `[SEC-FILE]` magic bytes via `file-type` — never trust `Content-Type`; filename = `randomUUID()`; duration enforced via FFprobe (not client metadata); Cloudflare R2 via S3-compatible SDK; max 5 videos per athlete.  
**Files:** `apps/api/src/modules/scoutlink/videos/videos.routes.ts`, `videos.service.ts`  
**Acceptance criteria:**

- [x] `POST /api/athletes/:id/videos` accepts `multipart/form-data`; validates magic bytes for `video/mp4` or `video/webm` only — rejects all other types with 415
- [x] FFprobe enforces ≤ 90s duration — rejects with 422 if exceeded; client-supplied duration metadata ignored
- [x] Filename = `randomUUID()` — original filename discarded and never stored
- [x] Stores `{ r2Key, durationSeconds, thumbnailUrl, athleteId, clubId, uploadedAt }` in `showcase_videos`
- [x] Returns 409 if athlete already has 5 videos
- [x] `assertMemberBelongsToClub` + `requireRole('ADMIN')`

**Out of scope:** Video reorder (T-167), showcase publication (T-164)  
**Pattern reference:** logo upload in `apps/api/src/modules/clubs/clubs.service.ts`; `CLOUDFLARE_R2_*` env vars added in T-184

### T-167 | [DONE] UI de gestão de vídeos (`AthleteVideoManager`)

**Context:** ADMINs manage the athlete video gallery — upload, reorder, and delete clips — from within the showcase manager.  
**Architectural context:** `[UI-A11Y]`; upload progress bar; duration badge per card; delete requires confirmation modal; upload button disabled at 5-video limit.  
**Files:** `apps/web/src/app/(app)/athletes/[id]/showcase/AthleteVideoManager.tsx`  
**Acceptance criteria:**

- [x] Drag-to-reorder grid; order persisted via `PATCH /api/athletes/:id/videos/order`
- [x] Upload progress bar; error state shown inline for duration > 90s or rejected file type
- [x] Delete requires confirmation modal; optimistic removal reverted on API error
- [x] "5/5 vídeos" badge shown; upload button disabled and tooltip shown at limit
- [x] Duration badge on each card in `MM:SS` format

**Out of scope:** Video backend (T-166)  
**Pattern reference:** attendance board drag pattern in `apps/web/src/app/(app)/training/`

### T-168 | [DONE] API de busca filtrada de atletas (freemium enforced)

**Context:** Scouts filter the athlete database by technical criteria; data depth is gated by the combination of showcase tier and scout subscription status. Clinical data is never returned under any combination.  
**Architectural context:** `[SEC]` `clinicalNotes`, `diagnosis`, `treatmentDetails` excluded unconditionally; freemium projection via `projectShowcase()` (T-179); subscription status from `scout_profiles.subscription_status`; pagination max 50.  
**Files:** `apps/api/src/modules/scoutlink/search/search.routes.ts`, `search.service.ts`  
**Acceptance criteria:**

- [x] `GET /api/scout/athletes` accepts filters: `position`, `minAge`, `maxAge`, `state`, `rtpStatus`, `minAcwr`, `maxAcwr`
- [x] FREE scout projection: `{ nameInitials, position, age, state, rtpStatus, upgrade_required: true }` — `acwrTrend`, `evaluationScores`, `videoCount` returned as `null`
- [x] PREMIUM scout + PREMIUM showcase: full projection including `acwrTrend[]`, `evaluationScores`, `videoCount`
- [x] Active subscription check: `subscription_status = ACTIVE` AND `subscription_expires_at > now()` — lapsed treated as FREE
- [x] Pagination: `page` + `limit`; max 50 per page; `requireRole('SCOUT')`

**Out of scope:** Public profile detail (T-170), freemium projection logic (T-179)  
**Pattern reference:** `apps/api/src/modules/members/members.routes.ts` pagination pattern

### T-169 | [DONE] UI de busca ScoutLink (`ScoutSearchPage`)

**Context:** Scouts need a fast, filterable search interface that clearly communicates the freemium boundary with a non-blocking upgrade path.  
**Architectural context:** `[UI-A11Y]`; locked PREMIUM fields rendered as blurred placeholders — never omitted — so layout remains stable; `[UI-BRL]` subscription price in `font-mono`; `requireRole('SCOUT')`.  
**Files:** `apps/web/src/app/(scout)/search/page.tsx`, `ScoutSearchPage.tsx`  
**Acceptance criteria:**

- [x] Filter panel: position multi-select, age range slider, state select, RTP status, ACWR min/max
- [x] Result cards: FREE fields visible; `null` PREMIUM fields rendered as blurred `████` placeholders with "Assine para ver" overlay
- [x] Upgrade CTA in overlay links to billing flow (T-180); price shown as `font-mono`
- [x] Click on any result navigates to public athlete profile (T-170)
- [x] `requireRole('SCOUT')` guard on route

**Out of scope:** Billing flow (T-180), public profile (T-170)  
**Pattern reference:** `apps/web/src/app/(app)/members/MembersPage.tsx` filter pattern

### T-170 | [DONE] Perfil público de atleta (`/scout/athletes/:id`)

**Context:** Each published showcase has a profile page accessible to authenticated scouts; depth gated by subscription and showcase tier. Snapshot hash is displayed for verification.  
**Architectural context:** Route group `(scout)` — authenticated scout only, no `(marketing)` exposure; ACWR chart via Recharts; video gallery visible to PREMIUM scouts only.  
**Files:** `apps/web/src/app/(scout)/athletes/[id]/page.tsx`  
**Acceptance criteria:**

- [x] Displays: position, age, dominant foot, RTP badge (text + color), ACWR 4-week Recharts line chart
- [x] Video gallery section: visible only to PREMIUM scouts with active subscription; blurred placeholder otherwise
- [x] `snapshot_hash` displayed in `font-mono` with "Verificar integridade" tooltip explaining SHA-256
- [x] "Solicitar contato" button triggers contact request flow (T-172); disabled if scout has pending request for this athlete
- [x] `requireRole('SCOUT')`

**Out of scope:** Contact request API (T-172), billing gate (T-180)  
**Pattern reference:** `apps/web/src/app/(marketing)/eventos/` for public-facing layout; ACWR chart in `apps/web/src/app/(app)/workload/`

### T-171 | [DONE] Job BullMQ `scout-curation-report`

**Context:** PREMIUM scouts receive a monthly curated PDF of the top 20 athletes matching their saved search criteria; idempotency prevents duplicate sends on retry.  
**Architectural context:** `[SEC-JOB]` payload `scoutId + yearMonth` only — fetch preferences and contact details inside worker; `[ARCH-JOB]` idempotent by `scoutId + yearMonth`; active subscription verified inside worker before generation; failure → Sentry.  
**Files:** `apps/api/src/jobs/scout-curation-report.worker.ts`  
**Acceptance criteria:**

- [x] Job enqueued via cron on 1st of each month for each `scout_profiles` row with `subscription_status = ACTIVE`
- [x] Payload: `{ scoutId, yearMonth }` only — no name, email, filter criteria in payload
- [x] Worker fetches saved filters, queries top 20 athletes, generates PDF via `react-pdf`
- [x] Sent via Resend SDK; result recorded in `messages` table
- [x] Idempotent by `scoutId + yearMonth` — re-enqueue does not send duplicate
- [x] Skips silently (logs to Sentry at `info` level) if `subscription_status` lapsed between enqueue and execution

**Out of scope:** PDF template design (separate concern), email template (managed by `templates` module)  
**Pattern reference:** `apps/api/src/jobs/billing-reminders/` idempotency pattern; `apps/api/src/jobs/monthly-report/` PDF pattern

### T-172 | [DONE] API de solicitação de contato mediada (hard stop menores)

**Context:** Scouts request contact with a club about an athlete via the platform only; direct contact with athletes — especially minors — is unconditionally blocked. Every attempt, including blocked ones, is logged.  
**Architectural context:** `[SEC]` hard stop: athlete age < 18 AND no `parental_consents` row → 403 unconditionally; `appendCommunicationLog` on every outcome including blocked attempts; `[PR-FIN]` ≥ 2 approvals (LGPD critical path); duplicate window 30 days.  
**Files:** `apps/api/src/modules/scoutlink/contact/contact.routes.ts`, `contact.service.ts`  
**Acceptance criteria:**

- [x] `POST /api/scout/contact-requests` creates `contact_requests` row with `status = PENDING`
- [x] Hard stop: athlete `date_of_birth` → age < 18 AND no `parental_consents` row → 403; `appendCommunicationLog` records blocked attempt with `event_type: CONTACT_BLOCKED_MINOR`
- [x] Active PREMIUM subscription required — FREE scouts receive 403
- [x] Duplicate request (`scoutId + athleteId`) within 30 days → 409; `appendCommunicationLog` records duplicate attempt
- [x] `appendCommunicationLog` called on every outcome: created, blocked (minor), blocked (no subscription), duplicate
- [x] `requireRole('SCOUT')`

**Out of scope:** Club response flow (T-173), parental consent creation (T-177)  
**Pattern reference:** HMAC hard stop pattern in `apps/api/src/modules/webhooks/`; `audit_log` write pattern

### T-173 | [DONE] Fluxo de resposta do clube (accept/reject)

**Context:** Club ADMIN reviews and responds to incoming contact requests; acceptance opens a mediated thread; rejection notifies the scout. PII is never included in response payloads.  
**Architectural context:** `[SEC]` scout receives club name and specialization only — no phone/email/CPF; `appendCommunicationLog` on every state transition; SSE `CONTACT_REQUEST_RECEIVED` emitted to scout on ACCEPT.  
**Files:** `apps/api/src/modules/scoutlink/contact/contact.routes.ts`, `contact.service.ts`  
**Acceptance criteria:**

- [x] `PATCH /api/contact-requests/:id` with `{ action: 'ACCEPT' | 'REJECT', reason?: string }` updates `contact_request_status`
- [x] On `ACCEPT`: creates `communication_thread` record; emits SSE `CONTACT_REQUEST_RECEIVED` to scout's stream
- [x] On `REJECT`: scout receives rejection notification via `messages`; `reason` recorded in `communication_log`
- [x] `appendCommunicationLog` on every state transition with `event_type: CONTACT_ACCEPTED | CONTACT_REJECTED`
- [x] `assertContactRequestBelongsToClub` required before any mutation
- [x] `requireRole('ADMIN')`

**Out of scope:** Scout inbox UI (T-175), club contact management UI (T-176)  
**Pattern reference:** ticket cancellation flow in `apps/api/src/modules/events/tickets/`

### T-175 | [DONE] UI de inbox mediada para scouts (`ScoutInboxPage`)

**Context:** Scouts manage all outgoing contact requests and responses from a single inbox; no athlete PII is ever displayed.  
**Architectural context:** `[UI-A11Y]`; status badge with text label; no phone/email/CPF visible — club name and sport role only; `requireRole('SCOUT')`.  
**Files:** `apps/web/src/app/(scout)/inbox/page.tsx`, `ScoutInboxPage.tsx`  
**Acceptance criteria:**

- [x] Lists contact requests grouped by status: PENDING / ACCEPTED / REJECTED with text badge (not color only)
- [x] ACCEPTED requests show club name, response timestamp, and link to message thread
- [x] REJECTED requests show reason if provided by club
- [x] "Nova solicitação" button navigates to search (T-169)
- [x] Real-time updates via SSE `CONTACT_REQUEST_RECEIVED` → `queryClient.invalidateQueries(CONTACT_REQUESTS_QUERY_KEY)`

**Out of scope:** Contact request creation (T-172), billing (T-180)  
**Pattern reference:** `apps/web/src/app/(app)/messages/` list pattern

### T-176 | [DONE] UI de gestão de contatos para o clube

**Context:** Club ADMINs review and respond to incoming scout contact requests within the existing app shell.  
**Architectural context:** `[UI-A11Y]`; reject (danger) requires confirmation modal with optional reason field; one primary action per context; visible to `ADMIN` only.  
**Files:** `apps/web/src/app/(app)/athletes/contact-requests/page.tsx`, `ContactRequestsPage.tsx`  
**Acceptance criteria:**

- [x] Lists incoming requests with scout name, specialization, target athlete name — no scout CPF/phone displayed
- [x] Accept button (primary); Reject button (danger) shows confirmation modal with optional reason `<textarea>`
- [x] Badge per request: PENDING / ACCEPTED / REJECTED with text label
- [x] Real-time badge update via SSE invalidation
- [x] Visible to `ADMIN` only; other roles → 403

**Out of scope:** Contact request API (T-173), parental consent UI (T-177)  
**Pattern reference:** `apps/web/src/app/(app)/members/` table + modal pattern

---

## Icebox

> v3.5 "A Liga" (CampeonatOS) — Months 11–13. DO NOT start before v3.0 go/no-go criteria are met.
> Pre-requisite: ≥ 1 formal scout–club contact mediated; ≥ 3 scouts with active subscriptions after 60 days; zero LGPD incidents involving minors.
> Tasks T-185+ will be specced when v3.0 go/no-go is confirmed. Detailing earlier is waste — context will change.

- [ ] [T-185] Schema de campeonato (times, partidas, rodadas, árbitros) — `public` schema cross-tenant
- [ ] [T-186] Auth e onboarding de organizador de liga
- [ ] [T-187] Geração automática de tabela round-robin sem conflito de campo
- [ ] [T-188] Escalação digital com validação de elegibilidade em tempo real
- [ ] [T-189] Súmula digital offline-first (árbitro no celular)
- [ ] [T-190] Controle automático de suspensões por cartão acumulado
- [ ] [T-191] Portal público por campeonato (URL personalizada, tabela ao vivo)
- [ ] [T-192] Sistema de protesto com prazo rastreado e log imutável
- [ ] [T-193] Patrocínio digital no portal com métricas de visualização
- [ ] [T-194] Relatório final de campeonato exportável em PDF
- [ ] [T-195] Matriz RBAC v3.5 + testes E2E CampeonatOS
- [ ] [T-196] Checklist de deploy CampeonatOS

---

## Notes & Decisions

- **2026-05-11:** v2.5 go/no-go confirmed — all T-136→T-160 DONE. v3.0 "A Vitrine" sprint S16 unblocked.
- **2026-05-11:** Pre-requisite gate reminder — `assertLongitudinalDataSufficient` (T-163) must validate ≥ 180 days of `workload_metrics` before PREMIUM tier publish. Gate is per-athlete, not per-club.
- **Architecture:** SCOUT JWT has no `clubId`. Any path where `withTenantSchema` is called with a SCOUT-originated request is a security defect — must be caught in RBAC unit tests (T-182).
- **Security:** Minor hard stop in T-172 is unconditional — no role override, no admin bypass. `communication_log` records every blocked attempt. CI must assert this (T-182).
- **Architecture:** Freemium projection lives exclusively in `projectShowcase()` (T-179) — search (T-168), profile (T-170), and curation (T-171) import it. No inline gating logic in routes.
- **2026-04-22:** T-136 merged — v2.5 tenant DDL provisioned. Sprints 12–15 now unblocked.
- **2026-04-22:** v2.0 go/no-go criteria confirmed met (FisioBase + SAF Full 100% ✅).
- **Architecture:** ScoutLink (v3.0) must not launch before 6 months of BaseForte + FisioBase data in production. A showcase with no longitudinal data does not retain scouts.
- **Architecture:** `sse-bus.ts` EventEmitter approach is acceptable until > 1 process. At that point, swap to `redis.publish/subscribe` — the `sse-bus.ts` interface stays identical.
- **Architecture:** PostgreSQL schema-per-tenant scales to ~1,000 clubs. Plan RLS migration analysis at 300 active clubs.
- **Security:** `COACH` must never receive `clinicalNotes` or `diagnosis` from `medical_records` — projection is enforced in the service layer, not only at the route level.
