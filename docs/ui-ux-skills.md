# CLUBOS_AGENT_SKILLS v1.0

> Stack: Next.js 14 (App Router) · Tailwind CSS 3.x · shadcn/ui
> Consume este artefato como System Prompt. Nenhuma regra é opcional. Desvios são BLOCKERs de PR.

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
  none: '0',   sm: '4px',   DEFAULT: '6px',
  md: '8px',   lg: '12px',  full: '9999px',
}
// inputs, badges → rounded (DEFAULT=6px)
// cards, dropdowns → rounded-md (8px)
// modais, painéis → rounded-lg (12px)
// avatares, pills → rounded-full
```

### 1.4 — Box Shadow

```ts
boxShadow: {
  sm:      '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
  md:      '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)',
  lg:      '0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.07)',
}
```

- MUST use shadow only for real elevation: modais (`shadow-lg`), dropdowns (`shadow-md`), cards (`shadow-sm`).
- BLOCKER: `shadow` aplicada para fins puramente decorativos.

### 1.5 — Spacing & Grid

- MUST use Tailwind default scale (multiples of 4px) exclusively.
- BLOCKER: Valores de espaçamento arbitrários (ex: `p-[18px]`, `gap-[7px]`).
- Regras fixas:
  - KPI card gap: `gap-4`
  - Card internal padding: `p-6`
  - Page padding desktop: `px-6 py-8` | mobile: `px-4 py-6`
  - Content max-width: `max-w-7xl mx-auto`

---

## 2. TYPOGRAPHY\_&_DATA_FORMATTING

### 2.1 — Font Assignment Rules

| Contexto                                      | Fonte               | Exemplo de classe     |
| --------------------------------------------- | ------------------- | --------------------- |
| Todo texto de UI (labels, parágrafos, botões) | `font-sans` (Inter) | padrão — não declarar |
| Valores monetários                            | `font-mono`         | `font-mono`           |
| CPF                                           | `font-mono`         | `font-mono`           |
| Códigos de cobrança / IDs técnicos            | `font-mono`         | `font-mono`           |

- BLOCKER: Valor monetário renderizado sem `font-mono`.

### 2.2 — Formatação de Valores Monetários

- MUST: Backend armazena valores em **centavos (integer)**. Frontend MUST dividir por 100 antes de formatar.
- MUST usar exatamente:

```ts
const formatBRL = (cents: number): string =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
// Input: 149000 → Output: "R$ 1.490,00"
```

- BLOCKER: Uso de `.toFixed(2)`, `parseFloat`, ou qualquer formatação manual de moeda.
- BLOCKER: Float bruto (`1490.00`) exibido em qualquer parte da UI.
- Valores negativos (devoluções, cancelamentos): adicionar `text-danger` ao elemento.

### 2.3 — Formatação de Datas

```ts
// Exibição simples (tabelas, cards)
new Intl.DateTimeFormat("pt-BR").format(date);
// → "15/03/2025"

// Exibição com hora (logs, auditoria, timestamps)
new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(date);
// → "15/03/2025 às 14:32"
```

- BLOCKER: Formato ISO (`2025-03-15`) ou EN (`Mar 15, 2025`) exibido ao usuário final.

### 2.4 — Formatação de CPF e Telefone

```ts
// Exibir formatado; armazenar/transmitir sem máscara
const formatCPF = (cpf: string) =>
  cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
// "12345678900" → "123.456.789-00"

const formatPhone = (phone: string) =>
  phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
// "11999990000" → "(11) 99999-0000"
```

- BLOCKER: CPF ou telefone raw exibido sem máscara.
- BLOCKER: Máscara persistida no valor do campo controlado (state/DB).

---

## 3. COMPONENT_BEHAVIORS

### 3.1 — Botões

Mapa de variante → classes obrigatórias:

```
primary   → bg-primary-500 text-white hover:bg-primary-600         h-9 px-4 text-sm
secondary → border border-neutral-300 hover:bg-neutral-100          h-9 px-4 text-sm
danger    → bg-danger text-white                                     h-9 px-4 text-sm
ghost     → text-primary-600 hover:bg-primary-50                    h-9 px-4 text-sm
```

- BLOCKER: Mais de **1 botão `primary`** por contexto visual (página ou modal).
- BLOCKER: Botão `danger` sem modal de confirmação precedendo a ação destrutiva.
- BLOCKER: Tamanho de botão divergente de `h-9 px-4 text-sm` sem justificativa documentada.

### 3.2 — KPI Cards

```tsx
// Estrutura obrigatória
<div className="bg-white border border-neutral-200 rounded-md p-6">
  <div>
    {/* Ícone 20px: text-primary-500 (positivo) | text-danger (negativo) */}
  </div>
  <span>{/* Label */}</span>
  <p className="font-mono text-2xl font-semibold">{formatBRL(value)}</p>
  <span>{/* Subtexto / variação */}</span>
