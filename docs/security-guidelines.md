# Security Guidelines — ClubOS v1.0

> **Classificação:** Documento de segurança obrigatório.  
> Qualquer desvio das regras marcadas como **[OBRIGATÓRIO]** requer RFC aprovado com justificativa de risco explícita.  
> Revisão recomendada a cada nova versão maior do produto.

---

## Índice

1. [Postura Atual vs. Lacunas Identificadas](#1-postura-atual-vs-lacunas-identificadas)
2. [Autenticação e Gestão de Sessão](#2-autenticação-e-gestão-de-sessão)
3. [Autorização e Controlo de Acesso](#3-autorização-e-controlo-de-acesso)
4. [Proteção de Dados em Repouso e Trânsito](#4-proteção-de-dados-em-repouso-e-trânsito)
5. [Segurança de API e Validação de Input](#5-segurança-de-api-e-validação-de-input)
6. [Segurança de Webhooks](#6-segurança-de-webhooks)
7. [Multi-Tenancy — Isolamento de Dados](#7-multi-tenancy--isolamento-de-dados)
8. [Segurança de Upload de Ficheiros](#8-segurança-de-upload-de-ficheiros)
9. [Segurança de Infraestrutura e Dependências](#9-segurança-de-infraestrutura-e-dependências)
10. [Headers HTTP e Configuração do Next.js](#10-headers-http-e-configuração-do-nextjs)
11. [Logging, Auditoria e Resposta a Incidentes](#11-logging-auditoria-e-resposta-a-incidentes)
12. [Segurança em Jobs Assíncronos (BullMQ)](#12-segurança-em-jobs-assíncronos-bullmq)
13. [Checklist de Deploy para Produção](#13-checklist-de-deploy-para-produção)

---

## 1. Postura Atual vs. Lacunas Identificadas

### ✅ Controlos Já Implementados

| Área | Controlo |
|------|----------|
| Auth | JWT access (15min) + refresh rotativo httpOnly cookie + Redis single-use |
| Auth | bcrypt com constant-time dummy hash (previne user enumeration) |
| Auth | `timingSafeEqual` para comparação de tokens e HMAC |
| Dados | CPF e telefone: AES-256 pgcrypto em repouso |
| Dados | `audit_log` imutável para operações financeiras |
| Multi-tenancy | Schema-per-tenant + `assertValidClubId` (previne SQL injection via schema name) |
| API | Rate limiting global 100 req/min por IP (Redis) |
| API | Rate limiting WhatsApp 30 msg/min por clube (Lua atômica, TOCTOU-safe) |
| Webhooks | HMAC-SHA256 via `parseWebhook()`, rejeita 401 em assinatura inválida |
| Webhooks | Processamento assíncrono (BullMQ); resposta 200 imediata |
| Webhooks | Idempotência por `gateway_txid` (dupla: aplicação + constraint DB) |
| Transport | HTTPS obrigatório, HSTS em produção, CSP básico no Next.js |
| RBAC | Roles `ADMIN` e `TREASURER` com guards por rota |
| Jobs | JobId estável para deduplicação (previne dupla cobrança em crash/restart) |

### ⚠️ Lacunas Críticas a Corrigir

| # | Área | Lacuna | Prioridade |
|---|------|--------|------------|
| L-01 | Auth | Sem brute-force protection no endpoint `POST /api/auth/login` | 🔴 Alta |
| L-02 | Auth | Sem validação de força de senha no cadastro/reset | 🟡 Média |
| L-03 | API | CORS não documentado — pode estar em wildcard (`*`) | 🔴 Alta |
| L-04 | API | Sem Object-Level Authorization (IDOR) explícito — membros podem cruzar tenants por ID direto | 🔴 Alta |
| L-05 | Upload | Sem validação de MIME type real (magic bytes) no upload de logo | 🔴 Alta |
| L-06 | Upload | Sem limite de tamanho de payload definido no Fastify | 🟡 Média |
| L-07 | CSV | Sem sanitização de CSV Injection (fórmulas `=CMD`, `@SUM`) | 🟡 Média |
| L-08 | Infra | Redis sem autenticação e TLS documentados | 🔴 Alta |
| L-09 | Infra | Sem validação de variáveis de ambiente no startup | 🟡 Média |
| L-10 | Infra | Sem scanning de dependências no CI pipeline | 🟡 Média |
| L-11 | Webhooks | Sem validação de timestamp (proteção contra replay attacks) | 🟡 Média |
| L-12 | Erros | Stack traces podem vazar em respostas de erro em produção | 🔴 Alta |
| L-13 | SSE | Token de acesso exposto em query param nos logs do servidor | 🟡 Média |
| L-14 | DB | SSL/TLS para conexão com PostgreSQL não documentado | 🔴 Alta |
| L-15 | Next.js | Server Actions e API Routes do marketing sem proteção explícita contra CSRF | 🟡 Média |

---

## 2. Autenticação e Gestão de Sessão

### 2.1 Brute-Force Protection no Login **[OBRIGATÓRIO — L-01]**

O endpoint `POST /api/auth/login` não tem proteção específica contra ataques de força bruta além do rate limiting global de 100 req/min por IP, que é insuficiente.

**Implementação obrigatória:**

```typescript
// apps/api/src/modules/auth/login-attempts.ts
const LOGIN_ATTEMPT_KEY = (email: string) =>
  `login_attempts:${email.toLowerCase()}`;
const MAX_ATTEMPTS = 5;
const LOCKOUT_WINDOW_SECONDS = 900; // 15 minutos

export async function checkLoginAttempts(redis: Redis, email: string): Promise<void> {
  const key = LOGIN_ATTEMPT_KEY(email);
  const attempts = await redis.get(key);
  if (attempts && parseInt(attempts) >= MAX_ATTEMPTS) {
    throw new TooManyRequestsError(
      'Conta temporariamente bloqueada. Tente novamente em 15 minutos.'
    );
  }
}

export async function recordFailedAttempt(redis: Redis, email: string): Promise<void> {
  const key = LOGIN_ATTEMPT_KEY(email);
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, LOCKOUT_WINDOW_SECONDS);
  }
}

export async function clearLoginAttempts(redis: Redis, email: string): Promise<void> {
  await redis.del(LOGIN_ATTEMPT_KEY(email));
}
```

```typescript
// Fluxo no handler de login
await checkLoginAttempts(redis, body.email);   // lança 429 se bloqueado
const user = await findUser(body.email);
const valid = user && await bcrypt.compare(body.password, user.passwordHash);

if (!valid) {
  await recordFailedAttempt(redis, body.email);
  // IMPORTANTE: sempre lançar o mesmo erro (user enumeration prevention)
  throw new UnauthorizedError('Credenciais inválidas.');
}
await clearLoginAttempts(redis, body.email);
```

> **Nota de design:** A contagem por e-mail (não por IP) previne que um atacante use múltiplos IPs para contornar o bloqueio de conta. O bloqueio por IP já é coberto pelo rate limiting global.

### 2.2 Política de Senha **[OBRIGATÓRIO — L-02]**

Adicionar validação Zod na criação e reset de senhas:

```typescript
// packages/shared-types/src/auth.schemas.ts
export const PasswordSchema = z
  .string()
  .min(12, 'Mínimo de 12 caracteres')
  .regex(/[A-Z]/, 'Deve conter ao menos uma letra maiúscula')
  .regex(/[a-z]/, 'Deve conter ao menos uma letra minúscula')
  .regex(/[0-9]/, 'Deve conter ao menos um número')
  .regex(/[^A-Za-z0-9]/, 'Deve conter ao menos um caractere especial');
```

Configurar o custo do bcrypt explicitamente:

```typescript
// Nunca deixar no padrão — definir explicitamente
const BCRYPT_ROUNDS = 12; // ~250ms em hardware moderno; balanceia segurança e UX
const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
```

### 2.3 Segurança do Access Token em Memória

O access token não deve nunca ser armazenado em `localStorage` ou `sessionStorage`. O padrão atual (memória do `AuthProvider`) está correto. Documentar como restrição explícita:

```typescript
// ✅ CORRETO — token apenas em memória do AuthProvider
// ❌ PROIBIDO
localStorage.setItem('access_token', token);
sessionStorage.setItem('access_token', token);
// ❌ PROIBIDO — nunca em cookie não-httpOnly
document.cookie = `token=${token}`;
```

### 2.4 Renovação Segura do Refresh Token

O token SSE usa query param `?token=`. Mitigar exposição nos logs:

```typescript
// apps/api/src/modules/events/events.routes.ts
// Redact do token no pino ANTES de qualquer log
fastify.addHook('onRequest', async (request) => {
  if (request.url.includes('/api/events')) {
    // Strip do token para logging — não afeta o processo de autenticação
    request.log = request.log.child({ url: '/api/events?token=[REDACTED]' });
  }
});
```

Confirmar que o `pino-redact` está configurado:

```typescript
// apps/api/src/app.ts
const app = fastify({
  logger: {
    redact: {
      paths: ['req.headers.authorization', 'req.query.token'],
      remove: false,    // substitui por '[Redacted]' — não remove o campo do log
      censor: '[Redacted]'
    }
  }
});
```

---

## 3. Autorização e Controlo de Acesso

### 3.1 Object-Level Authorization (IDOR) **[OBRIGATÓRIO — L-04]**

Este é o vetor mais crítico em sistemas multi-tenant. Um tesoureiro autenticado no clube A não deve conseguir aceder recursos do clube B simplesmente adivinhando um UUID.

**Regra:** Todo handler que aceita um ID de recurso (`memberId`, `chargeId`, `planId`) deve verificar explicitamente que o recurso pertence ao `clubId` extraído do JWT — nunca confiar apenas no ID.

```typescript
// apps/api/src/lib/assert-tenant-ownership.ts

/**
 * Lança 404 (não 403) intencionalmente — não confirmar a existência
 * de recursos de outros tenants.
 */
export async function assertMemberBelongsToClub(
  prisma: PrismaClient,
  memberId: string,
  clubId: string
): Promise<void> {
  const member = await prisma.member.findFirst({
    where: { id: memberId, clubId },
    select: { id: true },
  });
  if (!member) {
    throw new NotFoundError(`Sócio não encontrado.`);
  }
}

export async function assertChargeBelongsToClub(
  prisma: PrismaClient,
  chargeId: string,
  clubId: string
): Promise<void> {
  const charge = await prisma.charge.findFirst({
    where: { id: chargeId, clubId },
    select: { id: true },
  });
  if (!charge) throw new NotFoundError(`Cobrança não encontrada.`);
}

// Padrão análogo para: plans, payments, athletes, templates, messages
```

```typescript
// Uso obrigatório em todos os handlers de recurso único
fastify.get('/api/members/:memberId', async (request, reply) => {
  const { clubId } = request.user;          // do JWT
  const { memberId } = request.params;

  await assertMemberBelongsToClub(prisma, memberId, clubId); // ← OBRIGATÓRIO
  const member = await getMemberById(prisma, clubId, memberId);
  return reply.send(member);
});
```

### 3.2 Regras de RBAC por Recurso

Documentar e enforçar a matriz completa:

| Endpoint | ADMIN | TREASURER |
|----------|-------|-----------|
| `POST /api/members` | ✅ | ✅ |
| `PUT /api/members/:id` | ✅ | ✅ |
| `DELETE /api/members/:id` | ✅ | ❌ 403 |
| `POST /api/plans` | ✅ | ❌ 403 |
| `PUT /api/plans/:id` | ✅ | ❌ 403 |
| `DELETE /api/plans/:id` | ✅ | ❌ 403 |
| `POST /api/charges/generate` | ✅ | ✅ |
| `GET /api/dashboard/*` | ✅ | ✅ |
| `PUT /api/templates/:key` | ✅ | ❌ 403 |
| `DELETE /api/templates/:key` | ✅ | ❌ 403 |
| `GET /api/members/:id/payments` | ✅ | ✅ |
| `POST /api/clubs/:id/logo` | ✅ | ❌ 403 |
| `GET /api/messages` | ✅ | ✅ |
| `GET /api/athletes` | ✅ | ✅ |
| `POST /api/athletes` | ✅ | ❌ 403 |

> Adicionar testes unitários para cada linha desta tabela no CI.

---

## 4. Proteção de Dados em Repouso e Trânsito

### 4.1 Conexão SSL com PostgreSQL **[OBRIGATÓRIO — L-14]**

```
# apps/api/.env.example
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require&sslrootcert=/etc/ssl/certs/ca-certificates.crt"
```

No Prisma:

```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Supabase já inclui SSL por padrão, mas reforçar no connection string
}
```

### 4.2 Redis com Autenticação e TLS **[OBRIGATÓRIO — L-08]**

```
# apps/api/.env.example
REDIS_URL="rediss://:STRONG_PASSWORD@host:6380"
#          ^^^^ rediss:// = TLS obrigatório
```

```typescript
// apps/api/src/lib/redis.ts
import { Redis } from 'ioredis';

export const redis = new Redis(process.env.REDIS_URL!, {
  tls: process.env.NODE_ENV === 'production' ? {} : undefined,
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
  lazyConnect: true,       // falha explicitamente no startup se Redis indisponível
});

// Falha no startup se Redis não conectar
redis.on('error', (err) => {
  if (err.message.includes('NOAUTH') || err.message.includes('ERR AUTH')) {
    console.error('[FATAL] Redis authentication failed. Check REDIS_URL.');
    process.exit(1);
  }
});
```

### 4.3 Validação de Variáveis de Ambiente no Startup **[OBRIGATÓRIO — L-09]**

```typescript
// apps/api/src/lib/env.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV:               z.enum(['development', 'staging', 'production']),
  DATABASE_URL:           z.string().url(),
  REDIS_URL:              z.string().url(),
  JWT_SECRET:             z.string().min(32, 'JWT_SECRET deve ter no mínimo 32 caracteres'),
  JWT_REFRESH_SECRET:     z.string().min(32, 'JWT_REFRESH_SECRET deve ter no mínimo 32 caracteres'),
  ASAAS_API_KEY:          z.string().min(1),
  ASAAS_WEBHOOK_SECRET:   z.string().min(32),
  RESEND_API_KEY:         z.string().min(1),
  ENCRYPTION_KEY:         z.string().min(32, 'ENCRYPTION_KEY (pgcrypto) deve ter no mínimo 32 caracteres'),
  ZAPI_TOKEN:             z.string().optional(),
  CONTACT_EMAIL_TO:       z.string().email().optional(),
});

// Executar ANTES de qualquer outro código no bootstrap
export function validateEnv() {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error('[FATAL] Variáveis de ambiente inválidas:');
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}
```

```typescript
// apps/api/src/server.ts — primeira linha do bootstrap
import { validateEnv } from './lib/env';
const env = validateEnv(); // falha fast se config incompleta
```

### 4.4 Rotação de Chaves de Criptografia

A chave `ENCRYPTION_KEY` usada pelo pgcrypto deve suportar rotação sem downtime:

```typescript
// apps/api/src/lib/crypto.ts

// Suportar múltiplas versões de chave para rotação gradual
const CURRENT_KEY_VERSION = parseInt(process.env.ENCRYPTION_KEY_VERSION ?? '1');
const ENCRYPTION_KEYS: Record<number, string> = {
  1: process.env.ENCRYPTION_KEY_V1!,
  // Na rotação: adicionar V2 e atualizar CURRENT_KEY_VERSION
};

export async function encryptField(prisma: PrismaClient, value: string): Promise<Buffer> {
  const key = ENCRYPTION_KEYS[CURRENT_KEY_VERSION];
  // ... pgp_sym_encrypt com prefixo de versão no ciphertext
}

export async function decryptField(prisma: PrismaClient, ciphertext: Buffer): Promise<string> {
  // Tentar todas as versões de chave disponíveis (backward compat)
  for (const [, key] of Object.entries(ENCRYPTION_KEYS).reverse()) {
    try {
      return await tryDecrypt(prisma, ciphertext, key);
    } catch { continue; }
  }
  throw new Error('Não foi possível desencriptar o campo.');
}
```

---

## 5. Segurança de API e Validação de Input

### 5.1 Configuração de CORS **[OBRIGATÓRIO — L-03]**

```typescript
// apps/api/src/app.ts
import cors from '@fastify/cors';

const ALLOWED_ORIGINS =
  process.env.NODE_ENV === 'production'
    ? ['https://app.clubos.com.br', 'https://clubos.com.br']
    : ['http://localhost:3000'];

await app.register(cors, {
  origin: (origin, callback) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origem não permitida'), false);
    }
  },
  credentials: true,      // necessário para cookies httpOnly
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Total-Count'],  // para paginação
  maxAge: 86400,           // pre-flight cache: 24h
});
```

> **Proibido:** `origin: '*'` em qualquer ambiente que use cookies httpOnly — a combinação não funciona e pode mascarar problemas de segurança.

### 5.2 Limite de Tamanho de Payload **[OBRIGATÓRIO — L-06]**

```typescript
// apps/api/src/app.ts
await app.register(import('@fastify/multipart'), {
  limits: {
    fileSize: 2 * 1024 * 1024,  // 2MB máximo para uploads de logo
    files: 1,                    // apenas 1 arquivo por request
    fieldSize: 100 * 1024,       // 100KB para campos de formulário
  },
});

// Para rotas JSON comuns
app.addContentTypeParser(
  'application/json',
  { parseAs: 'string', bodyLimit: 512 * 1024 }, // 512KB
  (req, body, done) => {
    try { done(null, JSON.parse(body as string)); }
    catch (e) { done(e as Error, undefined); }
  }
);

// Limite específico para import CSV
// POST /api/members/import — até 5.000 linhas (~5MB)
// Registrar com bodyLimit sobrescrito na rota específica
```

### 5.3 Proteção contra CSV Injection **[OBRIGATÓRIO — L-07]**

Campos exportados para CSV (relatórios, downloads de template) devem ser sanitizados:

```typescript
// apps/api/src/lib/csv-sanitize.ts
const CSV_INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

/**
 * Previne CSV Injection (fórmulas executadas ao abrir no Excel/Sheets).
 * Aplicar em TODOS os campos exportados para CSV.
 */
export function sanitizeCsvField(value: string): string {
  const trimmed = value.trim();
  if (CSV_INJECTION_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return `'${trimmed}`; // prefixo de apóstrofe força Excel a tratar como texto
  }
  return trimmed;
}

// Na importação CSV (entrada), rejeitar linhas com fórmulas:
export function validateCsvImportField(value: string, fieldName: string): string {
  if (CSV_INJECTION_PREFIXES.some((p) => value.trim().startsWith(p))) {
    throw new ValidationError(
      `Campo "${fieldName}" contém caractere inválido: "${value.trim()[0]}"`
    );
  }
  return value.trim();
}
```

### 5.4 Prevenção de Mass Assignment

O Zod já previne mass assignment ao selecionar apenas os campos declarados no schema. Garantir que **nenhuma rota** passe `request.body` diretamente para uma query sem parsing Zod:

```typescript
// ❌ PROIBIDO
await prisma.member.create({ data: request.body as any });

// ✅ CORRETO
const parsed = CreateMemberSchema.parse(request.body);
await prisma.member.create({ data: parsed });
```

### 5.5 Tratamento de Erros sem Vazamento **[OBRIGATÓRIO — L-12]**

```typescript
// apps/api/src/plugins/error-handler.plugin.ts
import { FastifyError, FastifyRequest, FastifyReply } from 'fastify';

export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  // Log interno completo (Sentry + pino)
  request.log.error({ err: error, reqId: request.id }, 'Unhandled error');

  // Em produção: nunca expor stack trace ou mensagens internas
  if (process.env.NODE_ENV === 'production') {
    const statusCode = error.statusCode ?? 500;

    if (statusCode >= 500) {
      // Erro interno: resposta genérica
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Ocorreu um erro inesperado. Nossa equipe foi notificada.',
      });
      return;
    }
  }

  // Erros de cliente (4xx): retornar message do erro de negócio
  reply.status(error.statusCode ?? 500).send({
    statusCode: error.statusCode ?? 500,
    error: error.name,
    message: error.message,
    // NUNCA incluir: error.stack, error.cause, detalhes de query
  });
}
```

---

## 6. Segurança de Webhooks

### 6.1 Proteção contra Replay Attacks **[OBRIGATÓRIO — L-11]**

A validação de HMAC atual confirma autenticidade, mas não previne replay de um payload válido capturado anteriormente.

```typescript
// apps/api/src/modules/payments/gateway.interface.ts
// Adicionar ao parseWebhook das implementações de gateway:

const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300; // 5 minutos

export function assertWebhookTimestamp(timestampHeader: string | undefined): void {
  if (!timestampHeader) {
    throw new WebhookSignatureError('Header de timestamp ausente.');
  }

  const webhookTime = parseInt(timestampHeader, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const diff = Math.abs(nowSeconds - webhookTime);

  if (diff > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
    throw new WebhookSignatureError(
      `Webhook com timestamp fora da janela aceitável (diff: ${diff}s).`
    );
  }
}
```

```typescript
// apps/api/src/modules/payments/gateways/asaas.gateway.ts
parseWebhook(rawBody: Buffer, headers: Record<string, string>): WebhookEvent {
  // 1. Validar timestamp ANTES da validação de assinatura
  assertWebhookTimestamp(headers['asaas-timestamp']);

  // 2. Validar HMAC (já implementado com timingSafeEqual)
  const signature = headers['asaas-access-token'];
  // ...

  // 3. Verificar idempotência no Redis para deduplicação rápida
  // (antes de enfileirar no BullMQ)
}
```

Adicionar deduplicação por `gatewayTxId` no Redis com TTL de 24h (camada rápida antes do DB):

```typescript
// apps/api/src/modules/webhooks/webhook.handler.ts
const WEBHOOK_DEDUP_KEY = (txId: string) => `webhook_dedup:${txId}`;
const DEDUP_TTL_SECONDS = 86400; // 24h

export async function isWebhookDuplicate(redis: Redis, txId: string): Promise<boolean> {
  const key = WEBHOOK_DEDUP_KEY(txId);
  // SET NX retorna null se a chave já existe
  const result = await redis.set(key, '1', 'EX', DEDUP_TTL_SECONDS, 'NX');
  return result === null; // null = já existia = duplicata
}
```

### 6.2 Rota de Webhook Sem Autenticação JWT

A rota `/webhooks/:gateway` é pública por design (PSPs não enviam JWT). Garantir que:

```typescript
// apps/api/src/app.ts
// A rota de webhook DEVE estar explicitamente excluída do middleware JWT
const PUBLIC_ROUTES = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/webhooks/',          // autenticação própria via HMAC
  '/api/events',         // autenticação própria via query param
];
```

---

## 7. Multi-Tenancy — Isolamento de Dados

### 7.1 `withTenantSchema` — Uso Obrigatório

Todo acesso ao banco que não seja ao schema `public` DEVE usar `withTenantSchema`:

```typescript
// ✅ CORRETO
return withTenantSchema(prisma, clubId, async (tx) => {
  return tx.member.findMany({ where: { status: 'ACTIVE' } });
});

// ❌ PROIBIDO — query sem contexto de tenant
return prisma.member.findMany(); // acessa o schema errado ou falha
```

### 7.2 Testes de Isolamento de Tenant

Adicionar testes de segurança específicos de tenant ao CI:

```typescript
// apps/api/src/modules/members/members.test.ts
describe('Tenant Isolation Security', () => {
  it('should return 404 when member belongs to different club', async () => {
    // Criar membro no clube A
    const memberClubA = await createTestMember(clubAId);

    // Tentar acessar com JWT do clube B
    const response = await app.inject({
      method: 'GET',
      url: `/api/members/${memberClubA.id}`,
      headers: { Authorization: `Bearer ${clubBToken}` },
    });

    // 404 (não 403) — não confirmar existência do recurso
    expect(response.statusCode).toBe(404);
  });

  it('should not leak data between tenants in search', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/members?search=João',
      headers: { Authorization: `Bearer ${clubBToken}` },
    });
    const data = response.json();
    expect(data.data.every((m: any) => m.clubId === clubBId)).toBe(true);
  });
});
```

---

## 8. Segurança de Upload de Ficheiros

### 8.1 Validação de MIME Type Real (Magic Bytes) **[OBRIGATÓRIO — L-05]**

Validar o Content-Type declarado é insuficiente — um atacante pode enviar um executável com `Content-Type: image/png`. Verificar os magic bytes do ficheiro:

```typescript
// apps/api/src/lib/file-validation.ts
import { fileTypeFromBuffer } from 'file-type'; // npm install file-type

const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

export async function validateImageUpload(buffer: Buffer, filename: string): Promise<void> {
  // 1. Verificar tamanho
  if (buffer.length > MAX_LOGO_SIZE_BYTES) {
    throw new ValidationError('Ficheiro muito grande. Máximo permitido: 2MB.');
  }

  // 2. Verificar magic bytes (tipo real do ficheiro)
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_IMAGE_MIME_TYPES.includes(detected.mime)) {
    throw new ValidationError(
      `Tipo de ficheiro não permitido: ${detected?.mime ?? 'desconhecido'}. ` +
      `Use PNG, JPEG, WebP ou GIF.`
    );
  }

  // 3. Verificar extensão (defense-in-depth)
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext ?? '')) {
    throw new ValidationError('Extensão de ficheiro não permitida.');
  }
}
```

### 8.2 Armazenamento Seguro de Ficheiros

```typescript
// apps/api/src/modules/clubs/logo.service.ts

import { randomUUID } from 'node:crypto';
import path from 'node:path';

export function generateSafeLogoPath(clubId: string): string {
  // NUNCA usar o nome original do ficheiro (path traversal)
  const safeFilename = `${clubId}-${randomUUID()}.webp`;

  // Validar que o path final não sai do directório de uploads
  const uploadsDir = path.resolve(process.env.UPLOADS_DIR ?? './uploads');
  const filePath = path.resolve(uploadsDir, safeFilename);

  if (!filePath.startsWith(uploadsDir)) {
    throw new Error('Path traversal detectado.'); // nunca deve acontecer, mas defensive
  }

  return filePath;
}
```

---

## 9. Segurança de Infraestrutura e Dependências

### 9.1 Scanning de Dependências no CI **[OBRIGATÓRIO — L-10]**

Adicionar ao pipeline de GitHub Actions:

```yaml
# .github/workflows/ci.yml
jobs:
  security-audit:
    name: Security Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: npm audit (API)
        working-directory: apps/api
        run: npm audit --audit-level=high
        # Falha o CI se houver vulnerabilidades de nível HIGH ou CRITICAL

      - name: npm audit (Web)
        working-directory: apps/web
        run: npm audit --audit-level=high

      # Opcionalmente, adicionar Snyk ou socket.dev para análise mais profunda:
      - name: Snyk Security Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high
```

### 9.2 Secrets no CI/CD

```yaml
# NUNCA fazer isto:
# env:
#   DATABASE_URL: postgresql://user:password@host/db   ← exposto no log

# CORRETO — usar secrets do GitHub Actions:
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  JWT_SECRET: ${{ secrets.JWT_SECRET }}
```

Regras para secrets:
- Secrets com comprimento mínimo de 32 bytes para todas as chaves criptográficas
- Gerar com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Rotação semestral de JWT_SECRET, JWT_REFRESH_SECRET e ASAAS_WEBHOOK_SECRET
- Rotação imediata em caso de suspeita de comprometimento
- Nunca reutilizar secrets entre ambientes (dev/staging/prod usam chaves diferentes)

### 9.3 Headers de Segurança Completos

Complementar o CSP básico existente com a stack completa de headers defensivos:

```typescript
// apps/api/src/plugins/security-headers.plugin.ts
import fp from 'fastify-plugin';

export const securityHeadersPlugin = fp(async (fastify) => {
  fastify.addHook('onSend', async (request, reply) => {
    // Previne clickjacking
    reply.header('X-Frame-Options', 'DENY');

    // Previne MIME sniffing
    reply.header('X-Content-Type-Options', 'nosniff');

    // Controla referrer em requests cross-origin
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Desativa features de browser não usadas
    reply.header(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()'
    );

    // Remover header que expõe a tecnologia usada
    reply.removeHeader('X-Powered-By');
    reply.removeHeader('Server');
  });
});
```

```typescript
// apps/web/next.config.ts — CSP mais restritivo
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",  // unsafe-inline necessário para Next.js; remover após migrar para nonces
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://api.clubos.com.br",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
];
```

### 9.4 Dockerfile Seguro (para deploy em container)

```dockerfile
# Usar imagem minimal e fixar versão exata
FROM node:20.18.0-alpine3.20 AS base

# Não correr como root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 apiuser

# ...build steps...

FROM base AS runner
USER apiuser

# Variáveis de ambiente de runtime são injetadas pelo orquestrador
# NUNCA copiar .env para a imagem
COPY --chown=apiuser:nodejs --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/server.js"]
```

---

## 10. Headers HTTP e Configuração do Next.js

### 10.1 Proteção de API Routes no Next.js (CSRF) **[OBRIGATÓRIO — L-15]**

As API Routes do Next.js (`/api/contact`) usam o mecanismo de Same-Origin implícito, mas devem ter proteção explícita:

```typescript
// apps/web/src/app/api/contact/route.ts
import { headers } from 'next/headers';

export async function POST(request: Request) {
  const headersList = headers();

  // Verificar que o request vem do próprio domínio
  const origin = headersList.get('origin');
  const allowedOrigins = [
    'https://clubos.com.br',
    process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : '',
  ].filter(Boolean);

  if (!origin || !allowedOrigins.includes(origin)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Verificar Content-Type para prevenir form-based CSRF
  const contentType = headersList.get('content-type');
  if (!contentType?.includes('application/json')) {
    return Response.json({ error: 'Content-Type inválido' }, { status: 415 });
  }

  // ... resto do handler
}
```

### 10.2 Middleware de Auth no Next.js

```typescript
// apps/web/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/', '/precos', '/contato', '/login', '/onboarding'];
const AUTH_PATHS = ['/dashboard', '/members', '/plans', '/charges', '/athletes', '/settings'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Verificar se é rota protegida
  const isProtectedRoute = AUTH_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtectedRoute) return NextResponse.next();

  // O accessToken é in-memory; verificação real feita pelo AuthProvider no cliente.
  // O middleware verifica apenas a presença do refresh cookie para redirecionamento rápido.
  const hasRefreshCookie = request.cookies.has('refresh_token');

  if (!hasRefreshCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
};
```

---

## 11. Logging, Auditoria e Resposta a Incidentes

### 11.1 Eventos de Segurança no Audit Log

Adicionar eventos de segurança à tabela `audit_log` existente:

```typescript
// apps/api/src/lib/audit-log.ts — eventos adicionais de segurança
export enum AuditAction {
  // Financeiros (já existentes)
  CHARGE_GENERATED     = 'CHARGE_GENERATED',
  PAYMENT_CONFIRMED    = 'PAYMENT_CONFIRMED',
  PAYMENT_CANCELLED    = 'PAYMENT_CANCELLED',

  // Segurança (ADICIONAR)
  LOGIN_SUCCESS        = 'LOGIN_SUCCESS',
  LOGIN_FAILED         = 'LOGIN_FAILED',
  LOGIN_LOCKED         = 'LOGIN_LOCKED',        // conta bloqueada após 5 tentativas
  LOGOUT               = 'LOGOUT',
  TOKEN_REFRESH        = 'TOKEN_REFRESH',
  WEBHOOK_SIGNATURE_INVALID = 'WEBHOOK_SIGNATURE_INVALID',
  MEMBER_EXPORT        = 'MEMBER_EXPORT',       // exportação de dados pessoais (LGPD)
  PLAN_DELETED         = 'PLAN_DELETED',
  MEMBER_DELETED       = 'MEMBER_DELETED',
  UNAUTHORIZED_ACCESS  = 'UNAUTHORIZED_ACCESS', // tentativa de acesso cross-tenant
}
```

### 11.2 O Que NUNCA Registar em Logs

```typescript
// Campos proibidos em qualquer log (pino redact obrigatório):
const SENSITIVE_LOG_FIELDS = [
  'password',
  'passwordHash',
  'req.body.password',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.query.token',        // SSE token
  'cpf',                    // plaintext antes de encriptar
  'phone',                  // plaintext antes de encriptar
  'asaas-access-token',     // webhook secret
  'pixCopyPaste',           // dado financeiro sensível
  'qrCodeBase64',           // pode ser grande e sensível
];
```

### 11.3 Setup do Sentry (T-043) — Configuração Segura

```typescript
// apps/api/src/lib/sentry.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  beforeSend(event) {
    // Remover dados sensíveis antes de enviar ao Sentry
    if (event.request?.cookies) {
      delete event.request.cookies['refresh_token'];
    }
    if (event.request?.data) {
      const data = event.request.data as Record<string, unknown>;
      if (data.password) data.password = '[Filtered]';
      if (data.cpf) data.cpf = '[Filtered]';
    }
    return event;
  },

  // Não capturar erros esperados (4xx de cliente)
  ignoreErrors: [
    'UnauthorizedError',
    'ForbiddenError',
    'NotFoundError',
    'ValidationError',
    'TooManyRequestsError',
  ],
});
```

### 11.4 Plano de Resposta a Incidentes

| Tipo de Incidente | Tempo de Resposta | Acções Imediatas |
|---|---|---|
| Credencial vazada (JWT_SECRET) | < 1h | Rotacionar secret → invalida todos os tokens ativos. Forçar re-login geral. |
| Acesso cross-tenant detectado | < 30min | Revogar sessão do utilizador. Audit log do acesso. Notificar clubes afectados. |
| Duplicidade de cobrança | < 2h | Pausar job de cobranças. Identificar `chargeId` duplicados. Cancelar cobranças extras via Asaas API. |
| Chave de API Asaas comprometida | < 1h | Revogar chave no painel Asaas. Gerar nova chave. Actualizar env var em produção. |
| Injecção de SQL detectada | < 30min | Bloquear IP. Audit log completo. Verificar integridade de dados do tenant. |

Post-mortem escrito em Notion em até 24h após resolução, com: timeline, causa-raiz, impacto e acções preventivas.

---

## 12. Segurança em Jobs Assíncronos (BullMQ)

### 12.1 Segurança da Fila BullMQ

```typescript
// apps/api/src/lib/queue.ts
import { Queue, Worker } from 'bullmq';

