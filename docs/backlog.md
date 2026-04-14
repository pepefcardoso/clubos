# Backlog — ClubOS (v2.0 O Vestiário)

> **Formato:** User Story + Tarefas técnicas granulares.
> Cada tarefa deve caber em **1 dia de trabalho de 1 desenvolvedor**.
> **Legenda de status:** ✅ Implementado · ⬜ Pendente · ⚠️ Parcial

---

## Resumo por Sprint (Ativas)

| Sprint                    | Foco Principal                                             | Tarefas       | Esforço | Status      | Critérios de "Pronto" (Done)                                                                                             |
| ------------------------- | ---------------------------------------------------------- | ------------- | ------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Sprint 9 (Sem 15–16)**  | v2.0 — FisioBase Core (Prontuário + RTP + Protocolos)      | T-114 a T-122 | ~9d dev | ⚠️ Pendente | Role PHYSIO ativo; prontuário criado e criptografado; status RTP visível por role; biblioteca de protocolos navegável.   |
| **Sprint 10 (Sem 17–18)** | v2.0 — SAF Compliance Full + Demonstrativo de Receitas     | T-123 a T-128 | ~6d dev | ⬜ Pendente | Dashboard SAF com KPIs; passivos trabalhistas exportáveis em PDF; demonstrativo integrado a sócios + cobranças.          |
| **Sprint 11 (Sem 19–20)** | v2.0 — Relatórios, Controle de Acesso QR e Compliance LGPD | T-129 a T-133 | ~5d dev | ⬜ Pendente | Relatório financeiro PDF gerado via job mensal; QR Code de portaria funcional offline; audit log de dados médicos ativo. |

## Épico 20 — FisioBase Core (Prontuário Esportivo e RTP)

**Como** fisioterapeuta, **quero** registrar prontuários de lesão e definir o status de retorno ao jogo de cada atleta, **para** que o treinador tome decisões de escalação com segurança e eu mantenha o histórico clínico em conformidade com a LGPD.

### US-36 — Ativação do Role PHYSIO e Isolamento de Dados Clínicos

| ID        | Tarefa Técnica                                                                                                                                                                                                       | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-114** | Ativar role `PHYSIO` no RBAC: guards de rota na API (`requireRole('PHYSIO', 'ADMIN')`), visibilidade no middleware de autenticação e token JWT. Sem exposição na UI de outros roles.                                 | 0.5d    | S9     | ✅     |
| **T-115** | Schema Prisma + DDL tenant para tabelas `medical_records`, `injury_protocols` e `return_to_play`. Campos de dados clínicos marcados como `BYTEA` (criptografia AES-256). Índices BRIN em datas de ocorrência.        | 1d      | S9     | ✅     |
| **T-116** | CRUD de prontuário esportivo (`/api/medical-records`): criação, leitura com descriptografia, atualização e soft-delete. Criptografia AES-256 via pgcrypto para campos clínicos. Audit log em cada acesso de leitura. | 1d      | S9     | ✅     |
| **T-133** | Job de audit log de acesso a dados médicos: qualquer leitura de `medical_records` por qualquer role gera entrada em `data_access_log` com actor, timestamp e campo acessado (compliance LGPD).                       | 0.5d    | S9     | ✅     |

### US-37 — Prontuário Esportivo (UI)

| ID        | Tarefa Técnica                                                                                                                                                                       | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ | --- |
| **T-117** | UI Prontuário: formulário de registro de lesão (`MedicalRecordFormModal`) com campos de data, mecanismo, estrutura anatômica, grau e observações clínicas. Visível apenas ao `PHYSIO | ADMIN`. | 1d     | S9     | ✅  |
| **T-118** | Linha do tempo de eventos clínicos por atleta: componente de histórico ordenado por data (`MedicalTimeline`) com badges por tipo de evento (lesão, retorno, avaliação).              | 0.5d    | S9     | ✅     |

### US-38 — Retorno ao Jogo (RTP)

