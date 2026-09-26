# 03: Conectar e desconectar o próprio Acesso ao HubSpot

**What to build:** com o HubSpot habilitado, cada participante conecta a própria conta do HubSpot pelo consentimento no próprio HubSpot, como faz no Claude ou no ChatGPT, e volta para Conexões vendo o Acesso conectado, com a conta com que entrou. O participante vê quantos participantes do Workspace já conectaram e a lista de ferramentas que o servidor MCP do HubSpot oferece. Ele desconecta o próprio Acesso sem afetar o dos outros. Quando o HubSpot revoga o Acesso ou ele deixa de valer, o cartão mostra "Precisa reconectar" e o mesmo botão reconecta.

**Blocked by:** 01 (Pesquisar os servidores MCP das Integrações), 02 (Catálogo real e habilitação pelo Administrador).

**Status:** ready-for-agent

- [ ] O HubSpot usa o cliente pré-registrado do MCP Auth App: client ID e client secret são segredos das Edge Functions desta frente, e a URL de retorno é a da Edge Function ([pesquisa](../pesquisa-servidores-mcp.md)).
- [ ] Cada renovação grava o novo refresh token junto com o novo access token, porque o HubSpot troca o refresh token a cada renovação.
- [ ] O portal do Workspace vem do `hub_id` da conta conectada; se o token do MCP não servir para a consulta de metadados, vem de `get_user_details`. O caminho escolhido fica anotado no `## Comments`.
- [ ] Conectar só é possível numa Integração habilitada no Workspace, por participante com Participação ativa.
- [ ] O retorno do OAuth cai numa Edge Function própria desta frente, que só o aceita se casar com uma tentativa pendente, dentro do prazo, com `state` e PKCE válidos, de um participante ainda ativo. Um retorno forjado, repetido ou vencido não associa nada.
- [ ] O token fica só no backend, no schema privado. Ele não aparece no navegador, em respostas da API, em logs nem para outro participante.
- [ ] O primeiro Acesso fixa o portal HubSpot do Workspace. Um Acesso a outro portal é recusado com uma mensagem clara.
- [ ] Recusar o consentimento, deixar a tentativa vencer ou uma falha do HubSpot mostram uma mensagem, e o cartão não finge que conectou.
- [ ] O token é renovado no backend quando vence. Uma renovação recusada deixa o Acesso em "Precisa reconectar".
- [ ] Desconectar apaga só o Acesso de quem desconecta.
- [ ] Uma Participação desativada deixa de ter o Acesso usado.
- [ ] O cartão mostra o estado do próprio Acesso, a conta do HubSpot, quantos participantes conectaram e as ferramentas do servidor.
- [ ] A Edge Function não usa nem altera as funções, os segredos ou o Webhook Endpoint da Unipile.
- [ ] pgTAP cobre a privacidade do Acesso, a aceitação do retorno e o portal fixado; os testes do app cobrem os estados do cartão.
- [ ] Conferência visual no navegador dos estados do cartão, com prints no `## Comments` deste ticket. A conexão com um portal real fica para o ticket 09.
