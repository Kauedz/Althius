# Permissão por ferramenta do conector

Complementa a [ADR-0002](./0002-permissoes-ler-propor-executar.md). Os conectores funcionam como os do Claude: o participante conecta o app, e os Agentes usam as ferramentas que o servidor MCP do próprio app lista (`tools/list`), sem código específico por app ([ADR-0017](./0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md)). Como no Claude, cada ferramenta tem, no Workspace, uma de três regras: **sempre permitir**, **pedir Aprovação** ou **bloquear**. Só o Administrador decide (`set_integration_tool_rule`); todo Participante ativo vê (`list_integration_tool_rules`). Sem decisão, vale o padrão: a ferramenta de leitura roda sempre, e a que escreve ou gasta pede Aprovação. "Escreve" é o que o servidor não marca como leitura (`readOnlyHint`); na dúvida, é escrita.

A regra se soma à Permissão do Agente na Integração, sem enfraquecê-la:

| Permissão do Agente | `sempre` | `aprovacao` | `bloqueada` |
| --- | --- | --- | --- |
| Ler | lê; nunca escreve | não usa (Ler não propõe) | não usa |
| Propor | lê; escrita pede Aprovação | pede Aprovação | não usa |
| Executar | executa | pede Aprovação | não usa |

A Aprovação de uma ferramenta guarda a chamada exata (`{ tipo: 'ferramenta', integration_id, ferramenta, argumentos }`), e o executor faz exatamente aquela chamada, uma vez: reserva com o mesmo payload (`claim_approved_action` confere o hash e a regra de novo), chama pelo Acesso de quem pediu ao Agente e encerra (`finish_approved_action`). Uma ferramenta bloqueada depois de aprovada não sai, e uma Aprovação liberada pela Permissão Executar não sai se a regra deixou de ser "sempre".

## Consequences

- A regra vale em todo caminho que usa o Acesso (`chamarFerramenta`), não só na ferramenta `usar_conector`: "bloqueada" vale também para a escrita que a própria pessoa decide (o Enviar ao CRM pela chave de API).
- O banco não sabe se uma ferramenta escreve; por isso o padrão é aplicado no servidor, e o banco, ao propor, trata uma chamada sem regra como "pede Aprovação".
- As regras são por Workspace e Integração e sobrevivem a desconectar um Acesso; o nome da ferramenta é o do servidor, então uma ferramenta renomeada pelo app volta ao padrão.

## Considered Options

- **Regra por Agente e por ferramenta.** Descartada por agora: multiplica as decisões do Administrador; a Permissão do Agente na Integração já diferencia os Agentes.
- **Só a Permissão Ler, Propor, Executar.** Descartada: Executar liberaria qualquer ferramenta de um servidor que tem centenas (TikTok Ads), inclusive as que gastam verba.
