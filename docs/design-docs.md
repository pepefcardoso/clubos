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

| Tecnologia             | Versão          | Justificativa                                                        |
| ---------------------- | --------------- | -------------------------------------------------------------------- |
| Next.js                | 14 (App Router) | SSR nativo, bom SEO para portal público, ecossistema React maduro    |
| TypeScript             | 5.x             | Tipagem evita bugs de runtime em fluxos financeiros críticos         |
| Tailwind CSS           | 3.x             | Velocidade de UI sem CSS custom; tokens de design via config         |
| shadcn/ui              | latest          | Componentes acessíveis, sem dependência pesada; copia código no repo |
| React Query (TanStack) | 5.x             | Cache e sincronização de estado servidor — elimina boilerplate       |
| React Hook Form + Zod  | latest          | Validação de formulários financeiros no client antes de bater na API |

### Back-end

| Tecnologia           | Versão                    | Justificativa                                                             |
| -------------------- | ------------------------- | ------------------------------------------------------------------------- |
| Node.js + Fastify    | Node 20 LTS / Fastify 5.x | Performance superior ao Express; schema validation nativo via JSON Schema |
| TypeScript           | 5.x                       | Consistência full-stack; tipos compartilhados entre front e back          |
| Prisma ORM           | 7.x                       | Migrations versionadas, type-safe queries, multi-tenant via search_path   |
| Zod                  | 4.x                       | Validação de payloads na entrada da API; compartilhado com front-end      |
| BullMQ + Redis       | latest                    | Filas de jobs assíncronos para cobranças recorrentes e WhatsApp           |
| JWT + Refresh Tokens | —                         | Auth stateless; refresh token rotativo em httpOnly cookie                 |

### Banco de Dados

| Tecnologia    | Justificativa                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL 15 | Banco principal. ACID completo para transações financeiras. JSONB para metadados de gateway. Schema-per-tenant para multi-tenancy. |
| Redis 7       | Cache de sessão, filas BullMQ, rate limiting por clube, pub/sub de notificações em tempo real.                                     |

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
  parseWebhook(payload: unknown, signature: string): Promise<WebhookEvent>;
}
```

### Métodos de pagamento suportados

| Método            | Enum            | Gateway atual | Observação                        |
| ----------------- | --------------- | ------------- | --------------------------------- |
| Pix               | `PIX`           | Asaas         | Principal no MVP                  |
| Cartão de crédito | `CREDIT_CARD`   | Asaas         | Disponível, não priorizado no MVP |
| Cartão de débito  | `DEBIT_CARD`    | Asaas         | Disponível, não priorizado no MVP |
| Boleto            | `BOLETO`        | Asaas         | SHOULD HAVE — Fase 2              |
| Dinheiro          | `CASH`          | — (offline)   | Sem gateway; registro manual      |
| Transferência     | `BANK_TRANSFER` | — (offline)   | Sem gateway; registro manual      |

### Estrutura de arquivos

```
apps/api/src/modules/payments/
├── gateway.interface.ts       # Interface PaymentGateway + tipos (CreateChargeInput, etc.)
├── gateway.registry.ts        # GatewayRegistry — registra e resolve gateways por nome/método
└── gateways/
    ├── index.ts               # Bootstrap: instancia e registra os gateways no startup
    ├── asaas.gateway.ts       # Implementação Asaas (PIX, cartão, boleto)
    ├── pagarme.gateway.ts     # (futuro)
    └── stripe.gateway.ts      # (futuro)
```

### Como adicionar um novo gateway

1. Criar `gateways/<provider>.gateway.ts` implementando `PaymentGateway`
2. Registrar em `gateways/index.ts` com `GatewayRegistry.register(new ProviderGateway(...))`
3. Adicionar as env vars necessárias no `.env.example`

Nenhum outro arquivo precisa mudar.

### Asaas (gateway primário do MVP)

| Aspecto             | Decisão                       | Detalhe                                                     |
| ------------------- | ----------------------------- | ----------------------------------------------------------- |
| PSP principal       | Asaas                         | Suporte a Pix com webhook; ambiente sandbox disponível      |
| Modelo de cobrança  | Pix com vencimento + QR Code  | Webhook de confirmação em < 5s                              |
| Tratamento de falha | Retry com backoff exponencial | 3 tentativas em 24h; após exaustão → status `PENDING_RETRY` |
| Conformidade        | HMAC-SHA256                   | Validar header `X-Asaas-Signature` em todo webhook recebido |

### WhatsApp — Régua de Cobrança

| Aspecto          | Decisão                              | Detalhe                                                                 |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| Provider         | Z-API ou Evolution API (self-hosted) | Custo menor que Meta Business API para o volume do MVP                  |
| Templates padrão | D-3, D-0, D+3                        | Lembrete pré-vencimento, aviso no vencimento, cobrança de inadimplência |
| Rate limiting    | Máx. 30 mensagens/minuto por clube   | Evitar bloqueio do número pelo WhatsApp                                 |
| Fallback         | E-mail via Resend                    | Acionado se WhatsApp falhar após 2 tentativas                           |

---

## Arquitetura Multi-Tenancy

Cada clube é um tenant isolado. A estratégia adotada é **schema-per-tenant** no PostgreSQL: cada clube tem seu próprio schema (`clube_{id}`). Isso garante isolamento total de dados sem complexidade de Row-Level Security no código da aplicação.

O schema correto é selecionado em cada request via `SET search_path TO "clube_{clubId}", public`, executado pelo helper `withTenantSchema` em `src/lib/prisma.ts`.

```
public.clubs          -- cadastro master de clubes (tenant registry)
public.users          -- usuários globais (auth)

