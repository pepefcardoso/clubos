# Escopo MoSCoW — ClubOS v1.0

> **Janela do MVP:** 30 dias de desenvolvimento.
> **Critério de corte:** tudo que não for necessário para validar a hipótese principal fica para depois.
>
> **Hipótese principal:** o ClubOS reduz inadimplência em ≥ 25% e elimina pelo menos um risco jurídico crítico nos primeiros 60 dias de uso.

---

## Status de Implementação

> Legenda: ✅ Implementado · ⚠️ Parcial · ⬜ Pendente

A tabela abaixo traz o status separado por camada: **API** (`apps/api`) e **Web** (`apps/web`).

---

## MUST HAVE — Sem isso, não há produto vendável

| #   | Feature                                              | Critério de Aceite                                        | Complexidade | API | Web |
| --- | ---------------------------------------------------- | --------------------------------------------------------- | ------------ | --- | --- |
| M1  | Cadastro de clube com onboarding multi-step          | Nome, logo, CNPJ, plano configurado em < 5 min            | Média · 3d   | ✅  | ✅  |
| M2  | Cadastro manual + importação CSV de sócios           | 200 sócios importados sem erro em < 10 min                | Média · 2d   | ✅  | ⚠️  |
| M3  | Geração de cobranças PIX recorrentes com QR Code     | PIX gerado e exibido em < 30s por sócio                   | Alta · 4d    | ✅  | ⬜  |
| M4  | Webhook de confirmação de pagamento (Asaas)          | Status do sócio atualiza em < 10s após pagamento          | Alta · 3d    | ✅  | ✅  |
| M5  | Dashboard de inadimplência em tempo real (SSE)       | KPIs + gráfico 6 meses + lista de inadimplentes           | Média · 2d   | ✅  | ✅  |
| M6  | Régua de cobrança WhatsApp (D-3, D+3, on-demand)     | Mensagem automática nos marcos; fallback e-mail           | Alta · 4d    | ⚠️  | ⚠️  |
| M7  | Autenticação JWT com refresh token rotativo          | Login seguro; sessão 7d; constant-time bcrypt             | Baixa · 1d   | ✅  | ✅  |
| M8  | RBAC: Admin / Tesoureiro                             | Tesoureiro sem ações destrutivas; Admin CRUD completo     | Baixa · 1d   | ✅  | ✅  |
| M9  | Stub de atletas (schema + CRUD base)                 | `/api/athletes` funcional; campos de identidade + vínculo | Baixa · 1.5d | ⬜  | ⬜  |
| M10 | Contratos e alertas de BID/CBF                       | Alerta de escalação irregular antes da deadline           | Média · 2d   | ⬜  | ⬜  |
| M11 | Multi-Acquiring PIX (fallback de gateway)            | Indisponibilidade do Asaas não interrompe cobranças       | Alta · 2d    | ⬜  | —   |
| M12 | Criptografia AES-256 de CPF/telefone em repouso      | Dados sensíveis nunca expostos em queries brutas          | Alta · 2d    | ✅  | —   |
| M13 | Audit log imutável (todas operações financeiras)     | Compliance: log nunca deletado; exportável                | Média · 1d   | ✅  | —   |
| M14 | Site de marketing público (landing, preços, contato) | Converte primeiros clubes pagantes além do piloto         | Baixa · 2d   | —   | ✅  |

**Total estimado MUST:** ~30,5 dias de desenvolvimento

---

### Notas de implementação por item

**M1 — Onboarding** API ✅ · Web ✅

- **API:** `POST /api/clubs` cria o clube, provisiona o schema PostgreSQL do tenant (`clube_{id}`) com DDL idempotente (enums, tabelas, índices, FKs) via `provisionTenantSchema`, e dispara e-mail de boas-vindas via Resend (fire-and-forget). Upload de logo disponível em `POST /api/clubs/:clubId/logo` (resize 200×200px WebP via sharp).
- **Web:** `OnboardingWizard` com 3 etapas: `StepClubData` (nome, slug, CNPJ), `StepLogo` (upload com preview), `StepConfirmation`. Integrado com `POST /api/clubs`. Acessível em `/onboarding`.

