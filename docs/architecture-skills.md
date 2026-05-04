# ClubOS v1.0 — Agent Skills: Architecture

> Security invariants (auth, tokens, RBAC, webhooks, data protection, HTTP headers) live in
> `security-skills.md`. This file covers architecture, code style, payments, and async jobs only.

---

## CODE_STYLE & GIT

### Formatting & Tooling

- MUST enforce Prettier: `printWidth: 100`, `singleQuote: true`, `semi: true`.
- MUST enforce ESLint (TypeScript + import plugins). **Zero warnings** permitted in CI.
- MUST use `strict` mode in `tsconfig.json`.
- MUST use Vitest for unit/integration tests; Playwright for critical E2E paths.

### TypeScript Prohibitions

| BLOCKER                                  | Alternative                                          |
| ---------------------------------------- | ---------------------------------------------------- |
| Explicit `any`                           | Define correct type or use `unknown` with type guard |
| `@ts-ignore` without explanatory comment | Fix the type or document the reason inline           |

### Git Branch Strategy

| Branch                | Purpose        | Rules                                               |
| --------------------- | -------------- | --------------------------------------------------- |
| `main`                | Production     | Protected. Merge via approved PR only. Auto-deploy. |
| `develop`             | CI integration | Base for feature branches. Auto-deploy to staging.  |
| `feature/TICKET-desc` | New feature    | Always from `develop`                               |
| `fix/TICKET-desc`     | Bug fix        | From `develop`; from `main` for critical hotfix     |
| `release/X.Y`         | Release prep   | From `develop`; merge to `main` + semantic tag      |

### Commit Convention — Conventional Commits

```
<type>(<scope>): <description>

Valid types: feat | fix | docs | style | refactor | test | chore
```

## ARCH_INVARIANTS

### Layer Separation

```
[Frontend Web]  ──┐
                  ├──▶  API (Fastify)  ──▶  PostgreSQL
[App Mobile]    ──┘         │
                             └──▶  Redis / PaymentGateway / WhatsApp
```

- **SECURITY_BLOCKER:** Frontend MUST NOT access the database directly. All reads/writes go through the API.
- **ARCH_BLOCKER:** Business logic MUST reside in the backend. Frontend only renders and submits data.
- MUST have a single API consumed by both web and mobile.

### Multi-Tenancy — Schema-Per-Tenant

- Strategy: `schema-per-tenant` in PostgreSQL. Each club uses schema `clube_{id}`.
- Schema `public` contains only the master registry of clubs and global users.
- **SECURITY_BLOCKER:** Every authenticated request MUST extract `club_id` from the JWT and call `withTenantSchema` before any query. See `security-skills.md: MULTI_TENANCY_ISOLATION`.
- **SECURITY_BLOCKER:** Cross-schema JOINs between different club schemas are strictly FORBIDDEN.
- **SECURITY_BLOCKER:** Returning one tenant's data in another tenant's authenticated request is strictly FORBIDDEN.

### API Design Rules

- MUST use REST with kebab-case plural resources: `/api/members`, `/api/charges`.
- MUST return standardised error shape: `{ statusCode, error, message }`.
- MUST paginate all list endpoints with `page` and `limit` query parameters.
- MUST validate all route bodies and query params with **Zod**.
- MUST version via path prefix when required: `/api/v2/...` — NOT via headers.

---

## PAYMENT_ABSTRACTION

### Gateway Resolution — Mandatory Flow

```
ChargeService
    │
    │  GatewayRegistry.forMethod('PIX')   ← or .get(params.gateway)
    ▼
PaymentGateway          ← interface (sole entry point)
    │
    ├── AsaasGateway    ← concrete (Asaas)
    ├── PagarmeGateway  ← (future)
    └── StripeGateway   ← (future)
```

### ARCH_BLOCKERs

| BLOCKER                                                                                 | Correct Alternative                                          |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Importing `AsaasGateway` (or any concrete gateway) outside `modules/payments/gateways/` | Use `GatewayRegistry.get()` or `GatewayRegistry.forMethod()` |
| Adding provider-specific fields to the DB schema                                        | Use `gatewayMeta` (JSONB) on the `Charge` entity             |
| Processing a webhook synchronously                                                      | See `security-skills.md: WEBHOOK_SECURITY`                   |

