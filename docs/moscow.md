# Escopo MoSCoW — ClubOS v2.0 "O Vestiário"

> **Janela do módulo:** ~6 semanas de desenvolvimento (Semanas 15–20).
> **Critério de corte:** tudo que não for necessário para validar a hipótese principal da v2.0 fica para a v2.5.
>
> **Hipótese principal:** o FisioBase reduz a recidiva de lesão em ≥ 1 clube documentado nos primeiros 60 dias e pelo menos 3 SAFs entram em conformidade com a Lei 14.193/2021 via painel do ClubOS.
>
> **Versões anteriores:** v1.0 (O Cofre do Clube) e v1.5 (O Campo) concluídas com 100% dos itens MUST entregues.

---

## Status de Implementação

> Legenda: ✅ Implementado · ⚠️ Parcial · ⬜ Pendente

---

## MUST HAVE — Sem isso, não há produto vendável na v2.0

| #   | Feature                                                              | Critério de Aceite                                                             | Complexidade | API | Web |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------ | --- | --- |
| M15 | Ativação do role PHYSIO (RBAC + guards + JWT)                        | Fisioterapeuta acessa prontuário; treinador não acessa dados clínicos          | Baixa · 0.5d | ⬜  | ⬜  |
| M16 | Schema + CRUD de prontuário esportivo (criptografado AES-256)        | Lesão registrada, histórico consultável, dados clínicos nunca expostos a COACH | Alta · 2d    | ⬜  | ⬜  |
| M17 | Status de Retorno ao Jogo (RTP) por atleta com isolamento de roles   | COACH vê semáforo; PHYSIO vê status + notas clínicas; sem bypass possível      | Média · 1d   | ⬜  | ⬜  |
| M18 | Biblioteca de protocolos de retorno (20 protocolos FIFA Medical)     | Fisio atribui protocolo em < 30s; histórico de aplicação registrado            | Média · 1d   | ⬜  | ⬜  |
| M19 | Correlação carga × lesão (BaseForte + FisioBase)                     | Dashboard mostra atletas com ACWR > 1.3 e histórico de lesão no mesmo período  | Alta · 1d    | ⬜  | ⬜  |
| M20 | Audit log de acesso a dados médicos (LGPD)                           | Qualquer leitura de prontuário gera entrada em `data_access_log`               | Baixa · 0.5d | ⬜  | —   |
| M21 | Dashboard SAF com KPIs para acionistas                               | Receita, passivos e compliance visíveis em uma tela; exportável                | Média · 1d   | ⬜  | ⬜  |
| M22 | Módulo de Passivos Trabalhistas (CRUD + PDF assinado + hash SHA-256) | Credor cadastrado e PDF publicado em < 5 min; hash imutável no audit_log       | Média · 1d   | ⬜  | ⬜  |
| M23 | Demonstrativo de Receitas integrado (sócios + cobranças + despesas)  | Query consolida todas as fontes; saldo real visível ao tesoureiro por período  | Média · 1d   | ⬜  | ⬜  |
| M24 | Publicação de balanços com hash SHA-256 e URL pública                | Balanço publicado e imutável; URL por clube compartilhável                     | Média · 1d   | ⬜  | ⬜  |
| M25 | Provisionamento DDL tenant v2.0 (novas tabelas idempotentes)         | `provisionTenantSchema` atualizado; sem migração manual em clubes existentes   | Média · 0.5d | ⬜  | —   |

**Total estimado MUST v2.0:** ~10,5 dias de desenvolvimento

---

## SHOULD HAVE — Alta prioridade; entra na sprint seguinte ao MUST

| #   | Feature                                                              | Justificativa de Negócio                                                        | API | Web |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --- | --- |
| S12 | Relatório exportável para seguro/plano de saúde (PDF estruturado)    | Reembolso via plano valida a plataforma como ferramenta profissional do fisio   | ⬜  | ⬜  |
| S13 | Multi-fisio e multi-clube (painel único por profissional)            | Fisioterapeuta que atende mais de um clube paga uma única assinatura            | ⬜  | ⬜  |
| S14 | Relatório financeiro mensal PDF (S6 — pendente desde v1.0)           | Prestação de contas para diretoria; solicitado nos pilotos da v1.0              | ⬜  | ⬜  |
| S15 | Conciliação OFX aprimorada (aprovação em lote + exportação contábil) | Tesoureiro encerra mês em < 30 min; reduz honorários contábeis                  | ⬜  | ⬜  |
| S16 | Controle de acesso QR Code dinâmico de portaria (S11 — v1.0)         | Elimina CAPEX de catraca; log de acesso rastreável por evento                   | ⬜  | ⬜  |
| S17 | Testes E2E do fluxo FisioBase (cobertura ≥ 80%)                      | Dados clínicos exigem qualidade superior; regressões custam confiança do médico | ⬜  | —   |

---

## COULD HAVE — Desejável; entra na v2.5 ou posterior

| #   | Feature                                                              | Quando Entra                                                          |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| C15 | Histórico de lesão transferível entre clubes (consentimento digital) | v2.0 full ou v2.5 — depende de volume de usuários PHYSIO ativos       |
| C16 | Portal do atleta (auto-consulta de prontuário)                       | v2.5 — requer autenticação do atleta (novo tipo de usuário)           |
| C17 | Integração com plano de saúde via API (TISS)                         | v3.0 — complexidade regulatória fora do escopo atual                  |
| C18 | IA generativa para sugestão de protocolo por tipo de lesão           | v3.0+ — ROI incerto sem volume de prontuários validado                |
| C19 | PDV mobile (mPOS) para lanchonete/merchandising                      | v2.5 (ArenaPass full) — Stone ou SumUp; depende de bilheteria estável |
| C20 | Portal de votações internas (AGO/AGE)                                | v2.5 — módulo de engajamento pós-financeiro                           |

---

## WON'T HAVE — Explicitamente fora do escopo da v2.0

| #   | O que NÃO entra                | Por quê                                                          |
| --- | ------------------------------ | ---------------------------------------------------------------- |
| W8  | Previsão de lesões por ML      | Requer mínimo 2 temporadas de dados por atleta; sem volume ainda |
| W9  | Teleconsulta médica integrada  | Regulação CFM/ANS fora do escopo do produto                      |
| W10 | ArenaPass (Bilheteria)         | Módulo da v2.5 — esse é o foco após validar FisioBase            |
| W11 | ScoutLink                      | Módulo da v3.0 — requer 6 meses de dados BaseForte + FisioBase   |
| W12 | Multi-idioma (espanhol/inglês) | v4.0 — expansão internacional                                    |

---

## Resumo Visual

```
           API (apps/api)                          Web (apps/web)
MUST v2.0  ░░░░░░░░░░░░░░░░░░░░  Iniciando        ░░░░░░░░░░░░░░░░░░░░  Iniciando
           M15 a M25 ⬜                             M15 a M24 ⬜

SHOULD     ░░░░░░░░░░░░░░░░░░░░  v2.0+            ░░░░░░░░░░░░░░░░░░░░  v2.0+
           S12–S17 ⬜                               S12–S16 ⬜

COULD      ░░░░░░░░░░░░░░░░░░░░  v2.5+            v2.5+
WON'T      ✗                     fora do escopo   fora do escopo
```

---

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
