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
| v1.0   | O Cofre do Clube | ClubOS (Financeiro + Sócios + Compliance Base)           | Sem. 1–6   | 10 clubes pagantes; inadimplência ↓25%          | ✅ Concluído    | ✅ Concluído    |
| v1.5   | O Campo          | TreinoOS + BaseForte + Peneiras LGPD                     | Sem. 7–14  | 60% dos clubes v1.0 ativam módulo de treino     | ✅ Concluído    | ✅ Concluído    |
| v2.0   | O Vestiário      | FisioBase + SAF Compliance Full + Conciliação Financeira | Sem. 15–20 | Recidiva ↓ em 3+ clubes; 3 SAFs em compliance   | 🟡 Em andamento | 🟡 Em andamento |
| v2.5   | A Arquibancada   | ArenaPass (Bilheteria Digital)                           | Sem. 21–28 | Clube aumenta receita/jogo em 40%+              | ⬜ Não iniciado | ⬜ Não iniciado |
| v3.0   | A Vitrine        | ScoutLink (Marketplace de Talentos)                      | Mês 8–10   | 1º contato scout–escola mediado pela plataforma | ⬜ Não iniciado | ⬜ Não iniciado |
| v3.5   | A Liga           | CampeonatOS (Gestão de Campeonatos)                      | Mês 11–13  | 1 campeonato completo gerenciado end-to-end     | ⬜ Não iniciado | ⬜ Não iniciado |

### Resumo Visual

```

Semanas 1──────6 7────────14 15──────20 21────28 M8──10 M11─13
┌────────┐ ┌─────────┐ ┌─────────┐ ┌──────┐ ┌────┐ ┌─────┐
Versão │ v1.0 │ │ v1.5 │ │ v2.0 │ │ v2.5 │ │v3.0│ │v3.5 │
│ Cofre │ │ Campo │ │Vestiário│ │Arena │ │Vitrine│ │Liga │
│  ✅   │ │  ✅   │ │  🟡   │ │  ⬜  │ │ ⬜  │ │ ⬜  │
└────────┘ └─────────┘ └─────────┘ └──────┘ └────┘ └─────┘
Módulos ClubOS TreinoOS FisioBase ArenaPass Scout Campeonato
Finanças BaseForte SAF Full Bilheteria Link OS
Sócios Peneiras Conc.Banc. CRM Torc.
Contratos Offline-1st QR Portaria

```

---

## Versão 1.0 — "O Cofre do Clube" ✅

**Período:** Semanas 1–6 | **Módulos:** ClubOS Financeiro + Sócios + Compliance Base

### Status de implementação (apps/api) — ✅ Concluído

Todos os itens MUST (M1–M14) e SHOULD relevantes (S1–S10, S6 parcial migrada para v2.0) entregues. Destaques:

- Geração automática de cobranças PIX mensais com Multi-Acquiring (Asaas → Pagarme → Stripe → PIX estático)
- Régua de cobrança WhatsApp D-3, D-0, D+3 e on-demand com rate limiting Redis e fallback e-mail
- Webhook Asaas com HMAC timingSafeEqual + BullMQ + SSE para invalidação de cache React Query
- Criptografia AES-256 (pgcrypto) em CPF e telefone; audit log imutável em todas operações
- Motor de Regras Esportivas CBF/FPF parametrizável via JSONB; alertas de BID 48h antes do jogo
- Multi-Acquiring PIX com fallback silencioso; schema-per-tenant com `assertValidClubId`

### Status de implementação (apps/web) — ✅ Concluído

Landing page, onboarding, CRUD de sócios, planos, cobranças PIX, dashboard SSE, templates, atletas e contratos entregues.

### Critério de Go/No-Go v1.0 — ✅ Atingido

- Piloto com 3 clubes por 30 dias
- Inadimplência média reduzida em ≥ 20%
- Zero duplicidades de cobrança ou falha silenciosa em produção
- Pelo menos 1 clube pagando o plano mensal
- NPS dos tesoureiros ≥ 40

---

## Versão 1.5 — "O Campo" ✅

