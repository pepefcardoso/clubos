# UI/UX Guidelines — ClubOS v1.0

> Referência visual e de experiência para todo desenvolvimento frontend.
> Stack: Next.js 14 (App Router) + Tailwind CSS 3.x + shadcn/ui.
> Qualquer desvio deve ser discutido e documentado antes de implementar.

---

## Identidade Visual

O ClubOS é usado por tesoureiros e presidentes de clubes de futebol — pessoas que lidam com dinheiro real e precisam confiar no sistema. A interface deve transmitir **seriedade sem frieza**, e **acessibilidade sem infantilidade**.

A referência de personalidade é: um contador jovem e organizado que também entende de futebol. Não é um banco. Não é um app de times. É os dois ao mesmo tempo.

**Evitar ativamente:**

- Gradientes excessivos e glassmorphism (parecem template de IA)
- Ilustrações decorativas sem propósito
- Shadows exageradas e efeitos "flutuantes"
- Paletas totalmente neutras (cinza sobre cinza)
- Verde-escuro ou azul-royal genérico de "fintech"

---

## Design Tokens

Todos os valores abaixo devem ser configurados em `tailwind.config.ts` como extensão do tema, para que os tokens sejam usáveis como classes utilitárias em qualquer componente.

### Paleta de Cores

A paleta usa um **verde-musgo profundo** como cor primária — associado a campo de futebol, mas sóbrio o suficiente para um contexto financeiro. O acento é um **âmbar queimado** que aparece em estados de atenção e destaques, criando contraste sem recorrer ao laranja genérico.

```ts
// tailwind.config.ts
colors: {
  // Primária — verde-musgo
  primary: {
    50:  '#f0f7f0',
    100: '#d9edd9',
    200: '#b3dab3',
    300: '#7cbd7c',
    400: '#4d9e4d',
    500: '#2d7d2d',  // base
    600: '#236023',
    700: '#1a481a',
    800: '#123012',
    900: '#0a1c0a',
  },

  // Acento — âmbar queimado
  accent: {
    50:  '#fdf6e3',
    100: '#fae9b8',
    200: '#f5d06e',
    300: '#f0b429',  // base
    400: '#d4940a',
    500: '#a36e05',
  },

  // Neutros — levemente quentes (não cinza puro)
  neutral: {
    0:   '#ffffff',
    50:  '#fafaf8',
    100: '#f4f3ef',
    200: '#e8e6e0',
    300: '#d1cec6',
    400: '#a8a49a',
    500: '#78746a',
    600: '#57534a',
    700: '#3d3a33',
    800: '#27241e',
    900: '#171410',
  },

  // Semânticas — feedback ao usuário
  success: '#2d7d2d',   // mesmo que primary-500
  warning: '#f0b429',   // mesmo que accent-300
  danger:  '#c0392b',
  info:    '#2471a3',
}
```

### Tipografia

```ts
// tailwind.config.ts
fontFamily: {
  sans: ['Inter', 'system-ui', 'sans-serif'],  // corpo e UI
  mono: ['JetBrains Mono', 'monospace'],        // valores monetários, CPF, IDs
}
```

- **Inter** para todo texto de interface — labels, parágrafos, botões.
- **JetBrains Mono** especificamente para valores monetários (`R$ 1.490,00`), CPF, códigos de cobrança e IDs técnicos. Isso cria uma distinção visual clara entre "dado financeiro" e "texto de UI".