**M2 — Cadastro de sócios** API ✅ · Web ⚠️

- **API:** Cadastro individual via `POST /api/members` (validação Zod, dedup de CPF via scan pgcrypto, criptografia AES-256 de CPF/telefone). Importação em lote via `POST /api/members/import` (CSV com PapaParse, até 5.000 linhas, batches de 500, upsert por CPF, vínculo de plano, erros por linha reportados). Template de CSV disponível em `GET /api/members/import/template`. Atualização de sócio em `PUT /api/members/:memberId` (imutabilidade de CPF garantida). Listagem paginada com busca full-text (nome ou CPF descriptografado in-DB) em `GET /api/members`.
- **Web:** Formulário manual (`MemberFormModal`) implementado. **Pendente:** fluxo de upload CSV não está exposto no frontend.

**M3 — Cobranças PIX** API ✅ · Web ⬜

- **API:** `POST /api/charges/generate` (trigger manual) e job BullMQ agendado via cron `0 8 1 * *` (1º de cada mês às 08h UTC). O serviço `generateMonthlyCharges` itera os membros com `MemberPlan` ativo, cria cada `Charge` em transação isolada (idempotente por período via `hasExistingCharge`), e despacha ao gateway Asaas via `dispatchChargeToGateway`. O `GatewayRegistry` abstrai o provider: chamar `GatewayRegistry.forMethod('PIX')` retorna `AsaasGateway`, que cria o PIX e devolve `qrCodeBase64` e `pixCopyPaste` salvos em `gatewayMeta` (JSONB). Falhas de gateway são isoladas em `gatewayErrors[]`; o job tem backoff 1h → 6h → 24h com até 3 tentativas; exaustão transiciona cobranças para `PENDING_RETRY`.
- **Web:** Sidebar mostra "Em breve" para a tela de cobranças. Backend plenamente disponível — desbloqueia o frontend.

**M4 — Webhook de pagamento** API ✅ · Web ✅

- **API:** `POST /webhooks/:gateway` valida HMAC (header `asaas-access-token` via `timingSafeEqual`), normaliza o evento via `parseWebhook`, responde 200 imediatamente e enfileira no BullMQ (`webhook-events` queue). O worker (`startWebhookWorker`) resolve o tenant por `externalReference` (chargeId), verifica idempotência em `payments.gatewayTxid`, cria o `Payment`, marca `Charge` como PAID, atualiza `Member.status → ACTIVE` se estava OVERDUE, escreve `AuditLog` e emite evento SSE via `sseBus`.
- **Web:** `useRealTimeEvents` consome `GET /api/events` (SSE) e invalida o cache React Query automaticamente ao receber `PAYMENT_CONFIRMED`.

**M5 — Dashboard** API ✅ · Web ✅

- **API:** `GET /api/dashboard/summary` (contadores de sócios por status, cobranças PENDING/OVERDUE, pagamentos do mês). `GET /api/dashboard/charges-history` (histórico por mês, últimos N meses, raw SQL `TO_CHAR + GROUP BY`). `GET /api/dashboard/overdue-members` (paginado, raw SQL `DISTINCT ON` para sócio OVERDUE com cobrança mais antiga, inclui `daysPastDue`).
- **Web:** `DashboardClient` com `DashboardKpis`, `DelinquencyChart` (Recharts), `OverdueMembersTable`. Atualização em tempo real via SSE.

**M6 — Régua de cobrança WhatsApp** API ⚠️ · Web ⚠️

- **API:** Dois jobs automáticos + on-demand implementados; job D-0 (vencimento hoje) ainda pendente:
  - **D-3:** cron `0 9 * * *` → dispatch worker → `send-club-reminders` por clube → `sendDailyRemindersForClub` (cobranças PENDING com `dueDate` em D+3).
  - **D+3 (overdue):** cron `0 10 * * *` → dispatch worker → `send-club-overdue-notices` por clube → `sendOverdueNoticesForClub` (cobranças PENDING/OVERDUE com `dueDate` em D-3).
  - **On-demand:** `POST /api/members/:memberId/remind` (cobrança OVERDUE mais antiga do sócio, cooldown de 4h).
  - Todos os envios passam por `checkAndConsumeWhatsAppRateLimit` (Lua atômica no Redis, 30 msg/min por clube), `hasRecentMessage` (janela 20h de idempotência) e `sendWhatsAppMessage` (descriptografa phone, normaliza para E.164, chama `WhatsAppRegistry.get()` — suporta Z-API e Evolution API). Fallback automático para e-mail via Resend quando WhatsApp falha pela 2ª vez em 48h.
  - **D-0 (vencimento hoje):** job automático ainda não implementado — apenas on-demand cobre este caso indiretamente.