</div>
```

### 3.3 — Tabelas

- Header row: `bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide`
- Data rows: `border-b border-neutral-100` + hover `bg-neutral-50`
- Colunas monetárias: `text-right font-mono`
- Coluna de ações: MUST ser última coluna, `text-right`
- BLOCKER: Zebra striping (`odd:bg-*` / `even:bg-*`).
- BLOCKER: Scroll horizontal na tabela dentro do layout padrão.
- MUST: Toda tabela MUST ter estado vazio explícito (ver §5.3).

### 3.4 — Badges de Status

Base obrigatória: `rounded-full text-xs font-medium px-2.5 py-0.5`

| `status` value  | Classes adicionais                             |
| --------------- | ---------------------------------------------- |
| `ACTIVE`        | `bg-primary-50 text-primary-700`               |
| `INACTIVE`      | `bg-neutral-100 text-neutral-600`              |
| `OVERDUE`       | `bg-red-50 text-red-700`                       |
| `PENDING`       | `bg-amber-50 text-amber-700`                   |
| `PAID`          | `bg-primary-50 text-primary-700`               |
| `CANCELLED`     | `bg-neutral-100 text-neutral-500 line-through` |
| `PENDING_RETRY` | `bg-orange-50 text-orange-700`                 |

- BLOCKER: Status exibido somente por cor sem label de texto.

### 3.5 — Formulários

- Label: MUST estar acima do campo, MUST ser sempre visível (nunca substituído por placeholder).
- Campos obrigatórios: `*` em vermelho no `<label>` — nunca apenas na mensagem de erro.
- Erro inline: `text-danger text-sm` abaixo do campo afetado.
- Submit loading state: substituir texto por `<Spinner /> "Salvando…"` + `disabled`.
- Largura: `max-w-sm` para campos simples; `max-w-lg` para endereço/descrição.
- BLOCKER: `w-full` em campo de input sem `max-w-*` limitando a largura em desktop.
- BLOCKER: Campo obrigatório sem marcação de `*` no label.

### 3.6 — Modais

- Overlay: `bg-black/40 backdrop-blur-sm`
- Border radius: `rounded-lg`
- MUST conter: título, botão `X` (fechar), ação primária, botão cancelar explícito.
- MUST usar para: confirmação destrutiva, formulários rápidos (≤ 4 campos), visualização de detalhe.
- MUST NOT usar para: fluxos multi-step ou formulários com > 4 campos → usar página dedicada.
- BLOCKER: Modal destrutivo sem botão de cancelar explícito.
- BLOCKER: Modal sem título descritivo.

### 3.7 — App Shell (Layout)

```
Sidebar: w-[240px] fixed  (desktop) | drawer deslizante < md (mobile)
Header:  h-[56px] — título da página + ações contextuais (CTAs)
Content: max-w-7xl mx-auto, scroll vertical, overflow-x-hidden
```

Hierarquia interna de página:

```
1. [Page Title + Subtitle]
2. [KPI Cards — se aplicável]
3. [Filtros / Busca — se aplicável]
4. [Tabela / Conteúdo principal]
5. [Paginação — se aplicável]
```

- BLOCKER: Scroll horizontal em qualquer parte do conteúdo principal.

---

## 4. FEEDBACK_STATES

### 4.1 — Mapa Situação → Componente

| Situação                              | Componente obrigatório                                           |
| ------------------------------------- | ---------------------------------------------------------------- |
| Ação concluída com sucesso            | Toast · 3s · `bottom-right` (desktop) / `bottom-center` (mobile) |
| Erro de validação de formulário       | Mensagem inline abaixo do campo                                  |
| Erro de requisição (API)              | Toast destrutivo · 6s · mensagem descritiva                      |
| Ação irreversível (excluir, cancelar) | Modal de confirmação                                             |
| Carregamento de página inteira        | Skeleton da estrutura da página                                  |
| Carregamento de tabela                | Skeleton das linhas                                              |
| Carregamento de botão (submit)        | Spinner inline no botão + `disabled`                             |

### 4.2 — Toast Specs

```
Sucesso: border-l-4 border-primary-500 + ícone check  · duration=3000
Erro:    border-l-4 border-danger      + ícone X       · duration=6000
```

- BLOCKER: Toast de erro com mensagem genérica (ex: "Algo deu errado", "Erro 500").
- MUST: Mensagem de erro descreve o que falhou e orienta ação.

### 4.3 — Microcopy — Mapa de Substituição

| Contexto               | ❌ BLOCKER — proibido | ✅ MUST usar (padrão ou similar)                     |
| ---------------------- | --------------------- | ---------------------------------------------------- |
| Erro de validação      | "Campo inválido"      | "Informe um CPF válido (apenas números)"             |
| Confirmação destrutiva | "Tem certeza?"        | "Excluir [Nome]? Essa ação não pode ser desfeita."   |
| Estado vazio           | "Sem dados"           | "Nenhuma cobrança gerada este mês"                   |
| Loading                | "Carregando..."       | "Buscando sócios…" / verbo contextual                |
| Erro de API            | "Erro 500"            | "Não conseguimos gerar a cobrança. Tente novamente." |
| Sucesso                | "OK"                  | "Cobrança enviada para [Nome]"                       |

- Regra geral: MUST incluir o nome da entidade afetada em mensagens de sucesso/erro quando disponível.

### 4.4 — Empty States

Toda `<Table>` ou `<List>` MUST implementar empty state com a estrutura:

```tsx
<div className="flex flex-col items-center gap-2 py-12">
  {/* Ícone contextual: size=48px, text-neutral-300 */}
  <p className="font-medium">Nenhum [entidade] cadastrado</p>
  <p className="text-sm text-neutral-500">[Instrução de próximo passo]</p>
  {/* CTA opcional */}