```ts
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

### Espaçamento e Grid

Usar exclusivamente a escala padrão do Tailwind (múltiplos de 4px). Não criar valores customizados de espaçamento.

- **Gap entre cards de KPI:** `gap-4` (16px)
- **Padding interno de card:** `p-6` (24px)
- **Padding de página:** `px-6 py-8` em desktop, `px-4 py-6` em mobile
- **Largura máxima do conteúdo:** `max-w-7xl mx-auto`

### Bordas e Raios

```ts
borderRadius: {
  none: '0',
  sm:   '4px',
  DEFAULT: '6px',   // inputs, badges
  md:   '8px',      // cards, dropdowns
  lg:   '12px',     // modais, painéis laterais
  full: '9999px',   // avatares, pills de status
}
```

### Sombras

Sombras sutis e funcionais — apenas para indicar elevação real (modais, dropdowns). Nunca decorativas.

```ts
boxShadow: {
  sm:  '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.08)',
  md:  '0 4px 6px -1px rgb(0 0 0 / 0.07), 0 2px 4px -2px rgb(0 0 0 / 0.07)',
  lg:  '0 10px 15px -3px rgb(0 0 0 / 0.07), 0 4px 6px -4px rgb(0 0 0 / 0.07)',
}
```

---

## Layout e Estrutura de Páginas

### Shell da Aplicação

```
┌─────────────────────────────────────────────────────┐
│  Sidebar (240px fixo)  │  Header (56px)             │
│                        ├────────────────────────────│
│  - Logo do clube       │  Conteúdo da página        │
│  - Nav principal       │  (scrollável)              │
│  - Nav secundária      │                            │
│  - User menu (bottom)  │                            │
└─────────────────────────────────────────────────────┘
```

- Sidebar fixa em desktop, drawer deslizante em mobile (< 768px).
- Header contém: título da página atual + ações contextuais (botões de CTA da página).
- O conteúdo nunca tem scroll horizontal.

### Hierarquia de Páginas

Toda página segue a mesma estrutura interna:

```
[Page Title + Subtitle]
[KPI Cards — quando aplicável]
[Filtros / Busca — quando aplicável]
[Tabela ou conteúdo principal]
[Paginação — quando aplicável]
```

---

## Componentes e Padrões

### Botões

| Variante    | Uso                                   | Classe base                                              |
| ----------- | ------------------------------------- | -------------------------------------------------------- |
| `primary`   | Ação principal da página (1 por tela) | `bg-primary-500 text-white hover:bg-primary-600`         |
| `secondary` | Ações secundárias                     | `border border-neutral-300 hover:bg-neutral-100`         |
| `danger`    | Ações destrutivas (excluir, cancelar) | `bg-danger text-white` — sempre com modal de confirmação |
| `ghost`     | Ações terciárias, dentro de tabelas   | `text-primary-600 hover:bg-primary-50`                   |

- Tamanho padrão: `h-9 px-4 text-sm` (36px de altura).
- Nunca mais de **1 botão primário** por contexto visual.
- Botões destrutivos sempre precedidos de modal de confirmação com descrição da consequência.

### Cards de KPI

Usados no dashboard de inadimplência. Estrutura:

```
┌──────────────────────────┐
│  Ícone  Label            │
│                          │
│  Valor principal (2xl)   │
│  Subtexto / variação     │
└──────────────────────────┘
```

- Fundo: `bg-white border border-neutral-200 rounded-md p-6`
- Valor: `font-mono text-2xl font-semibold`
- Ícone: 20px, cor `primary-500` para positivos, `danger` para negativos

### Tabelas

- Cabeçalho: `bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide`
- Linhas: `border-b border-neutral-100`, hover `bg-neutral-50`
- Colunas de valor monetário: alinhadas à direita, fonte `font-mono`
- Colunas de ação: sempre a última coluna, alinhadas à direita
- Sem zebra striping — a linha de hover já fornece feedback suficiente

### Badges de Status

Usados para exibir `MemberStatus` e `ChargeStatus`. Sempre `rounded-full text-xs font-medium px-2.5 py-0.5`.

| Status          | Classes                                        |
| --------------- | ---------------------------------------------- |
| `ACTIVE`        | `bg-primary-50 text-primary-700`               |
| `INACTIVE`      | `bg-neutral-100 text-neutral-600`              |
| `OVERDUE`       | `bg-red-50 text-red-700`                       |
| `PENDING`       | `bg-amber-50 text-amber-700`                   |
| `PAID`          | `bg-primary-50 text-primary-700`               |
| `CANCELLED`     | `bg-neutral-100 text-neutral-500 line-through` |
| `PENDING_RETRY` | `bg-orange-50 text-orange-700`                 |

### Formulários

- Label acima do campo, sempre visível (nunca apenas placeholder).
- Mensagem de erro abaixo do campo, em `text-danger text-sm`.
- Estado de loading no botão de submit: substituir texto por spinner + texto "Salvando…", desabilitar o botão.
- Campos obrigatórios: marcados com `*` vermelho no label, nunca só na mensagem de erro.
- Largura dos inputs: nunca `w-full` em tela inteira — usar `max-w-sm` para campos simples, `max-w-lg` para campos de endereço ou descrição.

### Modais

- Usar para: confirmações destrutivas, formulários rápidos (máx. 4 campos), visualização de detalhes.
- Nunca usar para fluxos longos ou multi-step — preferir página dedicada.
- Sempre ter: título claro, botão de fechar (X), ação primária e ação de cancelar.
- Overlay: `bg-black/40 backdrop-blur-sm`

---

## Formatação de Dados

Esta seção é crítica. Dados financeiros mal formatados geram desconfiança.

### Valores Monetários

```ts
// Usar sempre — nunca formatar manualmente
const formatBRL = (cents: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);

