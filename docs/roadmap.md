# Roadmap Estratégico — ClubOS v1.0 → v3.5

> **Documento de visão de longo prazo.** Define módulos, sequência de lançamento, dependências entre módulos e critérios de go/no-go por versão.
>
> **Regra de ouro:** nenhuma versão começa antes da anterior atingir seu critério de go/no-go. Sete módulos parcialmente entregues valem menos que dois módulos excelentes.
>
> **Lógica da sequência:** Organize o dinheiro → Discipline o campo → Proteja o dado → Abra a arquibancada → Vitrine o talento → Conecte a liga.
>
> **Regra de planejamento:** `moscow.md` e `backlog.md` cobrem apenas o módulo em desenvolvimento ativo. Ao iniciar uma nova versão, esses documentos são atualizados com o escopo daquele módulo. Detalhar tarefas de módulos futuros antes do tempo é desperdício — o contexto muda.

---

## Visão Geral

O ClubOS é uma plataforma modular — um sistema operacional para clubes de futebol amador e semiprofissional — composta por 7 módulos lançados em 6 versões ao longo de aproximadamente 13 meses.

A lógica central do roadmap: **primeiro organize o dinheiro, depois discipline o campo, proteja o dado, abra a arquibancada, vitrine o talento, conecte a liga.** Cada camada torna a anterior mais valiosa e aumenta o custo de saída para o cliente.

### Princípios Inegociáveis de Arquitetura

| Princípio                    | Manifestação Técnica                                              | Por quê é inegociável                                                     |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Offline-First**            | PWA + IndexedDB + Service Workers + Background Sync               | Campo sem 4G é a norma, não a exceção no interior brasileiro              |
| **Hardware-Agnostic**        | APIs abertas para Apple Watch, GPS consumer, câmera do celular    | Quebra o monopólio Catapult/STATSports sem CAPEX para o clube             |
| **Privacy by Design**        | Hard stops para dados de menores; criptografia AES-256 em repouso | LGPD + ANPD: multas de até 2% do faturamento; passivo jurídico real       |
| **SAF-Ready**                | Módulo de Compliance com publicação inalterável de balanços       | Lei 14.193/2021 obrigatória para clubes com faturamento até R$78M         |
| **BRL-Native Pricing**       | Pay-As-You-Grow em Reais; sem conversão cambial                   | Volatilidade do EUR/USD inviabiliza licenças europeias para esse segmento |
| **Simplicidade Operacional** | Mobile-first, swipes grandes, zero treinamento formal             | Técnico de interior não vai largar o caderno se o app for complexo        |

---

## Tabela de Versões

| Versão | Codinome         | Módulos                                                  | Período    | Meta de Validação                               | Status API      | Status Web      |
| ------ | ---------------- | -------------------------------------------------------- | ---------- | ----------------------------------------------- | --------------- | --------------- |
| v1.0   | O Cofre do Clube | ClubOS (Financeiro + Sócios + Compliance Base)           | Sem. 1–6   | 10 clubes pagantes; inadimplência ↓25%          | 🟡 Quase pronto | 🟡 Em andamento |
| v1.5   | O Campo          | TreinoOS + BaseForte + Peneiras LGPD                     | Sem. 7–14  | 60% dos clubes v1.0 ativam módulo de treino     | ⬜ Não iniciado | ⬜ Não iniciado |
| v2.0   | O Vestiário      | FisioBase + SAF Compliance Full + Conciliação Financeira | Sem. 15–22 | Recidiva ↓ em 3+ clubes; 3 SAFs em compliance   | ⬜ Não iniciado | ⬜ Não iniciado |
| v2.5   | A Arquibancada   | ArenaPass (Bilheteria Digital)                           | Sem. 23–30 | Clube aumenta receita/jogo em 40%+              | ⬜ Não iniciado | ⬜ Não iniciado |
| v3.0   | A Vitrine        | ScoutLink (Marketplace de Talentos)                      | Mês 8–10   | 1º contato scout–escola mediado pela plataforma | ⬜ Não iniciado | ⬜ Não iniciado |
| v3.5   | A Liga           | CampeonatOS (Gestão de Campeonatos)                      | Mês 11–13  | 1 campeonato completo gerenciado end-to-end     | ⬜ Não iniciado | ⬜ Não iniciado |

### Resumo Visual

```
Semanas    1──────6  7────────14  15──────22  23────30  M8──10  M11─13
           ┌────────┐ ┌─────────┐ ┌─────────┐ ┌──────┐ ┌────┐  ┌─────┐
Versão     │  v1.0  │ │  v1.5   │ │  v2.0   │ │ v2.5 │ │v3.0│  │v3.5 │
           │ Cofre  │ │  Campo  │ │Vestiário│ │Arena │ │Vitrine│ │Liga │
           └────────┘ └─────────┘ └─────────┘ └──────┘ └────┘  └─────┘
Módulos    ClubOS     TreinoOS    FisioBase   ArenaPass Scout  Campeonato
           Finanças   BaseForte   SAF Full    Bilheteria Link   OS
           Sócios     Peneiras    Conc.Banc.  CRM Torc.
           Contratos  Offline-1st Carteirinha
```

