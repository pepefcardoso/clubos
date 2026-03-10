# Backlog — ClubOS v1.0

> Formato: User Story + Tasks técnicas granulares.
> Cada task deve caber em **1 dia de trabalho de 1 desenvolvedor**.
> Tasks maiores devem ser quebradas antes de entrar em sprint.
>
> **Legenda de status:** ✅ Implementado · ⬜ Pendente

---

## Resumo por Sprint

| Sprint             | Foco Principal                                              | Tasks                                          | Esforço  | Status   | Critério de Done                                                    |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------- | -------- | -------- | ------------------------------------------------------------------- |
| Sprint 1 (Sem 3–4) | Fundação: Auth, Onboarding, Segurança base, CI/CD, Landing  | T-001 a T-019 + T-044 a T-047 + T-049 a T-056 | ~14d dev | ✅ Feito | Clube consegue fazer login e cadastrar sócios e atletas; site no ar |
| Sprint 2 (Sem 5–6) | Core Financeiro: Cobranças Pix, Webhook, WhatsApp D-3/D0    | T-020 a T-035 + T-037 a T-041                  | ~12d dev | ✅ Feito | Primeiro Pix cobrado e confirmado end-to-end                        |
| Sprint 3 (Sem 7–8) | Polimento e Confiabilidade: SSE, E2E tests, Fallback e-mail | T-036 + T-042 + T-043 + T-048                  | ~5d dev  | ⚠️ Parcial | Sistema roda 1 semana em prod sem incidente crítico               |
| Sprint 4 (Sem 9)   | Fechamento v1.0: Stub atletas + Telas pendentes MUST + S4   | T-054 a T-060                                  | ~4d dev  | ⬜ Pendente | Todos os itens MUST do MoSCoW entregues; v1.0 feature-complete   |

> **Nota Sprint 4:** as tasks T-054 a T-056 (stub de atletas) estavam planejadas no Sprint 1 mas não foram implementadas — entram como prioridade máxima do Sprint 4 junto com as telas de frontend pendentes do MUST.

---

## Épico 1 — Onboarding e Autenticação

### US-01 — Cadastro do Clube

**Como** presidente de clube, **quero** criar uma conta e configurar meu clube em menos de 5 minutos, **para** começar a usar o sistema sem precisar de suporte.

| ID    | Task Técnica                                                             | Esforço | Sprint | Status |
| ----- | ------------------------------------------------------------------------ | ------- | ------ | ------ |
| T-001 | Criar schema de banco `clube_{id}` via raw SQL ao onboarding             | 1d      | S1     | ✅     |
| T-002 | Endpoint `POST /api/clubs` com validação Zod (name, slug, cnpj opcional) | 0.5d    | S1     | ✅     |
| T-003 | Tela de onboarding multi-step: Dados do clube → Logo → Confirmação       | 1d      | S1     | ✅     |
| T-004 | Upload de logo com resize automático (sharp) para 200x200px WebP         | 0.5d    | S1     | ✅     |
| T-005 | E-mail de boas-vindas via Resend após criação do clube                   | 0.5d    | S1     | ✅     |

### US-02 — Autenticação

**Como** tesoureiro do clube, **quero** fazer login de forma segura, **para** que nenhuma pessoa de fora acesse os dados financeiros.

| ID    | Task Técnica                                                                       | Esforço | Sprint | Status |
| ----- | ---------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-006 | Implementar JWT access token (15min) + refresh token (7d) em httpOnly cookie       | 1d      | S1     | ✅     |
| T-007 | Endpoints `POST /api/auth/login`, `/refresh` e `/logout`                           | 0.5d    | S1     | ✅     |
| T-008 | Tela de login responsiva com React Hook Form + Zod client-side                     | 0.5d    | S1     | ✅     |
| T-009 | Middleware de autenticação no Fastify (verificar JWT em todas as rotas protegidas) | 0.5d    | S1     | ✅     |
| T-010 | RBAC: roles `ADMIN` e `TREASURER` com guard por rota                               | 1d      | S1     | ✅     |

