# Backlog — ClubOS (v2.5 A Arquibancada · v3.0 A Vitrine)

> **Formato:** User Story + Tarefas técnicas granulares.
> Cada tarefa deve caber em **1 dia de trabalho de 1 desenvolvedor**.
> **Legenda de status:** ✅ Implementado · ⬜ Pendente · ⚠️ Parcial

---

## Constraint Tags (referência rápida para agentes)

| Tag          | Significado                                                                              | Fonte                                           |
| ------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `[FIN]`      | Valor monetário em cents (integer); nunca float                                          | `architecture-skills.md: FINANCIAL_CONSTRAINTS` |
| `[SEC-WH]`   | Pipeline de webhook obrigatório: timestamp → HMAC → dedup → 200 → enqueue                | `security-skills.md: WEBHOOK_SECURITY`          |
| `[SEC-JOB]`  | Payload BullMQ com IDs apenas — nunca CPF/telefone/nome                                  | `security-skills.md: ASYNC_JOBS_SECURITY`       |
| `[SEC-TEN]`  | `withTenantSchema` + `assertValidClubId` obrigatórios antes de qualquer query            | `security-skills.md: MULTI_TENANCY_ISOLATION`   |
| `[SEC-OBJ]`  | `assertXxxBelongsToClub` obrigatório em handlers de recurso único                        | `security-skills.md: AUTHORIZATION_AND_RBAC`    |
| `[SEC-FILE]` | Magic bytes via `file-type`; filename = `randomUUID()`                                   | `security-skills.md: FILE_UPLOAD_POLICIES`      |
| `[ARCH-GW]`  | `GatewayRegistry.forMethod()` ou `.get()` — nunca import direto de gateway concreto      | `architecture-skills.md: PAYMENT_ABSTRACTION`   |
| `[ARCH-JOB]` | Job BullMQ deve ser idempotente; max concurrency 5; falha → Sentry                       | `architecture-skills.md: ASYNC_JOBS`            |
| `[UI-BRL]`   | `formatBRL(cents)` + `font-mono` obrigatórios em todo valor monetário                    | `ui-ux-skills.md §2.2`                          |
| `[UI-A11Y]`  | `<label htmlFor>`, `aria-label` em ícones, badge com texto além de cor                   | `ui-ux-skills.md §5`                            |
| `[PR-FIN]`   | PR toca `charges/`, `payments/`, `webhooks/` ou `jobs/` → ≥ 2 aprovações + 80% cobertura | `agent-instructions.md §2.7`                    |

---

## Regra de Carregamento de Skill (agentes devem seguir antes de implementar qualquer US)

```
Task envolve UI / componente / estilo?           → carregar ui-ux-skills.md APENAS
Task envolve auth / RBAC / crypto / webhook?     → carregar security-skills.md APENAS
Task envolve schema DB / API / camadas?          → carregar architecture-skills.md APENAS
Task atravessa auth + schema?                    → carregar os dois; justificar inline
Task atravessa 3+ domínios?                      → carregar architecture-skills.md + o mais específico
```

---

## Resumo por Sprint (Ativas e Planejadas)

| Sprint                    | Foco Principal                                              | Tarefas       | Esforço   | Status      | Critérios de "Pronto" (Done)                                                                                             |
| ------------------------- | ----------------------------------------------------------- | ------------- | --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Sprint 12 (Sem 21–22)** | v2.5 — ArenaPass: Infraestrutura, Eventos e Venda PIX       | T-136 a T-143 | ~7d dev   | ⬜ Pendente | Schema provisionado; evento criado com setores; torcedor compra ingresso via PIX e recebe QR Code por WhatsApp/e-mail.   |
| **Sprint 13 (Sem 23–24)** | v2.5 — ArenaPass: Portaria Offline, Bilheteria e CRM        | T-144 a T-149 | ~6d dev   | ⬜ Pendente | Portaria valida ingresso em < 1s offline; relatório de bilheteria exportável; funil torcedor→sócio disparado pós-jogo.   |
| **Sprint 14 (Sem 25–26)** | v2.5 — ArenaPass: Operações de Jogo e PDV mPOS              | T-150 a T-157 | ~6d dev   | ⬜ Pendente | Checklist de jogo operacional; PDV mPOS registrando vendas; notificação de logística enviada 48h antes do evento.        |
| **Sprint 15 (Sem 27–28)** | v2.5 — ArenaPass: Patrocínio, Testes E2E e Hardening        | T-158 a T-162 | ~5d dev   | ⬜ Pendente | Patrocínio visível na confirmação; cobertura ≥ 80% nos módulos financeiros do ArenaPass; zero duplicidade de check-in.   |
| **Sprint 16 (Sem 29–30)** | v3.0 — ScoutLink: Infraestrutura, Auth Scout e Showcase API | T-163 a T-170 | ~7d dev   | ⬜ Pendente | Role SCOUT ativo; showcase publicado com assinatura do clube; upload de vídeos funcional; DDL provisionado.              |
| **Sprint 17 (Sem 31–32)** | v3.0 — ScoutLink: UI de Showcase e Busca de Atletas         | T-171 a T-176 | ~6d dev   | ⬜ Pendente | Scout realiza busca filtrada; perfil público de atleta navegável; métricas longitudinais exibidas com freemium aplicado. |
| **Sprint 18 (Sem 33–34)** | v3.0 — ScoutLink: Comunicação Mediada e Compliance LGPD     | T-177 a T-183 | ~6.5d dev | ⬜ Pendente | Solicitação de contato bloqueada para menor sem aceite parental; log imutável ativo; inbox mediada funcional.            |
| **Sprint 19 (Sem 35–36)** | v3.0 — ScoutLink: Curadoria, Monetização e Testes E2E       | T-184 a T-190 | ~6d dev   | ⬜ Pendente | Job de curadoria mensal disparado; billing de scout via PIX recorrente; cobertura ≥ 80%; hard stops validados em CI.     |

