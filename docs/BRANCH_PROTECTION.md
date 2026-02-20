# GitHub Branch Protection Setup

> Configure this **once** in GitHub repo settings to enforce the rules
> defined in `architecture-rules.md` and `architecture-guidelines.md`.

---

## 1. Protect `develop` branch

**Settings → Branches → Add rule → Branch name pattern:** `develop`

| Setting                               | Value | Why                                 |
| ------------------------------------- | ----- | ----------------------------------- |
| Require a pull request before merging | ✅    | No direct push to develop           |
| Required approvals                    | **1** | Standard rule for non-financial PRs |
| Dismiss stale reviews on new push     | ✅    | Re-review after force-push          |
| Require status checks to pass         | ✅    | See checks below                    |
| Require branches to be up to date     | ✅    | Prevent stale merges                |
| Block force pushes                    | ✅    | Protect history                     |

**Required status checks for `develop`:**

- `Lint`
- `Type Check`
- `Test`
- `Build`
- `Financial Module Gate`

---

## 2. Protect `main` branch

**Settings → Branches → Add rule → Branch name pattern:** `main`

| Setting                               | Value            | Why                                            |
| ------------------------------------- | ---------------- | ---------------------------------------------- |
| Require a pull request before merging | ✅               | No direct push to main                         |
| Required approvals                    | **2**            | All merges to main go through release branches |
| Dismiss stale reviews on new push     | ✅               |                                                |
| Require status checks to pass         | ✅               | Same checks as develop                         |
| Require branches to be up to date     | ✅               |                                                |
| Block force pushes                    | ✅               |                                                |
| Restrict who can push                 | Maintainers only | Extra safety for production                    |

**Required status checks for `main`:** (same as develop)

- `Lint`
- `Type Check`
- `Test`
- `Build`
- `Financial Module Gate`

---

## 3. Financial module PRs — 2 approvals

The `Financial Module Gate` job in CI annotates PRs that touch
`modules/charges`, `modules/payments`, `webhooks`, or `jobs` with a
warning. However, GitHub cannot dynamically change the required
approval count per PR via Actions alone.

**Two options to enforce 2 approvals on financial PRs:**

### Option A — CODEOWNERS (recommended)

Create `.github/CODEOWNERS`:

```
# Financial modules always require 2 senior reviewers
apps/api/src/modules/charges/   @lead-dev @senior-dev
apps/api/src/modules/payments/  @lead-dev @senior-dev
apps/api/src/webhooks/          @lead-dev @senior-dev
apps/api/src/jobs/              @lead-dev @senior-dev
```

Then enable **"Require review from Code Owners"** in the branch
protection rule. With 2 CODEOWNERS listed, both must approve.

### Option B — Team convention (simpler for a 1–2 dev team)

For a small team, rely on the CI warning annotation plus a manual
convention: any PR touching financial modules gets the
`needs-2-approvals` label and is not merged until 2 reviews are done.

---

## 4. Turbo remote cache (optional, speeds up CI)

Add to repo secrets:

```
TURBO_TOKEN   → from vercel.com/account/tokens
TURBO_TEAM    → your Vercel team slug
```

Then add to the CI workflow env:

```yaml
env:
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ secrets.TURBO_TEAM }}
```

This caches Turbo build/lint/test outputs across CI runs,
reducing pipeline time by 60–80% after the first run.
