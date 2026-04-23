# Backlog — ClubOS (v2.5 A Arquibancada · v3.0 A Vitrine)

> **Formato:** User Story + Tarefas técnicas granulares.
> Cada tarefa deve caber em **1 dia de trabalho de 1 desenvolvedor**.
> **Legenda de status:** ✅ Implementado · ⬜ Pendente · ⚠️ Parcial

---

## Resumo por Sprint (Ativas e Planejadas)

| Sprint                    | Foco Principal                                              | Tarefas       | Esforço   | Status       | Critérios de "Pronto" (Done)                                                                                             |
| ------------------------- | ----------------------------------------------------------- | ------------- | --------- | ------------ | ------------------------------------------------------------------------------------------------------------------------ |
| **Sprint 12 (Sem 21–22)** | v2.5 — ArenaPass: Infraestrutura, Eventos e Venda PIX       | T-136 a T-143 | ~7d dev   | ⬜ Pendente  | Schema provisionado; evento criado com setores; torcedor compra ingresso via PIX e recebe QR Code por WhatsApp/e-mail.   |
| **Sprint 13 (Sem 23–24)** | v2.5 — ArenaPass: Portaria Offline, Bilheteria e CRM        | T-144 a T-149 | ~6d dev   | ⬜ Pendente  | Portaria valida ingresso em < 1s offline; relatório de bilheteria exportável; funil torcedor→sócio disparado pós-jogo.   |
| **Sprint 14 (Sem 25–26)** | v2.5 — ArenaPass: Operações de Jogo e PDV mPOS              | T-150 a T-157 | ~6d dev   | ⬜ Pendente  | Checklist de jogo operacional; PDV mPOS registrando vendas; notificação de logística enviada 48h antes do evento.        |
| **Sprint 15 (Sem 27–28)** | v2.5 — ArenaPass: Patrocínio, Testes E2E e Hardening        | T-158 a T-162 | ~5d dev   | ⬜ Pendente  | Patrocínio visível na confirmação; cobertura ≥ 80% nos módulos financeiros do ArenaPass; zero duplicidade de check-in.   |
| **Sprint 16 (Sem 29–30)** | v3.0 — ScoutLink: Infraestrutura, Auth Scout e Showcase API | T-163 a T-170 | ~7d dev   | ⬜ Pendente  | Role SCOUT ativo; showcase publicado com assinatura do clube; upload de vídeos funcional; DDL provisionado.              |
| **Sprint 17 (Sem 31–32)** | v3.0 — ScoutLink: UI de Showcase e Busca de Atletas         | T-171 a T-176 | ~6d dev   | ⬜ Pendente  | Scout realiza busca filtrada; perfil público de atleta navegável; métricas longitudinais exibidas com freemium aplicado. |
| **Sprint 18 (Sem 33–34)** | v3.0 — ScoutLink: Comunicação Mediada e Compliance LGPD     | T-177 a T-183 | ~6.5d dev | ⬜ Pendente  | Solicitação de contato bloqueada para menor sem aceite parental; log imutável ativo; inbox mediada funcional.            |
| **Sprint 19 (Sem 35–36)** | v3.0 — ScoutLink: Curadoria, Monetização e Testes E2E       | T-184 a T-190 | ~6d dev   | ⬜ Pendente  | Job de curadoria mensal disparado; billing de scout via PIX recorrente; cobertura ≥ 80%; hard stops validados em CI.     |


# v2.5 — "A Arquibancada" (ArenaPass)

> **Período:** Semanas 21–28 · **Sprints:** 12–15
> **Hipótese principal:** clube aumenta receita por jogo em ≥ 40% vs. caixinha manual; primeiro torcedor convertido em sócio via funil ArenaPass → ClubOS.

---

## Épico 24 — ArenaPass: Configuração de Eventos e Venda de Ingressos

**Como** administrador do clube, **quero** criar eventos com setores e preços configuráveis e vender ingressos via PIX com entrega automática de QR Code, **para** substituir a caixinha manual por um fluxo digital rastreável e sem CAPEX de maquinário.

