# ClubOS

SaaS multi-tenant para gestão financeira de clubes de futebol — cobranças Pix, controle de sócios e régua de cobrança via WhatsApp.

---

## Pré-requisitos

| Ferramenta | Versão mínima |
|---|---|
| Node.js | 18 |
| pnpm | 9 |
| Docker | qualquer |

> PostgreSQL e Redis rodam via Docker — não é necessário instalá-los manualmente.

---

## 1. Instalar Node.js

**Windows:** baixe o instalador em https://nodejs.org e siga o assistente.

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Verifique:
```bash
node -v   # deve retornar v18 ou superior
```

---

## 2. Instalar pnpm

```bash
npm install -g pnpm@9
```

---

## 3. Instalar Docker

**Windows:** baixe o Docker Desktop em https://www.docker.com/products/docker-desktop, instale e inicie o aplicativo. Certifique-se de que o ícone da baleia aparece na bandeja do sistema antes de continuar.

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo tee /etc/apt/keyrings/docker.asc > /dev/null
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo usermod -aG docker $USER   # permite rodar docker sem sudo (requer logout/login)
```

Verifique:
```bash
docker -v
docker compose version
```

---

## Instalação e execução

### 4. Clonar e instalar dependências

```bash
git clone <url-do-repo>
cd clubos
pnpm install
```

### 5. Configurar variáveis de ambiente

```bash
# Linux / macOS
cp apps/api/.env.example apps/api/.env

# Windows (PowerShell)
Copy-Item apps/api/.env.example apps/api/.env
```

Edite `apps/api/.env` e preencha os valores:

```env
DATABASE_URL="postgresql://clubos:clubos@localhost:5432/clubos_dev"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="sua-chave-secreta-com-pelo-menos-32-caracteres"
JWT_REFRESH_SECRET="outra-chave-secreta-com-pelo-menos-32-chars"
ASAAS_API_KEY="sua_chave_asaas"
ASAAS_WEBHOOK_SECRET="seu_webhook_secret_asaas"
RESEND_API_KEY="sua_chave_resend"
ZAPI_TOKEN="seu_token_zapi"
```

> Para desenvolvimento, apenas `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` e `JWT_REFRESH_SECRET` são obrigatórios.

### 6. Subir banco de dados e Redis

```bash
pnpm db:up
```

Aguarde os containers iniciarem (PostgreSQL na porta `5432`, Redis na porta `6379`).

### 7. Executar as migrations do banco

```bash
pnpm db:migrate
```

### 8. Iniciar o projeto

```bash
# Sobe API (porta 3001) e Web (porta 3000) simultaneamente
pnpm dev
```

Acesse: **http://localhost:3000**

---

## Comandos úteis

| Comando | Descrição |
|---|---|
| `pnpm dev` | Inicia API e Web em modo desenvolvimento |
| `pnpm build` | Build de produção |
| `pnpm test` | Roda todos os testes |
| `pnpm typecheck` | Verifica tipos TypeScript |
| `pnpm lint` | Roda o linter |
| `pnpm db:up` | Sobe PostgreSQL e Redis via Docker |
| `pnpm db:migrate` | Executa migrations pendentes |
| `pnpm db:studio` | Abre o Prisma Studio (interface visual do banco) |

---

## Parando o ambiente

```bash
docker compose down
```

Para remover os dados do banco junto:

```bash
docker compose down -v
```