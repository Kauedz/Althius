# Enviar ao CRM pelas ferramentas do conector, com o efeito declarado pelo Agente

Complementa a [ADR-0020](./0020-kanban-de-prospeccao-e-envio-ao-crm.md) e a [ADR-0022](./0022-permissao-por-ferramenta-do-conector.md). Quando o Vendedor responsável conectou o CRM pela autorização (OAuth no servidor MCP), "Enviar ao CRM" vira um pedido aos Agentes numa Conversa nova, com o mesmo pacote de sempre (a empresa, os Contatos ativos e a nota com os Sinais). Os Agentes escrevem pelas ferramentas que o servidor do próprio CRM lista (`usar_conector`), sem código por app, e cada escrita segue a regra da ferramenta: no padrão, uma Aprovação por chamada, decidida no passo da Conversa. Assim o envio serve ao HubSpot, ao Pipedrive, ao RD Station, ao Bitrix24 ou a qualquer CRM com servidor MCP. Pela chave de API, o envio continua direto, pelo escritor REST de cada app (`_shared/envio-ao-crm.ts`).

A Althius não sabe o nome das ferramentas de cada CRM, então não sabe sozinha qual chamada levou a empresa. O **Agente declara o efeito**: `efeito: 'empresa_no_crm'` (com o `conta_id`) na chamada que cria a empresa ou, se ela já existe, na primeira escrita que a usa. O efeito vai no payload da Aprovação, então quem aprova vê e o hash o protege. A tentativa em `private.crm_handoffs` nasce ligada à Execução (`run_id`), e só uma chamada daquela Execução, do mesmo Workspace, para a mesma Conta, o mesmo CRM e de quem pediu a fecha:

- pela Aprovação (`finish_crm_handoff_by_tool_approval`, chamada pelo executor depois de encerrar): o desfecho vem do estado da Aprovação no banco, executada é enviado e o cartão vai para No CRM, falhou é falha;
- pela chamada liberada sem Aprovação (`finish_crm_handoff_by_tool_call`, durante a Execução): o banco confere de novo a Permissão Executar e a regra "sempre" decidida para aquela ferramenta.

As duas são só do servidor (`service_role`). A tentativa que espera uma Aprovação com o efeito não vence em 10 minutos como as do caminho REST: ela vira falha quando essa Aprovação é recusada, vence ou é cancelada, ou quando a Execução termina sem nenhuma chamada com o efeito.

## Consequences

- O modelo recebe o e-mail e o telefone dos Contatos que vão ao CRM, o que a leitura dos Agentes (`agent_read_accounts_and_signals`) não entrega. É o pacote que a própria pessoa mandou enviar, e ele só sai pela conta dela no CRM.
- Um Agente que declara o efeito na chamada errada move o cartão cedo demais. O risco fica limitado: o efeito só vale numa ferramenta que escreve, na Execução do envio, para a Conta do envio, e, com a regra padrão, só depois de um Administrador aprovar a chamada que mostra o efeito.
- Os Contatos, as associações e a nota podem depender do id da empresa criado depois da Aprovação. Com Aprovações, a pessoa pede na mesma Conversa para os Agentes continuarem; o cartão já foi para No CRM quando a empresa chegou lá.
- Os Agentes não têm Sincronização própria do CRM: leem pelas ferramentas do conector. Os tickets de Sincronização do HubSpot (conexoes-funcionais 04 a 06) ficam como `wontfix`.

## Considered Options

- **Código por app que reconhece a ferramenta de criar empresa** (pelo nome, como `hubspot-create-company`). Descartado: é o "conector especial" que a ADR-0022 não quer, e quebra a cada renome do servidor.
- **Fechar quando a Execução termina sem erro.** Descartado: a Execução pode terminar só com Aprovações pendentes, ou com a empresa recusada pelo CRM.
- **Inferir pelo resultado da ferramenta** (um id de empresa na resposta). Descartado: o formato do resultado é de cada app.
