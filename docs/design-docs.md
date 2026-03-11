# Design Doc (RFC) — ClubOS v1.0

> **Status:** Vivo — decisões técnicas tornam-se definitivas após revisão de 48h sem objeção.
> **Módulo:** Gestão Financeira, Sócios & Compliance Base
> **Versão:** 2.0

---

## Visão Técnica

O ClubOS v1.0 é um SaaS multi-tenant voltado exclusivamente para clubes de futebol amador e semiprofissional no Brasil. Seu objetivo técnico central é processar cobranças recorrentes via PIX, manter um cadastro confiável de sócios, gerar alertas de inadimplência e contratos com zero intervenção manual do operador do clube — e fazer tudo isso funcionando em campo, com ou sem sinal 4G.

### Princípios Inegociáveis de Arquitetura

| Princípio                    | Manifestação Técnica                                              | Por quê é inegociável                                                     |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Offline-First**            | PWA + IndexedDB + Service Workers + Background Sync               | Campo sem 4G é a norma, não a exceção no interior brasileiro              |
| **Hardware-Agnostic**        | APIs abertas para Apple Watch, GPS consumer, câmera do celular    | Quebra o monopólio Catapult/STATSports sem CAPEX para o clube             |
| **Privacy by Design**        | Hard stops para dados de menores; criptografia AES-256 em repouso | LGPD + ANPD: multas de até 2% do faturamento; passivo jurídico real       |
| **SAF-Ready**                | Módulo de Compliance com publicação inalterável de balanços       | Lei 14.193/2021 obrigatória para clubes com faturamento até R$78M         |
| **BRL-Native Pricing**       | Pay-As-You-Grow em Reais; sem conversão cambial                   | Volatilidade do EUR/USD inviabiliza licenças europeias para esse segmento |
| **Simplicidade Operacional** | Mobile-first, swipes grandes, zero treinamento formal             | Técnico de interior não vai largar o caderno se o app for complexo        |

---

## Stack Tecnológica

### Front-end

| Tecnologia               | Versão    | Justificativa                                                             | Status             |
| ------------------------ | --------- | ------------------------------------------------------------------------- | ------------------ |
| Next.js                  | 16.x      | SSR nativo, bom SEO para portal público, ecossistema React maduro         | ✅ Implementado    |
| React                    | 19.x      | Concurrent features; Server Components nativos no App Router              | ✅ Implementado    |
| TypeScript               | 5.x       | Tipagem evita bugs de runtime em fluxos financeiros críticos              | ✅ Implementado    |
| Tailwind CSS             | 3.4.x     | Velocidade de UI sem CSS custom; tokens de design via config              | ✅ Implementado    |
| shadcn/ui                | latest    | Componentes acessíveis, sem dependência pesada; copia código no repo      | ✅ Implementado    |
| React Query (TanStack)   | 5.x       | Cache e sincronização de estado servidor — elimina boilerplate            | ✅ Implementado    |
| React Hook Form + Zod    | 7.x / 4.x | Validação de formulários financeiros no client antes de bater na API      | ✅ Implementado    |
| Recharts                 | 3.x       | Gráficos de histórico de cobranças e performance no dashboard             | ✅ Implementado    |
| Resend                   | 6.x       | Envio de e-mail transacional e formulário de contato (marketing)          | ✅ Implementado    |
| **Workbox (PWA)**        | **7.x**   | **Service Workers + offline caching + Background Sync**                   | ⬜ Pendente (v1.5) |
| **Dexie.js (IndexedDB)** | **4.x**   | **ORM local para dados offline (treinos, presenças, anotações de campo)** | ⬜ Pendente (v1.5) |

> **Nota:** a versão Next.js foi atualizada de 14 para 16.x e React de 18 para 19 durante o desenvolvimento. O App Router e a estrutura de route groups permanece conforme projetado. Workbox e Dexie.js entram na v1.5 (TreinoOS offline-first) — listados aqui para visibilidade de planejamento de dependências.

### Back-end

| Tecnologia           | Versão                    | Justificativa                                                             | Status          |
| -------------------- | ------------------------- | ------------------------------------------------------------------------- | --------------- |
| Node.js + Fastify    | Node 20 LTS / Fastify 5.x | Performance superior ao Express; schema validation nativo via JSON Schema | ✅ Implementado |
| TypeScript           | 5.x                       | Consistência full-stack; tipos compartilhados entre front e back          | ✅ Implementado |
| Prisma ORM           | 6.x                       | Migrations versionadas, type-safe queries, multi-tenant via search_path   | ✅ Implementado |
| Zod                  | 4.x                       | Validação de payloads na entrada da API; compartilhado com front-end      | ✅ Implementado |
| BullMQ + Redis       | latest                    | Filas de jobs assíncronos para cobranças recorrentes e WhatsApp           | ✅ Implementado |
| JWT + Refresh Tokens | —                         | Auth stateless; refresh token rotativo em httpOnly cookie                 | ✅ Implementado |
| PapaParse            | 5.x                       | Parse de CSV para importação de sócios (até 5.000 linhas, batches 500)    | ✅ Implementado |
| Sharp                | 0.33.x                    | Resize/conversão de logo para WebP 200×200px                              | ✅ Implementado |
| Resend SDK           | 6.x                       | E-mail transacional (boas-vindas ao clube, fallback de cobrança)          | ✅ Implementado |

