\# Claude Workflow Guide

\> A reference guide for working efficiently with Claude on large fullstack projects.  
\> Keep this file alongside your project docs. Paste relevant sections at the start of each session.

\---

\#\# Table of Contents

1\. \[What is global vs per-project\](\#1-what-is-global-vs-per-project)  
2\. \[Session workflow — step by step\](\#2-session-workflow--step-by-step)  
3\. \[Settings → User Preferences\](\#3-settings--user-preferences)  
4\. \[CLAUDE.md — project context file\](\#4-claudemd--project-context-file)  
5\. \[brief.md — session starter\](\#5-briefmd--session-starter)  
6\. \[Phase prompts\](\#6-phase-prompts)  
7\. \[Task format\](\#7-task-format)  
8\. \[backlog.md structure\](\#8-backlogmd-structure)

\---

\#\# 1\. What is global vs per-project

| Artifact | Scope | Notes |  
|---|---|---|  
| User Preferences | Global | Set once in Settings. Never changes. |  
| Phase Prompts | Global | Generic enough for any project. Reuse as-is. |  
| Task Format | Global | Same skeleton every time. Just fill in the fields. |  
| \`CLAUDE.md\` | Per project | Architecture, standards, patterns, and constraints. The only file that really changes. |  
| \`backlog.md\` | Per project | Evolves with the project. |  
| \`brief.md\` | Per project | Fixed header per project. Only update "current task" each session. |

\*\*Recommended structure per project:\*\*

\`\`\`  
/docs  
  CLAUDE.md       ← requires real attention per project  
  backlog.md      ← evolves with the project  
  brief.md        ← update only "current task" each session  
\`\`\`

\*\*Phase prompts and task format\*\* belong in a personal snippets file or editor snippet — reuse without touching.

\---

\#\# 2\. Session workflow — step by step

\#\#\# Step 1 — Pick the task  
Open \`backlog.md\`. Copy the full task block.

\#\#\# Step 2 — Start a new conversation  
Paste \`brief.md\` \+ \`CLAUDE.md\` content \+ the task block together in the first message.

\#\#\# Step 3 — Map affected files \*(skip if you already know)\*  
\`\`\`  
Which files are likely affected to implement TASK-000?  
Return file paths only. No code, no explanation.  
\`\`\`  
Validate the list. Open only the relevant functions or sections — never full files.

\#\#\# Step 4 — Research  
Paste the relevant code sections and run the research prompt.  
Read carefully — validate that Claude understood the architecture correctly before moving on.

\#\#\# Step 5 — Plan  
Run the plan prompt. \*\*Read and approve before proceeding.\*\*  
This is where you catch scope drift and pattern violations — far cheaper to fix here than after implementation.

\#\#\# Step 6 — Implement  
Run the implement prompt only after approving the plan.

\#\#\# Step 7 — Review and correct  
If the output has issues, use the correction prompt with a specific scope.  
Never ask for a full rewrite — always target the specific function or block.

\#\#\# Step 8 — Apply, test, and commit  
\- Paste each block into the corresponding file in your editor  
\- Test locally  
\- Update task status in \`backlog.md\`: \`\[TODO\]\` → \`\[DONE\]\`  
\- Commit

\*\*Expected interaction count per task:\*\* 4 (brief → research → plan → implement).  
Corrections add 1–2 at most if the plan was properly approved.

\---

\#\# 3\. Settings → User Preferences

\> Set this once in Claude Settings. Applies to all projects and conversations.

\`\`\`  
I am a fullstack developer. Never modify code directly — only generate ready-to-copy blocks.

Default response format:  
\- Be direct. No introductions, no closing summaries.  
\- Use code blocks with language and file path in the first-line comment.  
\- If multiple files, separate with \--- path/to/file \---.  
\- Show only changed parts, never the entire file (unless explicitly asked).  
\- No obvious explanations. Only explain non-trivial decisions, in 1–2 lines max.  
\- Never apologize or add filler phrases.

My stack: TypeScript, JavaScript, Node.js, Next.js, Docker, Git, React, Tailwind CSS,  
shadcn/ui, Fastify, Prisma ORM, PostgreSQL, Redis, Python, PHP, Laravel, Flutter.

My workflow: research → plan (await approval) → implement.  
\`\`\`

\---

\#\# 4\. CLAUDE.md — project context file

\> Place in the repo root. Paste the full content at the start of every session.  
\> Adapt every section to the actual project — paths, stack, patterns, and constraints.

\`\`\`markdown  
\# CLAUDE.md

\#\# Architecture  
Monorepo: /apps/web (Next.js 14), /apps/api (FastAPI), /packages/shared  
DB: PostgreSQL via Prisma. Never use raw SQL outside /api/db/queries.  
Auth: always handled by middleware at /api/middleware/auth.py — never inline.

\#\# Critical dependency map  
UserService → AuthService → TokenRepository  
OrderFlow → PaymentGateway → WebhookHandler

\#\# Code standards  
\- Components: Server Components by default; use 'use client' only with justification.  
\- Errors: never throw directly; use the wrapper at /packages/shared/errors.ts.  
\- Styles: Tailwind utility classes only; no inline styles except for dynamic values.  
\- Tests: unit tests required for service layer; integration tests for API routes.

\#\# Never touch  
\- /api/migrations — Prisma-generated only, never manual edits.  
\- /apps/web/public — managed by design team.  
\- /packages/shared/types — changes require team discussion.

\#\# Patterns to follow  
\- Rate limiting: see /api/middleware/rate\_limit.py as reference.  
\- Pagination: see /api/routes/products.py as reference.  
\- Auth guard on new routes: see /api/middleware/auth.py as reference.  
\`\`\`

\---

\#\# 5\. brief.md — session starter

\> One file per project. The header is fixed — only update "Current task" each session.  
\> Paste the full content, including CLAUDE.md, as the first message of every conversation.

\`\`\`markdown  
\#\# PROJECT BRIEF  
Stack: \[e.g. Next.js 14 / FastAPI / PostgreSQL\]  
Repo: \[github.com/org/repo\]  
Structure: \[e.g. monorepo /apps/web, /apps/api, /packages/shared\]  
Current task: \[TASK-ID \+ title from backlog\]  
Files to paste: \[list filenames\]

\---

\[paste full CLAUDE.md content here\]

\---

\[paste relevant code sections below\]  
\`\`\`

\---

\#\# 6\. Phase prompts

\> Generic for any project. Save as editor snippets and reuse without modification.

\#\#\# File mapping — run before selecting files

\`\`\`  
\[paste CLAUDE.md\]

Task: \[description\]

Which files are likely affected or need to be read to implement this?  
Return file paths only. No code, no explanation.  
\`\`\`

\---

\#\#\# Phase 1 — Research

\`\`\`  
\[paste relevant code sections\]

Task: \[description\]

Research: which parts of the codebase are affected and why?  
List risks and edge cases.  
Do not implement anything yet.  
\`\`\`

\---

\#\#\# Phase 2 — Plan

\> Do not proceed to implement until you have read and approved this output.

\`\`\`  
Based on the research above, describe the implementation plan:  
\- Files to create or edit (in order)  
\- What changes in each file  
\- External dependencies (if any)

15 lines max. No code yet.  
\`\`\`

\---

\#\#\# Phase 3 — Implement

\`\`\`  
Implement per the approved plan.  
Return only diffs or new blocks, with file path in the first-line comment.  
Do not repeat unchanged code.  
\`\`\`

\---

\#\#\# Correction / iteration

\`\`\`  
Issue: \[describe the problem or test failure\]  
Fix only: \[specific function or block\]  
Do not touch anything else.  
\`\`\`

\---

\#\# 7\. Task format

\> Same skeleton for every task. A well-written task reduces the implement prompt to one line.

\`\`\`markdown  
\#\#\# TASK-000 | \[TODO\] Task title  
\*\*Context:\*\* one sentence explaining why this is needed  
\*\*Architectural context:\*\* which services/layers are involved  
\*\*Files:\*\* src/path/file-a.ts, src/path/file-b.py  
\*\*Acceptance criteria:\*\*  
\- \[ \] expected behavior 1  
\- \[ \] expected behavior 2  
\*\*Out of scope:\*\* what must NOT be changed  
\*\*Pattern reference:\*\* follow the same pattern as src/path/reference-file.ts  
\`\`\`

\> With this format, the implement prompt becomes:  
\> \`Implement TASK-000 per the criteria.\`

\---

\#\# 8\. backlog.md structure

\> One file per project. Evolves continuously. The status board gives a quick overview;  
\> full task specs live below, grouped by status.

\`\`\`markdown  
\# Backlog — \[Project Name\]

\#\# Overview  
\- \*\*Repo:\*\* \[github.com/org/repo\]  
\- \*\*Stack:\*\* \[e.g. Next.js 14 / FastAPI / PostgreSQL\]  
\- \*\*Last updated:\*\* \[YYYY-MM-DD\]

\---

\#\# Status board

| ID | Title | Status | Priority | Area |  
|----|-------|--------|----------|------|  
| TASK-001 | \[title\] | TODO | HIGH | Auth |  
| TASK-002 | \[title\] | TODO | MEDIUM | UI |  
| TASK-003 | \[title\] | IN PROGRESS | HIGH | API |  
| TASK-004 | \[title\] | REVIEW | LOW | Infra |  
| TASK-005 | \[title\] | DONE | — | DB |

\---

\#\# In Progress

\#\#\# TASK-003 | \[IN PROGRESS\] Task title  
\*\*Context:\*\* one sentence explaining why this is needed  
\*\*Architectural context:\*\* which services/layers are involved  
\*\*Files:\*\* src/path/file-a.ts, src/path/file-b.py  
\*\*Acceptance criteria:\*\*  
\- \[ \] expected behavior 1  
\- \[ \] expected behavior 2  
\*\*Out of scope:\*\* what must NOT be changed  
\*\*Pattern reference:\*\* follow the same pattern as src/path/reference-file.ts  
\*\*Started:\*\* \[YYYY-MM-DD\]  
\*\*Notes:\*\* \[any relevant notes added during implementation\]

\---

\#\# Todo

\#\#\# Priority: HIGH

\#\#\#\# TASK-001 | \[TODO\] Task title  
\*\*Context:\*\* one sentence explaining why this is needed  
\*\*Architectural context:\*\* which services/layers are involved  
\*\*Files:\*\* src/path/file-a.ts, src/path/file-b.py  
\*\*Acceptance criteria:\*\*  
\- \[ \] expected behavior 1  
\- \[ \] expected behavior 2  
\*\*Out of scope:\*\* what must NOT be changed  
\*\*Pattern reference:\*\* follow the same pattern as src/path/reference-file.ts

\---

\#\#\# Priority: MEDIUM

\#\#\#\# TASK-002 | \[TODO\] Task title  
\*\*Context:\*\* one sentence explaining why this is needed  
\*\*Architectural context:\*\* which services/layers are involved  
\*\*Files:\*\* src/path/file-a.ts  
\*\*Acceptance criteria:\*\*  
\- \[ \] expected behavior 1  
\- \[ \] expected behavior 2  
\*\*Out of scope:\*\* what must NOT be changed  
\*\*Pattern reference:\*\* —

\---

\#\#\# Priority: LOW

\#\#\#\# TASK-004 | \[TODO\] Task title  
\*\*Context:\*\* one sentence explaining why this is needed  
\*\*Architectural context:\*\* which services/layers are involved  
\*\*Files:\*\* src/path/file-a.ts  
\*\*Acceptance criteria:\*\*  
\- \[ \] expected behavior 1  
\*\*Out of scope:\*\* what must NOT be changed  
\*\*Pattern reference:\*\* —

\---

\#\# Review

\#\#\# TASK-004 | \[REVIEW\] Task title  
\*\*Context:\*\* one sentence explaining why this is needed  
\*\*Architectural context:\*\* which services/layers are involved  
\*\*Files:\*\* src/path/file-a.ts, src/path/file-b.py  
\*\*Acceptance criteria:\*\*  
\- \[x\] expected behavior 1  
\- \[x\] expected behavior 2  
\- \[ \] expected behavior 3 — pending review  
\*\*Out of scope:\*\* what must NOT be changed  
\*\*Pattern reference:\*\* follow the same pattern as src/path/reference-file.ts  
\*\*Implemented:\*\* \[YYYY-MM-DD\]  
\*\*Review notes:\*\* \[what needs to be checked or approved\]

\---

\#\# Done

\#\#\# TASK-005 | \[DONE\] Task title  
\*\*Context:\*\* one sentence explaining why this is needed  
\*\*Files:\*\* src/path/file-a.ts, src/path/file-b.py  
\*\*Acceptance criteria:\*\*  
\- \[x\] expected behavior 1  
\- \[x\] expected behavior 2  
\*\*Completed:\*\* \[YYYY-MM-DD\]  
\*\*Commit:\*\* \[abc1234\]

\---

\#\# Icebox  
\> Tasks that are valid but not prioritized yet. No detailed spec needed.

\- \[ \] \[TASK-010\] Idea or future feature — brief description  
\- \[ \] \[TASK-011\] Idea or future feature — brief description

\---

\#\# Notes & decisions  
\> Architectural decisions or constraints that affect multiple tasks.  
\> Good source of content for CLAUDE.md.

\- \[YYYY-MM-DD\] Decision: \[description and reason\]  
\- \[YYYY-MM-DD\] Constraint: \[description and impact\]  
\`\`\`  
