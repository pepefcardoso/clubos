# Architecture Guidelines — ClubOS v1.0

> Regras de desenvolvimento, fluxo de trabalho e ferramentas do time.

---

## Style Guide de Código

### Convenções Gerais

| Categoria | Regra |
|---|---|
| Idioma do código | Inglês para tudo: variáveis, funções, comentários, commits, branches, PRs |
| Idioma do produto | Português para strings de UI, mensagens de erro e templates de WhatsApp |
| Formatação | Prettier — `printWidth: 100`, `singleQuote: true`, `semi: true` |
| Linting | ESLint + plugin TypeScript + plugin import. Zero warnings permitidos em CI. |
| Tipagem | Strict mode no tsconfig. Proibido: `any` explícito, `@ts-ignore` sem comentário. |
| Testes | Vitest para unit/integration. Playwright para E2E críticos. |
| Cobertura mínima | ≥ 80% em módulos de domínio financeiro (charges, payments, webhooks). |

### Nomenclatura

| Contexto | Padrão | Exemplo |
|---|---|---|
| Variáveis / Funções | camelCase | `generatePixCharge`, `memberStatus` |
| Classes / Tipos / Interfaces | PascalCase | `ChargeService`, `MemberStatus`, `CreateChargeDto` |
| Constantes | SCREAMING_SNAKE_CASE | `MAX_RETRY_ATTEMPTS`, `PIX_WEBHOOK_SECRET` |
| Arquivos de componente | PascalCase | `MemberCard.tsx`, `ChargeTable.tsx` |
| Arquivos de service/util | kebab-case | `charge-service.ts`, `format-currency.ts` |
| Rotas de API | REST kebab-case, plural | `GET /api/members`, `POST /api/charges` |
| Variáveis de ambiente | SCREAMING_SNAKE_CASE | `DATABASE_URL`, `ASAAS_API_KEY` |

---

## Fluxo de Git

### Estratégia de Branches

| Branch | Propósito | Regras |
|---|---|---|
| `main` | Código em produção | Protegida. Merge apenas via PR aprovado. Deploy automático. |
| `develop` | Integração contínua | Base para feature branches. Deploy automático em staging. |
| `feature/XYZ` | Nova funcionalidade | Sempre a partir de `develop`. Nome: `feature/TICKET-descricao` |
| `fix/XYZ` | Correção de bug | A partir de `develop` (ou `main` em hotfix crítico) |
| `release/X.Y` | Preparação de release | A partir de `develop`; merge em `main` + tag semântica |

### Padrão de Commits — Conventional Commits

```
# Formato
<type>(<scope>): <description>

# Tipos válidos
feat     → nova feature
fix      → correção de bug
docs     → documentação
style    → formatação (sem mudança de lógica)
refactor → refatoração sem nova feature nem fix
test     → adição/ajuste de testes
chore    → build, deps, CI

# Exemplos
feat(charges): add pix webhook handler with HMAC validation
fix(members): correct overdue status calculation on timezone edge
feat(whatsapp): add D-3 reminder job with rate limiting
chore(ci): add vitest coverage threshold to github actions
```

### Processo de Pull Request

1. **Branch target:** sempre `develop` (exceto hotfix crítico em prod).
2. **PR description** deve incluir: contexto do problema, solução implementada, como testar, screenshots se UI.
3. **Checklist obrigatório:** `[ ]` Testes passando `[ ]` Sem `any` explícito `[ ]` `.env.example` atualizado se nova variável.
4. **Aprovações:** mínimo 1 para merge. Em código financeiro (charges, payments, webhooks): mínimo 2 aprovações.
5. **PR aberto por > 48h** sem revisão: pingar revisor no canal do time.

---

## Ferramentas

| Ferramenta | Uso | Canal / Convenção |
|---|---|---|
| Linear | Gestão de tarefas e backlog | Projeto ClubOS v1.0. Labels: `feat / bug / debt / discovery` |
| Slack / Discord | Comunicação do time | `#geral`, `#dev`, `#produto`, `#alertas-prod` (apenas bots) |
| Notion | Documentação e RFCs | Design Docs, notas de entrevistas, decisões de arquitetura |
| Figma | Design de UI | Componentes em arquivo compartilhado; dev mode ativo |
| GitHub | Código, PRs, Issues | Repo privado. Issues linkadas às tasks do Linear via integração |
| Loom | Demo assíncrona | Gravar demo de feature antes do PR para revisão visual rápida |

---

## Cadência de Rituais

| Ritual | Frequência | Formato e Objetivo |
|---|---|---|
| Daily assíncrona | Diária | Post no Slack: O que fiz / O que farei / Bloqueios |
| Review de Sprint | Quinzenal | Demo do que foi entregue; atualizar status das hipóteses |
| Refinamento de Backlog | Semanal | Quebrar tasks grandes, revisar prioridades, estimar esforço |
| Retrospectiva | Quinzenal | O que funcionou / O que melhorar / Uma ação concreta |
| Incidente prod | Ad-hoc | Post-mortem escrito em Notion em até 24h após resolução |
