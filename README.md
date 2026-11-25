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

Em outro terminal, inicie o Auth Service na porta 8001:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.auth_service.main:app --reload --port 8001
```

Para criar um administrador no MongoDB local, execute o comando abaixo e escolha uma senha de pelo menos 15 caracteres. A senha é solicitada de forma interativa.

```powershell
.\.venv\Scripts\python.exe -m backend.auth_service.create_admin --email admin@techparts.local
```

Em um terceiro terminal, inicie o frontend:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Abra o endereço exibido pelo Vite. A listagem consulta `GET /api/catalogo/produtos` e lê os produtos ativos de `catalogo.produtos`. A documentação da API está em `http://127.0.0.1:8000/docs`.

A carga inicial pode ser executada novamente sem sobrescrever os produtos já cadastrados. Altere, por exemplo, o campo `nome` de um produto no MongoDB e recarregue a página para ver a alteração. Estoque, histórico dos produtos de demonstração, carrinho e alterações administrativas são simulados nesta etapa.

O cadastro e o login usam `auth.usuarios`, com índice único no e-mail normalizado e senhas verificadas com scrypt. A sessão expira em oito horas e é persistida em `auth.sessoes`. O logout revoga a sessão. A rota `GET /api/catalogo/admin/produtos` consulta o Auth Service para confirmar o perfil antes de retornar os dados. A documentação do Auth Service está em `http://127.0.0.1:8001/docs`.

O proxy Vite encaminha as chamadas do frontend aos dois serviços. Em uma implantação com HTTPS, configure `AUTH_COOKIE_SECURE=1` e encaminhe `/api/auth` e `/api/catalogo` pelo mesmo domínio do frontend. Se o Auth Service estiver em outro endereço interno, configure `AUTH_SERVICE_URL` no processo do catálogo.
