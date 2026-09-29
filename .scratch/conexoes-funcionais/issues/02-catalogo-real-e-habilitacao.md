# 02: Catálogo real e habilitação pelo Administrador

**What to build:** no Workspace operacional, a tela Conexões deixa de ser indisponível e mostra o catálogo real. Os Canais aparecem "Em breve", com o Canal ainda chamado "E-mail". Cada Integração aparece "Em breve", "Não habilitada" ou "Habilitada", e nada aparece como conectado sem estar. Um Administrador habilita uma Integração disponível no Workspace; um Membro vê o estado e que só um Administrador habilita. Neste ticket, nenhuma Integração tem o Acesso disponível ainda: HubSpot e Notion podem ser habilitadas, e as demais ficam "Em breve". A Demonstração continua com o fluxo simulado de hoje.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human (código e testes prontos; falta a conferência visual com prints)

- [ ] A tela Conexões tem uma Fonte de Conexões própria, com a implementação simulada para a Demonstração e a real para o Workspace operacional. Os testes de Conexões da Demonstração continuam passando.
- [ ] O módulo Conexões sai da lista de indisponíveis do Workspace operacional.
- [ ] O catálogo vem do backend: nome, categoria, descrição e estado de cada Integração. Nenhum dado da Demonstração aparece no Workspace operacional.
- [ ] Um Administrador habilita uma Integração; a habilitação fica guardada por Workspace, com quem habilitou e quando.
- [ ] Um Membro não consegue habilitar, nem por chamada direta ao backend, e a tela diz que só um Administrador habilita.
- [ ] Toda Participação ativa lê as Integrações habilitadas do próprio Workspace e nenhuma de outro Workspace (pgTAP).
- [ ] A tabela nova tem RLS explícito, e a migration aplica do zero no CI.
- [ ] Conferência visual no navegador, como Administrador e como Membro, com prints no `## Comments` deste ticket.
- 2026-09-29. Implementado pelo Antigravity e parado no meio; guardado na branch `conexoes/02-catalogo-antigravity` e trazido para a main. Migration `20260929190000_catalogo_e_habilitacao_de_integracoes.sql` (categoria e descrição no `private.integration_catalog`, `public.workspace_integrations` com RLS, `list_workspace_integrations` e `enable_workspace_integration`, só Administrador; HubSpot e Notion habilitáveis, o resto "Em breve"). **Ela já foi aplicada no remoto** por um `db push` antes do PR, por isso fica com esta versão e este nome. pgTAP `catalogo_e_habilitacao_de_integracoes.sql` 24/24 (o teste de anônimo esperava a mensagem errada: o banco recusa antes, com `permission denied`). Tela: `FonteDeConexoes` (simulada na Demonstração, Supabase no Workspace operacional) e o módulo `conexoes` saiu dos indisponíveis. Pendente: a conferência visual como Administrador e como Membro, com prints aqui.

