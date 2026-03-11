# Backlog — ClubOS v1.0

> **Formato:** User Story + Tarefas técnicas granulares.
> Cada tarefa deve caber em **1 dia de trabalho de 1 desenvolvedor**.
> Tarefas maiores devem ser decompostas antes de entrarem na sprint.
> **Legenda de status:** ✅ Implementado · ⬜ Pendente · ⚠️ Parcial

---

## Resumo por Sprint

| Sprint                   | Foco Principal                                                                           | Tarefas                                       | Esforço  | Status      | Critérios de "Pronto" (Done)                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------- | -------- | ----------- | ----------------------------------------------------------------------------------------- |
| **Sprint 1 (Sem 3–4)**   | Fundação: Autenticação, Onboarding, Segurança base, CI/CD e Landing Page                 | T-001 a T-019 + T-044 a T-047 + T-049 a T-056 | ~14d dev | ✅ Feito    | O Clube consegue logar e cadastrar sócios/atletas; site no ar.                            |
| **Sprint 2 (Sem 5–6)**   | Core Financeiro: Cobranças via Pix, Webhooks e Régua WhatsApp (D-3/D0)                   | T-020 a T-035 + T-037 a T-041                 | ~12d dev | ✅ Feito    | Primeira cobrança Pix gerada e confirmada de ponta a ponta.                               |
| **Sprint 3 (Sem 7–8)**   | Polimento e Confiabilidade: SSE, Testes E2E e Contingência de E-mail                     | T-036 + T-042 + T-043 + T-048                 | ~5d dev  | ⚠️ Parcial  | Sistema rodando 1 semana em produção sem incidentes críticos.                             |
| **Sprint 4 (Sem 9–10)**  | Fechamento v1.0: Stub atletas + Contratos/BID + Multi-Acquiring + Telas MUST             | T-054 a T-060 + T-076 a T-084                 | ~12d dev | ⚠️ Parcial  | Todos os itens MUST do MoSCoW entregues; v1.0 funcionalmente completa.                    |
| **Sprint 5 (Sem 11–12)** | Hardening de Segurança: Correção de lacunas críticas e médias (`security-guidelines.md`) | T-061 a T-075                                 | ~8d dev  | ⬜ Pendente | Checklist de deploy (`security-guidelines.md §13`) 100% aprovado; zero falhas 🔴 abertas. |

> **Nota Sprint 3:** T-036 ✅ (fallback e-mail) e T-042 ✅ (SSE) entregues. T-043 (Sentry) e T-048 (E2E) permanecem ⬜.
> **Nota Sprint 4:** T-054 ✅ (schema athletes), T-055 ✅ (CRUD /api/athletes + AuditLog) e T-056 ✅ (frontend atletas + sidebar) entregues. Tarefas T-057 a T-060 e T-076 a T-084 permanecem ⬜.

---

## Épico 1 — Onboarding e Autenticação

### US-01 — Cadastro do Clube

**Como** presidente de clube, **quero** criar uma conta e configurar meu clube em menos de 5 minutos, **para** começar a usar o sistema sem precisar de suporte.

| ID        | Tarefa Técnica                                                              | Esforço | Sprint | Status |
| --------- | --------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-001** | Criar schema de banco `clube_{id}` via SQL puro (raw) no onboarding         | 1d      | S1     | ✅     |
| **T-002** | Endpoint `POST /api/clubs` com validação Zod (nome, slug, cnpj opcional)    | 0.5d    | S1     | ✅     |
| **T-003** | Tela de onboarding multi-etapa: Dados do clube → Logo → Confirmação         | 1d      | S1     | ✅     |
| **T-004** | Upload de logo com redimensionamento automático (Sharp) para 200x200px WebP | 0.5d    | S1     | ✅     |
| **T-005** | E-mail de boas-vindas via Resend após criação do clube                      | 0.5d    | S1     | ✅     |

### US-02 — Autenticação

**Como** tesoureiro, **quero** fazer login de forma segura, **para** que ninguém externo acesse os dados financeiros.

| ID        | Tarefa Técnica                                                                 | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-006** | JWT: access token (15min) + refresh token (7d) em httpOnly cookie              | 1d      | S1     | ✅     |
| **T-007** | Endpoints `POST /api/auth/login`, `/refresh` e `/logout`                       | 0.5d    | S1     | ✅     |
| **T-008** | Tela de login responsiva com React Hook Form + Zod (client-side)               | 0.5d    | S1     | ✅     |
| **T-009** | Middleware de autenticação no Fastify (verificação de JWT em rotas protegidas) | 0.5d    | S1     | ✅     |
| **T-010** | RBAC: Roles `ADMIN` e `TREASURER` com guarda (guard) por rota                  | 1d      | S1     | ✅     |

