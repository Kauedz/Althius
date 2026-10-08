# 03: Conectar e desconectar o próprio Acesso ao HubSpot

**What to build:** com o HubSpot habilitado, cada participante conecta a própria conta do HubSpot pelo consentimento no próprio HubSpot, como faz no Claude ou no ChatGPT, e volta para Conexões vendo o Acesso conectado, com a conta com que entrou. O participante vê quantos participantes do Workspace já conectaram e a lista de ferramentas que o servidor MCP do HubSpot oferece. Ele desconecta o próprio Acesso sem afetar o dos outros. Quando o HubSpot revoga o Acesso ou ele deixa de valer, o cartão mostra "Precisa reconectar" e o mesmo botão reconecta.

**Blocked by:** 01 (Pesquisar os servidores MCP das Integrações), 02 (Catálogo real e habilitação pelo Administrador).

**Status:** ready-for-human (código, testes e prints prontos; falta o Nan cadastrar os segredos do MCP Auth App e publicar as funções, ver Passos do Nan)

- [x] O HubSpot usa o cliente pré-registrado do MCP Auth App: client ID e client secret são segredos das Edge Functions desta frente, e a URL de retorno é a da Edge Function ([pesquisa](../pesquisa-servidores-mcp.md)).
- [x] Cada renovação grava o novo refresh token junto com o novo access token, porque o HubSpot troca o refresh token a cada renovação.
- [x] O portal do Workspace vem do `hub_id` da conta conectada; se o token do MCP não servir para a consulta de metadados, vem de `get_user_details`. O caminho escolhido fica anotado no `## Comments`.
- [x] Conectar só é possível numa Integração habilitada no Workspace, por participante com Participação ativa.
- [x] O retorno do OAuth cai numa Edge Function própria desta frente, que só o aceita se casar com uma tentativa pendente, dentro do prazo, com `state` e PKCE válidos, de um participante ainda ativo. Um retorno forjado, repetido ou vencido não associa nada.
- [x] O token fica só no backend, no schema privado. Ele não aparece no navegador, em respostas da API, em logs nem para outro participante.
- [x] O primeiro Acesso fixa o portal HubSpot do Workspace. Um Acesso a outro portal é recusado com uma mensagem clara.
- [x] Recusar o consentimento, deixar a tentativa vencer ou uma falha do HubSpot mostram uma mensagem, e o cartão não finge que conectou.
- [x] O token é renovado no backend quando vence. Uma renovação recusada deixa o Acesso em "Precisa reconectar".
- [x] Desconectar apaga só o Acesso de quem desconecta.
- [x] Uma Participação desativada deixa de ter o Acesso usado.
- [x] O cartão mostra o estado do próprio Acesso, a conta do HubSpot, quantos participantes conectaram e as ferramentas do servidor.
- [x] A Edge Function não usa nem altera as funções, os segredos ou o Webhook Endpoint da Unipile.
- [x] pgTAP cobre a privacidade do Acesso, a aceitação do retorno e o portal fixado; os testes do app cobrem os estados do cartão.
- [x] Conferência visual no navegador dos estados do cartão, com prints no `## Comments` deste ticket. A conexão com um portal real fica para o ticket 09.

## Comments

