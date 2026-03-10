# Escopo MoSCoW — ClubOS v1.0

> **Janela do MVP:** 30 dias de desenvolvimento.
> **Critério de corte:** tudo que não for necessário para validar a hipótese principal fica para depois.
>
> **Hipótese principal:** o ClubOS reduz inadimplência em ≥ 25% em 60 dias após ativação.

---

## Status de Implementação

> Legenda: ✅ Implementado · ⚠️ Parcial · ⬜ Pendente

A tabela abaixo traz o status separado por camada: **API** (`apps/api`) e **Web** (`apps/web`).

---

## MUST HAVE — Obrigatório no MVP

Sem estas features, o produto não pode ser vendido nem validar sua proposta de valor central.

| #   | Feature                                                            | Critério de Aceite                                                                          | Complexidade    | API | Web |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------- | --- | --- |
| M1  | Cadastro de clube (onboarding) com configuração de planos de sócio | Clube configura nome, logo, plano e valor em < 5 min                                        | Média — 3 dias  | ✅  | ✅  |
| M2  | Importação / cadastro manual de sócios (CSV ou formulário)         | 200 sócios importados sem erro em < 10 min                                                  | Média — 2 dias  | ✅  | ⚠️  |
| M3  | Geração de cobranças Pix com QR Code por sócio                     | Pix gerado e enviado em < 30s por sócio                                                     | Alta — 4 dias   | ✅  | ⬜  |
| M4  | Webhook de confirmação de pagamento Pix (Asaas)                    | Status do sócio atualiza em < 10s após pagamento                                            | Alta — 3 dias   | ✅  | ✅  |
| M5  | Dashboard de inadimplência em tempo real                           | Exibe total de adimplentes, inadimplentes e valor a receber                                 | Média — 2 dias  | ✅  | ✅  |
| M6  | Régua de cobrança via WhatsApp: D-3, D-0, D+3                      | Mensagem enviada automaticamente nos 3 marcos                                               | Alta — 4 dias   | ⚠️  | ⚠️  |
| M7  | Autenticação segura (email/senha + refresh token)                  | Login funciona; sessão expira em 7 dias; 2FA opcional                                       | Baixa — 1 dia   | ✅  | ✅  |
| M8  | Controle de acesso por papel: Admin do clube / Tesoureiro          | Tesoureiro não consegue apagar sócio; Admin sim                                             | Baixa — 1 dia   | ✅  | ✅  |
| M9  | Stub de cadastro de atletas (entidade base para módulos futuros)   | CRUD `/api/athletes` funcional com campos de identidade; atleta vinculado ao clube no banco | Baixa — 1.5 dia | ⬜  | ⬜  |

> **Por que M9 é MUST HAVE e não SHOULD HAVE?** A entidade `athlete` é a espinha dorsal de TreinoOS, BaseForte, FisioBase, ScoutLink e CampeonatOS. Criar esse schema em v1.0 — sem lógica de treino ou saúde — custa ~1.5d e evita uma migração dolorosa de dados ao iniciar a v1.5. Tudo que está fora do escopo do stub (carga ACWR, protocolos, avaliação técnica) permanece nas versões correspondentes.

**Total estimado MUST:** ~21.5 dias de desenvolvimento

### Notas de implementação por item

**M1 — Onboarding** API ✅ · Web ✅
- **API:** `POST /api/clubs` cria o clube, provisiona o schema PostgreSQL do tenant (`clube_{id}`) com DDL idempotente (enums, tabelas, índices, FKs) via `provisionTenantSchema`, e dispara e-mail de boas-vindas via Resend (fire-and-forget). Upload de logo disponível em `POST /api/clubs/:clubId/logo` (resize 200×200px WebP via sharp).
- **Web:** `OnboardingWizard` com 3 etapas: `StepClubData` (nome, slug, CNPJ), `StepLogo` (upload com preview), `StepConfirmation`. Integrado com `POST /api/clubs`. Acessível em `/onboarding`.

