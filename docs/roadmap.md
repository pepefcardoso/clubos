# Roadmap Estratégico — ClubOS v1.0 → v3.5

> **Documento de visão de longo prazo.** Define módulos, sequência de lançamento, dependências entre módulos e critérios de go/no-go por versão.
>
> **Regra de planejamento:** `moscow.md` e `backlog.md` cobrem apenas o módulo em desenvolvimento ativo. Ao iniciar uma nova versão, esses documentos são atualizados com o escopo daquele módulo. Detalhar tarefas de módulos futuros antes do tempo é desperdício — o contexto muda.

---

## Visão Geral

O ClubOS é uma plataforma modular — um sistema operacional para clubes de futebol amador e semiprofissional — composta por 7 módulos lançados em 6 versões ao longo de aproximadamente 12 meses.

A lógica central do roadmap: **primeiro organize o dinheiro, depois o treino, depois a saúde, depois o estádio, depois o talento, depois o campeonato.** Cada camada torna a anterior mais valiosa e aumenta o custo de saída para o cliente.

| Versão | Codinome         | Módulos              | Período    | Meta de Validação                               |
| ------ | ---------------- | -------------------- | ---------- | ----------------------------------------------- |
| v1.0   | O Cofre do Clube | ClubOS (financeiro)  | Sem. 1–6   | 10 clubes pagantes; inadimplência ↓25%          |
| v1.5   | O Campo          | TreinoOS + BaseForte | Sem. 7–12  | 60% dos clubes v1.0 ativam módulo de treino     |
| v2.0   | O Vestiário      | FisioBase            | Sem. 13–20 | Redução documentada de recidiva em 3+ clubes    |
| v2.5   | A Arquibancada   | ArenaPass            | Sem. 21–26 | Clube aumenta receita/jogo em 40%+              |
| v3.0   | A Vitrine        | ScoutLink            | Mês 7–9    | 1º contato scout–escola mediado pela plataforma |
| v3.5   | A Liga           | CampeonatOS          | Mês 10–12  | 1 campeonato completo gerenciado end-to-end     |

---

## Versão 1.0 — "O Cofre do Clube"

**Período:** Semanas 1–6 | **Módulo:** ClubOS (Financeiro + Sócio-Torcedor)

### Justificativa

A v1.0 não é apenas o MVP — é a fundação de dados de todo o ecossistema. O cadastro de sócios criado aqui é reutilizado por TreinoOS, BaseForte, ArenaPass e ScoutLink. A dor financeira (inadimplência de 40%) é o argumento de venda mais rápido: o clube vê ROI no primeiro mês.

### Features Must Have

> Detalhamento completo de tarefas em `backlog.md`. Priorização em `moscow.md`.

- Cadastro do clube (onboarding multi-step: nome, logo, planos de sócio em < 5 min)
- Importação de sócios via CSV ou cadastro manual (bulk insert idempotente por CPF)
- Geração de cobranças Pix com QR Code por sócio via Asaas
- Webhook de confirmação de pagamento (HMAC-SHA256, async BullMQ, idempotência por `gateway_txid`)
- Dashboard de inadimplência em tempo real (KPIs + gráfico 6 meses + SSE)
- Régua de cobrança via WhatsApp (jobs D-3, D-0, D+3 — rate limit 30 msg/min — fallback e-mail Resend)
- Autenticação segura (JWT 15min + refresh httpOnly 7d — roles ADMIN e TREASURER)

### Features Should Have (entram se o tempo permitir)

- Carteirinha digital do sócio com QR Code (PWA)
- Relatório financeiro mensal exportável em PDF
- Registro de despesas do clube (P&L simplificado)
- Histórico de pagamentos por sócio
- Notificações in-app para novos pagamentos

### Critério de Go/No-Go

- Piloto com 3 clubes por 30 dias
- Inadimplência média reduzida em ≥ 20%
- Pelo menos 1 clube disposto a pagar pelo plano mensal
- Zero incidentes de duplicidade de cobrança ou falha silenciosa em produção

---

## Versão 1.5 — "O Campo"

**Período:** Semanas 7–12 | **Módulos:** TreinoOS + BaseForte (unificados)

### Justificativa

Upsell natural para clubes da v1.0: o cadastro de atletas já existe, o treinador já usa o sistema. Fricção de onboarding próxima de zero. O segundo modelo de receita — pai pagando diretamente pelo relatório do filho — cria uma camada B2C que não depende da inadimplência do clube.

TreinoOS e BaseForte são unificados porque compartilham o mesmo usuário principal (treinador), o mesmo dado central (atleta) e o mesmo momento de uso (sessão de treino).

### Escopo de Alto Nível

**TreinoOS — Planejamento Técnico**

