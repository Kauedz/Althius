# 08: Conectar o Acesso ao Notion

**What to build:** o Notion sai de "Em breve" e funciona como o HubSpot, só sem Sincronização: o Administrador habilita, cada participante conecta a própria conta do Notion, vê o Acesso conectado e as ferramentas do servidor, e desconecta. Prova que o mecanismo de Conexão serve a qualquer app com servidor MCP oficial.

**Blocked by:** 01 (Pesquisar os servidores MCP das Integrações), 03 (Conectar e desconectar o próprio Acesso ao HubSpot).

**Status:** ready-for-agent

- [ ] O Notion entra no catálogo do backend com o que a pesquisa confirmou; a tela não muda para recebê-lo.
- [ ] Conectar, reconectar e desconectar seguem as mesmas regras do HubSpot, com o registro de cliente OAuth que o Notion usa.
- [ ] O cartão do Notion não oferece Sincronização.
- [ ] Os testes do app cobrem o cartão do Notion nos seus estados.
- [ ] Conferência visual no navegador, com prints no `## Comments` deste ticket. A conexão com uma conta Notion real fica registrada como pendência humana, se ninguém tiver conta para o teste.