---

## Versão 1.0 — "O Cofre do Clube"

**Período:** Semanas 1–6 | **Módulos:** ClubOS Financeiro + Sócios + Compliance Base

### Meta Estratégica

Provar, em 30 dias de piloto com 3 clubes, que o ClubOS reduz inadimplência em ≥ 25% sem nenhum treinamento formal. A proposição é simples: o tesoureiro chega na segunda-feira e o dinheiro já está na conta.

### Por que começar pelo financeiro?

O dinheiro é a dor universal. Inadimplência de sócios de 35–50% é a realidade de 90% dos clubes do "Missing Middle". É a feature que gera ROI no primeiro mês, justifica o pagamento da assinatura e cria o hábito de uso que viabiliza todos os módulos subsequentes. Um clube organizado financeiramente tem mais fôlego para investir em performance esportiva.

### Status de implementação (apps/api)

| Feature                                              | Status | Detalhe                                                                                                                   |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| Autenticação JWT + refresh token rotativo            | ✅     | `POST /api/auth/{login,refresh,logout,me}`, httpOnly cookie, Redis single-use, bcrypt, `node:crypto` HS256                |
| RBAC Admin / Tesoureiro                              | ✅     | Decorator `requireRole` com hierarquia `ADMIN > TREASURER`; guardas por rota                                              |
| Cadastro de clube + provisionamento de schema tenant | ✅     | `POST /api/clubs`, DDL idempotente via `provisionTenantSchema` (enums, tabelas, índices, FKs, pgcrypto)                   |
| Upload de logo do clube                              | ✅     | `POST /api/clubs/:id/logo`, sharp 200×200px WebP, storage local                                                           |
| Cadastro manual de sócios                            | ✅     | `POST /api/members`, encrypt CPF/phone (AES-256), dedup por CPF via scan pgcrypto                                         |
| Listagem de sócios com busca e filtro                | ✅     | `GET /api/members`, paginação, busca por nome/CPF descriptografado in-DB, filtro por status                               |
| Detalhe e atualização de sócio                       | ✅     | `GET /api/members/:id`, `PUT /api/members/:id` (CPF imutável), audit log                                                  |
| Importação em massa via CSV                          | ✅     | `POST /api/members/import` (PapaParse, 5.000 linhas, batches de 500, upsert por CPF, erros por linha)                     |
| Template de CSV para download                        | ✅     | `GET /api/members/import/template`                                                                                        |
| CRUD de planos                                       | ✅     | `GET/POST /api/plans`, `PUT/DELETE /api/plans/:id` (soft delete, guard de sócios ativos), audit log                       |
| Geração de cobranças mensais (manual + cron)         | ✅     | `POST /api/charges/generate`; cron BullMQ `0 8 1 * *`; idempotência por período; `PENDING_RETRY` em exaustão              |
| Gateway Asaas (PIX, cartão, boleto)                  | ✅     | `AsaasGateway` implementa `PaymentGateway`; `GatewayRegistry` abstrai o provider; `gatewayMeta` JSONB                     |
| Webhook de confirmação de pagamento                  | ✅     | `POST /webhooks/:gateway`; HMAC `timingSafeEqual`; BullMQ async; `handlePaymentReceived` transacional; idempotência dupla |
| Atualização de status de sócio via pagamento         | ✅     | `Member.status → ACTIVE` quando OVERDUE; audit log `PAYMENT_CONFIRMED`                                                    |
| Dashboard KPIs                                       | ✅     | `GET /api/dashboard/summary` (sócios por status, cobranças, pagamentos do mês)                                            |
| Histórico de cobranças por mês                       | ✅     | `GET /api/dashboard/charges-history` (últimos N meses, raw SQL `TO_CHAR + GROUP BY`)                                      |
| Lista de inadimplentes                               | ✅     | `GET /api/dashboard/overdue-members` (paginado, `DISTINCT ON`, cobrança mais antiga, `daysPastDue`)                       |
| SSE de pagamento confirmado em tempo real            | ✅     | `GET /api/events` (Bearer via query param), `sseBus` EventEmitter, keepalive 25s                                          |
| Jobs D-3 (lembrete 3 dias antes do vencimento)       | ✅     | Cron `0 9 * * *`, dispatch fan-out por clube, `sendDailyRemindersForClub`, idempotência 20h, rate limit Redis             |
| Jobs D+3 (aviso de inadimplência)                    | ✅     | Cron `0 10 * * *`, dispatch fan-out por clube, `sendOverdueNoticesForClub`, idempotência 20h, rate limit Redis            |
| Envio on-demand de lembrete WhatsApp                 | ✅     | `POST /api/members/:id/remind`, cooldown 4h, rate limit por clube                                                         |
| Provedores WhatsApp (Z-API + Evolution API)          | ✅     | `WhatsAppRegistry` + `ZApiProvider` + `EvolutionProvider`; selecionado via `WHATSAPP_PROVIDER`                            |
| Rate limiting WhatsApp (30 msg/min por clube)        | ✅     | Lua atômica no Redis, sliding window ZSET                                                                                 |
| Fallback de e-mail (Resend) após 2 falhas WhatsApp   | ✅     | `sendEmailFallbackMessage`, verifica `countRecentFailedWhatsAppMessages ≥ 1` em 48h                                       |
| Templates de mensagem customizáveis por clube        | ✅     | `GET/PUT/DELETE /api/templates/:key`; fallback para `DEFAULT_TEMPLATES`; placeholders `{nome}` etc.                       |
| Histórico de mensagens (audit trail)                 | ✅     | `GET /api/messages`, `GET /api/messages/member/:memberId`; filtros por canal, status, template, data                      |
| Criptografia CPF/telefone em repouso                 | ✅     | `pgp_sym_encrypt/decrypt` (pgcrypto AES-256); `encryptField`/`decryptField`                                               |
| Audit log imutável                                   | ✅     | `AuditLog` em todas operações financeiras e de sócios; nunca deletado                                                     |
| Rate limiting global (100 req/min por IP)            | ✅     | `@fastify/rate-limit` + Redis                                                                                             |
| **Stub de atletas (M9)**                             | ⬜     | Módulo `src/modules/athletes/` não criado; schema Prisma não definido; DDL tenant não atualizado                          |
| **Contratos e alertas BID/CBF (M10)**                | ⬜     | Schema contratos + Motor de Regras Esportivas + alertas não implementados                                                 |
| **Multi-Acquiring PIX — fallback gateway (M11)**     | ⬜     | `PagarmeGateway` não implementado; lógica de fallback no `GatewayRegistry` não existente                                  |

