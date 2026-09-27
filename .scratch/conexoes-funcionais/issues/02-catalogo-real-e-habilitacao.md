# 02: Catálogo real e habilitação pelo Administrador

**What to build:** no Workspace operacional, a tela Conexões deixa de ser indisponível e mostra o catálogo real. Os Canais aparecem "Em breve", com o Canal ainda chamado "E-mail". Cada Integração aparece "Em breve", "Não habilitada" ou "Habilitada", e nada aparece como conectado sem estar. Um Administrador habilita uma Integração disponível no Workspace; um Membro vê o estado e que só um Administrador habilita. Neste ticket, nenhuma Integração tem o Acesso disponível ainda: HubSpot e Notion podem ser habilitadas, e as demais ficam "Em breve". A Demonstração continua com o fluxo simulado de hoje.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

- [x] A tela Conexões tem uma Fonte de Conexões própria, com a implementação simulada para a Demonstração e a real para o Workspace operacional. Os testes de Conexões da Demonstração continuam passando.
- [x] O módulo Conexões sai da lista de indisponíveis do Workspace operacional.
- [x] O catálogo vem do backend: nome, categoria, descrição e estado de cada Integração. Nenhum dado da Demonstração aparece no Workspace operacional.
- [x] Um Administrador habilita uma Integração; a habilitação fica guardada por Workspace, com quem habilitou e quando.
- [x] Um Membro não consegue habilitar, nem por chamada direta ao backend, e a tela diz que só um Administrador habilita.
- [x] Toda Participação ativa lê as Integrações habilitadas do próprio Workspace e nenhuma de outro Workspace (pgTAP).
- [x] A tabela nova tem RLS explícito, e a migration aplica do zero no CI.
- [x] Conferência visual no navegador, como Administrador e como Membro, com prints no `## Comments` deste ticket.

## Comments

- 2026-09-26: implementado. Migration `integracoes_habilitadas` com o catálogo (Canais e Integrações, só HubSpot e Notion disponíveis) e a habilitação por Administrador; pgTAP `integracoes_habilitadas.sql` 18/18 e a suíte inteira 149/149 num Postgres local com as migrations do zero; frontend 609/609, lint e build limpos.
- Conferência visual a 1400×900 (captura alta, do topo), com o app no Workspace operacional sobre o Supabase falso dos testes, porque esta sessão não tem acesso ao projeto de pré-produção: [Administradora](prints/02-administrador.jpg), [depois de habilitar o HubSpot](prints/02-administrador-habilitou.jpg), [Membro](prints/02-membro.jpg) e [Demonstração, sem mudança além do texto de introdução](prints/02-demonstracao.jpg).
- Pendente fora do código: aplicar a migration no projeto de pré-produção antes do merge, conforme `docs/agents/migrations.md`. Esta sessão não tem o MCP do Supabase.
- 2026-09-26: `ready-for-human` até a migration `20260927124354_integracoes_habilitadas` ser aplicada no projeto de pré-produção e o PR ser mesclado; depois, `closed`. Os prints usam a mesma Conta de usuário com o papel trocado no Supabase falso, não duas sessões reais.