### US-45 — Infraestrutura e Configuração de Eventos

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                  | Esforço | Sprint | Status |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-136** | Schema Prisma + DDL tenant para tabelas `events`, `event_sectors`, `tickets`, `fan_profiles`, `pos_sales` e `game_checklists`. Índices em `event_date` e `status`. Trigger de `tickets` impede `INSERT` quando `event_sector.capacity` é excedida. DDL idempotente via `provisionTenantSchema`. | 1d      | S12    | ⬜     |
| **T-137** | CRUD de eventos (`/api/events`): criação com campos `opponent`, `event_date`, `venue`, `description`; aninhamento de setores (`event_sectors`) com `name`, `capacity` e `price_cents`. Validação Zod; guard `requireRole('ADMIN')`. Soft-delete via `status = CANCELLED`.                       | 1d      | S12    | ⬜     |
| **T-138** | UI de configuração de evento (`EventFormModal` + `EventSectorsTable`): formulário com campos de adversário, data, local e tabela de setores editável inline (adicionar/remover linha). `EventsPage` em `/access` com listagem e status badge por evento. Visível apenas a `ADMIN`.              | 1d      | S12    | ⬜     |

### US-46 — Venda de Ingressos via PIX e Entrega por WhatsApp/E-mail

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                | Esforço | Sprint | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-139** | Geração de cobrança PIX por ingresso: endpoint `POST /api/events/:id/tickets/purchase` que cria `Ticket` (status `PENDING`) e cobrança via `GatewayRegistry.forMethod('PIX')`. Idempotência por `fan_email + event_id + sector_id`. Rejeita se `event_sector.sold >= event_sector.capacity`.                                                  | 1d      | S12    | ⬜     |
| **T-140** | Worker BullMQ de confirmação de ingresso (`confirm-ticket`): consumido no webhook de pagamento confirmado. Atualiza `Ticket.status = PAID`, gera QR Code HMAC-SHA256 (`ticket_id + event_id + secret`) e envia ao torcedor via WhatsApp (Z-API) com fallback e-mail (Resend). Rate limiting Redis: 30 msg/min por clube.                      | 1d      | S12    | ⬜     |
| **T-141** | Página pública de compra de ingresso (`/eventos/:clubSlug/:eventId`): route group `(marketing)`, sem auth. Exibe nome do evento, adversário, data, setores disponíveis com preço e vagas restantes. Formulário com `nome`, `email`, `telefone`, setor e integração PIX inline. Atualiza disponibilidade em tempo real via polling a cada 10s. | 1d      | S12    | ⬜     |
| **T-142** | Cancelamento de ingresso: endpoint `DELETE /api/tickets/:id` que reverte cobrança no gateway (`gateway.cancelCharge`), marca `Ticket.status = CANCELLED` e registra em `audit_log`. Proibido cancelar ingresso com `checkedIn = true`. Reembolso somente até 24h antes do evento.                                                             | 0.5d    | S12    | ⬜     |

---

## Épico 25 — ArenaPass: Portaria Offline, Bilheteria e CRM de Torcedor

**Como** staff operacional, **quero** validar ingressos offline na portaria e acompanhar métricas de bilheteria em tempo real, **para** operar eventos sem depender de conexão de dados e converter torcedores em sócios no pós-jogo.

### US-47 — Validação de Ingresso na Portaria (Offline-First)

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                   | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-143** | Backend de validação de ingresso de evento: endpoint `POST /api/events/:id/tickets/validate` recebe payload do QR Code, verifica assinatura HMAC-SHA256 (`ticket_id + event_id + secret`), rejeita duplicatas via Redis `SET NX` (TTL 24h), marca `Ticket.checked_in = true` e registra em `field_access_logs` com `actor_id`, `timestamp` e `ip`. Retorna 409 em dupla entrada. | 1d      | S13    | ⬜     |
| **T-144** | UI de portaria mobile-first para eventos (`TicketScannerPage`): câmera escaneia QR Code, exibe resultado (verde/vermelho + nome do torcedor + setor) em < 1s. Funciona offline: fila local Dexie.js com Background Sync e deduplicação por `ticket_id`. Contador de check-ins por setor em tempo real.                                                                           | 1d      | S13    | ⬜     |

