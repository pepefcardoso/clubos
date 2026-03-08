# Next.js 14 → 15 Upgrade Guide — ClubOS

> Estimated time: 1–2 days  
> Risk level: Low-Medium (auth path requires careful testing)  
> Branch strategy: `feature/nextjs-15-upgrade` off `develop`

---

## Before You Start

- [x] Make sure all current tests pass: `pnpm test`
- [x] Make sure there are no TypeScript errors: `pnpm typecheck`
- [ ] Create a new branch: `git checkout -b feature/nextjs-15-upgrade`
- [x] Commit any pending work — you want a clean diff

---

## Step 1 — Run the official codemod

Next.js ships an automated migration tool. Run it from inside `apps/web/`:

```bash
cd apps/web
npx @next/codemod@canary upgrade latest
```

This will:
- Bump `next`, `eslint-config-next`, `@types/react`, and `@types/react-dom` in `package.json`
- Convert synchronous `cookies()`, `headers()`, `params`, and `searchParams` to async
- Update some import paths automatically

After it finishes, **do not install yet**. Review the diff first with `git diff`.

---

## Step 2 — Manually update `package.json` in `apps/web/`

The codemod bumps Next.js but you need to verify and align the related packages manually.

```json
{
  "dependencies": {
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "eslint-config-next": "^15.0.0"
  }
}
```

Also update the pnpm override in the **root `package.json`** to match:

```json
"pnpm": {
  "overrides": {
    "react": "^19",
    "react-dom": "^19",
    "@types/react": "^19",
    "@types/react-dom": "^19"
  }
}
```

Then install:

```bash
cd ../..   # back to monorepo root
pnpm install
```

---

## Step 3 — Fix async `cookies()` in the auth middleware

This is the **highest-risk step**. Your auth flow uses httpOnly cookies for refresh tokens.
In Next.js 15, `cookies()` returns a Promise everywhere, including `middleware.ts`.

Find your middleware file (`apps/web/src/middleware.ts` or similar) and update:

```ts
// BEFORE (Next.js 14)
import { cookies } from 'next/headers';

export function middleware(request: NextRequest) {
  const cookieStore = cookies();
  const token = cookieStore.get('refresh_token');
  // ...
}

// AFTER (Next.js 15)
import { cookies } from 'next/headers';

export async function middleware(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('refresh_token');
  // ...
}
```

Do the same for any **Server Components or Route Handlers** in `(app)/` that read cookies directly.

Search the entire `apps/web/src` directory to find every occurrence:

```bash
grep -r "cookies()" apps/web/src --include="*.ts" --include="*.tsx" -l
```

Each file returned needs to be checked and updated.

---

## Step 4 — Fix async `params` and `searchParams` in pages

In Next.js 15, route params are now Promises. The codemod handles most of these,
but verify the pages in `(app)/` that use dynamic segments (e.g. `/socios/[id]`, `/cobrancas/[id]`).

```tsx
// BEFORE (Next.js 14)
export default function SocioPage({ params }: { params: { id: string } }) {
  const { id } = params;
}

// AFTER (Next.js 15)
export default async function SocioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}
```

Same applies to `searchParams` in any page that uses query string filters (e.g. the charges list with status filters):

```tsx
// BEFORE
export default function CobrancasPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {}

// AFTER
export default async function CobrancasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
}
```

Run this to find all affected files:

```bash
grep -r "searchParams\|params" apps/web/src/app --include="*.tsx" -l
```

---

## Step 5 — Audit fetch() caching in Server Components

Next.js 15 changed the default: `fetch()` is **no longer cached** automatically.

Since ClubOS uses React Query for client-side fetching, this mostly won't affect you.
But run a quick check for any `fetch()` calls in Server Components:

```bash
grep -r "fetch(" apps/web/src/app --include="*.tsx" --include="*.ts"
```

If any server component fetches data directly without React Query, add explicit caching:

```ts
// If you want cached behavior (old default):
const res = await fetch('https://...', { cache: 'force-cache' });

// If you want always-fresh (new default, no change needed):
const res = await fetch('https://...');
```

---

## Step 6 — Verify `next.config.js`

Your `next.config.js` has a custom CSP and security headers setup.
Next.js 15 didn't change the config format, but verify it still compiles cleanly:

```bash
cd apps/web
npx next build --dry-run 2>&1 | head -50
```

Also check that the HTTPS redirect in `redirects()` still works as expected —
the `x-forwarded-proto` check you have is fine and unchanged in Next.js 15.

---

## Step 7 — Check `react-hook-form` with React 19

Your financial forms use `react-hook-form@7`. There are known minor issues with React 19's
concurrent rendering, specifically around `useFormState` and controlled inputs.

Test these flows manually after upgrading:
- [ ] Member registration form (CPF field masking + validation)
- [ ] Charge creation form (amount in cents + due date)
- [ ] Login form (JWT flow)

If you see unexpected re-renders or validation state not clearing, pin `react-hook-form`
to `^7.54.0` which has the best React 19 compatibility at the time of writing:

```bash
pnpm --filter web add react-hook-form@^7.54.0
```

---

## Step 8 — Run the full check suite

```bash
# From monorepo root
pnpm typecheck   # must be zero errors
pnpm lint        # must be zero warnings (CI requirement per architecture-guidelines.md)
pnpm test        # all tests green
```

If `pnpm lint` fails with ESLint version conflicts after the upgrade:

```bash
cd apps/web
npx eslint --version        # should now be 9.x (Next.js 15 moved to ESLint 9)
```

Next.js 15 migrated to ESLint 9 which uses a flat config by default.
Your current `.eslintrc.json` format is still supported via compatibility mode,
but if you get errors, rename it:

```bash
mv apps/web/.eslintrc.json apps/web/.eslintrc.json.bak
```

And create `apps/web/eslint.config.mjs`:

```js
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      'import/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './src/app/(marketing)',
              from: './src/app/(app)',
              message: '(marketing) must not import from (app).',
            },
          ],
        },
      ],
    },
  },
];
```

---

## Step 9 — Manual smoke test in browser

Start the dev server and walk through the critical paths:

```bash
pnpm dev
```

- [ ] Landing page loads (`/`) — no hydration errors in console
- [ ] Login page loads and submits — JWT cookie set correctly
- [ ] Dashboard loads after auth — React Query fetches data
- [ ] Refresh token rotation works — httpOnly cookie is rotated on page reload
- [ ] Member list loads with pagination
- [ ] Charge creation form submits and shows toast
- [ ] Logout clears the cookie and redirects to login

Open DevTools → Application → Cookies and confirm `refresh_token` is present
and flagged as HttpOnly after login.

---

## Step 10 — Commit and open PR

```bash
git add .
git commit -m "feat(web): upgrade Next.js 14 → 15 with React 19"
git push origin feature/nextjs-15-upgrade
```

PR checklist before merging to `develop`:
- [ ] All CI checks green (typecheck, lint, test)
- [ ] Auth smoke test passed (login, refresh, logout)
- [ ] Financial form smoke test passed (charge creation, member registration)
- [ ] No hydration warnings in browser console
- [ ] Security headers verified in Network tab (CSP, HSTS, X-Frame-Options)

---

## Rollback Plan

If something critical breaks in staging, rollback is a single revert:

```bash
git revert HEAD
git push origin develop
```

Since the API (`apps/api/`) is completely untouched by this upgrade,
there is zero risk of data loss or backend regression. The rollback only
affects the web layer.

---

## Reference

- [Next.js 15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Next.js 15 codemods](https://nextjs.org/docs/app/guides/upgrading/codemods)
- [React 19 migration guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [react-hook-form React 19 compatibility](https://github.com/react-hook-form/react-hook-form/releases)