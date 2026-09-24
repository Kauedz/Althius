# 11: Busca e filtros da aba Contatos, no endereço

**What to build:** na aba Contatos, o usuário busca por nome, cargo ou empresa e filtra por:

- **Aderência da empresa:** Quente, Fit, Não fit;
- **Com dados de contato:** pelo menos um canal disponível.

Os filtros usam o mesmo menu e os mesmos chips da aba Contas. Não há filtro de Persona nem controle de ordenação. Busca e filtros ficam no endereço, para voltar de uma Conta-alvo sem perder o recorte.

**Blocked by:** 08 (Filtros da aba Contas), 10 (Aba Contatos)

**Status:** ready-for-agent

- [x] A busca encontra pelo nome, pelo cargo e pela empresa, ignorando maiúsculas e acentos
- [x] O filtro de Aderência da empresa e o filtro "Com dados de contato" reduzem a lista e aparecem como chips removíveis, com "Limpar filtros"
- [x] Uma busca sem resultado mostra a mensagem e a opção de limpar busca e filtros
- [x] Busca e filtros ficam nos parâmetros do endereço

## Comments

- O menu segue o mock: grupos "Aderência da empresa" (Quente, Fit, Não fit) e "Dados de contato", com a opção "Com algum canal". O chip desse filtro diz "Com dados de contato", o nome do ticket; o da Aderência, "Aderência: Quente", como na aba Contas. Vale confirmar: o `CONTEXT.md` define **Canal** como a Conexão onde se conversa com um Agente, e "Com algum canal" usa a palavra no sentido de e-mail, telefone ou LinkedIn.
- No endereço: `busca`, `aderencia` (repetido por opção) e `dados=com`. Parâmetros desconhecidos são ignorados.
- Com Aderência marcada, os Contatos de empresa ainda não avaliada (e os sem Conta-alvo na fonte) ficam fora, como na aba Contas.
- A contagem passou a mostrar "N de M contatos" com busca ou filtro, como no mock e na aba Contas.
- A busca, o menu, os chips, a contagem e o "sem resultado" saíram de `contas.tsx` para `modulo-contas-e-contatos.tsx`; a busca e os filtros no endereço, para `recorte-no-endereco.ts`; o rótulo da Aderência, para `ordem-da-aderencia.ts`. A aba Contas não mudou de comportamento.
- Ainda não dá para ir de um Contato à Conta-alvo e voltar: o link da empresa é o ticket 12, e o voltar ao lugar certo é o ticket 13. Por isso o recorte só foi testado abrindo o endereço.