| ID        | Tarefa Técnica                                                                                                                                                                             | Esforço             | Sprint                                                                                                        | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------- | ------ | --- | --- |
| **T-119** | API de Status RTP (`/api/athletes/:id/rtp`): endpoint que lê `return_to_play.status` (enum: `AFASTADO                                                                                      | RETORNO_PROGRESSIVO | LIBERADO`) e o expõe por role. `PHYSIO/ADMIN`veem status + notas clínicas;`COACH` vê apenas o enum de status. | 0.5d   | S9  | ✅  |
| **T-120** | UI RTP no perfil do atleta: widget `RtpStatusBadge` exibido na `AthletesPage` e na tela de escalação. Treinador vê o semáforo (Afastado/Progressivo/Liberado) sem acesso a dados clínicos. | 0.5d                | S9                                                                                                            | ✅     |

### US-39 — Biblioteca de Protocolos e Correlação de Dados

| ID        | Tarefa Técnica                                                                                                                                                                                                   | Esforço | Sprint | Status |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-121** | Biblioteca de protocolos de retorno ao jogo: seed com 20 protocolos baseados em evidência (FIFA Medical — entorses, distensões, contusões, fraturas). UI de seleção e atribuição por lesão (`ProtocolSelector`). | 1d      | S9     | ✅     |
| **T-122** | Correlação carga × lesão: query analítica que cruza `workload_metrics` (ACWR) com `medical_records` (ocorrências de lesão) e exibe no dashboard do PHYSIO os atletas com histórico de lesão em zona vermelha.    | 1d      | S9     | ✅     |

---

## Épico 21 — SAF Compliance Full (Lei 14.193/2021)

**Como** dirigente de clube em processo de profissionalização, **quero** publicar balanços, registrar passivos trabalhistas e gerar demonstrativos de receita em conformidade com a Lei 14.193/2021, **para** que o clube esteja apto a operar como SAF sem passivo jurídico financeiro.

### US-40 — Dashboard SAF e Passivos Trabalhistas

| ID        | Tarefa Técnica                                                                                                                                                                                  | Esforço | Sprint | Status |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-123** | Dashboard SAF: página `/saf` com KPIs para acionistas — receita recorrente (MRR), passivos registrados, status de compliance e data da última publicação de balanço. Componente `SafDashboard`. | 1d      | S10    | ✅     |
| **T-124** | Módulo de Passivos Trabalhistas: CRUD de credores (`/api/creditors`) com campos de credor, valor, vencimento e status. Exportação em PDF assinado digitalmente com hash SHA-256 no `audit_log`. | 1d      | S10    | ✅     |

### US-41 — Demonstrativo de Receitas e Publicação de Balanços

| ID        | Tarefa Técnica                                                                                                                                                                                           | Esforço | Sprint | Status |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-125** | Demonstrativo de Receitas integrado: query agregada que consolida dados de `charges` (cobranças de sócios), `payments` (pagamentos confirmados) e `expenses` (despesas do P&L) por período selecionável. | 1d      | S10    | ✅     |
| **T-126** | Painel SAF Full de publicação: UI para upload e publicação de balanços. Cada publicação gera hash SHA-256 do arquivo, salvo em `balance_sheets` (imutável). URL pública por clube configurável.          | 1d      | S10    | ✅     |

### US-42 — Conciliação OFX Aprimorada e Relatório Financeiro PDF

| ID        | Tarefa Técnica                                                                                                                                                                                                | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ | ------ |
| **T-127** | UI de conciliação bancária OFX aprimorada: revisão do algoritmo de correspondência por valor/data (sprint 6) com UI de aprovação em lote, filtros por status (conciliado/pendente) e exportação simplificada. | 1d      | S10    | ✅     |
| **T-128** | Relatório financeiro mensal PDF (S6): template `react-pdf` com resumo de receitas, despesas, saldo e inadimplência. Job BullMQ mensal (`generate-monthly-report`) que despacha o PDF por e-mail à diretoria.  | 1d      | S10    | ⬜     |

---

## Épico 22 — Relatório para Seguro e Multi-Fisio

**Como** fisioterapeuta, **quero** exportar um relatório estruturado de lesão para reembolso de seguro e gerenciar atletas de mais de um clube em um único painel, **para** aumentar meu alcance profissional sem precisar de múltiplos logins.