### Status de implementação (apps/web)

| Feature                                  | Status | Notas                                                                         |
| ---------------------------------------- | ------ | ----------------------------------------------------------------------------- |
| Onboarding do clube (wizard 3 etapas)    | ✅     | `/onboarding` — StepClubData, StepLogo, StepConfirmation                      |
| Cadastro manual de sócios                | ✅     | MembersPage + MemberFormModal com validação Zod                               |
| Importação via CSV                       | ⬜     | Pendente — endpoint disponível no backend; fluxo não exposto no frontend      |
| Tela de cobranças Pix                    | ⬜     | Sidebar mostra "Em breve" — backend plenamente disponível                     |
| SSE para evento PAYMENT_CONFIRMED        | ✅     | `useRealTimeEvents` — invalida cache React Query automaticamente              |
| Dashboard KPIs + gráfico + inadimplentes | ✅     | DashboardKpis, DelinquencyChart (Recharts), OverdueMembersTable               |
| Envio on-demand de lembrete WhatsApp     | ✅     | `useRemindMember` → POST /api/members/:id/remind — com tratamento de erro 429 |
| Autenticação JWT + refresh token         | ✅     | AuthProvider, bootstrap transparente, deduplicação de refresh concorrente     |
| Controle de acesso Admin/Tesoureiro      | ✅     | `isAdmin` verificado em Sócios e Planos; leitura para Tesoureiro              |
| Gestão de planos (CRUD completo)         | ✅     | PlansPage + PlanFormModal + DeletePlanDialog                                  |
| Templates de mensagem (tela de config)   | ⬜     | Endpoints disponíveis no backend; tela não implementada no frontend           |
| Stub de atletas (M9)                     | ⬜     | Sem rota, componente ou entrada de nav — aguarda backend                      |
| Contratos e alertas BID/CBF (M10)        | ⬜     | Sem rota ou componente — aguarda backend                                      |
| Site de marketing                        | ✅     | Landing, preços, contato — route group `(marketing)` completo                 |

### Features incluídas na v1.0

**Financeiro & Sócios (Revenue Core)**

