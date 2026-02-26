# Backlog — ClubOS v1.0

> Formato: User Story + Tasks técnicas granulares.
> Cada task deve caber em **1 dia de trabalho de 1 desenvolvedor**.
> Tasks maiores devem ser quebradas antes de entrar em sprint.

---

## Resumo por Sprint

| Sprint             | Foco Principal                                              | Tasks                         | Esforço  | Critério de Done                                    |
| ------------------ | ----------------------------------------------------------- | ----------------------------- | -------- | --------------------------------------------------- |
| Sprint 1 (Sem 3–4) | Fundação: Auth, Onboarding, Segurança base, CI/CD           | T-001 a T-019 + T-043 a T-047 | ~10d dev | Clube consegue fazer login e cadastrar sócios       |
| Sprint 2 (Sem 5–6) | Core Financeiro: Cobranças Pix, Webhook, WhatsApp D-3/D0    | T-020 a T-035 + T-037 a T-041 | ~12d dev | Primeiro Pix cobrado e confirmado end-to-end        |
| Sprint 3 (Sem 7–8) | Polimento e Confiabilidade: SSE, E2E tests, Fallback e-mail | T-036 + T-042 + T-048         | ~5d dev  | Sistema roda 1 semana em prod sem incidente crítico |

---

## Épico 1 — Onboarding e Autenticação

### US-01 — Cadastro do Clube

**Como** presidente de clube, **quero** criar uma conta e configurar meu clube em menos de 5 minutos, **para** começar a usar o sistema sem precisar de suporte.

| ID    | Task Técnica                                                             | Esforço | Sprint |
| ----- | ------------------------------------------------------------------------ | ------- | ------ |
| T-001 | Criar schema de banco `clube_{id}` via raw SQL ao onboarding             | 1d      | S1     |
| T-002 | Endpoint `POST /api/clubs` com validação Zod (name, slug, cnpj opcional) | 0.5d    | S1     |
| T-003 | Tela de onboarding multi-step: Dados do clube → Logo → Confirmação       | 1d      | S1     |
| T-004 | Upload de logo com resize automático (sharp) para 200x200px WebP         | 0.5d    | S1     |
| T-005 | E-mail de boas-vindas via Resend após criação do clube                   | 0.5d    | S1     |

### US-02 — Autenticação

**Como** tesoureiro do clube, **quero** fazer login de forma segura, **para** que nenhuma pessoa de fora acesse os dados financeiros.

| ID    | Task Técnica                                                                       | Esforço | Sprint |
| ----- | ---------------------------------------------------------------------------------- | ------- | ------ |
| T-006 | Implementar JWT access token (15min) + refresh token (7d) em httpOnly cookie       | 1d      | S1     |
| T-007 | Endpoints `POST /api/auth/login`, `/refresh` e `/logout`                           | 0.5d    | S1     |
| T-008 | Tela de login responsiva com React Hook Form + Zod client-side                     | 0.5d    | S1     |
| T-009 | Middleware de autenticação no Fastify (verificar JWT em todas as rotas protegidas) | 0.5d    | S1     |
| T-010 | RBAC: roles `ADMIN` e `TREASURER` com guard por rota                               | 1d      | S1     |

---

## Épico 2 — Gestão de Sócios

### US-03 — Cadastro e Importação de Sócios

**Como** tesoureiro, **quero** importar minha lista atual de sócios via CSV ou cadastrar manualmente, **para** não precisar redigitar todos os dados do zero.

| ID    | Task Técnica                                                                        | Esforço | Sprint |
| ----- | ----------------------------------------------------------------------------------- | ------- | ------ |
| T-011 | Endpoint `POST /api/members` com Zod schema (name, cpf, phone, email, plan_id)      | 0.5d    | S1     |
| T-012 | Parser de CSV com papaparse: validar colunas obrigatórias, reportar linhas com erro | 1d      | S1     |
| T-013 | Bulk insert com upsert por CPF (idempotência em reimportações)                      | 0.5d    | S1     |
| T-014 | Tela de listagem de sócios com busca, filtro por status e paginação                 | 1d      | S1     |
| T-015 | Tela de cadastro/edição individual de sócio com seleção de plano                    | 0.5d    | S1     |
| T-016 | Template CSV de exemplo para download na tela de importação                         | 0.25d   | S1     |

---

## Épico 3 — Planos e Cobranças

### US-04 — Configuração de Planos