### US-48 — Relatório de Bilheteria e CRM de Torcedor

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                         | Esforço | Sprint | Status |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-145** | Relatório de bilheteria pós-jogo: endpoint `GET /api/events/:id/report` com receita total por setor (`price_cents × sold`), taxa de ocupação (%), check-ins realizados e no-shows. Exportação em PDF via `react-pdf` com logo do clube e assinatura SHA-256 no `audit_log`. Guard `requireRole('ADMIN', 'TREASURER')`. | 1d      | S13    | ⬜     |
| **T-146** | CRM de torcedor: tabela `fan_profiles` com campos `name`, `email`, `phone`, `total_spent_cents` e array de `event_ids` frequentados. Endpoint `GET /api/fans` com busca por e-mail/telefone, paginação e ordenação por gasto acumulado. UI `FanProfilesPage` com filtros e exportação CSV.                             | 1d      | S13    | ⬜     |
| **T-147** | Funil torcedor → sócio: job BullMQ `fan-to-member-funnel` enfileirado após check-in confirmado. Envia oferta de adesão ao clube com desconto configurável via WhatsApp/e-mail. Idempotência: 1 mensagem por `fan_id + event_id`. Guarda registro em `messages` para auditoria.                                         | 1d      | S13    | ⬜     |

### US-49 — Patrocínio Programático

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                  | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-148** | Campos de patrocínio em eventos: adicionar `sponsor_name`, `sponsor_logo_url` e `sponsor_cta_url` ao schema de `events`. Logo do patrocinador exibido no e-mail/WhatsApp de confirmação de ingresso (`confirm-ticket` worker) e na página pública do evento. Validação de URL e dimensões mínimas de logo (200×60px via Sharp). | 0.5d    | S13    | ⬜     |

---

## Épico 26 — ArenaPass: Operações de Jogo e PDV Mobile (mPOS)

**Como** administrador do clube, **quero** gerenciar o checklist operacional de cada jogo e registrar vendas de produtos no evento via PDV mobile, **para** centralizar toda a receita do evento em um único sistema sem hardware externo obrigatório.

### US-50 — Checklist e Logística de Jogo

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                       | Esforço | Sprint | Status |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-149** | Job BullMQ `game-logistics-notice`: enfileirado 48h antes do evento (`event_date - 48h`), envia convocação ao capitão via WhatsApp com escalação, horário, local e link para checklist. Configurável por clube (ativo/inativo). Idempotência por `event_id`.                                         | 0.5d    | S14    | ⬜     |
| **T-150** | CRUD de checklist de operações de jogo (`/api/events/:id/checklist`): itens pré-populados por categoria (credenciamento, equipamentos, transporte, arbitragem) com campo `completed` e `completed_by`. Endpoint `PATCH /api/events/:id/checklist/:itemId` para toggle. Guard `requireRole('ADMIN')`. | 0.5d    | S14    | ⬜     |
| **T-151** | UI de checklist de jogo (`GameOpsChecklist`): lista por categoria com toggle de conclusão, indicador de progresso total (ex.: 7/10 itens concluídos) e data/hora de cada conclusão. Visível ao `ADMIN`. Funciona offline com Dexie.js.                                                               | 1d      | S14    | ⬜     |

