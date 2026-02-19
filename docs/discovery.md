+-----------------------------------------------------------------------+
| **ClubOS**                                                            |
|                                                                       |
| Sistema Operacional para Clubes de Futebol                            |
+-----------------------------------------------------------------------+

+-----------------------------------------------------------------------+
| **FASE 1 --- FUNDAÇÃO E DISCOVERY**                                   |
|                                                                       |
| Semanas 1 e 2 \| Módulo ClubOS v1.0                                   |
|                                                                       |
| **Gestão Financeira & Sócios**                                        |
+-----------------------------------------------------------------------+

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  *📌 Nenhuma linha de código é escrita nesta fase. O objetivo central é reduzir incerteza, validar hipóteses e definir com precisão o problema que o ClubOS resolve.*

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **1 IDENTIFICAÇÃO DO PROBLEMA**

  -----------------------------------------------------------------------

**A Dor Central**

Clubes de futebol amador e semiprofissional no Brasil operam financeiramente no caos. A tríade que destrói a saúde financeira de um clube é composta por três elementos que se retroalimentam:

  -----------------------------------------------------------------------------------------------------------------------------------------
  **Problema**                       **Causa Raiz**                                    **Impacto Financeiro**
  ---------------------------------- ------------------------------------------------- ----------------------------------------------------
  Inadimplência alta (35--40%)       Cobrança manual e irregular por WhatsApp/Pix      R\$ 2.000--8.000/mês perdidos por clube

  Sem visibilidade financeira        Tesoureiro usa planilha Excel fragmentada         Decisões às cegas; clube não sabe se está no lucro

  Cadastro de sócios desatualizado   Sem sistema; dados em papel, WhatsApp e memória   Impossível planejar, cobrar ou fidelizar
  -----------------------------------------------------------------------------------------------------------------------------------------

**A Declaração de Problema**

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  *\"Presidentes e tesoureiros de clubes de futebol amador perdem uma receita significativa todo mês por inadimplência, por não terem um sistema de cobrança recorrente automatizado e um cadastro de sócios centralizado --- dependendo hoje de WhatsApp, Pix manual e planilhas.\"*

  -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Por que Este é o Produto Certo para Começar**

O ClubOS v1.0 é o produto âncora por três razões estratégicas que se reforçam:

-   **ROI rápido:** Dor financeira imediata: a inadimplência é mensurável e dói no bolso toda virada de mês. O ROI é visível em semanas.

-   **Fundação estrutural:** Dados que alimentam o ecossistema: o cadastro de sócios e atletas gerado no v1.0 é o pré-requisito de todos os módulos seguintes (ArenaPass, TreinoOS, ScoutLink).

-   **Venda direta:** CAC praticamente zero: o presidente do clube é o decisor único. Uma conversa no WhatsApp fecha a venda quando a proposta de valor é clara.

  -----------------------------------------------------------------------
  **2 USER RESEARCH**

  -----------------------------------------------------------------------

**Perfis a Entrevistar**

Distribuição recomendada de 12 a 15 entrevistas nas primeiras duas semanas, priorizando quem sente a dor financeira diretamente:

  ------------------------------------------------------------------------------------------------------------------------------------------
  **Perfil**                        **Por que entrevistar**                                **\# Entrevistas**   **Canais de Acesso**
  --------------------------------- ------------------------------------------------------ -------------------- ----------------------------
  Presidente de clube amador        Tomador de decisão e pagador. Sente a dor do caixa.    5                    WhatsApp, grupos de FB

  Tesoureiro / Diretor financeiro   Usuário primário do sistema. Opera a planilha hoje.    4                    Indicação do presidente

  Secretário de clube               Faz cadastro manual; sofre com atualização de dados.   3                    Indicação do presidente

  Sócio-torcedor ativo              Validar experiência de pagamento e adesão.             3                    Grupos e fóruns de torcida
  ------------------------------------------------------------------------------------------------------------------------------------------

**Roteiro de Entrevista --- Presidente / Tesoureiro**

As perguntas abaixo seguem a estrutura Jobs-to-be-Done (JTBD): entender o contexto atual, a frustração com as soluções vigentes e o que a pessoa realmente precisa realizar.