- Onboarding multi-step: nome, logo, CNPJ, configuração de planos em < 5 min
- Cadastro manual de sócios + importação em lote CSV (5.000 linhas, batches de 500)
- Geração automática de cobranças PIX mensais com QR Code por sócio (cron 1º de cada mês, 08h)
- Webhook de confirmação Asaas com HMAC timingSafeEqual + BullMQ async
- **Multi-Acquiring PIX:** fallback Pagarme → PIX estático do clube (zero perda de receita na data de vencimento)
- Régua de cobrança WhatsApp: D-3 automático ✅, D-0 automático ⬜, D+3 automático ✅, on-demand ✅
- Templates de mensagem personalizáveis por clube com placeholders dinâmicos
- Fallback automático para e-mail (Resend) após 2 falhas de WhatsApp em 48h
- Rate limiting WhatsApp: 30 msg/min por clube (Lua atômica no Redis)
- Dashboard de inadimplência em tempo real: KPIs + gráfico 6 meses + lista de inadimplentes
- SSE para evento PAYMENT_CONFIRMED → invalidação automática do cache React Query

**Segurança & Compliance**

- Autenticação JWT HS256 (15min) + refresh token rotativo httpOnly (7d)
- RBAC: Admin (CRUD completo) / Tesoureiro (leitura + remind)
- Criptografia AES-256 (pgcrypto) em CPF e telefone de sócios
- Audit log imutável para todas as operações financeiras
- Rate limiting global: 100 req/min por IP (Redis)

**Contratos & Elegibilidade (Diferencial Imediato)**

- Stub de atletas: schema `athletes` + CRUD `/api/athletes` + campos de identidade
- Digitalização de vínculos trabalhistas com alertas de vencimento de contrato
- Alerta de escalação irregular: validação de registro no BID/CBF antes do jogo
- Motor de Regras Esportivas: parâmetros CBF/FPF configuráveis via Backoffice sem deploy

**Marketing**

- Site público: landing page, preços, contato — route group `(marketing)` no Next.js

### Itens pendentes (MUST incompletos no código atual)

| Item                   | O que falta                                                                               | Estimativa |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| M3 — Tela de cobranças | Frontend: CRUD cobranças, exibição QR Code, status por sócio                              | 3d         |
| M2 — CSV no frontend   | Fluxo de upload na MembersPage                                                            | 1d         |
| M6 — Job D-0           | Worker automático "vencimento hoje"                                                       | 0.5d       |
| M9 — Stub atletas      | Módulo `athletes/`, DDL tenant, rota, audit log                                           | 1.5d       |
| M10 — Contratos/BID    | Schema contratos + Motor de Regras + alertas                                              | 2d         |
| M11 — Multi-Acquiring  | PagarmeGateway + StripeGateway + fallback logic no GatewayRegistry (`STRIPE_ENABLED` env) | 3d         |
| S8 — Templates (UI)    | Tela de configuração de templates no frontend                                             | 1d         |

> **Por que M10 é MUST HAVE?** A escalação irregular de jogadores sem registro no BID da CBF resulta em perda automática de pontos e pode excluir o clube do campeonato. É o risco jurídico-esportivo de maior impacto imediato — comparável à multa da ANPD em gravidade para o cliente.
>
> **Por que M11 é MUST HAVE?** Gateways de pagamento caem na data de vencimento. Para um clube que depende de receita de sócios para pagar salários, uma cobrança perdida é dinheiro real que não volta.

### Critério de Go/No-Go v1.0

- Piloto com 3 clubes por 30 dias
- Inadimplência média reduzida em ≥ 20% (meta stretch: 25%)
- Zero duplicidades de cobrança ou falha silenciosa em produção
- Pelo menos 1 clube disposto a pagar o plano mensal
- NPS dos tesoureiros ≥ 40

---

## Versão 1.5 — "O Campo"

**Período:** Semanas 7–14 | **Módulos:** TreinoOS + BaseForte + Peneiras LGPD

### Meta Estratégica

Transformar o ClubOS de "ferramenta do tesoureiro" para "plataforma do clube inteiro". O treinador — que até agora usava WhatsApp e caderno — passa a registrar treinos no sistema. Esse é o upsell natural para clubes da v1.0: o cadastro de atletas já existe; basta ativar as features esportivas.

### Por que a v1.5 depende obrigatoriamente da v1.0?

O stub de atleta criado na v1.0 é a espinha dorsal desta versão. Sem ele, há migração dolorosa de dados. A base de sócios organizada também vira dado de entrada para o funil torcedor do ArenaPass futuro. Não existe atalho.

### Features incluídas na v1.5

**TreinoOS — Planejamento Técnico (Offline-First)**

- PWA Offline-First completo: Service Workers (Workbox) + IndexedDB (Dexie.js) + Background Sync
- Planejador de sessão de treino: biblioteca de exercícios (40 pré-carregados + customizáveis) em formato de prancheta visual
- Chamada digital de presença: técnico registra em 30s por app, funciona sem 4G
- Sincronização assíncrona transparente: dados pendentes são enviados quando sinal retorna
- Ranking de assiduidade por posição com alerta de escalação baseado em frequência
- Avaliação técnica por microciclo (competências 1–5, exportável em PDF)