### Banco de Dados

| Tecnologia                | Justificativa                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 16             | Banco principal. ACID completo para transações financeiras. JSONB para metadados de gateway e Motor de Regras Esportivas. Schema-per-tenant para multi-tenancy. |
| Redis 7                   | Cache de sessão, filas BullMQ, rate limiting por clube (WhatsApp 30 msg/min), pub/sub de notificações em tempo real.                                            |
| **TimescaleDB (ext. PG)** | **Séries temporais para dados de carga ACWR por atleta (v1.5+). Extensão nativa do PostgreSQL — zero overhead de infra adicional.**                             |

> **Nota:** PostgreSQL atualizado de 15 para 16. TimescaleDB listado para visibilidade de planejamento — ativado na v1.5 (BaseForte).

---

## Landing Page — Estrutura e Decisão Arquitetural

A landing page (marketing, preços, contato) fica **dentro de `apps/web/`**, no mesmo app Next.js do painel. Não há um app separado `apps/landing/`.

### Justificativa

Para um time de 1–2 devs no MVP, manter um segundo app Next.js (`apps/landing/`) significaria duplicar configurações de deploy, variáveis de ambiente, pipeline de CI e dependências — overhead desproporcional ao estágio atual. O Next.js App Router já oferece a separação necessária via _route groups_, sem custo de infra adicional.

A separação em `apps/landing/` pode ser avaliada futuramente se o volume de conteúdo de marketing crescer o suficiente para justificar (blog, docs públicos, A/B testing de copy). Isso não é problema do MVP.

### Convenção de pastas (implementada)

Os _route groups_ do App Router isolam layouts e contextos sem afetar as URLs:

```
apps/web/src/app/
├── (marketing)/            # Páginas públicas — layout limpo, sem auth  ✅
│   ├── layout.tsx          # MarketingHeader + MarketingFooter           ✅
│   ├── page.tsx            # Landing principal (6 sections)              ✅
│   ├── precos/
│   │   └── page.tsx        # PricingSection + FAQ + CTA                  ✅
│   └── contato/
│       └── page.tsx        # ContactForm com rate-limit + Resend         ✅
├── (app)/                  # Painel autenticado — sidebar + auth guard   ✅
│   ├── layout.tsx          # Auth guard + AppShell                       ✅
│   ├── dashboard/page.tsx  # DashboardClient com SSE                     ✅
│   ├── members/page.tsx    # MembersPage                                 ✅
│   ├── plans/page.tsx      # PlansPage                                   ✅
│   ├── charges/page.tsx    # ChargesPage (QR Code + status)              ⬜
│   ├── athletes/page.tsx   # AthletesPage (stub)                         ⬜
│   └── contracts/page.tsx  # ContractsPage (BID/CBF alerts)              ⬜
├── (auth)/
│   └── login/page.tsx      # LoginForm                                   ✅
└── (onboarding)/
    └── onboarding/page.tsx # OnboardingWizard (3 steps)                  ✅
```

### Regras de convivência

- O route group `(marketing)` **nunca importa** componentes ou hooks do `(app)` — sem vazamento de bundle de autenticação, React Query ou lógica de painel para páginas públicas.
- O `(app)` tem um layout raiz com middleware de autenticação; o `(marketing)` tem um layout raiz independente e sem guard.
- Componentes verdadeiramente compartilhados (ex.: botão, tipografia, tokens de cor) vivem em `packages/ui/` ou em `apps/web/src/components/` sem pertencer a nenhum dos dois grupos.

### API Routes no Next.js

O formulário de contato usa uma API Route em `apps/web/src/app/api/contact/route.ts` com:

- Validação Zod do payload (nome, e-mail, mensagem)
- Rate limiting em memória: 5 requisições/60s por IP (via `x-forwarded-for`)
- Envio via Resend SDK (`noreply@clubos.com.br → CONTACT_EMAIL_TO`)

### Abordagem de Design e Componentização (Marketing)

Para evitar a aparência de "template genérico" e focar na conversão, a Landing Page adota o princípio de **"Show, Don't Tell"**.

- **Mockups baseados em código:** Em vez de importar imagens `.png` pesadas ou exportadas do Figma, os elementos demonstrativos (mensagens do bot, comprovantes de PIX) são componentes React construídos com Tailwind. Isso garante escalabilidade, facilidade de manutenção e performance (zero bytes de rede gastos em imagens).
- **Grids Assimétricos (Bento Grids):** A seção de funcionalidades utiliza CSS Grid para criar composições variadas, prendendo a atenção do usuário muito melhor do que listas ou cards simétricos tradicionais.
- **Micro-interações de Storytelling:** Componentes de marketing usam Tailwind Animate para revelar informações em scroll, guiando o olhar do "lead" pelo fluxo de valor da aplicação.

---

## Autenticação — Implementação

A autenticação segue o modelo JWT com refresh token rotativo em httpOnly cookie.

### Fluxo implementado

