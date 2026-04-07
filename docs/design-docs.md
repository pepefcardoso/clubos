# Design Doc (RFC) — ClubOS v2.0

> **Status:** Vivo — decisões técnicas tornam-se definitivas após revisão de 48h sem objeção.
> **Módulo ativo:** FisioBase + SAF Compliance Full + Conciliação Financeira (v2.0)
> **Versão:** 3.0

---

## Visão Técnica

O ClubOS v1.0 é um SaaS multi-tenant voltado exclusivamente para clubes de futebol amador e semiprofissional no Brasil. Seu objetivo técnico central é processar cobranças recorrentes via PIX, manter um cadastro confiável de sócios, gerar alertas de inadimplência e contratos com zero intervenção manual do operador do clube — e fazer tudo isso funcionando em campo, com ou sem sinal 4G.

A v1.5 adicionou o módulo esportivo (TreinoOS + BaseForte) com arquitetura offline-first completa. A v2.0 adiciona o módulo de saúde do atleta (FisioBase) e fecha o ciclo de compliance financeiro para SAFs.

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

| Tecnologia               | Versão    | Justificativa                                                             | Status                 |
| ------------------------ | --------- | ------------------------------------------------------------------------- | ---------------------- |
| Next.js                  | 16.x      | SSR nativo, bom SEO para portal público, ecossistema React maduro         | ✅ Implementado        |
| React                    | 19.x      | Concurrent features; Server Components nativos no App Router              | ✅ Implementado        |
| TypeScript               | 5.x       | Tipagem evita bugs de runtime em fluxos financeiros críticos              | ✅ Implementado        |
| Tailwind CSS             | 3.4.x     | Velocidade de UI sem CSS custom; tokens de design via config              | ✅ Implementado        |
| shadcn/ui                | latest    | Componentes acessíveis, sem dependência pesada; copia código no repo      | ✅ Implementado        |
| React Query (TanStack)   | 5.x       | Cache e sincronização de estado servidor — elimina boilerplate            | ✅ Implementado        |
| React Hook Form + Zod    | 7.x / 4.x | Validação de formulários financeiros no client antes de bater na API      | ✅ Implementado        |
| Recharts                 | 3.x       | Gráficos de histórico de cobranças e performance no dashboard             | ✅ Implementado        |
| Resend                   | 6.x       | Envio de e-mail transacional e formulário de contato (marketing)          | ✅ Implementado        |
| react-pdf                | 3.x       | Geração de PDFs no cliente (avaliação técnica, relatório de lesão, etc.)  | ✅ Implementado        |
| **Workbox (PWA)**        | **7.x**   | **Service Workers + offline caching + Background Sync**                   | ✅ Implementado (v1.5) |
| **Dexie.js (IndexedDB)** | **4.x**   | **ORM local para dados offline (treinos, presenças, anotações de campo)** | ✅ Implementado (v1.5) |

> **Nota:** a versão Next.js foi atualizada de 14 para 16.x e React de 18 para 19 durante o desenvolvimento. O App Router e a estrutura de route groups permanece conforme projetado. Workbox e Dexie.js foram entregues na v1.5 (TreinoOS offline-first) e estão operacionais em produção.

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

| Tecnologia    | Justificativa                                                                                                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PostgreSQL 16 | Banco principal. ACID completo para transações. JSONB para motor de regras. Schema-per-tenant. **Índices BRIN e Materialized Views para timeseries (v1.5 ativo).** |
| Redis 7       | Cache de sessão, filas BullMQ, rate limiting por clube (WhatsApp 30 msg/min), pub/sub de notificações em tempo real.                                               |

> **Nota sobre séries temporais:** a abordagem para dados ACWR usa recursos nativos do PostgreSQL (Índices BRIN em `workload_metrics` e `MATERIALIZED VIEW` com `REFRESH CONCURRENTLY`) operacional desde a v1.5. Overhead operacional próximo a zero sem extensões externas.

---

## Landing Page — Estrutura e Decisão Arquitetural

