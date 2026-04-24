---
name: context-efficiency
description: >
  Optimize token usage for every ClubOS development task. Load this FIRST — before any other
  skill file, before reading any file, before writing any code. Applies to code generation,
  feature implementation, bug fixing, code review, and architectural changes.
---

# ClubOS — Context Efficiency Skill

---

## 1. LOAD ONLY WHAT THE TASK NEEDS

### Skill Loading Decision Tree

Stop at the first match:

```
Task involves UI / component / styling?        → load ui-ux-skills.md ONLY
Task involves auth / tokens / RBAC / crypto?   → load security-skills.md ONLY
Task involves DB schema / API / layer design?  → load architecture-skills.md ONLY
Task involves deployment / env vars / CI?      → load infra.md ONLY
Task involves backlog priority or scope?       → load moscow.md ONLY
Task spans two domains?                        → load the two relevant files; justify inline
Task spans three or more domains?             → load architecture-skills.md + the most specific one
```

**BLOCKER:** Loading all skill files regardless of domain. Each unnecessary file costs ~3–6k tokens.

### File Reading Rules

| Situation                                | Rule                                                           |
| ---------------------------------------- | -------------------------------------------------------------- |
| Content already in conversation context  | NEVER re-read it; reference by name                            |
| Need one function / type from a file     | Read only the relevant lines (`view_range`)                    |
| Need to check if a pattern exists        | Use `grep`/`bash` first; read the whole file only if needed    |
| Dependency chain (A imports B imports C) | Read entry point first; descend only if the answer isn't there |

---

## 2. TASK DECOMPOSITION BEFORE EXECUTION

Write a plan before touching any file. Keep it to ≤ 10 atomic steps.

```
PLAN — [Task name]
Scope: [single module | cross-module | full-stack]
Skill files needed: [list]
Steps:
  1. [packages/db/migrations/] add column X to table Y
  2. [apps/api/modules/Z/Z.service.ts] add method createX()
  3. [apps/api/modules/Z/Z.routes.ts] add POST /api/zs handler
  4. [apps/web/app/(app)/zs/page.tsx] add page component
  5. [apps/api/modules/Z/Z.service.test.ts] unit tests for createX()
Blockers: [arch/security invariants that constrain the approach]
```

Output the plan first. If the spec is already detailed, proceed without waiting — but still print the plan at the top.

---

## 3. DIFF-FIRST EDITING

- Use **`str_replace`** (targeted diff) for all edits to existing files.
- Show only changed lines + 3 lines of context above and below.
- Rewrite the full file only if > 40% of it changes — state this explicitly.

**BLOCKER:** Outputting a 200-line file when 8 lines changed.

| Change type                   | Max lines to output  |
| ----------------------------- | -------------------- |
| Add a field to an interface   | 5–10                 |
| Add a method to a service     | 15–30                |
| Add a route handler           | 20–40                |
| Add a full new page component | Full file acceptable |
| Bug fix / rename              | Diff only            |

---

## 4. CODE GENERATION DISCIPLINE

- Include only imports actually used — no "might need" imports.
- Before defining a new type, check `packages/shared-types/`. Extend if a close variant exists.
- **BLOCKER:** Boilerplate comments, empty catch blocks, `console.log` statements, or `TODO` without a ticket ref in committed code.

### Test Generation

- One happy-path test per public method.
- One test per documented edge case or business rule.
- One negative test per security invariant (auth, tenant isolation, RBAC).
- No exhaustive permutation tests unless a coverage CI gate fails.

---

## 5. RESPONSE DISCIPLINE

- No prose wrap after delivering code ("I have created the file above…").
- No recap of requirements you were given.
- No restatements of skill file content already in context.
- Cite active constraints inline, not in prose: `// cents-only per FINANCIAL_CONSTRAINTS`
- Target length: diff + plan for feature work; 1–3 sentences for factual questions; root cause (1 sentence) + diff for bugs.

---

## 6. BATCHING & RESUMABILITY

**Batch independent tool calls:**

```
✅ read file A + read file B + run grep   (all independent)
❌ read schema → write service            (sequential: dependency exists)
```

**If a task has 5+ steps and context is large**, output a resumability summary before generating code:

```
CONTEXT SUMMARY:
- Task: [one line]
- Completed: [steps done]
- Next: [next step]
- Key constraints active: [e.g. cents-only, schema-per-tenant, HMAC-before-enqueue]
- Files read this session: [list paths]
```

---

## QUICK REFERENCE

```
START
  1. Identify domain → load ONE skill file (§1)
  2. Write decomposition plan ≤ 10 steps (§2)

CODING
  3. Diff-first for edits; full file only for new files (§3)
  4. Reuse shared-types before defining new types (§4)
  5. Batch independent tool calls (§6)

END
  6. No prose wrap; cite constraints inline (§5)
  7. Write CONTEXT SUMMARY if context is large (§6)
```