// Usar Redis com auth (já coberto na secção 4.2)
const connection = { url: process.env.REDIS_URL };

// Prefixo de fila com nome do ambiente para isolar staging de prod
const QUEUE_PREFIX = `{clubos:${process.env.NODE_ENV}}`;

export const chargeGenerationQueue = new Queue('charge-generation', {
  connection,
  prefix: QUEUE_PREFIX,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },  // não acumular jobs indefinidamente
    removeOnFail: { count: 500 },
    attempts: 3,
  },
});
```

### 12.2 Sanitização de Dados em Payloads de Jobs

Nunca incluir dados sensíveis no payload de jobs — usar apenas IDs:

```typescript
// ❌ PROIBIDO — dados sensíveis no payload do job
chargeQueue.add('generate', {
  memberName: 'João Silva',
  cpf: '123.456.789-00',      // exposto nos logs do Redis
  phone: '(11) 99999-0000',
  amount: 14900,
});

// ✅ CORRETO — apenas IDs; buscar dados frescos no worker
chargeQueue.add('generate', {
  clubId: 'abc123',
  memberId: 'xyz456',
  period: '2025-01',
  // jobId estável para deduplicação
}, { jobId: `generate-${clubId}-${period}` });
```

---

## 13. Checklist de Deploy para Produção

Execute esta checklist antes de cada deploy em produção:

### Configuração de Ambiente

- [ ] Todas as variáveis do `.env.example` estão configuradas no painel do serviço de hospedagem
- [ ] `NODE_ENV=production` está definido
- [ ] `DATABASE_URL` inclui `?sslmode=require`
- [ ] `REDIS_URL` usa `rediss://` (TLS) e inclui senha forte
- [ ] `JWT_SECRET` e `JWT_REFRESH_SECRET` têm ≥ 32 caracteres e são únicos para produção
- [ ] `ASAAS_WEBHOOK_SECRET` tem ≥ 32 caracteres
- [ ] `ENCRYPTION_KEY` tem ≥ 32 caracteres