### US-51 — PDV Mobile (mPOS)

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                     | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-152** | Catálogo de produtos do PDV: CRUD `/api/clubs/:id/pos-products` com `name`, `price_cents`, `category` e `stock`. Guard `requireRole('ADMIN')`. UI `PosProductsPage` com listagem e formulário de cadastro rápido.                                                                                                                                  | 0.5d    | S14    | ⬜     |
| **T-153** | Integração mPOS Stone/SumUp: endpoint `POST /api/events/:id/pos/charge` que gera cobrança no terminal mPOS via SDK (Stone ou SumUp, configurável por env var `POS_PROVIDER`). Registra venda em `pos_sales` com `product_id`, `amount_cents`, `quantity` e `operator_id`. Fallback para PIX manual via `GatewayRegistry` se terminal indisponível. | 1d      | S14    | ⬜     |
| **T-154** | UI de PDV mobile (`PosTerminalPage`): tela de caixa mobile-first com grid de produtos configurável, botão de cobrança rápida, histórico de vendas do evento em tempo real e total de receita acumulada. Visível a `ADMIN \| TREASURER`. Funciona offline: fila local Dexie.js com sincronização ao recuperar conexão.                              | 1d      | S14    | ⬜     |

---

## Tarefas Técnicas Transversais (v2.5)

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                | Esforço | Sprint | Status |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-155** | Provisionamento DDL tenant v2.5: atualizar `provisionTenantSchema` com tabelas `events`, `event_sectors`, `tickets`, `fan_profiles`, `pos_sales`, `game_checklists`. DDL idempotente; clubes existentes recebem as tabelas automaticamente na próxima execução.               | 0.5d    | S12    | ⬜     |
| **T-156** | Rotas SSE v2.5: adicionar eventos `TICKET_SOLD`, `CHECKIN_CONFIRMED` e `EVENT_CAPACITY_UPDATED` ao barramento `sse-bus.ts`. Invalidar queries `EVENT_QUERY_KEY` e `TICKETS_QUERY_KEY` no `queryClient` do frontend.                                                           | 0.5d    | S12    | ⬜     |
| **T-157** | Testes E2E para fluxo ArenaPass: criação de evento → venda PIX → QR Code gerado → check-in na portaria → relatório de bilheteria. Cobertura mínima de 80% nos módulos `events`, `tickets` e `pos_sales`. Verificar idempotência de check-in duplicado (deve retornar 409).    | 1d      | S15    | ⬜     |
| **T-158** | Rate limiting específico do PDV e tickets: adicionar chave de rate limit `pos:{clubId}` (200 req/min) e `ticket-purchase:{eventId}` (50 req/min) ao `@fastify/rate-limit` via Redis. Previne sobrecarga em abertura de vendas de eventos populares.                           | 0.5d    | S15    | ⬜     |
| **T-159** | Matriz RBAC v2.5: documentar e cobrir em testes unitários os guards dos novos endpoints. `TREASURER` acessa relatório de bilheteria (leitura). `ADMIN` tem CRUD completo. `COACH` não acessa módulo de eventos. Cada linha da matriz coberta por teste unitário no CI.        | 0.5d    | S15    | ⬜     |
| **T-160** | Checklist de deploy ArenaPass: validar `POS_PROVIDER`, `STONE_API_KEY` / `SUMUP_API_KEY` no schema Zod de `lib/env.ts`. Adicionar ao `.env.example`. Testes manuais de PDV com lote de 3 vendas antes de ativar em produção. Adicionado ao checklist de deploy em `infra.md`. | 0.5d    | S15    | ⬜     |

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

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                     | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-161** | Schema Prisma no schema `public` para tabelas cross-tenant do ScoutLink: `scout_profiles`, `athlete_showcases`, `athlete_videos`, `scout_saved_searches`, `scout_contact_requests` e `communication_log`. `communication_log` é imutável (sem UPDATE/DELETE via trigger). DDL idempotente, executado separadamente do `provisionTenantSchema`.                     | 1d      | S16    | ⬜     |
| **T-162** | Autenticação e onboarding de scout: novo role `SCOUT` no JWT. Endpoint `POST /api/scouts/register` com campos `name`, `email`, `organization` e `credentials` (texto livre). Verificação manual do cadastro por `ADMIN` da plataforma antes de ativar a conta. Guard `requireRole('SCOUT')` nas rotas de busca. `GET /api/scouts/me` retorna perfil e plano ativo. | 1d      | S16    | ⬜     |
| **T-163** | Guard de pré-requisito de dados: ao publicar showcase de um atleta, verificar se ele possui ≥ 90 dias de registros em `workload_metrics` e ≥ 1 entrada em `medical_records` (ou `return_to_play`). Se não atender, retornar erro descritivo: `"Atleta sem dados longitudinais suficientes para publicação verificada."`                                            | 0.5d    | S16    | ⬜     |

