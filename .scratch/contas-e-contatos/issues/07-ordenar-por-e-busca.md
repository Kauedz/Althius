# 07: "Ordenar por" e busca na aba Contas, no endereço

**What to build:** o usuário muda a ordem da lista num menu "Ordenar por" com quatro opções nomeadas. Cada uma tem direção fixa, e os cabeçalhos da tabela não são clicáveis. O usuário também busca uma empresa pelo nome ou pelo domínio, sem se preocupar com maiúsculas e acentos, e vê a contagem "N de M contas". Busca e ordenação ficam nos parâmetros do endereço, para compartilhar o recorte.

As opções de ordenação:

- **Prioridade**, a padrão: grupos Quente, Fit, Não fit e não avaliada. Dentro de cada grupo, o Sinal mais recente primeiro, sem Sinal no fim e empate pelo nome;
- **Último sinal**: o mais recente primeiro, sem Sinal no fim;
- **Contatos**: a que tem mais Contatos primeiro;
- **Último contato**: o mais recente primeiro, "Nunca" no fim.

**Blocked by:** 01 (Mock do layout), 03 (Aba Contas: primeira fatia de ponta a ponta)

**Status:** closed

- [x] O controle "Ordenar por" mostra as quatro opções, e cada uma reordena a lista como decidido
- [x] A busca encontra pelo nome e pelo domínio, ignorando maiúsculas e acentos
- [x] Com busca, a contagem mostra "N de M contas"
- [x] Uma busca sem resultado mostra "Nenhuma conta encontrada para “x”." e "Limpar busca e filtros", que restaura a lista
- [x] Busca e ordenação ficam nos parâmetros do endereço, e abrir o endereço reconstrói a lista com elas
- [x] A barra do topo segue o mock aprovado

## Comments

- Busca e ordenação ficam em `?busca=` e `?ordem=` (`prioridade`, `ultimo-sinal`, `contatos`, `ultimo-contato`), e só lá: a lista lê o recorte do endereço. Os valores padrão não aparecem no endereço, e uma ordem desconhecida cai na Prioridade. Cada mudança substitui a entrada do histórico, para o voltar não refazer a digitação.
- "Ordenar por" é um `<select>` nativo, como no mock. Em todas as opções, o empate é desfeito pelo nome.
- O botão "Filtros" fica para o ticket 08. Hoje "Limpar busca e filtros" limpa só a busca, e o 08 deve estender o botão e o estado sem resultado aos filtros.
- A função que normaliza o texto da busca, sem acentos e sem diferença de maiúsculas, foi para `lib/utils.ts`, e a página de Sequências passou a usá-la.

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.