### Código

- [ ] `npm audit --audit-level=high` passa nos dois apps sem vulnerabilidades
- [ ] Nenhum `console.log` com dados sensíveis em código de produção
- [ ] Nenhum `any` explícito em módulos financeiros (charges, payments, webhooks, jobs)
- [ ] Error handler está configurado para não expor stack traces
- [ ] CORS está configurado com lista de origens explícita (sem wildcard)
- [ ] Todos os endpoints de recursos usam `assertMemberBelongsToClub` ou equivalente

### Infraestrutura

- [ ] HSTS header está activo (`Strict-Transport-Security: max-age=63072000`)
- [ ] CSP header está configurado no Next.js
- [ ] `X-Frame-Options: DENY` está activo
- [ ] `X-Content-Type-Options: nosniff` está activo
- [ ] Logs do servidor não contêm tokens, senhas ou CPFs em plaintext
- [ ] Backups automáticos do PostgreSQL estão activos e foram testados

### Fluxo Financeiro

- [ ] Webhook Asaas configurado com URL de produção e secret correcto
- [ ] Idempotência testada: simular payload duplicado e verificar que não cria `Payment` duplo
- [ ] Job de cobranças testado com data de execução manual antes de ligar o cron
- [ ] Rate limiting de WhatsApp validado com envio em lote pequeno (< 10 membros)