**Período:** Semanas 7–14 | **Módulos:** TreinoOS + BaseForte + Peneiras LGPD

### Meta Estratégica

Transformar o ClubOS de "ferramenta do tesoureiro" para "plataforma do clube inteiro". O treinador — que até agora usava WhatsApp e caderno — passa a registrar treinos no sistema.

### Status de implementação — ✅ Concluído (Sprints 6, 7 e 8)

**Infraestrutura Offline-First (Sprint 6)**

- PWA completo: `manifest.json`, ícones nativos iOS/Android, Workbox (Stale-while-revalidate + Network-first)
- Dexie.js (IndexedDB): schema local para `athletes` e `training_sessions`
- Motor de Sincronização: listener online/offline + fila de ações + worker com retry exponencial

**Séries Temporais — BaseForte (Sprint 6)**

- Tabela `workload_metrics` com Índice BRIN em coluna de data
- `MATERIALIZED VIEW` ACWR semanal (carga aguda vs crônica)
- `REFRESH MATERIALIZED VIEW CONCURRENTLY` via script SQL + rotina Prisma
- Job BullMQ `refresh-acwr-aggregates` a cada 4 horas

**Pendências v1.0 SHOULD (Sprint 6)**

- S3 ✅ Carteirinha digital do sócio com QR Code assinado
- S4 ✅ Conciliação bancária OFX (parser + algoritmo de correspondência + UI)
- S5 ✅ Painel de Transparência SAF (MVP pré-v2.0)
- S7 ✅ Histórico de pagamentos (UI integrada ao endpoint)
- S10 ✅ Registro de despesas P&L (CRUD + tela de listagem)

**TreinoOS — Planejamento e Presença (Sprint 7)**

- Biblioteca de exercícios: grid visual (prancheta tática), 40 exercícios pré-carregados + customizáveis
- Chamada digital mobile-first (swipes + botões grandes, Zustand, Background Sync API)
- Ranking de assiduidade por posição + alerta de escalação por frequência
- Avaliação técnica por microciclo (notas 1–5, exportação PDF via `react-pdf`)

**BaseForte — Carga e Saúde (Sprint 7–8)**

- Registro RPE 1–10 (padrão FIFA, slider PWA otimizado)
- Ingestão HealthKit/Google Fit: endpoints seguros hardware-agnostic
- Dashboard ACWR Verde/Amarelo/Vermelho consumindo Materialized View
- Job BullMQ semanal: relatório de assiduidade/RPE para responsáveis via WhatsApp

**Peneiras LGPD (Sprint 8)**

- Formulário público de peneiras em route group `(marketing)`
- Hard stop de aceite parental: IP + Timestamp + hash SHA-256 em `audit_log`
- Job de expurgo LGPD: cron mensal para hard delete em cascata após > 24 meses

### Critério de Go/No-Go v1.5 — ✅ Atingido

- 60% dos clubes da v1.0 ativam o módulo de treino
- Treinador usa por 4 semanas consecutivas sem lembrete externo
- Pelo menos 5 pais com relatório premium ativo
- Dados de ACWR gerados para ≥ 80% dos atletas ativos
- Zero incidentes de perda de dados offline

---

## Versão 2.0 — "O Vestiário" 🟡

**Período:** Semanas 15–20 | **Módulos:** FisioBase + SAF Compliance Full + Conciliação Financeira

### Meta Estratégica

Criar o diferencial analítico que nenhum concorrente do "Missing Middle" oferece: a correlação entre carga de treino e lesão como preditor de afastamento. Simultaneamente, fechar o ciclo de compliance financeiro para SAFs — tornando o ClubOS a única plataforma que une saúde do atleta e saúde contábil do clube.

### Por que FisioBase depende da v1.5?

Sem dados de carga ACWR do TreinoOS, o FisioBase é apenas um prontuário digital glorificado. A inteligência preditiva (correlação carga × lesão) é o diferencial que justifica o preço premium e conquista o fisioterapeuta como usuário pagador independente do clube.

### Features incluídas na v2.0

**FisioBase — Saúde do Atleta**

