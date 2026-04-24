# CLUBOS_AGENT_SKILLS — UI/UX

> Stack: Next.js 14 (App Router) · Tailwind CSS 3.x · shadcn/ui
> All rules are binding. Desvios são BLOCKERs de PR.

---

## 1. TAILWIND_TOKENS

### 1.1 — Colors

MUST extend `tailwind.config.ts` with exactly:

```ts
colors: {
  primary: {
    50:  '#f0f7f0', 100: '#d9edd9', 200: '#b3dab3', 300: '#7cbd7c',
    400: '#4d9e4d', 500: '#2d7d2d', 600: '#236023', 700: '#1a481a',
    800: '#123012', 900: '#0a1c0a',
  },
  accent: {
    50: '#fdf6e3', 100: '#fae9b8', 200: '#f5d06e',
    300: '#f0b429', 400: '#d4940a', 500: '#a36e05',
  },
  neutral: {
    0: '#ffffff', 50: '#fafaf8', 100: '#f4f3ef', 200: '#e8e6e0',
    300: '#d1cec6', 400: '#a8a49a', 500: '#78746a', 600: '#57534a',
    700: '#3d3a33', 800: '#27241e', 900: '#171410',
  },
  success: '#2d7d2d',
  warning: '#f0b429',
  danger:  '#c0392b',
  info:    '#2471a3',
}
```

**BLOCKER:** Any hardcoded HEX not present in this palette.

### 1.2 — Typography

```ts
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],
}
fontSize: {
  xs:   ['0.75rem',  { lineHeight: '1rem' }],
  sm:   ['0.875rem', { lineHeight: '1.25rem' }],
  base: ['1rem',     { lineHeight: '1.5rem' }],
  lg:   ['1.125rem', { lineHeight: '1.75rem' }],
  xl:   ['1.25rem',  { lineHeight: '1.75rem' }],
  '2xl':['1.5rem',   { lineHeight: '2rem' }],
  '3xl':['1.875rem', { lineHeight: '2.25rem' }],
}
```

### 1.3 — Border Radius

```ts
borderRadius: {
  none: '0', sm: '4px', DEFAULT: '6px',
  md: '8px', lg: '12px', full: '9999px',
}
```

| Context          | Token          |
| ---------------- | -------------- |
| Inputs, badges   | `rounded`      |
| Cards, dropdowns | `rounded-md`   |
| Modais, painéis  | `rounded-lg`   |
| Avatares, pills  | `rounded-full` |

### 1.4 — Box Shadow

```ts
boxShadow: {
  sm:      '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
  md:      '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)',
  lg:      '0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.07)',
}
```

Usage: `shadow-lg` modais · `shadow-md` dropdowns · `shadow-sm` cards.
**BLOCKER:** Shadow applied for purely decorative purposes.

### 1.5 — Spacing & Grid

- MUST use Tailwind default scale (multiples of 4px) exclusively.
- **BLOCKER:** Arbitrary spacing values (e.g. `p-[18px]`, `gap-[7px]`).

Fixed rules:

| Context               | Value               |
| --------------------- | ------------------- |
| KPI card gap          | `gap-4`             |
| Card internal padding | `p-6`               |
| Page padding desktop  | `px-6 py-8`         |
| Page padding mobile   | `px-4 py-6`         |
| Content max-width     | `max-w-7xl mx-auto` |

---

## 2. TYPOGRAPHY & DATA FORMATTING

### 2.1 — Font Assignment

| Context                                   | Font                                   |
| ----------------------------------------- | -------------------------------------- |
| All UI text (labels, paragraphs, buttons) | `font-sans` (default — do not declare) |
| Monetary values, CPF, charge codes / IDs  | `font-mono`                            |

**BLOCKER:** Monetary value rendered without `font-mono`.

### 2.2 — Monetary Values

- Backend stores values in **centavos (integer)**. Frontend MUST divide by 100 before formatting.

```ts
const formatBRL = (cents: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
// 149000 → "R$ 1.490,00"
```

- **BLOCKER:** Use of `.toFixed(2)`, `parseFloat`, or any manual currency formatting.
- Negative values (refunds, cancellations): add `text-danger` to the element.

### 2.3 — Dates

