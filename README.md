# Stock.io — POC mTLS

POC de autenticação mTLS bidirecional entre client e server, com:
- Emissão / renovação / revogação de certificado por device
- Rotação de CA do servidor com cross-signing (retro-compat)
- Renovação em runtime (estratégia A1: chave privada do device gerada uma vez e mantida)
- Mock de sistema de stocks com inflow de crédito BRL

## Estrutura

Monorepo com npm workspaces:

```
stocks.io/
├── packages/
│   ├── shared/         # tipos, constantes, utils cripto (compartilhado)
│   ├── server/         # API mTLS + painel admin (deploy: AWS EC2)
│   ├── client-agent/   # daemon Node local (detém chave privada)
│   └── client-ui/      # Vite + Tailwind 4 (consome agent via /api)
```

## Setup local

Pré-requisitos: **Node.js 22+**, **MySQL 8** (ou alternativa — ver `.env.example`)

```bash
# 1. Instalar dependências de todos os workspaces
npm install

# 2. Build do pacote shared (server e agent dependem dele)
npm run build --workspace=@stocks.io/shared

# 3. Bootstrap da CA + cert do servidor
cd packages/server
cp .env.example .env
# edite .env (DATABASE_URL, SERVER_HOSTNAME)
npm run ca:bootstrap

# 4. DB
npm run prisma:generate
npm run prisma:migrate

# 5. Iniciar tudo (3 terminais separados)
npm run dev:server   # server mTLS na porta 4443
npm run dev:agent    # agent local na 7700
npm run dev:ui       # Vite na 5173
```

Abra [http://localhost:5173](http://localhost:5173).

## Arquitetura do client

```
[Browser do usuário]
    ↓ HTTP plain
[Vite dev / build estático servido pelo agent]
    ↓ HTTP plain (localhost:7700)
[Agent Node.js — guarda chave privada]
    ↓ mTLS (porta 443)
[Server na AWS EC2]
```

A chave privada **nunca** sai do agent. Toda renovação é feita via CSR
gerado a partir da chave existente (estratégia A1).

## Status de implementação

| Fase | Status |
|---|---|
| 0. Setup AWS EC2 | aguardando user |
| 1. CA + cripto core | feito |
| 2. Server mTLS skeleton | a fazer |
| 3. Endpoints (enroll, renew, inflow, heartbeat) | a fazer |
| 4. Painel admin | a fazer |
| 5. Client agent | a fazer |
| 6. Client UI | a fazer |
| 7. Cross-signing CA rotation | a fazer |
| 8. Cenários de teste | a fazer |
| 9. Distribuição (pkg) | a fazer |

## Segurança

- Chaves privadas em `**/certs/` e `~/.stocksio-client/` — gitignored.
- `JWT_SECRET` e `ADMIN_INITIAL_PASSWORD` precisam ser trocados antes de qualquer deploy.
- Em produção real (não POC): CA private key fora do banco, em HSM ou secret manager.
