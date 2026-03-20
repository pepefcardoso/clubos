# Guia de Segurança — ClubOS v1.0

> Use este documento ao **implementar ou revisar qualquer tarefa**. Cada seção lista regras práticas e padrões de código prontos para uso. Desvios de regras marcadas como `[OBRIGATÓRIO]` requerem RFC aprovado.

---

## 1. Autenticação e Sessão

### Regras Rápidas

- Access token JWT: **15 min**, apenas em memória do `AuthProvider`. Nunca em `localStorage`, `sessionStorage` ou cookie não-httpOnly.
- Refresh token: **7 dias**, exclusivamente em **httpOnly cookie**. Rotativo — o anterior é invalidado a cada uso via Redis.
- Token SSE: passado via query param `?token=`; deve ser redactado nos logs com `pino-redact`.
- Bcrypt com custo explícito: `const BCRYPT_ROUNDS = 12`.
- Senhas mínimas: 12 chars, maiúscula, minúscula, número e especial (schema Zod em `packages/shared-types/src/auth.schemas.ts`).

### `[OBRIGATÓRIO]` Proteção contra Força Bruta no Login (L-01)

Bloquear por **e-mail** (não por IP) após 5 tentativas, por 15 minutos via Redis.

```typescript
// modules/auth/login-attempts.ts
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 900;

export async function checkLoginAttempts(redis, email) {
  /* lança 429 se bloqueado */
}
export async function recordFailedAttempt(redis, email) {
  /* incrementa + expire */
}
export async function clearLoginAttempts(redis, email) {
  /* limpa após login ok */
}

// No handler: checkLoginAttempts → bcrypt.compare → se inválido: recordFailedAttempt
// SEMPRE o mesmo erro em falha (previne enumeração de usuário): "Credenciais inválidas."
```

### Audit de Segurança em `audit_log`

