# TechParts

Projeto acadêmico de e-commerce de componentes e periféricos de informática. O frontend usa React e TypeScript, e o backend será dividido em serviços de catálogo, autenticação e carrinho, com FastAPI, PyMongo e MongoDB.

## Execução local

Pré-requisitos: Node.js 22, pnpm 10, Python 3.14 e Docker com Compose. No Windows, abra o Docker Desktop antes de executar os comandos abaixo no PowerShell, a partir da raiz do projeto.

```powershell
docker compose up -d
docker compose exec mongo mongosh --quiet --eval "db.hello().isWritablePrimary"
```

O comando do MongoDB deve retornar `true` após a inicialização do replica set local.

Instale as dependências Python, carregue os produtos de demonstração e inicie a API:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m backend.catalog_service.seed
.\.venv\Scripts\python.exe -m uvicorn backend.catalog_service.main:app --reload
```

Em outro terminal, inicie o frontend:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Abra o endereço exibido pelo Vite. A listagem consulta `GET /api/catalogo/produtos` e lê os produtos ativos de `catalogo.produtos`. A documentação da API está em `http://127.0.0.1:8000/docs`.

A carga inicial pode ser executada novamente sem sobrescrever os produtos já cadastrados. Altere, por exemplo, o campo `nome` de um produto no MongoDB e recarregue a página para ver a alteração. Nesta etapa, estoque e histórico dos produtos de demonstração são dados ilustrativos. Autenticação, carrinho e alterações administrativas continuam simulados no frontend.
