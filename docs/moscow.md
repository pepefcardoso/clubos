# Escopo MoSCoW — ClubOS v1.0

> **Janela do MVP:** 30 dias de desenvolvimento.  
> **Critério de corte:** tudo que não for necessário para validar a hipótese principal fica para depois.
>
> **Hipótese principal:** o ClubOS reduz inadimplência em ≥ 25% em 60 dias após ativação.

---

## MUST HAVE — Obrigatório no MVP

Sem estas features, o produto não pode ser vendido nem validar sua proposta de valor central.

| # | Feature | Critério de Aceite | Complexidade |
|---|---|---|---|
| M1 | Cadastro de clube (onboarding) com configuração de planos de sócio | Clube configura nome, logo, plano e valor em < 5 min | Média — 3 dias |
| M2 | Importação / cadastro manual de sócios (CSV ou formulário) | 200 sócios importados sem erro em < 10 min | Média — 2 dias |
| M3 | Geração de cobranças Pix com QR Code por sócio | Pix gerado e enviado em < 30s por sócio | Alta — 4 dias |
| M4 | Webhook de confirmação de pagamento Pix (Asaas) | Status do sócio atualiza em < 10s após pagamento | Alta — 3 dias |
| M5 | Dashboard de inadimplência em tempo real | Exibe total de adimplentes, inadimplentes e valor a receber | Média — 2 dias |
| M6 | Régua de cobrança via WhatsApp: D-3, D-0, D+3 | Mensagem enviada automaticamente nos 3 marcos | Alta — 4 dias |
| M7 | Autenticação segura (email/senha + refresh token) | Login funciona; sessão expira em 7 dias; 2FA opcional | Baixa — 1 dia |
| M8 | Controle de acesso por papel: Admin do clube / Tesoureiro | Tesoureiro não consegue apagar sócio; Admin sim | Baixa — 1 dia |

**Total estimado MUST:** ~20 dias de desenvolvimento

---

## SHOULD HAVE — Alta Prioridade, mas não bloqueia o launch

Estas features aumentam o valor percebido. Entram no MVP se o tempo permitir, ou na semana seguinte à validação.

| # | Feature | Justificativa |
|---|---|---|
| S1 | Carteirinha digital do sócio com QR Code (PWA) | Identidade digital; motiva o sócio a manter o pagamento em dia |
| S2 | Relatório financeiro mensal exportável em PDF | Prestação de contas para diretoria; pedido recorrente nas entrevistas |
| S3 | Registro de despesas do clube (P&L simplificado) | Completa a visão financeira; tesoureiro consegue ver saldo real |
| S4 | Histórico de pagamentos por sócio | Suporte a disputas; sócio pode consultar o próprio histórico |
| S5 | Notificações in-app para novos pagamentos | Feedback imediato ao tesoureiro sem precisar abrir o dashboard |

---

## COULD HAVE — Desejável, entra na Fase 2

Bom de ter, mas nenhum clube vai cancelar por falta dessas features no dia 1.

| # | Feature | Quando Entra |
|---|---|---|
| C1 | Portal de votações internas (AGO/AGE) | Fase 2 — módulo de engajamento |
| C2 | Cobrança por boleto como fallback ao Pix | Fase 2 — ampliar cobertura para sócios sem conta corrente |
| C3 | App mobile nativo (iOS/Android) | Fase 3 — PWA resolve o MVP sem custo de loja |
| C4 | Multi-idioma (espanhol/inglês) | Fase 4 — expansão internacional |
| C5 | Integração contábil (exportação SPED/NFSe) | Fase 2 — clubes semiprofissionais formalizados |

---

## WON'T HAVE — Explicitamente fora do MVP

Documentar o que **não** será feito é tão importante quanto o que será. Qualquer solicitação dessas funcionalidades durante o MVP deve ser redirecionada para o roadmap futuro.

| # | O que NÃO entra | Por quê |
|---|---|---|
| W1 | Integração com ArenaPass (bilheteria) | Módulo v1.5 — depende de v1.0 estável e validado |
| W2 | Gestão de atletas / TreinoOS | Módulo v2.0 — escopo completamente diferente |
| W3 | API pública para integrações de terceiros | Risco de segurança e suporte sem volume suficiente |
| W4 | Painel white-label para federações | B2B enterprise — complexidade desproporcional ao MVP |
| W5 | IA generativa para análise financeira | Custo de infra e complexidade sem ROI validado ainda |

---

## Resumo Visual

```
MUST   ████████████████████  ~20d  → Bloqueia o lançamento se ausente
SHOULD ████████░░░░░░░░░░░░  ~5d   → Entra se couber na janela de 30d
COULD  ░░░░░░░░░░░░░░░░░░░░  —     → Fase 2
WON'T  ✗                    —     → Fora do produto por ora
```

> **Regra de ouro:** a v1.0 não é "o começo da plataforma" — ela **é** o produto, e precisa ser lançada, vendida e validada antes de uma linha do módulo seguinte ser escrita.