- Role `PHYSIO` ativo: guards de rota na API, visibilidade no RBAC e no token JWT
- Prontuário esportivo: histórico de lesões, estrutura anatômica, grau, mecanismo e evolução clínica — criptografado AES-256, acesso restrito a `PHYSIO | ADMIN`
- Status de Retorno ao Jogo (RTP): `AFASTADO | RETORNO_PROGRESSIVO | LIBERADO` — COACH vê apenas o semáforo, nunca dados clínicos
- Biblioteca de 20 protocolos de retorno baseados em evidência (FIFA Medical): entorses, distensões, contusões, fraturas
- Correlação carga × lesão: query analítica cruzando `workload_metrics` (ACWR) com `medical_records` (ocorrências)
- Relatório estruturado para seguro/plano de saúde (PDF `react-pdf`) com histórico e protocolo aplicado
- Multi-fisio e multi-clube: painel único para fisioterapeuta com múltiplos clubes vinculados; histórico transferível com consentimento
- Audit log de acesso: qualquer leitura de prontuário gera entrada em `data_access_log` (compliance LGPD)

**SAF Compliance Full (Lei 14.193/2021)**

- Dashboard financeiro SAF: KPIs para acionistas (MRR, passivos, status de compliance, data da última publicação)
- Módulo de Passivos Trabalhistas: CRUD de credores + exportação PDF com hash SHA-256 imutável no `audit_log`
- Demonstrativo de Receitas: query consolidada de `charges` + `payments` + `expenses` por período selecionável
- Publicação de balanços: upload + hash SHA-256 em `balance_sheets` (imutável) + URL pública por clube

**Pendências SHOULD migradas para v2.0**

- S6 ✅ (→ S14): Relatório financeiro mensal PDF — template `react-pdf` + job BullMQ mensal para diretoria
- S11 ✅ (→ S16): Controle de acesso QR Code dinâmico — validação por câmera do celular, offline-first com Dexie.js, log de acesso por evento exportável
- Conciliação OFX aprimorada: aprovação em lote + filtros por status + exportação contábil simplificada

### Critério de Go/No-Go v2.0

- Redução de recidiva de lesão documentada em ≥ 3 clubes
- Fisioterapeuta usa o sistema por 4 semanas consecutivas sem lembrete
- Pelo menos 1 clube obtém reembolso de seguro usando relatório da plataforma
- Pelo menos 3 SAFs em conformidade com a Lei 14.193/2021 via painel

---

## Versão 2.5 — "A Arquibancada" ⬜

**Período:** Semanas 21–28 | **Módulo:** ArenaPass (Bilheteria Digital)

### Meta Estratégica

Criar o motor de aquisição de sócios mais eficiente: cada torcedor que compra um ingresso entra automaticamente no funil de conversão para sócio. O ArenaPass tem menor resistência de adoção (transacional, sem mensalidade fixa para o torcedor) e maior impacto imediato — receita por jogo aumentando 40%+ vs. a caixinha manual.

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

## Versão 3.0 — "A Vitrine" ⬜

**Período:** Meses 8–10 | **Módulo:** ScoutLink (Marketplace de Talentos)

### Meta Estratégica

Criar o primeiro marketplace verificado de talentos do futebol amador e semiprofissional brasileiro. A proposta de valor para o scout: perfis ricos com dados longitudinais reais (ACWR, histórico de lesões, avaliação técnica), não apenas altura, peso e vídeo editado.

### Por que ScoutLink não pode ser antecipado?

Uma vitrine vazia não retém o lado da demanda. Scouts pagam assinatura porque os perfis são ricos e verificados — isso exige mínimo 6 meses de dados contínuos do BaseForte e FisioBase em produção.

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
- NPS dos scouts ≥ 50

---

## Versão 3.5 — "A Liga" ⬜

**Período:** Meses 11–13 | **Módulo:** CampeonatOS (Gestão de Campeonatos)

### Meta Estratégica

Ativar o efeito de rede. Quando a maioria dos clubes de uma liga já está no ClubOS, o CampeonatOS se vende sozinho. O organizador deixa de gastar 8h/semana em planilhas para gastar ≤ 2h.