### Monitoramento

- [ ] Sentry DSN configurado para ambos apps (front e back)
- [ ] Alertas de erro configurados no Sentry (threshold: > 5 erros 5xx em 5 minutos)
- [ ] Logtail (ou equivalente) recebendo logs estruturados da API
- [ ] Endpoint de health check (`GET /health`) retorna 200 e é monitorado

---

## O Que É Explicitamente Proibido (Adições de Segurança)

Complementando a tabela de `architecture-rules.md`:

| Proibido | Alternativa Correcta |
|----------|---------------------|
| `origin: '*'` no CORS com cookies httpOnly | Lista explícita de origens permitidas |
| Logar CPF, telefone ou tokens em plaintext | `pino-redact` com campos sensíveis configurados |
| Usar `req.body` directamente em queries sem Zod parse | `Schema.parse(request.body)` antes de qualquer operação |
| Usar o nome original do ficheiro em uploads | `randomUUID()` + extensão validada |
| Validar MIME type apenas pelo `Content-Type` do request | Verificar magic bytes com `file-type` |
| Stack traces em respostas de erro em produção | Error handler centralizado com mensagem genérica para 5xx |
| Dados pessoais em payloads de jobs BullMQ | Apenas IDs; dados buscados frescos no worker |
| `npm audit` com vulnerabilidades HIGH/CRITICAL no CI | Corrigir ou documentar exceção com justificativa |
| Mesmas chaves JWT em staging e produção | Chaves únicas por ambiente |
| `localStorage` ou `sessionStorage` para tokens | Apenas memória do AuthProvider (access) e httpOnly cookie (refresh) |
