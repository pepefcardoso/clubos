# Architecture Guidelines — ClubOS v1.0

> Regras de desenvolvimento, fluxo de trabalho e ferramentas do time.

---

## Style Guide de Código

### Convenções Gerais

| Categoria         | Regra                                                                            |
| ----------------- | -------------------------------------------------------------------------------- |
| Idioma do código  | Inglês para tudo: variáveis, funções, comentários, commits, branches, PRs        |
| Idioma do produto | Português para strings de UI, mensagens de erro e templates de WhatsApp          |
| Formatação        | Prettier — `printWidth: 100`, `singleQuote: true`, `semi: true`                  |
| Linting           | ESLint + plugin TypeScript + plugin import. Zero warnings permitidos em CI.      |
| Tipagem           | Strict mode no tsconfig. Proibido: `any` explícito, `@ts-ignore` sem comentário. |
| Testes            | Vitest para unit/integration. Playwright para E2E críticos.                      |
| Cobertura mínima  | ≥ 80% em módulos de domínio financeiro (charges, payments, webhooks, jobs).      |

### Nomenclatura

| Contexto                     | Padrão                  | Exemplo                                                |
| ---------------------------- | ----------------------- | ------------------------------------------------------ |
| Variáveis / Funções          | camelCase               | `generateCharge`, `memberStatus`, `resolveGateway`     |
| Classes / Tipos / Interfaces | PascalCase              | `ChargeService`, `PaymentGateway`, `CreateChargeInput` |
| Constantes                   | SCREAMING_SNAKE_CASE    | `MAX_RETRY_ATTEMPTS`, `DEFAULT_PAYMENT_METHOD`         |
| Arquivos de componente       | PascalCase              | `MemberCard.tsx`, `ChargeTable.tsx`                    |
| Arquivos de service/util     | kebab-case              | `charge-service.ts`, `format-currency.ts`              |
| Arquivos de gateway          | kebab-case com sufixo   | `asaas.gateway.ts`, `pagarme.gateway.ts`               |
| Rotas de API                 | REST kebab-case, plural | `GET /api/members`, `POST /api/charges`                |
| Rotas de webhook             | kebab-case paramétrico  | `POST /webhooks/:gateway`                              |
| Variáveis de ambiente        | SCREAMING_SNAKE_CASE    | `DATABASE_URL`, `ASAAS_API_KEY`                        |

## Code Comments Policy

> Baseado nos princípios de Clean Code (Robert C. Martin).
> Regras marcadas com `[OBRIGATÓRIO]` são verificadas em code review e bloqueiam merge.

---

### Core Philosophy — The Comment as a Failure Signal

A comment is not inherently good documentation. **A comment is, most often,
a failure to express intent clearly in the code itself.**

Every time you write a comment to explain _what_ the code does, treat it as a
red flag: the code was not clear enough. The correct response is to refactor
the code — rename the variable, extract the function, introduce an explaining
constant — until the comment becomes unnecessary.

```typescript
// ❌ Comment compensating for a poor name
// Check if the employee is eligible for full benefits
if (employee.flags & 0x04 && employee.age > 65) { ... }

// ✅ Comment eliminated by expressive code
const isEligibleForFullBenefits = employee.isPartTime && employee.isRetirementAge;
if (isEligibleForFullBenefits) { ... }
```

> **The only codebase that never suffers from comment rot is one that relies
> on the code — not the prose — to communicate.**

Code changes. Comments drift. The divergence between a stale comment and the
actual behavior it describes is **actively more dangerous than having no
comment at all** — it misleads the next developer at exactly the moment they
need clarity most.

---

### `[OBRIGATÓRIO]` Forbidden Comment Patterns

The following patterns are **banned** and must be flagged and removed during
code review. A PR that introduces them will not be approved.

#### 1. Redundant / Noise Comments

Comments that restate what the code already says with perfect clarity.

```typescript
// ❌ Restates the obvious
// Increment the retry count by one
retryCount++;

// ❌ Parrots the function name
// Returns the member's full name
function getMemberFullName(member: Member): string { ... }

// ❌ Narrates a type the type system already enforces
// chargeAmountCents is a number
const chargeAmountCents: number = plan.priceCents;
```

#### 2. Commented-Out Code (`[OBRIGATÓRIO]`)

Dead code commented out "just in case" is **strictly forbidden**. It creates
noise, confuses intent, and decays silently. Version control (Git) is the
safety net — dead code belongs in history, not in the working tree.