A landing page (marketing, preços, contato, peneiras) fica **dentro de `apps/web/`**, no mesmo app Next.js do painel. Não há um app separado `apps/landing/`.

### Convenção de pastas (implementada)

```
apps/web/src/app/
├── (marketing)/            # Páginas públicas — layout limpo, sem auth  ✅
│   ├── layout.tsx          # MarketingHeader + MarketingFooter           ✅
│   ├── page.tsx            # Landing principal (6 sections)              ✅
│   ├── precos/
│   │   └── page.tsx        # PricingSection + FAQ + CTA                  ✅
│   ├── contato/
│   │   └── page.tsx        # ContactForm com rate-limit + Resend         ✅
│   └── peneiras/
│       └── page.tsx        # Formulário público de peneiras (v1.5)       ✅
├── (app)/                  # Painel autenticado — sidebar + auth guard   ✅
│   ├── layout.tsx          # Auth guard + AppShell                       ✅
│   ├── dashboard/page.tsx  # DashboardClient com SSE                     ✅
│   ├── members/page.tsx    # MembersPage + CSV import                    ✅
│   ├── plans/page.tsx      # PlansPage                                   ✅
│   ├── charges/page.tsx    # ChargesPage (QR Code + status)              ✅
│   ├── athletes/page.tsx   # AthletesPage                                ✅
│   ├── contracts/page.tsx  # ContractsPage (BID/CBF alerts)              ✅
│   ├── training/page.tsx   # TreinoOS — prancheta + chamada (v1.5)       ✅
│   ├── workload/page.tsx   # BaseForte — RPE + ACWR dashboard (v1.5)     ✅
│   ├── medical/page.tsx    # FisioBase — prontuário + RTP (v2.0)         ⬜
│   ├── saf/page.tsx        # SAF Compliance — dashboard + balanços (v2.0) ⬜
│   ├── access/page.tsx     # QR Code de portaria (v2.0)                  ⬜
│   ├── templates/page.tsx  # Templates de mensagem                       ✅
│   └── expenses/page.tsx   # Registro de despesas P&L (v1.5)             ✅
├── (auth)/
│   └── login/page.tsx      # LoginForm                                   ✅
└── (onboarding)/
    └── onboarding/page.tsx # OnboardingWizard (3 steps)                  ✅
```

### Regras de convivência

- O route group `(marketing)` **nunca importa** componentes ou hooks do `(app)` — sem vazamento de bundle de autenticação, React Query ou lógica de painel para páginas públicas.
- O `(app)` tem um layout raiz com middleware de autenticação; o `(marketing)` tem um layout raiz independente e sem guard.
- Componentes verdadeiramente compartilhados vivem em `packages/ui/` ou em `apps/web/src/components/` sem pertencer a nenhum dos dois grupos.

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

### Controle de acesso por papel

```typescript
// Hierarquia: ADMIN > TREASURER > COACH > PHYSIO > SCOUT
const isAdmin = user?.role === "ADMIN";

// Roles ativos por versão:
// ADMIN     — CRUD completo em sócios, planos, contratos, médico; acesso total      ✅ v1.0
// TREASURER — visão de leitura financeira, sem ações destrutivas                   ✅ v1.0
// COACH     — acesso ao módulo esportivo (TreinoOS, BaseForte); sem dados clínicos  ✅ v1.5
// PHYSIO    — acesso ao prontuário médico (FisioBase); dados clínicos isolados      🟡 v2.0
// SCOUT     — acesso somente ao ScoutLink (v3.0+); sem dados internos do clube      ⬜ v3.0
```

O campo `role` é lido do JWT — nunca do estado local mutável. No backend, o decorator `requireRole('ADMIN')` aplica a hierarquia por rota.

> **Nota v2.0:** role `PHYSIO` é ativado nesta versão. O guard de rota garante que dados de `medical_records` nunca sejam expostos a `COACH`, `TREASURER` ou `SCOUT`. `SCOUT` permanece no schema para evitar migração ao ativar o módulo v3.0.