### Features incluídas na v3.5

- Cadastro de times e jogadores com verificação de elegibilidade por CPF em tempo real
- Geração automática de tabela round-robin sem conflito de campo ou horário
- Escalação digital com validação de elegibilidade (Motor de Regras Esportivas)
- Súmula digital preenchida pelo árbitro no celular (offline-first)
- Controle automático de suspensões por cartão acumulado + alerta WhatsApp ao capitão
- Portal público por campeonato: URL personalizada, tabela ao vivo, artilharia, perfil de elenco
- Sistema de protesto com prazo rastreado e log imutável
- Patrocínio digital no portal público com métricas de visualização (CPM, cliques)
- Relatório final de campeonato exportável em PDF (premiação, disciplina, artilharia)

### Critério de Go/No-Go v3.5

- Campeonato completo (rodadas ida e volta) gerenciado do início ao fim pela plataforma
- Organizador reduz horas de logística por semana de 8h para ≤ 2h
- ≥ 1 patrocinador local ativo no portal público

---

## Mapa de Dependências Técnicas

| Módulo                      | Depende de                          | Dado / Recurso Herdado                                                                                             |
| --------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| TreinoOS + BaseForte (v1.5) | ClubOS (v1.0)                       | Entidade `athlete` com identidade e vínculo (stub v1.0). ✅ Dependência satisfeita.                                |
| Peneiras LGPD (v1.5)        | ClubOS (v1.0)                       | Schema de sócios + infraestrutura de consentimento digital. ✅ Dependência satisfeita.                             |
| FisioBase (v2.0)            | BaseForte (v1.5)                    | Dados de carga ACWR por atleta. Sem eles, FisioBase é apenas prontuário sem inteligência preditiva. ✅ Satisfeita. |
| SAF Compliance Full (v2.0)  | ClubOS (v1.0)                       | Audit log imutável + dados financeiros completos do clube. ✅ Dependência satisfeita.                              |
| ArenaPass (v2.5)            | ClubOS (v1.0)                       | Cadastro de sócios para cruzamento torcedor→sócio. Funil de conversão só funciona com ClubOS maduro.               |
| ScoutLink (v3.0)            | BaseForte (v1.5) + FisioBase (v2.0) | Mínimo 6 meses de dados longitudinais verificados. Histórico de lesões com permissão.                              |
| CampeonatOS (v3.5)          | ClubOS (v1.0) + TreinoOS (v1.5)     | Base de clubes cadastrados na plataforma. Elencos e escalações preexistentes para súmula digital.                  |

---

## Modelo de Monetização por Versão

| Versão | Módulo               | Modelo                                     | Valor Estimado                           | Status      |
| ------ | -------------------- | ------------------------------------------ | ---------------------------------------- | ----------- |
| v1.0   | ClubOS               | Assinatura SaaS mensal + taxa PIX 1,2%     | R$ 149–299/clube/mês                     | ✅ Ativo    |
| v1.5   | TreinoOS + BaseForte | Add-on por treinador ou por escola         | R$ 49/treinador ou R$ 199–499/escola/mês | ✅ Ativo    |
| v1.5   | BaseForte B2C        | Relatório semanal para pais                | R$ 19/atleta/mês (pai paga)              | ✅ Ativo    |
| v2.0   | FisioBase            | Assinatura por fisioterapeuta ou por clube | R$ 79–149/fisio ou R$ 199/clube/mês      | 🟡 Em breve |
| v2.0   | SAF Compliance       | Add-on para SAFs                           | R$ 299/clube/mês                         | 🟡 Em breve |
| v2.5   | ArenaPass            | Pay-per-ingresso + assinatura              | R$ 1,50/ingresso ou R$ 99/mês            | ⬜          |
| v3.0   | ScoutLink            | Assinatura scout + freemium escola         | R$ 299/scout/mês                         | ⬜          |
| v3.5   | CampeonatOS          | Por campeonato ou assinatura liga          | R$ 299–699/evento ou R$ 299/liga/mês     | ⬜          |