**M2 — Cadastro de sócios** API ✅ · Web ⚠️
- **API:** Cadastro individual via `POST /api/members` (validação Zod, dedup de CPF via scan pgcrypto, criptografia AES-256 de CPF/telefone). Importação em lote via `POST /api/members/import` (CSV com PapaParse, até 5.000 linhas, batches de 500, upsert por CPF, vínculo de plano, erros por linha reportados). Template de CSV disponível em `GET /api/members/import/template`. Atualização de sócio em `PUT /api/members/:memberId` (imutabilidade de CPF garantida). Listagem paginada com busca full-text (nome ou CPF descriptografado in-DB) em `GET /api/members`.
- **Web:** Formulário manual (`MemberFormModal`) implementado. **Pendente:** fluxo de upload CSV não está exposto no frontend.

**M3 — Cobranças Pix** API ✅ · Web ⬜
- **API:** `POST /api/charges/generate` (trigger manual) e job BullMQ agendado via cron `0 8 1 * *` (1º de cada mês às 08h UTC). O serviço `generateMonthlyCharges` itera os membros com `MemberPlan` ativo, cria cada `Charge` em transação isolada (idempotente por período via `hasExistingCharge`), e despacha ao gateway Asaas via `dispatchChargeToGateway`. O `GatewayRegistry` abstrai o provider: chamar `GatewayRegistry.forMethod('PIX')` retorna `AsaasGateway`, que cria o PIX e devolve `qrCodeBase64` e `pixCopyPaste` salvos em `gatewayMeta` (JSONB). Falhas de gateway são isoladas em `gatewayErrors[]`; o job tem backoff 1h → 6h → 24h com até 3 tentativas; exaustão transiciona cobranças para `PENDING_RETRY`.
- **Web:** Sidebar mostra "Em breve" para a tela de cobranças.

**M4 — Webhook de pagamento** API ✅ · Web ✅
- **API:** `POST /webhooks/:gateway` valida HMAC (header `asaas-access-token` via `timingSafeEqual`), normaliza o evento via `parseWebhook`, responde 200 imediatamente e enfileira no BullMQ (`webhook-events` queue). O worker (`startWebhookWorker`) resolve o tenant por `externalReference` (chargeId), verifica idempotência em `payments.gatewayTxid`, cria o `Payment`, marca `Charge` como PAID, atualiza `Member.status → ACTIVE` se estava OVERDUE, escreve `AuditLog` e emite evento SSE via `sseBus`.
- **Web:** `useRealTimeEvents` consome `GET /api/events` (SSE) e invalida o cache React Query automaticamente ao receber `PAYMENT_CONFIRMED`.

**M5 — Dashboard** API ✅ · Web ✅
- **API:** `GET /api/dashboard/summary` (contadores de sócios por status, cobranças PENDING/OVERDUE, pagamentos do mês). `GET /api/dashboard/charges-history` (histórico por mês, últimos N meses, raw SQL `TO_CHAR + GROUP BY`). `GET /api/dashboard/overdue-members` (paginado, raw SQL `DISTINCT ON` para sócio OVERDUE com cobrança mais antiga, inclui `daysPastDue`).
- **Web:** `DashboardClient` com `DashboardKpis`, `DelinquencyChart` (Recharts), `OverdueMembersTable`. Atualização via SSE.

**M6 — Régua de cobrança WhatsApp** API ⚠️ · Web ⚠️
- **API:** Dois jobs automáticos + on-demand implementados; job D-0 (vencimento hoje) ainda pendente:
  - **D-3:** cron `0 9 * * *` → dispatch worker → `send-club-reminders` por clube → `sendDailyRemindersForClub` (cobranças PENDING com `dueDate` em D+3).
  - **D+3 (overdue):** cron `0 10 * * *` → dispatch worker → `send-club-overdue-notices` por clube → `sendOverdueNoticesForClub` (cobranças PENDING/OVERDUE com `dueDate` em D-3).
  - **On-demand:** `POST /api/members/:memberId/remind` (cobrança OVERDUE mais antiga do sócio, cooldown de 4h).
  - Todos os envios passam por `checkAndConsumeWhatsAppRateLimit` (Lua atômica no Redis, 30 msg/min por clube), `hasRecentMessage` (janela 20h de idempotência), e `sendWhatsAppMessage` (descriptografa phone, normaliza para E.164, chama `WhatsAppRegistry.get()` — suporta Z-API e Evolution API). Fallback automático para e-mail via Resend quando WhatsApp falha pela 2ª vez em 48h.
  - Templates customizáveis por clube via `PUT /api/templates/:key` (WHATSAPP ou EMAIL). Fallback para `DEFAULT_TEMPLATES` quando não há customização. Placeholders: `{nome}`, `{valor}`, `{pix_link}`, `{vencimento}`.
  - **D-0 (vencimento hoje):** job automático ainda não implementado — apenas on-demand cobre este caso indiretamente.
