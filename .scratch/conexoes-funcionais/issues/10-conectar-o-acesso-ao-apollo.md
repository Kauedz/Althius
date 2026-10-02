# 10: Conectar o Acesso ao Apollo

**What to build:** o Apollo sai de "Em breve" e funciona como o Notion: o Administrador habilita, cada participante conecta a própria conta do Apollo pelo servidor MCP oficial (`https://mcp.apollo.io/mcp`), vê o Acesso conectado e as ferramentas do servidor, e desconecta. Mais uma Integração do catálogo funcionando no Workspace operacional, sem mudar a tela.

**Blocked by:** 08 (Conectar o Acesso ao Notion).

**Status:** ready-for-agent

- [ ] Confirmar com fonte oficial como o servidor do Apollo registra um cliente OAuth de terceiros (registro dinâmico ou cliente pré-registrado) e registrar a resposta no `## Comments`. Se exigir cliente pré-registrado, o registro no Apollo vira pendência humana.
- [ ] O Apollo entra no catálogo do backend com o que foi confirmado; a tela não muda para recebê-lo.
- [ ] Conectar, reconectar e desconectar seguem as mesmas regras do HubSpot e do Notion.
- [ ] O cartão do Apollo não oferece Sincronização.
- [ ] Os testes do app cobrem o cartão do Apollo nos seus estados.
- [ ] Conferência visual no navegador, com prints no `## Comments` deste ticket. A conexão com uma conta real do Apollo fica registrada como pendência humana, se ninguém tiver conta para o teste.
1. Aplicar a migration e publicar (ticket 30): aplicar `supabase/migrations/20261002110000_permissao_por_ferramenta.sql` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/permissao_por_ferramenta.sql`, aplicar e conferir o md5); depois `npx supabase functions deploy integration-tools agent-conversation crm-handoff integration-connect --project-ref ycbdilsmydvzezhlymty` e `npx supabase functions deploy integration-callback --no-verify-jwt --project-ref ycbdilsmydvzezhlymty`.
2. Se o registro dinâmico não for aceito, registrar o app OAuth de parceiro (Apollo Partnerships) e gravar `APOLLO_MCP_CLIENT_ID` e `APOLLO_MCP_CLIENT_SECRET`.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.