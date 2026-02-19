+-----------------------------------------------------------------------+
| **ClubOS**                                                            |
|                                                                       |
| Sistema Operacional para Clubes de Futebol                            |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **FASE 2 --- DEFINIÇÃO E ARQUITETURA**                                |
|                                                                       |
| Semanas 2 e 3 \| Módulo ClubOS v1.0 \| Gestão Financeira & Sócios     |
+-----------------------------------------------------------------------+

+---------------------------------------------------------------------------------------------------+
| **Conteúdo deste documento**                                                                      |
|                                                                                                   |
| 1\. Design Doc (RFC) · 2. Guidelines de Desenvolvimento · 3. Escopo MoSCoW · 4. Backlog Detalhado |
+---------------------------------------------------------------------------------------------------+

  -----------------------------------------------------------------------
  **1 DESIGN DOC (RFC) --- Request for Comments**

  -----------------------------------------------------------------------

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  📋 Este documento é vivo. Qualquer membro do time pode comentar e questionar. As decisões técnicas aqui registradas só se tornam definitivas após revisão de 48h sem objeção.

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**1.1 Visão Técnica e Objetivos do Módulo**

O ClubOS v1.0 é um SaaS multi-tenant voltado exclusivamente para clubes de futebol amador e semiprofissional no Brasil. Seu objetivo técnico central é processar cobranças recorrentes via Pix, manter um cadastro confiável de sócios e gerar alertas de inadimplência com zero intervenção manual do operador do clube.

Três princípios guiam todas as decisões de arquitetura desta versão:

-   Simplicidade operacional: o sistema deve funcionar em celular Android 4G sem treinamento formal.

-   Confiabilidade financeira: falhas no fluxo de cobrança custam dinheiro real ao clube. Disponibilidade \> 99,5%.

-   Velocidade de entrega: arquitetura que permita um MVP funcional em 30 dias por um time pequeno (1--2 devs).

**1.2 Stack Tecnológica**

**Front-end**

  ------------------------------------------------------------------------------------------------------------------------------
  **Tecnologia**           **Versão-alvo**   **Justificativa**
  ------------------------ ----------------- -----------------------------------------------------------------------------------
  Next.js                  14 (App Router)   SSR nativo, bom SEO para portal de sócios público, ecossistema React maduro

  TypeScript               5.x               Tipagem evita bugs de runtime em fluxos financeiros críticos

  Tailwind CSS             3.x               Velocidade de UI sem CSS custom; tokens de design via config

  shadcn/ui                latest            Componentes acessíveis, sem dependência pesada; copia código no repo

  React Query (TanStack)   5.x               Cache e sincronização de estado servidor --- elimina boilerplate de loading/error

  React Hook Form + Zod    latest            Validação de formulários financeiros no client antes de bater na API
  ------------------------------------------------------------------------------------------------------------------------------

**Back-end**

  --------------------------------------------------------------------------------------------------------------------------------------------
  **Tecnologia**         **Versão-alvo**           **Justificativa**
  ---------------------- ------------------------- -------------------------------------------------------------------------------------------
  Node.js + Fastify      Node 20 LTS / Fastify 4   Performance superior ao Express; schema validation nativo via JSON Schema

  TypeScript             5.x                       Consistência full-stack; tipos compartilhados entre front e back

  Prisma ORM             5.x                       Migrations versionadas, type-safe queries, suporte a multi-tenant com row-level isolation

  Zod                    3.x                       Validação de payloads na entrada da API; compartilhado com front-end

  BullMQ + Redis         latest                    Filas de jobs assíncronos para cobranças recorrentes, envio de WhatsApp e relatórios

  JWT + Refresh Tokens   ---                       Auth stateless; refresh token rotativo em httpOnly cookie
  --------------------------------------------------------------------------------------------------------------------------------------------

**Banco de Dados**

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Tecnologia**     **Justificativa detalhada**
  ------------------ -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  PostgreSQL 15      Banco principal. ACID completo para transações financeiras. JSONB para dados dinâmicos de planos. Row-Level Security (RLS) para multi-tenancy. Histórico nativo com triggers.

  Redis 7            Cache de sessão, filas BullMQ, rate limiting por clube, pub/sub de notificações em tempo real no dashboard.
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Infraestrutura e Deploy**

  -----------------------------------------------------------------------------------------------------------------
  **Componente**           **Serviço / Ferramenta**      **Observação**
  ------------------------ ----------------------------- ----------------------------------------------------------
  Hospedagem API + Front   Railway ou Render (PaaS)      Deploy via Git push; sem DevOps dedicado no MVP

  Banco de Dados           Supabase (Postgres managed)   Conexão pooling, backups automáticos, painel de consulta

  CDN / Assets             Cloudflare                    Free tier cobre 100% do MVP

  Monitoramento            Sentry + Logtail              Error tracking em prod; logs estruturados

  CI/CD                    GitHub Actions                Pipeline: lint → test → build → deploy em push para main

  Secrets                  Railway Env Vars / .env       Nunca comitar .env; template .env.example no repo
  -----------------------------------------------------------------------------------------------------------------