---

## Épico 2 — Gestão de Sócios

### US-03 — Cadastro e Importação de Sócios

**Como** tesoureiro, **quero** importar minha lista via CSV ou cadastrar manualmente, **para** evitar redigitação de dados.

| ID        | Tarefa Técnica                                                                 | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-011** | Endpoint `POST /api/members` com schema Zod completo                           | 0.5d    | S1     | ✅     |
| **T-012** | Parser de CSV (Papaparse): validação de colunas e relatório de erros por linha | 1d      | S1     | ✅     |
| **T-013** | Inserção em massa (Bulk) com upsert por CPF (idempotência)                     | 0.5d    | S1     | ✅     |
| **T-014** | Tela de listagem de sócios com busca, filtros e paginação                      | 1d      | S1     | ✅     |
| **T-015** | Tela de cadastro/edição individual de sócio com seleção de plano               | 0.5d    | S1     | ✅     |
| **T-016** | Template CSV de exemplo para download na tela de importação                    | 0.25d   | S1     | ✅     |

---

## Épico 3 — Planos e Cobranças

### US-04 — Configuração de Planos

**Como** admin, **quero** criar planos com diferentes preços, **para** atender diversos perfis de sócios.

| ID        | Tarefa Técnica                                                     | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-017** | CRUD de planos: `POST/GET/PUT/DELETE /api/plans`                   | 0.5d    | S1     | ✅     |
| **T-018** | Tela de gestão de planos com preview de preço formatado (BRL)      | 0.5d    | S1     | ✅     |
| **T-019** | Validação: Bloquear geração de cobranças se não houver plano ativo | 0.25d   | S1     | ✅     |

### US-05 — Geração de Cobranças Pix

**Como** tesoureiro, **quero** que o sistema gere cobranças Pix automaticamente no início do mês.

| ID        | Tarefa Técnica                                                            | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-020** | Service `ChargeService.generateMonthly()`: busca ativos e gera cobranças  | 1d      | S2     | ✅     |
| **T-021** | Integração Asaas: `AsaasGateway.createCharge()` (Pix + QR Code)           | 1d      | S2     | ✅     |
| **T-022** | Persistência de `externalId` e metadados do gateway (`qrCodeBase64`, etc) | 0.5d    | S2     | ✅     |
| **T-023** | Job BullMQ: Cron para disparar geração todo dia 1º às 08h                 | 0.5d    | S2     | ✅     |
| **T-024** | Tratamento de falhas: Retry (3x) e status `PENDING_RETRY` após exaustão   | 1d      | S2     | ✅     |
| **T-025** | Endpoint manual `POST /api/charges/generate` para disparo sob demanda     | 0.5d    | S2     | ✅     |

### US-06 — Webhook de Pagamento

**Como** sistema, **quero** receber confirmações do gateway em tempo real, **para** atualizar o status do sócio automaticamente.

| ID        | Tarefa Técnica                                                                | Esforço | Sprint | Status |
| --------- | ----------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-026** | Endpoint `POST /webhooks/:gateway` com validação HMAC-SHA256                  | 1d      | S2     | ✅     |
| **T-027** | Handler `PAYMENT_RECEIVED`: atualiza `payments`, `charge` e `member`          | 1d      | S2     | ✅     |
| **T-028** | Idempotência: validar `gateway_txid` antes de processar                       | 0.5d    | S2     | ✅     |
| **T-029** | Resposta HTTP 200 imediata; processamento assíncrono via BullMQ               | 0.5d    | S2     | ✅     |
| **T-030** | Teste de integração: simulação de payloads Asaas (assinatura válida/inválida) | 0.5d    | S2     | ✅     |

---

## Épico 4 — Régua de Cobrança

### US-07 — Mensagens Automáticas via WhatsApp

**Como** tesoureiro, **quero** que o sistema envie lembretes automáticos, **para** reduzir a inadimplência sem esforço manual.