---

## Épico 2 — Gestão de Sócios

### US-03 — Cadastro e Importação de Sócios

**Como** tesoureiro, **quero** importar minha lista atual de sócios via CSV ou cadastrar manualmente, **para** não precisar redigitar todos os dados do zero.

| ID    | Task Técnica                                                                        | Esforço | Sprint | Status |
| ----- | ----------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-011 | Endpoint `POST /api/members` com Zod schema (name, cpf, phone, email, plan_id)      | 0.5d    | S1     | ✅     |
| T-012 | Parser de CSV com papaparse: validar colunas obrigatórias, reportar linhas com erro | 1d      | S1     | ✅     |
| T-013 | Bulk insert com upsert por CPF (idempotência em reimportações)                      | 0.5d    | S1     | ✅     |
| T-014 | Tela de listagem de sócios com busca, filtro por status e paginação                 | 1d      | S1     | ✅     |
| T-015 | Tela de cadastro/edição individual de sócio com seleção de plano                    | 0.5d    | S1     | ✅     |
| T-016 | Template CSV de exemplo para download na tela de importação                         | 0.25d   | S1     | ✅     |

---

## Épico 3 — Planos e Cobranças

### US-04 — Configuração de Planos

**Como** admin do clube, **quero** criar planos de sócio com preços e benefícios diferentes, **para** atender sócios de perfis variados.

| ID    | Task Técnica                                                          | Esforço | Sprint | Status |
| ----- | --------------------------------------------------------------------- | ------- | ------ | ------ |
| T-017 | CRUD de planos: `POST/GET/PUT/DELETE /api/plans`                      | 0.5d    | S1     | ✅     |
| T-018 | Tela de gerenciamento de planos com preview de preço formatado (BRL)  | 0.5d    | S1     | ✅     |
| T-019 | Validação: clube deve ter ao menos 1 plano ativo para gerar cobranças | 0.25d   | S1     | ✅     |

### US-05 — Geração de Cobranças Pix

**Como** tesoureiro, **quero** que o sistema gere automaticamente uma cobrança Pix para cada sócio no início do mês, **para** não precisar fazer isso manualmente.

| ID    | Task Técnica                                                                                    | Esforço | Sprint | Status |
| ----- | ----------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-020 | Service `ChargeService.generateMonthly()`: busca sócios ativos e cria charges                   | 1d      | S2     | ✅     |
| T-021 | Integração Asaas via `AsaasGateway.createCharge()`: Pix com vencimento + QR Code                | 1d      | S2     | ✅     |
| T-022 | Salvar `externalId` (ID Asaas) e `gatewayMeta` (`{ qrCodeBase64, pixCopyPaste }`) na charge     | 0.5d    | S2     | ✅     |
| T-023 | Job BullMQ: disparar geração de cobranças todo dia 1 às 08h (cron)                              | 0.5d    | S2     | ✅     |
| T-024 | Tratamento de falha: retry 3x com backoff 1h/6h/24h; setar status `PENDING_RETRY` após exaustão | 1d      | S2     | ✅     |
| T-025 | Endpoint manual `POST /api/charges/generate` para tesoureiro disparar fora do cron              | 0.5d    | S2     | ✅     |

### US-06 — Webhook de Pagamento

**Como** sistema, **quero** receber confirmação de pagamento do PSP em tempo real, **para** atualizar o status do sócio automaticamente sem intervenção humana.

| ID    | Task Técnica                                                                                     | Esforço | Sprint | Status |
| ----- | ------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| T-026 | Endpoint `POST /webhooks/:gateway` com validação HMAC-SHA256 via `PaymentGateway.parseWebhook()` | 1d      | S2     | ✅     |
| T-027 | Handler para evento `PAYMENT_RECEIVED`: cria `payments`, atualiza `charge` e `member`            | 1d      | S2     | ✅     |
| T-028 | Idempotência: checar se `gateway_txid` já existe em `payments` antes de processar                | 0.5d    | S2     | ✅     |
| T-029 | Responder HTTP 200 imediatamente; processar lógica em job BullMQ assíncrono                      | 0.5d    | S2     | ✅     |
| T-030 | Teste de integração: simular payload Asaas com assinatura válida e inválida                      | 0.5d    | S2     | ✅     |

