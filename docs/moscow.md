# Escopo MoSCoW — ClubOS v1.0

> **Janela do MVP:** 30 dias de desenvolvimento.
> **Critério de corte:** tudo que não for necessário para validar a hipótese principal fica para depois.
>
> **Hipótese principal:** o ClubOS reduz inadimplência em ≥ 25% em 60 dias após ativação.

---

## Status de Implementação (apps/web)

> Legenda: ✅ Implementado · ⚠️ Parcial (frontend OK, backend pendente) · ⬜ Pendente

---

## MUST HAVE — Obrigatório no MVP

Sem estas features, o produto não pode ser vendido nem validar sua proposta de valor central.

| #   | Feature                                                            | Critério de Aceite                                                                          | Complexidade    | Status |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------- | ------ |
| M1  | Cadastro de clube (onboarding) com configuração de planos de sócio | Clube configura nome, logo, plano e valor em < 5 min                                        | Média — 3 dias  | ✅ |
| M2  | Importação / cadastro manual de sócios (CSV ou formulário)         | 200 sócios importados sem erro em < 10 min                                                  | Média — 2 dias  | ⚠️ |
| M3  | Geração de cobranças Pix com QR Code por sócio                     | Pix gerado e enviado em < 30s por sócio                                                     | Alta — 4 dias   | ⬜ |
| M4  | Webhook de confirmação de pagamento Pix (Asaas)                    | Status do sócio atualiza em < 10s após pagamento                                            | Alta — 3 dias   | ⬜ |
| M5  | Dashboard de inadimplência em tempo real                           | Exibe total de adimplentes, inadimplentes e valor a receber                                 | Média — 2 dias  | ✅ |
| M6  | Régua de cobrança via WhatsApp: D-3, D-0, D+3                      | Mensagem enviada automaticamente nos 3 marcos                                               | Alta — 4 dias   | ⚠️ |
| M7  | Autenticação segura (email/senha + refresh token)                  | Login funciona; sessão expira em 7 dias; 2FA opcional                                       | Baixa — 1 dia   | ✅ |
| M8  | Controle de acesso por papel: Admin do clube / Tesoureiro          | Tesoureiro não consegue apagar sócio; Admin sim                                             | Baixa — 1 dia   | ✅ |
| M9  | Stub de cadastro de atletas (entidade base para módulos futuros)   | CRUD `/api/athletes` funcional com campos de identidade; atleta vinculado ao clube no banco | Baixa — 1.5 dia | ⬜ |

> **Por que M9 é MUST HAVE e não SHOULD HAVE?** A entidade `athlete` é a espinha dorsal de TreinoOS, BaseForte, FisioBase, ScoutLink e CampeonatOS. Criar esse schema em v1.0 — sem lógica de treino ou saúde — custa ~1.5d e evita uma migração dolorosa de dados ao iniciar a v1.5. Tudo que está fora do escopo do stub (carga ACWR, protocolos, avaliação técnica) permanece nas versões correspondentes.

**Total estimado MUST:** ~21.5 dias de desenvolvimento

### Notas de implementação por item

**M1 — Onboarding** ✅
`OnboardingWizard` com 3 etapas: `StepClubData` (nome, slug, CNPJ), `StepLogo` (upload com preview), `StepConfirmation`. Integrado com `POST /api/clubs`. Acessível em `/onboarding`.

**M2 — Cadastro de sócios** ⚠️
Formulário manual (`MemberFormModal`) implementado com validação Zod, suporte a plano vinculado, campos CPF/telefone/e-mail. **Pendente:** importação via CSV (funcionalidade de bulk import não exposta no frontend ainda).

**M3 — Cobranças Pix** ⬜
A rota `/charges` aparece na sidebar marcada como "Em breve". Nenhuma tela de cobrança existe no frontend. Depende do backend Asaas estar integrado.

**M4 — Webhook de pagamento** ⬜
Responsabilidade do backend (`apps/api`). O frontend consome o resultado via SSE (`useRealTimeEvents`) ao receber `PAYMENT_CONFIRMED` — hook implementado e funcionando.

**M5 — Dashboard** ✅
`DashboardClient` com: `DashboardKpis` (totais de sócios, cobranças pendentes, pagamentos do mês), `DelinquencyChart` (histórico 6 meses, via Recharts), `OverdueMembersTable` (paginada, com botão "Lembrar" por sócio). Atualização via SSE sem polling.

**M6 — Régua de cobrança WhatsApp** ⚠️
Jobs automáticos D-3/D-0/D+3 são responsabilidade do backend. O frontend tem o envio on-demand implementado: hook `useRemindMember` chama `POST /api/members/:id/remind`, com tratamento de erro 429 (rate limit) no `OverdueMembersTable`.

**M7 — Autenticação** ✅
`AuthProvider` com JWT 15min em memória + refresh token 7d em httpOnly cookie. `getAccessToken()` deduplica refreshes concorrentes via `refreshPromiseRef`. Bootstrap transparente no mount. Tratamento de `AuthApiError` (401 → mensagem amigável na tela de login).

**M8 — Controle de acesso** ✅
`user.role` extraído do JWT payload no cliente. `isAdmin` verificado em `MembersPage` (oculta "Novo sócio" e coluna de ações), `PlansPage` (oculta "Novo plano", editar e excluir). Tesoureiro tem visão de leitura apenas.

**M9 — Stub de atletas** ⬜
Não existe rota, componente ou entrada de navegação para atletas no frontend. A ser implementado.

---

## SHOULD HAVE — Alta Prioridade, mas não bloqueia o launch