**Bloco 1 --- Contexto (5 min)**

-   Quantos sócios pagantes vocês têm atualmente? Qual o valor da mensalidade?

-   Como vocês gerenciam os pagamentos hoje? Me conta o passo a passo de quando um sócio paga.

-   Quem é o responsável por cobrar? Quantas horas por semana essa pessoa dedica a isso?

**Bloco 2 --- A Dor (10 min)**

-   Qual percentual dos sócios vocês estimam que estão inadimplentes agora?

-   O que acontece quando um sócio para de pagar? Qual o processo?

-   Já tentaram usar alguma ferramenta para organizar isso? O que funcionou e o que não funcionou?

-   O que é mais frustrante na gestão financeira do clube hoje? Se você pudesse eliminar uma dor amanhã, qual seria?

**Bloco 3 --- Soluções Atuais (5 min)**

-   Vocês usam planilha, app ou algum sistema? Me mostra como funciona.

-   Quanto pagam por essa solução? O que ela resolve bem? O que ela não resolve?

-   Por que ainda não migraram para um sistema de cobrança automática?

**Bloco 4 --- Visão do Ideal (5 min)**

-   Se existisse uma ferramenta ideal para a gestão de sócios, o que ela faria?

-   O que te faria adotar uma ferramenta nova essa semana?

-   Quanto você pagaria por mês por algo que resolvesse esse problema?

**Hipóteses a Validar nas Entrevistas**

As hipóteses a seguir devem ser explicitamente testadas --- não assumidas --- durante as conversas:

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **\#**   **Hipótese**                                                                  **Status Inicial**   **Validar Como**
  -------- ----------------------------------------------------------------------------- -------------------- -----------------------------------------------------------
  H1       A inadimplência média dos clubes entrevistados é ≥ 30%                        A Validar            Pedir dados concretos; não aceitar estimativa vaga

  H2       O presidente toma a decisão de compra sem comitê                              A Validar            Perguntar diretamente quem aprovaria a contratação

  H3       Clube pagaria R\$ 149--349/mês se a ferramenta reduzir inadimplência em 25%   A Validar            Apresentar proposta de valor e teste de preço direto

  H4       WhatsApp é o principal canal de cobrança manual atual                         Alta confiança       Confirmar em todas entrevistas

  H5       Tesoureiro leva ≥ 4h/semana em tarefas manuais de cobrança                    A Validar            Pedir estimativa de tempo; observe a planilha se possível
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **3 BENCHMARKING**

  -----------------------------------------------------------------------

**Mapa da Concorrência**

O mercado de gestão de clubes amadores no Brasil é fragmentado. Os competidores diretos são fracos no core financeiro; os indiretos dominam o mercado mas não resolvem o problema. Isso cria uma janela de oportunidade clara para o ClubOS.

  -----------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Concorrente**   **Tipo**           **Cobrança Auto**   **CRM Sócios**   **Preço/mês**        **Gap Principal**
  ----------------- ------------------ ------------------- ---------------- -------------------- ------------------------------------------------------------------
  Footure           SaaS vertical      Parcial             Sim              \~R\$ 199            Fraco em régua de cobrança e automação WhatsApp

  LFT Club          SaaS vertical      Não                 Básico           \~R\$ 99             UI ruim, sem Pix nativo, sem dashboard financeiro

  Federapp          SaaS vertical      Não                 Não              Grátis/Pago          Foco em campeonato, não em gestão de sócios

  Asaas / Iugu      Fintech geral      Sim                 Não              \% sobre transação   Não é específico para clubes; sem régua de cobrança por WhatsApp

  Planilha Excel    Solução manual     Não                 Não              Grátis               Zero automação; erro humano constante; sem histórico

  WhatsApp + Pix    Solução informal   Não                 Não              Grátis               Zero rastreabilidade; esquecimento é a norma
  -----------------------------------------------------------------------------------------------------------------------------------------------------------------