---

## Arquitetura Offline-First (Operacional desde v1.5)

O maior risco de abandono da plataforma é o campo sem sinal. A solução não é "tentar novamente mais tarde" — é operar localmente como se o servidor não existisse.

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

### Funcionalidades com suporte Offline Completo

| Funcionalidade                    | Armazenamento local        | Sync strategy                        | Status           |
| --------------------------------- | -------------------------- | ------------------------------------ | ---------------- |
| Registro de presença em treino    | IndexedDB (Dexie)          | Background Sync + retry 3x           | ✅ v1.5          |
| Anotações de carga/RPE do técnico | IndexedDB (Dexie)          | Background Sync                      | ✅ v1.5          |
| Ficha de atleta (leitura)         | Cache API (Service Worker) | Stale-while-revalidate               | ✅ v1.5          |
| Validação de QR Code de portaria  | IndexedDB (Dexie)          | Background Sync + deduplicação       | 🟡 v2.0          |
| Registro de lesão/queixa          | IndexedDB (Dexie)          | Background Sync + criptografia local | ⬜ v2.0 (futuro) |
| Resultado parcial de jogo         | IndexedDB (Dexie)          | Background Sync                      | ⬜ v2.5          |

---

## FisioBase — Decisões Técnicas (v2.0)

### Isolamento de dados clínicos por role

O acesso a `medical_records` segue o princípio de menor privilégio com isolamento garantido em três camadas:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Camadas de Proteção                          │
│                                                                 │
│  1. RBAC API: requireRole('PHYSIO', 'ADMIN') por rota           │
│     → Qualquer outro role retorna 403 antes de tocar o banco    │
│                                                                 │
│  2. Criptografia: AES-256 (pgcrypto) em campos clínicos         │
│     → Dados ilegíveis mesmo em dump direto do banco             │
│                                                                 │
│  3. Audit log: data_access_log em TODA leitura de prontuário    │
│     → actorId, athleteId, campo acessado, timestamp, IP         │
└─────────────────────────────────────────────────────────────────┘
```

### Status RTP — visibilidade por role

```typescript
// PHYSIO | ADMIN: veem status + notas clínicas completas
GET /api/athletes/:id/rtp
→ { status: "RETORNO_PROGRESSIVO", clinicalNotes: "...", protocolId: "..." }

// COACH | TREASURER: veem apenas o enum de status
GET /api/athletes/:id/rtp
→ { status: "RETORNO_PROGRESSIVO" }

// Implementado via projeção condicional no service, não no banco
```

### Correlação carga × lesão

```sql
-- Query analítica: atletas com ACWR > 1.3 e ocorrência de lesão no mesmo período
SELECT
  a.id,
  a.name,
  acwr.ratio         AS acwr_ratio,
  mr.occurred_at     AS injury_date,
  mr.structure       AS anatomy
FROM athletes a
JOIN acwr_weekly_view acwr ON acwr.athlete_id = a.id
JOIN medical_records mr    ON mr.athlete_id   = a.id
WHERE acwr.ratio > 1.3
  AND mr.occurred_at BETWEEN acwr.week_start AND acwr.week_end
ORDER BY acwr.ratio DESC;
```

Resultado exposto no `PhysioDashboard` como tabela de risco com drill-down para o prontuário.

---

## SAF Compliance Full — Decisões Técnicas (v2.0)

### Imutabilidade de balanços publicados

```
Upload do balanço (PDF)
  → SHA-256 calculado em memória (sem salvar no disco)
  → Arquivo salvo em storage (S3 ou local)
  → { fileHash, fileUrl, publishedAt, actorId } → INSERT INTO balance_sheets
  → INSERT INTO audit_log (action: BALANCE_PUBLISHED, metadata: { fileHash })
  → Nenhum UPDATE ou DELETE permitido na tabela balance_sheets
  → URL pública por clube: /transparencia/{clubSlug}/{balanceId}