**Como** admin do clube, **quero** criar planos de sócio com preços e benefícios diferentes, **para** atender sócios de perfis variados.

| ID    | Task Técnica                                                          | Esforço | Sprint |
| ----- | --------------------------------------------------------------------- | ------- | ------ |
| T-017 | CRUD de planos: `POST/GET/PUT/DELETE /api/plans`                      | 0.5d    | S1     |
| T-018 | Tela de gerenciamento de planos com preview de preço formatado (BRL)  | 0.5d    | S1     |
| T-019 | Validação: clube deve ter ao menos 1 plano ativo para gerar cobranças | 0.25d   | S1     |

### US-05 — Geração de Cobranças Pix

**Como** tesoureiro, **quero** que o sistema gere automaticamente uma cobrança Pix para cada sócio no início do mês, **para** não precisar fazer isso manualmente.

| ID    | Task Técnica                                                                                    | Esforço | Sprint |
| ----- | ----------------------------------------------------------------------------------------------- | ------- | ------ |
| T-020 | Service `ChargeService.generateMonthly()`: busca sócios ativos e cria charges                   | 1d      | S2     |
| T-021 | Integração Asaas via `AsaasGateway.createCharge()`: Pix com vencimento + QR Code                | 1d      | S2     |
| T-022 | Salvar `externalId` (ID Asaas) e `gatewayMeta` (`{ qrCodeBase64, pixCopyPaste }`) na charge     | 0.5d    | S2     |
| T-023 | Job BullMQ: disparar geração de cobranças todo dia 1 às 08h (cron)                              | 0.5d    | S2     |
| T-024 | Tratamento de falha: retry 3x com backoff 1h/6h/24h; setar status `PENDING_RETRY` após exaustão | 1d      | S2     |
| T-025 | Endpoint manual `POST /api/charges/generate` para tesoureiro disparar fora do cron              | 0.5d    | S2     |

### US-06 — Webhook de Pagamento

**Como** sistema, **quero** receber confirmação de pagamento do PSP em tempo real, **para** atualizar o status do sócio automaticamente sem intervenção humana.

| ID    | Task Técnica                                                                                     | Esforço | Sprint |
| ----- | ------------------------------------------------------------------------------------------------ | ------- | ------ |
| T-026 | Endpoint `POST /webhooks/:gateway` com validação HMAC-SHA256 via `PaymentGateway.parseWebhook()` | 1d      | S2     |
| T-027 | Handler para evento `PAYMENT_RECEIVED`: cria `payments`, atualiza `charge` e `member`            | 1d      | S2     |
| T-028 | Idempotência: checar se `gateway_txid` já existe em `payments` antes de processar                | 0.5d    | S2     |
| T-029 | Responder HTTP 200 imediatamente; processar lógica em job BullMQ assíncrono                      | 0.5d    | S2     |
| T-030 | Teste de integração: simular payload Asaas com assinatura válida e inválida                      | 0.5d    | S2     |

---

## Épico 4 — Régua de Cobrança

### US-07 — Mensagens Automáticas via WhatsApp

**Como** tesoureiro, **quero** que o sistema envie mensagens automáticas de cobrança no WhatsApp, **para** não precisar copiar e colar mensagens manualmente para cada sócio.

| ID    | Task Técnica                                                                                       | Esforço | Sprint |
| ----- | -------------------------------------------------------------------------------------------------- | ------- | ------ |
| T-031 | Service `WhatsAppService` com abstração do provider (Z-API ou Evolution API)                       | 1d      | S2     |
| T-032 | Templates configuráveis por clube (D-3, D-0, D+3) com variáveis: `{nome}`, `{valor}`, `{pix_link}` | 0.5d    | S2     |
| T-033 | Job D-3: buscar charges com `due_date = hoje+3`; disparar lembrete                                 | 0.5d    | S2     |
| T-034 | Job D+3: buscar charges `OVERDUE` há 3 dias; disparar cobrança                                     | 0.5d    | S2     |
| T-035 | Rate limiter: máx. 30 msgs/min por clube usando Redis sliding window                               | 0.5d    | S2     |
| T-036 | Fallback: se WhatsApp falhar após 2 tentativas, enviar e-mail via Resend                           | 0.5d    | S3     |
| T-037 | Log de todas as mensagens enviadas na tabela `messages` (auditoria)                                | 0.25d   | S2     |

---

## Épico 5 — Dashboard e Relatórios

