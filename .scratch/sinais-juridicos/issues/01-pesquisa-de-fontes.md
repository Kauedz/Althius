# 01: Pesquisa das fontes de dados de jurimetria

**What to build:** nada de código. Uma nota de pesquisa, `.scratch/sinais-juridicos/pesquisa-fontes.md`, que responde com fonte primária (documentação oficial, termos de uso, resposta real da API) às perguntas abaixo. Onde não for possível confirmar, a resposta é "não sei", nunca uma suposição.

1. A API pública do DataJud (CNJ) devolve as **partes** do processo? Devolve o CNPJ ou só o nome? Que campos traz (tribunal, classe, assunto, movimentos, datas)?
2. Quais tribunais a fonte cobre e com que **atraso**? Há limites de uso e exigência de chave?
3. O **Diário de Justiça Eletrônico Nacional** e os diários dos tribunais trazem as partes? Dá para buscar por CNPJ? Quais os termos de uso?
4. Onde saem os **temas repetitivos, súmulas e teses** novos (STF e STJ) de forma que um programa leia? Há feed, API ou só páginas?
5. Agregadores pagos de dados processuais: o que entregam, quanto custa e o que os termos permitem (por exemplo, é permitido guardar o dado e mostrá-lo a terceiros?).
6. Como ligar **tema a setor** da Conta-alvo (`segment`)? Que tabela manual mínima serviria para começar?

**Blocked by:** nenhum.

**Status:** ready-for-agent

## Pode mexer

- Só criar `.scratch/sinais-juridicos/pesquisa-fontes.md` e acrescentar `## Comments` neste ticket.

## Não mexa

- Em código, migrations, registro de actors e Edge Functions.
- Nos outros specs de `.scratch/`.

## Critérios

- [ ] Cada uma das 6 perguntas tem resposta com a fonte (link e data da consulta) ou "não sei".
- [ ] A nota diz, no topo, quais Sinais JURI são viáveis com o que se descobriu (J, R, U, I) e por quê.
- [ ] Nenhum dado pessoal real foi copiado para o repositório (exemplos fictícios).

## Comments

- 01/10/2026: primeiro rascunho em [`pesquisa-fontes.md`](../pesquisa-fontes.md), feito só com busca na web. A rede do ambiente da IA bloqueia `*.jus.br`, então nenhuma fonte oficial foi lida na íntegra. Veredito provisório: o J é viável pelos dados abertos do STJ (e talvez do STF). O R, o U e o I não saem do DataJud, que pelos resumos não traz as partes; dependem de um agregador pago ou do DJEN (não se sabe se filtra por parte). Para fechar o ticket, falta liberar os domínios listados no topo da nota e confirmar cada item marcado "a confirmar" ou "não sei". O ticket segue aberto.
- 01/10/2026: [`pesquisa-fontes.md`](../pesquisa-fontes.md) reescrita com a pesquisa do Nan no Antigravity, feita nas fontes primárias e com trecho literal em cada resposta. As 6 perguntas têm resposta ou "não sei". Veredito: o J é viável pelo `Temas.csv` do STJ (licença CC BY), com o risco do frescor, porque o arquivo diz "atualizado pela última vez em 24/10/2025". O DataJud fica fora para a Althius, porque a norma do CNJ veda a exploração comercial dos dados. O DJEN também fica fora: a API documentada é a dos tribunais, com usuário e senha. O R, o U e o I só saem por agregador pago; JUDIT e Jusbrasil confirmam aviso de processo novo por CNPJ, com preço e licença sob consulta. Proposta para o Nan decidir: a primeira entrega do spec fica só com o J. O ticket segue aberto até colar os links marcados "(link a incluir)", porque o texto colado veio sem vários endereços.
