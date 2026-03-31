# Backlog — ClubOS (Transição e v1.5)

> **Formato:** User Story + Tarefas técnicas granulares.
> Cada tarefa deve caber em **1 dia de trabalho de 1 desenvolvedor**.
> **Legenda de status:** ✅ Implementado · ⬜ Pendente · ⚠️ Parcial
> **Status Atual:** MVP (v1.0) concluído. Iniciando resgate de pendências (SHOULD) e estruturação da v1.5 (O Campo). Sprints 1 a 5 foram arquivadas.

---

## Resumo por Sprint (Ativas)

| Sprint                   | Foco Principal                                       | Tarefas       | Esforço  | Status     | Critérios de "Pronto" (Done)                                                              |
| ------------------------ | ---------------------------------------------------- | ------------- | -------- | ---------- | ----------------------------------------------------------------------------------------- |
| **Sprint 6 (Sem 13–14)** | Infra Offline-First e Pendências v1.0 (Itens SHOULD) | T-086 a T-100 | ~12d dev | ⬜ A Fazer | PWA instalável no mobile; banco local operante; pendências de UI (SHOULD) entregues.      |
| **Sprint 7 (Sem 15–16)** | v1.5 — TreinoOS e BaseForte (Planejamento e Saúde)   | T-101 a T-109 | ~7d dev  | ⬜ A Fazer | Treinador faz chamada offline; RPE inserido com sucesso e dashboard ACWR operante.        |
| **Sprint 8 (Sem 17–18)** | v1.5 — Peneiras, Relatórios e LGPD Compliance        | T-110 a T-113 | ~3d dev  | ⬜ A Fazer | Aceite parental assinado via formulário; rotina de expurgo de base configurada e testada. |

---

## Épico 14 — Fundação PWA e Offline-First (TreinoOS)

**Como** treinador, **quero** acessar o sistema e registrar presenças no campo de terra, **para** que a falta de 4G não me obrigue a voltar para o caderno.

| ID        | Tarefa Técnica                                                                                                                              | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-086** | Setup do manifesto PWA (`manifest.json`) e configuração de ícones nativos (iOS/Android) no Next.js App Router                               | 0.5d    | S6     | ✅     |
| **T-087** | Integração do **Workbox** para Service Workers: estratégia `Stale-while-revalidate` para assets estáticos e `Network-first` para dados base | 1d      | S6     | ✅     |
| **T-088** | Implementação do **Dexie.js** (IndexedDB): schema local para tabelas `athletes` e `training_sessions`                                       | 1d      | S6     | ✅     |
| **T-089** | Motor de Sincronização (Parte 1): Listener online/offline e fila de ações mutáveis salvas no IndexedDB                                      | 1d      | S6     | ✅     |
| **T-090** | Motor de Sincronização (Parte 2): Worker de disparo para consumo da fila local com retry exponencial pós-conexão                            | 0.5d    | S6     | ✅     |

---

## Épico 15 — Estrutura de Séries Temporais (BaseForte)

**Como** desenvolvedor backend, **quero** configurar o banco de dados para lidar com inserções diárias de RPE usando recursos nativos do PostgreSQL (BRIN e Materialized Views), **para** que as agregações de cálculo ACWR não degradem a performance e não exijam infraestrutura especializada.

| ID        | Tarefa Técnica                                                                                                                  | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-091** | Configurar tabela `workload_metrics` com Índice BRIN na coluna de data e chaves estrangeiras apropriadas no Prisma.             | 0.5d    | S6     | ✅     |
| **T-092** | Criar `MATERIALIZED VIEW` para o cálculo agregado semanal do ACWR (Carga Aguda vs Crônica).                                     | 1d      | S6     | ✅     |
| **T-093** | Criar script SQL e rotina Prisma/Backend para permitir o `REFRESH MATERIALIZED VIEW CONCURRENTLY`.                              | 0.5d    | S6     | ✅     |
| **T-094** | Criar um job no BullMQ (`refresh-acwr-aggregates`) para rodar o refresh a cada 4 horas ou no fechamento do dia automaticamente. | 1d      | S6     | ✅     |

---

## Épico 16 — Finalização de Pendências v1.0 (SHOULD)

> **Contexto:** Funcionalidades acessórias e melhorias de UI mapeadas no escopo MoSCoW original que preparam o terreno para os módulos de engajamento e SAF (V2.0).

### US-26 a US-30 — Resgate de Features

| ID        | Tarefa Técnica                                                                                                        | Esforço | Sprint | Status |
| --------- | --------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-095** | **[S3]** Carteirinha digital do sócio: UI PWA com geração de QR Code de identificação assinado.                       | 1d      | S6     | ✅     |
| **T-096** | **[S7]** Histórico de pagamentos: Integração da UI (`MemberPaymentsModal`) consumindo endpoint backend já existente.  | 0.5d    | S6     | ✅     |
| **T-097** | **[S10]** Registro de despesas (P&L): CRUD simples `api/expenses` e tela de listagem para controle do tesoureiro.     | 1d      | S6     | ✅     |
| **T-098** | **[S4]** Conciliação Bancária OFX (Parte 1): Rota de upload de arquivo e parser XML/SGML nativo em memória.           | 1d      | S6     | ✅     |
| **T-099** | **[S4]** Conciliação Bancária OFX (Parte 2): Algoritmo de correspondência simples por valor/data e UI de conciliação. | 1d      | S6     | ✅     |
| **T-100** | **[S5]** Painel de Transparência SAF: Estrutura base de exibição pública de balanços em PDF (MVP pré-V2.0).           | 0.5d    | S6     | ✅     |