# v2.5 — "A Arquibancada" (ArenaPass)

> **Período:** Semanas 21–28 · **Sprints:** 12–15
> **Hipótese principal:** clube aumenta receita por jogo em ≥ 40% vs. caixinha manual; primeiro torcedor convertido em sócio via funil ArenaPass → ClubOS.

---

## Épico 24 — ArenaPass: Configuração de Eventos e Venda de Ingressos

**Como** administrador do clube, **quero** criar eventos com setores e preços configuráveis e vender ingressos via PIX com entrega automática de QR Code, **para** substituir a caixinha manual por um fluxo digital rastreável e sem CAPEX de maquinário.

### US-45 — Infraestrutura e Configuração de Eventos

> 🗂 **Skill:** `architecture-skills.md`
> ⚠️ **Blockers:** `[SEC-TEN]` DDL idempotente via `provisionTenantSchema`; `[FIN]` `price_cents` e `total_revenue_cents` como integer — nunca float
> 🔗 **Coupling:** `provisionTenantSchema` → verificar todas as migrations de tenant DDL

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                           | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-136** | Schema Prisma + DDL tenant para tabelas `events`, `event_sectors`, `tickets`, `fan_profiles`, `pos_sales` e `game_checklists`. Índices em `event_date` e `status`. Trigger de `tickets` impede `INSERT` quando `event_sector.capacity` é excedida. DDL idempotente via `provisionTenantSchema`. Todos os campos monetários em **integer cents** `[FIN]`. | 1d      | S12    | ⬜     |
| **T-137** | CRUD de eventos (`/api/events`): criação com campos `opponent`, `event_date`, `venue`, `description`; aninhamento de setores (`event_sectors`) com `name`, `capacity` e `price_cents`. Validação Zod; guard `requireRole('ADMIN')`. Soft-delete via `status = CANCELLED`. `clubId` extraído do JWT `[SEC-TEN]`.                                          | 1d      | S12    | ⬜     |
| **T-138** | UI de configuração de evento (`EventFormModal` + `EventSectorsTable`): formulário com campos de adversário, data, local e tabela de setores editável inline. `EventsPage` em `/access`. Exibir `price_cents` com `formatBRL()` e `font-mono` `[UI-BRL]`. Status badge com texto além de cor `[UI-A11Y]`. Visível apenas a `ADMIN`.                       | 1d      | S12    | ⬜     |

### US-46 — Venda de Ingressos via PIX e Entrega por WhatsApp/E-mail

> 🗂 **Skill:** `architecture-skills.md` + `security-skills.md`
> ⚠️ **Blockers:** `[ARCH-GW]` gateway via registry; `[SEC-WH]` pipeline de webhook obrigatório; `[SEC-JOB]` payload do worker com IDs only; `[FIN]` cents em toda operação monetária; `[PR-FIN]` ≥ 2 aprovações no PR
> 🔗 **Coupling:** `modules/charges/` → verificar `modules/payments/`, `jobs/`, `modules/webhooks/`

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                     | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-139** | Geração de cobrança PIX por ingresso: endpoint `POST /api/events/:id/tickets/purchase` que cria `Ticket` (status `PENDING`) e cobrança via `GatewayRegistry.forMethod('PIX')` `[ARCH-GW]`. Idempotência por `fan_email + event_id + sector_id`. Rejeita se `event_sector.sold >= event_sector.capacity`. `price_cents` em integer `[FIN]`. `assertEventBelongsToClub` obrigatório `[SEC-OBJ]`.     | 1d      | S12    | ⬜     |
| **T-140** | Worker BullMQ `confirm-ticket`: consumido no webhook de pagamento confirmado. Atualiza `Ticket.status = PAID`, gera QR Code HMAC-SHA256 (`ticket_id + event_id + secret`). Payload com IDs apenas — nunca e-mail ou nome no job `[SEC-JOB]`; buscar PII dentro do worker. Rate limit Redis: 30 msg/min por clube `[ARCH-JOB]`. Falha → Sentry.                                                     | 1d      | S12    | ⬜     |
| **T-141** | Página pública de compra de ingresso (`/eventos/:clubSlug/:eventId`): route group `(marketing)`, sem auth — não importar nada de `(app)/` `[ARCH]`. Exibe nome do evento, adversário, data, setores com `formatBRL(price_cents)` `[UI-BRL]` e vagas restantes. Formulário com `nome`, `email`, `telefone`, setor e integração PIX inline. Atualiza disponibilidade via polling a cada 10s.         | 1d      | S12    | ⬜     |
| **T-142** | Cancelamento de ingresso: endpoint `DELETE /api/tickets/:id` que reverte cobrança no gateway (`gateway.cancelCharge`), marca `Ticket.status = CANCELLED` e registra em `audit_log` com razão. Proibido cancelar ingresso com `checkedIn = true`. Reembolso somente até 24h antes do evento. Pagamento confirmado não pode ser deletado — apenas cancelado com razão registrada `[FIN]`. `[PR-FIN]` | 0.5d    | S12    | ⬜     |