**BaseForte — Carga e Saúde de Base**

- Registro de treino via app: tipo, intensidade RPE 1–10 (padrão FIFA), duração
- Integração opcional com Apple Watch / Google Fit via HealthKit API (hardware-agnostic)
- Cálculo automático de carga ACWR por atleta (timeseries no TimescaleDB)
- Sinalização de zona de risco de lesão: verde (< 1.3), amarelo (1.3–1.5), vermelho (> 1.5)
- Relatório semanal automático para pais/responsáveis via WhatsApp/e-mail (linguagem acessível, não técnica)
- Preparação de dados para integração com FisioBase na v2.0

**Módulo de Peneiras — Captação com LGPD**

- Formulário digital de inscrição em peneiras
- Hard stop: inscrição bloqueada sem Assinatura de Aceite Parental digital
- Coleta de consentimento com timestamp, IP e hash SHA-256 do documento
- Purge automático de dados de prospects em 24 meses (configurável)
- Eliminação completa do passivo jurídico com dados de menores sem tutela

**Controle de Acesso (Operações)**

- QR Code dinâmico via celular do staff para validar entrada de torcedores
- Elimina CAPEX de catracas biométricas físicas
- Log de acesso por evento com exportação

### Critério de Go/No-Go v1.5

- 60% dos clubes da v1.0 ativam o módulo de treino
- Treinador usa por 4 semanas consecutivas sem lembrete externo
- Pelo menos 5 pais pagando relatório premium (valida camada B2C)
- Dados de ACWR sendo gerados para ≥ 80% dos atletas ativos
- Zero incidentes de perda de dados offline (sincronização confiável)

---

## Versão 2.0 — "O Vestiário"

**Período:** Semanas 15–22 | **Módulos:** FisioBase + SAF Compliance Full + Conciliação Financeira

### Meta Estratégica

Criar o diferencial analítico que nenhum concorrente do "Missing Middle" oferece: a correlação entre carga de treino e lesão como preditor de afastamento. Simultaneamente, fechar o ciclo de compliance financeiro para SAFs — tornando o ClubOS a única plataforma que une saúde do atleta e saúde contábil do clube.

### Por que FisioBase depende da v1.5?

Sem dados de carga ACWR do TreinoOS, o FisioBase é apenas um prontuário digital glorificado. A inteligência preditiva (correlação carga × lesão) é o diferencial que justifica o preço premium e conquista o fisioterapeuta como usuário pagador independente do clube.

### Features incluídas na v2.0

**FisioBase — Saúde do Atleta**

- Prontuário esportivo simplificado: histórico de lesões, protocolos, evolução por sessão
- Status de retorno ao jogo (RTP) visível para o treinador em tempo real: Afastado / Retorno Progressivo / Liberado
- Separação de permissões: treinador vê status, nunca dados clínicos privados
- Biblioteca de protocolos baseada em evidência (FIFA Medical, entorses, distensões)
- Correlação carga × lesão integrada com BaseForte: identificação de padrões de risco
- Relatório para seguro/plano de saúde: exportação estruturada para reembolso
- Multi-clube e multi-fisio: painel único, histórico transferível com permissão do atleta
- Prontuário 100% criptografado; acesso restrito por role `PHYSIO | ADMIN`

**SAF Compliance Full (Lei 14.193/2021)**

- Painel de Transparência Institucional: publicação de balanços com hash SHA-256 imutável no audit_log
- Módulo de Passivos Trabalhistas: CRUD de credores + exportação PDF assinado
- Dashboard financeiro SAF com KPIs para acionistas e investidores
- Demonstrativo de Receitas integrado com dados de sócios + cobranças
- Conciliação bancária automática via arquivos OFX (zero intervenção manual)
- Registro de despesas do clube (P&L simplificado para tesoureiro)
- Relatório financeiro mensal exportável em PDF para diretoria

**Carteirinha Digital (Should atrasado da v1.0)**

- Carteirinha digital do sócio com QR Code validável (PWA, funciona offline)
- Benefícios configuráveis por plano exibidos na carteirinha
- Identidade digital do torcedor; incentivo ao pagamento em dia

### Critério de Go/No-Go v2.0

- Redução de recidiva de lesão documentada em ≥ 3 clubes
- Fisioterapeuta usa o sistema por 4 semanas consecutivas sem lembrete
- Pelo menos 1 clube obtém reembolso de seguro usando relatório da plataforma
- Pelo menos 3 SAFs em conformidade com a Lei 14.193/2021 via painel

---

## Versão 2.5 — "A Arquibancada"

**Período:** Semanas 23–30 | **Módulo:** ArenaPass (Bilheteria Digital)

### Meta Estratégica