---

## Épico 4 — Régua de Cobrança

### US-07 — Mensagens Automáticas via WhatsApp

**Como** tesoureiro, **quero** que o sistema envie mensagens automáticas de cobrança no WhatsApp, **para** não precisar copiar e colar mensagens manualmente para cada sócio.

| ID    | Task Técnica                                                                                       | Esforço | Sprint | Status |
| ----- | -------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-031 | Service `WhatsAppService` com abstração do provider (Z-API ou Evolution API)                       | 1d      | S2     | ✅     |
| T-032 | Templates configuráveis por clube (D-3, D-0, D+3) com variáveis: `{nome}`, `{valor}`, `{pix_link}` | 0.5d    | S2     | ✅     |
| T-033 | Job D-3: buscar charges com `due_date = hoje+3`; disparar lembrete                                 | 0.5d    | S2     | ✅     |
| T-034 | Job D+3: buscar charges `OVERDUE` há 3 dias; disparar cobrança                                     | 0.5d    | S2     | ✅     |
| T-035 | Rate limiter: máx. 30 msgs/min por clube usando Redis sliding window                               | 0.5d    | S2     | ✅     |
| T-036 | Fallback: se WhatsApp falhar após 2 tentativas, enviar e-mail via Resend                           | 0.5d    | S3     | ✅     |
| T-037 | Log de todas as mensagens enviadas na tabela `messages` (auditoria)                                | 0.25d   | S2     | ✅     |

---

## Épico 5 — Dashboard e Relatórios

### US-08 — Dashboard de Inadimplência

**Como** presidente do clube, **quero** ver em tempo real quantos sócios estão adimplentes, quantos estão em atraso e quanto tenho a receber, **para** não precisar abrir uma planilha.

| ID    | Task Técnica                                                                             | Esforço | Sprint | Status |
| ----- | ---------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-038 | Endpoint `GET /api/dashboard/summary`: retorna contadores e valores agregados por status | 1d      | S2     | ✅     |
| T-039 | Cards de KPI: Total sócios / Adimplentes / Inadimplentes / A receber                     | 0.5d    | S2     | ✅     |
| T-040 | Gráfico de evolução da inadimplência nos últimos 6 meses (Recharts)                      | 1d      | S2     | ✅     |
| T-041 | Tabela de sócios inadimplentes com botão "Cobrar agora" (dispara WhatsApp manual)        | 1d      | S2     | ✅     |
| T-042 | Atualização em tempo real via Server-Sent Events ao receber webhook de pagamento         | 1d      | S3     | ✅     |

---

## Épico 6 — Qualidade e Segurança

| ID    | Task Técnica                                                                      | Esforço | Sprint | Status |
| ----- | --------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-043 | Setup Sentry no front e back: capturar erros não tratados em produção             | 0.5d    | S3     | ⬜     |
| T-044 | Rate limiting global na API: 100 req/min por IP via `@fastify/rate-limit` + Redis | 0.5d    | S1     | ✅     |
| T-045 | HTTPS obrigatório; HSTS header; CSP básico no Next.js                             | 0.25d   | S1     | ✅     |
| T-046 | Criptografia de CPF e telefone em repouso (pgcrypto AES-256)                      | 1d      | S1     | ✅     |
| T-047 | Pipeline CI: GitHub Actions com lint + typecheck + test + build em todo PR        | 0.5d    | S1     | ✅     |
| T-048 | Testes E2E com Playwright: fluxo de login, cadastro de sócio, geração de cobrança | 2d      | S3     | ⬜     |

---

## Épico 7 — Landing Page e Site de Marketing

### US-09 — Site Público de Marketing