- **Web:** Envio on-demand implementado via `useRemindMember`. Jobs automáticos são responsabilidade exclusiva do backend.

**M7 — Autenticação** API ✅ · Web ✅

- **API:** `POST /api/auth/login` (bcrypt compare, constant-time para e-mails inexistentes, access token JWT HS256 15min + refresh token 7d em httpOnly cookie). `POST /api/auth/refresh` (valida e consome refresh token do Redis — single-use — emite novo par). `POST /api/auth/logout` (revoga refresh token no Redis, limpa cookie). `GET /api/auth/me`. Decorator `verifyAccessToken` e `verifyRefreshToken` no Fastify. Refresh JWT implementado com `node:crypto` nativo (sem plugin duplicado).
- **Web:** `AuthProvider` com bootstrap transparente, deduplicação de refresh concorrente.

**M8 — Controle de acesso** API ✅ · Web ✅

- **API:** Decorator `requireRole('ADMIN' | 'TREASURER')` com hierarquia `ADMIN > TREASURER`. Aplicado individualmente nas rotas: `POST /api/plans`, `PUT /api/plans/:id`, `DELETE /api/plans/:id`, `PUT /api/members/:id`, `POST /api/clubs/:id/logo`, `PUT /api/templates/:key`, `DELETE /api/templates/:key`.
- **Web:** `isAdmin` verificado em `MembersPage` e `PlansPage`.

**M9 — Stub de atletas** API ⬜ · Web ⬜

- Nenhum módulo `athletes` existe em `apps/api/src/modules/`. Nenhuma rota, schema Prisma, nem entrada de navegação no frontend.
- **O que implementar:** criar módulo `src/modules/athletes/` com schema Prisma, rota `GET/POST/PUT /api/athletes`, campos mínimos (`name`, `cpf`, `birthDate`, `position`, `status`, `clubId`). Provisionar tabela `athletes` no DDL tenant em `lib/tenant-schema.ts`. Criar entrada de `AuditLog` nas operações de escrita.
- **Por que é MUST:** a entidade `athlete` é dependência central de TreinoOS, BaseForte, FisioBase, ScoutLink e CampeonatOS. Criar o schema agora (~1.5d) evita uma migração dolorosa de dados ao iniciar a v1.5 e elimina a dependência circular. Criar a entidade não é implementar o módulo — toda a lógica esportiva permanece na v1.5 em diante.

**M10 — Contratos e alertas BID/CBF** API ⬜ · Web ⬜

- Nenhuma implementação existente. Schema `contracts`, Motor de Regras Esportivas e tela de alertas todos pendentes.
- **O que implementar:** schema `contracts` no DDL tenant (tipo de vínculo, datas, status), Motor de Regras Esportivas como JSONB parametrizável via Backoffice (sem deploy para mudar regras da CBF/FPF), alertas de vencimento de contrato por WhatsApp/e-mail, validação de elegibilidade BID antes de escalação.
- **Por que é MUST:** a escalação irregular de jogadores sem registro no BID da CBF resulta em perda automática de pontos e pode excluir o clube do campeonato. É o risco jurídico-esportivo de maior impacto imediato para o cliente — comparável à multa da ANPD em gravidade.

**M11 — Multi-Acquiring PIX** API ⬜ · Web —

- `GatewayRegistry` atual não possui lógica de fallback; `PagarmeGateway` não existe; PIX estático do clube não é configurado no onboarding.
- **O que implementar:** `PagarmeGateway` implementando `PaymentGateway`, lógica de fallback silencioso em `GatewayRegistry.forMethod()` (Asaas → Pagarme → PIX estático), campo `pixKeyFallback` no onboarding e no schema `clubs`, notificação ao clube quando fallback é acionado.
- **Por que é MUST:** gateways de pagamento caem na data de vencimento. Para um clube que depende da receita de sócios para pagar salários, uma cobrança perdida é dinheiro real que não volta. Indisponibilidade do gateway primário não pode ser um ponto único de falha de receita.

