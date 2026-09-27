# 05: Células da tabela de Contas no visual final

**What to build:** a tabela de Contas ganha o visual aprovado no mock. Ela é o elemento dominante da página, com linhas compactas (cerca de 44px), divisões horizontais discretas com o token de linha e sem cartões. O usuário lê de relance, em cada linha, quem é a empresa, se está Quente e o que aconteceu nela.

- **Empresa:** o logo pequeno ou as iniciais num quadrado discreto (sem ícone de pessoa), o nome como elemento mais forte da linha e o domínio em texto secundário, sem aumentar a altura.
- **Aderência:** "🔥 Quente" com o emoji literal, "Fit" em texto normal, "Não fit" em texto apagado e "—" com o tooltip "Aderência ainda não avaliada". Não há selos coloridos.
- **Contatos:** até três avatares sobrepostos (foto ou iniciais) e "N contatos" ou "1 contato". Sem Contatos, mostra "Nenhum contato" apagado.
- **Último sinal:** é a coluna mais larga, truncada em uma linha, com o texto completo no tooltip.
- **Segmento:** texto simples ou "—".
- **Rolagem:** o cabeçalho fica fixo ao rolar a página, e a coluna Empresa fica fixa à esquerda na rolagem horizontal.

**Blocked by:** 01 (Mock do layout), 03 (Aba Contas: primeira fatia de ponta a ponta)

**Status:** closed

- [x] A célula Empresa mostra o logo ou as iniciais, o nome e o domínio
- [x] A Aderência aparece como "🔥 Quente", "Fit", "Não fit" ou "—" com "Aderência ainda não avaliada"
- [x] A célula Contatos mostra os avatares e a contagem, ou "Nenhum contato"
- [x] O Último sinal longo é truncado e tem o texto completo no tooltip
- [x] O segmento ausente aparece como "—"
- [x] O cabeçalho fica fixo na rolagem vertical e a coluna Empresa na horizontal
- [x] Não há caixas de seleção nas linhas
- [x] Nenhuma nota numérica, letra ou score aparece no módulo, nem "Etapa", "CRM" ou "Fora do CRM"
- [x] O visual segue o mock aprovado, nos dois temas

## Comments

- Implementado em `ralph/contas-e-contatos/05-celulas-da-tabela-de-contas` (377a6c0 e 06bfdeb).
- Rolagem: a tabela rola num quadro próprio, que vai até o pé da janela (`Pagina` com `ocupaAJanela`). O cabeçalho fica fixo na rolagem vertical e a coluna Empresa na horizontal, sem tirar a sidebar e a barra de topo do lugar. O título, as abas e a descrição ficam fixos acima da tabela. O mock só conseguia o cabeçalho fixo em telas largas.
- O ticket 13 deve restaurar a rolagem do quadro da tabela, e não a da janela. O pop-up do ticket 06 precisa de portal, porque o quadro corta o que transborda.
- "🔥 Quente" fica no peso do texto comum, e não no 400 do mock, porque a spec pede o nome como "o elemento de maior peso na linha".
- O segmento da HubSpot passou de "CRM e marketing" para "Marketing e vendas", para que "CRM" não apareça no módulo.
- Logos de uma cor só (Notion, Vercel e Zendesk) vêm marcados pela fonte (`logoDeUmaCor`) e são pintados com a cor do texto, nos dois temas. Sem domínio, a célula Empresa mostra "Domínio não informado", como no mock.

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.