---

## Épico 25 — ArenaPass: Portaria Offline, Bilheteria e CRM de Torcedor

**Como** staff operacional, **quero** validar ingressos offline na portaria e acompanhar métricas de bilheteria em tempo real, **para** operar eventos sem depender de conexão de dados e converter torcedores em sócios no pós-jogo.

### US-47 — Validação de Ingresso na Portaria (Offline-First)

> 🗂 **Skill:** `security-skills.md` + `architecture-skills.md`
> ⚠️ **Blockers:** `[SEC-WH]` HMAC-SHA256 + Redis SET NX na validação de QR; `[SEC-TEN]` `withTenantSchema` antes de marcar `checked_in`; dedup por `ticket_id` no Dexie.js (offline)
> 🔗 **Coupling:** `modules/events/tickets/` → verificar `field_access_logs`, `sse-bus.ts` (`CHECKIN_CONFIRMED`)

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                                            | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-143** | Backend de validação de ingresso: `POST /api/events/:id/tickets/validate` — verifica assinatura HMAC-SHA256 (`ticket_id + event_id + secret`) via `timingSafeEqual` `[SEC-WH]`, rejeita duplicatas com Redis `SET NX` (TTL 24h), marca `Ticket.checked_in = true` e registra em `field_access_logs` com `actor_id`, `timestamp` e `ip`. Retorna 409 em dupla entrada. `assertEventBelongsToClub` obrigatório `[SEC-OBJ]`. | 1d      | S13    | ⬜     |
| **T-144** | UI de portaria mobile-first (`TicketScannerPage`): câmera escaneia QR Code, exibe resultado em < 1s. Funciona offline: fila local Dexie.js com Background Sync; deduplicação por `ticket_id` para evitar duplo check-in. Contador de check-ins por setor via SSE `CHECKIN_CONFIRMED`. Status de check-in com badge textual além de cor `[UI-A11Y]`.                                                                       | 1d      | S13    | ⬜     |

### US-48 — Relatório de Bilheteria e CRM de Torcedor

> 🗂 **Skill:** `architecture-skills.md`
> ⚠️ **Blockers:** `[FIN]` receita calculada de `price_cents × sold` (integer); `[PR-FIN]` PR toca módulo financeiro → ≥ 2 aprovações; `[SEC-JOB]` job BullMQ `fan-to-member-funnel` com IDs only
> 🔗 **Coupling:** `modules/events/` → verificar `messages` (auditoria de funil), `audit_log`

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                             | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-145** | Relatório de bilheteria pós-jogo: `GET /api/events/:id/report` com receita total por setor (`price_cents × sold` em integer `[FIN]`), taxa de ocupação (%), check-ins e no-shows. PDF via `react-pdf` com logo e assinatura SHA-256 em `audit_log`. Guard `requireRole('ADMIN', 'TREASURER')`. `[PR-FIN]`                                  | 1d      | S13    | ⬜     |
| **T-146** | CRM de torcedor: tabela `fan_profiles` com `name`, `email`, `phone`, `total_spent_cents` (integer `[FIN]`) e array `event_ids`. `GET /api/fans` com busca por e-mail/telefone, paginação e ordenação por gasto. UI `FanProfilesPage` com filtros e exportação CSV. Exportação CSV: prefixar campos com `=`, `+`, `-`, `@` com `'` `[SEC]`. | 1d      | S13    | ⬜     |
| **T-147** | Funil torcedor → sócio: job BullMQ `fan-to-member-funnel` enfileirado após check-in confirmado. Payload apenas com `fan_id` e `event_id` — sem nome ou e-mail no job `[SEC-JOB]`; buscar dentro do worker. Idempotência: 1 mensagem por `fan_id + event_id`. Registro em `messages` para auditoria `[ARCH-JOB]`.                           | 1d      | S13    | ⬜     |

### US-49 — Patrocínio Programático

