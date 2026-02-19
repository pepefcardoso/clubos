# Architecture Rules — ClubOS v1.0

> Regras não-negociáveis de arquitetura. Qualquer desvio requer RFC aprovado com justificativa explícita.

---

## Separação de Camadas

### Regra geral

```
[Frontend Web]  ──┐
                  ├──▶  API (Fastify)  ──▶  PostgreSQL
[App Mobile]    ──┘         │
                             └──▶  Redis / Asaas / WhatsApp
```

- **Nenhum frontend acessa o banco diretamente.** Toda leitura e escrita passa pela API.
- **A API é uma só.** Não existem APIs separadas para web e mobile — os dois consomem o mesmo backend.
- **Lógica de negócio fica no backend.** O frontend apenas exibe e envia dados.

---

## Multi-Tenancy

- Estratégia adotada: **schema-per-tenant** no PostgreSQL.
- Cada clube tem seu próprio schema `clube_{id}` criado automaticamente no onboarding.
- O schema `public` contém apenas o registro master de clubes e usuários globais.
- **Proibido:** queries que façam JOIN entre schemas de clubes diferentes.
- **Proibido:** retornar dados de um tenant em uma requisição autenticada de outro tenant.
- Todo request autenticado deve ter o `club_id` extraído do JWT e usado para selecionar o schema correto antes de qualquer query.

---

## Segurança

### Autenticação e Autorização

- Access token JWT com validade de **15 minutos**.
- Refresh token com validade de **7 dias**, armazenado em **httpOnly cookie** (nunca em localStorage).
- Rotação de refresh token a cada uso — o token anterior é invalidado imediatamente.
- RBAC com dois papéis: `ADMIN` e `TREASURER`. Guards aplicados no nível de rota no Fastify.
- Tesoureiro não pode deletar sócios, alterar planos ou acessar configurações do clube.

### Proteção de Dados

- CPF e telefone de sócios criptografados em repouso com **pgcrypto AES-256**.
- Chaves de criptografia armazenadas como variáveis de ambiente; nunca no banco.
- Logs de auditoria imutáveis na tabela `audit_log` — operações financeiras não podem ser apagadas.

### Webhooks

- Todo webhook recebido (Asaas, WhatsApp) deve ter a assinatura **HMAC-SHA256** validada antes de qualquer processamento.
- Rejeitar com HTTP 401 qualquer payload sem header de assinatura válido.
- Responder **HTTP 200 imediatamente** e processar a lógica em job assíncrono (BullMQ). Nunca processar de forma síncrona em webhooks.
- Idempotência obrigatória: checar se `gateway_txid` já existe antes de criar um `payment`.

### Headers de Segurança

- HTTPS obrigatório em todos os ambientes exceto desenvolvimento local.
- HSTS habilitado em produção.
- CSP básico configurado no Next.js para prevenir XSS.
- Rate limiting global: **100 req/min por IP** via `fastify-rate-limit` + Redis.

---

## Confiabilidade

### Tratamento de Falhas em Cobranças

- Falha na geração de cobrança Pix → retry automático com **backoff exponencial**: 1h / 6h / 24h.
- Após 3 tentativas sem sucesso → status `PENDING_RETRY` + alerta visível no dashboard do clube.
- Falha no envio de WhatsApp após 2 tentativas → fallback automático para **e-mail via Resend**.
- Nenhuma falha silenciosa: toda exceção capturada e registrada no Sentry.

### Disponibilidade

- Meta: **≥ 99,5% de uptime** mensal para o fluxo de cobrança.
- Deploys sem downtime via Railway/Render (zero-downtime deployments).
- Backups automáticos do PostgreSQL via Supabase (retenção de 7 dias no plano padrão).

---

## Jobs Assíncronos (BullMQ)

- Todo job deve ser **idempotente** — reprocessar o mesmo job não pode gerar duplicidade de cobrança ou mensagem.
- Jobs de cobrança rodam com **concorrência máxima de 5** para não sobrecarregar a API do Asaas.
- Rate limiting de WhatsApp: **máximo 30 mensagens/minuto por clube** via Redis sliding window.
- Todo job deve registrar seu resultado (sucesso, falha, retry) na tabela `messages` ou `audit_log`.

---

## API Design

- REST com recursos em **kebab-case, plural**: `/api/members`, `/api/charges`.
- Respostas de erro padronizadas com `statusCode`, `error` e `message`.
- Paginação obrigatória em todos os endpoints de listagem (parâmetros `page` e `limit`).
- Validação de payload com **Zod** na entrada de toda rota que recebe body ou query params.
- Versioning via path prefix quando necessário: `/api/v2/...` (não por header).

---

## Código Financeiro — Regras Especiais

- Valores monetários são sempre armazenados e processados em **centavos (integer)**. Nunca usar `float` para dinheiro.
- Formatação para exibição (`R$ 1.490,00`) acontece apenas no frontend, via `Intl.NumberFormat`.
- **Mínimo 2 aprovações em PR** para qualquer mudança nos módulos: `charges`, `payments`, `webhooks`.
- Cobertura de testes mínima de **80%** nesses módulos, verificada no CI.
- Alterações em `payments` são imutáveis — um pagamento confirmado nunca é deletado, apenas cancelado com registro de motivo.

---

## O que é Explicitamente Proibido

| Proibido | Alternativa Correta |
|---|---|
| `any` explícito no TypeScript | Definir o tipo correto ou usar `unknown` com type guard |
| `@ts-ignore` sem comentário explicando | Corrigir o tipo ou documentar o motivo |
| Commitar `.env` | Manter `.env.example` atualizado no repo |
| Float para valores monetários | Armazenar em centavos como integer |
| Frontend acessando banco diretamente | Toda operação via API |
| Query entre schemas de tenants diferentes | Operações sempre dentro do schema do tenant autenticado |
| Processar webhook de forma síncrona | Responder 200 imediatamente e enfileirar no BullMQ |
| Chave de API ou secret em código-fonte | Variáveis de ambiente via Railway/Render |