```
Login (POST /api/auth/login)
  → accessToken (15min, em memória) + refreshToken (7d, httpOnly cookie)
  → Bcrypt compare com constant-time dummy hash (previne user enumeration)
  → Refresh token armazenado no Redis (TTL 7d); invalidado no uso (single-use)

Bootstrap (mount do AuthProvider)
  → POST /api/auth/refresh com cookie
  → Decodifica JWT no cliente (sem verificar assinatura — responsabilidade do servidor)
  → Extrai { sub, clubId, role, email, type } do payload

getAccessToken()
  → Retorna token em memória se disponível
  → Senão, chama refresh (deduplica concorrência via refreshPromiseRef)

Logout (POST /api/auth/logout)
  → Invalida cookie no servidor + revoga refresh token no Redis + limpa estado local
```

### Implementação do refresh JWT (API)

O refresh token usa HS256 implementado com `node:crypto` nativo (sem `@fastify/jwt` duplicado, que causava problemas de registro em Fastify v5). O signer/verifier (`createRefreshJwt`) é decorado em `fastify.refresh` pelo plugin `auth.plugin.ts`. A validação de assinatura usa `timingSafeEqual` para resistência a timing attacks.

### Controle de acesso por papel

```typescript
// Hierarquia: ADMIN > TREASURER > COACH > PHYSIO > SCOUT
const isAdmin = user?.role === "ADMIN";

// Roles disponíveis no schema público (public.users):
// ADMIN     — CRUD completo em sócios, planos, contratos; acesso total
// TREASURER — visão de leitura financeira, sem ações destrutivas
// COACH     — acesso ao módulo esportivo (v1.5+); sem acesso financeiro
// PHYSIO    — acesso ao prontuário médico (v2.0+); dados clínicos isolados
// SCOUT     — acesso somente ao ScoutLink (v3.0+); sem dados internos do clube
```

O campo `role` é lido do JWT — nunca do estado local mutável. No backend, o decorator `requireRole('ADMIN')` aplica a hierarquia por rota.

> **Nota v1.0:** apenas os roles `ADMIN` e `TREASURER` são ativos no MVP. `COACH`, `PHYSIO` e `SCOUT` existem no schema para evitar migração ao ativar os módulos correspondentes nas versões v1.5, v2.0 e v3.0.

---

## Arquitetura Offline-First (Crítica para Adoção)

O maior risco de abandono da plataforma é o campo sem sinal. A solução não é "tentar novamente mais tarde" — é operar localmente como se o servidor não existisse.

Esta seção define a arquitetura alvo para v1.5+. A infraestrutura de PWA (manifest, Service Worker base) pode ser provisionada na v1.0 sem funcionalidade offline completa, reduzindo o delta de implementação.

### Camadas do Offline-First

```
┌─────────────────────────────────────────────┐
│              App Mobile (PWA)               │
│                                             │
│  Ação do usuário (ex: registrar presença)   │
│              ↓                              │
│  Escreve no IndexedDB local (Dexie.js)      │
│              ↓                              │
│  UI atualiza imediatamente (otimista)       │
│              ↓ (quando sinal retorna)       │
│  Service Worker / Background Sync           │
│  lê fila de pendentes → POST /api/...       │
│              ↓                              │
│  Servidor confirma → marca como synced      │
│              ↓                              │
│  Conflitos: timestamp + last-write-wins     │
└─────────────────────────────────────────────┘
```

### Funcionalidades com suporte Offline Completo (v1.5+)

| Funcionalidade                    | Armazenamento local        | Sync strategy                        |
| --------------------------------- | -------------------------- | ------------------------------------ |
| Registro de presença em treino    | IndexedDB (Dexie)          | Background Sync + retry 3x           |
| Anotações de carga/RPE do técnico | IndexedDB (Dexie)          | Background Sync                      |
| Ficha de atleta (leitura)         | Cache API (Service Worker) | Stale-while-revalidate               |
| Registro de lesão/queixa          | IndexedDB (Dexie)          | Background Sync + criptografia local |
| Resultado parcial de jogo         | IndexedDB (Dexie)          | Background Sync                      |

---

## Dashboard em Tempo Real — SSE

O dashboard usa Server-Sent Events para invalidar o cache React Query sem polling.

```
GET /api/events?token=<accessToken>   (EventSource, credenciais incluídas)
         |
         | Evento: PAYMENT_CONFIRMED
         ▼
queryClient.invalidateQueries(DASHBOARD_QUERY_KEY)
queryClient.invalidateQueries(CHARGES_HISTORY_QUERY_KEY)
queryClient.invalidateQueries(OVERDUE_MEMBERS_QUERY_KEY)
```

**Estratégia de token:** EventSource não suporta headers customizados, então o token é passado como query param `?token=`. O servidor faz o strip desse parâmetro nos logs (pino redact). O auto-reconnect nativo do EventSource reexecuta `connect()`, que chama `getAccessToken()` — transparentemente renovando o token via cookie quando necessário.

**Implementação (API):**

