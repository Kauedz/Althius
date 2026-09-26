# 12: Conectar o Acesso ao Lusha

**What to build:** o Lusha sai de "Em breve" e funciona como o Notion: o Administrador habilita, cada participante conecta a própria conta do Lusha pelo servidor MCP oficial (`https://mcp.lusha.com`), vê o Acesso conectado e as ferramentas do servidor, e desconecta. Mais uma Integração do catálogo funcionando no Workspace operacional, sem mudar a tela.

**Blocked by:** 08 (Conectar o Acesso ao Notion).

**Status:** ready-for-agent

- [ ] Confirmar com fonte oficial como o servidor do Lusha registra um cliente OAuth de terceiros (registro dinâmico ou cliente pré-registrado) e registrar a resposta no `## Comments`. A documentação mostra chave de API e o blog oficial fala em OAuth: se o servidor não aceitar OAuth de um cliente de terceiros, o ticket para e volta para decisão de produto.
- [ ] O Lusha entra no catálogo do backend com o que foi confirmado; a tela não muda para recebê-lo.
- [ ] Conectar, reconectar e desconectar seguem as mesmas regras do HubSpot e do Notion.
- [ ] O cartão do Lusha não oferece Sincronização.
- [ ] Os testes do app cobrem o cartão do Lusha nos seus estados.
- [ ] Conferência visual no navegador, com prints no `## Comments` deste ticket. A conexão com uma conta real do Lusha fica registrada como pendência humana, se ninguém tiver conta para o teste.