> 🗂 **Skill:** `architecture-skills.md` + `ui-ux-skills.md`
> ⚠️ **Blockers:** `[SEC-FILE]` validar logo por magic bytes (`file-type`) — não confiar em `Content-Type`; logo URL gerada com `randomUUID()` no path

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                   | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-148** | Campos de patrocínio em `events`: adicionar `sponsor_name`, `sponsor_logo_url` e `sponsor_cta_url`. Logo validada por magic bytes via `file-type` — não confiar em `Content-Type` `[SEC-FILE]`; filename gerado com `randomUUID()`. Dimensões mínimas 200×60px via Sharp. Logo exibida no worker `confirm-ticket` e na página pública do evento. | 0.5d    | S13    | ⬜     |

---

## Épico 26 — ArenaPass: Operações de Jogo e PDV Mobile (mPOS)

**Como** administrador do clube, **quero** gerenciar o checklist operacional de cada jogo e registrar vendas de produtos no evento via PDV mobile, **para** centralizar toda a receita do evento em um único sistema sem hardware externo obrigatório.

### US-50 — Checklist e Logística de Jogo

> 🗂 **Skill:** `architecture-skills.md`
> ⚠️ **Blockers:** `[ARCH-JOB]` job `game-logistics-notice` idempotente por `event_id`; `[SEC-JOB]` payload com IDs only
> 🔗 **Coupling:** `sse-bus.ts` → invalidar `EVENT_QUERY_KEY` no frontend ao concluir itens do checklist

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                  | Esforço | Sprint | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-149** | Job BullMQ `game-logistics-notice`: enfileirado 48h antes do evento (`event_date - 48h`), envia convocação ao capitão via WhatsApp com escalação, horário, local e link para checklist. Configurável por clube. Idempotência por `event_id` `[ARCH-JOB]`. Payload apenas com `event_id` e `clubId` `[SEC-JOB]`. | 0.5d    | S14    | ⬜     |
| **T-150** | CRUD de checklist de operações de jogo (`/api/events/:id/checklist`): itens pré-populados por categoria com campo `completed` e `completed_by`. `PATCH /api/events/:id/checklist/:itemId` para toggle. Guard `requireRole('ADMIN')`. `assertEventBelongsToClub` obrigatório `[SEC-OBJ]`.                        | 0.5d    | S14    | ⬜     |
| **T-151** | UI de checklist de jogo (`GameOpsChecklist`): lista por categoria com toggle, indicador de progresso (ex.: 7/10) e data/hora de conclusão. Visível ao `ADMIN`. Funciona offline com Dexie.js; deduplicação por `itemId` no sync `[UI-A11Y]`.                                                                    | 1d      | S14    | ⬜     |

### US-51 — PDV Mobile (mPOS)

> 🗂 **Skill:** `architecture-skills.md` + `security-skills.md`
> ⚠️ **Blockers:** `[FIN]` `price_cents` e `amount_cents` em integer em todo o módulo PDV; `[ARCH-GW]` fallback PIX via `GatewayRegistry` — nunca import direto; `[PR-FIN]` PR toca `pos_sales` → ≥ 2 aprovações
> 🔗 **Coupling:** `modules/events/pos/` → verificar `GatewayRegistry`, `audit_log`

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                           | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-152** | Catálogo de produtos do PDV: CRUD `/api/clubs/:id/pos-products` com `name`, `price_cents` (integer `[FIN]`), `category` e `stock`. Guard `requireRole('ADMIN')`. UI `PosProductsPage` com `formatBRL(price_cents)` `[UI-BRL]`.                                                                           | 0.5d    | S14    | ⬜     |
| **T-153** | Integração mPOS Stone/SumUp: `POST /api/events/:id/pos/charge` que gera cobrança no terminal via SDK (`POS_PROVIDER` env var). Registra venda em `pos_sales` com `amount_cents` em integer `[FIN]`. Fallback PIX via `GatewayRegistry.forMethod('PIX')` `[ARCH-GW]` se terminal indisponível. `[PR-FIN]` | 1d      | S14    | ⬜     |
| **T-154** | UI de PDV mobile (`PosTerminalPage`): grid de produtos, botão de cobrança, histórico de vendas do evento e total de receita com `formatBRL()` + `font-mono` `[UI-BRL]`. Visível a `ADMIN \| TREASURER`. Funciona offline: fila Dexie.js com sync ao reconectar.                                          | 1d      | S14    | ⬜     |

---

## Tarefas Técnicas Transversais (v2.5)