**1.3 Integrações Externas**

**Pix --- Cobrança Recorrente**

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Aspecto**           **Decisão**                                                    **Detalhe**
  --------------------- -------------------------------------------------------------- --------------------------------------------------------------------------------
  PSP escolhido         Asaas (principal) + Efí Bank (fallback)                        Asaas tem SDK Node.js maduro, suporte a Pix com webhook. Efí como redundância.

  Modelo de cobrança    Pix com vencimento (cob) + QR Code estático para PDV           API Open Banking do BC; webhook de confirmação em \<5s

  Split de receita      Asaas Marketplace: 1,5% por transação retido automaticamente   ClubOS retém a taxa antes de repassar ao clube

  Tratamento de falha   Retry com backoff exponencial (3 tentativas em 24h)            Falha persiste no banco com status PENDING_RETRY

  Conformidade          Webhooks com HMAC-SHA256; validar assinatura em todo request   Rejeitar payload sem header X-Asaas-Signature válida
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

**WhatsApp --- Régua de Cobrança**

  --------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Aspecto**             **Decisão**                             **Detalhe**
  ----------------------- --------------------------------------- ----------------------------------------------------------------------------------------------
  Provider escolhido      Z-API ou Evolution API (self-hosted)    Custo menor que Meta Business API para o volume do MVP; troca fácil por abstração de serviço

  Templates de mensagem   3 templates por padrão: D-3, D-0, D+3   Lembrete pré-vencimento, aviso de vencimento, cobrança de inadimplência

  Rate limiting           Máximo 30 mensagens/minuto por clube    Evitar bloqueio do número pelo WhatsApp

  Fallback                E-mail via Resend se WhatsApp falhar    Resend tem free tier de 3k e-mails/mês
  --------------------------------------------------------------------------------------------------------------------------------------------------------------

**Arquitetura de Multi-Tenancy**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  🏗 Cada clube é um tenant isolado. A estratégia adotada é Schema-per-tenant no PostgreSQL para o MVP: cada clube tem seu próprio schema (ex: clube_1234). Isso garante isolamento total de dados sem complexidade de Row-Level Security no código da aplicação.

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

+-----------------------------------------------------------------------+
| // Estrutura de schemas no PostgreSQL                                 |
|                                                                       |
| public.clubs \-- cadastro master de clubes (tenant registry)          |
|                                                                       |
| public.users \-- usuários globais (auth)                              |
|                                                                       |
| clube\_{id}.members \-- sócios do clube                               |
|                                                                       |
| clube\_{id}.plans \-- planos de sócio configuráveis                   |
|                                                                       |
| clube\_{id}.charges \-- cobranças geradas                             |
|                                                                       |
| clube\_{id}.payments \-- pagamentos confirmados                       |
|                                                                       |
| clube\_{id}.messages \-- log de WhatsApp/e-mail                       |
|                                                                       |
| clube\_{id}.audit_log \-- histórico de ações (compliance)             |
+-----------------------------------------------------------------------+

**Modelo de Dados --- Entidades Principais**

  ---------------------------------------------------------------------------------------------------------------------------------------------------
  **Entidade**   **Campos-chave**                                            **Relacionamentos**    **Observação**
  -------------- ----------------------------------------------------------- ---------------------- -------------------------------------------------
  clubs          id, slug, name, plan_tier, created_at                       1:N members, plans     Tenant root; slug usado na URL e no schema PG

  members        id, name, cpf, phone, email, status, joined_at              N:1 clubs, N:M plans   CPF usado para idempotência de cobrança Pix

  plans          id, name, price_cents, interval, benefits                   N:M members            interval: monthly \| quarterly \| annual

  charges        id, member_id, amount_cents, due_date, status, pix_cob_id   N:1 members            status: PENDING \| PAID \| OVERDUE \| CANCELLED

  payments       id, charge_id, paid_at, method, gateway_txid                1:1 charges            Criado via webhook do PSP; imutável

  messages       id, member_id, channel, template, sent_at, status           N:1 members            Auditoria de toda régua de cobrança
  ---------------------------------------------------------------------------------------------------------------------------------------------------