```ts
// Tables, cards
new Intl.DateTimeFormat("pt-BR").format(date);
// → "15/03/2025"

// Logs, audit, timestamps
new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(date);
// → "15/03/2025 às 14:32"
```

**BLOCKER:** ISO (`2025-03-15`) or EN (`Mar 15, 2025`) format shown to end users.

### 2.4 — CPF & Phone

```ts
const formatCPF = (cpf: string) =>
  cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const formatPhone = (phone: string) =>
  phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
```

- **BLOCKER:** Raw CPF or phone displayed without mask.
- **BLOCKER:** Mask persisted in controlled field state or DB.

---

## 3. COMPONENT_BEHAVIORS

### 3.1 — Buttons

| Variant   | Required classes                                                  |
| --------- | ----------------------------------------------------------------- |
| primary   | `bg-primary-500 text-white hover:bg-primary-600 h-9 px-4 text-sm` |
| secondary | `border border-neutral-300 hover:bg-neutral-100 h-9 px-4 text-sm` |
| danger    | `bg-danger text-white h-9 px-4 text-sm`                           |
| ghost     | `text-primary-600 hover:bg-primary-50 h-9 px-4 text-sm`           |

- **BLOCKER:** More than **1 primary button** per visual context (page or modal).
- **BLOCKER:** `danger` button without a preceding confirmation modal.
- **BLOCKER:** Button size diverging from `h-9 px-4 text-sm` without documented justification.

### 3.2 — KPI Cards

```tsx
<div className="bg-white border border-neutral-200 rounded-md p-6">
  <div>
    {/* Icon 20px: text-primary-500 (positive) | text-danger (negative) */}
  </div>
  <span>{/* Label */}</span>
  <p className="font-mono text-2xl font-semibold">{formatBRL(value)}</p>
  <span>{/* Subtext / variance */}</span>
</div>
```

### 3.3 — Tables

- Header: `bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide`
- Rows: `border-b border-neutral-100` + hover `bg-neutral-50`
- Monetary columns: `text-right font-mono`
- Actions column: MUST be last, `text-right`
- **BLOCKER:** Zebra striping (`odd:bg-*` / `even:bg-*`).
- **BLOCKER:** Horizontal scroll inside the default layout.
- **MUST:** Every table MUST have an explicit empty state (see §4.4).

### 3.4 — Status Badges

Base: `rounded-full text-xs font-medium px-2.5 py-0.5`

| `status`        | Additional classes                             |
| --------------- | ---------------------------------------------- |
| `ACTIVE`        | `bg-primary-50 text-primary-700`               |
| `INACTIVE`      | `bg-neutral-100 text-neutral-600`              |
| `OVERDUE`       | `bg-red-50 text-red-700`                       |
| `PENDING`       | `bg-amber-50 text-amber-700`                   |
| `PAID`          | `bg-primary-50 text-primary-700`               |
| `CANCELLED`     | `bg-neutral-100 text-neutral-500 line-through` |
| `PENDING_RETRY` | `bg-orange-50 text-orange-700`                 |

**BLOCKER:** Status conveyed by color alone without a text label.

### 3.5 — Forms

- Label MUST be above the field and always visible — never replaced by placeholder.
- Required fields: `*` in red on the `<label>` — not only in the error message.
- Inline error: `text-danger text-sm` below the affected field.
- Submit loading: replace text with `<Spinner /> "Salvando…"` + `disabled`.
- Width: `max-w-sm` for simple fields; `max-w-lg` for address/description.
- **BLOCKER:** `w-full` input without a `max-w-*` constraint on desktop.
- **BLOCKER:** Required field without `*` on its label.

### 3.6 — Modais

- Overlay: `bg-black/40 backdrop-blur-sm` · Container: `rounded-lg`
- MUST contain: descriptive title, `X` close button, primary action, explicit cancel button.
- MUST use for: destructive confirmation, quick forms (≤ 4 fields), detail view.
- MUST NOT use for: multi-step flows or forms with > 4 fields → use a dedicated page.
- **BLOCKER:** Destructive modal without an explicit cancel button.
- **BLOCKER:** Modal without a descriptive title.

### 3.7 — App Shell

