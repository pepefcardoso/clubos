# Design Doc (RFC) — ClubOS v1.0

> **Status:** Vivo — decisões técnicas tornam-se definitivas após revisão de 48h sem objeção.
> **Módulo:** Gestão Financeira & Sócios
> **Versão:** 1.0

---

## Visão Técnica

O ClubOS v1.0 é um SaaS multi-tenant voltado exclusivamente para clubes de futebol amador e semiprofissional no Brasil. Seu objetivo técnico central é processar cobranças recorrentes via Pix, manter um cadastro confiável de sócios e gerar alertas de inadimplência com zero intervenção manual do operador do clube.

### Princípios de Arquitetura

- **Simplicidade operacional** — o sistema deve funcionar em celular Android 4G sem treinamento formal.
- **Confiabilidade financeira** — falhas no fluxo de cobrança custam dinheiro real ao clube. Disponibilidade > 99,5%.
- **Velocidade de entrega** — arquitetura que permita um MVP funcional em 30 dias por um time pequeno (1–2 devs).

---

## Stack Tecnológica

### Front-end

| Tecnologia             | Versão  | Justificativa                                                        | Status         |
| ---------------------- | ------- | -------------------------------------------------------------------- | -------------- |
| Next.js                | 16.1.6  | SSR nativo, bom SEO para portal público, ecossistema React maduro    | ✅ Implementado |
| React                  | 19.2.4  | Concurrent features; Server Components nativos no App Router         | ✅ Implementado |
| TypeScript             | 5.9.3   | Tipagem evita bugs de runtime em fluxos financeiros críticos         | ✅ Implementado |
| Tailwind CSS           | 3.4.19  | Velocidade de UI sem CSS custom; tokens de design via config         | ✅ Implementado |
| shadcn/ui              | latest  | Componentes acessíveis, sem dependência pesada; copia código no repo | ✅ Implementado |
| React Query (TanStack) | 5.90.21 | Cache e sincronização de estado servidor — elimina boilerplate       | ✅ Implementado |
| React Hook Form + Zod  | 7.71 / 4.3.6 | Validação de formulários financeiros no client antes de bater na API | ✅ Implementado |
| Recharts               | 3.7.0   | Gráfico de histórico de cobranças no dashboard                       | ✅ Implementado |
| Resend                 | 6.9.3   | Envio de e-mail para formulário de contato (marketing)               | ✅ Implementado |

> **Nota:** a versão Next.js foi atualizada de 14 para 16.1.6 e React de 18 para 19 durante o desenvolvimento. O App Router e a estrutura de route groups permanece conforme projetado.

### Back-end

| Tecnologia                  | Versão                    | Justificativa                                                             | Status          |
| --------------------------- | ------------------------- | ------------------------------------------------------------------------- | --------------- |
| Node.js + Fastify           | Node 20 LTS / Fastify 5.x | Performance superior ao Express; schema validation nativo via JSON Schema | ✅ Implementado  |
| TypeScript                  | 5.x                       | Consistência full-stack; tipos compartilhados entre front e back          | ✅ Implementado  |
| Prisma ORM                  | 6.x                       | Migrations versionadas, type-safe queries, multi-tenant via search_path   | ✅ Implementado  |
| Zod                         | 4.x                       | Validação de payloads na entrada da API; compartilhado com front-end      | ✅ Implementado  |
| BullMQ + Redis              | latest                    | Filas de jobs assíncronos para cobranças recorrentes e WhatsApp           | ✅ Implementado  |
| JWT + Refresh Tokens        | —                         | Auth stateless; refresh token rotativo em httpOnly cookie                 | ✅ Implementado  |
| PapaParse                   | 5.x                       | Parse de CSV para importação de sócios (até 5.000 linhas, batches 500)   | ✅ Implementado  |
| Sharp                       | 0.33.x                    | Resize/conversão de logo para WebP 200×200px                              | ✅ Implementado  |
| Resend SDK                  | 6.x                       | E-mail transacional (boas-vindas ao clube, fallback de cobrança)          | ✅ Implementado  |

### Banco de Dados

| Tecnologia    | Justificativa                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 15 | Banco principal. ACID completo para transações financeiras. JSONB para metadados de gateway. Schema-per-tenant para multi-tenancy. |
| Redis 7       | Cache de sessão, filas BullMQ, rate limiting por clube (WhatsApp 30 msg/min), pub/sub de notificações em tempo real.               |

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
│   └── plans/page.tsx      # PlansPage                                   ✅
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