**Diagrama de Fluxo --- Ciclo de Cobrança**

+-----------------------------------------------------------------------+
| \[Job Scheduler --- BullMQ / Cron\]                                   |
|                                                                       |
| \|                                                                    |
|                                                                       |
| \| D-3 antes do vencimento                                            |
|                                                                       |
| ▼                                                                     |
|                                                                       |
| \[Gerar Cobrança Pix (Asaas API)\]                                    |
|                                                                       |
| \|                                                                    |
|                                                                       |
| \|── Sucesso ──▶ Salva charge com status PENDING + pix_cob_id         |
|                                                                       |
| \| Envia WhatsApp template \'lembrete\'                               |
|                                                                       |
| \|                                                                    |
|                                                                       |
| \|── Falha ────▶ Retry fila (3x, backoff 1h / 6h / 24h)               |
|                                                                       |
| Se falhar 3x → status PENDING_RETRY + alerta no dashboard             |
|                                                                       |
| \[Webhook PSP --- Pix confirmado\]                                    |
|                                                                       |
| \|                                                                    |
|                                                                       |
| ▼                                                                     |
|                                                                       |
| Valida assinatura HMAC-SHA256                                         |
|                                                                       |
| \|                                                                    |
|                                                                       |
| ▼                                                                     |
|                                                                       |
| Cria registro em payments                                             |
|                                                                       |
| Atualiza charge.status = PAID                                         |
|                                                                       |
| Atualiza member.status = ACTIVE                                       |
|                                                                       |
| Dispara evento para dashboard (Redis pub/sub)                         |
+-----------------------------------------------------------------------+

  -----------------------------------------------------------------------
  **2 GUIDELINES DE DESENVOLVIMENTO**

  -----------------------------------------------------------------------

**2.1 Style Guide de Código**

**Convenções Gerais**

  ----------------------------------------------------------------------------------------------------------------
  **Categoria**       **Regra**
  ------------------- --------------------------------------------------------------------------------------------
  Idioma do código    Inglês para tudo: variáveis, funções, comentários, commits, branches, PRs

  Idioma do produto   Português para strings de UI, mensagens de erro exibidas ao usuário, templates de WhatsApp

  Formatação          Prettier com config padrão (printWidth: 100, singleQuote: true, semi: true)

  Linting             ESLint + plugin TypeScript + plugin import. Zero warnings permitidos em CI.

  Tipagem             Strict mode no tsconfig. Proibido: any explícito, \@ts-ignore sem comentário explicando.

  Testes              Vitest para unit/integration. Playwright para E2E críticos (fluxo de cobrança, login).

  Cobertura mínima    ≥ 80% em módulos de domínio financeiro (charges, payments, webhooks).
  ----------------------------------------------------------------------------------------------------------------

**Nomenclatura**

  -------------------------------------------------------------------------------------------------------
  **Contexto**                   **Padrão**                **Exemplo**
  ------------------------------ ------------------------- ----------------------------------------------
  Variáveis / Funções            camelCase                 generatePixCharge, memberStatus

  Classes / Tipos / Interfaces   PascalCase                ChargeService, MemberStatus, CreateChargeDto

  Constantes                     SCREAMING_SNAKE_CASE      MAX_RETRY_ATTEMPTS, PIX_WEBHOOK_SECRET

  Arquivos de componente         PascalCase                MemberCard.tsx, ChargeTable.tsx

  Arquivos de service/util       kebab-case                charge-service.ts, format-currency.ts

  Rotas de API                   REST kebab-case, plural   GET /api/members, POST /api/charges

  Variáveis de ambiente          SCREAMING_SNAKE_CASE      DATABASE_URL, ASAAS_API_KEY
  -------------------------------------------------------------------------------------------------------

**Estrutura de Pastas --- Monorepo**