**M12 — Criptografia em repouso** API ✅ · Web —

- `pgp_sym_encrypt/decrypt` (pgcrypto AES-256) aplicado em CPF e telefone. `encryptField`/`decryptField` encapsulam toda operação criptográfica. `findMemberByCpf` realiza busca via scan descriptografado in-DB (aceitável para ~centenas de sócios por clube na v1.0).

**M13 — Audit log imutável** API ✅ · Web —

- `AuditLog` presente em todas as operações financeiras e de sócios. Nunca deletado. Entrada obrigatória em: `CHARGE_GENERATED`, `PAYMENT_CONFIRMED`, criação/atualização/exclusão de sócios e planos.

**M14 — Site de marketing** API — · Web ✅

- Landing page, `/precos`, `/contato` completos no route group `(marketing)`. Layout independente sem importação de hooks ou componentes do `(app)`. Formulário de contato com validação Zod, rate limiting (5 req/60s por IP) e envio via Resend.

---

## SHOULD HAVE — Alta prioridade; entra na sprint seguinte ao MVP

| #   | Feature                                          | Justificativa de Negócio                                              | API | Web |
| --- | ------------------------------------------------ | --------------------------------------------------------------------- | --- | --- |
| S1  | Tela de cobranças PIX (frontend completo)        | Backend pronto; desbloqueia visibilidade total para o tesoureiro      | ✅  | ⬜  |
| S2  | Upload CSV de sócios exposto no frontend         | Endpoint pronto; reduz tempo de onboarding de novos clubes            | ✅  | ⬜  |
| S3  | Carteirinha digital do sócio com QR Code (PWA)   | Motiva pagamento em dia; identidade digital do torcedor               | ⬜  | ⬜  |
| S4  | Conciliação bancária automática via OFX          | Poupa horas do financeiro; reduz honorários contábeis                 | ⬜  | ⬜  |
| S5  | Painel de Transparência SAF (Lei 14.193/2021)    | Obrigatório para SAFs; diferencial competitivo imediato               | ⬜  | ⬜  |
| S6  | Relatório financeiro mensal exportável em PDF    | Prestação de contas para diretoria; pedido recorrente nas entrevistas | ⬜  | ⬜  |
| S7  | Histórico de pagamentos por sócio                | Suporte a disputas; sócio pode consultar o próprio histórico          | ⚠️  | ⬜  |
| S8  | Templates de mensagem personalizáveis (tela)     | Endpoints prontos; personalização aumenta taxa de abertura            | ✅  | ⬜  |
| S9  | Job D-0 WhatsApp (vencimento hoje)               | Completa a régua de cobrança; cobre o momento de maior risco          | ⬜  | —   |
| S10 | Registro de despesas do clube (P&L simplificado) | Tesoureiro vê saldo real; completa visão financeira                   | ⬜  | ⬜  |
| S11 | Controle de acesso QR Code dinâmico via celular  | Evita CAPEX de catracas biométricas; resolve portaria sem hardware    | ⬜  | ⬜  |

**Notas SHOULD:**

**S1 ⬜ (Web)** — Endpoint `POST /api/charges/generate`, `GET /api/charges` e toda a lógica de gateway já disponível no backend. Falta apenas a tela de cobranças no frontend com exibição de QR Code por sócio.

**S2 ⬜ (Web)** — Endpoint `POST /api/members/import` (PapaParse, 5.000 linhas, batches de 500) e template `GET /api/members/import/template` já disponíveis. Falta o fluxo de upload na `MembersPage`.

**S4 ⬜** — Conciliação bancária via arquivos OFX elimina o trabalho manual do tesoureiro de conferir extrato vs. cobranças. Planejada para entrega completa na v2.0 (junto com SAF Compliance Full); pode ser antecipada como feature standalone se demanda do piloto justificar.

