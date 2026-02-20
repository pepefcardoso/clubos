# Architecture Rules — ClubOS v1.0

> Regras não-negociáveis de arquitetura. Qualquer desvio requer RFC aprovado com justificativa explícita.

---

## Separação de Camadas

### Regra geral

```
[Frontend Web]  ──┐
                  ├──▶  API (Fastify)  ──▶  PostgreSQL
[App Mobile]    ──┘         │
                             └──▶  Redis / PaymentGateway / WhatsApp
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

## Camada de Pagamento — Gateway Abstraction

### Princípio central

Nenhum módulo de negócio (`ChargeService`, jobs, rotas de webhook) deve importar ou instanciar um gateway de pagamento diretamente. **Todo acesso a provedores de pagamento passa pela interface `PaymentGateway`** e é resolvido pelo `GatewayRegistry`.

```
ChargeService
    │
    │  GatewayRegistry.forMethod('PIX')
    ▼
PaymentGateway          ← interface
    │
    ├── AsaasGateway    ← implementação concreta (Asaas)
    ├── PagarmeGateway  ← (futuro)
    └── StripeGateway   ← (futuro)
```

### Regras obrigatórias

- **Proibido:** importar `AsaasGateway` (ou qualquer gateway concreto) fora do diretório `modules/payments/gateways/`.
- **Proibido:** adicionar campos específicos de um provider no schema do banco (ex: `pixCobId`, `boletoUrl`). Use `gatewayMeta` (JSONB).
- **Obrigatório:** todo novo gateway deve implementar a interface `PaymentGateway` completa, incluindo `parseWebhook` com validação de assinatura.
- **Obrigatório:** registrar o gateway em `gateways/index.ts` no bootstrap da aplicação.
- **Obrigatório:** toda rota de webhook usa a assinatura do gateway correspondente — `GatewayRegistry.get(params.gateway).parseWebhook(...)`.

### Schema agnóstico

O modelo `Charge` armazena dados do provider em dois campos genéricos:

| Campo         | Tipo      | Propósito                                                                                 |
| ------------- | --------- | ----------------------------------------------------------------------------------------- |
| `gatewayName` | `String?` | Slug do gateway que criou a cobrança (`"asaas"`, `"pagarme"`). Null para métodos offline. |
| `externalId`  | `String?` | ID da cobrança no gateway externo. Usado para cancelamento e lookup.                      |
| `gatewayMeta` | `Json?`   | Dados específicos do provider/método (QR Code, URL do boleto, etc.).                      |

Adicionar suporte a um novo gateway **nunca exige migration de schema**.

### Métodos offline (CASH, BANK_TRANSFER)

Pagamentos em dinheiro ou transferência não passam por gateway. O `ChargeService` detecta o método e cria a `Charge` com `gatewayName = null` e `externalId = null`. O `Payment` é criado manualmente pelo tesoureiro via endpoint dedicado.

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

- Todo webhook recebido deve ter a assinatura **HMAC-SHA256** validada via `PaymentGateway.parseWebhook()` antes de qualquer processamento.
- A rota de webhook é paramétrica: `POST /webhooks/:gateway`. O gateway é resolvido via `GatewayRegistry.get(params.gateway)`.
- Rejeitar com HTTP 401 qualquer payload com assinatura inválida.
- Responder **HTTP 200 imediatamente** e processar a lógica em job assíncrono (BullMQ).
- Idempotência obrigatória: checar se `gateway_txid` já existe antes de criar um `payment`.

### Headers de Segurança

- HTTPS obrigatório em todos os ambientes exceto desenvolvimento local.
- HSTS habilitado em produção.
- CSP básico configurado no Next.js para prevenir XSS.
- Rate limiting global: **100 req/min por IP** via `fastify-rate-limit` + Redis.

---

## Confiabilidade

### Tratamento de Falhas em Cobranças

- Falha na geração de cobrança → retry automático com **backoff exponencial**: 1h / 6h / 24h.
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
- Jobs de cobrança rodam com **concorrência máxima de 5** para não sobrecarregar o gateway ativo.
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

| Proibido                                                          | Alternativa Correta                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `any` explícito no TypeScript                                     | Definir o tipo correto ou usar `unknown` com type guard       |
| `@ts-ignore` sem comentário explicando                            | Corrigir o tipo ou documentar o motivo                        |
| Commitar `.env`                                                   | Manter `.env.example` atualizado no repo                      |
| Float para valores monetários                                     | Armazenar em centavos como integer                            |
| Frontend acessando banco diretamente                              | Toda operação via API                                         |
| Query entre schemas de tenants diferentes                         | Operações sempre dentro do schema do tenant autenticado       |
| Processar webhook de forma síncrona                               | Responder 200 imediatamente e enfileirar no BullMQ            |
| Chave de API ou secret em código-fonte                            | Variáveis de ambiente via Railway/Render                      |
| Importar gateway concreto fora de `modules/payments/gateways/`    | Usar `GatewayRegistry.get()` ou `GatewayRegistry.forMethod()` |
| Adicionar campo específico de provider no schema (ex: `pixCobId`) | Usar o campo `gatewayMeta` (JSONB) em `Charge`                |