### US-56 — Showcase de Atleta

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                                                                         | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-164** | API de showcase de atleta (`POST /api/athletes/:id/showcase`): agrega métricas do BaseForte (ACWR médio dos últimos 90 dias, total de sessões, última avaliação técnica) e status RTP do FisioBase (apenas o enum `status`, nunca `clinicalNotes`). Gera `signature_hash` SHA-256 (`athlete_id + club_id + metrics_snapshot + timestamp`) como prova de autenticidade assinada pelo clube. Salva em `athlete_showcases`. Guard `requireRole('ADMIN')`. | 1d      | S16    | ⬜     |
| **T-165** | UI de gestão de showcase (`ShowcaseManagerPage`): tabela de atletas com toggle de visibilidade (`PRIVATE \| SCOUTS_ONLY \| PUBLIC`), indicador de completude de dados (métricas + vídeos + RTP), botão "Publicar" com confirmação que exibe o `signature_hash` para o admin. Atualizações em tempo real via SSE (`SHOWCASE_UPDATED`).                                                                                                                  | 1d      | S16    | ⬜     |

### US-57 — Upload e Gestão de Vídeos

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                   | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-166** | Backend de upload de vídeos de atleta (`POST /api/athletes/:id/videos`): validação de tipo por magic bytes (`video/mp4`, `video/quicktime`), limite de 90s de duração (via FFprobe) e 500MB por arquivo. Geração de thumbnail via Sharp/FFmpeg. Armazenamento no Cloudflare R2. Máx. 5 vídeos por atleta; rejeita com `ValidationError` acima do limite. Guard `requireRole('ADMIN', 'PHYSIO')`. | 1d      | S17    | ⬜     |
| **T-167** | UI de upload de vídeos (`AthleteVideoManager`): lista de vídeos com player embutido, progress bar durante upload, reordenação por drag-and-drop (define ordem de exibição no showcase) e botão de remoção com confirmação. Exibe duração e thumbnail após processamento. Visível a `ADMIN \| PHYSIO`.                                                                                            | 1d      | S17    | ⬜     |

---

## Épico 28 — ScoutLink: Busca de Atletas e Perfil Público

**Como** scout, **quero** buscar atletas verificados por filtros técnicos e visualizar seus perfis com dados longitudinais, **para** tomar decisões de contato baseadas em evidência sem depender de intermediários ou vídeos editados não verificados.

### US-58 — Busca Filtrada e Perfil Público

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Esforço | Sprint | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-168** | API de busca de atletas para scouts (`GET /api/scout/athletes/search`): filtros por `position`, `age_min`/`age_max`, `state` (UF), `rtp_status`, `min_acwr_avg`, `min_sessions`, `min_technical_score`. Retorna apenas atletas com `showcase.visibility` em `SCOUTS_ONLY` ou `PUBLIC`. Freemium: scout sem assinatura retorna máx. 3 resultados por busca (campo `is_limited: true` na resposta). Paginação com `page` e `limit`. Guard `requireRole('SCOUT')`. | 1d      | S17    | ⬜     |
| **T-169** | UI de busca ScoutLink (`ScoutSearchPage`): sidebar com filtros colapsáveis, grid de cards de atleta (`AthleteScoutCard`) com foto, posição, clube, UF, ACWR médio e badge "Verificado". Banner de upgrade para scouts no plano gratuito ao atingir limite de resultados. Salva busca atual como `scout_saved_searches` via botão "Salvar busca".                                                                                                                | 1d      | S17    | ⬜     |
| **T-170** | Perfil público de atleta para scouts (`/scout/athletes/:id`): página com dados verificados do showcase, gráfico de histórico ACWR (últimos 90 dias, Recharts), galeria de vídeos, avaliações técnicas por microciclo e status RTP. Dados clínicos (`clinicalNotes`, `diagnosis`) nunca expostos. Botão "Solicitar contato" abre fluxo mediado. Guard `requireRole('SCOUT')`.                                                                                    | 1d      | S17    | ⬜     |

