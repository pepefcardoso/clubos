Aqui está o documento **Escopo MoSCoW** atualizado para as versões **v2.5 ("A Arquibancada")** e **v3.0 ("A Vitrine")**, consolidando os dados do `backlog.md` e do `roadmap.md`.

```markdown
# Escopo MoSCoW — ClubOS v2.5 & v3.0

> **Janela do módulo:** ~20 semanas de desenvolvimento (Semanas 21–40).
> **Status:** Planejamento ativo para v2.5 e v3.0.
> **Critério de corte:** Itens que não validam a monetização direta da bilheteria (v2.5) ou o marketplace de scouts (v3.0) serão postergados.
>
> **Versões anteriores:** 100% dos itens MUST entregues. FisioBase e SAF Compliance (v2.0) operacionais.

---

## Hipóteses de Validação

- **v2.5 (ArenaPass):** O clube aumenta a receita por jogo em ≥ 40% vs. caixinha manual e converte o primeiro torcedor em sócio via funil digital.
- **v3.0 (ScoutLink):** Primeiro contato formal scout–clube mediado pela plataforma; ≥ 3 scouts ativos; zero incidentes de contato direto com atletas menores (LGPD).

---

## Status de Implementação

> Legenda: ✅ Implementado · ⚠️ Parcial · ⬜ Pendente

---

## MUST HAVE — v2.5 "A Arquibancada" (ArenaPass)

| #   | Feature                                   | Critério de Aceite                                                                          | Esforço | API | Web |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------- | ------- | --- | --- |
| M26 | Infraestrutura e Configuração de Eventos  | Schema provisionado; CRUD de eventos com setores e preços em cents; DDL idempotente.        | 3d      | ⬜  | ⬜  |
| M27 | Venda de Ingressos via PIX e Entrega      | Geração de cobrança via Registry; entrega de QR Code SHA-256; página pública de compra.     | 3d      | ⬜  | ⬜  |
| M28 | Validação de Portaria Offline-First       | Backend com HMAC e Redis SET NX; UI mobile com scanner e sync via Dexie.js.                 | 2d      | ⬜  | ⬜  |
| M29 | Relatório de Bilheteria e CRM de Torcedor | Receita total (cents); funil torcedor→sócio disparado via BullMQ; exportação CSV segura.    | 3d      | ⬜  | ⬜  |
| M30 | PDV Mobile (mPOS) para Bilheteria         | Catálogo de produtos; integração SDK Stone/SumUp com fallback PIX; registro em `pos_sales`. | 2.5d    | ⬜  | ⬜  |

**Total estimado MUST v2.5:** ~13.5 dias de desenvolvimento.

---

## MUST HAVE — v3.0 "A Vitrine" (ScoutLink)

| #   | Feature                               | Critério de Aceite                                                                                         | Esforço | API | Web |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- | --- | --- |
| M31 | Infra Cross-Tenant e Auth Scout       | Schema `public` imutável; Role `SCOUT` no JWT; Verificação de dados longitudinais mínimos para publicação. | 2.5d    | ⬜  | ⬜  |
| M32 | Showcase de Atleta Verificado         | Snapshot ACWR/RTP agregado; assinatura SHA-256; UI de gestão de visibilidade.                              | 2d      | ⬜  | ⬜  |
| M33 | Busca Filtrada e Perfil Público       | Filtros técnicos; freemium enforced na API; gráfico ACWR Recharts; bloqueio de dados clínicos.             | 3d      | ⬜  | ⬜  |
| M34 | Solicitação de Contato Mediada (LGPD) | Hard stop para menores sem consentimento (403); log de comunicação imutável via trigger.                   | 2.5d    | ⬜  | ⬜  |
| M35 | Inbox Mediada e Consentimento         | Thread de mensagens sem expor PII direto; fluxo de aceite parental com hash e IP.                          | 3d      | ⬜  | ⬜  |

**Total estimado MUST v3.0:** ~13 dias de desenvolvimento.

---

## SHOULD HAVE — Alta prioridade; entra na sprint seguinte ao MUST

| #   | Feature                              | Justificativa de Negócio                                                        | API | Web |
| --- | ------------------------------------ | ------------------------------------------------------------------------------- | --- | --- |
| S18 | Patrocínio Programático (v2.5)       | Monetização imediata via logos de parceiros no ticket e página de compra.       | ⬜  | ⬜  |
| S19 | Checklist e Logística de Jogo (v2.5) | Job automático 48h antes; UI offline para staff gerenciar operações de campo.   | ⬜  | ⬜  |
| S20 | Upload e Gestão de Vídeos (v3.0)     | Prova visual para scouts via Cloudflare R2; validação rigorosa via magic bytes. | ⬜  | ⬜  |
| S21 | Curadoria Mensal para Scouts (v3.0)  | Job BullMQ gera PDF premium para scouts ativos baseado em buscas salvas.        | ⬜  | ⬜  |
| S22 | Billing de Scout e Freemium (v3.0)   | Cobrança recorrente R$ 299/mês; projeção condicional de dados por tier.         | ⬜  | ⬜  |

---

## COULD HAVE — Desejável; entra em v3.5 ou posterior

| #   | Feature                                | Quando Entra                                                          |
| --- | -------------------------------------- | --------------------------------------------------------------------- |
| C21 | Transferência de Histórico de Showcase | v3.0+ — Requer consentimento digital para portabilidade entre clubes. |
| C22 | Rate Limiting por Evento Popular       | v2.5+ — Prevenção de sobrecarga em aberturas de grandes bilheterias.  |
| C23 | IA para Sugestão de Preço de Setor     | v4.0 — Baseado em histórico de demanda e ocupação (ArenaPass).        |

---

## WON'T HAVE — Explicitamente fora do escopo (v2.5/v3.0)

| #   | O que NÃO entra                          | Por quê                                                                      |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------- |
| W13 | CampeonatOS (Gestão de Ligas)            | Foco da versão v3.5; requer maturação da base de clubes.                     |
| W14 | Contato direto via WhatsApp Scout-Atleta | Risco crítico de LGPD e desintermediação; comunicação deve ser 100% mediada. |
| W15 | Integração TISS para Planos de Saúde     | Complexidade regulatória fora do foco esportivo/analítico atual.             |

---

## Resumo Visual
```

           API (apps/api)                          Web (apps/web)