```
Sidebar: w-[240px] fixed (desktop) | sliding drawer < md (mobile)
Header:  h-[56px] — page title + contextual actions
Content: max-w-7xl mx-auto, vertical scroll, overflow-x-hidden
```

Page hierarchy:

1. Page Title + Subtitle
2. KPI Cards (if applicable)
3. Filters / Search (if applicable)
4. Table / Main content
5. Pagination (if applicable)

**BLOCKER:** Horizontal scroll anywhere in the main content area.

---

## 4. FEEDBACK_STATES

### 4.1 — Situation → Component Map

| Situation                            | Required component                                               |
| ------------------------------------ | ---------------------------------------------------------------- |
| Successful action                    | Toast · 3s · `bottom-right` (desktop) / `bottom-center` (mobile) |
| Form validation error                | Inline message below the field                                   |
| API request error                    | Destructive toast · 6s · descriptive message                     |
| Irreversible action (delete, cancel) | Confirmation modal                                               |
| Full-page load                       | Page skeleton                                                    |
| Table load                           | Row skeletons                                                    |
| Button submit                        | Inline spinner + `disabled`                                      |

### 4.2 — Toast Specs

```
Success: border-l-4 border-primary-500 + check icon  · duration=3000
Error:   border-l-4 border-danger      + X icon      · duration=6000
```

**BLOCKER:** Error toast with a generic message (e.g. "Algo deu errado", "Erro 500"). Error messages MUST describe what failed and guide the next action.

### 4.3 — Microcopy

| Context             | ❌ BLOCKER       | ✅ MUST use                                          |
| ------------------- | ---------------- | ---------------------------------------------------- |
| Validation error    | "Campo inválido" | "Informe um CPF válido (apenas números)"             |
| Destructive confirm | "Tem certeza?"   | "Excluir [Nome]? Essa ação não pode ser desfeita."   |
| Empty state         | "Sem dados"      | "Nenhuma cobrança gerada este mês"                   |
| Loading             | "Carregando..."  | "Buscando sócios…" (contextual verb)                 |
| API error           | "Erro 500"       | "Não conseguimos gerar a cobrança. Tente novamente." |
| Success             | "OK"             | "Cobrança enviada para [Nome]"                       |

Rule: MUST include the affected entity's name in success/error messages when available.

### 4.4 — Empty States

Every `<Table>` or `<List>` MUST implement:

```tsx
<div className="flex flex-col items-center gap-2 py-12">
  {/* Contextual icon: size=48px, text-neutral-300 */}
  <p className="font-medium">Nenhum [entidade] cadastrado</p>
  <p className="text-sm text-neutral-500">[Next-step instruction]</p>
  {/* Optional CTA */}
</div>
```

**BLOCKER:** Table rendered with `data.length === 0` and no empty state.

---

## 5. A11Y_REQUIREMENTS

- **BLOCKER:** `<input>` without a paired `id` + `<label htmlFor={id}>`.
- **BLOCKER:** Icon-only button without a descriptive `aria-label`.
- **BLOCKER:** Status badge conveying information by color alone (no text label).
- **BLOCKER:** Modal, dropdown, or table without keyboard navigation (`Tab`, `Escape`, `Enter`).
- **BLOCKER:** Text contrast < 4.5:1 (normal text) or < 3:1 (large text / WCAG AA).
- MUST: All interactive elements MUST have a visible focus ring (`focus-visible:ring-*`).

---

## 6. MARKETING_LANDING_RULES

> Applies only to public site routes. Do not apply to the authenticated app.

- MUST use `bg-primary-900` or `bg-neutral-900` for hero and high-impact sections.
- MUST use `font-mono` for highlighted numeric metrics (`R$ 80,00`, `25%`).
- SHOULD use asymmetric grids (Bento Grid) for feature sections — MUST NOT use a uniform 4-card row grid.
- Mockups MUST be the actual ClubOS UI in HTML/CSS — no stock photography of people with laptops.
- Animations MUST have a narrative purpose (`slide-up`, incrementing counter). **BLOCKER:** Continuous decorative animation (`animate-bounce`, `animate-pulse` without a loading state).
- **BLOCKER:** Generic gradients, glassmorphism, or decorative dot/grid backgrounds.