> ⚠️ **Blockers transversais:** `[SEC-TEN]` em toda nova query de tenant; `[ARCH-JOB]` para todos os workers; `[PR-FIN]` para T-157 (toca módulo financeiro)

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                              | Esforço | Sprint | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-155** | Provisionamento DDL tenant v2.5: atualizar `provisionTenantSchema` com tabelas `events`, `event_sectors`, `tickets`, `fan_profiles`, `pos_sales`, `game_checklists`. DDL idempotente `[SEC-TEN]`; clubes existentes recebem as tabelas automaticamente na próxima execução. | 0.5d    | S12    | ⬜     |
| **T-156** | Rotas SSE v2.5: adicionar `TICKET_SOLD`, `CHECKIN_CONFIRMED` e `EVENT_CAPACITY_UPDATED` ao `sse-bus.ts`. Invalidar `EVENT_QUERY_KEY` e `TICKETS_QUERY_KEY` no `queryClient`. Scaling note: substituir por `redis.publish/subscribe` ao ultrapassar 2 processos.             | 0.5d    | S12    | ⬜     |
| **T-157** | Testes E2E ArenaPass: criação de evento → venda PIX → QR Code gerado → check-in → relatório de bilheteria. Cobertura mínima de 80% nos módulos `events`, `tickets` e `pos_sales`. Verificar idempotência de check-in duplicado (409). `[PR-FIN]`                            | 1d      | S15    | ⬜     |
| **T-158** | Rate limiting PDV e tickets: adicionar chave `pos:{clubId}` (200 req/min) e `ticket-purchase:{eventId}` (50 req/min) ao `@fastify/rate-limit` via Redis. Previne sobrecarga em abertura de vendas de eventos populares.                                                     | 0.5d    | S15    | ⬜     |
| **T-159** | Matriz RBAC v2.5: documentar e cobrir em testes unitários os guards dos novos endpoints. `TREASURER` acessa relatório de bilheteria (leitura). `ADMIN` tem CRUD completo. `COACH` não acessa módulo de eventos. Cada linha da matriz coberta por teste unitário no CI.      | 0.5d    | S15    | ⬜     |
| **T-160** | Checklist de deploy ArenaPass: validar `POS_PROVIDER`, `STONE_API_KEY` / `SUMUP_API_KEY` no schema Zod de `lib/env.ts`. `validateEnv()` MUST ser a primeira chamada no bootstrap. Adicionar ao `.env.example`. Testes manuais de PDV com lote de 3 vendas antes de ativar.  | 0.5d    | S15    | ⬜     |

---

---

# v3.0 — "A Vitrine" (ScoutLink)

> **Período:** Meses 8–10 (Semanas 29–40 aprox.) · **Sprints:** 16–19
> **Hipótese principal:** primeiro contato formal scout–escola mediado pela plataforma; ≥ 3 scouts com assinatura ativa após 60 dias; zero incidente de contato direto com atleta menor.
>
> **Pré-requisito inviolável:** ScoutLink só entra em produção com ≥ 6 meses de dados contínuos de `workload_metrics` (BaseForte) e `medical_records` (FisioBase) em produção. Perfil rico e verificado é o diferencial — vitrine vazia não retém scouts.

---

## Épico 27 — ScoutLink: Perfil Verificado de Atleta e Infraestrutura

**Como** administrador do clube, **quero** publicar perfis verificados dos meus atletas com métricas longitudinais e vídeos, **para** que scouts encontrem talentos com dados reais e eu monetize o acesso à minha base sem expor dados clínicos privados.

### US-55 — Infraestrutura e Autenticação de Scout

> 🗂 **Skill:** `security-skills.md` + `architecture-skills.md`
> ⚠️ **Blockers:** `[SEC-TEN]` DDL do ScoutLink no schema `public` (cross-tenant) — DDL separado do `provisionTenantSchema`; `communication_log` imutável (trigger impede UPDATE/DELETE); role `SCOUT` no JWT antes de ativar guards; `[SEC-OBJ]` `assertValidClubId` antes de qualquer interpolação de schema
> 🔗 **Coupling:** `lib/env.ts` → `.env.example`, `validateEnv()` no bootstrap

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-161** | Schema Prisma no schema `public` para tabelas cross-tenant do ScoutLink: `scout_profiles`, `athlete_showcases`, `athlete_videos`, `scout_saved_searches`, `scout_contact_requests` e `communication_log`. `communication_log` é imutável (sem UPDATE/DELETE via trigger). DDL idempotente, executado separadamente do `provisionTenantSchema` `[SEC-TEN]`.    | 1d      | S16    | ⬜     |
| **T-162** | Autenticação e onboarding de scout: novo role `SCOUT` no JWT. `POST /api/scouts/register` com `name`, `email`, `organization`, `credentials`. Verificação manual por `ADMIN` antes de ativar conta. Guard `requireRole('SCOUT')` nas rotas de busca. `GET /api/scouts/me` retorna perfil e plano ativo. `clubId` — nunca do body, somente do JWT `[SEC-TEN]`. | 1d      | S16    | ⬜     |
| **T-163** | Guard de pré-requisito de dados: ao publicar showcase, verificar ≥ 90 dias de `workload_metrics` e ≥ 1 entrada em `medical_records` ou `return_to_play`. Retornar erro descritivo: `"Atleta sem dados longitudinais suficientes para publicação verificada."` Guard `requireRole('ADMIN')`.                                                                   | 0.5d    | S16    | ⬜     |

### US-56 — Showcase de Atleta