Registrar obrigatoriamente: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_LOCKED`, `LOGOUT`, `TOKEN_REFRESH`, `WEBHOOK_SIGNATURE_INVALID`, `UNAUTHORIZED_ACCESS`, `MEMBER_EXPORT`.

---

## 2. Autorização e Controle de Acesso

### `[OBRIGATÓRIO]` Object-Level Authorization — Prevenção de IDOR (L-04)

Todo handler que receba um ID de recurso **deve verificar que ele pertence ao `clubId` do JWT**. Retornar **404** (não 403) — não confirmar existência de recursos de outros tenants.

```typescript
// lib/assert-tenant-ownership.ts
export async function assertMemberBelongsToClub(prisma, memberId, clubId) {
  const found = await prisma.member.findFirst({
    where: { id: memberId, clubId },
    select: { id: true },
  });
  if (!found) throw new NotFoundError("Sócio não encontrado.");
}
// Padrão análogo para: charges, plans, payments, athletes, templates, messages
```

```typescript
// Uso obrigatório em todo handler de recurso único:
const { clubId } = request.user; // sempre do JWT
await assertMemberBelongsToClub(prisma, request.params.memberId, clubId);
```

### Matriz de RBAC

| Endpoint                                 | ADMIN | TREASURER |
| ---------------------------------------- | ----- | --------- |
| `POST/PUT /api/members`                  | ✅    | ✅        |
| `DELETE /api/members/:id`                | ✅    | ❌ 403    |
| `POST/PUT/DELETE /api/plans`             | ✅    | ❌ 403    |
| `POST /api/charges/generate`             | ✅    | ✅        |
| `GET /api/dashboard/*`                   | ✅    | ✅        |
| `PUT/DELETE /api/templates/:key`         | ✅    | ❌ 403    |
| `POST /api/clubs/:id/logo`               | ✅    | ❌ 403    |
| `GET /api/messages`, `GET /api/athletes` | ✅    | ✅        |
| `POST /api/athletes`                     | ✅    | ❌ 403    |
| `GET /api/members/:id/payments`          | ✅    | ✅        |

> Cada linha desta tabela deve ter um teste unitário no CI.

---

## 3. Proteção de Dados

### `[OBRIGATÓRIO]` SSL no PostgreSQL (L-14)

A conexão com o banco em produção deve **criptografar o canal e autenticar o certificado do servidor**. O `sslmode=require` apenas criptografa — ele não valida o certificado, deixando a conexão vulnerável a ataques man-in-the-middle. Por isso, **`sslmode=require` é proibido em produção**.

#### Configuração recomendada — verify-full + sslrootcert

```
DATABASE_URL="postgresql://user:pass@host:5432/clubos_prod?schema=public&sslmode=verify-full&sslrootcert=/path/to/ca-bundle.pem"
```

Baixe o CA bundle do seu provedor de banco gerenciado:

| Provedor  | CA bundle                                                         |
| --------- | ----------------------------------------------------------------- |
| RDS       | https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem |
| Supabase  | Settings → Database → SSL certificate → Download                  |
| Neon      | https://neon.tech/docs/connect/connect-securely                   |
| Cloud SQL | https://cloud.google.com/sql/docs/postgres/connect-auth-proxy     |

#### Alternativa aceita — verify-ca

Quando o provedor não disponibiliza um CA bundle separado, `verify-ca` é o mínimo aceito:

```
DATABASE_URL="postgresql://user:pass@host:5432/clubos_prod?schema=public&sslmode=verify-ca"
```

#### Modos rejeitados pelo validador de startup

| sslmode       | Produção | Motivo da rejeição                               |
| ------------- | -------- | ------------------------------------------------ |
| `verify-full` | ✅       | Aceito — requer `sslrootcert`                    |
| `verify-ca`   | ✅       | Aceito                                           |
| `require`     | ❌       | Criptografa o canal mas não valida o certificado |
| `prefer`      | ❌       | Não garante criptografia                         |
| `allow`       | ❌       | Não garante criptografia                         |
| `disable`     | ❌       | Sem criptografia                                 |
| ausente       | ❌       | Comportamento do driver não é garantido          |

O validador em `src/lib/env.ts` detecta `sslmode=verify-full` sem `sslrootcert` e trava o processo com mensagem de erro detalhada antes de qualquer conexão ser aberta.

### `[OBRIGATÓRIO]` Redis com TLS e Autenticação (L-08)

```
REDIS_URL="rediss://:SENHA_FORTE@host:6380"  # rediss:// = TLS obrigatório
```

Configurar `lazyConnect: true` no ioredis e `process.exit(1)` em erro de autenticação no startup.

### `[OBRIGATÓRIO]` Validação de Variáveis de Ambiente no Startup (L-09)

Usar schema Zod em `lib/env.ts` validando: `NODE_ENV`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (≥32 chars), `JWT_REFRESH_SECRET` (≥32 chars), `ASAAS_API_KEY`, `ASAAS_WEBHOOK_SECRET` (≥32 chars), `ENCRYPTION_KEY` (≥32 chars). Chamar `validateEnv()` como **primeira linha** do bootstrap.

### Criptografia de CPF e Telefone

Armazenados como `BYTEA` com pgcrypto AES-256. Busca via `findMemberByCpf` (full-table scan aceitável para v1). A constraint `@unique` foi removida — unicidade garantida em nível de aplicação.

### Rotação de Chaves de Criptografia

Suportar múltiplas versões (`ENCRYPTION_KEY_V1`, `ENCRYPTION_KEY_V2`…) com `ENCRYPTION_KEY_VERSION` apontando para a atual. Decryption tenta todas as versões (backward compat).

---

## 4. Segurança de API

### `[OBRIGATÓRIO]` CORS com Origens Explícitas (L-03)

```typescript
const ALLOWED_ORIGINS =
  process.env.NODE_ENV === "production"
    ? ["https://app.clubos.com.br", "https://clubos.com.br"]
    : ["http://localhost:3000"];
// PROIBIDO: origin: '*' com cookies httpOnly
```

### `[OBRIGATÓRIO]` Error Handler sem Stack Traces em Produção (L-12)

Erros 5xx em produção retornam mensagem genérica: `"Ocorreu um erro inesperado. Nossa equipe foi notificada."`. Nunca expor `error.stack`, `error.cause` ou detalhes de query.

### Limite de Tamanho de Payload (L-06)

- Uploads de logo: **2MB máximo**, 1 arquivo por requisição.
- Rotas JSON gerais: **512KB**.
- Importação CSV: até **5MB** (5.000 linhas), sobrescrito na rota específica.

### Prevenção de Mass Assignment

```typescript
// ❌ PROIBIDO
await prisma.member.create({ data: request.body as any });
// ✅ CORRETO
const parsed = CreateMemberSchema.parse(request.body);
await prisma.member.create({ data: parsed });
```

### Proteção contra CSV Injection (L-07)

Prefixar com `'` qualquer campo que comece com `=`, `+`, `-`, `@`, `\t`, `\r` nas **exportações**. Rejeitar com `ValidationError` nas **importações**.

---

## 5. Segurança de Webhooks

### Validação obrigatória em toda rota `/webhooks/:gateway`

1. Validar **timestamp** (tolerância ±5 min) → rejeita replays.
2. Validar **HMAC-SHA256** via `parseWebhook()` com `timingSafeEqual` → rejeita 401 se inválido.
3. Checar deduplicação no **Redis** (`SET NX`, TTL 24h) antes de enfileirar.
4. Responder **HTTP 200 imediatamente** e processar no BullMQ.
5. Checar idempotência por `gateway_txid` no **banco** antes de criar `Payment`.

```typescript
// Rota de webhook deve estar fora do middleware JWT:
const PUBLIC_ROUTES = [
  "/api/auth/login",
  "/api/auth/refresh",
  "/webhooks/",
  "/api/events",
];
```

---

## 6. Multi-Tenancy

### Regras Absolutas

- Todo acesso ao banco fora do schema `public` **deve** usar `withTenantSchema(prisma, clubId, ...)`.
- `assertValidClubId(clubId)` valida formato cuid2 antes de qualquer interpolação em nome de schema.
- **Proibido:** queries sem contexto de tenant, JOINs entre schemas de clubes diferentes.

### Testes de Isolamento (CI obrigatório)

- Acessar recurso do clube A com JWT do clube B → deve retornar **404**.
- Busca com termo presente em outro tenant → resultado deve conter apenas dados do tenant autenticado.

---

## 7. Upload de Arquivos

### `[OBRIGATÓRIO]` Validar Magic Bytes (L-05)

Validar pelo conteúdo real do arquivo, não pelo `Content-Type` declarado. Usar `file-type` para detectar o MIME real. Permitidos: `image/png`, `image/jpeg`, `image/webp`, `image/gif`.

### Nome de Arquivo Seguro

```typescript
// NUNCA usar o nome original do arquivo (path traversal)
const safeFilename = `${clubId}-${randomUUID()}.webp`;
```

Sempre resolver o path final e verificar que começa com o diretório de uploads esperado.

---

## 8. Jobs Assíncronos (BullMQ)

### Regras

- Payloads de jobs: **apenas IDs**. Nunca incluir CPF, telefone, nome ou dados pessoais (ficam expostos nos logs do Redis).
- JobId estável (`generate-{clubId}-{YYYY-MM}`, `d3-{clubId}-{date}`): garante deduplicação em crash/restart.
- Prefixo de fila com ambiente: `{clubos:production}` vs `{clubos:staging}` — evita colisão.
- Todo job deve ser **idempotente** — reprocessar não pode gerar cobrança ou mensagem duplicada.

---

## 9. Infraestrutura e Dependências

### CI/CD

- `pnpm audit --audit-level=high` runs at the workspace root in CI — fails on HIGH/CRITICAL. Exceptions require an entry in `.audit-exceptions.json` and `pnpm.auditConfig.ignoreCves` in root `package.json`, both committed together with a written justification and ticket reference.
- Secrets via variáveis do GitHub Actions. **Nunca** hardcoded em YAML ou código.
- Chaves criptográficas únicas por ambiente (dev/staging/prod nunca compartilham segredos).

### Geração de Segredos

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Rotação semestral de `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ASAAS_WEBHOOK_SECRET`. Rotação imediata em suspeita de comprometimento.

### Headers de Segurança (API + Next.js)

Obrigatórios em produção: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `Strict-Transport-Security` (HSTS, `max-age=63072000`), CSP restritivo no Next.js. Remover `X-Powered-By` e `Server`.

### Sentry — Configuração Segura (T-043)

- `tracesSampleRate: 0.1` em produção.
- `beforeSend`: remover `refresh_token` dos cookies, filtrar `password` e `cpf` do body.
- Ignorar erros esperados: `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ValidationError`, `TooManyRequestsError`.

---

## 10. O Que Nunca Fazer (Resumo)

| ❌ Proibido                                 | ✅ Correto                                                       |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `any` explícito em módulos financeiros      | Definir tipo correto ou `unknown` com type guard                 |
| `origin: '*'` no CORS com cookies           | Lista explícita de origens                                       |
| Stack trace em resposta de erro (produção)  | Mensagem genérica para 5xx                                       |
| `req.body` direto em query sem Zod          | `Schema.parse(request.body)`                                     |
| Nome original do arquivo em upload          | `randomUUID()` + extensão validada                               |
| Validar MIME só pelo `Content-Type`         | Verificar magic bytes com `file-type`                            |
| Dados pessoais em payload de job BullMQ     | Apenas IDs; dados buscados no worker                             |
| `localStorage`/`sessionStorage` para tokens | Memória do AuthProvider (access) + httpOnly cookie (refresh)     |
| Logar CPF, telefone ou tokens em texto puro | `pino-redact` com campos sensíveis configurados                  |
| Mesmas chaves JWT em staging e produção     | Chaves únicas por ambiente                                       |
| HIGH/CRITICAL abertos no `pnpm audit`       | Corrigir, fazer override ou documentar exceção com justificativa |
| `@ts-ignore` sem comentário explicando      | Corrigir o tipo ou documentar o motivo                           |
| `sslmode=require` em produção               | `sslmode=verify-full&sslrootcert=<path>` ou `sslmode=verify-ca`  |

---

## 11. Checklist de Deploy para Produção

### Ambiente

- [ ] Todas as variáveis do `.env.example` configuradas no painel de hospedagem
- [ ] `NODE_ENV=production` definido
- [ ] `DATABASE_URL` inclui `sslmode=verify-full&sslrootcert=<path>` (ou `sslmode=verify-ca`)
- [ ] CA bundle do provedor de banco baixado e acessível no path configurado em `sslrootcert`
- [ ] `REDIS_URL` usa `rediss://` e inclui senha forte
- [ ] `JWT_SECRET` e `JWT_REFRESH_SECRET` ≥ 32 chars, únicos para produção
- [ ] `ASAAS_WEBHOOK_SECRET` ≥ 32 chars
- [ ] `ENCRYPTION_KEY` ≥ 32 chars

### Código

- [ ] `pnpm audit --audit-level=high` passa sem falhas (todos os workspaces)
- [ ] Error handler configurado — sem stack traces em 5xx
- [ ] CORS com lista de origens explícita (sem wildcard)
- [ ] Todo endpoint de recurso único usa `assertXBelongsToClub`
- [ ] Nenhum `console.log` com dados sensíveis

### Infraestrutura

- [ ] Headers HSTS, CSP, `X-Frame-Options`, `X-Content-Type-Options` ativos
- [ ] Logs sem tokens, senhas ou CPFs em texto puro
- [ ] Backups automáticos do PostgreSQL ativos e testados

### Fluxo Financeiro

- [ ] Webhook do Asaas configurado com URL e secret de produção
- [ ] Idempotência testada: payload duplicado não cria `Payment` duplo
- [ ] Job de cobranças testado manualmente antes de ativar o cron
- [ ] Rate limiting de WhatsApp validado com lote pequeno (< 10 membros)

### Monitoramento

- [ ] Sentry DSN configurado (front e back), com filtro de dados sensíveis
- [ ] Alertas de erro: > 5 erros 5xx em 5 minutos
- [ ] `GET /health` retornando 200 e monitorado
