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
- A busca usa termos no nome e na descrição, com o índice textual IX06 configurado para português. As consultas Q01, Q02 e Q04 retornam `nextCursor` quando há mais resultados. Envie esse valor em `cursor` com os mesmos filtros da primeira página. A API também aceita `pagina` para clientes existentes.
- Na área administrativa, cadastre um produto e edite seu preço. O MongoDB armazena o preço como decimal e registra o preço inicial e as mudanças efetivas em `catalogo.historico_precos`, na mesma transação que grava o produto. Para manter o histórico, faça mudanças de preço pela API administrativa ou pelo formulário.
- Abra o histórico no detalhe ou na edição administrativa e selecione o período. Para consultar um intervalo específico na API, use `inicio` (inclusive) e `fim` (exclusivo) em UTC.
- Ao remover um produto, a API o marca como inativo. A administração ainda pode consultar seu histórico e reativá-lo.

O cadastro e o login usam `auth.usuarios`, com índice único no e-mail normalizado e senhas verificadas com scrypt. A sessão expira em oito horas e é persistida em `auth.sessoes`. O logout revoga a sessão. A rota `GET /api/catalogo/admin/produtos` consulta o Auth Service para confirmar o perfil antes de retornar os dados. A documentação do Auth Service está em `http://127.0.0.1:8001/docs`.

### Estoque e carrinho

- O Cart Service persiste os itens em `compras.carrinhos` e o saldo em `compras.estoques`, vinculados ao código estável do produto do catálogo. A primeira carga importa o estoque total de demonstração com zero reservas.
- Adicionar, alterar ou remover um item ajusta a reserva na mesma transação. O cliente acessa seu próprio carrinho, e apenas administradores podem ajustar o estoque. Produtos ativos com saldo zero continuam listados como indisponíveis.
- Ao abrir o carrinho, os preços e a situação dos produtos vêm do catálogo. A tela identifica itens removidos. Remover um item libera sua reserva.
- O servidor encerra o carrinho após 30 minutos de inatividade. Cliques, uso do teclado ou alterações no carrinho renovam o prazo. Consultas automáticas da tela apenas leem o estado.
- O Cart Service procura carrinhos vencidos a cada 15 segundos e libera as reservas em uma transação com o encerramento. Uma gravação verifica o prazo e o identificador do carrinho, mesmo entre duas execuções da rotina. Após o vencimento, escolha **Iniciar novo carrinho**.
- Documentação da API de compras em `http://127.0.0.1:8002/docs`.

O proxy Vite encaminha as chamadas públicas aos três serviços. Em uma implantação com HTTPS, configure `AUTH_COOKIE_SECURE=1` e encaminhe `/api/auth`, `/api/catalogo`, `/api/carrinho` e `/api/estoque` pelo mesmo domínio do frontend. Mantenha as rotas `/_interno` na rede dos serviços. Para alterar as URLs internas, configure `AUTH_SERVICE_URL`, `CATALOG_SERVICE_URL` e `CART_SERVICE_URL` nos serviços que as consultam.

## Validação da prova de conceito

Com o MongoDB local em execução, instale as ferramentas de validação em uma pasta temporária e execute a suíte na raiz do projeto:

```powershell
$env:POC_TOOLS = Join-Path $env:TEMP 'techparts-poc-tools'
npm.cmd install --prefix $env:POC_TOOLS --no-package-lock --no-audit --no-fund newman@6.2.2 jsdom@29.0.2
pnpm build
.\.venv\Scripts\python.exe -X utf8 -m validacao.executar
```

A suíte usa bancos temporários no MongoDB, reinicia os três serviços de teste e verifica o catálogo, o estoque e um carrinho persistido. Ela executa a coleção Postman pelo Newman e verifica as oito telas no DOM. Para verificar também a persistência após a reinicialização do contêiner local do MongoDB, execute a suíte com `--restart-mongo` numa sessão que tenha acesso ao motor do Docker. A opção reinicia o serviço `mongo` do Compose, interrompendo brevemente o acesso local ao banco.

Para rodar a coleção no Postman Desktop, importe [TechParts.postman_collection.json](validacao/TechParts.postman_collection.json), configure `baseUrl` com o endereço do frontend, informe as credenciais de administrador e escolha um e-mail de cliente novo com uma senha de pelo menos 15 caracteres. A coleção cria uma conta e um produto de teste no ambiente selecionado. O resultado da validação está em [Resultado da PoC](validacao/resultado.md).

Para repetir as medições de RNF02, RNF03 e RNF11, mantenha o MongoDB ativo e use o frontend já compilado pelo comando `pnpm build`. Execute o modo de desempenho, que grava as medições e o plano de execução no caminho informado.

```powershell
.\.venv\Scripts\python.exe -X utf8 -m validacao.executar --performance "$env:TEMP\techparts-desempenho.json"
```

Para repetir a comparação do índice wildcard IX05 com os índices compostos, rode o comando abaixo. Ele cria e remove apenas uma base temporária.

```powershell
.\.venv\Scripts\python.exe -X utf8 -m validacao.indices "$env:TEMP\techparts-indices.json"
```

Com o MongoDB ativo, a corrida entre remoção do catálogo e reserva pode ser reproduzida pelo comando abaixo. O teste inicia os três serviços em portas de validação, usa bases temporárias e verifica a reconciliação na leitura do carrinho.

```powershell
.\.venv\Scripts\python.exe -X utf8 -m validacao.corrida
```