// Resultado: R$ 1.490,00
```

- Sempre renderizar com `font-mono`.
- Valores negativos (cancelamentos, devoluções) em `text-danger`.
- Nunca exibir centavos como float bruto (`1490.00`) em nenhuma parte da UI.

### Datas

```ts
// Data simples
new Intl.DateTimeFormat("pt-BR").format(date);
// → 15/03/2025

// Data com hora (logs, auditoria)
new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
}).format(date);
// → 15/03/2025 às 14:32
```

### CPF e Telefone

Sempre formatados na exibição, nunca armazenados com máscara.

```ts
const formatCPF = (cpf: string) =>
  cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
// → 123.456.789-00

const formatPhone = (phone: string) =>
  phone.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
// → (11) 99999-0000
```

---

## Padrões de Feedback

### Quando usar o quê

| Situação                              | Componente                             |
| ------------------------------------- | -------------------------------------- |
| Ação concluída com sucesso            | Toast (3s, bottom-right)               |
| Erro de validação de formulário       | Inline, abaixo do campo                |
| Erro de requisição (API falhou)       | Toast destrutivo + mensagem descritiva |
| Ação irreversível (excluir, cancelar) | Modal de confirmação                   |
| Carregamento de página inteira        | Skeleton da estrutura da página        |
| Carregamento de tabela                | Skeleton das linhas                    |
| Carregamento de botão (submit)        | Spinner inline no botão                |

### Toasts

- Sucesso: borda esquerda `primary-500`, ícone de check.
- Erro: borda esquerda `danger`, ícone de X, mensagem descritiva (não "Algo deu errado").
- Duração: 3s para sucesso, 6s para erro (o usuário precisa ler).
- Posição: `bottom-right` em desktop, `bottom-center` em mobile.

### Estados Vazios

Toda tabela ou lista deve ter um estado vazio explícito — nunca uma tabela em branco sem explicação.

Estrutura do estado vazio:

```
[Ícone contextual — 48px, neutral-300]
[Título — "Nenhum sócio cadastrado"]
[Subtexto — "Importe uma lista CSV ou adicione manualmente."]
[Botão CTA — quando aplicável]
```

---

## Tom de Voz (Microcopy)

O produto fala em português formal, mas sem burocracia. Direto, humano, sem jargão técnico.

| Contexto               | ❌ Evitar        | ✅ Usar                                                |
| ---------------------- | ---------------- | ------------------------------------------------------ |
| Erro de validação      | "Campo inválido" | "Informe um CPF válido (apenas números)"               |
| Confirmação destrutiva | "Tem certeza?"   | "Excluir João Silva? Essa ação não pode ser desfeita." |
| Estado vazio           | "Sem dados"      | "Nenhuma cobrança gerada este mês"                     |
| Loading                | "Carregando..."  | "Buscando sócios..."                                   |
| Erro de API            | "Erro 500"       | "Não conseguimos gerar a cobrança. Tente novamente."   |
| Sucesso                | "OK"             | "Cobrança enviada para João Silva"                     |

---

## Acessibilidade (mínimo obrigatório)

- Todo elemento interativo deve ter `aria-label` quando o texto visível não for descritivo (ex: botões com apenas ícone).
- Contraste mínimo: 4.5:1 para texto normal, 3:1 para texto grande (WCAG AA).
- Navegação por teclado funcional em modais, dropdowns e tabelas.
- Inputs sempre associados a labels via `htmlFor` / `id` — nunca apenas por proximidade visual.
- Nunca transmitir informação apenas por cor (ex: badges de status devem ter texto, não só cor).