### US-59 — Curadoria Mensal para Scouts Premium

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                 | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-171** | Job de curadoria mensal BullMQ (`scout-curation-report`): executado no primeiro dia do mês para cada scout com plano premium. Carrega `scout_saved_searches` do scout, executa as buscas, gera PDF via `react-pdf` com até 20 perfis ordenados por relevância e envia por e-mail via Resend. Registra execução em `audit_log`. | 1d      | S18    | ⬜     |

---

## Épico 29 — ScoutLink: Comunicação Mediada e Compliance LGPD

**Como** plataforma, **precisamos** garantir que toda comunicação entre scouts e clubes seja rastreável e que atletas menores nunca sejam contactados diretamente, **para** cumprir a LGPD e manter a confiança dos clubes e responsáveis.

### US-60 — Solicitação de Contato Mediada

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-172** | API de solicitação de contato mediada (`POST /api/scout/contact-requests`): cria `scout_contact_requests` com `scout_id`, `athlete_showcase_id`, `message` e `status = PENDING`. Hard stop: se atleta tiver `birth_date` que indique idade < 18 e não houver `consent_records.type = SCOUT_CONTACT` em `audit_log`, retorna `403` com mensagem descritiva. Notifica o clube (ADMIN) via WhatsApp/e-mail — nunca o atleta diretamente. Guard `requireRole('SCOUT')`. | 1d      | S18    | ⬜     |
| **T-173** | Fluxo de resposta do clube à solicitação: endpoint `PATCH /api/contact-requests/:id` com `status = ACCEPTED \| REJECTED`. Se aceito, libera thread de mensagens no `communication_log`. Notifica o scout via e-mail com resultado. `REJECTED` é definitivo — sem possibilidade de reabrir a mesma solicitação (cria nova). Guard `requireRole('ADMIN')`.                                                                                                            | 0.5d    | S18    | ⬜     |
| **T-174** | Log imutável de comunicação: toda mensagem enviada entre scout e clube registrada em `communication_log` com `actor_id`, `actor_role`, `contact_request_id`, `message_hash` SHA-256, `timestamp`. Trigger no banco impede `UPDATE` e `DELETE` na tabela. Endpoint `GET /api/contact-requests/:id/log` para ADMIN da plataforma.                                                                                                                                     | 1d      | S18    | ⬜     |

### US-61 — Inbox Mediada e Consentimento para Menores

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                             | Esforço | Sprint | Status |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-175** | UI de inbox mediada para scouts (`ScoutInboxPage`): lista de `contact_requests` por status (Pendente / Aceito / Rejeitado), thread de mensagens por contato aceito e badge de compliance LGPD em cada thread. Scout nunca vê contato direto do atleta (e-mail/telefone). Disponível em `/scout/inbox`.                                                     | 1d      | S18    | ⬜     |
| **T-176** | UI de gestão de contatos para o clube (`ClubContactRequestsPage`): fila de solicitações recebidas com perfil do scout, organização, mensagem e botões Aceitar/Rejeitar. Histórico de threads abertas com contador de mensagens não lidas. Atualização em tempo real via SSE (`CONTACT_REQUEST_RECEIVED`).                                                  | 1d      | S18    | ⬜     |
| **T-177** | Consentimento parental para contato de scout: endpoint `POST /api/athletes/:id/consent/scout-contact` que registra aceite do responsável em `consent_records` com `type = SCOUT_CONTACT`, IP, timestamp e hash SHA-256. UI de solicitação de consentimento no perfil do atleta menor (visível ao `ADMIN`). Sem o registro, `T-172` retorna 403.            | 1d      | S19    | ⬜     |
| **T-178** | Transferência de histórico de showcase entre clubes: endpoint `POST /api/athletes/:id/showcase/transfer` que transfere `athlete_showcases` e `athlete_videos` para o clube de destino. Requer `consent_records.type = SHOWCASE_TRANSFER` assinado. Registra operação em `audit_log` com hash SHA-256 dos dados transferidos. Guard `requireRole('ADMIN')`. | 1d      | S19    | ⬜     |

