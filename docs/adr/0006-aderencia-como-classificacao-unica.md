# Aderência como classificação única, com Quente dentro dela

Contas e Contatos mostra, para cada Conta-alvo, uma só classificação do Scopus, a **Aderência**, com três valores: **Quente**, **Fit** e **Não fit**. Quente implica Fit: é a Conta-alvo que encaixa no ICP e deve ser abordada agora. Não existe um "Momento" separado. Decidimos assim para que a tabela responda numa leitura só a pergunta "quem eu trabalho agora", com uma coluna, um filtro e uma ordem padrão (Quente, depois Fit, depois Não fit). A nota numérica que o Scopus calcula não aparece em nenhuma parte do módulo. Uma Conta-alvo Não fit só está na lista porque o Cliente a importou: a Althius não a recomenda. Enquanto não é avaliada, uma Conta-alvo importada fica sem Aderência ("—").

## Considered Options

- Duas dimensões independentes, Aderência (Fit/Não fit) e Momento (Quente/Frio), em colunas e filtros separados: descartado, porque criaria combinações como "Quente e Não fit", que o produto não quer tratar, e dividiria a leitura de prioridade em duas colunas.
- Mostrar a nota numérica de aderência do Scopus: descartado, porque uma nota passa uma precisão que a classificação ainda não tem e compete com os três valores.

## Consequences

Quem ler "Quente" dentro de "Aderência" pode estranhar, já que Quente fala de urgência e não só de encaixe no ICP. Não separe as duas coisas sem rever esta decisão. A regra que classifica cada Conta-alvo ainda não existe: a tela só apresenta o que a fonte de dados entrega.