**Posicionamento Competitivo do ClubOS v1.0**

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  *✅ O diferencial do ClubOS não é ter mais features --- é ser o único produto construído em torno do ciclo de cobrança completo: Pix automático + régua de WhatsApp + dashboard de inadimplência + cadastro de sócio integrado. Nenhum concorrente atual fecha esse loop.*

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

**Análise de Features --- ClubOS vs. Mercado**

  -----------------------------------------------------------------------------------------------------------------------------------
  **Feature**                       **ClubOS v1.0**   **Footure**   **LFT Club**   **Asaas**     **Observação**
  --------------------------------- ----------------- ------------- -------------- ------------- ------------------------------------
  Cobrança Pix automática           ✅                ⚠️ Parcial    ❌             ✅            ClubOS = nativo para clubes

  Régua de cobrança via WhatsApp    ✅                ❌            ❌             ❌            Diferencial exclusivo

  Dashboard de inadimplência RT     ✅                ⚠️ Básico     ❌             ⚠️ Genérico   ClubOS = específico para clubes

  Carteirinha digital com QR        ✅                ✅            ❌             ❌            Paridade com Footure

  Planos de sócio configuráveis     ✅                ✅            ⚠️ Básico      ❌            Paridade necessária

  Relatório financeiro exportável   ✅                ✅            ❌             ✅            Paridade com Footure

  Integração com módulos futuros    ✅ Nativo         ❌            ❌             ❌            Moat de longo prazo do ecossistema
  -----------------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **4 DEFINIÇÃO DE SUCESSO --- KPIs**

  -----------------------------------------------------------------------

**Estrutura de Métricas**

Os KPIs foram organizados em três camadas: métricas de tração (ativação e adoção), métricas de resultado (valor entregue ao clube) e métricas de negócio (sustentabilidade financeira do ClubOS). A Fase 1 já define as metas de todas as camadas para orientar o MVP.

**Camada 1 --- Tração (Semanas 1--4 pós-lançamento)**

  ----------------------------------------------------------------------------------------------------------------------------------
  **KPI**                           **Meta Mínima**          **Meta Ideal**           **Como Medir**                **Frequência**
  --------------------------------- ------------------------ ------------------------ ----------------------------- ----------------
  Clubes cadastrados no piloto      5 clubes                 10 clubes                Painel admin ClubOS           Semanal

  Sócios importados / cadastrados   150 sócios               500 sócios               Contagem no banco de dados    Semanal

  Cobranças Pix geradas             ≥ 1 cobrança/clube/mês   100% dos sócios ativos   Relatório de transações       Mensal

  Régua de WhatsApp ativa           ≥ 3 clubes usam          100% dos clubes          Log de envios na plataforma   Semanal

  DAU / WAU (uso ativo)             ≥ 1 login/semana/clube   ≥ 3 logins/semana        Analytics de sessão           Semanal
  ----------------------------------------------------------------------------------------------------------------------------------

**Camada 2 --- Resultado para o Clube (30--60 dias)**

  -----------------------------------------------------------------------------------------------------------------------------------
  **KPI**                                **Meta Mínima**      **Meta Ideal**    **Como Medir**                       **Frequência**
  -------------------------------------- -------------------- ----------------- ------------------------------------ ----------------
  Redução de inadimplência por clube     ≥ 25%                ≥ 40%             Comparativo antes/depois com clube   30 e 60 dias

  Receita recuperada / clube             ≥ R\$ 1.000/mês      ≥ R\$ 4.000/mês   Soma de Pix pagos via plataforma     Mensal

  NPS do clube (presidente/tesoureiro)   ≥ 40                 ≥ 70              Pesquisa pós-onboarding (30 dias)    Aos 30 dias

  Tempo economizado (cobrança manual)    ≥ 3h/semana          ≥ 6h/semana       Relato qualitativo + estimativa      30 dias

  Incidentes críticos reportados         \< 3 bugs críticos   0 bugs críticos   Relatos dos clubes piloto            Semanal
  -----------------------------------------------------------------------------------------------------------------------------------

