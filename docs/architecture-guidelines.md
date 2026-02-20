# Architecture Guidelines — ClubOS v1.0

> Regras de desenvolvimento, fluxo de trabalho e ferramentas do time.

---

## Style Guide de Código

### Convenções Gerais

| Categoria         | Regra                                                                            |
| ----------------- | -------------------------------------------------------------------------------- |
| Idioma do código  | Inglês para tudo: variáveis, funções, comentários, commits, branches, PRs        |
| Idioma do produto | Português para strings de UI, mensagens de erro e templates de WhatsApp          |
| Formatação        | Prettier — `printWidth: 100`, `singleQuote: true`, `semi: true`                  |
| Linting           | ESLint + plugin TypeScript + plugin import. Zero warnings permitidos em CI.      |
| Tipagem           | Strict mode no tsconfig. Proibido: `any` explícito, `@ts-ignore` sem comentário. |
| Testes            | Vitest para unit/integration. Playwright para E2E críticos.                      |
| Cobertura mínima  | ≥ 80% em módulos de domínio financeiro (charges, payments, webhooks, jobs).      |

### Nomenclatura

| Contexto                     | Padrão                  | Exemplo                                                |
| ---------------------------- | ----------------------- | ------------------------------------------------------ |
| Variáveis / Funções          | camelCase               | `generateCharge`, `memberStatus`, `resolveGateway`     |
| Classes / Tipos / Interfaces | PascalCase              | `ChargeService`, `PaymentGateway`, `CreateChargeInput` |
| Constantes                   | SCREAMING_SNAKE_CASE    | `MAX_RETRY_ATTEMPTS`, `DEFAULT_PAYMENT_METHOD`         |
| Arquivos de componente       | PascalCase              | `MemberCard.tsx`, `ChargeTable.tsx`                    |
| Arquivos de service/util     | kebab-case              | `charge-service.ts`, `format-currency.ts`              |
| Arquivos de gateway          | kebab-case com sufixo   | `asaas.gateway.ts`, `pagarme.gateway.ts`               |
| Rotas de API                 | REST kebab-case, plural | `GET /api/members`, `POST /api/charges`                |
| Rotas de webhook             | kebab-case paramétrico  | `POST /webhooks/:gateway`                              |
| Variáveis de ambiente        | SCREAMING_SNAKE_CASE    | `DATABASE_URL`, `ASAAS_API_KEY`                        |

---

## Fluxo de Git

### Estratégia de Branches

| Branch        | Propósito             | Regras                                                         |
| ------------- | --------------------- | -------------------------------------------------------------- |
| `main`        | Código em produção    | Protegida. Merge apenas via PR aprovado. Deploy automático.    |
| `develop`     | Integração contínua   | Base para feature branches. Deploy automático em staging.      |
| `feature/XYZ` | Nova funcionalidade   | Sempre a partir de `develop`. Nome: `feature/TICKET-descricao` |
| `fix/XYZ`     | Correção de bug       | A partir de `develop` (ou `main` em hotfix crítico)            |
| `release/X.Y` | Preparação de release | A partir de `develop`; merge em `main` + tag semântica         |

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
feat(payments): add pagarme gateway implementation
fix(members): correct overdue status calculation on timezone edge
feat(whatsapp): add D-3 reminder job with rate limiting
chore(ci): add vitest coverage threshold to github actions
refactor(payments): extract gateway abstraction layer
```