### MUST Requirements for New Gateways

- MUST implement the full `PaymentGateway` interface, including `parseWebhook` with HMAC-SHA256 signature validation.
- MUST register in `gateways/index.ts` at application bootstrap.

### Offline Methods (CASH, BANK_TRANSFER)

- `ChargeService` detects offline method → creates `Charge` with `gatewayName = null`, `externalId = null`.
- Payment created manually by treasurer via dedicated endpoint. No gateway involved.

---

## FINANCIAL_CONSTRAINTS

### Monetary Value Invariant

- **ARCH_BLOCKER:** All monetary values MUST be stored and processed as **integers in cents**.
- **ARCH_BLOCKER:** Using `float` for any monetary value is strictly FORBIDDEN.
- Display formatting (`R$ 1.490,00`) MUST happen only in the frontend via `Intl.NumberFormat`.

### Payment Immutability

- A confirmed payment MUST NEVER be deleted.
- Reversal is modelled as a cancellation with a recorded reason.

### Code Review Requirements

- **MUST have ≥ 2 approvals** on any PR touching: `charges`, `payments`, `webhooks`, `jobs`.
- **MUST maintain ≥ 80% test coverage** in those modules (enforced in CI via Vitest).

### Audit

- `audit_log` entries for financial operations are **immutable** — MUST NOT be deleted.

### Data Protection

- Member CPF and phone MUST be encrypted at rest. See `security-skills.md: DATA_PROTECTION`.

---

## ASYNC_JOBS

### BullMQ Rules

- **MUST** be idempotent: reprocessing the same job MUST NOT generate duplicate charges or messages.
- **MAX concurrency: 5** for charge jobs (avoids overloading the active gateway).
- **WhatsApp rate limit: 30 messages/min per club** via Redis sliding window.
- Every job MUST record its result (success / failure / retry) in `messages` or `audit_log`.
- Job payload rules (PII, ID-only policy): see `security-skills.md: ASYNC_JOBS_SECURITY`.

### Charge Failure Retry Policy

- Backoff schedule (exponential): **1h → 6h → 24h**.
- After 3 failed attempts → status `PENDING_RETRY` + visible alert on club dashboard.

### WhatsApp Fallback

- After 2 failed WhatsApp delivery attempts → automatic fallback to **email via Resend**.

### Error Observability

- MUST NOT have silent failures. Every caught exception MUST be logged to **Sentry**.

---

## RELIABILITY

- Uptime target: **≥ 99.5%** monthly for the charge flow.
- MUST use zero-downtime deployments.
- PostgreSQL automated backups: **7-day** retention.

---

## ARCH-ONLY PROHIBITION TABLE

> Security prohibitions live in `security-skills.md: PROHIBITED_PATTERNS`.

| FORBIDDEN                                                       | CORRECT ALTERNATIVE                                   |
| --------------------------------------------------------------- | ----------------------------------------------------- |
| Explicit `any` in TypeScript                                    | Correct type or `unknown` with type guard             |
| `@ts-ignore` without comment                                    | Fix type or document reason                           |
| Committing `.env`                                               | Keep `.env.example` updated                           |
| `float` for monetary values                                     | Integer cents                                         |
| Frontend accessing DB directly                                  | All operations via API                                |
| Cross-schema tenant queries                                     | Operate only within the authenticated tenant's schema |
| Importing concrete gateway outside `modules/payments/gateways/` | `GatewayRegistry.get()` or `.forMethod()`             |
| Provider-specific field in DB schema                            | `gatewayMeta` (JSONB) on `Charge`                     |
| Deleting a confirmed payment                                    | Cancel with recorded reason                           |
| `TODO`/`FIXME` without ticket ref on `main`/`develop`           | `// TODO: [TICKET-ID] — description`                  |
| Commented-out dead code                                         | Delete — use `git log` for history                    |
| JSDoc outside `shared-types/` or `PaymentGateway` interface     | Remove; rely on types and naming                      |