```

### Demonstrativo de Receitas

O demonstrativo consolida três fontes distintas em uma única query:

```sql
SELECT
  date_trunc('month', created_at) AS period,
  SUM(amount_cents) FILTER (WHERE type = 'payment')  AS revenue_cents,
  SUM(amount_cents) FILTER (WHERE type = 'expense')  AS expense_cents,
  SUM(amount_cents) FILTER (WHERE type = 'payment')
    - SUM(amount_cents) FILTER (WHERE type = 'expense') AS net_cents
FROM (
  SELECT paid_at AS created_at, amount_cents, 'payment' AS type FROM payments
  UNION ALL
  SELECT created_at, amount_cents, 'expense' AS type FROM expenses
) AS combined
GROUP BY 1
ORDER BY 1 DESC;
```

---

## Dashboard em Tempo Real — SSE

O dashboard usa Server-Sent Events para invalidar o cache React Query sem polling.

```
GET /api/events?token=<accessToken>   (EventSource, credenciais incluídas)
         |
         | Eventos: PAYMENT_CONFIRMED | RTP_STATUS_CHANGED | BALANCE_PUBLISHED
         ▼
queryClient.invalidateQueries(DASHBOARD_QUERY_KEY)
queryClient.invalidateQueries(CHARGES_HISTORY_QUERY_KEY)
queryClient.invalidateQueries(OVERDUE_MEMBERS_QUERY_KEY)
```

> **Scaling note:** para múltiplos processos, substituir o corpo de `emitPaymentConfirmed` por `redis.publish("club:{clubId}", json)` e `sseBus.on` por `redis.subscribe`. Interface idêntica — apenas `sse-bus.ts` e `events.routes.ts` mudam. **v2.0 adiciona eventos** `RTP_STATUS_CHANGED` e `BALANCE_PUBLISHED` ao mesmo barramento.

---

## Integrações de Pagamento — Gateway Abstraction + Multi-Acquiring

A camada de pagamento do ClubOS é **agnóstica ao provedor** e **resiliente a falhas de gateway**.

### Fluxo Multi-Acquiring (PIX com fallback silencioso)

```
ChargeService.createCharge()
       ↓
GatewayRegistry.forMethod('PIX')  →  [AsaasGateway]
       ↓ timeout / erro?
                           →  [PagarmeGateway]      (fallback 1) ✅
       ↓ timeout / erro?
                           →  [StripeGateway]        (fallback 2) ✅
       ↓ timeout / erro?
                           →  PIX estático do clube  (fallback final)
```

### WhatsApp — Régua de Cobrança

Rate limiting Lua atômica no Redis (30 msg/min por clube), idempotência 20h, fallback e-mail após ≥ 1 falha em 48h — todos operacionais desde v1.0.

---

## Motor de Regras Esportivas (Compliance CBF/FPF)

Regras de elegibilidade e janelas de transferência parametrizadas em JSONB por temporada/liga. `RulesValidator.check(athlete, ruleSet)` operacional desde v1.0.

**v2.0 adiciona:** validação de elegibilidade que considera status RTP — atleta com `status = AFASTADO` é automaticamente marcado como inelegível na tela de escalação, independente do registro BID.

---

## Privacy by Design — Dados Sensíveis

### Hard Stops implementados

1. **Inscrição bloqueada sem Assinatura de Aceite Parental digital** — ✅ v1.5
2. **Dados biométricos de menores:** criptografia AES-256 + acesso restrito por `role = PHYSIO | ADMIN` — ✅ v1.0/v2.0
3. **Dados clínicos de atletas (FisioBase):** criptografia AES-256 em `medical_records` + hard stop por role — 🟡 v2.0
4. **ScoutLink:** atleta menor nunca contatado diretamente — log imutável (v3.0)
5. **Purge automático:** dados de prospects em peneiras expiram em 24 meses — ✅ v1.5
6. **Audit log de acesso:** leitura de prontuário clínico gera entrada em `data_access_log` — 🟡 v2.0

### Criptografia de CPF e Telefone (v1.0 — implementado)

CPF e telefone armazenados como `BYTEA`. `pgp_sym_encrypt/decrypt` via `$queryRaw`. Unicidade garantida em nível de aplicação via `findMemberByCpf`.

### Criptografia de Dados Clínicos (v2.0)

Campos clínicos de `medical_records` seguem o mesmo padrão de `BYTEA` + `pgp_sym_encrypt`. Campos encriptados: `clinicalNotes`, `diagnosis`, `treatmentDetails`. Campos em plaintext: `status`, `structure` (anatômica), `grade`, `mechanism` — necessários para query analítica de correlação.

---

## Arquitetura Multi-Tenancy

Cada clube é um tenant isolado via **schema-per-tenant** no PostgreSQL: `clube_{id}`.

### Schema por Tenant — Estado Atual (v2.0)

```
Financeiro (v1.0 ✅):
  clube_{id}.members           -- sócios (CPF/telefone: BYTEA pgcrypto AES-256)
  clube_{id}.plans             -- planos configuráveis
  clube_{id}.member_plans      -- histórico de vínculos sócio-plano
  clube_{id}.charges           -- cobranças (gatewayMeta JSONB, agnóstico ao gateway)
  clube_{id}.payments          -- pagamentos confirmados (imutáveis)
  clube_{id}.expenses          -- despesas do clube (P&L simplificado) ✅ v1.5
  clube_{id}.audit_log         -- histórico financeiro imutável