> 🗂 **Skill:** `security-skills.md` + `architecture-skills.md`
> ⚠️ **Blockers:** `[SEC]` dados médicos (`clinicalNotes`, `diagnosis`, `treatmentDetails`) **nunca** expostos no showcase — apenas enum `status` do RTP; SHA-256 como prova de autenticidade; `[SEC-OBJ]` `assertAthleteBelongsToClub` obrigatório
> 🔗 **Coupling:** `modules/medical/` → guard `requireRole('PHYSIO','ADMIN')`; `data_access_log` em toda leitura de `medical_records`

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                                              | Esforço | Sprint | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-164** | API de showcase (`POST /api/athletes/:id/showcase`): agrega ACWR médio dos últimos 90 dias, total de sessões, última avaliação técnica e status RTP — nunca `clinicalNotes` `[SEC]`. Gera `signature_hash` SHA-256 (`athlete_id + club_id + metrics_snapshot + timestamp`). `assertAthleteBelongsToClub` obrigatório `[SEC-OBJ]`. Guard `requireRole('ADMIN')`. Leitura de `medical_records` registra em `data_access_log`. | 1d      | S16    | ⬜     |
| **T-165** | UI de gestão de showcase (`ShowcaseManagerPage`): tabela de atletas com toggle de visibilidade (`PRIVATE \| SCOUTS_ONLY \| PUBLIC`), indicador de completude, botão "Publicar" com confirmação exibindo `signature_hash`. Atualizações via SSE `SHOWCASE_UPDATED`. Badge de visibilidade com texto além de cor `[UI-A11Y]`. Botão destrutivo exige modal de confirmação `[UI]`.                                             | 1d      | S16    | ⬜     |

### US-57 — Upload e Gestão de Vídeos

> 🗂 **Skill:** `security-skills.md`
> ⚠️ **Blockers:** `[SEC-FILE]` tipo validado por magic bytes (`video/mp4`, `video/quicktime`) — nunca confiar em `Content-Type`; filename = `randomUUID()` — nunca usar nome original do upload; `[SEC-TEN]` `assertAthleteBelongsToClub` antes do upload

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                       | Esforço | Sprint | Status |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-166** | Backend de upload de vídeos (`POST /api/athletes/:id/videos`): tipo por magic bytes `[SEC-FILE]`; limite 90s (FFprobe) e 500MB; thumbnail via Sharp/FFmpeg; filename = `randomUUID()` `[SEC-FILE]`; armazenamento Cloudflare R2; máx. 5 vídeos/atleta. Guard `requireRole('ADMIN', 'PHYSIO')`. `assertAthleteBelongsToClub` obrigatório `[SEC-OBJ]`. | 1d      | S17    | ⬜     |
| **T-167** | UI de upload de vídeos (`AthleteVideoManager`): lista com player, progress bar, reordenação drag-and-drop e remoção com modal de confirmação `[UI]`. Exibe duração e thumbnail. `aria-label` em todos os controles de ícone `[UI-A11Y]`. Visível a `ADMIN \| PHYSIO`.                                                                                | 1d      | S17    | ⬜     |

---

## Épico 28 — ScoutLink: Busca de Atletas e Perfil Público

**Como** scout, **quero** buscar atletas verificados por filtros técnicos e visualizar seus perfis com dados longitudinais, **para** tomar decisões de contato baseadas em evidência sem depender de intermediários ou vídeos editados não verificados.

### US-58 — Busca Filtrada e Perfil Público

> 🗂 **Skill:** `security-skills.md` + `architecture-skills.md`
> ⚠️ **Blockers:** `[SEC]` dados clínicos (`clinicalNotes`, `diagnosis`) **nunca** expostos no perfil público; hard stop para menores sem consentimento parental validado em CI; freemium enforced na API — não apenas no frontend
> 🔗 **Coupling:** `modules/medical/` → projeção condicional; `scout_saved_searches` → invalidar `SHOWCASE_QUERY_KEY`

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                                 | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-168** | API de busca (`GET /api/scout/athletes/search`): filtros por `position`, `age_min/max`, `state`, `rtp_status`, `min_acwr_avg`, `min_sessions`, `min_technical_score`. Retorna apenas atletas com `showcase.visibility` em `SCOUTS_ONLY` ou `PUBLIC`. Freemium enforced na **API** (máx. 3 resultados + `is_limited: true`) — não apenas no frontend. Paginação `page` + `limit`. Guard `requireRole('SCOUT')`. | 1d      | S17    | ⬜     |
| **T-169** | UI de busca ScoutLink (`ScoutSearchPage`): sidebar com filtros colapsáveis, grid de `AthleteScoutCard` com badge "Verificado" — badge com texto além de cor `[UI-A11Y]`. Banner de upgrade ao atingir limite freemium. Salva busca via botão "Salvar busca" (`scout_saved_searches`).                                                                                                                          | 1d      | S17    | ⬜     |
| **T-170** | Perfil público de atleta (`/scout/athletes/:id`): dados verificados do showcase, gráfico ACWR histórico (90 dias, Recharts), galeria de vídeos, avaliações técnicas e status RTP. `clinicalNotes` e `diagnosis` **nunca** expostos `[SEC]`. Botão "Solicitar contato" abre fluxo mediado. Guard `requireRole('SCOUT')`.                                                                                        | 1d      | S17    | ⬜     |