Criar o motor de aquisição de sócios mais eficiente: cada torcedor que compra um ingresso entra automaticamente no funil de conversão para sócio. O ArenaPass tem menor resistência de adoção (transacional, sem mensalidade fixa para o torcedor) e maior impacto imediato — receita por jogo aumentando 40%+ vs. a caixinha manual.

### Antecipação Opcional (já na v1.0 como feature isolada)

MVP mínimo sem CRM: link PIX por evento + QR Code de validação via celular do staff. Custo de engenharia baixo; valida o modelo transacional antes da v2.5 completa.

### Features incluídas na v2.5

- Configuração de evento: data, adversário, setores, capacidade, preço por setor
- Venda via link PIX customizado por evento — torcedor recebe QR Code por WhatsApp/e-mail
- Validação de ingresso na portaria por câmera do celular (sem duplicata, funciona offline)
- Relatório de bilheteria pós-jogo: receita por setor, taxa de ocupação, no-shows
- CRM de torcedor: histórico de presença e gasto acumulado por evento
- Funil torcedor → sócio: push automático após jogo com desconto de adesão
- Patrocínio programático: empresa local destacada no QR Code de confirmação
- Notificação automática para capitão: confirmação de escala e logística 48h antes do jogo
- PDV mobile (mPOS) para lanchonete/merchandising (integração Stone ou SumUp) — fase full
- Checklist de operações de jogo: reservas, credenciamentos, logística de viagem automatizados

### Critério de Go/No-Go v2.5

- Clube aumenta receita por jogo em ≥ 40% vs. caixinha manual
- Primeiro torcedor convertido em sócio via funil ArenaPass → ClubOS
- Taxa de calote na portaria < 2% (vs. 15–20% com caixinha manual)

---

## Versão 3.0 — "A Vitrine"

**Período:** Meses 8–10 | **Módulo:** ScoutLink (Marketplace de Talentos)

### Meta Estratégica

Criar o primeiro marketplace verificado de talentos do futebol amador e semiprofissional brasileiro. A proposta de valor para o scout: perfis ricos com dados longitudinais reais (ACWR, histórico de lesões, avaliação técnica), não apenas altura, peso e vídeo editado.

### Por que ScoutLink não pode ser antecipado?

Uma vitrine vazia não retém o lado da demanda. Scouts pagam assinatura porque os perfis são ricos e verificados — isso exige mínimo 6 meses de dados contínuos do BaseForte e FisioBase em produção. Lançar antes desperdiça a única chance de primeira impressão com o lado da demanda.

### Features incluídas na v3.0

- Perfil de atleta verificado: escola/clube assina autenticidade de métricas físicas e avaliação técnica
- Histórico longitudinal exportado do BaseForte: ACWR, evolução ao longo de temporadas
- Status de saúde integrado com FisioBase (liberado/afastado — sem dados clínicos privados)
- Upload de vídeos curtos de treinos e jogos (máx. 90s, Cloudflare R2 + Stream)
- Busca filtrada para scouts: posição, faixa etária, estado, métricas mínimas, disponibilidade
- Comunicação 100% mediada pela plataforma: atleta menor NUNCA contatado diretamente
- Log imutável de toda comunicação scout–escola (compliance crítico LGPD)
- Relatório de curadoria mensal por critério específico (modelo B2B premium para scouts)
- Freemium para escolas/clubes: perfil básico gratuito; perfil premium com dados longitudinais pago

### Critério de Go/No-Go v3.0

- Primeiro contato formal scout–escola mediado pela plataforma
- ≥ 3 scouts com assinatura ativa após 60 dias
- Zero incidente de contato direto com atleta menor (compliance inviolável)
- NPS dos scouts ≥ 50 (dados percebidos como confiáveis e ricos)

---

## Versão 3.5 — "A Liga"

**Período:** Meses 11–13 | **Módulo:** CampeonatOS (Gestão de Campeonatos)

### Meta Estratégica

Ativar o efeito de rede. Quando a maioria dos clubes de uma liga já está no ClubOS, o CampeonatOS se vende sozinho: é a consequência natural da rede, não o ponto de entrada. O organizador deixa de gastar 8h/semana em planilhas para gastar ≤ 2h.

### Freemium Top-of-Funnel

Versão gratuita para ligas com até 8 times — ferramenta de exposição onde ainda não há penetração do ClubOS. O organizador convida os times; os times descobrem o produto.

### Features incluídas na v3.5

- Cadastro de times e jogadores com verificação de elegibilidade por CPF em tempo real
- Geração automática de tabela round-robin sem conflito de campo ou horário
- Escalação digital com validação de elegibilidade (Motor de Regras Esportivas)
- Súmula digital preenchida pelo árbitro no celular (offline-first)
- Controle automático de suspensões por cartão acumulado + alerta WhatsApp ao capitão
- Portal público por campeonato: URL personalizada, tabela ao vivo, artilharia, perfil de elenco
- Sistema de protesto com prazo rastreado e log imutável
- Patrocínio digital no portal público com métricas de visualização (CPM, cliques)
- Lembretes automáticos 48h antes para capitão de cada time
- Relatório final de campeonato exportável em PDF (premiação, disciplina, artilharia)

