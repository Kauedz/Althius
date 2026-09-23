# 05: Células da tabela de Contas no visual final

**What to build:** a tabela de Contas ganha o visual aprovado no mock. Ela é o elemento dominante da página, com linhas compactas (cerca de 44px), divisões horizontais discretas com o token de linha e sem cartões. O usuário lê de relance, em cada linha, quem é a empresa, se está Quente e o que aconteceu nela.

- **Empresa:** o logo pequeno ou as iniciais num quadrado discreto (sem ícone de pessoa), o nome como elemento mais forte da linha e o domínio em texto secundário, sem aumentar a altura.
- **Aderência:** "🔥 Quente" com o emoji literal, "Fit" em texto normal, "Não fit" em texto apagado e "—" com o tooltip "Aderência ainda não avaliada". Não há selos coloridos.
- **Contatos:** até três avatares sobrepostos (foto ou iniciais) e "N contatos" ou "1 contato". Sem Contatos, mostra "Nenhum contato" apagado.
- **Último sinal:** é a coluna mais larga, truncada em uma linha, com o texto completo no tooltip.
- **Segmento:** texto simples ou "—".
- **Rolagem:** o cabeçalho fica fixo ao rolar a página, e a coluna Empresa fica fixa à esquerda na rolagem horizontal.

**Blocked by:** 01 (Mock do layout), 03 (Aba Contas: primeira fatia de ponta a ponta)

**Status:** ready-for-agent

- [ ] A célula Empresa mostra o logo ou as iniciais, o nome e o domínio
- [ ] A Aderência aparece como "🔥 Quente", "Fit", "Não fit" ou "—" com "Aderência ainda não avaliada"
- [ ] A célula Contatos mostra os avatares e a contagem, ou "Nenhum contato"
- [ ] O Último sinal longo é truncado e tem o texto completo no tooltip
- [ ] O segmento ausente aparece como "—"
- [ ] O cabeçalho fica fixo na rolagem vertical e a coluna Empresa na horizontal
- [ ] Não há caixas de seleção nas linhas
- [ ] Nenhuma nota numérica, letra ou score aparece no módulo, nem "Etapa", "CRM" ou "Fora do CRM"
- [ ] O visual segue o mock aprovado, nos dois temas