| ID        | Tarefa Técnica                                                            | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-031** | Service `WhatsAppService` com abstração de provider (Z-API/Evolution)     | 1d      | S2     | ✅     |
| **T-032** | Templates configuráveis com variáveis (`{nome}`, `{valor}`, `{pix_link}`) | 0.5d    | S2     | ✅     |
| **T-033** | Job D-3: Lembrete automático 3 dias antes do vencimento                   | 0.5d    | S2     | ✅     |
| **T-034** | Job D+3: Cobrança de faturas em atraso (`OVERDUE`)                        | 0.5d    | S2     | ✅     |
| **T-035** | Rate limiter: Máximo de 30 msgs/min por clube (Redis Sliding Window)      | 0.5d    | S2     | ✅     |
| **T-036** | Fallback: Enviar e-mail via Resend se o WhatsApp falhar após retentativas | 0.5d    | S3     | ✅     |
| **T-037** | Auditoria: Log de mensagens enviadas na tabela `messages`                 | 0.25d   | S2     | ✅     |

---

## Épico 5 — Dashboard e Relatórios

### US-08 — Dashboard de Inadimplência

**Como** presidente, **quero** ver os indicadores financeiros em tempo real, **para** evitar o uso de planilhas.

| ID        | Tarefa Técnica                                                        | Esforço | Sprint | Status |
| --------- | --------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-038** | Endpoint `GET /api/dashboard/summary`: agregados por status           | 1d      | S2     | ✅     |
| **T-039** | Cards de KPI: Total de Sócios, Adimplentes, Inadimplentes e A Receber | 0.5d    | S2     | ✅     |
| **T-040** | Gráfico de evolução de inadimplência (6 meses) com Recharts           | 1d      | S2     | ✅     |
| **T-041** | Tabela de inadimplentes com ação de "Cobrar agora" (WhatsApp manual)  | 1d      | S2     | ✅     |
| **T-042** | Atualização Real-time via Server-Sent Events (SSE) pós-pagamento      | 1d      | S3     | ✅     |

---

## Épico 6 — Qualidade e Segurança

| ID        | Tarefa Técnica                                                      | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-043** | Setup Sentry: Filtro de dados sensíveis e amostragem de 10% em prod | 0.5d    | S3     | ⬜     |
| **T-044** | Rate limiting global: 100 req/min por IP (Fastify + Redis)          | 0.5d    | S1     | ✅     |
| **T-045** | HTTPS obrigatório, headers HSTS e CSP básico no Next.js             | 0.25d   | S1     | ✅     |
| **T-046** | Criptografia em repouso de CPF e Telefone (pgcrypto AES-256)        | 1d      | S1     | ✅     |
| **T-047** | Pipeline CI: GitHub Actions (Lint, Typecheck, Test, Build)          | 0.5d    | S1     | ✅     |
| **T-048** | Testes E2E (Playwright): Fluxos críticos de login e cobrança        | 2d      | S3     | ⬜     |

---

## Épico 7 — Landing Page e Marketing

### US-09 — Site Público

**Como** potencial cliente, **quero** entender a proposta de valor do ClubOS, **para** iniciar meu cadastro autonomamente.

| ID        | Tarefa Técnica                                           | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------- | ------- | ------ | ------ |
| **T-049** | Setup de Route Groups `(marketing)` e `(app)` no Next.js | 0.25d   | S1     | ✅     |
| **T-050** | Layout público: Header navegação, CTA e Footer           | 0.5d    | S1     | ✅     |
| **T-051** | Landing Page: Seções Hero, Features e Prova Social       | 1d      | S1     | ✅     |
| **T-052** | Página de Preços: Tabela comparativa e tiers             | 0.5d    | S1     | ✅     |
| **T-053** | Página de Contato: Formulário integrado ao Resend        | 0.25d   | S1     | ✅     |

---

## Épico 8 — Cadastro de Atletas (Stub v1.0)

> **Contexto:** Criação da entidade base para evitar migrações complexas no futuro. O stub foca em identidade e vínculo, sem lógica de saúde ou treino ainda. Entidade `athlete` é dependência central de TreinoOS (v1.5), BaseForte, FisioBase, ScoutLink e CampeonatOS.

### US-10 — Stub de Atletas

**Como** admin, **quero** cadastrar atletas básicos, **para** que módulos futuros já encontrem a base pronta.

| ID        | Tarefa Técnica                                                                                                                  | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-054** | Schema `athletes` no DDL tenant: ID, Clube, Nome, CPF (BYTEA), Nascimento, Posição, Status + `provisionTenantSchema` atualizado | 0.5d    | S4     | ✅     |
| **T-055** | CRUD `GET/POST/PUT /api/athletes` com AuditLog em operações de escrita                                                          | 0.5d    | S4     | ✅     |
| **T-056** | Frontend: Telas de listagem e cadastro de atletas + entrada na sidebar (reuso de componentes de sócios)                         | 0.5d    | S4     | ✅     |

---

## Épico 9 — Telas Pendentes (MUST)

### US-11 — Importação via CSV (Frontend)

