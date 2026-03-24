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

| #   | Feature                                               | Critério de Aceite                                        | Complexidade | API | Web |
| --- | ----------------------------------------------------- | --------------------------------------------------------- | ------------ | --- | --- |
| M1  | Cadastro de clube com onboarding multi-step           | Nome, logo, CNPJ, plano configurado em < 5 min            | Média · 3d   | ✅  | ✅  |
| M2  | Cadastro manual + importação CSV de sócios            | 200 sócios importados sem erro em < 10 min                | Média · 2d   | ✅  | ✅  |
| M3  | Geração de cobranças PIX recorrentes com QR Code      | PIX gerado e exibido em < 30s por sócio                   | Alta · 4d    | ✅  | ✅  |
| M4  | Webhook de confirmação de pagamento (Asaas)           | Status do sócio atualiza em < 10s após pagamento          | Alta · 3d    | ✅  | ✅  |
| M5  | Dashboard de inadimplência em tempo real (SSE)        | KPIs + gráfico 6 meses + lista de inadimplentes           | Média · 2d   | ✅  | ✅  |
| M6  | Régua de cobrança WhatsApp (D-3, D-0, D+3, on-demand) | Mensagem automática nos marcos; fallback e-mail           | Alta · 4d    | ✅  | ✅  |
| M7  | Autenticação JWT com refresh token rotativo           | Login seguro; sessão 7d; constant-time bcrypt             | Baixa · 1d   | ✅  | ✅  |
| M8  | RBAC: Admin / Tesoureiro                              | Tesoureiro sem ações destrutivas; Admin CRUD completo     | Baixa · 1d   | ✅  | ✅  |
| M9  | Stub de atletas (schema + CRUD base)                  | `/api/athletes` funcional; campos de identidade + vínculo | Baixa · 1.5d | ✅  | ✅  |
| M10 | Contratos e alertas de BID/CBF                        | Alerta de escalação irregular antes da deadline           | Média · 2d   | ✅  | ✅  |
| M11 | Multi-Acquiring PIX (fallback de gateway)             | Indisponibilidade do Asaas não interrompe cobranças       | Alta · 2d    | ✅  | —   |
| M12 | Criptografia AES-256 de CPF/telefone em repouso       | Dados sensíveis nunca expostos em queries brutas          | Alta · 2d    | ✅  | —   |
| M13 | Audit log imutável (todas operações financeiras)      | Compliance: log nunca deletado; exportável                | Média · 1d   | ✅  | —   |
| M14 | Site de marketing público (landing, preços, contato)  | Converte primeiros clubes pagantes além do piloto         | Baixa · 2d   | —   | ✅  |

**Total estimado MUST:** ~30,5 dias de desenvolvimento (Concluído)

---

### Notas de implementação por item

**M1 — Onboarding** API ✅ · Web ✅

- **API:** `POST /api/clubs` cria o clube, provisiona o schema PostgreSQL do tenant (`clube_{id}`) com DDL idempotente (enums, tabelas, índices, FKs) via `provisionTenantSchema`, e dispara e-mail de boas-vindas via Resend (fire-and-forget). Upload de logo disponível em `POST /api/clubs/:clubId/logo` (resize 200×200px WebP via sharp).
- **Web:** `OnboardingWizard` com 3 etapas: `StepClubData` (nome, slug, CNPJ), `StepLogo` (upload com preview), `StepConfirmation`. Integrado com `POST /api/clubs`. Acessível em `/onboarding`.

**M2 — Cadastro de sócios** API ✅ · Web ✅

- **API:** Cadastro individual via `POST /api/members` (validação Zod, dedup de CPF via scan pgcrypto, criptografia AES-256 de CPF/telefone). Importação em lote via `POST /api/members/import` (CSV com PapaParse, até 5.000 linhas, batches de 500, upsert por CPF, vínculo de plano, erros por linha reportados). Template de CSV disponível em `GET /api/members/import/template`. Atualização de sócio em `PUT /api/members/:memberId`. Listagem paginada com busca full-text.
- **Web:** Formulário manual (`MemberFormModal`) e fluxo de upload de CSV (`CsvImportModal`, `CsvTemplateDownload`) implementados e expostos no frontend na `MembersPage`.

**M3 — Cobranças PIX** API ✅ · Web ✅