- **Mockups baseados em código:** Em vez de importar imagens `.png` pesadas ou exportadas do Figma, os elementos demonstrativos (mensagens do bot, comprovativos de Pix) são componentes React construídos com Tailwind. Isso garante escalabilidade, facilidade de manutenção (se o texto mudar, mudamos no código) e performance (zero bytes de rede gastos em imagens).
- **Grids Assimétricos (Bento Grids):** A secção de funcionalidades utilizará CSS Grid para criar composições variadas, prendendo a atenção do utilizador muito melhor do que listas ou cards simétricos tradicionais.
- **Micro-interações de Storytelling:** Componentes de marketing usam Tailwind Animate para revelar informações em scroll, ajudando a guiar o olhar do "lead" pelo fluxo de valor da aplicação.

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
const isAdmin = user?.role === "ADMIN";
// Tesoureiro: visão de leitura, sem ações destrutivas
// Admin: CRUD completo em sócios, planos; acesso a todas as ações
```

O campo `role` é lido do JWT — nunca do estado local mutável. Componentes verificam `isAdmin` para exibir/ocultar botões de ação (ex: "Novo sócio", "Excluir plano"). No backend, o decorator `requireRole('ADMIN')` aplica a hierarquia `ADMIN > TREASURER` por rota.

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

## Integrações de Pagamento — Gateway Abstraction

A camada de pagamento do ClubOS é **agnóstica ao provedor**. Nenhum módulo de negócio (`ChargeService`, jobs, webhooks) acessa um gateway diretamente — tudo passa pela interface `PaymentGateway` e é resolvido pelo `GatewayRegistry`.

O desacoplamento tem custo baixo agora e elimina um refactor caro ao adicionar Pagarme, Stripe ou métodos offline futuramente.

### Interface central

```typescript
interface PaymentGateway {
  readonly name: string; // "asaas" | "pagarme" | ...
  readonly supportedMethods: ReadonlyArray<PaymentMethod>;

  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  cancelCharge(externalId: string): Promise<void>;
  parseWebhook(rawBody: Buffer, headers: Record<string, ...>): WebhookEvent;
}
```

### Métodos de pagamento suportados

| Método            | Enum            | Gateway atual | Status         |
| ----------------- | --------------- | ------------- | -------------- |
| Pix               | `PIX`           | Asaas         | ✅ Implementado |
| Cartão de crédito | `CREDIT_CARD`   | Asaas         | ✅ Implementado |
| Cartão de débito  | `DEBIT_CARD`    | Asaas         | ✅ Implementado |
| Boleto            | `BOLETO`        | Asaas         | ✅ Implementado |
| Dinheiro          | `CASH`          | — (offline)   | ✅ Implementado (short-circuit, sem gateway) |
| Transferência     | `BANK_TRANSFER` | — (offline)   | ✅ Implementado (short-circuit, sem gateway) |

### Estrutura de arquivos (implementada)

```
apps/api/src/modules/payments/
├── gateway.interface.ts       # Interface PaymentGateway + tipos (WebhookSignatureError, WebhookEvent, etc.)
├── gateway.registry.ts        # GatewayRegistry — register, get(name), forMethod(method), list(), _reset()
└── gateways/
    ├── index.ts               # Bootstrap: registerGateways() — instancia e registra no startup
    ├── asaas.gateway.ts       # AsaasGateway (PIX, cartão, boleto; HMAC timingSafeEqual; sandbox flag)
    ├── pagarme.gateway.ts     # (futuro)
    └── stripe.gateway.ts      # (futuro)