| ID        | Tarefa Técnica                                                                                                                               | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-057** | Fluxo de upload: Dropzone, preview de erros por linha e feedback visual na `MembersPage` (endpoint `POST /api/members/import` já disponível) | 0.5d    | S4     | ⬜     |

### US-12 — Tela de Cobranças Pix

| ID        | Tarefa Técnica                                                                 | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-058** | Página `/charges`: Listagem mensal, modal de QR Code e botão de geração manual | 1d      | S4     | ⬜     |

### US-13 — Configuração de Templates

| ID        | Tarefa Técnica                                                                                                                                             | Esforço | Sprint | Status |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-059** | Editor de templates: Personalização de mensagens WhatsApp/e-mail e preview de placeholders (endpoints `GET/PUT/DELETE /api/templates/:key` já disponíveis) | 0.5d    | S4     | ⬜     |

### US-14 — Histórico de Pagamentos (Backend)

| ID        | Tarefa Técnica                                                                                                   | Esforço | Sprint | Status |
| --------- | ---------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-060** | Endpoint `GET /api/members/:id/payments` com join em cobranças (`payments` + `charges`; dado já existe no banco) | 0.5d    | S4     | ⬜     |

---

## Épico 10 — Hardening de Segurança

> **Prioridade:** Lacunas 🔴 **Alta** devem ser fechadas antes de qualquer deploy em produção.

### US-15 a US-22 — Reforço de Segurança (Resumo)

| ID        | Lacuna / Tarefa Técnica                                                | Prioridade | Sprint | Status |
| --------- | ---------------------------------------------------------------------- | ---------- | ------ | ------ |
| **T-061** | **[L-01]** Proteção contra Força Bruta (Redis Lockout 15min)           | 🔴 Alta    | S5     | ⬜     |
| **T-063** | **[L-03]** CORS restrito (remover wildcards em produção)               | 🔴 Alta    | S5     | ⬜     |
| **T-065** | **[L-12]** Error Handler: Ocultar stack traces em produção             | 🔴 Alta    | S5     | ⬜     |
| **T-066** | **[L-04]** Autorização em Nível de Objeto (Prevenção de IDOR)          | 🔴 Alta    | S5     | ⬜     |
| **T-067** | **[L-05]** Validação de Magic Bytes e sanitização de nomes de arquivos | 🔴 Alta    | S5     | ⬜     |
| **T-068** | **[L-14]** SSL/TLS obrigatório na conexão com PostgreSQL               | 🔴 Alta    | S5     | ⬜     |
| **T-069** | **[L-08]** Redis com TLS e Autenticação ativa                          | 🔴 Alta    | S5     | ⬜     |
| **T-071** | **[L-11]** Proteção contra Replay em Webhooks (Timestamp check)        | 🟡 Média   | S5     | ⬜     |
| **T-072** | **[L-07]** Sanitização contra Injeção de CSV (prefixo `'`)             | 🟡 Média   | S5     | ⬜     |
| **T-074** | **[L-10]** Auditoria de dependências no CI (`npm audit`)               | 🟡 Média   | S5     | ⬜     |
| **T-075** | **[L-15]** Proteção CSRF em API Routes de marketing                    | 🟡 Média   | S5     | ⬜     |

---

## Épico 11 — Contratos e Alertas BID/CBF (M10 — MUST)

> **Contexto:** A escalação irregular de jogadores sem registro no BID da CBF resulta em perda automática de pontos e pode excluir o clube do campeonato. É o risco jurídico-esportivo de maior impacto imediato — comparable à multa da ANPD em gravidade. Regras CBF/FPF são parametrizadas em motor desacoplado, gerenciável via Backoffice sem deploy.

### US-23 — Vínculos Trabalhistas e Elegibilidade

**Como** admin, **quero** registrar contratos de atletas e receber alertas de BID/CBF, **para** evitar escalação irregular e perda de pontos.

| ID        | Tarefa Técnica                                                                                                                                   | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-076** | Schema `contracts` no DDL tenant: tipo de vínculo, `startDate`, `endDate`, `status`, `bidRegistered` (bool) + `provisionTenantSchema` atualizado | 0.5d    | S4     | ✅     |
| **T-077** | CRUD `GET/POST/PUT /api/contracts` com AuditLog em escrita; validação Zod                                                                        | 0.5d    | S4     | ✅     |
| **T-078** | Motor de Regras Esportivas: `rules_config` (JSONB por temporada/liga), `RulesValidator.check(athlete, ruleSet)` — parametrizável sem deploy      | 1d      | S4     | ✅     |
| **T-079** | Service de alertas: vencimento de contrato (D-7 e D-1) + BID pendente antes de escalação — WhatsApp/e-mail via régua existente                   | 0.5d    | S4     | ✅     |
| **T-080** | Frontend: telas de listagem e cadastro de contratos + entrada na sidebar (`/contracts`) — reuso de componentes existentes                        | 0.5d    | S4     | ⬜     |