</div>
```

- BLOCKER: Tabela renderizada sem empty state quando `data.length === 0`.

---

## 5. A11Y_REQUIREMENTS

- **A11Y_BLOCKER:** `<input>` sem par `id` + `<label htmlFor={id}>` — proximidade visual não é substituto.
- **A11Y_BLOCKER:** Botão com apenas ícone (sem texto visível) sem `aria-label` descritivo.
- **A11Y_BLOCKER:** Badge ou indicador de status transmitindo informação somente por cor (sem texto label).
- **A11Y_BLOCKER:** Modal, dropdown ou tabela sem navegação funcional por teclado (`Tab`, `Escape`, `Enter`).
- **A11Y_BLOCKER:** Contraste de texto < 4.5:1 (texto normal) ou < 3:1 (texto grande / WCAG AA).
- MUST: Elementos interativos com estado de foco visível (`focus-visible:ring-*`).

---

## 6. MARKETING_LANDING_RULES

> Aplicável somente a rotas/componentes do site público. Não aplicar ao app autenticado.

- MUST usar fundos `bg-primary-900` ou `bg-neutral-900` em seções heroicas e de alto impacto.
- MUST usar `font-mono` para métricas numéricas em destaque (ex: `R$ 80,00`, `25%`).
- SHOULD usar grids assimétricos (Bento Grid) para seções de features — MUST NOT usar grid de 4 cards iguais lado a lado.
- MUST NOT usar fotos de banco de imagens (pessoas sorrindo com computador). Mockups devem ser a própria UI do ClubOS em HTML/CSS.
- Animações MUST ter propósito narrativo (`slide-up` de card, contador numérico incrementando).
- BLOCKER: Animação de "flutuação" contínua sem propósito (`animate-bounce` decorativo, `animate-pulse` sem estado de loading).
- BLOCKER: Gradientes genéricos, glassmorphism, ou backgrounds com padrão de bolinhas genérico.
- BLOCKER: Imagens decorativas sem relação com a interface real do produto.

---

## 7. GLOBAL_BLOCKERS (PR Review Checklist)

Qualquer PR que contenha os itens abaixo deve ser **rejeitado automaticamente**:

```
[ ] Uso de glassmorphism, gradientes não-padronizados ou shadows decorativas
[ ] Cor HEX hardcoded não presente em §1.1
[ ] Valor monetário sem formatBRL() / font-mono
[ ] Float bruto de centavos exibido na UI
[ ] Mais de 1 botão primary por contexto visual
[ ] Botão danger sem modal de confirmação
[ ] Input sem label associado via htmlFor/id
[ ] Botão ícone sem aria-label
[ ] Status badge sem texto label (só cor)
[ ] Tabela com data vazia sem empty state
[ ] Modal destrutivo sem botão cancelar
[ ] Scroll horizontal no conteúdo principal
[ ] Toast de erro com mensagem genérica
[ ] Zebra striping em tabela
[ ] Espaçamento arbitrário (não-múltiplo de 4px via Tailwind)
```