```

### Como adicionar um novo gateway

1. Criar `gateways/<provider>.gateway.ts` implementando `PaymentGateway`
2. Registrar em `gateways/index.ts` com `GatewayRegistry.register(new ProviderGateway(...))`
3. Adicionar as env vars necessárias no `.env.example`

Nenhum outro arquivo precisa mudar.

### Asaas (gateway primário do MVP) — Implementado

| Aspecto                   | Decisão                       | Detalhe                                                                     |
| ------------------------- | ----------------------------- | --------------------------------------------------------------------------- |
| PSP principal             | Asaas                         | Suporte a Pix com webhook; sandbox via flag `sandbox: NODE_ENV !== 'production'` |
| Modelo de cobrança        | Pix com vencimento + QR Code  | Retorna `qrCodeBase64` + `pixCopyPaste` salvos em `gatewayMeta`             |
| Idempotência              | `externalReference = chargeId` | Re-submit do mesmo chargeId retorna a cobrança existente no Asaas           |
| Tratamento de falha       | Erro capturado, job retentado  | Gateway errors → `gatewayErrors[]`; backoff 1h/6h/24h; PENDING_RETRY após 3x |
| Webhook signature         | Header `asaas-access-token`   | Comparação via `timingSafeEqual` (timing-safe)                              |
| Mapeamento de eventos     | `PAYMENT_RECEIVED` + `PAYMENT_CONFIRMED` → `PAYMENT_RECEIVED` | Ambos eventos do Asaas resultam no mesmo handler |

### WhatsApp — Régua de Cobrança (Implementada)

| Aspecto              | Decisão                              | Detalhe                                                                                  |
| -------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| Providers            | Z-API + Evolution API (self-hosted)  | Selecionado via `WHATSAPP_PROVIDER` env var; `WhatsAppRegistry` abstrai o provider ativo |
| Templates            | D-3, D+3, on-demand                  | `TEMPLATE_KEYS` enum; customizáveis por clube via `message_templates` tenant table       |
| D-0 (vencimento hoje)| Não implementado como job automático | Aguarda próxima sprint; on-demand cobre parcialmente                                     |
| Rate limiting        | 30 mensagens/minuto por clube        | Lua atômica no Redis (`CHECK_AND_CONSUME_LUA`), ZSET sliding window, `timingSafeEqual` não aplicável aqui |
| Idempotência         | Janela de 20h por (memberId, template) | `hasRecentMessage` — ignora apenas FAILED; previne duplicate sends em retry de job     |
| Fallback e-mail      | Resend, ativado após ≥1 falha em 48h | `countRecentFailedWhatsAppMessages ≥ 1` → `sendEmailFallbackMessage` → SENT/FAILED registrado |
| On-demand            | `POST /api/members/:id/remind`       | Cooldown 4h, consome rate limit do clube, cobrança OVERDUE mais antiga                  |

---

## Arquitetura Multi-Tenancy

Cada clube é um tenant isolado. A estratégia adotada é **schema-per-tenant** no PostgreSQL: cada clube tem seu próprio schema (`clube_{id}`). Isso garante isolamento total de dados sem complexidade de Row-Level Security no código da aplicação.

O schema correto é selecionado em cada request via `SET search_path TO "clube_{clubId}", public`, executado pelo helper `withTenantSchema` em `src/lib/prisma.ts`. A função encapsula a transação Prisma e o `$executeRawUnsafe` para configuração do search_path.

### Provisionamento de Schema Tenant (Implementado)

`provisionTenantSchema(prisma, clubId)` em `src/lib/tenant-schema.ts`:

1. `CREATE EXTENSION IF NOT EXISTS pgcrypto` (schema public)
2. `CREATE SCHEMA IF NOT EXISTS "clube_{clubId}"`
3. Transação: `SET search_path` → enums DDL → tabelas DDL → índices DDL → FKs DDL

Todos os blocos DDL são idempotentes (`IF NOT EXISTS`, `DO $$ EXCEPTION duplicate_object`). Pode ser re-executado com segurança.

```
public.clubs          -- cadastro master de clubes (tenant registry)
public.users          -- usuários globais (auth)

