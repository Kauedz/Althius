# 08: Filtros da aba Contas

**What to build:** o usuário reduz a lista pelo botão "Filtros", que abre um menu com quatro grupos:

- **Aderência:** Quente, Fit, Não fit, com seleção múltipla;
- **Segmento:** com seleção múltipla, com as opções tiradas dos dados;
- **Sinal:** com ou sem;
- **Contatos:** com ou sem.

Grupos diferentes se combinam com "e", e opções do mesmo grupo com "ou". Os filtros se combinam com a busca. Cada filtro ativo aparece como um chip removível abaixo da barra, ao lado de "Limpar filtros". Os filtros ficam no endereço, junto com a busca e a ordenação.

**Blocked by:** 07 ("Ordenar por" e busca na aba Contas, no endereço)

**Status:** ready-for-agent

- [ ] Cada filtro reduz a lista e atualiza a contagem "N de M contas"
- [ ] Grupos diferentes se combinam com "e" e opções do mesmo grupo com "ou"
- [ ] Busca e filtros se combinam
- [ ] Cada filtro ativo aparece como um chip, e remover o chip desfaz o filtro
- [ ] "Limpar filtros" desfaz todos os filtros
- [ ] Filtros sem resultado mostram o estado "Nenhuma conta encontrada", e "Limpar busca e filtros" restaura a lista
- [ ] Os filtros ficam nos parâmetros do endereço
