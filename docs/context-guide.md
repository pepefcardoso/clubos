# Guia de Contexto — Quais Docs Usar

> Referência rápida para montar o contexto antes de iniciar qualquer tarefa.

---

## Por tipo de tarefa

| Tarefa                          | Docs necessários                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Nova tela / componente frontend | `ui-guidelines.md` + `architecture-guidelines.md`                                                               |
| Novo endpoint REST              | `architecture-rules.md` + `design-docs.md`                                                                      |
| Novo job assíncrono (BullMQ)    | `architecture-rules.md` + `design-docs.md`                                                                      |
| Novo webhook                    | `architecture-rules.md` + `design-docs.md`                                                                      |
| Novo gateway de pagamento       | `architecture-rules.md` + `design-docs.md`                                                                      |
| Feature full-stack              | Todos os quatro: `architecture-rules.md` + `design-docs.md` + `architecture-guidelines.md` + `ui-guidelines.md` |
| Refatoração de código existente | `architecture-rules.md` + `architecture-guidelines.md`                                                          |
| Escrita ou revisão de testes    | `architecture-guidelines.md` (seção de cobertura)                                                               |
| Decisão de escopo / priorização | `moscow.md` + `backlog.md`                                                                                      |
| Configuração de CI/CD ou infra  | `infra.md` + `BRANCH_PROTECTION.md`                                                                             |
| Onboarding de novo dev          | Todos os docs                                                                                                   |

---

## Docs de referência permanente

Dois docs que valem ser lidos uma vez e internalizados — não precisam ser fornecidos a cada tarefa, mas qualquer dúvida sobre "posso fazer isso?" tem a resposta neles:

- **`architecture-rules.md`** — o que é proibido e o que é obrigatório na arquitetura
- **`architecture-guidelines.md`** — convenções de código, nomenclatura, fluxo de git e PR

---

## Docs raramente necessários no dia a dia

- **`moscow.md`** — consultar apenas ao avaliar se uma nova demanda entra no escopo do MVP
- **`infra.md`** — consultar apenas ao mexer em deploy, variáveis de ambiente ou CI
- **`BRANCH_PROTECTION.md`** — consultar apenas na configuração inicial do repositório
