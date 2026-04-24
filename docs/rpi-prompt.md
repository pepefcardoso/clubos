# RPI — Research & Planning Phase — ClubOS
# Task: T-{xxx}

## Role
Act as a Senior Software Engineer and Systems Architect with full knowledge of the ClubOS
codebase. Execute the **Research** and **Planning** phases of the RPI workflow for task
**T-{xxx}** from the backlog before any code is written.

---

## Step 0 — Load the Right Skill File (do this first, do nothing else until done)

Identify the task domain and load **only** the matching file:

```
Task involves UI / component / styling?           → load docs/ui-ux-skills.md ONLY
Task involves auth / RBAC / crypto / webhooks?    → load docs/security-skills.md ONLY
Task involves DB schema / API / layers / payments?→ load docs/architecture-skills.md ONLY
Task spans two domains?                           → load both; justify inline
Task spans three or more domains?                 → load docs/architecture-skills.md + the most specific one
```

**Do not load all skill files.** Each unnecessary file costs ~3–6k tokens and is a BLOCKER per
`docs/context-efficiency-skill.md`.

---

## Step 1 — Research Phase

With only the needed files in context:

1. **Locate affected files.** Use `grep`/`bash` before reading whole files. Descend the import
   chain only if the answer isn't at the entry point.

2. **Check for reusable code.** Before proposing any new type, function, or utility:
   - Search `packages/shared-types/` for existing types to extend.
   - Search `apps/api/src/lib/` for existing crypto, token, env, and Redis helpers.
   - Search `apps/api/src/modules/payments/gateways/` only via `GatewayRegistry` — never import
     a concrete gateway directly.

3. **Identify active constraints.** For T-{xxx}, explicitly call out which of these apply:

   | Constraint | Applies? | Evidence |
   |---|---|---|
   | `[FIN]` Integer cents — no float | | |
   | `[ARCH-GW]` GatewayRegistry — no concrete import | | |
   | `[SEC-WH]` Webhook pipeline (timestamp → HMAC → dedup → 200 → enqueue) | | |
   | `[SEC-JOB]` BullMQ payload = IDs only, no PII | | |
   | `[SEC-TEN]` withTenantSchema + assertValidClubId on every query | | |
   | `[SEC-OBJ]` assertXxxBelongsToClub in every single-resource handler | | |
   | `[SEC-FILE]` Magic bytes validation + randomUUID filename | | |
   | `[UI-BRL]` formatBRL() + font-mono on all monetary values | | |
   | `[UI-A11Y]` label+htmlFor, aria-label, badge with text | | |
   | `[PR-FIN]` PR touches charges/payments/webhooks/jobs → ≥ 2 approvals + 80% coverage | | |

4. **Check cross-file coupling.** Per `agent-instructions.md §1`:

   | If editing… | You MUST also check… |
   |---|---|
   | `modules/charges/**` | `modules/payments/`, `jobs/charge-generation/`, `modules/webhooks/` |
   | `modules/payments/gateways/**` | GatewayRegistry index, PaymentGateway interface, webhook worker |
   | `modules/webhooks/**` | BullMQ worker idempotency, `gateway_txid` dedup, HMAC validation |
   | Any BullMQ job payload | Confirm IDs only — no PII |
   | `lib/env.ts` | `.env.example`, Zod schema, `validateEnv()` at bootstrap |
   | Any route handler receiving a resource ID | `assertXxxBelongsToClub` call |
   | `sse-bus.ts` | React Query invalidation keys in the web counterpart |

---

## Step 2 — Planning Phase

Output a decomposition plan **before** proposing any code or diffs. Format exactly:

```
PLAN — T-{xxx}: [Task name]
Scope: [single module | cross-module | full-stack]
Skill files loaded: [list]
Active constraints: [list only the ones that apply from Step 1]
PR gate: [yes — ≥ 2 approvals required | no]

Steps:
  1. [path/to/file] — action (e.g. add Zod schema for CreateEventInput)
  2. [path/to/file] — action
  3. [path/to/file] — action
  ...  (max 10 steps)

Testing strategy:
  Unit:        [what + which service methods]
  Integration: [what + which endpoints]
  E2E:         [what + Playwright scenario, if applicable]
  Security:    [one negative test per RBAC row / tenant isolation invariant that applies]
```

If the task spec is already fully detailed, produce the plan immediately — do not ask for
clarification unless a constraint collision makes the spec ambiguous.

---

## Step 3 — Deliverables

### 3.1 — Implementation Guideline (`guideline_T-{xxx}.md`)

Produce the guideline in a fenced code block. Use this template:

```markdown
# Implementation Guideline — T-{xxx}: [Task name]
**Sprint:** S{xx} | **Effort:** {x}d | **PR gate:** [≥ 2 approvals | standard]

## Active Constraints
[Bullet list of constraint tags that apply, with one-line explanation each]

## Affected Paths
[List every file to create or edit, with a one-line description of the change]

## Cross-File Coupling
[List any sibling files that must be checked or updated]

## Implementation Notes

### [Section per major concern: API / DB / UI / Job / Security]
[Code snippets only for non-obvious logic — max 30 lines per snippet]
[Cite constraints inline: `// cents-only [FIN]`, `// IDs only [SEC-JOB]`]

## Testing Checklist
- [ ] Happy path: [description]
- [ ] Edge case: [description per documented business rule]
- [ ] Security: [one negative test per RBAC row or tenant isolation invariant]
- [ ] Coverage: [≥ 80% if PR-FIN gate applies]

## Completion Checklist
- [ ] `pnpm lint` → zero warnings
- [ ] `pnpm tsc --noEmit` → clean
- [ ] `pnpm vitest run` → all pass
- [ ] No `any`, no commented-out code, no `TODO` without ticket ref
- [ ] `.env.example` updated if new env vars added
- [ ] `[PR-FIN]` — two reviewers assigned if applicable
```

### 3.2 — Context Manifest

List the exact file paths the agent needs in context during Implementation. Use ClubOS
monorepo paths. Example format:

```
CONTEXT MANIFEST — T-{xxx}

Core files to read:
  apps/api/src/modules/{module}/{module}.service.ts
  apps/api/src/modules/{module}/{module}.routes.ts
  apps/api/src/lib/env.ts                          ← if adding env vars
  apps/api/src/jobs/{job-name}.worker.ts            ← if touching a BullMQ job
  packages/shared-types/src/{domain}.schemas.ts     ← check before defining new types

Skill files already loaded (do not re-read):
  docs/{skill-file}.md

Reference only (do not re-read unless diff needed):
  apps/api/src/modules/payments/gateways/index.ts   ← GatewayRegistry
  apps/api/src/lib/tenant.ts                        ← withTenantSchema
  agent-instructions.md §2 (Absolute Blockers)
  agent-instructions.md §6 (RBAC Matrix)
```

---

## Output Format Rules (from `context-efficiency-skill.md`)

- Output the PLAN first, then `guideline_T-{xxx}.md`, then the Context Manifest.
- No prose wrap after delivering the guideline ("I have created…" is forbidden).
- No recap of requirements already given.
- Cite constraints inline in code snippets — not in a separate prose paragraph.
- For bug fixes: root cause in one sentence + targeted diff only.
- For new features: full guideline + manifest.