- **Web:** Envio on-demand implementado via `useRemindMember`. Jobs automáticos são responsabilidade exclusiva do backend.

**M7 — Autenticação** API ✅ · Web ✅
- **API:** `POST /api/auth/login` (bcrypt compare, constant-time para e-mails inexistentes, access token JWT HS256 15min + refresh token 7d em httpOnly cookie). `POST /api/auth/refresh` (valida e consome refresh token do Redis — single-use — emite novo par). `POST /api/auth/logout` (revoga refresh token no Redis, limpa cookie). `GET /api/auth/me`. Decorator `verifyAccessToken` e `verifyRefreshToken` no Fastify. Refresh JWT implementado com `node:crypto` nativo (sem plugin duplicado).
- **Web:** `AuthProvider` com bootstrap transparente, deduplicação de refresh concorrente.

**M8 — Controle de acesso** API ✅ · Web ✅
- **API:** Decorator `requireRole('ADMIN' | 'TREASURER')` com hierarquia `ADMIN > TREASURER`. Aplicado individualmente nas rotas: `POST /api/plans`, `PUT /api/plans/:id`, `DELETE /api/plans/:id`, `PUT /api/members/:id`, `POST /api/clubs/:id/logo`, `PUT /api/templates/:key`, `DELETE /api/templates/:key`.
- **Web:** `isAdmin` verificado em `MembersPage` e `PlansPage`.

**M9 — Stub de atletas** API ⬜ · Web ⬜
- Nenhum módulo `athletes` existe em `apps/api/src/modules/`. Nenhuma rota, schema Prisma, nem entrada de navegação no frontend. **Próximo item de backend a implementar.**

---

## SHOULD HAVE — Alta Prioridade, mas não bloqueia o launch

| #   | Feature                                                                                           | Justificativa                                                                                                                                             | API | Web |
| --- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --- |
| S1  | Carteirinha digital do sócio com QR Code (PWA)                                                    | Identidade digital; motiva o sócio a manter o pagamento em dia                                                                                           | ⬜  | ⬜  |
| S2  | Relatório financeiro mensal exportável em PDF                                                     | Prestação de contas para diretoria; pedido recorrente nas entrevistas                                                                                    | ⬜  | ⬜  |
| S3  | Registro de despesas do clube (P&L simplificado)                                                  | Completa a visão financeira; tesoureiro consegue ver saldo real                                                                                          | ⬜  | ⬜  |
| S4  | Histórico de pagamentos por sócio                                                                 | Suporte a disputas; sócio pode consultar o próprio histórico                                                                                             | ⚠️  | ⬜  |
| S5  | Notificações em tempo real para novos pagamentos                                                  | Feedback imediato ao tesoureiro sem precisar abrir o dashboard                                                                                           | ✅  | ✅  |
| S6  | Site de marketing: landing page, página de preços e página de contato (route group `(marketing)`) | Necessário para converter os primeiros clubes pagantes além do piloto.                                                                                   | —   | ✅  |

**Notas SHOULD:**

**S4 ⚠️** — O `audit_log` persiste entrada `PAYMENT_CONFIRMED` com `chargeId`, `paymentId`, `amountCents` e `paidAt` para cada pagamento processado. O histórico de mensagens por sócio está disponível em `GET /api/messages/member/:memberId`. Falta um endpoint dedicado `GET /api/members/:memberId/payments` que liste as linhas da tabela `payments` por sócio.

**S5 ✅** — SSE implementado em `GET /api/events`. O worker de webhook emite `PAYMENT_CONFIRMED` via `sseBus` (EventEmitter in-process; substituível por Redis pub/sub em multi-processo). O frontend consume via `useRealTimeEvents` e invalida o cache React Query.