- **API:** `POST /api/charges/generate` (trigger manual) e job BullMQ agendado via cron `0 8 1 * *`. O serviço `generateMonthlyCharges` despacha ao gateway via `dispatchChargeToGateway`. O `GatewayRegistry` abstrai o provider (Asaas, Pagarme, Stripe) e devolve `qrCodeBase64` salvos em `gatewayMeta` (JSONB). Falhas de gateway têm backoff 1h → 6h → 24h.
- **Web:** CRUD de cobranças PIX implementado. A tela `ChargesPage` exibe a listagem via `ChargesTable` e o QR Code de pagamento através do `QrCodeModal`.

**M4 — Webhook de pagamento** API ✅ · Web ✅

- **API:** `POST /webhooks/:gateway` valida HMAC (header `asaas-access-token` via `timingSafeEqual`), normaliza o evento via `parseWebhook`, responde 200 imediatamente e enfileira no BullMQ. O worker resolve o tenant por `externalReference` (chargeId), verifica idempotência, cria o `Payment`, atualiza `Member.status → ACTIVE`, escreve `AuditLog` e emite evento SSE via `sseBus`.
- **Web:** `useRealTimeEvents` consome `GET /api/events` (SSE) e invalida o cache React Query automaticamente ao receber `PAYMENT_CONFIRMED`.

**M5 — Dashboard** API ✅ · Web ✅

- **API:** `GET /api/dashboard/summary` (contadores de sócios, cobranças, pagamentos). `GET /api/dashboard/charges-history` (histórico por mês). `GET /api/dashboard/overdue-members` (sócio OVERDUE com cobrança mais antiga).
- **Web:** `DashboardClient` com `DashboardKpis`, `DelinquencyChart` (Recharts), `OverdueMembersTable`. Atualização em tempo real via SSE.

**M6 — Régua de cobrança WhatsApp** API ✅ · Web ✅

- **API:** Todos os jobs automáticos (D-3, D-0, D+3) + on-demand implementados:
  - **D-3:** cron `0 9 * * *` → dispatch worker (vencimento em D+3).
  - **D-0:** cron `0 8 * * *` → fila `due-today-notices` (vencimento hoje).
  - **D+3 (overdue):** cron `0 10 * * *` → dispatch worker (vencimento em D-3).
  - Todos os envios passam por `checkAndConsumeWhatsAppRateLimit` (Lua atômica no Redis, 30 msg/min por clube) e `sendWhatsAppMessage`. Fallback automático para e-mail via Resend quando WhatsApp falha pela 2ª vez em 48h.
- **Web:** Envio on-demand implementado via `useRemindMember`. Jobs automáticos rodam de forma fluída no backend.

**M7 — Autenticação** API ✅ · Web ✅

- **API:** `POST /api/auth/login` (bcrypt compare, access token JWT HS256 15min + refresh token 7d em httpOnly cookie). Refresh JWT implementado com `node:crypto` nativo.
- **Web:** `AuthProvider` com bootstrap transparente, deduplicação de refresh concorrente.

**M8 — Controle de acesso** API ✅ · Web ✅

- **API:** Decorator `requireRole('ADMIN' | 'TREASURER')` aplicado individualmente nas rotas críticas.
- **Web:** `isAdmin` verificado no frontend para bloquear acções destrutivas a tesoureiros.

**M9 — Stub de atletas** API ✅ · Web ✅

- **API:** Módulo `src/modules/athletes/` implementado com schema Prisma e rotas CRUD. Tabela `athletes` provisionada no DDL tenant em `lib/tenant-schema.ts`. Entradas de `AuditLog` asseguradas.
- **Web:** Rotas e UI (`AthletesPage`, `AthletesTable`, `AthleteFormModal`) concluídas, fornecendo a entidade dependência central para as futuras versões.

**M10 — Contratos e alertas BID/CBF** API ✅ · Web ✅

- **API:** Schema `contracts` e Motor de Regras Esportivas (`rules-validator.ts`) implementados e parametrizáveis no JSONB. Alertas de vencimento e validação de elegibilidade em pleno funcionamento.
- **Web:** UI `ContractsPage` com CRUD completo para gestão de vínculos de atletas.

**M11 — Multi-Acquiring PIX** API ✅ · Web —

- **API:** `PagarmeGateway` e `StripeGateway` implementados, em conjunto com lógica de fallback silencioso no `GatewayRegistry.forMethod()` (Asaas → Pagarme → Stripe → PIX estático). Indisponibilidade de gateway primário não interrompe cobranças.

**M12 — Criptografia em repouso** API ✅ · Web —

- **API:** `pgp_sym_encrypt/decrypt` (pgcrypto AES-256) aplicado em CPF e telefone.

