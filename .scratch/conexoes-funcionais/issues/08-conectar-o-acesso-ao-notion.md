# 08: Conectar o Acesso ao Notion

**What to build:** o Notion sai de "Em breve" e funciona como o HubSpot, só sem Sincronização: o Administrador habilita, cada participante conecta a própria conta do Notion, vê o Acesso conectado e as ferramentas do servidor, e desconecta. Prova que o mecanismo de Conexão serve a qualquer app com servidor MCP oficial.

**Blocked by:** 01 (Pesquisar os servidores MCP das Integrações), 03 (Conectar e desconectar o próprio Acesso ao HubSpot).

**Status:** ready-for-human (código, testes e prints prontos; falta o Nan publicar as funções e conectar uma conta Notion real, ver Passos do Nan)

- [x] O Notion entra no catálogo do backend com o que a pesquisa confirmou; a tela não muda para recebê-lo.
- [x] Conectar, reconectar e desconectar seguem as mesmas regras do HubSpot, com o registro de cliente OAuth que o Notion usa.
- [x] O cartão do Notion não oferece Sincronização.
- [x] Os testes do app cobrem o cartão do Notion nos seus estados.
- [x] Conferência visual no navegador, com prints no `## Comments` deste ticket. A conexão com uma conta Notion real fica registrada como pendência humana, se ninguém tiver conta para o teste.

## Comments

