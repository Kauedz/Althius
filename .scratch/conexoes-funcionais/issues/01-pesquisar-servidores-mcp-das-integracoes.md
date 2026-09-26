# 01: Pesquisar os servidores MCP das Integrações

**What to build:** uma pesquisa com fonte oficial, deixada em Markdown dentro de `.scratch/conexoes-funcionais/`, que responde o que os tickets de Acesso e de Sincronização precisam saber antes de escrever código. Ela decide por onde a Sincronização lê o HubSpot ([ADR-0017](../../../docs/adr/0017-integracoes-conectadas-pelo-servidor-mcp-oficial.md)) e quais Integrações do catálogo podem sair de "Em breve".

**Blocked by:** None (can start immediately).

**Status:** closed

- [x] HubSpot: como o MCP Auth App registra o cliente OAuth (pré-registrado ou dinâmico), os escopos, a duração dos tokens, a renovação e o endereço de retorno aceito.
- [x] HubSpot: se as ferramentas do servidor MCP leem Companies, Contacts, owners e as associações entre Contact e Company, com paginação e filtro por data de modificação.
- [x] HubSpot: se o token do MCP Auth App também vale para a API REST. Se nem o MCP nem esse token servirem para ler um portal inteiro, o que um app OAuth separado exige.
- [x] HubSpot: como identificar o portal da conta conectada, para fixar o portal do Workspace, e se o limite de 25 instalações conta por pessoa ou por portal.
- [x] Notion: como o servidor MCP oficial registra o cliente OAuth e quais ferramentas oferece.
- [x] Clay, Apollo, Lusha, Meta Ads e Google Ads: quais têm servidor MCP remoto oficial que aceita um cliente de terceiros por OAuth, com a fonte oficial de cada um. As que não têm continuam "Em breve".
- [x] Toda afirmação cita a fonte oficial. O que não se confirmou fica escrito como "não confirmado".
- [x] Para cada Integração confirmada além do HubSpot e do Notion, um ticket novo em `.scratch/conexoes-funcionais/issues/`, no formato do ticket 08 e bloqueado por ele, para que o catálogo inteiro vá ficando funcional uma Integração por vez.
- [x] A conclusão diz qual caminho a Sincronização do HubSpot usa e o que muda nos tickets 03 a 06 e 08, se algo mudar.

## Comments

- 2026-09-26: pesquisa em [pesquisa-servidores-mcp.md](../pesquisa-servidores-mcp.md). O proxy do ambiente bloqueou a leitura direta das páginas oficiais do HubSpot e do Notion; as afirmações vêm da busca restrita aos domínios oficiais, com a fonte citada, e o que não se confirmou está marcado. Conclusão: HubSpot pelo MCP com cliente pré-registrado; a Sincronização lê pelo MCP em janelas por data de modificação, com a leitora isolada na Edge Function; Notion por registro dinâmico; Google Ads continua "Em breve" por não ter servidor hospedado. Tickets novos: 10 Apollo, 11 Clay, 12 Lusha e 13 Meta Ads. Os tickets 03, 04 e 09 foram ajustados.
