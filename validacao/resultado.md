# Resultado da validação da PoC do TechParts

O teste local usou o frontend compilado pelo Vite, os três serviços FastAPI e um replica set MongoDB em Docker. A suíte criou bases temporárias para preservar as bases usadas no desenvolvimento.

| Verificação | Resultado |
|---|---|
| Coleção Postman executada com Newman | 29 requisições e 37 verificações, todas aprovadas |
| Fluxo de cliente no React com jsdom e APIs reais | Catálogo, detalhes e histórico, cadastro, login e carrinho |
| Fluxo administrativo no React com jsdom e APIs reais | Gerenciar produtos, cadastrar ou editar produto e gerenciar estoque |
| Permissões | Carrinho sem sessão retornou 401. Cliente autenticado recebeu 403 ao tentar listar produtos administrativos ou alterar estoque. |
| Persistência após reiniciar os três serviços FastAPI | Os 1.000 produtos, a sessão testada, a unidade do carrinho e as 100 unidades reservadas permaneceram no banco. |
| Persistência após reiniciar o contêiner MongoDB (RNF06) | Aprovada no terminal local com `--restart-mongo`. A suíte confirmou a persistência após reiniciar o contêiner e os três serviços. |

## Desempenho

A carga iniciou três rodadas com 100 usuários simultâneos em uma base com 1.000 produtos. Cada usuário executou as três operações, em ordem alternada. Os tempos incluem a requisição HTTP pelo proxy local. O p95 é o tempo que 95% das operações da amostra levaram ou menos.

| Operação | Requisições | Meta | p95 | Máximo | Erros |
|---|---:|---:|---:|---:|---:|
| Catálogo por categoria e faixa de preço | 100 | 2 s | 0,457 s | 0,504 s | 0 |
| Filtro técnico AM5 + DDR5 | 100 | 3 s | 0,453 s | 0,531 s | 0 |
| Alteração do carrinho com reserva | 100 | 2 s | 0,623 s | 0,791 s | 0 |

As 300 operações atenderam às metas de latência nessa execução. A carga é uma medição local de curta duração. Disponibilidade mensal e recuperação por backup exigem verificações específicas.

### Evidências adicionais de desempenho

Uma rodada adicional de validação local usou 1.000 produtos ativos e 100 usuários simultâneos. Os dados vieram de bases temporárias e o MongoDB estava na versão 8.0.38. As medições e o plano estão em [desempenho.json](desempenho.json).

| Requisito | O que foi medido | Amostra | p95 | Máximo | Meta | Resultado |
|---|---|---:|---:|---:|---:|---|
| RNF02 | Filtro técnico AM5 + DDR5 via HTTP | 100 requisições | 0,547 s | 0,572 s | 3 s | Aprovado |
| RNF03 | Alteração do carrinho medida dentro do servidor, com autenticação, consulta ao catálogo e transação de reserva | 100 requisições | 0,459 s | 0,708 s | 2 s | Aprovado |
| RNF11 | Do vencimento até observar a liberação das reservas no banco, sob carga | 100 carrinhos | 9,118 s | 9,118 s | 60 s | Aprovado |

- **RNF02** — O `explain` com `executionStats` da consulta paginada registrou o plano vencedor `LIMIT → FETCH → IXSCAN`. O MongoDB usou o índice composto de ativo, categoria, tipo de memória, soquete, preço e código. Examinou 9 chaves e 9 documentos para retornar 9 resultados. O tempo dessa consulta reportado pelo MongoDB foi 0 ms na resolução do contador. A latência HTTP da tabela inclui a requisição completa.
- **RNF03** — Um temporizador no Cart Service mediu o intervalo entre a entrada da requisição no middleware e a resposta do FastAPI após concluir a transação. O cabeçalho `Server-Timing` é habilitado pela suíte no modo de desempenho.
- **RNF11** — Cem carrinhos com uma unidade cada venceram no mesmo instante durante tráfego de 100 usuários com carrinhos distintos. Cada usuário fez uma pausa de 2 s entre requisições. A leitura direta do MongoDB verificou os encerramentos a cada 200 ms, mais o tempo da consulta. O atraso observado é um limite superior ao tempo até a confirmação da liberação. Houve 700 requisições durante a observação, sem erros. Ao final, as 100 reservas vencidas tinham sido liberadas e as 100 reservas dos usuários que geraram a carga permaneceram intactas.

Uma repetição preliminar, com pausa de 200 ms entre requisições, teve erros `EADDRINUSE` no proxy local. Os números da tabela correspondem à rodada com pausa de 2 s.

### Alinhamento das consultas e dos índices

- **Q01 e Q02** usam paginação por cursor. Na ordenação de preço crescente, a posição é definida por `preco_atual` e pelo código único do produto, usado como desempate nos índices IX02, IX03 e IX04.
- **Q04** usa `registrado_em` e `_id` em ordem decrescente, conforme o IX10. Os testes verificaram a passagem para a página seguinte mesmo com 55 eventos no mesmo instante.
- **IX06** indexa `nome` e `descricao` para busca por termos em português. O teste encontrou produtos por um termo presente apenas na descrição e combinou a busca textual com os filtros técnicos e o cursor.
- **IX05** foi adotado para filtros em campos técnicos variáveis. O ensaio comparou os planos vencedores do MongoDB em uma base isolada com 1.000 produtos. A página tem até 9 produtos na interface. A consulta lê até 10 para detectar a próxima página.

| Filtro | Documentos examinados sem IX05 | Com IX05 | Plano escolhido com IX05 disponível |
|---|---:|---:|---|
| AM5 + DDR5 | 10 | 10 | Índice composto IX04 |
| Monitor com painel IPS | 3 | 3 | Índice composto de categoria e preço IX02 |
| Chipset X670E, presente em 20 produtos de teste | 935 | 20 | IX05 e ordenação dos resultados |

O IX05 ocupou 40 KiB nesse ensaio. A decisão se baseou na redução da leitura para o filtro seletivo e na preservação dos planos compostos nas outras consultas. [Planos e medições do IX05](indices.json)

### Remoção concorrente com reserva (RN09)

O teste isolado executou os três serviços e o MongoDB. A resposta interna do catálogo foi retida logo após a leitura de um produto ativo com três unidades em estoque. A remoção lógica foi confirmada enquanto a reserva aguardava essa resposta. Em seguida, a resposta capturada foi liberada para o Cart Service concluir a requisição.

| Ponto verificado | Evidência |
|---|---|
| Remoção antes da gravação da reserva | A consulta pública retornou HTTP 404 e o estoque ainda tinha zero unidades reservadas. |
| Reserva que já estava em andamento | O Cart Service respondeu HTTP 204 e gravou uma unidade no carrinho e no saldo reservado. |
| Reconciliação | Ao consultar o carrinho, o Cart Service buscou a situação atual do produto e retornou o item com `active: false`. A interface usa esse estado para avisar o cliente e desabilitar o aumento de quantidade. |
| Tentativas iniciadas após a remoção | Tanto um aumento de quantidade no carrinho existente quanto uma reserva por outro cliente retornaram HTTP 409. O saldo reservado continuou em uma unidade. |
| Liberação e repetição da retirada | A primeira retirada voltou o saldo reservado para zero. Repetir a mesma requisição manteve o saldo em zero. O histórico de preço permaneceu disponível na administração. |

A reconciliação ocorre na próxima leitura do carrinho. A remoção lógica do produto mantém a reserva em andamento até a retirada do item ou a expiração do carrinho. As alterações do carrinho e do estoque são transacionais no Cart Service. Catálogo e carrinho se comunicam por HTTP, com a janela de concorrência descrita na especificação.
