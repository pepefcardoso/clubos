<!-- docs/rpi-prompt.md -->

# RPI Prompt — ClubOS

# Task: T-{xxx}

## Role

Senior Software Engineer with full ClubOS codebase knowledge.
Execute Research → Plan → produce Implementation Guideline. No code until the guideline is approved.

---

## §0 — Load the Right Skill File (do this first, nothing else)

| Domain                                     | Load                                          |
| ------------------------------------------ | --------------------------------------------- |
| UI / component / styling                   | `docs/ui-ux-skills.md`                        |
| Auth / RBAC / crypto / webhooks            | `docs/security-skills.md`                     |
| DB schema / API / layers / payments / jobs | `docs/architecture-skills.md`                 |
| Two domains                                | Both; justify inline                          |
| Three+ domains                             | `docs/architecture-skills.md` + most specific |

**BLOCKER:** Loading all skill files. Each unnecessary file costs ~3–6k tokens.

---

## §1 — Research

1. **Locate files.** `grep`/`bash` before reading whole files. Descend import chain only if the answer isn't at the entry point. Never re-read files already in context.

2. **Check for reuse.** Before proposing any new type, utility, or helper:
   - Search `packages/shared-types/` — extend existing types if possible.
   - Search `apps/api/src/lib/` — reuse crypto, token, env, Redis helpers.
   - Gateways: via `GatewayRegistry` only.

3. **Identify active constraints.** Call out which apply to this task:

   | Tag          | Constraint                                                            |
   | ------------ | --------------------------------------------------------------------- |
   | `[FIN]`      | Integer cents — no float                                              |
   | `[ARCH-GW]`  | GatewayRegistry — no concrete import                                  |
   | `[SEC-WH]`   | Webhook pipeline (timestamp → HMAC → dedup → 200 → enqueue)           |
   | `[SEC-JOB]`  | BullMQ payload = IDs only, no PII                                     |
   | `[SEC-TEN]`  | withTenantSchema + assertValidClubId on every query                   |
   | `[SEC-OBJ]`  | assertXxxBelongsToClub in every single-resource handler               |
   | `[SEC-FILE]` | Magic bytes validation + randomUUID filename                          |
   | `[UI-BRL]`   | formatBRL() + font-mono on all monetary values                        |
   | `[UI-A11Y]`  | label+htmlFor, aria-label, badge with text                            |
   | `[PR-FIN]`   | touches charges/payments/webhooks/jobs → ≥ 2 approvals + 80% coverage |

4. **Cross-file coupling — check these sibling files:**

   | When editing…                           | Also check…                                                         |
   | --------------------------------------- | ------------------------------------------------------------------- |
   | `modules/charges/**`                    | `modules/payments/`, `jobs/charge-generation/`, `modules/webhooks/` |
   | `modules/payments/gateways/**`          | `GatewayRegistry` index, `PaymentGateway` interface, webhook worker |
   | `modules/webhooks/**`                   | BullMQ worker idempotency, `gateway_txid` dedup, HMAC validation    |
   | Any BullMQ job payload                  | Confirm IDs only — no PII                                           |
   | `lib/env.ts`                            | `.env.example`, Zod schema, `validateEnv()` call at bootstrap       |
   | `provisionTenantSchema`                 | All tenant DDL; ensure idempotency                                  |
   | `modules/medical/**` / `return_to_play` | Role guards, `data_access_log`                                      |
   | Any route handler with resource ID      | `assertXxxBelongsToClub` call                                       |
   | `sse-bus.ts`                            | React Query invalidation keys in the matching web module            |

---

## §2 — Plan

Output a decomposition plan before any code. Max 10 steps.

```

PLAN — T-{xxx}: [Task name]
Scope: [single module | cross-module | full-stack]
Skill files loaded: [list]
Active constraints: [from §1, only those that apply]
PR gate: [yes — ≥ 2 approvals | no]

Steps:

1. [path/to/file] — action
2. [path/to/file] — action
   ...

Testing:
Unit: [service methods to cover]
Integration: [endpoints to cover]
Security: [one negative test per RBAC row / tenant isolation invariant]

```

If the task spec is already fully detailed, produce the plan immediately — no clarifying questions unless a constraint collision makes the spec ambiguous.

---

## §3 — Deliverables

### 3.1 — Implementation Guideline

# Guideline — T-{xxx}: [Task name]

**Sprint:** S{xx} | **Effort:** {x}d | **PR gate:** [≥ 2 approvals | standard]

## Active Constraints

- `[TAG]` one-line explanation

## Affected Paths

- `path/to/file` — what changes

## Cross-File Coupling

- `path/to/sibling` — why it must be checked

## Implementation Notes

### [API | DB | UI | Job | Security — one section per concern]

[Code snippets for non-obvious logic only — max 30 lines]
[Cite constraints inline: `// cents-only [FIN]`, `// IDs only [SEC-JOB]`]

## Testing Checklist

- [ ] Happy path: [description]
- [ ] Edge case: [per documented business rule]
- [ ] Security: [one negative test per RBAC row / tenant isolation invariant]
- [ ] Coverage ≥ 80% if [PR-FIN] applies

## Completion Checklist

- [ ] `pnpm lint` → zero warnings
- [ ] `pnpm tsc --noEmit` → clean
- [ ] `pnpm vitest run` → all pass
- [ ] No `any`, no commented-out code, no `TODO` without ticket ref
- [ ] `.env.example` updated if new env vars added
- [ ] Two reviewers assigned if [PR-FIN]

````

### 3.2 — Context Manifest

```
CONTEXT MANIFEST — T-{xxx}

Core files to read:
  apps/api/src/modules/{module}/{module}.service.ts
  apps/api/src/modules/{module}/{module}.routes.ts
  apps/api/src/lib/env.ts                            ← if adding env vars
  apps/api/src/jobs/{job}.worker.ts                  ← if touching BullMQ
  packages/shared-types/src/{domain}.schemas.ts      ← check before new types

Skill files loaded (do not re-read):
  docs/{skill}.md

Reference (do not re-read unless diff needed):
  apps/api/src/modules/payments/gateways/index.ts    ← GatewayRegistry
  apps/api/src/lib/tenant.ts                         ← withTenantSchema
  CLAUDE.md §Hard Rules
  CLAUDE.md §RBAC
```

---

## Output Rules

- Output PLAN → Guideline → Context Manifest in that order.
- No prose wrap after delivering output ("I have created…" is forbidden).
- No recap of requirements already given.
- Cite constraints inline in snippets — not in prose.
- **Diff-first for edits** — show only changed lines + 3 lines context. Full file only for new files or when > 40% changes (state this explicitly).
- Batch independent reads in a single step. Sequential only when there's a real dependency.
````
