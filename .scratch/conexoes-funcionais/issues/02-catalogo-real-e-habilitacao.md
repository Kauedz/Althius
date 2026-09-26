# 02: Catálogo real e habilitação pelo Administrador

**What to build:** no Workspace operacional, a tela Conexões deixa de ser indisponível e mostra o catálogo real. Os Canais aparecem "Em breve", com o Canal ainda chamado "E-mail". Cada Integração aparece "Em breve", "Não habilitada" ou "Habilitada", e nada aparece como conectado sem estar. Um Administrador habilita uma Integração disponível no Workspace; um Membro vê o estado e que só um Administrador habilita. Neste ticket, nenhuma Integração tem o Acesso disponível ainda: HubSpot e Notion podem ser habilitadas, e as demais ficam "Em breve". A Demonstração continua com o fluxo simulado de hoje.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A tela Conexões tem uma Fonte de Conexões própria, com a implementação simulada para a Demonstração e a real para o Workspace operacional. Os testes de Conexões da Demonstração continuam passando.
- [ ] O módulo Conexões sai da lista de indisponíveis do Workspace operacional.
- [ ] O catálogo vem do backend: nome, categoria, descrição e estado de cada Integração. Nenhum dado da Demonstração aparece no Workspace operacional.
- [ ] Um Administrador habilita uma Integração; a habilitação fica guardada por Workspace, com quem habilitou e quando.
- [ ] Um Membro não consegue habilitar, nem por chamada direta ao backend, e a tela diz que só um Administrador habilita.
- [ ] Toda Participação ativa lê as Integrações habilitadas do próprio Workspace e nenhuma de outro Workspace (pgTAP).
- [ ] A tabela nova tem RLS explícito, e a migration aplica do zero no CI.
- [ ] Conferência visual no navegador, como Administrador e como Membro, com prints no `## Comments` deste ticket.