- Biblioteca de exercícios categorizados (40 pré-carregados + customizáveis)
- Montagem de sessão em formato de prancheta visual
- Chamada digital: presença em 30s por app mobile
- Ranking de assiduidade por posição com alerta de escalação
- Avaliação técnica por microciclo (competências 1–5, exportação PDF)
- Alerta de desequilíbrio de tipos de exercício ao longo de semanas

**BaseForte — Carga e Saúde de Base**

- Registro de treino via app: tipo, intensidade RPE 1–10 (padrão FIFA), duração
- Cálculo automático de carga ACWR por atleta com sinalização de zona de risco
- Relatório semanal automático para pais via WhatsApp/e-mail (linguagem acessível)
- Integração com FisioBase na v2.0 para correlação carga x lesão
- Hardware opcional (Fase 2): pulseira ESP32 + sensor FC (BOM < R$80)

> Detalhamento de tarefas e priorização serão feitos em `backlog.md` e `moscow.md` no início da v1.5.

### Critério de Go/No-Go

- 60% dos clubes da v1.0 ativam o módulo de treino
- Treinador usa por 4 semanas consecutivas sem lembrete externo
- Pelo menos 5 pais pagando o relatório premium (valida camada B2C)
- Dados de ACWR sendo gerados consistentemente para ≥ 80% dos atletas ativos

---

## Versão 2.0 — "O Vestiário"

**Período:** Semanas 13–20 | **Módulo:** FisioBase

### Justificativa

O FisioBase depende dos dados de carga do TreinoOS para entregar sua funcionalidade mais valiosa: correlação entre carga de treino alta e queixa muscular ativa como preditor de lesão. Sem a v1.5 rodando, FisioBase é apenas um prontuário digital — útil, mas sem diferencial analítico.

O fisioterapeuta é o usuário pagador central, não o clube. Isso cria uma base de receita mais resiliente.

### Escopo de Alto Nível

- Prontuário esportivo simplificado (histórico de lesões, protocolos, evolução por sessão)
- Status de retorno ao jogo visível para o treinador em tempo real (Afastado / Retorno Progressivo / Liberado)
- Multi-clube e multi-fisio: painel único, histórico transferível com permissão
- Separação de permissões: treinador vê status, nunca dados clínicos privados
- Biblioteca de protocolos baseada em evidência (FIFA Medical, PRP, entorses)
- Relatório para seguro/plano de saúde (exportação estruturada para reembolso)
- Correlação carga x lesão integrada com BaseForte

> Detalhamento de tarefas e priorização serão feitos em `backlog.md` e `moscow.md` no início da v2.0.

### Critério de Go/No-Go

- Redução de recidiva de lesão documentada em pelo menos 3 clubes
- Fisio usa por 4 semanas consecutivas sem lembrete
- Pelo menos 1 clube obtém reembolso de seguro usando relatório exportado pela plataforma

---

## Versão 2.5 — "A Arquibancada"

**Período:** Semanas 21–26 | **Módulo:** ArenaPass

### Justificativa

O ArenaPass é o módulo com menor resistência de adoção (transacional, sem mensalidade fixa) e o maior impacto imediato por evento. Mais importante: cada torcedor que compra ingresso entra automaticamente no funil de conversão para sócio do ClubOS — é um motor de aquisição com cara de produto.

O ClubOS precisa estar maduro antes do ArenaPass para que o funil torcedor→sócio funcione. Clube sem base financeira organizada não consegue fechar o ciclo de conversão.

**Nota de antecipação:** um MVP mínimo do ArenaPass (link Pix + QR Code de validação, sem CRM e sem PDV) pode ser construído já na v1.0 como feature de baixo custo de engenharia para validação antecipada do modelo transacional.

### Escopo de Alto Nível

**MVP (validação antecipada, opcional na v1.0)**

- Configuração de evento (data, adversário, setores, preço)
- Venda via link Pix + recebimento de QR Code por torcedor
- Validação de ingresso por câmera do celular (sem duplicata)
- Relatório de bilheteria pós-jogo

**Full (v2.5)**

- PDV mobile (mPOS) para lanchonete e merchandising (integração Stone/SumUp)
- CRM de torcedor: histórico de presença e gasto acumulado por evento
- Funil torcedor → sócio: push automático para conversão após jogo
- Patrocínio programático: empresa local no QR Code de confirmação
- Notificações para capitão: confirmação de linha e data 48h antes

> Detalhamento de tarefas e priorização serão feitos em `backlog.md` e `moscow.md` no início da v2.5.

### Critério de Go/No-Go

- Clube aumenta receita por jogo em ≥ 40% vs. caixinha manual
- Primeiro torcedor convertido em sócio via funil ArenaPass → ClubOS
- Taxa de calote na portaria < 2% (vs. ~15–20% com caixinha manual)

---

