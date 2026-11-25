# Resultado da validação da PoC do TechParts

O teste local usou o frontend compilado pelo Vite, os três serviços FastAPI e um replica set MongoDB em Docker. A suíte criou bases temporárias para preservar as bases usadas no desenvolvimento.

| Verificação | Resultado |
|---|---|
| Coleção Postman executada com Newman | 29 requisições e 37 verificações, todas aprovadas |
| Fluxo de cliente no React com jsdom e APIs reais | Catálogo, detalhes e histórico, cadastro, login e carrinho |
| Fluxo administrativo no React com jsdom e APIs reais | Gerenciar produtos, cadastrar ou editar produto e gerenciar estoque |
| Permissões | Carrinho sem sessão retornou 401. Cliente autenticado recebeu 403 ao tentar listar produtos administrativos ou alterar estoque. |
| Persistência após reiniciar os três serviços FastAPI | Os 1.000 produtos, a sessão testada, a unidade do carrinho e as 100 unidades reservadas permaneceram no banco. |
| Persistência após reiniciar o contêiner MongoDB | Pendente. O motor do Docker retornou acesso negado nesta sessão. A suíte permite executar a checagem com `--restart-mongo`. |

## Desempenho

A carga iniciou três rodadas com 100 usuários simultâneos em uma base com 1.000 produtos. Cada usuário executou as três operações, em ordem alternada. Os tempos incluem a requisição HTTP pelo proxy local. O p95 é o tempo que 95% das operações da amostra levaram ou menos.

| Operação | Requisições | Meta | p95 | Máximo | Erros |
|---|---:|---:|---:|---:|---:|
| Catálogo por categoria e faixa de preço | 100 | 2 s | 0,457 s | 0,504 s | 0 |
| Filtro técnico AM5 + DDR5 | 100 | 3 s | 0,453 s | 0,531 s | 0 |
| Alteração do carrinho com reserva | 100 | 2 s | 0,623 s | 0,791 s | 0 |

As 300 operações atenderam às metas de latência nessa execução. A carga é uma medição local de curta duração. Disponibilidade mensal e recuperação por backup exigem verificações específicas.
