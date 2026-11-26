# TechParts

Projeto acadêmico de e-commerce de componentes e periféricos de informática. O frontend usa React e TypeScript, e o backend será dividido em serviços de catálogo, autenticação e carrinho, com FastAPI, PyMongo e MongoDB.

## Execução local

Você precisa de **Docker Desktop com Compose**, **Python 3.14**, **Node.js 22.12 ou posterior** e **pnpm 10**. Os comandos abaixo são para o PowerShell no Windows. Abra o Docker Desktop e, no VS Code, abra a pasta raiz do projeto, onde estão `compose.yaml` e `package.json`.

### 1. Inicie o MongoDB

No primeiro terminal, execute:

```powershell
docker compose up -d
docker compose exec mongo mongosh --quiet --eval "db.hello().isWritablePrimary"
```

Aguarde o segundo comando retornar `true`. Se retornar `false` logo após iniciar, aguarde alguns segundos e repita a consulta. Se continuar falhando, execute `docker compose logs mongo mongo-init` para conferir a inicialização. O Compose sobe o MongoDB e configura o replica set `rs0`. As APIs serão iniciadas no passo 3.

### 2. Prepare o projeto no primeiro uso

No mesmo terminal, crie o ambiente virtual, instale as dependências e carregue os produtos e estoques de demonstração.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
pnpm install --frozen-lockfile
.\.venv\Scripts\python.exe -m backend.catalog_service.seed
.\.venv\Scripts\python.exe -m backend.cart_service.seed
```

Os comandos usam diretamente o Python da pasta `.venv`. As cargas podem ser repetidas sem sobrescrever os produtos ou estoques existentes. O catálogo migra automaticamente históricos de demonstração antigos para `catalogo.historico_precos`.

Para acessar a área administrativa, crie uma conta uma vez. O script solicita e confirma a senha, que deve ter pelo menos 15 caracteres. Se você já tem uma conta administrativa nessa base, use as credenciais existentes.

```powershell
.\.venv\Scripts\python.exe -m backend.auth_service.create_admin --email admin@techparts.local
```

### 3. Inicie as três APIs em terminais separados

Use um terminal do PowerShell para cada comando, sempre na raiz do projeto. Abra os terminais adicionais pelo botão **+** no painel **Terminal** do VS Code. Mantenha os três processos em execução e aguarde `Application startup complete` em cada terminal.

**Terminal 1 — Auth Service (porta 8001)**

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.auth_service.main:app --host 127.0.0.1 --port 8001
```

**Terminal 2 — Cart Service (porta 8002)**

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.cart_service.main:app --host 127.0.0.1 --port 8002
```

**Terminal 3 — Catalog Service (porta 8000)**

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.catalog_service.main:app --host 127.0.0.1 --port 8000
```

### 4. Inicie o frontend e confira o catálogo

**Terminal 4 — Frontend**

```powershell
pnpm dev
```

Abra o endereço exibido pelo Vite, normalmente [http://localhost:5173/](http://localhost:5173/). Mantenha os quatro terminais abertos enquanto usar o sistema. Com os dados de demonstração carregados, o catálogo deve exibir produtos e disponibilizar os filtros.

Se o Vite mostrar `ECONNREFUSED 127.0.0.1:8000`, confira se o Catalog Service está em execução no terminal 3 e se a inicialização terminou. Para verificar a porta diretamente, abra [a documentação da API do catálogo](http://127.0.0.1:8000/docs). Depois, recarregue a página do TechParts. As portas `8001` e `8002` correspondem às APIs de autenticação e carrinho/estoque.

Para voltar a executar o sistema com a mesma base e as dependências já instaladas, repita os passos **1, 3 e 4**.

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

### Verificações operacionais

Para repetir a auditoria de credenciais e o ensaio de recuperação, obtenha as [MongoDB Database Tools](https://www.mongodb.com/docs/database-tools/installation/) e indique a pasta que contém `mongodump` e `mongorestore`. O ensaio usa o MongoDB local, cria bases temporárias separadas para origem e destino e apaga as cópias de teste ao terminar.

```powershell
.\.venv\Scripts\python.exe -X utf8 -m validacao.operacional --tools 'C:\caminho\database-tools\bin' --output "$env:TEMP\techparts-operacional.json"
```

Para medir disponibilidade, mantenha os três serviços ativos durante a janela de observação e use uma conta de cliente dedicada. O coletor registra uma amostra por minuto em UTC e funciona enquanto o processo estiver ativo. Guarde o arquivo SQLite em armazenamento persistente fora do repositório. O exemplo usa a pasta local do usuário.

```powershell
$env:POC_MONITOR_EMAIL = 'monitor@example.com'
$monitorPassword = Read-Host 'Senha da conta de monitoramento' -AsSecureString
$env:POC_MONITOR_PASSWORD = [Net.NetworkCredential]::new('', $monitorPassword).Password
$dbMonitor = Join-Path $env:LOCALAPPDATA 'techparts-disponibilidade.sqlite'
.\.venv\Scripts\python.exe -X utf8 -m validacao.disponibilidade --database $dbMonitor coletar
```

Em outro terminal, gere o relatório para o mês desejado. A meta é avaliada por API, após o fechamento do mês e com cobertura integral dos minutos previstos. Minutos decorridos sem amostra são registrados como lacunas.

```powershell
$dbMonitor = Join-Path $env:LOCALAPPDATA 'techparts-disponibilidade.sqlite'
.\.venv\Scripts\python.exe -X utf8 -m validacao.disponibilidade --database $dbMonitor relatorio AAAA-MM
```

Use `--manutencao` com um arquivo JSON para excluir apenas minutos completos de janelas previamente acordadas. Cada objeto da lista contém `inicio`, `fim` e `aprovado_em` com fuso horário explícito, além de `referencia` para a evidência do acordo.