+-----------------------------------------------------------------------+
| clubos/                                                               |
|                                                                       |
| ├── apps/                                                             |
|                                                                       |
| │ ├── web/ \# Next.js front-end                                       |
|                                                                       |
| │ │ ├── app/ \# App Router (pages, layouts)                           |
|                                                                       |
| │ │ ├── components/ \# UI reutilizável                                |
|                                                                       |
| │ │ ├── lib/ \# utils, hooks, clients                                 |
|                                                                       |
| │ │ └── types/ \# tipos compartilhados                                |
|                                                                       |
| │ └── api/ \# Fastify back-end                                        |
|                                                                       |
| │ ├── modules/ \# feature modules (members, charges, plans\...)       |
|                                                                       |
| │ │ └── charges/                                                      |
|                                                                       |
| │ │ ├── charges.routes.ts                                             |
|                                                                       |
| │ │ ├── charges.service.ts                                            |
|                                                                       |
| │ │ ├── charges.schema.ts \# Zod schemas                              |
|                                                                       |
| │ │ └── charges.test.ts                                               |
|                                                                       |
| │ ├── jobs/ \# BullMQ workers                                         |
|                                                                       |
| │ ├── webhooks/ \# handlers de PSP e WhatsApp                         |
|                                                                       |
| │ └── prisma/ \# schema.prisma + migrations                           |
|                                                                       |
| ├── packages/                                                         |
|                                                                       |
| │ ├── shared-types/ \# tipos TypeScript compartilhados                |
|                                                                       |
| │ └── config/ \# tsconfig, eslint, prettier bases                     |
|                                                                       |
| └── turbo.json \# Turborepo pipeline                                  |
+-----------------------------------------------------------------------+

**2.2 Fluxo de Git**

**Estratégia de Branches**

  -----------------------------------------------------------------------------------------------------
  **Branch**      **Propósito**           **Regras**
  --------------- ----------------------- -------------------------------------------------------------
  main            Código em produção      Protegida. Merge apenas via PR aprovado. Deploy automático.

  develop         Integração contínua     Base para feature branches. Deploy automático em staging.

  feature/XYZ     Nova funcionalidade     Sempre a partir de develop. Nome: feature/TICKET-descricao

  fix/XYZ         Correção de bug         A partir de develop (ou main em hotfix crítico)

  release/X.Y     Preparação de release   A partir de develop; merge em main + tag semântica
  -----------------------------------------------------------------------------------------------------

**Padrão de Commits --- Conventional Commits**

+-----------------------------------------------------------------------+
| \# Formato                                                            |
|                                                                       |
| \<type\>(\<scope\>): \<description\>                                  |
|                                                                       |
| \# Tipos válidos                                                      |
|                                                                       |
| feat → nova feature                                                   |
|                                                                       |
| fix → correção de bug                                                 |
|                                                                       |
| docs → documentação                                                   |
|                                                                       |
| style → formatação (sem mudança de lógica)                            |
|                                                                       |
| refactor → refatoração sem nova feature nem fix                       |
|                                                                       |
| test → adição/ajuste de testes                                        |
|                                                                       |
| chore → build, deps, CI                                               |
|                                                                       |
| \# Exemplos                                                           |
|                                                                       |
| feat(charges): add pix webhook handler with HMAC validation           |
|                                                                       |
| fix(members): correct overdue status calculation on timezone edge     |
|                                                                       |
| feat(whatsapp): add D-3 reminder job with rate limiting               |
|                                                                       |
| chore(ci): add vitest coverage threshold to github actions            |
+-----------------------------------------------------------------------+

**Processo de Pull Request**

-   **Regra 1:** Branch target: sempre develop (exceto hotfix crítico em prod).

-   **Regra 2:** PR description deve incluir: contexto do problema, solução implementada, como testar, screenshots (se UI).

-   **Regra 3:** Checklist obrigatório: \[ \] Testes passando \[ \] Sem any explícito \[ \] .env.example atualizado se nova variável.

-   **Regra 4:** Mínimo 1 aprovação para merge. Em código financeiro (charges, payments, webhooks): mínimo 2 aprovações.

-   **Regra 5:** PR aberto por \> 48h sem revisão: pingar revisor no canal do time.

**2.3 Ferramentas de Comunicação e Processo**

  -----------------------------------------------------------------------------------------------------------------
  **Ferramenta**    **Uso**                       **Canal / Convenção**
  ----------------- ----------------------------- -----------------------------------------------------------------
  Linear            Gestão de tarefas e backlog   Projeto ClubOS v1.0. Labels: feat / bug / debt / discovery

  Slack / Discord   Comunicação do time           #geral, #dev, #produto, #alertas-prod (apenas bots)

  Notion            Documentação e RFCs           Design Docs, notas de entrevistas, decisões de arquitetura

  Figma             Design de UI                  Componentes em arquivo compartilhado; dev mode ativo

  GitHub            Código, PRs, Issues           Repo privado. Issues linkadas às tasks do Linear via integração

  Loom              Demo assíncrona               Gravar demo de feature antes do PR para revisão visual rápida
  -----------------------------------------------------------------------------------------------------------------