**M13 — Audit log imutável** API ✅ · Web —

- **API:** `AuditLog` presente e inalterável em todas as operações financeiras e de sócios.

**M14 — Site de marketing** API — · Web ✅

- **Web:** Landing page, `/precos`, `/contato` completos no route group `(marketing)`.

---

## SHOULD HAVE — Alta prioridade; entra na sprint seguinte ao MVP

| #   | Feature                                          | Justificativa de Negócio                                              | API | Web |
| --- | ------------------------------------------------ | --------------------------------------------------------------------- | --- | --- |
| S1  | Tela de cobranças PIX (frontend completo)        | Backend pronto; desbloqueia visibilidade total para o tesoureiro      | ✅  | ✅  |
| S2  | Upload CSV de sócios exposto no frontend         | Endpoint pronto; reduz tempo de onboarding de novos clubes            | ✅  | ✅  |
| S3  | Carteirinha digital do sócio com QR Code (PWA)   | Motiva pagamento em dia; identidade digital do torcedor               | ⬜  | ⬜  |
| S4  | Conciliação bancária automática via OFX          | Poupa horas do financeiro; reduz honorários contábeis                 | ⬜  | ⬜  |
| S5  | Painel de Transparência SAF (Lei 14.193/2021)    | Obrigatório para SAFs; diferencial competitivo imediato               | ⬜  | ⬜  |
| S6  | Relatório financeiro mensal exportável em PDF    | Prestação de contas para diretoria; pedido recorrente nas entrevistas | ⬜  | ⬜  |
| S7  | Histórico de pagamentos por sócio                | Suporte a disputas; sócio pode consultar o próprio histórico          | ✅  | ⬜  |
| S8  | Templates de mensagem personalizáveis (tela)     | Endpoints prontos; personalização aumenta taxa de abertura            | ✅  | ✅  |
| S9  | Job D-0 WhatsApp (vencimento hoje)               | Completa a régua de cobrança; cobre o momento de maior risco          | ✅  | —   |
| S10 | Registro de despesas do clube (P&L simplificado) | Tesoureiro vê saldo real; completa visão financeira                   | ⬜  | ⬜  |
| S11 | Controle de acesso QR Code dinâmico via celular  | Evita CAPEX de catracas biométricas; resolve portaria sem hardware    | ⬜  | ⬜  |

**Notas SHOULD:**

**S1 ✅ (Web) e S2 ✅ (Web)** — UI finalizada e integrada (Endpoints já estavam prontos e o frontend foi totalmente provisionado via `ChargesPage` e fluxos de `CsvImportModal`).

**S4 ⬜, S5 ⬜** — Conciliação via OFX e Painel SAF continuam mapeados para entrega completa na v2.0 (ou antecipação isolada).

**S7 ✅ (API) / ⬜ (Web)** — Rota `GET /api/members/:memberId/payments` criada no backend (`members.payments.routes.ts`). Exibição na UI do frontend programada como follow-up (pendente).

**S8 ✅ (API e Web)** — Tela de configuração de templates (`TemplatesPage`) entregue no frontend.

**S9 ✅ (API)** — Worker automático de Job D-0 implementado e integrado à fila BullMQ de notificações de cobrança diárias.

**S11 ⬜** — Antecipação opcional da funcionalidade central do ArenaPass mantida em backlog.

---

## COULD HAVE — Desejável; entra na Fase 2 ou posterior

| #   | Feature                                                | Quando Entra                                                    |
| --- | ------------------------------------------------------ | --------------------------------------------------------------- |
| C1  | App mobile nativo (iOS/Android)                        | v1.5 — PWA resolve o MVP; loja exige mais maturidade de produto |
| C2  | Planejador de treinos offline-first (TreinoOS)         | v1.5 — depende de stub de atleta estável (M9)                   |
| C3  | Cálculo ACWR de carga por atleta (BaseForte)           | v1.5 — requer histórico mínimo de dados (Materialized Views)    |
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
MUST   ████████████████████  Concluído 100% ✅   ████████████████████  Concluído 100% ✅
       M1 a M14 ✅                                M1 a M10, M14 ✅

SHOULD ████████████░░░░░░░░  S1,S2,S7,S8,S9 ✅    ████████████░░░░░░░░  S1,S2,S8 ✅
                             Restantes: V2.0+                          S7 UI pendente
COULD  ░░░░░░░░░░░░░░░░░░░░  v1.5+               v1.5+
WON'T  ✗                    fora do escopo     fora do escopo
```
