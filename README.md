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
.\.venv\Scripts\python.exe -m backend.cart_service.seed
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

Em outro terminal, inicie o Cart Service na porta 8002:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.cart_service.main:app --reload --port 8002
```

Com os três serviços rodando, inicie o frontend em outro terminal:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Abra o endereço exibido pelo Vite. A API lê produtos ativos de `catalogo.produtos` e faz a busca, a filtragem e a paginação no MongoDB. A documentação da API está em `http://127.0.0.1:8000/docs`.

As cargas iniciais podem ser executadas novamente sem sobrescrever produtos nem estoques existentes. O serviço migra os históricos de demonstração existentes para `catalogo.historico_precos` automaticamente.

### Catálogo e administração

- No catálogo, selecione **Placas-mãe** e combine **AM5** com **DDR5**. A API aplica os dois filtros técnicos por igualdade.
- Na área administrativa, cadastre um produto e edite seu preço. O MongoDB armazena o preço como decimal e registra o preço inicial e as mudanças efetivas em `catalogo.historico_precos`, na mesma transação que grava o produto. Para manter o histórico, faça mudanças de preço pela API administrativa ou pelo formulário.
- Abra o histórico no detalhe ou na edição administrativa e selecione o período. Para consultar um intervalo específico na API, use `inicio` (inclusive) e `fim` (exclusivo) em UTC.
- Ao remover um produto, a API o marca como inativo. A administração ainda pode consultar seu histórico e reativá-lo.

O cadastro e o login usam `auth.usuarios`, com índice único no e-mail normalizado e senhas verificadas com scrypt. A sessão expira em oito horas e é persistida em `auth.sessoes`. O logout revoga a sessão. A rota `GET /api/catalogo/admin/produtos` consulta o Auth Service para confirmar o perfil antes de retornar os dados. A documentação do Auth Service está em `http://127.0.0.1:8001/docs`.

### Estoque e carrinho

- O Cart Service persiste os itens em `compras.carrinhos` e o saldo em `compras.estoques`, vinculados ao código estável do produto do catálogo. A primeira carga importa o estoque total de demonstração com zero reservas.
- Adicionar, alterar ou remover um item ajusta a reserva na mesma transação. O cliente acessa seu próprio carrinho, e apenas administradores podem ajustar o estoque. Produtos ativos com saldo zero continuam listados como indisponíveis.
- Ao abrir o carrinho, os preços vêm do catálogo. Remover itens libera as reservas. A expiração automática é uma etapa posterior.
- Documentação da API de compras em `http://127.0.0.1:8002/docs`.

O proxy Vite encaminha as chamadas públicas aos três serviços. Em uma implantação com HTTPS, configure `AUTH_COOKIE_SECURE=1` e encaminhe `/api/auth`, `/api/catalogo`, `/api/carrinho` e `/api/estoque` pelo mesmo domínio do frontend. Mantenha as rotas `/_interno` na rede dos serviços. Para alterar as URLs internas, configure `AUTH_SERVICE_URL`, `CATALOG_SERVICE_URL` e `CART_SERVICE_URL` nos serviços que as consultam.