**Cadência de Rituais (time de 1--3 pessoas)**

  --------------------------------------------------------------------------------------------------------------
  **Ritual**               **Frequência**   **Formato e Objetivo**
  ------------------------ ---------------- --------------------------------------------------------------------
  Daily assíncrona         Diária (async)   Post no Slack/Discord: O que fiz / O que farei / Bloqueios

  Review de Sprint         Quinzenal        Demo do que foi entregue; atualizar status das hipóteses da Fase 1

  Refinamento de Backlog   Semanal          Quebrar tasks grandes, revisar prioridades, estimar esforço

  Retrospectiva            Quinzenal        O que funcionou / O que melhorar / Uma ação concreta

  Incidente prod           Ad-hoc           Post-mortem escrito em Notion em até 24h após resolução
  --------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **3 ESCOPO MoSCoW --- MVP v1.0**

  -----------------------------------------------------------------------

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  🎯 O MVP tem 30 dias de janela. Tudo que não couber nesta janela vai para o \'Fase 2\'. O critério não é importância --- é dependência crítica para validar a hipótese principal: o ClubOS reduz inadimplência em ≥25% em 60 dias.

  ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**3.1 MUST HAVE --- Obrigatório no MVP**

Sem estas features, o produto não consegue ser vendido nem validar sua proposta de valor central.

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **\#**   **Feature**                                                          **Critério de Aceite**                                        **Complexidade**
  -------- -------------------------------------------------------------------- ------------------------------------------------------------- -----------------------
  **M1**   Cadastro de clube (onboarding) com configuração de planos de sócio   Clube configura nome, logo, plano e valor em \<5 min          Média --- 3 dias

  **M2**   Importação / cadastro manual de sócios (CSV ou formulário)           200 sócios importados sem erro em \<10 min                    Média --- 2 dias

  **M3**   Geração de cobranças Pix com QR Code por sócio                       Pix gerado e enviado em \<30s por sócio                       Alta --- 4 dias

  **M4**   Webhook de confirmação de pagamento Pix (Asaas)                      Status do sócio atualiza em \<10s após pagamento              Alta --- 3 dias

  **M5**   Dashboard de inadimplência em tempo real                             Exibe total de adimplentes, inadimplentes e valor a receber   Média --- 2 dias

  **M6**   Régua de cobrança via WhatsApp: D-3, D-0, D+3                        Mensagem enviada automaticamente nos 3 marcos                 Alta --- 4 dias

  **M7**   Autenticação segura (email/senha + refresh token)                    Login funciona; sessão expira em 7 dias; 2FA opcional         Baixa --- 1 dia

  **M8**   Controle de acesso por papel: Admin do clube / Tesoureiro            Tesoureiro não consegue apagar sócio; Admin sim               Baixa --- 1 dia
  -------------------------------------------------------------------------------------------------------------------------------------------------------------------

**3.2 SHOULD HAVE --- Alta Prioridade, mas não bloqueia launch**

Estas features aumentam significativamente o valor percebido. Entram no MVP se o tempo permitir, ou na semana 5 imediatamente após validação.

  -----------------------------------------------------------------------------------------------------------------------------------
  **\#**   **Feature**                                        **Justificativa**
  -------- -------------------------------------------------- -----------------------------------------------------------------------
  S1       Carteirinha digital do sócio com QR Code (PWA)     Identidade digital; motiva o sócio a manter o pagamento em dia

  S2       Relatório financeiro mensal exportável em PDF      Prestação de contas para diretoria; pedido recorrente nas entrevistas

  S3       Registro de despesas do clube (P&L simplificado)   Completa a visão financeira; tesoureiro consegue ver saldo real

  S4       Histórico de pagamentos por sócio                  Suporte a disputas; sócio pode consultar o próprio histórico

  S5       Notificações in-app para novos pagamentos          Feedback imediato ao tesoureiro sem precisar abrir o dashboard
  -----------------------------------------------------------------------------------------------------------------------------------

**3.3 COULD HAVE --- Desejável, entra na Fase 2**