**Como** potencial cliente (presidente de clube), **quero** acessar um site claro sobre o ClubOS, **para** entender a proposta de valor e iniciar o cadastro sem precisar falar com ninguém.

> A landing page fica dentro de `apps/web/` usando route groups do Next.js App Router. Não há app separado. Ver decisão arquitetural completa em `design-docs.md`.

| ID    | Task Técnica                                                                                        | Esforço | Sprint | Status |
| ----- | --------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-049 | Setup dos route groups `(marketing)` e `(app)` no App Router; configurar layouts raiz independentes | 0.25d   | S1     | ✅     |
| T-050 | Layout público: header com navegação (logo, links, CTA "Começar grátis") + footer                   | 0.5d    | S1     | ✅     |
| T-051 | Tela: Landing page principal — hero, proposta de valor, features, prova social, CTA final           | 1d      | S1     | ✅     |
| T-052 | Tela: Página de preços com tabela comparativa de planos e CTA por tier                              | 0.5d    | S1     | ✅     |
| T-053 | Tela: Página de contato com formulário simples (nome, e-mail, mensagem) integrado ao Resend         | 0.25d   | S1     | ✅     |

---

## Épico 8 — Cadastro de Atletas (Stub v1.0)

> **Contexto:** a entidade `athlete` é a espinha dorsal dos módulos TreinoOS, BaseForte, FisioBase, ScoutLink e CampeonatOS. Criá-la em v1.0 — sem qualquer lógica de treino ou saúde — elimina a dependência falsa descrita na justificativa da v1.5 ("o cadastro de atletas já existe") e evita migração dolorosa de dados em versões futuras. O stub contém apenas os campos de identidade e vínculo; tudo relativo a carga, lesão ou avaliação técnica pertence às versões seguintes.

### US-10 — Stub de Cadastro de Atletas

**Como** admin do clube, **quero** cadastrar os atletas do elenco com informações básicas, **para** que os módulos de treino e saúde das versões futuras já encontrem essa entidade pronta e vinculada ao clube.

| ID    | Task Técnica                                                                                                                                  | Esforço | Sprint | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-054 | Schema `athletes` no banco: `id`, `club_id`, `name`, `cpf`, `birth_date`, `position` (enum), `status` (ACTIVE/INACTIVE), `created_at`; provisionar tabela no DDL tenant em `lib/tenant-schema.ts` | 0.5d | S4 | ⬜ |
| T-055 | Endpoints CRUD `POST/GET/PUT/DELETE /api/athletes` com Zod schema; listagem com filtro por posição e status; upsert por CPF para idempotência; `AuditLog` nas operações de escrita | 0.5d | S4 | ⬜ |
| T-056 | Tela de listagem e cadastro/edição de atletas (nome, CPF, data de nascimento, posição, status); reutiliza componentes da tela de sócios; entrada na sidebar | 0.5d | S4 | ⬜ |

---

## Épico 9 — Telas e Endpoints Pendentes do MUST

> **Contexto:** as features a seguir têm backend completamente implementado. O que falta é exclusivamente a camada de apresentação (frontend) ou um endpoint de conveniência sobre dado já existente no banco. São os últimos itens para fechar o escopo MUST do MoSCoW v1.0.

### US-11 — Importação de Sócios via CSV (Frontend)

**Como** tesoureiro, **quero** fazer upload de um arquivo CSV diretamente na tela de sócios, **para** importar o elenco em massa sem precisar usar a API manualmente.

> Endpoints `POST /api/members/import` e `GET /api/members/import/template` já disponíveis no backend (T-012, T-013, T-016).

| ID    | Task Técnica                                                                                                                                            | Esforço | Sprint | Status |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-057 | Fluxo de upload CSV na `MembersPage`: botão "Importar CSV", drag-and-drop ou file picker, preview de erros por linha retornados pelo backend, feedback de sucesso com contador de sócios importados; link para download do template | 0.5d | S4 | ⬜ |

### US-12 — Tela de Cobranças Pix

