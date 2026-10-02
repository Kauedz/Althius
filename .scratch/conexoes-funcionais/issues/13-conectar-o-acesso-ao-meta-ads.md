# 13: Conectar o Acesso ao Meta Ads

**What to build:** o Meta Ads sai de "Em breve" e funciona como o Notion: o Administrador habilita, cada participante conecta a própria conta do Meta Ads pelo servidor MCP oficial (`https://mcp.facebook.com/ads`), vê o Acesso conectado e as ferramentas do servidor, e desconecta. Mais uma Integração do catálogo funcionando no Workspace operacional, sem mudar a tela.

**Blocked by:** 08 (Conectar o Acesso ao Notion).

**Status:** ready-for-agent

- [ ] Confirmar com fonte oficial como o servidor do Meta Ads registra um cliente OAuth de terceiros (registro dinâmico ou cliente pré-registrado) e registrar a resposta no `## Comments`. Se a Meta exigir revisão do app, o registro vira pendência humana. As ferramentas que gastam verba só serão usadas por Agentes sob a Permissão Propor ou Executar (ADR-0002), fora deste ticket.
- [ ] O Meta Ads entra no catálogo do backend com o que foi confirmado; a tela não muda para recebê-lo.
- [ ] Conectar, reconectar e desconectar seguem as mesmas regras do HubSpot e do Notion.
- [ ] O cartão do Meta Ads não oferece Sincronização.
- [ ] Os testes do app cobrem o cartão do Meta Ads nos seus estados.
- [ ] Conferência visual no navegador, com prints no `## Comments` deste ticket. A conexão com uma conta real do Meta Ads fica registrada como pendência humana, se ninguém tiver conta para o teste.
1. Aplicar a migration e publicar (ticket 30): aplicar `supabase/migrations/20261002110000_permissao_por_ferramenta.sql` conforme `docs/agents/migrations.md` (validar com rollback, rodar `scripts/pgtap-no-remoto.sh supabase/tests/permissao_por_ferramenta.sql`, aplicar e conferir o md5); depois `npx supabase functions deploy integration-tools agent-conversation crm-handoff integration-connect --project-ref ycbdilsmydvzezhlymty` e `npx supabase functions deploy integration-callback --no-verify-jwt --project-ref ycbdilsmydvzezhlymty`.
2. Criar o app em https://developers.facebook.com/apps (Facebook Login for Business, URL de retorno `https://ycbdilsmydvzezhlymty.supabase.co/functions/v1/integration-callback`) e gravar `META_ADS_MCP_CLIENT_ID` e `META_ADS_MCP_CLIENT_SECRET`.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.