Bom de ter, mas nenhum clube vai cancelar por falta dessas features no dia 1. Ficam para iterações pós-validação.

  -------------------------------------------------------------------------------------------------------------------
  **\#**   **Feature**                                  **Quando entra**
  -------- -------------------------------------------- -------------------------------------------------------------
  C1       Portal de votações internas (AGO/AGE)        Fase 2 --- módulo de engajamento

  C2       Cobrança por boleto como fallback ao Pix     Fase 2 --- ampliar cobertura para sócios sem conta corrente

  C3       App mobile nativo (iOS/Android)              Fase 3 --- PWA resolve o MVP sem custo de loja

  C4       Multi-idioma (espanhol/inglês)               Fase 4 --- expansão internacional

  C5       Integração contábil (exportação SPED/NFSe)   Fase 2 --- clubes semiprofissionais formalizados
  -------------------------------------------------------------------------------------------------------------------

**3.4 WON\'T HAVE --- Explicitamente fora do MVP**

Documentar o que NÃO será feito é tão importante quanto o que será. Qualquer solicitação dessas funcionalidades durante o MVP deve ser redirecionada para o roadmap futuro.

  -------------------------------------------------------------------------------------------------------------
  **\#**   **O que NÃO entra**                         **Por quê**
  -------- ------------------------------------------- --------------------------------------------------------
  W1       Integração com ArenaPass (bilheteria)       Módulo v1.5 --- depende de v1.0 estável e validado

  W2       Gestão de atletas / TreinoOS                Módulo v2.0 --- escopo completamente diferente

  W3       API pública para integrações de terceiros   Risco de segurança e suporte sem volume suficiente

  W4       Painel white-label para federações          B2B enterprise --- complexidade desproporcional ao MVP

  W5       IA generativa para análise financeira       Custo de infra e complexidade sem ROI validado ainda
  -------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **4 BACKLOG DETALHADO**

  -----------------------------------------------------------------------

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  📝 O backlog segue o formato User Story + Tasks técnicas granulares. Cada task deve caber em 1 dia de trabalho de 1 desenvolvedor. Tasks maiores devem ser quebradas.

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

**4.1 Épico: Onboarding e Autenticação**

**US-01 --- Cadastro do Clube**

Como presidente de clube, quero criar uma conta e configurar meu clube em menos de 5 minutos, para começar a usar o sistema sem precisar de suporte.

  -------------------------------------------------------------------------------------------------------------------------
  **ID**   **Task Técnica**                                                         **Esforço**   **Status**   **Sprint**
  -------- ------------------------------------------------------------------------ ------------- ------------ ------------
  T-001    Criar schema de banco clube\_{id} via Prisma migration ao onboarding     1d            Backlog      S1

  T-002    Endpoint POST /api/clubs com validação Zod (name, slug, cnpj opcional)   0.5d          Backlog      S1

  T-003    Tela de onboarding multi-step: Dados do clube → Logo → Confirmação       1d            Backlog      S1

  T-004    Upload de logo com resize automático (sharp) para 200x200px WebP         0.5d          Backlog      S1

  T-005    E-mail de boas-vindas via Resend após criação do clube                   0.5d          Backlog      S1
  -------------------------------------------------------------------------------------------------------------------------

**US-02 --- Autenticação**

Como tesoureiro do clube, quero fazer login de forma segura, para que nenhuma pessoa de fora acesse os dados financeiros.

  -------------------------------------------------------------------------------------------------------------------------------------
  **ID**   **Task Técnica**                                                                     **Esforço**   **Status**   **Sprint**
  -------- ------------------------------------------------------------------------------------ ------------- ------------ ------------
  T-006    Implementar JWT access token (15min) + refresh token (7d) em httpOnly cookie         1d            Backlog      S1

  T-007    Endpoint POST /api/auth/login, /refresh e /logout                                    0.5d          Backlog      S1

  T-008    Tela de login responsiva com React Hook Form + Zod client-side                       0.5d          Backlog      S1

  T-009    Middleware de autenticação no Fastify (verificar JWT em todas as rotas protegidas)   0.5d          Backlog      S1

  T-010    RBAC: roles ADMIN e TREASURER com guard por rota                                     1d            Backlog      S1
  -------------------------------------------------------------------------------------------------------------------------------------

**4.2 Épico: Gestão de Sócios**

**US-03 --- Cadastro e Importação de Sócios**