### US-08 — Dashboard de Inadimplência

**Como** presidente do clube, **quero** ver em tempo real quantos sócios estão adimplentes, quantos estão em atraso e quanto tenho a receber, **para** não precisar abrir uma planilha.

| ID    | Task Técnica                                                                             | Esforço | Sprint |
| ----- | ---------------------------------------------------------------------------------------- | ------- | ------ |
| T-038 | Endpoint `GET /api/dashboard/summary`: retorna contadores e valores agregados por status | 1d      | S2     |
| T-039 | Cards de KPI: Total sócios / Adimplentes / Inadimplentes / A receber                     | 0.5d    | S2     |
| T-040 | Gráfico de evolução da inadimplência nos últimos 6 meses (Recharts)                      | 1d      | S2     |
| T-041 | Tabela de sócios inadimplentes com botão "Cobrar agora" (dispara WhatsApp manual)        | 1d      | S2     |
| T-042 | Atualização em tempo real via Server-Sent Events ao receber webhook de pagamento         | 1d      | S3     |

---

## Épico 6 — Qualidade e Segurança

| ID    | Task Técnica                                                                      | Esforço | Sprint |
| ----- | --------------------------------------------------------------------------------- | ------- | ------ |
| T-043 | Setup Sentry no front e back: capturar erros não tratados em produção             | 0.5d    | S1     |
| T-044 | Rate limiting global na API: 100 req/min por IP via `@fastify/rate-limit` + Redis | 0.5d    | S1     |
| T-045 | HTTPS obrigatório; HSTS header; CSP básico no Next.js                             | 0.25d   | S1     |
| T-046 | Criptografia de CPF e telefone em repouso (pgcrypto AES-256)                      | 1d      | S1     |
| T-047 | Pipeline CI: GitHub Actions com lint + typecheck + test + build em todo PR        | 0.5d    | S1     |
| T-048 | Testes E2E com Playwright: fluxo de login, cadastro de sócio, geração de cobrança | 2d      | S3     |


| Ordem | ID | Task | Motivo da posição |
|---|---|---|---|
| 17 | T-023 | Job BullMQ cron dia 1 às 08h | Depende de T-020, T-021, T-022 |
| 18 | T-024 | Retry 3x com backoff; status `PENDING_RETRY` | Depende de T-020, T-021 |
| 19 | T-025 | `POST /api/charges/generate` (disparo manual) | Depende de T-020 |
| 20 | T-026 | `POST /webhooks/:gateway` com validação HMAC | Depende de T-021 (charges existem) |
| 21 | T-028 | Idempotência por `gateway_txid` | Depende de T-026 |
| 22 | T-027 | Handler `PAYMENT_RECEIVED`: cria payment, atualiza charge e member | Depende de T-026, T-028 |
| 23 | T-029 | Responder HTTP 200 imediato; processar em job BullMQ | Depende de T-026, T-027 |
| 24 | T-030 | Testes de integração do webhook (payload válido/inválido) | Depende de T-026 a T-029 |
| 25 | T-031 | `WhatsAppService` com abstração de provider | Depende de charges funcionando |
| 26 | T-032 | Templates configuráveis (D-3, D-0, D+3) | Depende de T-031 |
| 27 | T-037 | Log de mensagens na tabela `messages` | Depende de T-031 |
| 28 | T-035 | Rate limiter 30 msgs/min por clube (Redis) | Depende de T-031 |
| 29 | T-033 | Job D-3: lembrete de vencimento | Depende de T-031, T-032, T-035, T-037 |
| 30 | T-034 | Job D+3: cobrança de inadimplentes | Depende de T-031, T-032, T-035, T-037 |
| 31 | T-036 | Fallback e-mail via Resend se WhatsApp falhar | Depende de T-033, T-034 |
| 32 | T-038 | `GET /api/dashboard/summary` (agregados por status) | Depende de T-027 (payments confirmados existem) |
| 33 | T-039 | Cards de KPI no dashboard | Depende de T-038 |
| 34 | T-040 | Gráfico de inadimplência 6 meses (Recharts) | Depende de T-038 |
| 35 | T-041 | Tabela de inadimplentes + botão "Cobrar agora" | Depende de T-038 e T-031 |
| 36 | T-042 | Atualização em tempo real via SSE | Depende de T-027 e T-039 |
| 37 | T-043 | Setup Sentry (front + back) | Deixado por último — mais valor quando os fluxos reais já existem |