### US-59 — Curadoria Mensal para Scouts Premium

> 🗂 **Skill:** `architecture-skills.md`
> ⚠️ **Blockers:** `[SEC-JOB]` payload do job BullMQ com `scout_id` only — PII buscada dentro do worker; `[ARCH-JOB]` idempotente (1 execução/mês por scout); falha → Sentry

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                           | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-171** | Job BullMQ `scout-curation-report`: primeiro dia do mês por scout premium. Payload: apenas `scout_id` `[SEC-JOB]`; buscar `scout_saved_searches` e PII dentro do worker. Gera PDF via `react-pdf` com até 20 perfis por relevância. Envia por Resend. Registra em `audit_log`. Idempotente `[ARCH-JOB]`. | 1d      | S18    | ⬜     |

---

## Épico 29 — ScoutLink: Comunicação Mediada e Compliance LGPD

**Como** plataforma, **precisamos** garantir que toda comunicação entre scouts e clubes seja rastreável e que atletas menores nunca sejam contactados diretamente, **para** cumprir a LGPD e manter a confiança dos clubes e responsáveis.

### US-60 — Solicitação de Contato Mediada

> 🗂 **Skill:** `security-skills.md`
> ⚠️ **Blockers:** hard stop para menor sem `consent_records.type = SCOUT_CONTACT` em `audit_log` (403 — validado em CI); `communication_log` imutável (trigger no banco); contato direto com atleta **nunca** permitido — apenas com ADMIN do clube; `[SEC-OBJ]` `assertAthleteBelongsToClub` antes de criar solicitação
> 🔗 **Coupling:** `modules/medical/` → `birth_date` para cálculo de menoridade; `audit_log` → imutável

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                                                         | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-172** | API de solicitação de contato mediada (`POST /api/scout/contact-requests`): cria `scout_contact_requests` com `scout_id`, `athlete_showcase_id`, `message` e `status = PENDING`. Hard stop: se `birth_date` indica < 18 anos e não há `consent_records.type = SCOUT_CONTACT` → 403 com mensagem descritiva. Notifica **apenas** o ADMIN do clube — nunca o atleta diretamente. Guard `requireRole('SCOUT')`. Hard stop validado em CI. | 1d      | S18    | ⬜     |
| **T-173** | Fluxo de resposta do clube: `PATCH /api/contact-requests/:id` com `status = ACCEPTED \| REJECTED`. Se aceito, libera thread em `communication_log`. Notifica scout via e-mail. `REJECTED` é definitivo. Guard `requireRole('ADMIN')`. `assertContactRequestBelongsToClub` obrigatório `[SEC-OBJ]`.                                                                                                                                     | 0.5d    | S18    | ⬜     |
| **T-174** | Log imutável de comunicação: toda mensagem em `communication_log` com `actor_id`, `actor_role`, `contact_request_id`, `message_hash` SHA-256, `timestamp`. Trigger impede UPDATE e DELETE. `GET /api/contact-requests/:id/log` para ADMIN da plataforma. Imutabilidade verificada em teste de integração.                                                                                                                              | 1d      | S18    | ⬜     |

### US-61 — Inbox Mediada e Consentimento para Menores

> 🗂 **Skill:** `security-skills.md` + `ui-ux-skills.md`
> ⚠️ **Blockers:** scout **nunca** vê e-mail/telefone direto do atleta; consentimento parental registrado com IP + timestamp + hash SHA-256; `[UI-A11Y]` badge de compliance LGPD com texto além de cor; SSE `CONTACT_REQUEST_RECEIVED` invalida `CONTACT_REQUESTS_QUERY_KEY`

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                          | Esforço | Sprint | Status |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-175** | UI de inbox mediada para scouts (`ScoutInboxPage`): lista de `contact_requests` por status (Pendente / Aceito / Rejeitado) com badge textual `[UI-A11Y]`, thread de mensagens por contato aceito e badge de compliance LGPD. Contato direto do atleta (e-mail/telefone) **nunca** exibido. Disponível em `/scout/inbox`.                                                | 1d      | S18    | ⬜     |
| **T-176** | UI de gestão de contatos para o clube (`ClubContactRequestsPage`): fila de solicitações com perfil do scout, organização, mensagem e botões Aceitar/Rejeitar. Histórico de threads com contador de não lidas. SSE `CONTACT_REQUEST_RECEIVED` invalida `CONTACT_REQUESTS_QUERY_KEY`. Botão Rejeitar exige modal de confirmação `[UI]`.                                   | 1d      | S18    | ⬜     |
| **T-177** | Consentimento parental para contato de scout: `POST /api/athletes/:id/consent/scout-contact` registra aceite em `consent_records` com `type = SCOUT_CONTACT`, IP, timestamp e hash SHA-256. UI de solicitação de consentimento no perfil do atleta menor (visível ao `ADMIN`). Sem o registro, T-172 retorna 403. `assertAthleteBelongsToClub` obrigatório `[SEC-OBJ]`. | 1d      | S19    | ⬜     |
| **T-178** | Transferência de histórico de showcase: `POST /api/athletes/:id/showcase/transfer` — requer `consent_records.type = SHOWCASE_TRANSFER`. Registra em `audit_log` com hash SHA-256 dos dados transferidos. Guard `requireRole('ADMIN')`. `assertAthleteBelongsToClub` obrigatório `[SEC-OBJ]`.                                                                            | 1d      | S19    | ⬜     |

