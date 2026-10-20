# 11: Conectar o Acesso ao Clay

**What to build:** o Clay sai de "Em breve" e funciona como o Notion: o Administrador habilita, cada participante conecta a própria conta do Clay pelo servidor MCP oficial (https://api.clay.com/v3/mcp), vê o Acesso conectado e as ferramentas do servidor, e desconecta. Mais uma Integração do catálogo funcionando no Workspace operacional, sem mudar a tela.

**Blocked by:** 08 (Conectar o Acesso ao Notion).

**Status:** ready-for-human

- [x] Confirmar com fonte oficial como o servidor do Clay registra um cliente OAuth de terceiros (registro dinâmico ou cliente pré-registrado) e registrar a resposta no `## Comments`. A pesquisa encontrou que uma plataforma pode se registrar como cliente OAuth do Clay, sem confirmar o endereço nem o processo.
- [x] O Clay entra no catálogo do backend com o que foi confirmado; a tela não muda para recebê-lo.
- [x] Conectar, reconectar e desconectar seguem as mesmas regras do HubSpot e do Notion.
- [x] O cartão do Clay não oferece Sincronização.
- [ ] Os testes do app cobrem o cartão do Clay nos seus estados.
- [ ] Conferência visual no navegador, com prints no `## Comments` deste ticket. A conexão com uma conta real do Clay fica registrada como pendência humana, se ninguém tiver conta para o teste.

## Comments

**15/10/2026 (agente, branch `renan/conector-clay`).** Fontes e decisões:

- Fonte oficial: https://university.clay.com/docs/connect-to-clay-mcp. Servidor MCP `https://api.clay.com/v3/mcp` (HTTP streamable; o `initialize` devolve `Mcp-Session-Id`, reaproveitado nas chamadas seguintes).
- Metadado do recurso (RFC 9728): `https://api.clay.com/.well-known/oauth-protected-resource/v3/mcp` (200; a raiz `/.well-known/oauth-protected-resource` responde 404, conferido com curl). A descoberta em `oauth.ts` já tenta o caminho com sufixo antes da raiz: nenhuma mudança de código.
- Metadado do servidor de autorização: `https://api.clay.com/.well-known/oauth-authorization-server`. Autorização `https://app.clay.com/oauth/authorize`; token `https://api.clay.com/oauth/token`; registro dinâmico `https://api.clay.com/oauth/register` (aceitou o redirect `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback`). Escopo `mcp`, PKCE S256, `client_secret_post`/`basic`/`none`.
- Registro do cliente: **dinâmico**. Segredos, se um dia pré-registrado: `CLAY_MCP_CLIENT_ID` / `CLAY_MCP_CLIENT_SECRET`.
- Caminhos: só `oauth_mcp` (sem chave de API na v1). `pins_portal = false`: o token é por usuário e por workspace do Clay; não há portal único a fixar no Workspace (mesma decisão de Notion e Apollo).
- Não confirmado: identificação da conta do Clay para o cartão (sem endpoint REST confiável; `identificacao: {}`, como Apollo) e se o Clay aceita o parâmetro `resource` (RFC 8707).
- Perfil em `supabase/functions/_shared/integracoes/conectores.ts`; migration `20261102140000_conector_clay.sql`; pgTAP `supabase/tests/conector_clay.sql`.
- A tela não muda (o catálogo vem do banco), por isso não houve teste novo do app nem prints.

**Passos humanos:**
1. Aplicar a migration `20261102140000_conector_clay.sql` em produção.
2. Deploy de `integration-connect`, `integration-callback` e `integration-tools`.
3. `update private.integration_catalog set available = true where id = 'clay';`
4. Teste real: habilitar, conectar uma conta do Clay, ver o Acesso e as ferramentas, reconectar, desconectar; registrar prints aqui (inclui a conferência visual e os estados do cartão, ainda pendentes).

**19/10/2026 (agente, branch `conector-clay-funcional`): o Clay ainda não é funcional.** A conferência desta data mostrou:
- O perfil, a migration `20261102140000` e o pgTAP estão na `main` (PR #226).
- O que foi publicado não pôde ser conferido: o MCP do Supabase recusou a permissão. As consultas prontas estão em `conector-clay/issues/04`.
- A documentação oficial (https://university.clay.com/docs/connect-to-clay-mcp) traz o que não estava aqui:
  - as ferramentas gastam créditos do workspace Clay do Cliente;
  - o admin do Clay precisa ligar **Unknown** em *Allowed MCP clients*;
  - o Clay reconfere essa política a cada emissão de token;
  - o registro dinâmico é limitado a 4 em rajada e 10 por hora por IP;
  - há `revocation_endpoint`.

O resto da leva segue em [`.scratch/conector-clay/`](../../conector-clay/spec.md): Clay como gasto (01), revogar ao desconectar (02), testes e prints (03, que cobrem os dois itens abertos acima) e publicar e validar com conta real (04).