clube_{id}.members    -- sócios do clube (CPF e telefone: BYTEA, pgcrypto AES-256)
clube_{id}.plans      -- planos de sócio configuráveis
clube_{id}.member_plans -- vínculo sócio-plano com histórico (startedAt/endedAt)
clube_{id}.charges    -- cobranças geradas (agnósticas ao gateway; gatewayMeta JSONB)
clube_{id}.payments   -- pagamentos confirmados (imutáveis; só cancelados com motivo)
clube_{id}.messages   -- log de WhatsApp/e-mail (audit trail da régua de cobrança)
clube_{id}.message_templates -- overrides de template por clube (fallback para DEFAULT_TEMPLATES)
clube_{id}.audit_log  -- histórico de ações financeiras e de sócios (compliance; nunca deletado)
```

### Segurança de ClubId

`assertValidClubId(clubId)` valida que o clubId segue o padrão cuid2 (`/^[a-z0-9]{20,30}$/`) antes de interpolá-lo no nome do schema — prevenindo SQL injection via schema name mesmo em casos extremos.

---

## Modelo de Dados — Entidades Principais

| Entidade          | Campos-chave                                                                                                   | Relacionamentos      | Observação                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `clubs`           | id, slug, name, plan_tier, created_at                                                                          | 1:N members, plans   | Tenant root; slug usado na URL e no schema PG                                              |
| `users`           | id, email, password (bcrypt), role, clubId                                                                     | N:1 clubs            | Auth global; role: ADMIN \| TREASURER                                                      |
| `members`         | id, name, cpf (BYTEA), phone (BYTEA), email, status, joined_at                                                 | N:M plans via member_plans | CPF/phone: AES-256 pgcrypto; uniqueness por scan in-DB                            |
| `plans`           | id, name, price_cents, interval, benefits[], isActive                                                          | N:M members          | interval: `monthly \| quarterly \| annual`; soft delete via isActive                       |
| `member_plans`    | id, memberId, planId, startedAt, endedAt                                                                       | N:1 members, plans   | endedAt=null = plano ativo; histórico preservado                                           |
| `charges`         | id, member_id, amount_cents, due_date, status, **method**, **gateway_name**, **external_id**, **gateway_meta** | N:1 members          | Agnóstica ao gateway. `gateway_meta` (JSONB) armazena dados específicos do provider/método |
| `payments`        | id, charge_id, paid_at, **method**, gateway_txid, cancelledAt, cancelReason                                    | 1:1 charges          | Criado via webhook; imutável. `gatewayTxid` @unique — idempotência DB-level                |
| `messages`        | id, member_id, channel, template, status, sentAt, failReason                                                   | N:1 members          | Auditoria de toda régua de cobrança; inclui fallback e-mail                                |
| `message_templates` | id, key, channel, body, isActive                                                                             | —                    | Override de template por clube; @unique(key, channel); fallback para DEFAULT_TEMPLATES     |
| `audit_log`       | id, memberId?, actorId?, action, entityId, entityType, metadata, createdAt                                     | N:1 members (nullable) | Imutável; ações financeiras obrigatórias                                                 |

### Sobre o campo `gatewayMeta`

O campo `gatewayMeta` (JSONB) em `Charge` absorve dados específicos de cada combinação provider + método sem poluir o schema principal. O shape varia conforme `charges.method`:

| `method`                     | Shape de `gatewayMeta`                           |
| ---------------------------- | ------------------------------------------------ |
| `PIX`                        | `{ qrCodeBase64: string, pixCopyPaste: string }` |
| `BOLETO`                     | `{ bankSlipUrl: string, invoiceUrl?: string }`   |
| `CREDIT_CARD` / `DEBIT_CARD` | `{ invoiceUrl: string }`                         |
| `CASH` / `BANK_TRANSFER`     | `{}` (sem dados externos)                        |

### Criptografia de CPF e Telefone

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
         → GatewayRegistry.forMethod('PIX') → AsaasGateway.createCharge()
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
      → fallback email se ≥1 falha WA em 48h

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

### Três filas independentes

| Fila                | Propósito                              | Retry          | Concorrência |
| ------------------- | -------------------------------------- | -------------- | ------------ |
| `charge-generation` | Geração mensal de cobranças            | 3x backoff custom (1h/6h/24h) | 5 |
| `billing-reminders` | Lembretes D-3 por WhatsApp             | 2x exponential (5s base) | 5 |
| `overdue-notices`   | Avisos D+3 por WhatsApp                | 2x exponential (5s base) | 5 |
| `webhook-events`    | Processamento de webhooks de gateways  | 3x exponential (1s base) | 5 |

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

A lógica em Lua é executada atomicamente pelo Redis — previne race condition em workers concorrentes (TOCTOU). Padrão idêntico ao `@fastify/rate-limit`.

---

## Estrutura do Monorepo

```
clubos/
├── apps/
│   ├── web/                        # Next.js 16 + React 19 (browser/desktop)
│   │   └── src/app/
│   │       ├── (marketing)/        # Landing, preços, contato — layout público  ✅
│   │       ├── (app)/              # Painel autenticado — sidebar + auth guard   ✅
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
│           │   └── athletes/       # stub — NÃO IMPLEMENTADO                    ⬜
│           ├── jobs/
│           │   ├── charge-generation/  # dispatch + generation workers           ✅
│           │   ├── billing-reminders/  # dispatch + reminder workers             ✅
│           │   └── overdue-notices/    # dispatch + notice workers               ✅
│           ├── plugins/            # auth, sensible, security-headers            ✅
│           └── lib/                # prisma, redis, crypto, tokens, storage      ✅
└── packages/
    ├── shared-types/               # tipos TypeScript compartilhados
    ├── ui/                         # componentes compartilhados
    └── config/                     # tsconfig, eslint, prettier bases
```