---

## Épico 17 — TreinoOS (Planejamento e Presença)

> **Contexto:** Transformar o sistema na principal ferramenta diária da comissão técnica, funcionando de forma resiliente em ambientes com baixa conectividade (offline-first).

### US-31 — Biblioteca de Exercícios e Prancheta

**Como** treinador, **quero** criar e visualizar treinos através de uma biblioteca visual, **para** planejar minhas sessões rapidamente.

| ID        | Tarefa Técnica                                                                                         | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-101** | Schema `exercises` e `training_sessions` (IndexedDB + PostgreSQL) + Endpoints CRUD base.               | 0.5d    | S7     | ✅     |
| **T-102** | UI da Biblioteca de Exercícios: Grid visual interativo simulando uma prancheta de planejamento tático. | 1d      | S7     | ⬜     |

### US-32 — Gestão de Presença e Avaliação

**Como** treinador, **quero** realizar a chamada digital mesmo sem internet, **para** não precisar transcrever do papel depois.

| ID        | Tarefa Técnica                                                                                                | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-103** | Tela de Chamada Digital: Interface mobile-first (swipes e botões grandes) integrada ao state local (Zustand). | 0.5d    | S7     | ✅     |
| **T-104** | Integração Chamada/Sync: Acoplar a UI de presença ao Motor de Sincronização (Background Sync API).            | 1d      | S7     | ⬜     |
| **T-105** | View agregada de Ranking de Assiduidade e alerta de escalação (Query SQL + UI Widget).                        | 0.5d    | S7     | ⬜     |
| **T-106** | Avaliação Técnica: Formulário de microciclo (notas 1 a 5) e exportação em PDF (`react-pdf`).                  | 1d      | S7     | ⬜     |

---

## Épico 18 — BaseForte (Carga e Saúde)

> **Contexto:** Obter os dados físicos primários que alimentarão a predição de lesões na v2.0 e estabelecer um canal de valor com responsáveis.

### US-33 — Telemetria de Treino e Dashboard ACWR

**Como** preparador físico, **quero** registrar a intensidade de cada atleta e ver o risco de lesão, **para** poupar jogadores na zona vermelha.

| ID        | Tarefa Técnica                                                                                                 | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-107** | UI de registro RPE (1-10, padrão FIFA): Slider interativo otimizado para preenchimento rápido no PWA.          | 0.5d    | S7     | ⬜     |
| **T-108** | Endpoints de Ingestão Externa: Setup seguro para receber payloads do HealthKit/Google Fit (hardware-agnostic). | 1d      | S7     | ✅     |
| **T-109** | Dashboard de Risco ACWR: Componente visual que consome a Materialized View sinalizando Verde/Amarelo/Vermelho. | 1d      | S7     | ⬜     |

### US-34 — Relatório para Responsáveis

**Como** responsável, **quero** receber um resumo semanal do desempenho físico do atleta, **para** acompanhar seu desenvolvimento.

| ID        | Tarefa Técnica                                                                                   | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-110** | Job BullMQ Semanal: Compila dados de assiduidade/RPE e despacha template formatado via WhatsApp. | 1d      | S8     | ⬜     |

---

## Épico 19 — Peneiras e LGPD (Compliance B2C)

> **Contexto:** Mitigar ativamente o passivo jurídico-esportivo (LGPD) coletando consentimento auditável para tratamento de dados de menores.

### US-35 — Inscrições Seguras e Expurgo

**Como** clube, **quero** que inscrições exijam aceite digital e sejam expurgadas automaticamente, **para** garantir compliance.

| ID        | Tarefa Técnica                                                                                                 | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-111** | Formulário de Peneiras: Tela pública em route group `(marketing)` com upload de documentação básica.           | 0.5d    | S8     | ⬜     |
| **T-112** | Aceite Parental Digital: Geração de hard-stop com coleta de IP, Timestamp e hash SHA-256 salvo no `audit_log`. | 1d      | S8     | ⬜     |
| **T-113** | Job de Expurgo LGPD: Cron mensal para deleção (hard delete) em cascata de dados inativos há > 24 meses.        | 0.5d    | S8     | ⬜     |

---

## Plano de Execução Recomendado (Ordem Lógica)

> A lista abaixo ordena a execução por **dependências arquiteturais** (Infraestrutura > Banco > Lógica > UI Isolada) dentro de cada sprint, mitigando riscos de bloqueios.

### Sprint 7 (O Campo: Treino e Carga)

**Fase 2: Interface Offline** 4. `T-104` — Integração Chamada/Sync Engine 5. `T-107` — UI de Registro RPE

**Fase 3: Agregações e Dashboards** 6. `T-105` — View de Ranking de Assiduidade 7. `T-109` — Dashboard de Risco ACWR (Depende da Materialized View da Sprint 6) 8. `T-102` — UI da Prancheta de Exercícios 9. `T-106` — Formulário de Avaliação e PDF

### Sprint 8 (Compliance e Automação)

**Fase 1: Coleta Segura**

1. `T-111` — Tela Pública de Peneiras
2. `T-112` — Implementação do Aceite Parental (LGPD)

**Fase 2: Rotinas em Background** 3. `T-113` — Job LGPD de Expurgo 4. `T-110` — Job de Relatório Semanal aos Pais (Depende da assiduidade e RPE gerados na Sprint 7)
