# 11: Busca e filtros da aba Contatos, no endereço

**What to build:** na aba Contatos, o usuário busca por nome, cargo ou empresa e filtra por:

- **Aderência da empresa:** Quente, Fit, Não fit;
- **Com dados de contato:** pelo menos um canal disponível.

Os filtros usam o mesmo menu e os mesmos chips da aba Contas. Não há filtro de Persona nem controle de ordenação. Busca e filtros ficam no endereço, para voltar de uma Conta-alvo sem perder o recorte.

**Blocked by:** 08 (Filtros da aba Contas), 10 (Aba Contatos)

**Status:** ready-for-agent

- [ ] A busca encontra pelo nome, pelo cargo e pela empresa, ignorando maiúsculas e acentos
- [ ] O filtro de Aderência da empresa e o filtro "Com dados de contato" reduzem a lista e aparecem como chips removíveis, com "Limpar filtros"
- [ ] Uma busca sem resultado mostra a mensagem e a opção de limpar busca e filtros
- [ ] Busca e filtros ficam nos parâmetros do endereço