Comunicação (v1.0 ✅):
  clube_{id}.messages          -- log de WhatsApp/e-mail
  clube_{id}.message_templates -- overrides de template por clube

Esportivo (v1.0–v1.5 ✅):
  clube_{id}.athletes          -- cadastro de atletas (identidade + vínculo)
  clube_{id}.contracts         -- vínculos trabalhistas + alertas BID/CBF
  clube_{id}.training_sessions -- sessões de treino planejadas
  clube_{id}.attendance_logs   -- presenças por sessão (offline-first)
  clube_{id}.workload_metrics  -- métricas RPE diárias (Índice BRIN em data)

Financeiro Extended (v1.5 ✅):
  clube_{id}.bank_reconciliations -- conciliações OFX por período
  clube_{id}.consent_records      -- aceites parentais digitais (peneiras)

Saúde (v2.0 🟡):
  clube_{id}.medical_records      -- prontuário esportivo (campos clínicos: BYTEA AES-256)
  clube_{id}.injury_protocols     -- protocolos de retorno ao jogo (seed FIFA Medical)
  clube_{id}.return_to_play       -- status RTP por atleta
  clube_{id}.data_access_log      -- audit log de acesso a dados clínicos (LGPD)

Compliance (v2.0 🟡):
  clube_{id}.balance_sheets       -- balanços publicados (hash SHA-256 imutável)
  clube_{id}.creditor_disclosures -- passivos trabalhistas (Lei 14.193/2021)

Operações (v2.0 🟡 / v2.5 ⬜):
  clube_{id}.field_access_logs    -- log de acesso via QR Code de portaria (v2.0)
  clube_{id}.events               -- eventos/jogos configurados (v2.5)
  clube_{id}.ticket_sales         -- ingressos vendidos (v2.5)
