# TechParts

Projeto acadêmico de e-commerce de componentes e periféricos de informática. O frontend usa React e TypeScript, e o backend será dividido em serviços de catálogo, autenticação e carrinho, com FastAPI, PyMongo e MongoDB.

## Execução local

Pré-requisitos: Node.js 22, pnpm 10, Python 3.14 e Docker com Compose. No Windows, abra o Docker Desktop antes de executar os comandos abaixo no PowerShell, a partir da raiz do projeto.

```powershell
docker compose up -d
docker compose exec mongo mongosh --quiet --eval "db.hello().isWritablePrimary"
pnpm install --frozen-lockfile
pnpm dev
```

O comando do MongoDB deve retornar `true` após a inicialização do replica set local. Abra o endereço exibido pelo Vite para acessar as telas.

Para instalar as dependências Python em um ambiente virtual:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

O frontend usa dados de demonstração em memória. O primeiro fluxo a ser integrado ao MongoDB é a listagem do catálogo.