## Versão 3.0 — "A Vitrine"

**Período:** Mês 7–9 | **Módulo:** ScoutLink

### Justificativa

O ScoutLink é o módulo de maior fascínio de mercado, mas uma vitrine vazia não retém o lado da demanda. Scouts pagam pela assinatura porque os perfis são ricos e verificados — isso exige no mínimo 6 meses de dados do BaseForte e FisioBase rodando em produção. Lançar antes é desperdiçar a única chance de primeira impressão com o lado demanda.

### Escopo de Alto Nível

- Perfil de atleta verificado: escola assina autenticidade de métricas físicas e avaliação técnica
- Histórico longitudinal exportado do BaseForte (ACWR, evolução ao longo de temporadas)
- Status de saúde integrado com FisioBase (liberado/afastado, sem dados clínicos privados)
- Upload de vídeos curtos de treinos e jogos (60s, Cloudflare R2 + Stream)
- Busca filtrada para scouts (posição, faixa etária, estado, métricas mínimas)
- Comunicação 100% mediada pela plataforma: atleta menor NUNCA contatado diretamente
- Relatório de curadoria mensal por critério específico (R$299 por entrega)

> Detalhamento de tarefas e priorização serão feitos em `backlog.md` e `moscow.md` no início da v3.0.

### Critério de Go/No-Go

- Primeiro contato formal scout–escola mediado pela plataforma
- Pelo menos 3 scouts com assinatura ativa após 60 dias
- Zero incidente de contato direto com atleta menor (compliance crítico)

---

## Versão 3.5 — "A Liga"

**Período:** Mês 10–12 | **Módulo:** CampeonatOS

### Justificativa

O CampeonatOS é o módulo que ativa o efeito de rede — mas só funciona com massa crítica. Quando a maioria dos clubes de uma liga já está na plataforma, o CampeonatOS se vende por si mesmo: é a consequência natural da rede, não o ponto de entrada.

**Oportunidade de aquisição top-of-funnel:** considerar uma versão freemium do CampeonatOS (até 8 times, gratuito) como ferramenta de exposição para ligas onde o ClubOS ainda não tem penetração. O organizador convida os clubes, os clubes descobrem o produto.

### Escopo de Alto Nível

- Cadastro de times e jogadores com verificação de elegibilidade por CPF
- Geração automática de tabela round-robin (sem conflito de campo ou horário)
- Escalação digital com validação de elegibilidade em tempo real
- Súmula digital preenchida pelo árbitro no celular
- Controle automático de suspensões por cartão acumulado + alerta WhatsApp
- Portal público por campeonato (URL personalizada, tabela ao vivo, artilharia, perfil de elenco)
- Sistema de protesto com prazo rastreado
- Patrocínio digital no portal público com métricas de visualização
- Lembretes automáticos 48h antes para capitão de cada time

> Detalhamento de tarefas e priorização serão feitos em `backlog.md` e `moscow.md` no início da v3.5.

### Critério de Go/No-Go

- Campeonato completo (rodadas de ida e volta) gerenciado do início ao fim pela plataforma
- Organizador reduz horas de logística por semana de 8h para ≤ 2h
- Pelo menos 1 patrocinador local ativo no portal público

---

## Mapa de Dependências

Cada módulo herda dados e confiança dos anteriores. Essa sequência não é apenas estratégica — é uma restrição técnica real.

| Módulo                      | Depende de       | Dado / Recurso Herdado                                                                                |
| --------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------- |
| TreinoOS + BaseForte (v1.5) | ClubOS (v1.0)    | Cadastro de atletas e sócios. Sem ele, onboarding duplica trabalho do treinador.                      |
| FisioBase (v2.0)            | BaseForte (v1.5) | Dados de carga ACWR por atleta. Sem eles, FisioBase é apenas prontuário sem inteligência preditiva.   |
| FisioBase (v2.0)            | ClubOS (v1.0)    | Identidade do atleta, clube e vínculo. Base de dados compartilhada.                                   |
| ArenaPass (v2.5)            | ClubOS (v1.0)    | Cadastro de sócios para cruzamento torcedor→sócio. Funil de conversão só funciona com ClubOS maduro.  |
| ScoutLink (v3.0)            | BaseForte (v1.5) | Histórico longitudinal de carga e evolução física. Mínimo 6 meses de dados para perfil rico.          |
| ScoutLink (v3.0)            | FisioBase (v2.0) | Status de saúde e histórico de lesões (com permissão). Aumenta confiabilidade do perfil para o scout. |
| CampeonatOS (v3.5)          | ClubOS (v1.0)    | Base de clubes cadastrados na plataforma. Massa crítica por liga viabiliza o produto.                 |
| CampeonatOS (v3.5)          | TreinoOS (v1.5)  | Elenco e escalação já existentes. Reusa cadastro de jogadores para súmula digital.                    |