- **2026-10-01, backend** (migration `20261001160000_acessos_as_integracoes.sql`, aplicada): Acessos por participante, tentativas OAuth com `state` + PKCE, tokens e chaves no Vault, portal fixado no primeiro Acesso, renovação gravando o refresh token novo, retirada. Edge Functions `integration-connect`, `integration-callback` e `integration-tools`; pgTAP `acessos_as_integracoes.sql`. O caminho por chave de API está na [ADR-0021](../../../docs/adr/0021-conexao-por-chave-de-api-quando-nao-ha-mcp.md).
- **2026-10-01, tela**: o cartão de uma Integração habilitada mostra o próprio Acesso ("Você ainda não conectou", "Conectado como …", "Precisa reconectar"), quantos participantes conectaram, "Conectar no HubSpot" (autorização no app), "Usar chave de API", "Desconectar" e "Ver ferramentas". A volta da autorização (`?conexao=ok|erro&motivo=…`) vira um aviso em português e sai do endereço. Testes em `src/paginas/conexoes-acessos.test.tsx`. Sem a leitura dos Acessos, o cartão fica como antes.
- **Não confirmado** até o ticket 09: os escopos exatos, se o `hub_id` vem do token do MCP Auth App, e a lista real de ferramentas.
- ~~**Falta**: a conferência visual com prints (critério acima).~~ Feita em 08/10 (abaixo).
- **2026-10-08, conferência com o que o HubSpot publica** (branch `conexoes/03-acesso-ao-hubspot`, sem migration):
  - O servidor publica o metadado de autorização em `https://mcp.hubspot.com/.well-known/oauth-authorization-server`, ao contrário do que o perfil supunha. Ele diz: autorização em `/oauth/authorize/user`, token em `/oauth/v3/token`, cliente autenticado só por `client_secret_post`, PKCE S256 e nenhum registro dinâmico. O perfil mandava o consentimento para `/oauth/authorize` e agora usa `/oauth/authorize/user`. Os outros dados já batiam. Os escopos continuam fora do pedido: a [documentação](https://developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server) diz que o HubSpot os define a partir das ferramentas do servidor e das permissões do usuário.
  - **Caminho escolhido para o portal:** o `hub_id` da própria resposta da troca do código. O [OAuth v3 do HubSpot](https://developers.hubspot.com/docs/api-reference/auth-oauth-v3/guide) devolve o `hub_id` nessa resposta, e o servidor do MCP usa o mesmo `/oauth/v3/token`. Sem ele, vem de `GET api.hubapi.com/oauth/v1/access-tokens/{token}` e, por último, de `get_user_details`. A conta mostrada no cartão ("Conectado como …") segue a mesma ordem, menos a resposta do token, que não traz o e-mail. Se nenhum caminho der a conta no 09, o servidor publica uma introspecção (`/oauth/v3/token/introspect`, com o client secret) que [devolve `hub_id` e `user`](https://developers.hubspot.com/docs/api-reference/2026-03/authentication/oauth-tokens/token-introspect).
  - **Não confirmado** até o 09: que a troca no servidor do MCP devolve mesmo o `hub_id`, e se o token do MCP vale na consulta de metadados.
  - Testes novos: `perfis.test.ts` (endereços e autenticação iguais ao metadado), `identificacao.test.ts` (portal pelo `hub_id` da resposta do token, mesmo com a consulta recusando o token, e ele prevalece sobre o `hub_id` da consulta), `integration-callback/handler.test.ts` (o Acesso gravado com o portal da troca). Em `integration-connect/handler.test.ts`, a asserção do endereço de consentimento passou a esperar `/oauth/authorize/user`.
  - Prints (dublê do Supabase, Chrome headless a 1400×1000, porque a 1400×900 os botões do cartão ficam cortados; sem erro no console): [não conectado](prints/03-nao-conectado.jpg), [conectado](prints/03-conectado.jpg), [ferramentas](prints/03-ferramentas.jpg), [precisa reconectar](prints/03-precisa-reconectar.jpg), [volta com "ok"](prints/03-volta-ok.jpg), [volta com outro portal](prints/03-volta-portal-diferente.jpg), [consentimento recusado](prints/03-volta-recusada.jpg), [tentativa vencida](prints/03-volta-expirada.jpg), [HubSpot indisponível](prints/03-volta-indisponivel.jpg) e [depois de desconectar](prints/03-depois-de-desconectar.jpg), onde a contagem cai de 3 para 2 e o Acesso dos outros fica. A lista de ferramentas do print é do dublê; a real vem no 09. A 360px a casca do Workspace operacional não se adapta, como já anotado no crm-real-e-stack 15; este ticket não cobre celular.
  - Para o 09: segundo a documentação, um Super Admin do portal autoriza o app antes dos outros usuários conseguirem conectar.

## Passos do Nan

1. No HubSpot (conta de desenvolvedor): Development > MCP Auth Apps > criar o app, com a URL de retorno `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback`.
2. Guardar o client ID e o secret só por terminal:
   ```powershell
   npx supabase secrets set HUBSPOT_MCP_CLIENT_ID=... HUBSPOT_MCP_CLIENT_SECRET=... --project-ref ycbdilsmydvzezhlymty
   ```
3. Publicar as funções (de novo, se já estiverem publicadas: o endereço de autorização do HubSpot mudou em 08/10):
   ```powershell
   npx supabase functions deploy integration-connect integration-callback integration-tools --project-ref ycbdilsmydvzezhlymty
   ```
4. Conectar com um portal real é o ticket 09.