### Critério de Go/No-Go v3.5

- Campeonato completo (rodadas ida e volta) gerenciado do início ao fim pela plataforma
- Organizador reduz horas de logística por semana de 8h para ≤ 2h
- ≥ 1 patrocinador local ativo no portal público

---

## Mapa de Dependências Técnicas

Cada módulo herda dados e confiança dos anteriores. Essa sequência não é apenas estratégica — é uma restrição técnica real.

| Módulo                      | Depende de                          | Dado / Recurso Herdado                                                                                           |
| --------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| TreinoOS + BaseForte (v1.5) | ClubOS (v1.0)                       | Entidade `athlete` com identidade e vínculo (stub v1.0). A v1.5 adiciona carga e avaliação técnica sem migração. |
| Peneiras LGPD (v1.5)        | ClubOS (v1.0)                       | Schema de sócios + infraestrutura de consentimento digital                                                       |
| FisioBase (v2.0)            | BaseForte (v1.5)                    | Dados de carga ACWR por atleta. Sem eles, FisioBase é apenas prontuário sem inteligência preditiva.              |
| SAF Compliance Full (v2.0)  | ClubOS (v1.0)                       | Audit log imutável + dados financeiros completos do clube                                                        |
| ArenaPass (v2.5)            | ClubOS (v1.0)                       | Cadastro de sócios para cruzamento torcedor→sócio. Funil de conversão só funciona com ClubOS maduro.             |
| ScoutLink (v3.0)            | BaseForte (v1.5) + FisioBase (v2.0) | Mínimo 6 meses de dados longitudinais verificados. Histórico de lesões com permissão.                            |
| CampeonatOS (v3.5)          | ClubOS (v1.0) + TreinoOS (v1.5)     | Base de clubes cadastrados na plataforma. Elencos e escalações preexistentes para súmula digital.                |

---

## Modelo de Monetização por Versão

| Versão | Módulo               | Modelo                                     | Valor Estimado                           |
| ------ | -------------------- | ------------------------------------------ | ---------------------------------------- |
| v1.0   | ClubOS               | Assinatura SaaS mensal + taxa PIX 1,2%     | R$ 149–299/clube/mês                     |
| v1.5   | TreinoOS + BaseForte | Add-on por treinador ou por escola         | R$ 49/treinador ou R$ 199–499/escola/mês |
| v1.5   | BaseForte B2C        | Relatório semanal para pais                | R$ 19/atleta/mês (pai paga)              |
| v2.0   | FisioBase            | Assinatura por fisioterapeuta ou por clube | R$ 79–149/fisio ou R$ 199/clube/mês      |
| v2.0   | SAF Compliance       | Add-on para SAFs                           | R$ 299/clube/mês                         |
| v2.5   | ArenaPass            | Pay-per-ingresso + assinatura              | R$ 1,50/ingresso ou R$ 99/mês            |
| v3.0   | ScoutLink            | Assinatura scout + freemium escola         | R$ 299/scout/mês                         |
| v3.5   | CampeonatOS          | Por campeonato ou assinatura liga          | R$ 299–699/evento ou R$ 299/liga/mês     |

**Receita potencial por clube maduro (v3.5):** R$ 600–1.100/mês em stack completo.

---

## Métricas-Âncora por Módulo

Duas métricas por módulo: produto (está sendo usado como ferramenta?) e negócio (está gerando valor real?).

| Módulo      | Métrica de Produto                                            | Métrica de Negócio                              |
| ----------- | ------------------------------------------------------------- | ----------------------------------------------- |
| ClubOS      | Cobrança PIX gerada para 100% dos sócios ativos no mês        | Inadimplência ↓25% vs. pré-adoção               |
| TreinoOS    | ≥ 2 sessões planejadas/semana por treinador ativo             | 60% dos clubes v1.0 com módulo ativo            |
| BaseForte   | ≥ 80% dos atletas com carga ACWR calculada e atualizada       | ≥ 5 pais pagando relatório premium              |
| FisioBase   | ≥ 80% dos atletas afastados com protocolo de retorno definido | Redução de recidiva documentada em 3+ clubes    |
| ArenaPass   | 100% dos ingressos do jogo vendidos digitalmente              | Receita por jogo ≥ 40% acima da caixinha manual |
| ScoutLink   | ≥ 3 scouts com buscas ativas semanalmente                     | ≥ 1 contato formal scout–escola/mês             |
| CampeonatOS | Organizador usa plataforma para ≥ 90% das ações de logística  | 1 campeonato completo + 1 patrocinador ativo    |