Estas features aumentam o valor percebido. Entram no MVP se o tempo permitir, ou na semana seguinte à validação.

| #   | Feature                                                                                           | Justificativa                                                                                                                                                                                                                                  | Status |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S1  | Carteirinha digital do sócio com QR Code (PWA)                                                    | Identidade digital; motiva o sócio a manter o pagamento em dia                                                                                                                                                                                 | ⬜ |
| S2  | Relatório financeiro mensal exportável em PDF                                                     | Prestação de contas para diretoria; pedido recorrente nas entrevistas                                                                                                                                                                          | ⬜ |
| S3  | Registro de despesas do clube (P&L simplificado)                                                  | Completa a visão financeira; tesoureiro consegue ver saldo real                                                                                                                                                                                 | ⬜ |
| S4  | Histórico de pagamentos por sócio                                                                 | Suporte a disputas; sócio pode consultar o próprio histórico                                                                                                                                                                                   | ⬜ |
| S5  | Notificações in-app para novos pagamentos                                                         | Feedback imediato ao tesoureiro sem precisar abrir o dashboard                                                                                                                                                                                 | ⬜ |
| S6  | Site de marketing: landing page, página de preços e página de contato (route group `(marketing)`) | Necessário para converter os primeiros clubes pagantes além do piloto. Os 3 clubes do piloto podem ser onboardados manualmente, mas a meta de 10 pagantes exige canal de aquisição próprio. Custo baixo (~2.5d) justifica entrada no Sprint 1. | ✅ |

### Nota S6 — Marketing implementado

As três páginas do route group `(marketing)` estão completas:

- **Landing (`/`)** — `HeroSection`, `SocialProofBar`, `ValuePropositionSection`, `FeaturesSection`, `TestimonialsSection`, `FinalCtaSection`
- **Preços (`/precos`)** — `PricingSection`, `PricingFaqSection`, `FinalCtaSection`
- **Contato (`/contato`)** — `ContactForm` com validação Zod, API route com rate limiting (5 req/60s por IP) e envio via Resend

`MarketingHeader` e `MarketingFooter` compartilhados entre as 3 páginas. Header com navegação sticky, backdrop blur, menu mobile. Footer em fundo escuro com links de produto, conta e legal.

---

## COULD HAVE — Desejável, entra na Fase 2

Bom de ter, mas nenhum clube vai cancelar por falta dessas features no dia 1.

| #   | Feature                                    | Quando Entra                                              |
| --- | ------------------------------------------ | --------------------------------------------------------- |
| C1  | Portal de votações internas (AGO/AGE)      | Fase 2 — módulo de engajamento                            |
| C2  | Cobrança por boleto como fallback ao Pix   | Fase 2 — ampliar cobertura para sócios sem conta corrente |
| C3  | App mobile nativo (iOS/Android)            | Fase 3 — PWA resolve o MVP sem custo de loja              |
| C4  | Multi-idioma (espanhol/inglês)             | Fase 4 — expansão internacional                           |
| C5  | Integração contábil (exportação SPED/NFSe) | Fase 2 — clubes semiprofissionais formalizados            |

---

## WON'T HAVE — Explicitamente fora do MVP

Documentar o que **não** será feito é tão importante quanto o que será. Qualquer solicitação dessas funcionalidades durante o MVP deve ser redirecionada para o roadmap futuro.

| #   | O que NÃO entra                                                 | Por quê                                                                                                                                                           |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | Integração com ArenaPass (bilheteria)                           | Módulo v1.5 — depende de v1.0 estável e validado                                                                                                                  |
| W2  | Gestão de atletas / TreinoOS                                    | Módulo v2.0 — escopo completamente diferente. **Nota:** o stub de identidade do atleta (M9) é a exceção deliberada — criar a entidade não é implementar o módulo. |
| W3  | API pública para integrações de terceiros                       | Risco de segurança e suporte sem volume suficiente                                                                                                                |
| W4  | Painel white-label para federações                              | B2B enterprise — complexidade desproporcional ao MVP                                                                                                              |
| W5  | IA generativa para análise financeira                           | Custo de infra e complexidade sem ROI validado ainda                                                                                                              |
| W6  | Blog, docs públicos ou A/B testing de copy no site de marketing | Volume insuficiente no MVP para justificar a complexidade. Se necessário, extrai-se `apps/landing/` do monorepo em versão futura.                                 |

---

## Resumo Visual

```
MUST   ████████████████████  ~21.5d → Bloqueia o lançamento se ausente
         M1 ✅  M2 ⚠️  M3 ⬜  M4 ⬜  M5 ✅  M6 ⚠️  M7 ✅  M8 ✅  M9 ⬜
SHOULD ████████░░░░░░░░░░░░  ~7.5d  → S6 ✅ entregue; S1–S5 pendentes
COULD  ░░░░░░░░░░░░░░░░░░░░  —      → Fase 2
WON'T  ✗                    —      → Fora do produto por ora
```

> **Regra de ouro:** a v1.0 não é "o começo da plataforma" — ela **é** o produto, e precisa ser lançada, vendida e validada antes de uma linha do módulo seguinte ser escrita.

---

## Próximos passos (frontend)

Itens pendentes para fechar o MUST HAVE no frontend, em ordem de prioridade:

1. **M3 — Tela de cobranças:** CRUD de cobranças Pix, exibição de QR Code, status por sócio. Depende do backend Asaas.
2. **M9 — Stub de atletas:** rota `/athletes`, tela básica de listagem/cadastro, entrada na sidebar.
3. **M2 — Importação CSV:** adicionar fluxo de upload em lote na `MembersPage`.
