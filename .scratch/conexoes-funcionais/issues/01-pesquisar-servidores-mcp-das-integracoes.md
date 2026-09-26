# 01: Pesquisar os servidores MCP das Integrações

**What to build:** uma pesquisa com fonte oficial, deixada em Markdown dentro de `.scratch/conexoes-funcionais/`, que responde o que os tickets de Acesso e de Sincronização precisam saber antes de escrever código. Ela decide por onde a Sincronização lê o HubSpot ([ADR-0017](../../../docs/adr/0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md)) e quais Integrações do catálogo podem sair de "Em breve".

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] HubSpot: como o MCP Auth App registra o cliente OAuth (pré-registrado ou dinâmico), os escopos, a duração dos tokens, a renovação e o endereço de retorno aceito.
- [ ] HubSpot: se as ferramentas do servidor MCP leem Companies, Contacts, owners e as associações entre Contact e Company, com paginação e filtro por data de modificação.
- [ ] HubSpot: se o token do MCP Auth App também vale para a API REST. Se nem o MCP nem esse token servirem para ler um portal inteiro, o que um app OAuth separado exige.
- [ ] HubSpot: como identificar o portal da conta conectada, para fixar o portal do Workspace, e se o limite de 25 instalações conta por pessoa ou por portal.
- [ ] Notion: como o servidor MCP oficial registra o cliente OAuth e quais ferramentas oferece.
- [ ] Clay, Apollo, Lusha, Meta Ads e Google Ads: quais têm servidor MCP remoto oficial que aceita um cliente de terceiros por OAuth, com a fonte oficial de cada um. As que não têm continuam "Em breve".
- [ ] Toda afirmação cita a fonte oficial. O que não se confirmou fica escrito como "não confirmado".
- [ ] A conclusão diz qual caminho a Sincronização do HubSpot usa e o que muda nos tickets 03 a 06 e 08, se algo mudar.