clube_{id}.members    -- sócios do clube
clube_{id}.plans      -- planos de sócio configuráveis
clube_{id}.charges    -- cobranças geradas (agnósticas ao gateway)
clube_{id}.payments   -- pagamentos confirmados
clube_{id}.messages   -- log de WhatsApp/e-mail
clube_{id}.audit_log  -- histórico de ações (compliance)
```

---

## Modelo de Dados — Entidades Principais

| Entidade   | Campos-chave                                                                                                   | Relacionamentos      | Observação                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `clubs`    | id, slug, name, plan_tier, created_at                                                                          | 1:N members, plans   | Tenant root; slug usado na URL e no schema PG                                              |
| `members`  | id, name, cpf, phone, email, status, joined_at                                                                 | N:1 clubs, N:M plans | CPF usado para idempotência de cobrança                                                    |
| `plans`    | id, name, price_cents, interval, benefits                                                                      | N:M members          | interval: `monthly \| quarterly \| annual`                                                 |
| `charges`  | id, member_id, amount_cents, due_date, status, **method**, **gateway_name**, **external_id**, **gateway_meta** | N:1 members          | Agnóstica ao gateway. `gateway_meta` (JSONB) armazena dados específicos do provider/método |
| `payments` | id, charge_id, paid_at, **method**, gateway_txid                                                               | 1:1 charges          | Criado via webhook; imutável. `method` usa o mesmo enum de `charges`                       |
| `messages` | id, member_id, channel, template, sent_at, status                                                              | N:1 members          | Auditoria de toda régua de cobrança                                                        |

### Sobre o campo `gatewayMeta`

O campo `gatewayMeta` (JSONB) em `Charge` absorve dados específicos de cada combinação provider + método sem poluir o schema principal. O shape varia conforme `charges.method`:

| `method`                     | Shape de `gatewayMeta`                           |
| ---------------------------- | ------------------------------------------------ |
| `PIX`                        | `{ qrCodeBase64: string, pixCopyPaste: string }` |
| `BOLETO`                     | `{ bankSlipUrl: string, invoiceUrl?: string }`   |
| `CREDIT_CARD` / `DEBIT_CARD` | `{ invoiceUrl: string }`                         |
| `CASH` / `BANK_TRANSFER`     | `{}` (sem dados externos)                        |

---

## Fluxo de Cobrança — Ciclo Completo

```
[Job Scheduler — BullMQ / Cron]
         |
         | Dia 1 de cada mês, 08h
         ▼
[ChargeService.generateMonthly()]
         |
         | GatewayRegistry.forMethod(member.preferredMethod)
         ▼
[PaymentGateway.createCharge()]      ← interface, não importa qual gateway
         |
         |── Sucesso ──▶  Salva charge: status PENDING + externalId + gatewayMeta
         |                Envia WhatsApp template 'lembrete' (D-3)
         |
         |── Falha ────▶  Retry fila (3x, backoff 1h / 6h / 24h)
                           Se falhar 3x → status PENDING_RETRY + alerta no dashboard

[POST /webhooks/:gateway]            ← rota paramétrica por gateway
         |
         | GatewayRegistry.get(params.gateway)
         ▼
[PaymentGateway.parseWebhook()]      ← valida HMAC + normaliza evento
         |
         ▼ (job assíncrono BullMQ)
Cria registro em payments
Atualiza charge.status = PAID
Atualiza member.status = ACTIVE
Dispara evento para dashboard (Redis pub/sub)
```

---

## Estrutura do Monorepo

```
clubos/
├── apps/
│   ├── web/                        # Next.js (browser/desktop)
│   └── api/                        # Fastify (backend)
│       ├── src/
│       │   ├── modules/
│       │   │   ├── charges/
│       │   │   │   ├── charges.routes.ts
│       │   │   │   ├── charges.service.ts  # depende de PaymentGateway, nunca de Asaas
│       │   │   │   ├── charges.schema.ts
│       │   │   │   └── charges.test.ts
│       │   │   └── payments/
│       │   │       ├── gateway.interface.ts
│       │   │       ├── gateway.registry.ts
│       │   │       └── gateways/
│       │   │           ├── index.ts
│       │   │           ├── asaas.gateway.ts
│       │   │           ├── pagarme.gateway.ts  # (futuro)
│       │   │           └── stripe.gateway.ts   # (futuro)
│       │   ├── jobs/               # BullMQ workers
│       │   ├── webhooks/           # handlers de PSP e WhatsApp
│       │   ├── plugins/            # Fastify plugins (auth, sensible, etc.)
│       │   └── lib/                # prisma, redis, tokens
│       └── prisma/                 # schema.prisma + migrations
└── packages/
    ├── shared-types/               # tipos TypeScript compartilhados
    └── config/                     # tsconfig, eslint, prettier bases
```