- Rota registrada **fora** de `protectedRoutes` para gerenciar autenticação manualmente (padrão EventSource não suporta header `Authorization`).
- Heartbeat de `:keepalive\n\n` a cada 25s previne timeout de proxies.
- `sseBus` é um `EventEmitter` in-process com namespace `club:{clubId}` — isolamento por tenant estrutural (sem vazamento cross-club).
- O worker de webhook chama `emitPaymentConfirmed(clubId, payload)` após `handlePaymentReceived` bem-sucedido.
- **Scaling note:** para múltiplos processos, substituir o corpo de `emitPaymentConfirmed` por `redis.publish("club:{clubId}", json)` e `sseBus.on` por `redis.subscribe`. Interface idêntica — apenas `sse-bus.ts` e `events.routes.ts` mudam.

---

## Integrações de Pagamento — Gateway Abstraction + Multi-Acquiring

A camada de pagamento do ClubOS é **agnóstica ao provedor** e **resiliente a falhas de gateway**. Nenhum módulo de negócio (`ChargeService`, jobs, webhooks) acessa um gateway diretamente — tudo passa pela interface `PaymentGateway` e é resolvido pelo `GatewayRegistry`.

### Interface central

```typescript
interface PaymentGateway {
  readonly name: string; // "asaas" | "pagarme" | ...
  readonly supportedMethods: ReadonlyArray<PaymentMethod>;

  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  cancelCharge(externalId: string): Promise<void>;
  parseWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookEvent;
}
```

### Fluxo Multi-Acquiring (PIX com fallback silencioso)

```
ChargeService.createCharge()
       ↓
GatewayRegistry.forMethod('PIX')  →  [AsaasGateway]
       ↓ timeout / erro?
                           →  [PagarmeGateway]      (fallback 1)
       ↓ timeout / erro?
                           →  [StripeGateway]        (fallback 2 — se STRIPE_ENABLED=true)
       ↓ timeout / erro?
                           →  PIX estático do clube  (fallback final)
       ↓
Notificação ao clube: "Cobrança gerada via PIX manual — confirmar recebimento"
```

**Resultado:** zero perda de receita na data de vencimento por indisponibilidade do gateway primário. O fallback é silencioso para o sócio; o clube recebe notificação para confirmação manual apenas no fallback final.

### Métodos de pagamento suportados

| Método           | Enum            | Gateway atual                           | Status                                       |
| ---------------- | --------------- | --------------------------------------- | -------------------------------------------- |
| Pix              | `PIX`           | Asaas → Pagarme → Stripe → PIX estático | ✅ Asaas · ⬜ Pagarme/Stripe/fallback (M11)  |
| Cartão (Stripe)  | `CREDIT_CARD`   | Stripe (internacional)                  | ⬜ Pendente (M11 / expansão internacional)   |
| Cartão de débito | `DEBIT_CARD`    | Asaas                                   | ✅ Implementado                              |
| Boleto           | `BOLETO`        | Asaas                                   | ✅ Implementado                              |
| Dinheiro         | `CASH`          | — (offline)                             | ✅ Implementado (short-circuit, sem gateway) |
| Transferência    | `BANK_TRANSFER` | — (offline)                             | ✅ Implementado (short-circuit, sem gateway) |

### Estrutura de arquivos (implementada + planejada)

```
apps/api/src/modules/payments/
├── gateway.interface.ts       # Interface PaymentGateway + tipos
├── gateway.registry.ts        # GatewayRegistry — register, get(name), forMethod(method) com fallback
└── gateways/
    ├── index.ts               # Bootstrap: registerGateways()
    ├── asaas.gateway.ts       # AsaasGateway ✅
    ├── pagarme.gateway.ts     # PagarmeGateway ⬜ (fallback PIX — M11)
    └── stripe.gateway.ts      # StripeGateway ⬜ (fallback PIX BR + expansão internacional — M11)
```

### Asaas (gateway primário do MVP)

| Aspecto               | Decisão                                  | Detalhe                                                                          |
| --------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| PSP principal         | Asaas                                    | Suporte a PIX com webhook; sandbox via flag `sandbox: NODE_ENV !== 'production'` |
| Modelo de cobrança    | PIX com vencimento + QR Code             | Retorna `qrCodeBase64` + `pixCopyPaste` salvos em `gatewayMeta`                  |
| Idempotência          | `externalReference = chargeId`           | Re-submit do mesmo chargeId retorna a cobrança existente no Asaas                |
| Tratamento de falha   | Erro capturado, job retentado            | `gatewayErrors[]`; backoff 1h/6h/24h; `PENDING_RETRY` após 3x                    |
| Webhook signature     | Header `asaas-access-token`              | Comparação via `timingSafeEqual` (timing-safe)                                   |
| Mapeamento de eventos | `PAYMENT_RECEIVED` + `PAYMENT_CONFIRMED` | Ambos resultam no mesmo handler `handlePaymentReceived`                          |

### Stripe (gateway internacional — M11)

| Aspecto           | Decisão                                       | Detalhe                                                                               |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------------------- |
| Ativação          | `STRIPE_ENABLED=true` (env)                   | Desabilitado por padrão; sem impacto em deploys que não configurem a variável         |
| PIX Brasil        | Stripe Brazil (`payment_method_types: [pix]`) | Retorna `next_action.pix_display_qr_code`; mapeado para `qrCodeBase64 + pixCopyPaste` |
| Webhook signature | Header `stripe-signature`                     | Verificação via `stripe.webhooks.constructEvent` (timing-safe nativo do SDK)          |
| Idempotência      | `idempotencyKey = chargeId`                   | Passado no header `Idempotency-Key` da Stripe                                         |
| Expansão futura   | Cartão internacional, Apple Pay, Google Pay   | Mesma interface `PaymentGateway`; sem alteração nos serviços de negócio               |