**Receita potencial por clube maduro (v3.5):** R$ 600–1.100/mês em stack completo.

---

## Métricas-Âncora por Módulo

| Módulo      | Métrica de Produto                                            | Métrica de Negócio                              | Status |
| ----------- | ------------------------------------------------------------- | ----------------------------------------------- | ------ |
| ClubOS      | Cobrança PIX gerada para 100% dos sócios ativos no mês        | Inadimplência ↓25% vs. pré-adoção               | ✅     |
| TreinoOS    | ≥ 2 sessões planejadas/semana por treinador ativo             | 60% dos clubes v1.0 com módulo ativo            | ✅     |
| BaseForte   | ≥ 80% dos atletas com carga ACWR calculada e atualizada       | ≥ 5 pais pagando relatório premium              | ✅     |
| FisioBase   | ≥ 80% dos atletas afastados com protocolo de retorno definido | Redução de recidiva documentada em 3+ clubes    | 🟡     |
| ArenaPass   | 100% dos ingressos do jogo vendidos digitalmente              | Receita por jogo ≥ 40% acima da caixinha manual | ⬜     |
| ScoutLink   | ≥ 3 scouts com buscas ativas semanalmente                     | ≥ 1 contato formal scout–escola/mês             | ⬜     |
| CampeonatOS | Organizador usa plataforma para ≥ 90% das ações de logística  | 1 campeonato completo + 1 patrocinador ativo    | ⬜     |

---

## Riscos Críticos e Mitigações

### Riscos de Produto e Execução

| Risco                                        | Gravidade | Mitigação                                                                                             |
| -------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| Conectividade no campo                       | 🔴 Alta   | Offline-First implementado em v1.5: IndexedDB + Service Workers + Background Sync ✅                  |
| LGPD — dados de menores sem consentimento    | 🔴 Alta   | Hard stop no sistema de peneiras; criptografia; purge automático 24 meses; aceite parental digital ✅ |
| LGPD — dados clínicos de atletas (FisioBase) | 🔴 Alta   | AES-256 em `medical_records`; role PHYSIO obrigatório; audit log de acesso; hard stop no RBAC         |
| Escalação irregular BID/CBF                  | 🔴 Alta   | Motor de Regras parametrizável; alertas 48h antes do jogo; validação em tempo real ✅                 |
| Churn por gateway indisponível               | 🔴 Alta   | Multi-Acquiring com fallback silencioso Asaas → Pagarme → Stripe → PIX estático ✅                    |
| FisioBase sem dados de BaseForte             | 🔴 Alta   | Dependência resolvida: BaseForte ✅ em produção; correlação carga × lesão viável                      |
| FisioBase não vira hábito do fisioterapeuta  | 🔴 Alta   | Métrica: ≥ 4 semanas de uso consecutivo. Onboarding guiado; relatório de seguro como âncora de valor  |
| ScoutLink lança com perfis rasos             | 🔴 Alta   | Não lançar antes de 6 meses de BaseForte + FisioBase em produção; curadoria manual nos primeiros 90d  |
| CampeonatOS lança sem massa crítica          | 🔴 Alta   | Iniciar com ligas onde ClubOS tem ≥ 70% de penetração; freemium como top-of-funnel                    |
| Time fragmenta atenção prematuramente        | 🟡 Média  | Regra de go/no-go inviolável — um módulo por vez                                                      |
| Schema-per-tenant escala até ~1.000 clubes   | 🟡 Média  | Planejar análise de migração para RLS ao atingir 300 clubes ativos                                    |
| WhatsApp bloqueia número por envio massivo   | 🟡 Média  | Rate limit 30 msg/min (Lua Redis) ✅; fallback e-mail ✅; sender rotation planejado para v2.0         |
| SSE não escala em múltiplos processos        | 🟢 Baixa  | Substituir `EventEmitter` por Redis `PUBLISH/SUBSCRIBE`; interface de `sse-bus.ts` permanece idêntica |
| Bundle leak entre `(marketing)` e `(app)`    | 🟢 Baixa  | Regra aplicada — validar com bundle analyzer antes de ir para produção                                |