**Camada 3 --- Negócio ClubOS (Mês 1--3)**

  ---------------------------------------------------------------------------------------------------------------------------------
  **KPI**                                 **Meta Mínima**   **Meta Ideal**   **Como Medir**                        **Frequência**
  --------------------------------------- ----------------- ---------------- ------------------------------------- ----------------
  MRR (Receita Recorrente Mensal)         R\$ 750/mês       R\$ 2.000/mês    Soma de assinaturas ativas            Mensal

  Receita transacional (Pix)              R\$ 200/mês       R\$ 800/mês      1,5% sobre volume processado          Mensal

  Churn de clubes (30 dias)               \< 20%            \< 10%           Cancelamentos / clubes ativos         Mensal

  CAC (Custo de Aquisição por clube)      \< R\$ 200        \< R\$ 80        Custo de vendas / novos clubes        Mensal

  Payback estimado por cliente            \< 6 meses        \< 3 meses       CAC / MRR médio por cliente           Mensal

  Clubes com 100 usuários ativos em 30d   1 clube           3 clubes         Contagem de sócios com acesso ativo   Aos 30 dias
  ---------------------------------------------------------------------------------------------------------------------------------

**Critérios de Go/No-Go para Fase 2**

Ao final das Semanas 1-2, a Fase 1 é considerada concluída com sucesso se todas as condições abaixo forem atendidas antes de se escrever a primeira linha de código:

  ---------------------------------------------------------------------------------------------------------------------------
       **Critério**                                                                       **Status Alvo**   **Responsável**
  ---- ---------------------------------------------------------------------------------- ----------------- -----------------
  ✅   Pelo menos 10 entrevistas com presidentes/tesoureiros realizadas                   Concluído         Fundador

  ✅   Hipóteses H1 a H5 marcadas como Confirmada, Refutada ou Incerta com evidência      Concluído         Fundador

  ✅   Pelo menos 3 clubes comprometidos a testar o MVP (carta de intenção informal OK)   Concluído         Fundador

  ✅   Problema principal e declaração de valor revisados com base nas entrevistas        Concluído         Fundador

  ✅   KPIs do negócio acordados e documentados neste artefato                            Concluído         Fundador

  ✅   Posição competitiva clara: por que o ClubOS ganha vs. concorrentes mapeados        Concluído         Fundador
  ---------------------------------------------------------------------------------------------------------------------------

  -----------------------------------------------------------------------
  **5 CRONOGRAMA DAS 2 SEMANAS**

  -----------------------------------------------------------------------

  ----------------------------------------------------------------------------------------------------------------------------------------------------------------
  **Período**   **Atividade Principal**                                                      **Entregável**                         **Critério de Conclusão**
  ------------- ---------------------------------------------------------------------------- -------------------------------------- ------------------------------
  Dia 1--2      Definir perfis-alvo e montar lista de contatos para entrevistas              Lista de 20+ contatos segmentados      Lista pronta e priorizada

  Dia 3--5      Realizar 5 primeiras entrevistas (presidentes e tesoureiros)                 Notas estruturadas por JTBD            5 entrevistas transcritas

  Dia 5         Benchmarking: testar Footure, LFT Club e Asaas com conta real                Matriz competitiva preenchida          Tabela comparativa validada

  Dia 6--8      Realizar 5 entrevistas adicionais; ajustar hipóteses conforme aprendizados   Hipóteses atualizadas                  H1--H5 classificadas

  Dia 9--10     Sintetizar achados; definir proposta de valor final do MVP                   1-pager de proposta de valor           Revisado por 2 entrevistados

  Dia 10--12    Confirmar KPIs com stakeholders; buscar compromisso dos 3 clubes piloto      KPIs assinados; 3 clubes confirmados   Documento presente aprovado

  Dia 13--14    Revisão final; briefing para início da Fase 2 (design + arquitetura)         Documento de Discovery finalizado      Go/No-Go = GO
  ----------------------------------------------------------------------------------------------------------------------------------------------------------------

+-----------------------------------------------------------------------+
| ClubOS \| Fase 1: Fundação e Discovery \| Fevereiro 2026              |
|                                                                       |
| *\"A v1.0 não é o começo da plataforma --- ela é o produto.\"*        |
+-----------------------------------------------------------------------+