### WhatsApp — Régua de Cobrança

| Aspecto               | Decisão                                 | Detalhe                                                                                  |
| --------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------- |
| Providers             | Z-API + Evolution API (self-hosted)     | Selecionado via `WHATSAPP_PROVIDER` env var; `WhatsAppRegistry` abstrai o provider ativo |
| Templates             | D-3, D+3, on-demand                     | `TEMPLATE_KEYS` enum; customizáveis por clube via `message_templates`                    |
| D-0 (vencimento hoje) | ⬜ Não implementado como job automático | Aguarda sprint seguinte; on-demand cobre parcialmente                                    |
| Rate limiting         | 30 mensagens/minuto por clube           | Lua atômica no Redis (`CHECK_AND_CONSUME_LUA`), ZSET sliding window                      |
| Idempotência          | Janela de 20h por (memberId, template)  | `hasRecentMessage` — ignora apenas FAILED; previne duplicate sends em retry de job       |
| Fallback e-mail       | Resend, ativado após ≥ 1 falha em 48h   | `countRecentFailedWhatsAppMessages ≥ 1` → `sendEmailFallbackMessage`                     |
| On-demand             | `POST /api/members/:id/remind`          | Cooldown 4h, consome rate limit do clube, cobrança OVERDUE mais antiga                   |

---

## Motor de Regras Esportivas (Compliance CBF/FPF)

Regras de elegibilidade e janelas de transferência **nunca entram em hard code**. São parametrizadas em um motor desacoplado gerenciável via Backoffice sem deploy.

```
┌────────────────────────────────────────────┐
│          Sports Rules Engine               │
│                                            │
│  rules_config (JSONB por temporada/liga)   │
│  ├─ transfer_window: { start, end }        │
│  ├─ max_foreign_players: 5                 │
│  ├─ bid_submission_deadline: "23:59"       │
│  ├─ min_rest_days_between_matches: 2       │
│  └─ card_suspension_thresholds: {...}      │
│                                            │
│  RulesValidator.check(athlete, ruleSet)    │
│  → { eligible: bool, warnings: string[] }  │
└────────────────────────────────────────────┘
```

**Por quê:** Regras da CBF, FPF e ligas regionais mudam anualmente. Uma escalação irregular pode custar pontos ou exclusão do campeonato. O risco é jurídico e reputacional, e não pode depender de um deploy para ser corrigido.

### Estrutura de arquivos (a implementar — M10)

```
apps/api/src/modules/contracts/
├── contracts.routes.ts        # GET/POST/PUT /api/contracts
├── contracts.service.ts       # CRUD + alertas de vencimento
├── rules-engine/
│   ├── rules.interface.ts     # RuleSet, ValidationResult
│   ├── rules.validator.ts     # RulesValidator.check()
│   └── rules.config.ts        # DEFAULT_RULES_CONFIG (CBF 2025)
└── bid-alert.service.ts       # Alertas WhatsApp/e-mail de BID pendente
```

---

## Privacy by Design — Dados de Menores

O módulo de peneiras e base (sub-17, sub-15 etc.) envolve dados biométricos de crianças — a categoria de maior risco sob a LGPD.

### Hard Stops implementados e planejados

1. **Inscrição bloqueada sem Assinatura de Aceite Parental digital** — sem bypass possível via código (v1.5)
2. **Dados biométricos de menores:** criptografia AES-256 + acesso restrito por `role = PHYSIO | ADMIN`
3. **ScoutLink:** atleta menor nunca contatado diretamente — toda comunicação mediada pela plataforma com log imutável (v3.0)
4. **Purge automático:** dados de prospects em peneiras expiram em 24 meses por padrão, configurável pelo clube dentro dos limites legais (v1.5)
5. **Audit log de acesso:** qualquer leitura de dado sensível de menor gera entrada em `data_access_log` (v1.5)

### Criptografia de CPF e Telefone (v1.0 — implementado)

CPF e telefone são armazenados como `BYTEA` (coluna Prisma `Bytes`). O fluxo:

```
Escrita: encryptField(prisma, plaintext)
  → pgp_sym_encrypt(text, key) via $queryRaw
  → retorna Uint8Array<ArrayBuffer> (compatível com Prisma 6 Bytes)

Leitura: decryptField(prisma, ciphertext)
  → pgp_sym_decrypt(bytea, key) via $queryRaw
  → retorna string plaintext

Busca: findMemberByCpf(prisma, cpf)
  → WHERE pgp_sym_decrypt(cpf::bytea, key) = $cpf (full-table scan)
  → aceitável para v1 (~centenas de sócios por clube)
```

A constraint `@unique` no CPF foi removida (ciphertexts diferentes para mesmo plaintext). A unicidade é garantida em nível de aplicação via `findMemberByCpf`.

---

## Arquitetura Multi-Tenancy

Cada clube é um tenant isolado. A estratégia adotada é **schema-per-tenant** no PostgreSQL: cada clube tem seu próprio schema (`clube_{id}`). Isso garante isolamento total de dados sem complexidade de Row-Level Security no código da aplicação.