---

## Épico 30 — ScoutLink: Monetização e Modelo Freemium

**Como** produto, **precisamos** cobrar scouts por acesso premium e oferecer visibilidade básica gratuita para clubes, **para** validar o modelo de negócio antes de escalar o módulo para novos usuários.

### US-62 — Billing de Scout e Freemium para Clubes

> 🗂 **Skill:** `architecture-skills.md` + `security-skills.md`
> ⚠️ **Blockers:** `[FIN]` `R$ 299/mês` armazenado como `29900` (integer cents) — nunca float; `[ARCH-GW]` cobrança recorrente via `GatewayRegistry.forMethod('PIX')` — nunca import direto; `[SEC-WH]` atualização de `scout_profiles.plan` via webhook confirmado — nunca via chamada síncrona; `[PR-FIN]` PR toca billing → ≥ 2 aprovações
> 🔗 **Coupling:** `modules/payments/webhooks/` → pipeline HMAC → dedup → enqueue → worker atualiza plano

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                                                          | Esforço | Sprint | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-179** | Modelo freemium no showcase: `showcase_tier` (enum `BASIC \| PREMIUM`) em `athlete_showcases`. `BASIC`: foto, posição, idade, clube, UF, status RTP. `PREMIUM`: adiciona ACWR histórico, vídeos, avaliações técnicas e curadoria mensal. Projeção condicional por tier enforced na API `[SEC]`. `BASIC` sem assinatura; `PREMIUM` requer plano `SAF` ou `SCOUT_PREMIUM`.                                                                | 0.5d    | S19    | ⬜     |
| **T-180** | Billing mensal de scout: `POST /api/scouts/subscribe` cria cobrança recorrente via `GatewayRegistry.forMethod('PIX')` `[ARCH-GW]`. Planos em integer cents: `BASIC` = `0`, `PREMIUM` = `29900` `[FIN]`. `scout_profiles.plan` atualizado via webhook de pagamento confirmado (pipeline `[SEC-WH]`) — nunca de forma síncrona. Cancela acesso `PREMIUM` após 3 cobranças falhadas (`SUSPENDED`). Falha → Sentry `[ARCH-JOB]`. `[PR-FIN]` | 1d      | S19    | ⬜     |

---

## Tarefas Técnicas Transversais (v3.0)

> ⚠️ **Blockers transversais:** `[SEC-TEN]` em toda query cross-tenant (schema `public`); `[ARCH-JOB]` para todos os workers; `[PR-FIN]` para T-183 (toca módulos financeiros); hard stop para menor validado em CI (T-182)

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                               | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-181** | Rotas SSE v3.0: adicionar `SHOWCASE_UPDATED`, `CONTACT_REQUEST_RECEIVED` e `CONTACT_REQUEST_RESOLVED` ao `sse-bus.ts`. Invalidar `SHOWCASE_QUERY_KEY` e `CONTACT_REQUESTS_QUERY_KEY` no `queryClient`. Scaling note: substituir por `redis.publish/subscribe` ao ultrapassar 2 processos.                                                                    | 0.5d    | S16    | ⬜     |
| **T-182** | Matriz RBAC v3.0: documentar e cobrir em testes unitários os guards do ScoutLink. `SCOUT`: busca, perfil público e inbox própria. `ADMIN` do clube: gestão de showcases e respostas a solicitações. `PHYSIO \| COACH \| TREASURER`: sem acesso ao ScoutLink. Hard stop para menor (< 18 anos sem consentimento) validado em CI com teste de integração.      | 0.5d    | S19    | ⬜     |
| **T-183** | Testes E2E ScoutLink: showcase publicado → busca filtrada → solicitação de contato → hard stop para menor sem consentimento → aceite do clube → thread de mensagens → log imutável verificado. Cobertura mínima 80% em `scout`, `contact-requests` e `communication_log`. `[PR-FIN]`                                                                         | 1d      | S19    | ⬜     |
| **T-184** | Checklist de deploy ScoutLink: validar `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_KEY` e `FFPROBE_PATH` no schema Zod de `lib/env.ts`. `validateEnv()` MUST ser a primeira chamada no bootstrap. Adicionar ao `.env.example`. Testes manuais de upload de vídeo (90s, 500MB) e busca freemium antes de habilitar em produção. | 0.5d    | S19    | ⬜     |
