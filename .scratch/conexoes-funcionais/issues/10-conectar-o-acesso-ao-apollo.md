# 10: Conectar o Acesso ao Apollo

**What to build:** o Apollo sai de "Em breve" e funciona como o Notion: o Administrador habilita, cada participante conecta a própria conta do Apollo pelo servidor MCP oficial (`https://mcp.apollo.io/mcp`), vê o Acesso conectado e as ferramentas do servidor, e desconecta. Mais uma Integração do catálogo funcionando no Workspace operacional, sem mudar a tela.

**Blocked by:** 08 (Conectar o Acesso ao Notion).

**Status:** ready-for-agent (perfil e caminhos já no código; faltam escopos, testes do cartão e prints, ver Comments)

- [ ] Confirmar com fonte oficial como o servidor do Apollo registra um cliente OAuth de terceiros (registro dinâmico ou cliente pré-registrado) e registrar a resposta no `## Comments`. Se exigir cliente pré-registrado, o registro no Apollo vira pendência humana.
- [x] O Apollo entra no catálogo do backend com o que foi confirmado; a tela não muda para recebê-lo.
- [x] Conectar, reconectar e desconectar seguem as mesmas regras do HubSpot e do Notion.
- [x] O cartão do Apollo não oferece Sincronização.
- [ ] Os testes do app cobrem o cartão do Apollo nos seus estados.
- [ ] Conferência visual no navegador, com prints no `## Comments` deste ticket. A conexão com uma conta real do Apollo fica registrada como pendência humana, se ninguém tiver conta para o teste.
1. Aplicar a migration e publicar (ticket 30): aplicar `supabase/migrations/20261002110000_permissao_por_ferramenta.sql` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/permissao_por_ferramenta.sql`, aplicar e conferir o md5); depois `npx supabase functions deploy integration-tools agent-conversation crm-handoff integration-connect --project-ref ycbdilsmydvzezhlymty` e `npx supabase functions deploy integration-callback --no-verify-jwt --project-ref ycbdilsmydvzezhlymty`.
2. Se o registro dinâmico não for aceito, registrar o app OAuth de parceiro (Apollo Partnerships) e gravar `APOLLO_MCP_CLIENT_ID` e `APOLLO_MCP_CLIENT_SECRET`.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

**19/10/2026 (agente, conferência com o código e com o servidor).** O perfil já existe em `perfis.ts`, com OAuth por registro dinâmico mais a chave de API pela REST, e o seed traz `kinds = {oauth_mcp, api_key}`. O catálogo segue `available = false`.

O que o Apollo publica hoje (lido com `curl`):
- O metadado do recurso fica em `https://mcp.apollo.io/.well-known/oauth-protected-resource/mcp`.
- `https://mcp.apollo.io/.well-known/oauth-authorization-server` traz o registro dinâmico (`/api/v1/oauth/applications/register_oauth_client`), a revogação (`/api/v1/oauth/revoke`), PKCE S256 e cliente público (`none`) aceito.
- **Confirmado:** o registro é dinâmico, e o "não confirmado" do perfil pode cair, se a chamada real aceitar o registro.
- **Novo:** `scopes_supported` tem dezenas de escopos, de leitura (`contacts_search`, `organizations_search`), de gasto de crédito (`people_match`, `organizations_enrich`) e de envio (`emailer_messages_send_now`, `emailer_campaigns_create`). O perfil não pede escopo nenhum, e não sei o que o Apollo concede sem `scope`. É decisão de produto quais pedir; pela regra da plataforma, o Apollo do cliente só traz o que ele já tem.

Falta: decidir os escopos, os testes do cartão (formato de `conexoes-clay.test.tsx`), os prints e decidir se o Apollo também conta como gasto (`ferramentasGastam`), como o Clay.

**19/10/2026 (agente).** Substituído pela spec própria em `.scratch/conector-apollo/` (índice em [`conectores-indice.md`](../conectores-indice.md)). Daqui em diante, os tickets de lá valem.