Como tesoureiro, quero importar minha lista atual de sócios via CSV ou cadastrar manualmente, para não precisar redigitar todos os dados do zero.

  --------------------------------------------------------------------------------------------------------------------------------------
  **ID**   **Task Técnica**                                                                      **Esforço**   **Status**   **Sprint**
  -------- ------------------------------------------------------------------------------------- ------------- ------------ ------------
  T-011    Endpoint POST /api/members com Zod schema (name, cpf, phone, email, plan_id)          0.5d          Backlog      S1

  T-012    Parser de CSV com papaparse: validar colunas obrigatórias, reportar linhas com erro   1d            Backlog      S1

  T-013    Bulk insert com upsert por CPF (idempotência em reimportações)                        0.5d          Backlog      S1

  T-014    Tela de listagem de sócios com busca, filtro por status e paginação                   1d            Backlog      S1

  T-015    Tela de cadastro/edição individual de sócio com seleção de plano                      0.5d          Backlog      S1

  T-016    Template CSV de exemplo para download na tela de importação                           0.25d         Backlog      S1
  --------------------------------------------------------------------------------------------------------------------------------------

**4.3 Épico: Planos e Cobranças**

**US-04 --- Configuração de Planos**

Como admin do clube, quero criar planos de sócio com preços e benefícios diferentes, para atender sócios de perfis variados.

  ------------------------------------------------------------------------------------------------------------------------
  **ID**   **Task Técnica**                                                        **Esforço**   **Status**   **Sprint**
  -------- ----------------------------------------------------------------------- ------------- ------------ ------------
  T-017    CRUD de planos: POST/GET/PUT/DELETE /api/plans                          0.5d          Backlog      S1

  T-018    Tela de gerenciamento de planos com preview de preço formatado (BRL)    0.5d          Backlog      S1

  T-019    Validação: clube deve ter ao menos 1 plano ativo para gerar cobranças   0.25d         Backlog      S1
  ------------------------------------------------------------------------------------------------------------------------

**US-05 --- Geração de Cobranças Pix**

Como tesoureiro, quero que o sistema gere automaticamente uma cobrança Pix para cada sócio no início do mês, para não precisar fazer isso manualmente.

  --------------------------------------------------------------------------------------------------------------------------------------
  **ID**   **Task Técnica**                                                                      **Esforço**   **Status**   **Sprint**
  -------- ------------------------------------------------------------------------------------- ------------- ------------ ------------
  T-020    Service ChargeService.generateMonthly(): busca sócios ativos e cria charges           1d            Backlog      S2

  T-021    Integração Asaas: POST /v3/payments com dados do sócio + valor do plano               1d            Backlog      S2

  T-022    Salvar pix_cob_id e qr_code_image na tabela charges                                   0.5d          Backlog      S2

  T-023    Job BullMQ: disparar geração de cobranças todo dia 1 às 08h (cron)                    0.5d          Backlog      S2

  T-024    Tratamento de falha: retry 3x com backoff; setar status PENDING_RETRY após exaustão   1d            Backlog      S2

  T-025    Endpoint manual POST /api/charges/generate para tesoureiro disparar fora do cron      0.5d          Backlog      S2
  --------------------------------------------------------------------------------------------------------------------------------------

**US-06 --- Webhook de Pagamento**

Como sistema, quero receber confirmação de pagamento do PSP em tempo real, para atualizar o status do sócio automaticamente sem intervenção humana.

  --------------------------------------------------------------------------------------------------------------------------------------
  **ID**   **Task Técnica**                                                                      **Esforço**   **Status**   **Sprint**
  -------- ------------------------------------------------------------------------------------- ------------- ------------ ------------
  T-026    Endpoint POST /webhooks/asaas com validação HMAC-SHA256 do header X-Asaas-Signature   1d            Backlog      S2

  T-027    Handler para evento PAYMENT_RECEIVED: cria payments, atualiza charge e member         1d            Backlog      S2

  T-028    Idempotência: checar se gateway_txid já existe antes de processar                     0.5d          Backlog      S2

  T-029    Responder HTTP 200 imediatamente; processar lógica em job BullMQ assíncrono           0.5d          Backlog      S2

  T-030    Teste de integração: simular payload Asaas com assinatura válida e inválida           0.5d          Backlog      S2
  --------------------------------------------------------------------------------------------------------------------------------------

**4.4 Épico: Régua de Cobrança**

**US-07 --- Mensagens Automáticas via WhatsApp**

