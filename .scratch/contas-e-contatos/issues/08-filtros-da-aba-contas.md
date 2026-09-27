# 08: Filtros da aba Contas

**What to build:** o usuário reduz a lista pelo botão "Filtros", que abre um menu com quatro grupos:

- **Aderência:** Quente, Fit, Não fit, com seleção múltipla;
- **Segmento:** com seleção múltipla, com as opções tiradas dos dados;
- **Sinal:** com ou sem;
- **Contatos:** com ou sem.

Grupos diferentes se combinam com "e", e opções do mesmo grupo com "ou". Os filtros se combinam com a busca. Cada filtro ativo aparece como um chip removível abaixo da barra, ao lado de "Limpar filtros". Os filtros ficam no endereço, junto com a busca e a ordenação.

**Blocked by:** 07 ("Ordenar por" e busca na aba Contas, no endereço)

**Status:** closed

- [x] Cada filtro reduz a lista e atualiza a contagem "N de M contas"
- [x] Grupos diferentes se combinam com "e" e opções do mesmo grupo com "ou"
- [x] Busca e filtros se combinam
- [x] Cada filtro ativo aparece como um chip, e remover o chip desfaz o filtro
- [x] "Limpar filtros" desfaz todos os filtros
- [x] Filtros sem resultado mostram o estado "Nenhuma conta encontrada", e "Limpar busca e filtros" restaura a lista
- [x] Os filtros ficam nos parâmetros do endereço

## Comments

- Os filtros ficam em `?aderencia=` e `?segmento=`, repetidos para cada opção marcada (`?aderencia=quente&aderencia=fit`), e em `?sinal=` e `?contatos=` (`com` ou `sem`). Aderências e presenças desconhecidas são ignoradas. Como a busca e a ordenação, cada mudança substitui a entrada do histórico.
- O menu é um Popover da Base UI com o título "Filtrar contas" e "Limpar tudo", e os quatro grupos lado a lado, como no mock. Ele não fecha a cada escolha: a lista atrás muda na hora. A Aderência mostra, ao lado de cada opção, quantas contas a têm.
- Sinal e Contatos são rádios de uma escolha só; clicar na escolha marcada a desfaz. Pelo teclado, desfaz-se pelo chip ou por "Limpar tudo".
- Os chips seguem a ordem do menu (Aderência na ordem Quente, Fit, Não fit; Segmentos em ordem alfabética), não a ordem em que foram marcados.
- "Limpar filtros" mantém a busca; "Limpar busca e filtros", no estado sem resultado, desfaz as duas. Só com filtros, a mensagem é "Nenhuma conta encontrada.", sem o “x”.
- O botão "Filtros" mostra quantos filtros estão ativos, e a borda fica na cor de destaque.

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.
