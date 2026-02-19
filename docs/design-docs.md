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

| Tecnologia | Versão | Justificativa |
|---|---|---|
| Next.js | 14 (App Router) | SSR nativo, bom SEO para portal público, ecossistema React maduro |
| TypeScript | 5.x | Tipagem evita bugs de runtime em fluxos financeiros críticos |
| Tailwind CSS | 3.x | Velocidade de UI sem CSS custom; tokens de design via config |
| shadcn/ui | latest | Componentes acessíveis, sem dependência pesada; copia código no repo |
| React Query (TanStack) | 5.x | Cache e sincronização de estado servidor — elimina boilerplate |
| React Hook Form + Zod | latest | Validação de formulários financeiros no client antes de bater na API |

### Back-end

| Tecnologia | Versão | Justificativa |
|---|---|---|
| Node.js + Fastify | Node 20 LTS / Fastify 4 | Performance superior ao Express; schema validation nativo via JSON Schema |
| TypeScript | 5.x | Consistência full-stack; tipos compartilhados entre front e back |
| Prisma ORM | 5.x | Migrations versionadas, type-safe queries, multi-tenant com row-level isolation |
| Zod | 3.x | Validação de payloads na entrada da API; compartilhado com front-end |
| BullMQ + Redis | latest | Filas de jobs assíncronos para cobranças recorrentes e WhatsApp |
| JWT + Refresh Tokens | — | Auth stateless; refresh token rotativo em httpOnly cookie |

### Banco de Dados

| Tecnologia | Justificativa |
|---|---|
| PostgreSQL 15 | Banco principal. ACID completo para transações financeiras. JSONB para dados dinâmicos de planos. Row-Level Security para multi-tenancy. |
| Redis 7 | Cache de sessão, filas BullMQ, rate limiting por clube, pub/sub de notificações em tempo real. |

### Infraestrutura e Deploy

| Componente | Serviço | Observação |
|---|---|---|
| Hospedagem API + Front | Railway ou Render (PaaS) | Deploy via Git push; sem DevOps dedicado no MVP |
| Banco de Dados | Supabase (Postgres managed) | Conexão pooling, backups automáticos, painel de consulta |
| CDN / Assets | Cloudflare | Free tier cobre 100% do MVP |
| Monitoramento | Sentry + Logtail | Error tracking em prod; logs estruturados |
| CI/CD | GitHub Actions | Pipeline: lint → test → build → deploy em push para main |
| Secrets | Railway Env Vars / .env | Nunca comitar .env; template .env.example no repo |

---

## Integrações Externas

### Pix — Cobrança Recorrente

| Aspecto | Decisão | Detalhe |
|---|---|---|
| PSP principal | Asaas | SDK Node.js maduro, suporte a Pix com webhook |
| PSP fallback | Efí Bank | Redundância em caso de instabilidade do Asaas |
| Modelo de cobrança | Pix com vencimento (cob) + QR Code | API Open Banking do BC; webhook de confirmação em < 5s |
| Split de receita | Asaas Marketplace | 1,5% por transação retido automaticamente pelo ClubOS |
| Tratamento de falha | Retry com backoff exponencial | 3 tentativas em 24h; após exaustão → status `PENDING_RETRY` |
| Conformidade | HMAC-SHA256 | Validar header `X-Asaas-Signature` em todo webhook recebido |

### WhatsApp — Régua de Cobrança

| Aspecto | Decisão | Detalhe |
|---|---|---|
| Provider | Z-API ou Evolution API (self-hosted) | Custo menor que Meta Business API para o volume do MVP |
| Templates padrão | D-3, D-0, D+3 | Lembrete pré-vencimento, aviso no vencimento, cobrança de inadimplência |
| Rate limiting | Máx. 30 mensagens/minuto por clube | Evitar bloqueio do número pelo WhatsApp |
| Fallback | E-mail via Resend | Acionado se WhatsApp falhar após 2 tentativas |

---

## Arquitetura Multi-Tenancy

Cada clube é um tenant isolado. A estratégia adotada é **schema-per-tenant** no PostgreSQL: cada clube tem seu próprio schema (`clube_{id}`). Isso garante isolamento total de dados sem complexidade de Row-Level Security no código da aplicação.

```
public.clubs          -- cadastro master de clubes (tenant registry)
public.users          -- usuários globais (auth)

clube_{id}.members    -- sócios do clube
clube_{id}.plans      -- planos de sócio configuráveis
clube_{id}.charges    -- cobranças geradas
clube_{id}.payments   -- pagamentos confirmados
clube_{id}.messages   -- log de WhatsApp/e-mail
clube_{id}.audit_log  -- histórico de ações (compliance)
```

---

## Modelo de Dados — Entidades Principais

| Entidade | Campos-chave | Relacionamentos | Observação |
|---|---|---|---|
| `clubs` | id, slug, name, plan_tier, created_at | 1:N members, plans | Tenant root; slug usado na URL e no schema PG |
| `members` | id, name, cpf, phone, email, status, joined_at | N:1 clubs, N:M plans | CPF usado para idempotência de cobrança Pix |
| `plans` | id, name, price_cents, interval, benefits | N:M members | interval: `monthly \| quarterly \| annual` |
| `charges` | id, member_id, amount_cents, due_date, status, pix_cob_id | N:1 members | status: `PENDING \| PAID \| OVERDUE \| CANCELLED` |
| `payments` | id, charge_id, paid_at, method, gateway_txid | 1:1 charges | Criado via webhook do PSP; imutável |
| `messages` | id, member_id, channel, template, sent_at, status | N:1 members | Auditoria de toda régua de cobrança |

---

## Fluxo de Cobrança — Ciclo Completo

```
[Job Scheduler — BullMQ / Cron]
         |
         | D-3 antes do vencimento
         ▼
[Gerar Cobrança Pix (Asaas API)]
         |
         |── Sucesso ──▶  Salva charge com status PENDING + pix_cob_id
         |                Envia WhatsApp template 'lembrete'
         |
         |── Falha ────▶  Retry fila (3x, backoff 1h / 6h / 24h)
                           Se falhar 3x → status PENDING_RETRY + alerta no dashboard

[Webhook PSP — Pix confirmado]
         |
         ▼
Valida assinatura HMAC-SHA256
         |
         ▼
Cria registro em payments
Atualiza charge.status = PAID
Atualiza member.status = ACTIVE
Dispara evento para dashboard (Redis pub/sub)
```

---

## Estrutura de Projetos (Monorepo)

```
clubos/
├── apps/
│   ├── web/                  # Next.js (browser/desktop)
│   ├── mobile/               # React Native ou Flutter (futuro)
│   └── api/                  # Fastify (backend)
│       ├── modules/          # feature modules
│       │   └── charges/
│       │       ├── charges.routes.ts
│       │       ├── charges.service.ts
│       │       ├── charges.schema.ts
│       │       └── charges.test.ts
│       ├── jobs/             # BullMQ workers
│       ├── webhooks/         # handlers de PSP e WhatsApp
│       └── prisma/           # schema.prisma + migrations
└── packages/
    ├── shared-types/         # tipos TypeScript compartilhados
    └── config/               # tsconfig, eslint, prettier bases
```

> **Separação de responsabilidades:** o backend expõe uma API HTTP consumida por todos os frontends. Nenhum frontend acessa o banco diretamente. Os tipos TypeScript são compartilhados via `packages/shared-types` para garantir consistência entre projetos.