---

## Riscos Principais

### Risco de Execução (Maior Risco do Projeto)

Com time de 1–2 devs, o risco de 7 módulos em 12 meses é de **foco**, não de stack. A regra mais importante deste roadmap: **nenhum módulo começa antes do anterior ter atingido seu critério de go/no-go.** 7 módulos parcialmente entregues valem menos que 2 módulos excelentes.

### Riscos Estratégicos

| Risco                                                        | Impacto | Mitigação                                                                                              |
| ------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------ |
| v1.0 não valida: inadimplência não cai o suficiente          | Alto    | Piloto com 3 clubes antes de escalar. Critério de go/no-go claro: ≥20% de redução.                     |
| TreinoOS não vira hábito: treinador abandona após 2 semanas  | Alto    | Métrica de produto: ≥2 sessões/semana. Se não atingir em 30 dias, revisar onboarding antes de escalar. |
| ScoutLink lança com perfis rasos e não retém scouts          | Alto    | Não lançar antes de 6 meses de BaseForte em produção. Curadoria manual nos primeiros 90 dias.          |
| CampeonatOS lança sem massa crítica de clubes na liga        | Alto    | Iniciar com ligas onde ClubOS tem ≥70% de penetração. Liga parcial não é produto.                      |
| LGPD: dados de atletas menores sem consentimento documentado | Alto    | Consentimento dos responsáveis no onboarding da escola (v1.5). Não deixar para resolver no lançamento. |
| Time fragmenta atenção antes de v1.0 estar validado          | Alto    | Regra de go/no-go inviolável. Um módulo por vez.                                                       |

### Riscos Técnicos

| Risco                                                            | Impacto | Mitigação                                                                                |
| ---------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------- |
| Schema-per-tenant escala até ~500–1.000 clubes                   | Médio   | Planejar análise de migração para RLS ao atingir 300 clubes ativos.                      |
| BaseForte hardware (ESP32) exige pipeline de dados em tempo real | Médio   | Hardware fica na Fase 2. MVP usa RPE manual. Avaliar WebSocket antes de lançar hardware. |
| ScoutLink: upload de vídeo exige storage de objeto e CDN         | Baixo   | Cloudflare R2 + Stream. Limite de 60s por vídeo no MVP. Sem infraestrutura proprietária. |
| WhatsApp bloqueia número por envio massivo                       | Médio   | Rate limit 30 msg/min por clube (já previsto em v1.0). Fallback Resend ativo.            |

---

## Modelo de Monetização por Módulo

| Módulo      | Modelo Principal                   | Valor Estimado                       |
| ----------- | ---------------------------------- | ------------------------------------ |
| ClubOS      | Assinatura SaaS + taxa Pix 1,5%    | R$129–249/clube + % volume           |
| TreinoOS    | Assinatura clube ou individual     | R$49/treinador ou R$199/clube        |
| BaseForte   | B2B escola + B2C pai               | R$199–499/escola + R$19/atleta (pai) |
| FisioBase   | Assinatura fisioterapeuta          | R$79–149/fisio + R$199/clube         |
| ArenaPass   | Pay-per-ingresso + assinatura      | R$1,50/ingresso ou R$99/mês          |
| ScoutLink   | Assinatura scout + freemium escola | R$299/scout ou R$999/clube           |
| CampeonatOS | Por campeonato + assinatura liga   | R$299–699/evento ou R$299/mês        |

---

## Métricas-Âncora por Módulo

Duas métricas por módulo: produto (está sendo usado como ferramenta?) e negócio (está gerando valor real?).

| Módulo      | Métrica de Produto                                           | Métrica de Negócio                             |
| ----------- | ------------------------------------------------------------ | ---------------------------------------------- |
| ClubOS      | Cobrança Pix gerada para 100% dos sócios ativos no mês       | Inadimplência ↓25% vs. pré-adoção              |
| TreinoOS    | ≥2 sessões planejadas/semana por treinador ativo             | 60% dos clubes v1.0 com módulo ativo           |
| BaseForte   | ≥80% dos atletas com carga ACWR calculada e atualizada       | ≥5 pais pagando relatório premium              |
| FisioBase   | ≥80% dos atletas afastados com protocolo de retorno definido | Redução de recidiva documentada em 3+ clubes   |
| ArenaPass   | 100% dos ingressos do jogo vendidos digitalmente             | Receita por jogo ≥40% acima da caixinha manual |
| ScoutLink   | ≥3 scouts com buscas ativas semanalmente                     | ≥1 contato formal scout–escola/mês             |
| CampeonatOS | Organizador usa plataforma para ≥90% das ações de logística  | 1 campeonato completo + 1 patrocinador ativo   |