---

## Riscos Críticos e Mitigações

### Riscos de Produto e Execução

| Risco                                               | Gravidade | Mitigação                                                                                             |
| --------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| Conectividade no campo                              | 🔴 Alta   | Offline-First obrigatório em v1.5: IndexedDB + Service Workers + Background Sync                      |
| LGPD — dados de menores sem consentimento           | 🔴 Alta   | Hard stop no sistema de peneiras; criptografia; purge automático 24 meses; aceite parental digital    |
| Escalação irregular BID/CBF                         | 🔴 Alta   | Motor de Regras parametrizável; alertas 48h antes do jogo; validação em tempo real                    |
| Churn por gateway indisponível                      | 🔴 Alta   | Multi-Acquiring (M11) com fallback silencioso Asaas → Pagarme → PIX estático do clube                 |
| v1.0 não valida: inadimplência não cai o suficiente | 🔴 Alta   | Piloto com 3 clubes antes de escalar. Critério de go/no-go claro: ≥ 20% de redução                    |
| TreinoOS não vira hábito                            | 🔴 Alta   | Métrica: ≥ 2 sessões/semana. Se não atingir em 30 dias, revisar onboarding antes de escalar           |
| ScoutLink lança com perfis rasos                    | 🔴 Alta   | Não lançar antes de 6 meses de BaseForte em produção; curadoria manual nos primeiros 90 dias          |
| CampeonatOS lança sem massa crítica                 | 🔴 Alta   | Iniciar com ligas onde ClubOS tem ≥ 70% de penetração; freemium como top-of-funnel                    |
| Time fragmenta atenção prematuramente               | 🟡 Média  | Regra de go/no-go inviolável — um módulo por vez                                                      |
| Schema-per-tenant escala até ~1.000 clubes          | 🟡 Média  | Planejar análise de migração para RLS ao atingir 300 clubes ativos                                    |
| WhatsApp bloqueia número por envio massivo          | 🟡 Média  | Rate limit 30 msg/min (Lua Redis) ✅; fallback e-mail ✅; sender rotation planejado para v2.0         |
| SSE não escala em múltiplos processos               | 🟢 Baixa  | Substituir `EventEmitter` por Redis `PUBLISH/SUBSCRIBE`; interface de `sse-bus.ts` permanece idêntica |
| Bundle leak entre `(marketing)` e `(app)`           | 🟢 Baixa  | Regra aplicada — validar com bundle analyzer antes de ir para produção                                |

---

## Próximos Passos (v1.0)

### Backend (apps/api) — itens restantes do MUST

1. **M9 — Stub de atletas:** criar módulo `src/modules/athletes/` com schema Prisma, rota `GET/POST/PUT /api/athletes`, campos mínimos (`name`, `cpf`, `birthDate`, `position`, `status`, `clubId`). Provisionar tabela `athletes` no DDL tenant em `lib/tenant-schema.ts`. Criar entrada de `AuditLog` nas operações de escrita. Estimativa: ~1.5 dias.
2. **M10 — Contratos e BID/CBF:** schema `contracts` + Motor de Regras Esportivas (JSONB parametrizável) + alertas de vencimento + validação de escalação. Estimativa: ~2 dias.
3. **M11 — Multi-Acquiring:** implementar `PagarmeGateway` e `StripeGateway` (PIX Brasil + base para internacional), adicionar lógica de fallback em `GatewayRegistry.forMethod()` (Asaas → Pagarme → Stripe → PIX estático), configurar `STRIPE_ENABLED` como feature flag, adicionar `pixKeyFallback` no onboarding. Estimativa: ~3 dias.

### Frontend (apps/web) — itens pendentes do MUST

4. **M3 — Tela de cobranças:** CRUD de cobranças PIX, exibição de QR Code, status por sócio. Backend Asaas plenamente integrado. Estimativa: ~3 dias.
5. **M2 — Importação CSV:** adicionar fluxo de upload na `MembersPage` (endpoint `POST /api/members/import` já disponível; template em `GET /api/members/import/template`). Estimativa: ~1 dia.
6. **M6 — Job D-0:** worker automático "vencimento hoje" (cron). Estimativa: ~0.5 dia.
7. **M9/M10 — Atletas e Contratos:** rotas `/athletes` e `/contracts`, telas básicas de listagem/cadastro, entradas na sidebar (aguardam backend).

### Backend — itens SHOULD restantes

8. **S7 — Histórico de pagamentos:** endpoint `GET /api/members/:memberId/payments` listando `payments` joinado com `charges`. O dado já existe no banco; falta apenas a rota.
9. **S8 — Templates (UI):** tela de configuração de templates WhatsApp/e-mail (endpoints `GET/PUT/DELETE /api/templates/:key` já disponíveis).