- **2026-10-08, o que já existia** (sem migration nova): o Notion já estava no catálogo habilitável (`20260929190000`) e no perfil de conexão (`20261001160000`, `kinds = {oauth_mcp}`, sem portal fixo). O perfil em `supabase/functions/_shared/integracoes/perfis.ts` já tinha o registro dinâmico. O `integration-connect` registra o cliente uma vez e o reaproveita, o `integration-callback` troca o código como cliente público, a renovação grava o refresh token novo, e desconectar é a mesma RPC do HubSpot. Tudo isso já tinha testes Deno e pgTAP (`acessos_as_integracoes.sql`). A tela é a mesma do HubSpot: o cartão lê os caminhos de cada Integração, então o Notion mostra só "Conectar no Notion", sem "Usar chave de API".
- **2026-10-08, conferência com o que o Notion publica:** os metadados de `mcp.notion.com` confirmam o registro dinâmico, PKCE S256 e o cliente público (`none`). Detalhes na [pesquisa](../pesquisa-servidores-mcp.md#notion).
  - **Correção:** o perfil esperava a conta (`workspace_name`, `owner.user…`) na resposta da troca do código. Segundo o [guia oficial](https://developers.notion.com/guides/mcp/build-mcp-client), essa resposta só traz `user_id`, `workspace_id` e `email_domain`. Sem a correção, o cartão mostraria "Conectado" sem dizer com que conta. Agora a conta vem da ferramenta `notion-get-users` com `user_id: "self"`, chamada logo depois da troca com o token novo. Vale o e-mail, ou o nome quando o Notion não dá o e-mail.
  - **Testes alterados:** o teste do Notion em `integration-callback/handler.test.ts` usa agora a resposta de token do guia e espera a conta vinda da ferramenta (vermelho antes da correção). O de `identificacao.test.ts` testava o campo que não existe; virou o caso sem e-mail, em que a conta é o nome (vermelho antes de o nome entrar no perfil).
  - **Testes novos do app** em `src/paginas/conexoes-notion.test.tsx`, 10 casos: o Administrador habilita; o Membro vê "Não habilitada" e que só um Administrador habilita; sem Acesso, só a autorização no Notion, sem chave de API e sem Sincronização; conectado com a conta e as ferramentas; desconectar o Notion sem mexer no HubSpot; precisa reconectar com o mesmo botão; volta "ok"; voltas recusada, vencida e com o Notion indisponível. Eles passaram de primeira, porque o cartão genérico do 03 já atendia o Notion. Para provar que conseguem falhar, a tela foi quebrada de propósito: com "Usar chave de API" e um "Sincronizar agora" em toda Integração, os dois casos que os proíbem falharam. A tela foi restaurada em seguida.
  - **Sincronização:** hoje nenhuma Integração tem o botão. Os testes do Notion valem como guarda para quando a Sincronização do HubSpot chegar à tela.
  - **Se `notion-get-users` falhar** na volta da autorização, o Acesso é gravado mesmo assim, porque o Notion não fixa portal, e o cartão mostra só "Conectado", como no HubSpot quando a conta não é identificada. Nada da resposta do token serve de conta: `email_domain` é só o domínio, e `user_id` e `workspace_id` são ids.
  - Suíte: vitest inteiro com `--maxWorkers=2`, 114 arquivos e 1120 testes verdes, antes dos 3 casos que a revisão pediu (o arquivo do Notion foi rodado de novo depois, 10 de 10). `deno test supabase/functions` com 747 verdes, `deno check`, `tsc -b` e oxlint sem erro. O `deno lint` acusa um `require-await` em `perfis-pipedrive-mcp.test.ts`, arquivo que este ticket não toca, e o CI não roda `deno lint`.
  - **Não confirmado** até a conexão real: se o Notion aceita o parâmetro `resource` (RFC 8707). A Althius o manda no consentimento e na troca; o guia não o manda, e o metadado lista `https://mcp.notion.com/mcp` entre os recursos protegidos.
  - Fora deste ticket, para quando fizer sentido: o metadado anuncia `revocation_endpoint` (desconectar poderia revogar o token no Notion; o HubSpot também não revoga hoje) e o parâmetro `iss` na volta da autorização (RFC 9207).
  - Prints (dublê do Supabase, Chrome headless a 1400×1700, janela alta no topo da página, porque o cartão do Notion fica abaixo da dobra a 1400×900; o único erro do console é o `favicon.ico`, que o dublê não serve): [não habilitada](prints/08-nao-habilitada.jpg), [não habilitada para Membro](prints/08-nao-habilitada-membro.jpg), [depois de habilitar](prints/08-depois-de-habilitar.jpg) (ninguém conectou ainda), [não conectado](prints/08-nao-conectado.jpg) (outro participante já conectou), [conectado](prints/08-conectado.jpg), [ferramentas](prints/08-ferramentas.jpg) (a 1400×1000), [precisa reconectar](prints/08-precisa-reconectar.jpg), [volta com "ok"](prints/08-volta-ok.jpg), [consentimento recusado](prints/08-volta-recusada.jpg), [tentativa vencida](prints/08-volta-expirada.jpg), [Notion indisponível](prints/08-volta-indisponivel.jpg) e [depois de desconectar](prints/08-depois-de-desconectar.jpg): a contagem do Notion cai de 2 para 1 e o HubSpot continua conectado. O resultado é a mesma tela de "não conectado", por outro caminho. A lista de ferramentas do print é do dublê, com nomes da [documentação do Notion](https://developers.notion.com/guides/mcp/mcp-supported-tools); a real vem da conexão com a conta.

## Passos do Nan

1. Publicar as funções de novo, porque a identificação da conta do Notion mudou. Não há segredo novo: o Notion se registra sozinho (registro dinâmico), e `NOTION_MCP_CLIENT_ID`/`_SECRET` continuam opcionais.
   ```powershell
   npx supabase functions deploy integration-connect integration-callback integration-tools --project-ref ycbdilsmydvzezhlymty
   ```
2. No app, no Workspace operacional, como Administrador: Conexões > Notion > **Habilitar**.
3. **Conectar no Notion**, autorizar com a sua conta do Notion e voltar para Conexões. O cartão deve mostrar "Conectado como <seu e-mail do Notion>".
4. **Ver ferramentas**: a lista deve vir do servidor do Notion (`notion-search`, `notion-fetch`…).
5. **Desconectar**: o cartão volta para "Você ainda não conectou", e o HubSpot, se conectado, continua.
6. Se o Notion recusar o consentimento ou a troca por causa do parâmetro `resource`, anote a mensagem no `## Comments`: é o único ponto não confirmado.
