# 13: Voltar sem perder o lugar

**What to build:** o usuário abre uma Conta-alvo a partir de uma lista recortada e rolada e volta pela migalha "Contas" ou pelo voltar do navegador. A lista reaparece exatamente como estava: mesma busca, mesmos filtros, mesma ordenação e mesma posição de rolagem. Vale para a aba Contas e, ao voltar de uma Conta-alvo aberta pela aba Contatos, para a aba Contatos.

**Blocked by:** 08 (Filtros da aba Contas), 11 (Busca e filtros da aba Contatos), 12 (Contatos e Contas-alvo conectados)

**Status:** ready-for-agent

- [x] Voltar do detalhe pela migalha mantém a busca, os filtros e a ordenação da aba Contas
- [x] Voltar pelo voltar do navegador mantém o mesmo recorte
- [x] A posição de rolagem da lista é restaurada nos dois caminhos
- [x] Voltar de uma Conta-alvo aberta pela aba Contatos devolve a aba Contatos com a busca e os filtros que estavam aplicados

## Comments

- Os links da lista para o detalhe levam, no estado da navegação, o endereço da lista com o recorte e o rótulo da migalha. Aberto pela aba Contatos, a migalha é "Contatos" e volta para a aba Contatos; aberto direto pelo endereço, continua "Contas" para `/contas`.
- A posição do quadro da tabela fica guardada por endereço (com o recorte) enquanto o app está aberto, e volta só pelo voltar do navegador ou pela migalha. Entrar pela sidebar ou pelas abas abre a lista no topo.
- A rolagem até a âncora `#contatos` do detalhe (ticket 12) não mexe na rolagem da lista: são quadros diferentes.