---

## Épico 12 — Multi-Acquiring PIX (M11 — MUST)

> **Contexto:** Gateways de pagamento caem na data de vencimento. Para um clube que depende da receita de sócios para pagar salários, uma cobrança perdida é dinheiro real que não volta. > O fallback é silencioso para o sócio; o clube recebe notificação apenas no fallback final (PIX estático manual). Stripe é incluída como gateway internacional, preparando a base para expansão futura sem nova migração.

### US-24 — Resiliência de Gateway de Pagamento

**Como** sistema, **quero** ter fallback automático de gateway de pagamento, **para** que indisponibilidade do Asaas não interrompa as cobranças.

| ID        | Tarefa Técnica                                                                                                                                                  | Esforço | Sprint | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-081** | Implementar `PagarmeGateway` seguindo a interface `PaymentGateway` (PIX com QR Code, mapeamento de webhooks)                                                    | 1d      | S4     | ⬜     |
| **T-082** | Lógica de fallback silencioso em `GatewayRegistry.forMethod('PIX')`: Asaas → Pagarme → PIX estático do clube; campo `pixKeyFallback` no schema `clubs` e no DDL | 0.5d    | S4     | ⬜     |
| **T-083** | Notificação ao clube quando fallback é acionado (WhatsApp/e-mail via régua existente) + campo `pixKeyFallback` no wizard de onboarding                          | 0.5d    | S4     | ⬜     |
| **T-085** | Implementar `StripeGateway` seguindo a interface `PaymentGateway` (PIX via Stripe Brazil, mapeamento de webhooks com `stripe-signature`); registrar no `GatewayRegistry` como provider opcional via env `STRIPE_ENABLED=true` | 1d | S4 | ⬜ |

---

## Épico 13 — Job D-0 (Régua Completa — SHOULD S9)

> **Contexto:** Único marco da régua de cobrança sem automação. O on-demand (`POST /api/members/:id/remind`) cobre parcialmente, mas não escala para clubes com centenas de sócios no vencimento.

### US-25 — Aviso Automático no Dia do Vencimento

**Como** tesoureiro, **quero** que o sistema avise automaticamente os sócios no dia do vencimento, **para** fechar a régua sem intervenção manual.

| ID        | Tarefa Técnica                                                                                                                                   | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-084** | Job D-0: dispatch + worker BullMQ (cron `0 8 * * *`, fila `due-today-notices`, `sendDueTodayNoticesForClub`) — mesmo padrão fan-out de D-3 e D+3 | 0.5d    | S4     | ⬜     |

---

## Ordem de Execução Recomendada (Sprint 4 e 5)

### Sprint 4 — Fechamento v1.0 (Foco em Funcionalidades MUST)

**Bloco 1 — Backend MUSTs (sequência crítica)**

7. **T-081 → T-082 → T-083 → T-085:** Multi-Acquiring PIX (Pagarme + fallback + onboarding + Stripe).
8. **T-060:** Endpoint histórico de pagamentos (backend isolado, ~0.5d).
9. **T-084:** Job D-0 (último job da régua, fecha M6).

**Bloco 2 — Frontend MUSTs + SHOULD**

10. **T-057:** Fluxo CSV na `MembersPage` (endpoint já disponível).
11. **T-058:** Página `/charges` com QR Code (backend Asaas plenamente disponível).
12. **T-059:** Editor de templates (endpoints já disponíveis).
13. ~~**T-056:** Tela de atletas + entrada sidebar~~ ✅
14. **T-080:** Tela de contratos + entrada sidebar.

**Bloco 3 — Qualidade (fechar Sprint 3 pendente)**

15. **T-043:** Setup Sentry.
16. **T-048:** Testes E2E Playwright (fluxos de login e cobrança).

### Sprint 5 — Hardening de Segurança

1. **Infra Primeiro (T-068, T-069):** Garantir que o banco e o Redis estão seguros.
2. **Acesso (T-061, T-063, T-065):** Fechar as portas de entrada da API.
3. **Isolamento (T-066):** Garantir que um clube não veja dados de outro (IDOR).
4. **Paralelos (T-071 a T-075):** Reforços contra ataques específicos (Replay, CSV Injection, CSRF, auditoria de deps).