### US-43 — Relatório de Lesão para Seguro e Multi-Clube

| ID        | Tarefa Técnica                                                                                                                                                                                                                       | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-129** | Relatório exportável para seguro/plano de saúde: geração de PDF (`react-pdf`) com histórico de lesão, protocolo aplicado, evolução clínica e assinatura digital do fisioterapeuta. Disponível via `/api/medical-records/:id/report`. | 1d      | S11    | ⬜     |
| **T-130** | Multi-fisio e multi-clube: painel único (`PhysioDashboard`) que consolida atletas de múltiplos clubes vinculados ao mesmo usuário `PHYSIO`. Histórico transferível entre clubes com consentimento registrado no `audit_log`.         | 1d      | S11    | ⬜     |

---

## Épico 23 — Controle de Acesso QR Code (S11 — Operações)

**Como** staff operacional do clube, **quero** validar a entrada de torcedores em eventos via QR Code no celular, **para** eliminar o CAPEX de catracas físicas e ter controle rastreável de acesso.

### US-44 — QR Code Dinâmico de Portaria

| ID        | Tarefa Técnica                                                                                                                                                                                                                                                     | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-131** | Backend de validação de QR Code de acesso: endpoint `/api/events/:id/access/validate` que recebe o payload do QR Code, verifica assinatura HMAC, registra entrada em `field_access_logs` e retorna status de validação. Suporte offline com fila de sincronização. | 1d      | S11    | ⬜     |
| **T-132** | UI de portaria mobile-first: câmera do celular escaneia QR Code, exibe resultado visual (verde/vermelho) em < 1s. Funciona offline com fila local (Dexie.js). Log de acessos exportável por evento (`AccessLogExport`).                                            | 1d      | S11    | ⬜     |

---

## Tarefas Técnicas Transversais (v2.0)

> Infraestrutura e qualidade que viabiliza os épicos acima.

| ID        | Tarefa Técnica                                                                                                                                                                                                                                   | Esforço | Sprint | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ | ------ |
| **T-134** | Provisionamento DDL tenant v2.0: atualizar `provisionTenantSchema` com novas tabelas `medical_records`, `injury_protocols`, `return_to_play`, `balance_sheets`, `creditor_disclosures`, `data_access_log`, `field_access_logs`. DDL idempotente. | 0.5d    | S9     | ✅     |
| **T-135** | Testes de integração E2E para fluxo de prontuário: criação → RTP → correlação ACWR. Cobertura mínima de 80% nos endpoints novos do FisioBase.                                                                                                    | 1d      | S11    | ⬜     |

## Plano de Execução Recomendado (Ordem Lógica)

> A lista abaixo ordena a execução por **dependências arquiteturais** (Infraestrutura > Banco > Lógica > UI Isolada) dentro de cada sprint, mitigando riscos de bloqueios.

### Sprint 10 (SAF Compliance Full e Demonstrativos)

**Fase 3: Automação e Relatórios (Paralelizável com a Fase 2)** 6. `T-128` — Job BullMQ Mensal e Geração de Relatório Financeiro PDF

### Sprint 11 (Relatórios, Controle de Acesso e Quality Assurance)

**Fase 1: APIs, Integrações e Geração de Documentos (Bloqueadores)**

1. `T-131` — Backend de Validação de QR Code de Acesso (Motor de regras da portaria)
2. `T-129` — Geração de PDF do Relatório de Lesão para Seguro (Depende dos dados da Sprint 9)

**Fase 2: UI Operacional e Multi-Tenant (Depende da Fase 1)** 3. `T-132` — UI Portaria Mobile-First (Scanner de câmera e fila offline para o QR Code) 4. `T-130` — Painel Multi-Fisio e Multi-Clube (Consolidação de visualização na UI)

**Fase 3: Homologação e Qualidade (Finalização da v2.0)** 5. `T-135` — Testes E2E de Integração para o Fluxo de Prontuário (Valida de ponta a ponta a Sprint 9 antes do deploy final)