**S5 ⬜** — Painel de Transparência Institucional para SAFs (publicação de balanços com hash SHA-256 imutável no audit_log, lista de credores, demonstrativo de receitas). Obrigatório pela Lei 14.193/2021 para clubes com faturamento até R$ 78M. Feature completa na v2.0; antecipação possível como CRUD básico de balanços.

**S7 ⚠️** — O `audit_log` persiste entrada `PAYMENT_CONFIRMED` com `chargeId`, `paymentId`, `amountCents` e `paidAt` para cada pagamento processado. O histórico de mensagens por sócio está disponível em `GET /api/messages/member/:memberId`. Falta um endpoint dedicado `GET /api/members/:memberId/payments` que liste as linhas da tabela `payments` por sócio.

**S8 ✅/⬜** — Endpoints `GET/PUT/DELETE /api/templates/:key` (WHATSAPP ou EMAIL) implementados no backend; fallback para `DEFAULT_TEMPLATES`; placeholders `{nome}`, `{valor}`, `{pix_link}`, `{vencimento}`. Falta a tela de configuração no frontend.

**S9 ⬜** — Único marco da régua de cobrança sem job automático. O on-demand (`POST /api/members/:memberId/remind`) cobre parcialmente, mas não escala para clubes com centenas de sócios no vencimento.

**S11 ⬜** — QR Code dinâmico via celular do staff para validar entrada de torcedores em eventos. Elimina CAPEX de catracas biométricas físicas. Antecipa funcionalidade central do ArenaPass (v2.5) com custo de engenharia baixo.

---

## COULD HAVE — Desejável; entra na Fase 2 ou posterior

| #   | Feature                                                | Quando Entra                                                    |
| --- | ------------------------------------------------------ | --------------------------------------------------------------- |
| C1  | App mobile nativo (iOS/Android)                        | v1.5 — PWA resolve o MVP; loja exige mais maturidade de produto |
| C2  | Planejador de treinos offline-first (TreinoOS)         | v1.5 — depende de stub de atleta estável (M9)                   |
| C3  | Cálculo ACWR de carga por atleta (BaseForte)           | v1.5 — requer TimescaleDB e histórico mínimo de dados           |
| C4  | Prontuário médico digital + Return to Play (FisioBase) | v2.0 — depende de dados de carga do BaseForte                   |
| C5  | Módulo de peneiras com aceite parental LGPD            | v1.5 — Privacy by Design; hard stop no sistema                  |
| C6  | Integração Apple Watch / wearable consumer             | v1.5 — hardware-agnostic; APIs HealthKit/Google Fit             |
| C7  | Bilheteria digital ArenaPass (MVP link PIX)            | v2.5 — funil torcedor→sócio pós-v1.0 validado                   |
| C8  | Portal de votações internas (AGO/AGE)                  | v2.0 — módulo de engajamento pós-financeiro                     |
| C9  | Cobrança por boleto como fallback ao PIX               | v1.5 — amplia cobertura para sócios sem conta corrente          |
| C10 | Exportação contábil SPED/NFSe                          | v2.0 — clubes semiprofissionais formalizados                    |
| C11 | ScoutLink — marketplace de talentos                    | v3.0 — depende de 6 meses de dados BaseForte em produção        |
| C12 | CampeonatOS — gestão de campeonatos                    | v3.5 — requer massa crítica de clubes na liga                   |
| C13 | Multi-idioma (espanhol/inglês)                         | v4.0 — expansão internacional                                   |
| C14 | IA generativa para análise financeira/tática           | v3.0+ — ROI incerto sem volume de dados validado                |

---

## WON'T HAVE — Explicitamente fora do escopo atual

| #   | O que NÃO entra                                      | Por quê                                                        |
| --- | ---------------------------------------------------- | -------------------------------------------------------------- |
| W1  | API pública para integrações de terceiros            | Risco de segurança e suporte sem volume suficiente             |
| W2  | Painel white-label para federações                   | B2B enterprise — complexidade desproporcional ao MVP           |
| W3  | PDV físico (mPOS) para lanchonete                    | Hardware; custo de supply chain sem validação do canal         |
| W4  | Blog, docs públicos ou A/B testing de copy           | Volume insuficiente no MVP para justificar a complexidade      |
| W5  | Integração com plataformas de elite (Catapult, HUDL) | Conflito de posicionamento — esse é o mercado que substituímos |
| W6  | Módulo de previsão de lesões por ML                  | Requer mínimo 2 temporadas de dados por atleta                 |
| W7  | Gamificação de torcedor (pontos/badges)              | Engajamento B2C sem base financeira sólida é distração         |