O schema correto é selecionado em cada request via `SET search_path TO "clube_{clubId}", public`, executado pelo helper `withTenantSchema` em `src/lib/prisma.ts`.

### Provisionamento de Schema Tenant (Implementado)

`provisionTenantSchema(prisma, clubId)` em `src/lib/tenant-schema.ts`:

1. `CREATE EXTENSION IF NOT EXISTS pgcrypto` (schema public)
2. `CREATE SCHEMA IF NOT EXISTS "clube_{clubId}"`
3. Transação: `SET search_path` → enums DDL → tabelas DDL → índices DDL → FKs DDL

Todos os blocos DDL são idempotentes (`IF NOT EXISTS`, `DO $$ EXCEPTION duplicate_object`). Pode ser re-executado com segurança.

### Schema Master (public)

```
public.clubs          -- cadastro master de clubes (tenant registry)
public.users          -- usuários globais (role: ADMIN | TREASURER | COACH | PHYSIO | SCOUT)
```

> **Nota:** roles `COACH`, `PHYSIO` e `SCOUT` existem no schema desde a v1.0 para evitar migração ao ativar os módulos v1.5, v2.0 e v3.0. Não são atribuídos nem expostos na UI no MVP.

### Schema por Tenant (clube\_{id})

```
Financeiro:
  clube_{id}.members           -- sócios do clube (CPF e telefone: BYTEA, pgcrypto AES-256)
  clube_{id}.plans             -- planos de sócio configuráveis
  clube_{id}.member_plans      -- vínculo sócio-plano com histórico (startedAt/endedAt)
  clube_{id}.charges           -- cobranças geradas (agnósticas ao gateway; gatewayMeta JSONB)
  clube_{id}.payments          -- pagamentos confirmados (imutáveis; só cancelados com motivo)
  clube_{id}.audit_log         -- histórico de ações financeiras e de sócios (compliance; nunca deletado)

Comunicação:
  clube_{id}.messages          -- log de WhatsApp/e-mail (audit trail da régua de cobrança)
  clube_{id}.message_templates -- overrides de template por clube

Esportivo (v1.0 — stub; expandido na v1.5):
  clube_{id}.athletes          -- cadastro de atletas (identidade + vínculo ao clube) ⬜ M9
  clube_{id}.contracts         -- vínculos trabalhistas + alertas de BID/CBF ⬜ M10

Esportivo (v1.5+):
  clube_{id}.training_sessions -- sessões de treino planejadas
  clube_{id}.attendance_logs   -- presenças por sessão (offline-first, Background Sync)

Saúde (v2.0+):
  clube_{id}.medical_records   -- prontuário esportivo (criptografado; PHYSIO | ADMIN only)
  clube_{id}.injury_protocols  -- protocolos de retorno ao jogo
  clube_{id}.return_to_play    -- status RTP por atleta (visível ao COACH: status apenas)

Operações (v2.5+):
  clube_{id}.events            -- eventos/jogos configurados
  clube_{id}.ticket_sales      -- ingressos vendidos
  clube_{id}.field_access_logs -- log de acesso via QR Code

Compliance (v2.0+):
  clube_{id}.balance_sheets    -- balanços publicados (hash SHA-256 imutável)
  clube_{id}.creditor_disclosures -- lista de credores (Lei 14.193/2021)
  clube_{id}.consent_records   -- aceites parentais digitais (v1.5+)
```

> **Nota:** tabelas de versões futuras são listadas para visibilidade de planejamento de schema. Apenas as tabelas do grupo **Financeiro**, **Comunicação** e os stubs de **Esportivo (v1.0)** são provisionadas na v1.0.

### Segurança de ClubId

`assertValidClubId(clubId)` valida que o clubId segue o padrão cuid2 (`/^[a-z0-9]{20,30}$/`) antes de interpolá-lo no nome do schema — prevenindo SQL injection via schema name mesmo em casos extremos.

**Plano de migração:** ao atingir 300 clubes ativos, avaliar transição para Row-Level Security com particionamento por `club_id` para reduzir overhead de conexões. A interface `withTenantSchema` isola essa troca do restante do código.

---

## Modelo de Dados — Entidades Principais (v1.0)

