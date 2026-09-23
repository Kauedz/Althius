# 07: "Ordenar por" e busca na aba Contas, no endereço

**What to build:** o usuário muda a ordem da lista num menu "Ordenar por" com quatro opções nomeadas. Cada uma tem direção fixa, e os cabeçalhos da tabela não são clicáveis. O usuário também busca uma empresa pelo nome ou pelo domínio, sem se preocupar com maiúsculas e acentos, e vê a contagem "N de M contas". Busca e ordenação ficam nos parâmetros do endereço, para compartilhar o recorte.

As opções de ordenação:

- **Prioridade**, a padrão: grupos Quente, Fit, Não fit e não avaliada. Dentro de cada grupo, o Sinal mais recente primeiro, sem Sinal no fim e empate pelo nome;
- **Último sinal**: o mais recente primeiro, sem Sinal no fim;
- **Contatos**: a que tem mais Contatos primeiro;
- **Último contato**: o mais recente primeiro, "Nunca" no fim.

**Blocked by:** 01 (Mock do layout), 03 (Aba Contas: primeira fatia de ponta a ponta)

**Status:** ready-for-agent

- [ ] O controle "Ordenar por" mostra as quatro opções, e cada uma reordena a lista como decidido
- [ ] A busca encontra pelo nome e pelo domínio, ignorando maiúsculas e acentos
- [ ] Com busca, a contagem mostra "N de M contas"
- [ ] Uma busca sem resultado mostra "Nenhuma conta encontrada para “x”." e "Limpar busca e filtros", que restaura a lista
- [ ] Busca e ordenação ficam nos parâmetros do endereço, e abrir o endereço reconstrói a lista com elas
- [ ] A barra do topo segue o mock aprovado