MUST v2.5 ░░░░░░░░░░░░░░░░░░░░ Planejado ░░░░░░░░░░░░░░░░░░░░ Planejado
M26 a M30 ⬜ M26 a M30 ⬜

MUST v3.0 ░░░░░░░░░░░░░░░░░░░░ Planejado ░░░░░░░░░░░░░░░░░░░░ Planejado
M31 a M35 ⬜ M31 a M35 ⬜

SHOULD ░░░░░░░░░░░░░░░░░░░░ v2.5/3.0+ ░░░░░░░░░░░░░░░░░░░░ v2.5/3.0+
S18–S22 ⬜ S18–S22 ⬜

```

## Referência — Versões Anteriores (Concluídas)

### v1.0 "O Cofre do Clube" — MUST (100% ✅)

| #   | Feature                                               | API | Web |
| --- | ----------------------------------------------------- | --- | --- |
| M1  | Cadastro de clube com onboarding multi-step           | ✅  | ✅  |
| M2  | Cadastro manual + importação CSV de sócios            | ✅  | ✅  |
| M3  | Geração de cobranças PIX recorrentes com QR Code      | ✅  | ✅  |
| M4  | Webhook de confirmação de pagamento (Asaas)           | ✅  | ✅  |
| M5  | Dashboard de inadimplência em tempo real (SSE)        | ✅  | ✅  |
| M6  | Régua de cobrança WhatsApp (D-3, D-0, D+3, on-demand) | ✅  | ✅  |
| M7  | Autenticação JWT com refresh token rotativo           | ✅  | ✅  |
| M8  | RBAC: Admin / Tesoureiro                              | ✅  | ✅  |
| M9  | Stub de atletas (schema + CRUD base)                  | ✅  | ✅  |
| M10 | Contratos e alertas de BID/CBF                        | ✅  | ✅  |
| M11 | Multi-Acquiring PIX (fallback de gateway)             | ✅  | —   |
| M12 | Criptografia AES-256 de CPF/telefone em repouso       | ✅  | —   |
| M13 | Audit log imutável (todas operações financeiras)      | ✅  | —   |
| M14 | Site de marketing público (landing, preços, contato)  | —   | ✅  |

### v1.0 — SHOULD (100% ✅ — concluídos na Sprint 6)

| #   | Feature                                          | API | Web |
| --- | ------------------------------------------------ | --- | --- |
| S1  | Tela de cobranças PIX (frontend completo)        | ✅  | ✅  |
| S2  | Upload CSV de sócios exposto no frontend         | ✅  | ✅  |
| S3  | Carteirinha digital do sócio com QR Code (PWA)   | ✅  | ✅  |
| S4  | Conciliação bancária automática via OFX          | ✅  | ✅  |
| S5  | Painel de Transparência SAF (MVP pré-v2.0)       | ✅  | ✅  |
| S7  | Histórico de pagamentos por sócio (UI)           | ✅  | ✅  |
| S8  | Templates de mensagem personalizáveis (tela)     | ✅  | ✅  |
| S9  | Job D-0 WhatsApp (vencimento hoje)               | ✅  | —   |
| S10 | Registro de despesas do clube (P&L simplificado) | ✅  | ✅  |

> **Nota:** S6 (Relatório financeiro mensal PDF) foi migrado para S14 na v2.0 por dependência do Demonstrativo de Receitas integrado (M23). S11 (QR Code de portaria) foi migrado para S16 na v2.0 por dependência da infraestrutura de eventos.

### v1.5 "O Campo" — MUST (100% ✅)

| #   | Feature                                                            | API | Web |
| --- | ------------------------------------------------------------------ | --- | --- |
|     | PWA Offline-First (Workbox + Dexie.js + Background Sync)           | ✅  | ✅  |
|     | Tabela `workload_metrics` com Índice BRIN                          | ✅  | —   |
|     | `MATERIALIZED VIEW` ACWR + refresh CONCURRENTLY                    | ✅  | —   |
|     | Job BullMQ `refresh-acwr-aggregates`                               | ✅  | —   |
|     | Biblioteca de Exercícios (grid visual / prancheta tática)          | ✅  | ✅  |
|     | Chamada Digital offline-first (swipes + Zustand + Background Sync) | ✅  | ✅  |
|     | Ranking de Assiduidade + alerta de escalação                       | ✅  | ✅  |
|     | Avaliação Técnica por microciclo (PDF)                             | ✅  | ✅  |
|     | Registro RPE 1–10 (slider PWA padrão FIFA)                         | ✅  | ✅  |
|     | Ingestão HealthKit/Google Fit (hardware-agnostic)                  | ✅  | —   |
|     | Dashboard ACWR Verde/Amarelo/Vermelho                              | ✅  | ✅  |
|     | Job semanal BullMQ — relatório para responsáveis (WhatsApp)        | ✅  | —   |
|     | Formulário de Peneiras (rota pública `(marketing)`)                | ✅  | ✅  |
|     | Aceite Parental Digital (IP + Timestamp + SHA-256)                 | ✅  | ✅  |
|     | Job de Expurgo LGPD (hard delete > 24 meses)                       | ✅  | —   |

### v2.0 "O Vestiário" — MUST (100% ✅)
* **FisioBase:** Role PHYSIO, Prontuário AES-256, Status RTP, Correlação Carga × Lesão.
* **SAF Compliance:** Dashboard acionistas, Passivos Trabalhistas, Balanços SHA-256 imutáveis.
```