| Entidade            | Campos-chave                                                                                   | Relacionamentos            | Observação                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------- |
| `clubs`             | id, slug, name, plan_tier, pixKeyFallback, created_at                                          | 1:N members, plans         | Tenant root; `pixKeyFallback` para Multi-Acquiring (M11)                            |
| `users`             | id, email, password (bcrypt), role, clubId                                                     | N:1 clubs                  | Auth global; role: ADMIN \| TREASURER \| COACH \| PHYSIO \| SCOUT                   |
| `members`           | id, name, cpf (BYTEA), phone (BYTEA), email, status, joined_at                                 | N:M plans via member_plans | CPF/phone: AES-256 pgcrypto                                                         |
| `plans`             | id, name, price_cents, interval, benefits[], isActive                                          | N:M members                | interval: `monthly \| quarterly \| annual`; soft delete via isActive                |
| `member_plans`      | id, memberId, planId, startedAt, endedAt                                                       | N:1 members, plans         | endedAt=null = plano ativo; histórico preservado                                    |
| `charges`           | id, member_id, amount_cents, due_date, status, method, gateway_name, external_id, gateway_meta | N:1 members                | Agnóstica ao gateway. `gateway_meta` (JSONB) armazena dados específicos do provider |
| `payments`          | id, charge_id, paid_at, method, gateway_txid, cancelledAt, cancelReason                        | 1:1 charges                | Imutável. `gatewayTxid` @unique — idempotência DB-level                             |
| `messages`          | id, member_id, channel, template, status, sentAt, failReason                                   | N:1 members                | Auditoria de toda régua de cobrança; inclui fallback e-mail                         |
| `message_templates` | id, key, channel, body, isActive                                                               | —                          | Override por clube; @unique(key, channel); fallback para DEFAULT_TEMPLATES          |
| `audit_log`         | id, memberId?, actorId?, action, entityId, entityType, metadata, createdAt                     | N:1 members (nullable)     | Imutável; ações financeiras obrigatórias                                            |
| `athletes`          | id, name, cpf (BYTEA), birthDate, position, status, clubId                                     | N:1 clubs                  | ⬜ M9 — stub de identidade; sem lógica esportiva na v1.0                            |
| `contracts`         | id, athleteId, type, startDate, endDate, status, bidRegistered                                 | N:1 athletes               | ⬜ M10 — vínculos trabalhistas + flag de registro BID                               |

### Sobre o campo `gatewayMeta`

O campo `gatewayMeta` (JSONB) em `Charge` absorve dados específicos de cada combinação provider + método sem poluir o schema principal:

| `method`                     | Shape de `gatewayMeta`                            |
| ---------------------------- | ------------------------------------------------- |
| `PIX`                        | `{ qrCodeBase64: string, pixCopyPaste: string }`  |
| `BOLETO`                     | `{ bankSlipUrl: string, invoiceUrl?: string }`    |
| `CREDIT_CARD` / `DEBIT_CARD` | `{ invoiceUrl: string }`                          |
| `CASH` / `BANK_TRANSFER`     | `{}` (sem dados externos)                         |
| `PIX_STATIC` (fallback M11)  | `{ pixKey: string, manualConfirmRequired: true }` |

---

## Fluxo de Cobrança — Ciclo Completo (Implementado)

```
[Job Scheduler — BullMQ cron "0 8 1 * *"]
         |
         | Dia 1 de cada mês, 08h UTC
         ▼
[startChargeDispatchWorker] → busca todos os clubes → enfileira
  generate-{clubId}-{YYYY-MM} (jobId estável, deduplicação BullMQ)
         |
         ▼
[startChargeGenerationWorker] (concurrency=5)
  → generateMonthlyCharges(prisma, clubId, actorId)
  → Para cada MemberPlan ativo (member.status=ACTIVE, plan.isActive=true):
      1. hasExistingCharge() — skip se já cobrado no período
      2. tx.charge.create(status=PENDING, method=PIX)
      3. tx.auditLog.create(CHARGE_GENERATED)
      4. dispatchChargeToGateway() — fora da transação
         → GatewayRegistry.forMethod('PIX')
         → AsaasGateway.createCharge()  [fallback: PagarmeGateway → PIX estático]  ⬜ M11
         → atualiza charge com externalId + gatewayMeta
  → Falha: backoff 1h/6h/24h; exaustão → markChargesPendingRetry()

[Régua D-3 — BullMQ cron "0 9 * * *"]
  → startBillingReminderDispatchWorker → enfileira d3-{clubId}-{date}
  → startBillingReminderWorker (concurrency=5)
  → sendDailyRemindersForClub: cobranças PENDING com dueDate em D+3
      → checkAndConsumeWhatsAppRateLimit (Lua Redis, 30/min)
      → hasRecentMessage (idempotência 20h)
      → buildRenderedMessage (template resolvido + vars substituídas)
      → sendWhatsAppMessage → WhatsAppRegistry.get() → ZApiProvider/EvolutionProvider
      → fallback email se ≥ 1 falha WA em 48h

[Régua D-0 — BullMQ cron "0 8 * * *"]  ⬜ Pendente (S9)
  → startDueTodayDispatchWorker → enfileira due-{clubId}-{date}
  → sendDueTodayNoticesForClub: cobranças PENDING com dueDate = hoje

[Régua D+3 (overdue) — BullMQ cron "0 10 * * *"]
  → startOverdueNoticeDispatchWorker → enfileira overdue-{clubId}-{date}
  → startOverdueNoticeWorker (concurrency=5)
  → sendOverdueNoticesForClub: cobranças PENDING/OVERDUE com dueDate em D-3
  → (mesmo fluxo de rate limiting + idempotência + fallback e-mail)

[POST /webhooks/asaas]
         |
         | AsaasGateway.parseWebhook() — HMAC timingSafeEqual
         ▼
  enqueueWebhookEvent(queue, "asaas", event)
  → jobId: "webhook:asaas:{gatewayTxId}" (deduplicação)
  → responde 200 imediatamente

[startWebhookWorker] (concurrency=5)
  → resolveClubIdFromChargeId(externalReference) — scan multi-tenant
  → hasExistingPayment(gatewayTxid) — idempotência DB-level
  → handlePaymentReceived(prisma, clubId, event):
      tx: charge.findUnique → payment.create → charge → PAID
          → member.status → ACTIVE se era OVERDUE
          → auditLog.create(PAYMENT_CONFIRMED)
  → emitPaymentConfirmed(clubId, payload) → sseBus → SSE → React Query invalidation
```