```typescript
// ❌ A graveyard of indecision
// const legacyGateway = new AsaasGatewayV1(config);
// legacyGateway.createCharge(input);
const charge = await GatewayRegistry.forMethod("PIX").createCharge(input);

// ❌ An entire function preserved "for reference"
// async function generateChargeV1(memberId: string) {
//   const member = await prisma.member.findUnique({ ... });
//   ...
// }
```

If the code was worth keeping, open a branch. If it was not, delete it.

#### 3. Journal / Changelog Comments

Git provides authorship, timestamps, diffs, and commit messages. Inline
journals are redundant and always fall out of sync.

```typescript
// ❌ Inline changelog
// 2024-03-10 — Alice: added PIX fallback
// 2024-07-22 — Bob: extended to support Pagarme
// 2025-01-05 — Carol: removed Pagarme, reverted to Asaas
async function resolveGateway(method: PaymentMethod): Promise<PaymentGateway> { ... }
```

Use `git log -p -- <file>` instead.

#### 4. Positional / Section Divider Comments

Artificial separators that compensate for a function or module that is too
large and should be split.

```typescript
// ❌ Dividers signal that a function is doing too much
async function processWebhookEvent(event: WebhookEvent) {
  // ─────────── Validation ───────────
  ...
  // ─────────── Database Update ──────
  ...
  // ─────────── Notification ─────────
  ...
}

// ✅ The correct fix: split the concerns into named functions
async function processWebhookEvent(event: WebhookEvent) {
  await validateWebhookSignature(event);
  await persistPaymentConfirmation(event);
  await notifyClubDashboard(event);
}
```

#### 5. Misleading / Aspirational Comments

A comment that describes behaviour the code does _not yet_ implement is a lie.

```typescript
// ❌ The function does not validate the signature — the comment says it does
// Validates HMAC-SHA256 signature before processing
async function handleWebhook(payload: Buffer) {
  const event = JSON.parse(payload.toString()); // no validation
  await enqueueWebhookEvent(event);
}
```

If the behaviour is missing, open a ticket. Do not document it into existence.

---

### Necessary Evils — When Comments Are Permitted

These are the **only** categories of comments that should appear in the
codebase. Each must be genuinely necessary — not a convenience or a habit.

#### 1. Legal Headers

Required license or copyright notices at the top of a file. Keep them short;
reference an external document rather than embedding full license text.

```typescript
// Copyright (c) 2025 ClubOS Ltda. All rights reserved.
// Licensed under the ClubOS Proprietary License — see LICENSE.md
```

#### 2. Explanation of Intent (the _Why_, Never the _What_)

Acceptable when the code itself is correct and clear, but the _reason for the
decision_ is non-obvious and important for future maintainers. The comment
explains business logic, a legal constraint, or a deliberate trade-off — not
the mechanics of the code.

```typescript
// PIX QR codes expire after 24 hours per Banco Central regulations
// (Resolução BCB nº 1 — Art. 38). Generating them at dispatch time
// rather than at charge creation prevents serving expired QR codes
// in the D-3 reminder flow.
const qrCode = await gateway.createCharge({ ...input, expiresInHours: 24 });
```

```typescript
// CPF uniqueness is enforced at the application layer rather than
// via a DB UNIQUE constraint because pgcrypto's pgp_sym_encrypt
// produces a different ciphertext for the same plaintext on every
// call — making byte-level uniqueness checks at the DB layer impossible.
// See: design-docs.md § Criptografia de CPF e Telefone
const existing = await findMemberByCpf(prisma, input.cpf);
if (existing) throw new ConflictError("CPF já cadastrado.");
```

#### 3. Warning of Consequences

When calling a piece of code incorrectly would produce severe, non-obvious
consequences — data loss, a billable external API call, an irreversible
operation — a targeted warning is justified.

```typescript
// WARNING: This operation posts a live charge to the Asaas production API.
// Do NOT call this function in unit tests — use AsaasGatewayMock instead.
// Do NOT call without a prior hasExistingCharge() check (creates duplicate billing).
async function dispatchChargeToGateway(charge: Charge): Promise<void> { ... }
```

#### 4. Clarification of Non-Obvious Behaviour in External Contracts

When interfacing with a third-party API, regex, or algorithm whose behaviour
is genuinely unintuitive, a brief note with a reference URL is acceptable.