---

## Épico 30 — ScoutLink: Monetização e Modelo Freemium

**Como** produto, **precisamos** cobrar scouts por acesso premium e oferecer visibilidade básica gratuita para clubes, **para** validar o modelo de negócio antes de escalar o módulo para novos usuários.

### US-62 — Billing de Scout e Freemium para Clubes

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                                                                                                     | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-179** | Modelo freemium no showcase: campo `showcase_tier` (enum `BASIC \| PREMIUM`) em `athlete_showcases`. `BASIC`: foto, posição, idade, clube, UF e status RTP. `PREMIUM`: adiciona ACWR histórico, vídeos, avaliações técnicas e curadoria mensal. Guard na API de busca (`T-168`) aplica projeção condicional por tier. `BASIC` disponível sem assinatura do clube. `PREMIUM` requer plano `SAF` ou `SCOUT_PREMIUM`. | 0.5d    | S19    | ⬜     |
| **T-180** | Billing mensal de scout via PIX recorrente: endpoint `POST /api/scouts/subscribe` que cria cobrança recorrente via `GatewayRegistry.forMethod('PIX')`. Planos: `BASIC` (busca limitada, R$ 0) e `PREMIUM` (busca ilimitada + curadoria, R$ 299/mês). `scout_profiles.plan` atualizado via webhook de pagamento confirmado. Cancela acesso `PREMIUM` após 3 cobranças falhadas consecutivas (status `SUSPENDED`).   | 1d      | S19    | ⬜     |

---

## Tarefas Técnicas Transversais (v3.0)

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                                                                                | Esforço | Sprint | Status |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-181** | Rotas SSE v3.0: adicionar eventos `SHOWCASE_UPDATED`, `CONTACT_REQUEST_RECEIVED` e `CONTACT_REQUEST_RESOLVED` ao barramento `sse-bus.ts`. Invalidar queries `SHOWCASE_QUERY_KEY` e `CONTACT_REQUESTS_QUERY_KEY` no `queryClient`. Scaling note: substituir por `redis.publish/subscribe` ao ultrapassar 2 processos.          | 0.5d    | S16    | ⬜     |
| **T-182** | Matriz RBAC v3.0: documentar e cobrir em testes unitários os guards dos endpoints do ScoutLink. `SCOUT` acessa apenas busca, perfil público e inbox própria. `ADMIN` do clube gerencia showcases e responde solicitações. `PHYSIO \| COACH \| TREASURER` sem acesso ao módulo ScoutLink. Hard stop para menor validado em CI. | 0.5d    | S19    | ⬜     |
| **T-183** | Testes E2E para fluxo ScoutLink: showcase publicado → busca com filtros → solicitação de contato → hard stop para menor sem consentimento → aceite do clube → thread de mensagens → log imutável verificado. Cobertura mínima de 80% nos endpoints de `scout`, `contact-requests` e `communication_log`.                      | 1d      | S19    | ⬜     |
| **T-184** | Checklist de deploy ScoutLink: validar `CLOUDFLARE_R2_BUCKET`, `CLOUDFLARE_R2_ACCESS_KEY`, `CLOUDFLARE_R2_SECRET_KEY` e `FFPROBE_PATH` no schema Zod de `lib/env.ts`. Adicionar ao `.env.example`. Testes manuais de upload de vídeo (90s, 500MB) e de busca com plano freemium antes de habilitar em produção.               | 0.5d    | S19    | ⬜     |