**S6 ✅ (Web)** — Landing page, `/precos`, `/contato` completos no route group `(marketing)`.

---

## COULD HAVE — Desejável, entra na Fase 2

| #   | Feature                                    | Quando Entra                                              |
| --- | ------------------------------------------ | --------------------------------------------------------- |
| C1  | Portal de votações internas (AGO/AGE)      | Fase 2 — módulo de engajamento                            |
| C2  | Cobrança por boleto como fallback ao Pix   | Fase 2 — ampliar cobertura para sócios sem conta corrente |
| C3  | App mobile nativo (iOS/Android)            | Fase 3 — PWA resolve o MVP sem custo de loja              |
| C4  | Multi-idioma (espanhol/inglês)             | Fase 4 — expansão internacional                           |
| C5  | Integração contábil (exportação SPED/NFSe) | Fase 2 — clubes semiprofissionais formalizados            |

---

## WON'T HAVE — Explicitamente fora do MVP

| #   | O que NÃO entra                                                 | Por quê                                                                                                                                                           |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Integração com ArenaPass (bilheteria)                           | Módulo v1.5 — depende de v1.0 estável e validado                                                                                                                  |
| W2  | Gestão de atletas / TreinoOS                                    | Módulo v2.0 — escopo completamente diferente. **Nota:** o stub de identidade do atleta (M9) é a exceção deliberada — criar a entidade não é implementar o módulo. |
| W3  | API pública para integrações de terceiros                       | Risco de segurança e suporte sem volume suficiente                                                                                                                |
| W4  | Painel white-label para federações                              | B2B enterprise — complexidade desproporcional ao MVP                                                                                                              |
| W5  | IA generativa para análise financeira                           | Custo de infra e complexidade sem ROI validado ainda                                                                                                              |
| W6  | Blog, docs públicos ou A/B testing de copy no site de marketing | Volume insuficiente no MVP para justificar a complexidade.                                                                                                        |

---

## Resumo Visual

```
          API (apps/api)                    Web (apps/web)
MUST   ████████████████████  M1–M8 ✅ (M6 ⚠️)  ████████████░░░░░░░░  M1,M4,M5,M7,M8 ✅
       M9 ⬜ único item pendente              M2⚠️ M3⬜ M6⚠️ M9⬜ pendentes

SHOULD ████░░░░░░░░░░░░░░░░  S5 ✅ S4⚠️    ████░░░░░░░░░░░░░░░░  S5,S6 ✅
COULD  ░░░░░░░░░░░░░░░░░░░░  —             —
WON'T  ✗                    —             —
```

---

## Próximos passos

### Backend (apps/api) — 1 item restante do MUST

1. **M9 — Stub de atletas:** criar módulo `src/modules/athletes/` com schema Prisma, rota `GET/POST/PUT /api/athletes`, campos mínimos (`name`, `cpf`, `birthDate`, `position`, `status`, `clubId`). Provisionar a tabela `athletes` no DDL tenant em `lib/tenant-schema.ts`. Criar entrada de `AuditLog` nas operações de escrita. Estimativa: ~1.5 dias.

### Frontend (apps/web) — itens pendentes do MUST

1. **M3 — Tela de cobranças:** CRUD de cobranças Pix, exibição de QR Code, status por sócio. Backend Asaas plenamente integrado — desbloqueia o frontend.
2. **M2 — Importação CSV:** adicionar fluxo de upload na `MembersPage` (endpoint `POST /api/members/import` já disponível; template em `GET /api/members/import/template`).
3. **M6 — Templates personalizados:** tela de configuração de templates WhatsApp/e-mail (endpoints `GET/PUT/DELETE /api/templates/:key` já disponíveis).
4. **M9 — Atletas:** rota `/athletes`, tela básica de listagem/cadastro, entrada na sidebar (aguarda backend).

### Backend — itens SHOULD restantes

5. **S4 — Histórico de pagamentos:** endpoint `GET /api/members/:memberId/payments` listando `payments` joinado com `charges`. O dado já existe no banco; falta apenas a rota.