**Como** tesoureiro, **quero** visualizar as cobranças geradas para cada sócio, ver o QR Code Pix e o status de pagamento, **para** acompanhar a situação financeira do mês sem depender do dashboard agregado.

> Geração de cobranças (T-020 a T-025) e gateway Asaas com `qrCodeBase64` + `pixCopyPaste` (T-021, T-022) já implementados.

| ID    | Task Técnica                                                                                                                                                          | Esforço | Sprint | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-058 | Tela de cobranças (`/charges`): listagem paginada por mês com status (PENDING / PAID / OVERDUE / PENDING_RETRY), exibição de QR Code e copia-e-cola Pix em modal; botão de disparo manual de geração (`POST /api/charges/generate`); entrada na sidebar | 1d | S4 | ⬜ |

### US-13 — Configuração de Templates de Mensagem

**Como** admin do clube, **quero** personalizar os textos das mensagens de cobrança enviadas por WhatsApp e e-mail, **para** que a comunicação com os sócios reflita o tom e a identidade do meu clube.

> Endpoints `GET/PUT/DELETE /api/templates/:key` já disponíveis no backend (T-032).

| ID    | Task Técnica                                                                                                                                                    | Esforço | Sprint | Status |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-059 | Tela de templates (`/settings/templates`): listagem dos templates D-3, D+3 e on-demand por canal (WhatsApp / e-mail); editor de texto com preview de placeholders (`{nome}`, `{valor}`, `{pix_link}`, `{vencimento}`); botão de reset para o template padrão | 0.5d | S4 | ⬜ |

### US-14 — Histórico de Pagamentos por Sócio (Backend)

**Como** tesoureiro, **quero** consultar o histórico de pagamentos de um sócio específico, **para** resolver disputas e emitir comprovantes sem precisar vasculhar o `audit_log`.

> Os dados já existem na tabela `payments` joinada com `charges`. O `audit_log` persiste `PAYMENT_CONFIRMED` em cada pagamento. Falta apenas a rota de leitura.

| ID    | Task Técnica                                                                                                                              | Esforço | Sprint | Status |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| T-060 | Endpoint `GET /api/members/:memberId/payments`: lista pagamentos do sócio com join em `charges` (valor, vencimento, método, `paid_at`, `gateway_txid`); paginado; guard `TREASURER` | 0.5d | S4 | ⬜ |

---

## Ordem de Execução (referência)

> Atualizada para refletir o estado real de implementação. Tasks ✅ já concluídas; ⬜ indica a sequência recomendada para o Sprint 4.

| Ordem | ID    | Task                                          | Status | Motivo da posição                                                         |
| ----- | ----- | --------------------------------------------- | ------ | ------------------------------------------------------------------------- |
| 1     | T-054 | Schema `athletes` no banco + DDL tenant        | ⬜     | Base para T-055 e T-056; deve preceder qualquer módulo da v1.5            |
| 2     | T-055 | CRUD `/api/athletes`                          | ⬜     | Depende de T-054                                                          |
| 3     | T-056 | Tela de listagem e cadastro de atletas        | ⬜     | Depende de T-055                                                          |
| 4     | T-060 | Endpoint `GET /api/members/:memberId/payments` | ⬜     | Backend puro; sem dependência de frontend; desbloqueia S4 no MoSCoW       |
| 5     | T-057 | Fluxo de upload CSV na `MembersPage`          | ⬜     | Frontend sobre backend já existente; sem bloqueios                        |
| 6     | T-058 | Tela de cobranças Pix                         | ⬜     | Depende de T-020 a T-025 (todos ✅); maior impacto de UX do sprint        |
| 7     | T-059 | Tela de templates de mensagem                 | ⬜     | Depende de T-032 (✅); pode entrar em paralelo com T-058                  |
| 8     | T-043 | Setup Sentry (front + back)                   | ⬜     | Mais valor quando todos os fluxos reais já existem — último item do S3/S4 |
| 9     | T-048 | Testes E2E com Playwright                     | ⬜     | Fecha o sprint; cobre o fluxo completo com as telas recém-entregues       |