```typescript
// Asaas returns PAYMENT_RECEIVED for instant PIX credit
// and PAYMENT_CONFIRMED ~60 s later after settlement.
// Both events must trigger handlePaymentReceived — only the first
// will clear the idempotency check and produce a Payment row.
// Ref: https://docs.asaas.com/docs/notificacoes-de-cobrancas
case 'PAYMENT_RECEIVED':
case 'PAYMENT_CONFIRMED':
  await handlePaymentReceived(prisma, clubId, event);
  break;
```

#### 5. Public API / Function Contract (JSDoc — Restricted Scope)

JSDoc is permitted **only** on exported functions in `packages/shared-types/`
and on the `PaymentGateway` interface methods. Everywhere else it is
redundant with TypeScript types and self-documenting names.

```typescript
/**
 * Converts a monetary amount from display format to storage format.
 * @param displayAmount - Value as typed by the user, e.g. `"149.90"`
 * @returns Integer cents, e.g. `14990`
 * @throws {ValidationError} If the input cannot be parsed as a valid BRL amount.
 */
export function parseToCents(displayAmount: string): number { ... }
```

---

### Maintenance Policy — The Rot Doctrine

> **An outdated comment is an active bug. Treat it as one.**

The following rules govern comment maintenance:

| Situation                                                        | Required Action                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------------------------ |
| You change code that a comment describes                         | Update or delete the comment in the **same commit**                |
| You read a comment that no longer matches the code               | Delete or fix it immediately, even if it is not your feature       |
| You cannot tell whether a comment is still accurate              | Delete it — if the intent was important, it will surface in review |
| A comment can be replaced by a better name or extracted function | Refactor and delete the comment                                    |
| A comment is marked `TODO` or `FIXME` without a ticket reference | Delete it or replace with `// TODO: [TICKET-ID] — description`     |

`TODO` and `FIXME` comments without a linked ticket are **forbidden** in the
`main` and `develop` branches. Unresolved `TODO`s must be resolved or
promoted to tickets before a feature branch is merged.

```typescript
// ❌ Banned on main/develop — no accountability, no resolution path
// TODO: handle Pagarme timeout edge case

// ✅ Acceptable — traceable and owned
// TODO: [CLUB-412] — add Pagarme timeout fallback to PIX estático
```

---

### Summary Cheat-Sheet

| Comment Type                           | Allowed?                 | Action if Found               |
| -------------------------------------- | ------------------------ | ----------------------------- |
| Restates what the code says            | ❌                       | Delete                        |
| Commented-out dead code                | ❌ `[OBRIGATÓRIO]`       | Delete immediately            |
| Changelog / journal entry              | ❌                       | Delete — use `git log`        |
| Section divider (`// ─── ...`)         | ❌                       | Extract into named functions  |
| Misleading or aspirational             | ❌                       | Delete — open a ticket        |
| Legal header                           | ✅                       | Keep                          |
| Explains _why_ (business/legal intent) | ✅                       | Keep — review on every change |
| Warning of severe consequence          | ✅                       | Keep — must stay accurate     |
| Clarifies non-obvious 3rd-party API    | ✅                       | Keep with reference URL       |
| JSDoc on shared public API             | ✅ (restricted scope)    | Keep — update with signature  |
| `TODO` without ticket reference        | ❌ (on `main`/`develop`) | Resolve or link a ticket      |

---

## Fluxo de Git

### Estratégia de Branches

| Branch        | Propósito             | Regras                                                         |
| ------------- | --------------------- | -------------------------------------------------------------- |
| `main`        | Código em produção    | Protegida. Merge apenas via PR aprovado. Deploy automático.    |
| `develop`     | Integração contínua   | Base para feature branches. Deploy automático em staging.      |
| `feature/XYZ` | Nova funcionalidade   | Sempre a partir de `develop`. Nome: `feature/TICKET-descricao` |
| `fix/XYZ`     | Correção de bug       | A partir de `develop` (ou `main` em hotfix crítico)            |
| `release/X.Y` | Preparação de release | A partir de `develop`; merge em `main` + tag semântica         |

### Padrão de Commits — Conventional Commits

```
# Formato
<type>(<scope>): <description>

# Tipos válidos
feat     → nova feature
fix      → correção de bug
docs     → documentação
style    → formatação (sem mudança de lógica)
refactor → refatoração sem nova feature nem fix
test     → adição/ajuste de testes
chore    → build, deps, CI

# Exemplos
feat(charges): add pix webhook handler with HMAC validation
feat(payments): add pagarme gateway implementation
fix(members): correct overdue status calculation on timezone edge
feat(whatsapp): add D-3 reminder job with rate limiting
chore(ci): add vitest coverage threshold to github actions
refactor(payments): extract gateway abstraction layer
```