---

## Jobs Assíncronos — Arquitetura de Filas

### Filas independentes

| Fila                | Propósito                             | Retry                         | Concorrência |
| ------------------- | ------------------------------------- | ----------------------------- | ------------ |
| `charge-generation` | Geração mensal de cobranças           | 3x backoff custom (1h/6h/24h) | 5            |
| `billing-reminders` | Lembretes D-3 por WhatsApp            | 2x exponential (5s base)      | 5            |
| `due-today-notices` | Avisos D-0 ⬜                         | 2x exponential (5s base)      | 5            |
| `overdue-notices`   | Avisos D+3 por WhatsApp               | 2x exponential (5s base)      | 5            |
| `webhook-events`    | Processamento de webhooks de gateways | 3x exponential (1s base)      | 5            |

### Padrão fan-out (dispatch + worker)

Todas as filas de billing seguem o mesmo padrão:

1. **Cron** dispara um job de dispatch (concurrency=1)
2. **Dispatch worker** busca todos os clubes e enfileira um job por clube com **jobId estável** (`d3-{clubId}-{date}`, `overdue-{clubId}-{date}`, `generate-{clubId}-{YYYY-MM}`)
3. **Worker per-clube** (concurrency=5) processa cada clube independentemente

JobId estável = idempotência no nível da fila. Se o cron disparar duas vezes no mesmo dia (crash/restart), BullMQ não enfileira duplicatas.

### Rate limiting WhatsApp (Lua atômica)

```lua
-- KEYS[1] = "whatsapp_rate_limit:{clubId}"  (ZSET)
-- Expira entradas fora da janela de 60s
-- Se count >= 30: retorna [0, count, oldest_score]
-- Senão: ZADD, EXPIRE, retorna [1, count+1, 0]
```

A lógica em Lua é executada atomicamente pelo Redis — previne race condition em workers concorrentes (TOCTOU).

---

## Estrutura do Monorepo

```
clubos/
├── apps/
│   ├── web/                        # Next.js 16 + React 19 (browser/desktop)
│   │   └── src/app/
│   │       ├── (marketing)/        # Landing, preços, contato — layout público  ✅
│   │       ├── (app)/              # Painel autenticado — sidebar + auth guard   ✅
│   │       │   ├── dashboard/      # DashboardClient com SSE                     ✅
│   │       │   ├── members/        # MembersPage + CSV import                    ✅/⬜
│   │       │   ├── plans/          # PlansPage                                   ✅
│   │       │   ├── charges/        # ChargesPage (QR Code + status)              ⬜ M3
│   │       │   ├── athletes/       # AthletesPage (stub)                         ⬜ M9
│   │       │   └── contracts/      # ContractsPage (BID/CBF alerts)              ⬜ M10
│   │       ├── (auth)/             # Login                                       ✅
│   │       └── (onboarding)/       # Wizard de cadastro de clube                 ✅
│   └── api/                        # Fastify (backend)                           ✅
│       └── src/
│           ├── modules/
│           │   ├── auth/           # login, refresh, logout, me                  ✅
│           │   ├── clubs/          # create, upload logo                         ✅
│           │   ├── members/        # CRUD, CSV import, remind                    ✅
│           │   ├── plans/          # CRUD                                        ✅
│           │   ├── charges/        # generate (manual + cron)                    ✅
│           │   ├── dashboard/      # summary, charges-history, overdue-members   ✅
│           │   ├── templates/      # list, upsert, reset                         ✅
│           │   ├── messages/       # list (audit trail)                          ✅
│           │   ├── events/         # SSE PAYMENT_CONFIRMED                       ✅
│           │   ├── webhooks/       # receive + BullMQ worker                     ✅
│           │   ├── payments/       # GatewayRegistry + AsaasGateway             ✅
│           │   ├── whatsapp/       # WhatsAppRegistry + ZApi + Evolution         ✅
│           │   ├── email/          # email-fallback.service                      ✅
│           │   ├── athletes/       # stub — schema + CRUD base                   ⬜ M9
│           │   └── contracts/      # vínculos + Motor de Regras + BID alerts     ⬜ M10
│           ├── jobs/
│           │   ├── charge-generation/  # dispatch + generation workers           ✅
│           │   ├── billing-reminders/  # dispatch + reminder workers (D-3)       ✅
│           │   ├── due-today-notices/  # dispatch + D-0 workers                  ⬜ S9
│           │   └── overdue-notices/    # dispatch + notice workers (D+3)         ✅
│           ├── plugins/            # auth, sensible, security-headers            ✅
│           └── lib/                # prisma, redis, crypto, tokens, storage      ✅
└── packages/
    ├── shared-types/               # tipos TypeScript compartilhados
    ├── ui/                         # componentes compartilhados
    └── config/                     # tsconfig, eslint, prettier bases
```
