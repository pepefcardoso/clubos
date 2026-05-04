# Infraestrutura e Deploy — ClubOS v1.0

> Decisões de infraestrutura para o MVP. Revisitar antes da Fase 2.

---

## Serviços

| Componente     | Serviço                     | Observação                                               |
| -------------- | --------------------------- | -------------------------------------------------------- |
| Hospedagem API | Railway ou Render (PaaS)    | Deploy via Git push; sem DevOps dedicado no MVP          |
| Banco de Dados | Supabase (Postgres managed) | Conexão pooling, backups automáticos, painel de consulta |
| CDN / Assets   | Cloudflare                  | Free tier cobre 100% do MVP                              |
| Monitoramento  | Sentry + Logtail            | Error tracking em prod; logs estruturados                |
| CI/CD          | GitHub Actions              | Pipeline: lint → typecheck → test → build em todo PR     |
| Secrets        | Railway / Render Env Vars   | Nunca commitar `.env`; manter `.env.example` atualizado  |

---

## Pipeline CI (GitHub Actions)

Executado em todo PR e push para `develop` e `main`:

1. **Lint** — ESLint, zero warnings
2. **Type Check** — `tsc --noEmit`
3. **Test** — `vitest run` com thresholds de cobertura (ver `vitest.config.ts`)
4. **Build** — verifica que o projeto compila sem erros
5. **Financial Module Gate** — anota o PR se arquivos em `modules/charges`, `modules/payments`, `webhooks` ou `jobs` forem modificados

Deploy automático em staging ocorre após merge em `develop`. Deploy em produção ocorre após merge em `main`.

---

## Variáveis de Ambiente

Todas as variáveis necessárias estão documentadas em `apps/api/.env.example`. Nunca adicionar valores reais ao repo — usar o painel de env vars do serviço de hospedagem.

```
DATABASE_URL            # Connection string PostgreSQL
REDIS_URL               # Connection string Redis
JWT_SECRET              # Secret do access token (≥ 32 chars)
JWT_REFRESH_SECRET      # Secret do refresh token (≥ 32 chars)
ASAAS_API_KEY           # Chave de API Asaas
ASAAS_WEBHOOK_SECRET    # Secret para validação HMAC dos webhooks Asaas
RESEND_API_KEY          # Chave Resend para e-mails transacionais
ZAPI_TOKEN              # Token Z-API para WhatsApp
```

---

## Backups e Recuperação

- Backups automáticos do PostgreSQL via Supabase (retenção de 7 dias no plano padrão).
- Em caso de incidente, post-mortem escrito em Notion em até 24h após resolução.