Como tesoureiro, quero que o sistema envie mensagens automáticas de cobrança no WhatsApp, para não precisar copiar e colar mensagens manualmente para cada sócio.

  -----------------------------------------------------------------------------------------------------------------------------------------------
  **ID**   **Task Técnica**                                                                               **Esforço**   **Status**   **Sprint**
  -------- ---------------------------------------------------------------------------------------------- ------------- ------------ ------------
  T-031    Service WhatsAppService com abstração do provider (Z-API ou Evolution API)                     1d            Backlog      S2

  T-032    Templates configuráveis por clube (D-3, D-0, D+3) com variáveis: {nome}, {valor}, {pix_link}   0.5d          Backlog      S2

  T-033    Job D-3: buscar charges com due_date = hoje+3; disparar lembrete                               0.5d          Backlog      S2

  T-034    Job D+3: buscar charges OVERDUE há 3 dias; disparar cobrança                                   0.5d          Backlog      S2

  T-035    Rate limiter: max 30 msgs/min por clube usando Redis sliding window                            0.5d          Backlog      S2

  T-036    Fallback: se WhatsApp falhar após 2 tentativas, enviar e-mail via Resend                       0.5d          Backlog      S3

  T-037    Log de todas as mensagens enviadas na tabela messages (auditoria)                              0.25d         Backlog      S2
  -----------------------------------------------------------------------------------------------------------------------------------------------

**4.5 Épico: Dashboard e Relatórios**

**US-08 --- Dashboard de Inadimplência**

Como presidente do clube, quero ver em tempo real quantos sócios estão adimplentes, quantos estão em atraso e quanto tenho a receber, sem precisar abrir uma planilha.

  -----------------------------------------------------------------------------------------------------------------------------------------
  **ID**   **Task Técnica**                                                                         **Esforço**   **Status**   **Sprint**
  -------- ---------------------------------------------------------------------------------------- ------------- ------------ ------------
  T-038    Endpoint GET /api/dashboard/summary: retorna contadores e valores agregados por status   1d            Backlog      S2

  T-039    Cards de KPI: Total sócios / Adimplentes / Inadimplentes / A receber                     0.5d          Backlog      S2

  T-040    Gráfico de evolução da inadimplência nos últimos 6 meses (Recharts)                      1d            Backlog      S2

  T-041    Tabela de sócios inadimplentes com botão \'Cobrar agora\' (dispara WhatsApp manual)      1d            Backlog      S2

  T-042    Atualização em tempo real via Server-Sent Events ao receber webhook de pagamento         1d            Backlog      S3
  -----------------------------------------------------------------------------------------------------------------------------------------

**4.6 Épico: Qualidade e Segurança**

  ------------------------------------------------------------------------------------------------------------------------------------
  **ID**   **Task Técnica**                                                                    **Esforço**   **Status**   **Sprint**
  -------- ----------------------------------------------------------------------------------- ------------- ------------ ------------
  T-043    Setup Sentry no front e back: capturar erros não tratados em produção               0.5d          Backlog      S1

  T-044    Rate limiting global na API: 100 req/min por IP via fastify-rate-limit + Redis      0.5d          Backlog      S1

  T-045    HTTPS obrigatório; HSTS header; CSP básico no Next.js                               0.25d         Backlog      S1

  T-046    Criptografia de CPF e telefone em repouso (pgcrypto AES-256)                        1d            Backlog      S1

  T-047    Pipeline CI: GitHub Actions com lint + test + build em todo PR                      0.5d          Backlog      S1

  T-048    Testes E2E com Playwright: fluxo de login, cadastro de sócio, geração de cobrança   2d            Backlog      S3
  ------------------------------------------------------------------------------------------------------------------------------------

**4.7 Resumo do Backlog por Sprint**

  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Sprint**            **Foco Principal**                                            **Tasks**                       **Esforço Total**   **Critério de Done**
  --------------------- ------------------------------------------------------------- ------------------------------- ------------------- -----------------------------------------------------
  Sprint 1 (Sem 3--4)   Fundação: Auth, Onboarding, Segurança base, CI/CD             T-001 a T-019 + T-043 a T-047   \~10d dev           Clube consegue fazer login e cadastrar sócios

  Sprint 2 (Sem 5--6)   Core Financeiro: Cobranças Pix, Webhook, WhatsApp D-3/D0      T-020 a T-035 + T-037 a T-041   \~12d dev           Primeiro Pix cobrado e confirmado end-to-end

  Sprint 3 (Sem 7--8)   Polimento e Confiabilidade: SSE, E2E tests, Fallback e-mail   T-036 + T-042 + T-048           \~5d dev            Sistema roda 1 semana em prod sem incidente crítico
  ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

+-----------------------------------------------------------------------+
| ClubOS \| Fase 2: Definição e Arquitetura \| Fevereiro 2026           |
|                                                                       |
| \"Cada versão deve ser tratada como o produto completo.\"             |
+-----------------------------------------------------------------------+