```

> **Nota:** tabelas `medical_records`, `injury_protocols`, `return_to_play`, `data_access_log`, `balance_sheets`, `creditor_disclosures` e `field_access_logs` são provisionadas na v2.0 via `provisionTenantSchema` (DDL idempotente). Clubes criados antes da v2.0 recebem as novas tabelas automaticamente na primeira execução do schema atualizado.

---

## Estrutura do Monorepo

```
clubos/
├── apps/
│   ├── web/                        # Next.js 16 + React 19 (browser/desktop)
│   │   └── src/app/
│   │       ├── (marketing)/        # Landing, preços, contato, peneiras    ✅
│   │       ├── (app)/              # Painel autenticado                     ✅
│   │       │   ├── dashboard/      # DashboardClient com SSE               ✅
│   │       │   ├── members/        # MembersPage + CSV import              ✅
│   │       │   ├── plans/          # PlansPage                             ✅
│   │       │   ├── charges/        # ChargesPage (QR Code + status)        ✅
│   │       │   ├── athletes/       # AthletesPage                          ✅
│   │       │   ├── contracts/      # ContractsPage (BID/CBF alerts)        ✅
│   │       │   ├── training/       # TreinoOS — prancheta + chamada        ✅ v1.5
│   │       │   ├── workload/       # BaseForte — RPE + ACWR dashboard      ✅ v1.5
│   │       │   ├── expenses/       # Registro de despesas P&L              ✅ v1.5
│   │       │   ├── templates/      # Templates de mensagem                 ✅
│   │       │   ├── medical/        # FisioBase — prontuário + RTP          ⬜ v2.0
│   │       │   ├── saf/            # SAF Compliance — dashboard + balanços ⬜ v2.0
│   │       │   └── access/         # QR Code de portaria                   ⬜ v2.0
│   │       ├── (auth)/             # Login                                 ✅
│   │       └── (onboarding)/       # Wizard de cadastro de clube           ✅
│   └── api/                        # Fastify (backend)                     ✅
│       └── src/
│           ├── modules/
│           │   ├── auth/           # login, refresh, logout, me            ✅
│           │   ├── clubs/          # create, upload logo                   ✅
│           │   ├── members/        # CRUD, CSV import, remind              ✅
│           │   ├── plans/          # CRUD                                  ✅
│           │   ├── charges/        # generate (manual + cron)             ✅
│           │   ├── dashboard/      # summary, charges-history, overdue     ✅
│           │   ├── templates/      # list, upsert, reset                   ✅
│           │   ├── messages/       # list (audit trail)                    ✅
│           │   ├── events/         # SSE PAYMENT_CONFIRMED                 ✅
│           │   ├── webhooks/       # receive + BullMQ worker               ✅
│           │   ├── payments/       # GatewayRegistry + Gateways            ✅
│           │   ├── whatsapp/       # WhatsAppRegistry + ZApi + Evolution   ✅
│           │   ├── email/          # email-fallback.service                ✅
│           │   ├── athletes/       # CRUD + identidade                     ✅
│           │   ├── contracts/      # vínculos + Motor de Regras + BID      ✅
│           │   ├── training/       # TreinoOS — sessões + presença         ✅ v1.5
│           │   ├── workload/       # BaseForte — RPE + ACWR                ✅ v1.5
│           │   ├── expenses/       # P&L simplificado                      ✅ v1.5
│           │   ├── reconciliation/ # Conciliação OFX                       ✅ v1.5
│           │   ├── medical/        # FisioBase — prontuário + RTP          ⬜ v2.0
│           │   ├── saf/            # SAF Compliance Full                   ⬜ v2.0
│           │   └── access-control/ # QR Code de portaria                   ⬜ v2.0
│           ├── jobs/
│           │   ├── charge-generation/   # dispatch + generation workers   ✅
│           │   ├── billing-reminders/   # dispatch + D-3 workers           ✅
│           │   ├── due-today-notices/   # dispatch + D-0 workers           ✅
│           │   ├── overdue-notices/     # dispatch + D+3 workers           ✅
│           │   ├── webhook-events/      # processamento de webhooks        ✅
│           │   ├── acwr-refresh/        # refresh Materialized View ACWR   ✅ v1.5
│           │   ├── guardian-reports/    # relatório semanal para pais      ✅ v1.5
│           │   ├── lgpd-purge/          # expurgo de dados inativos        ✅ v1.5
│           │   └── monthly-report/      # relatório financeiro PDF mensal  ⬜ v2.0
│           ├── plugins/            # auth, sensible, security-headers      ✅
│           └── lib/                # prisma, redis, crypto, tokens         ✅
└── packages/
    ├── shared-types/               # tipos TypeScript compartilhados
    ├── ui/                         # componentes compartilhados
    └── config/                     # tsconfig, eslint, prettier bases
```