---

## Resumo Visual

```
          API (apps/api)                        Web (apps/web)
MUST   ██████████████░░░░░░  M1–M8,M12,M13 ✅  ████████████░░░░░░░░  M1,M4,M5,M7,M8,M14 ✅
       M6 ⚠️                                    M2 ⚠️  M6 ⚠️
       M9,M10,M11 ⬜ (3 itens pendentes)        M3,M9,M10 ⬜ pendentes

SHOULD ████░░░░░░░░░░░░░░░░  S7⚠️  S8✅        ████░░░░░░░░░░░░░░░░  S1,S2,S8 prontos p/ frontend
COULD  ░░░░░░░░░░░░░░░░░░░░  v1.5+             v1.5+
WON'T  ✗                    fora do escopo     fora do escopo
```

---

## Próximos passos

### Backend (apps/api) — 3 itens restantes do MUST

1. **M9 — Stub de atletas:** criar módulo `src/modules/athletes/` com schema Prisma, rota `GET/POST/PUT /api/athletes`, campos mínimos (`name`, `cpf`, `birthDate`, `position`, `status`, `clubId`). Provisionar tabela `athletes` no DDL tenant em `lib/tenant-schema.ts`. Criar entrada de `AuditLog` nas operações de escrita. Estimativa: ~1.5 dias.

2. **M10 — Contratos e BID/CBF:** schema `contracts` no DDL tenant + Motor de Regras Esportivas (JSONB parametrizável via Backoffice, sem deploy para atualizar regras CBF/FPF) + alertas de vencimento de contrato por WhatsApp/e-mail + validação de elegibilidade antes de escalação. Estimativa: ~2 dias.

3. **M11 — Multi-Acquiring PIX:** implementar `PagarmeGateway` (interface `PaymentGateway`), adicionar lógica de fallback silencioso em `GatewayRegistry.forMethod()` (Asaas → Pagarme → PIX estático do clube), adicionar campo `pixKeyFallback` no onboarding e no schema `clubs`, notificar clube quando fallback é acionado. Estimativa: ~2 dias.

### Frontend (apps/web) — itens pendentes do MUST

4. **M3 — Tela de cobranças:** CRUD de cobranças PIX, exibição de QR Code, status por sócio. Backend Asaas plenamente integrado — desbloqueia o frontend imediatamente. Estimativa: ~3 dias.

5. **M2 — Importação CSV:** adicionar fluxo de upload na `MembersPage` (endpoint `POST /api/members/import` já disponível; template em `GET /api/members/import/template`). Estimativa: ~1 dia.

6. **M6 — Job D-0:** worker automático "vencimento hoje". Estimativa: ~0.5 dia.

7. **M9/M10 — Atletas e Contratos:** rotas `/athletes` e `/contracts`, telas básicas de listagem/cadastro, entradas na sidebar (aguardam backend).

### Backend — itens SHOULD a atacar após fechar os MUSTs

8. **S9 — Job D-0 WhatsApp:** único marco da régua sem automação; on-demand não escala. Estimativa: ~0.5 dia.

9. **S7 — Histórico de pagamentos:** endpoint `GET /api/members/:memberId/payments` listando `payments` joinado com `charges`. O dado já existe no banco; falta apenas a rota. Estimativa: ~0.5 dia.

### Frontend — itens SHOULD com backend pronto

10. **S1 — Tela de cobranças PIX:** aguarda M3 no frontend (mesma tela).
11. **S2 — Importação CSV:** aguarda M2 no frontend (mesma tela).
12. **S8 — Templates personalizáveis:** tela de configuração de templates WhatsApp/e-mail (endpoints `GET/PUT/DELETE /api/templates/:key` já disponíveis). Estimativa: ~1 dia.
