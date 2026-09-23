# Spec: módulo Contas e Contatos da Althius

Status: ready-for-agent

## Problem Statement

Na Althius, o usuário de receita do Cliente não tem onde ver as empresas do seu mercado e decidir quais trabalhar agora. Os Agentes já falam de Contas-alvo nas Conversas (o Scopus avalia a aderência, o Ethos descreve o Comitê de compra, o Rhetor escreve para ele), mas essas empresas não aparecem em lugar nenhum do produto. Para escolher a próxima abordagem, o usuário precisa responder rápido, empresa por empresa:

- Que empresa é essa?
- Ela está Quente, tem Fit ou é Não fit?
- Qual foi o último Sinal detectado?
- Quantos Contatos temos nela?
- Qual é o segmento dela?
- Quando foi o último contato comercial?

Hoje nada disso está numa tela. Não dá para comparar empresas lado a lado nem ver quem são as pessoas de cada uma. Também não há um lugar para onde o trabalho dos Agentes possa apontar.

## Solution

Um módulo novo, **Contas e Contatos**, no protótipo navegável (só front-end, dados simulados, ADR 0003), com duas abas conectadas.

- **Contas**, aberta por padrão, é uma tabela compacta e dominante na página. Tem uma linha por Conta-alvo e estas colunas: **Empresa · Aderência · Contatos · Último sinal · Segmento · Último contato**. No topo ficam o título, uma descrição curta, a contagem de contas exibidas, a busca, o botão de Filtros e o controle "Ordenar por". A ordem padrão põe as Quentes primeiro, depois as Fit e por último as Não fit. Dentro de cada grupo, os Sinais mais recentes vêm primeiro.
- **Detalhe da Conta-alvo** é uma página própria. O cabeçalho traz logo, nome, domínio (com link para o site), LinkedIn, segmento e Aderência. Abaixo vêm três seções, nesta ordem: **Sinais** (o mais recente em destaque e o histórico), **Contatos** (só os daquela empresa) e **Interações** (o histórico de onde vem o Último contato). Ao voltar, a lista está exatamente como estava: busca, filtros, ordenação e posição de rolagem.
- **Contatos** é uma tabela no mesmo sistema visual, com as pessoas de todas as Contas-alvo. As colunas são Nome, Cargo, Empresa, Área, Persona, Dados de contato e Último contato. O nome da empresa leva à Conta-alvo.

A tela apresenta o que a fonte de dados entrega e nunca inventa nada: nota, link, e-mail, telefone, Persona, Sinal ou data. Cada dado ausente tem um estado discreto e explícito. A Aderência (Quente, Fit ou Não fit) é a classificação do Scopus, única e sem nota numérica (ADR 0006). A regra que a calcula não faz parte desta entrega.

A demo continua sendo o Workspace da Databricks, com o selo "Demonstração". São cerca de 30 Contas-alvo reais, coerentes com os roteiros dos Agentes, e Contatos com nomes fictícios. Algumas empresas têm dados propositalmente ausentes, para exercitar os estados da interface.

## User Stories

Os atores são: **usuário** (alguém de receita no Cliente: SDR, AE, marketing, RevOps), **gestor** (líder de receita do Cliente) e **apresentador** (o fundador conduzindo a demo).

### Navegação

1. Como usuário, quero um item "Contas e Contatos" na seção Workspace da sidebar, acima de Agentes, para chegar ao módulo de qualquer página.
2. Como usuário, quero que o módulo abra na aba Contas, para ver primeiro as empresas.
3. Como usuário, quero alternar entre as abas Contas e Contatos no mesmo padrão de abas sublinhadas da página do Agente, para reconhecer a navegação.
4. Como usuário, quero que cada aba tenha o seu endereço, para compartilhar um link direto para Contas ou para Contatos.
5. Como usuário, quero que o item da sidebar fique ativo nas duas abas e no detalhe de uma Conta-alvo, para saber em que módulo estou.
6. Como usuário, quero que a página inicial continue sendo a grade de Agentes, para não perder o ponto de partida atual.

### Tabela de Contas: topo

7. Como usuário, quero ver o título "Contas" e uma descrição curta ("Empresas do seu mercado organizadas pelo momento de abordagem"), para entender a página sem explicação.
8. Como usuário, quero ver quantas contas estão sendo exibidas ("40 contas" ou, com busca ou filtro, "12 de 40 contas"), para saber o tamanho do que estou olhando.
9. Como usuário, quero buscar uma empresa pelo nome ou pelo domínio, sem me preocupar com maiúsculas e acentos, para achá-la rápido.
10. Como usuário, quero um botão "Filtros" que abre as opções de filtro, para reduzir a lista sem poluir a página.
11. Como usuário, quero um controle "Ordenar por" com opções nomeadas, para mudar a ordem sem adivinhar como.
12. Como usuário, **não** quero caixas de seleção nas linhas enquanto não houver ação em lote, para não ver controles sem função.

### Tabela de Contas: leitura

13. Como usuário, quero que a tabela seja o elemento dominante da página, ocupe a largura disponível e mostre várias empresas sem rolagem excessiva, para comparar muitas de uma vez.
14. Como usuário, quero linhas compactas, com divisões discretas e sem um cartão por empresa, para ler a tabela como uma lista de trabalho.
15. Como usuário, quero que o cabeçalho da tabela fique fixo ao rolar, para não esquecer o que cada coluna significa.
16. Como usuário numa tela menor, quero que a tabela role na horizontal mantendo a coluna Empresa visível, para não perder de qual empresa é cada linha.

### Coluna Empresa

17. Como usuário, quero ver o logo pequeno da empresa e o nome, para reconhecê-la na hora.
18. Como usuário, quero ver as iniciais da empresa num quadrado discreto quando não houver logo, sem ícones de pessoas ou de seres vivos, para que a coluna continue uniforme.
19. Como usuário, quero que o nome seja o elemento mais forte da linha, para escanear a tabela pelos nomes.
20. Como usuário, quero ver o domínio em texto secundário, sem aumentar a altura da linha, para distinguir empresas de nome parecido.
21. Como usuário, quero clicar no nome para abrir o detalhe da Conta-alvo, para ir fundo numa empresa.
22. Como usuário, quero clicar em qualquer ponto da linha para abrir o detalhe, para não precisar mirar no nome.
23. Como usuário, quero que um pop-up pequeno com os links para o site e o LinkedIn da empresa apareça ao passar o mouse sobre ela, para visitar essas páginas sem abrir o detalhe.
24. Como usuário de teclado, quero que o mesmo pop-up apareça quando o nome da empresa recebe o foco, para ter o mesmo acesso sem mouse.
25. Como usuário, quero que o pop-up continue aberto enquanto levo o mouse até ele, para conseguir clicar no link.
26. Como usuário, quero que o pop-up mostre só os links que existem (só o site, quando não houver LinkedIn) e que não apareça quando não houver nenhum, para nunca clicar num link inventado.
27. Como usuário, quero que os links do pop-up abram em outra aba, para não perder a lista.

### Coluna Aderência

28. Como usuário, quero ver a Aderência de cada Conta-alvo como "🔥 Quente", "Fit" ou "Não fit", para saber de relance quem trabalhar agora.
29. Como usuário, quero que as Quentes se destaquem pelo 🔥 e que o resto da coluna fique discreto, para que a tabela não vire uma sequência de alertas.
30. Como usuário, quero que "Não fit" apareça em texto mais apagado que "Fit", sem depender só da cor, para diferenciar os dois sem ruído.
31. Como usuário, quero ver "—" com a indicação "Aderência ainda não avaliada" numa Conta-alvo importada que o Scopus ainda não avaliou, para não confundir falta de avaliação com Não fit.
32. Como usuário, **não** quero ver nota numérica, letra ou score em nenhuma parte do módulo, para ler só a classificação.

### Coluna Contatos

33. Como usuário, quero ver quantos Contatos a Conta-alvo tem ("4 contatos", "1 contato"), para saber se já há com quem falar.
34. Como usuário, quero ver um grupo compacto de até três avatares (foto ou iniciais) junto da contagem, para ter uma ideia das pessoas sem abrir a conta.
35. Como usuário, quero ver "Nenhum contato" de forma clara e discreta quando não houver Contatos, para saber que ainda não há ninguém mapeado.
36. Como usuário, quero clicar nos Contatos de uma linha e cair direto na seção Contatos do detalhe daquela Conta-alvo, para ir às pessoas num clique.

### Coluna Último sinal

37. Como usuário, quero ler o Sinal mais recente numa frase curta e concreta seguida da data relativa ("Abriu 3 vagas comerciais · há 2 dias"), para entender o que aconteceu sem abrir a conta.
38. Como usuário, quero ver o Sinal mais recente seja qual for a idade dele ("há 4 meses"), para não perder um Sinal antigo que ainda é o último.
39. Como usuário, quero ver "Nenhum sinal" quando a Conta-alvo não tiver nenhum Sinal, sem evento nem data inventados.
40. Como usuário, quero que a coluna seja larga o bastante para a frase ser compreensível, e que um texto longo seja truncado com o texto completo num tooltip, para ler tudo quando precisar.

### Colunas Segmento e Último contato

41. Como usuário, quero ver o segmento em texto simples ("Software B2B", "Serviços financeiros"), sem tags coloridas, para ler sem esforço.
42. Como usuário, quero ver "—" quando o segmento não estiver disponível, para não confundir ausência com erro.
43. Como usuário, quero ver quando foi a última Interação com qualquer Contato da empresa ("Hoje", "Há 5 dias" ou uma data), para saber se alguém já está falando com ela.
44. Como usuário, quero ver "Nunca" quando não houver nenhuma Interação registrada, para saber que a empresa nunca foi abordada.
45. Como usuário, quero que o Último contato nunca seja confundido com a data do último Sinal, para não achar que já falei com uma empresa só porque algo aconteceu nela.

### Datas

46. Como usuário, quero datas relativas para acontecimentos recentes ("Hoje", "Ontem", "há N dias", "há N semanas", até 30 dias) e a data explícita para os mais antigos ("12 mar.", ou "12 mar. 2025" em outro ano), para ler rápido sem perder precisão.
47. Como usuário, quero ver a data completa ao passar o mouse sobre qualquer data, para saber o dia exato.
48. Como apresentador, quero que as datas da demo acompanhem o dia em que a demo roda, para que "há 2 dias" continue verdadeiro sempre.

### Ordenação

49. Como usuário, quero que a lista abra ordenada por Prioridade: Quentes primeiro, depois Fit, depois Não fit, depois as ainda não avaliadas. Dentro de cada grupo, quero os Sinais mais recentes primeiro, as contas sem Sinal no fim e empate desfeito pelo nome, para começar pelas empresas mais quentes.
50. Como usuário, quero ordenar por Último sinal (o mais recente primeiro, sem Sinal por último), para ver o que acabou de acontecer no mercado.
51. Como usuário, quero ordenar por Contatos (a que tem mais primeiro), para ver onde já tenho mais gente mapeada.
52. Como usuário, quero ordenar por Último contato (o mais recente primeiro, "Nunca" por último), para ver onde houve atividade comercial recente.

### Filtros

53. Como usuário, quero filtrar por Aderência (Quente, Fit, Não fit), escolhendo uma ou mais, para focar nas classificações que me interessam.
54. Como usuário, quero filtrar por Segmento, escolhendo um ou mais entre os segmentos que existem nos dados, para trabalhar um setor por vez.
55. Como usuário, quero filtrar por Sinal (com ou sem Sinal), para achar empresas com algo acontecendo ou sem nenhum Sinal.
56. Como usuário, quero filtrar por Contatos (com ou sem Contatos), para achar empresas que ainda precisam de pessoas mapeadas.
57. Como usuário, quero ver cada filtro ativo como um chip removível e ter um "Limpar filtros", para entender e desfazer o que está aplicado.
58. Como usuário, quero que busca e filtros se combinem, para chegar a um recorte preciso.

### Estados da tabela de Contas

59. Como usuário, quero ver o estado de carregamento do app (o pulso, e não um spinner genérico) enquanto as contas carregam.
60. Como usuário, quero ver "Nenhuma Conta-alvo ainda. As empresas aparecem aqui quando o Scopus encontrá-las ou quando forem importadas." quando não houver nenhuma Conta-alvo, sem botão e sem pedido para configurar o ICP.
61. Como usuário, quero ver "Nenhuma conta encontrada para “x”." e a opção "Limpar busca e filtros" quando a busca ou os filtros não encontrarem nada, para sair do beco sem saída.
62. Como usuário, quero ver uma mensagem de erro com o botão "Tentar de novo" quando as contas não carregarem, para tentar de novo sem recarregar o app.

### Voltar sem perder o lugar

63. Como usuário, quero que busca, filtros e ordenação fiquem no endereço da página, para voltar do detalhe ou compartilhar o recorte.
64. Como usuário, quero voltar do detalhe (pela migalha "Contas" ou pelo voltar do navegador) e reencontrar a lista na mesma posição de rolagem, para continuar de onde parei.

### Detalhe da Conta-alvo

65. Como usuário, quero que o detalhe abra numa página própria com a migalha "Contas / Nome da empresa", no padrão das outras páginas do app.
66. Como usuário, quero ver no cabeçalho o logo (ou as iniciais), o nome, o domínio com link para o site, o link do LinkedIn, o segmento e a Aderência, quando esses dados existirem, para identificar a empresa.
67. Como usuário, quero ver discretamente de onde veio a Conta-alvo ("Importada por Marina em 12 set."), quando essa informação existir, para entender por que ela está na lista.
68. Como usuário, quero ver na seção Sinais o Sinal mais recente em destaque, com a frase, a data e, quando existirem, a fonte, a evidência e quem o detectou, para entender o motivo de agir agora.
69. Como usuário, quero ver abaixo do destaque o histórico dos outros Sinais, do mais recente ao mais antigo, com as mesmas informações, para ver a sequência de acontecimentos.
70. Como usuário, quero ver "Nenhum sinal" na seção Sinais quando não houver nenhum, sem texto de IA explicando "por que importa".
71. Como usuário, quero ver na seção Contatos só as pessoas daquela empresa, no mesmo formato da aba Contatos (menos a coluna Empresa), para saber com quem falar ali.
72. Como usuário, quero ver "Nenhum contato" na seção Contatos quando não houver nenhum.
73. Como usuário, quero ver na seção Interações o histórico de Interações, da mais recente à mais antiga, com o tipo (e-mail enviado, e-mail recebido, mensagem enviada, ligação, reunião), o Contato, quem do Cliente participou, a origem do registro e a data, para entender de onde vem o Último contato.
74. Como usuário, quero ver "Nenhuma interação registrada" quando não houver Interações, e o Último contato "Nunca" coerente com isso.
75. Como usuário, quero ver "Conta não encontrada" com um caminho de volta para Contas quando o endereço apontar para uma Conta-alvo que não existe.
76. Como usuário, quero que a seção Sinais venha primeiro, depois Contatos e por fim Interações, para ler na ordem "por que agir, com quem falar, o que já aconteceu".

### Aba Contatos

77. Como usuário, quero ver na aba Contatos todas as pessoas das Contas-alvo, com Nome, Cargo, Empresa, Área, Persona, Dados de contato e Último contato, para escolher quem abordar.
78. Como usuário, quero clicar no nome da empresa de um Contato e abrir aquela Conta-alvo, para ver o contexto da empresa.
79. Como usuário, quero ver a Área como o texto que a fonte fornecer ("Marketing", "Vendas") ou "—", para saber de que time a pessoa é.
80. Como usuário, quero ver a Persona atribuída ao Contato, ou "—" quando não houver, sem que a tela tente adivinhar.
81. Como usuário, quero ver ícones de e-mail, telefone e LinkedIn que indicam quais canais existem para a pessoa, com os ausentes discretos, para saber por onde posso abordá-la.
82. Como usuário, quero que cada ícone de canal tenha um nome acessível que diga se o canal está disponível ou não ("E-mail disponível", "Telefone não disponível"), para não depender só da aparência.
83. Como usuário, quero ver o Último contato com aquela pessoa, ou "Nunca", para não abordar de novo quem acabou de receber uma mensagem.
84. Como usuário, quero buscar Contatos por nome, cargo ou empresa.
85. Como usuário, quero filtrar Contatos pela Aderência da empresa e por "Com dados de contato", para achar quem posso abordar agora.
86. Como usuário, quero que a aba abra ordenada pela Aderência da empresa, depois pelo nome da empresa e depois pelo nome da pessoa, para ver primeiro as pessoas das Contas-alvo mais quentes.
87. Como usuário, quero os mesmos estados de carregamento, lista vazia, busca sem resultado e erro com "Tentar de novo" da aba Contas.
88. Como usuário, quero que busca e filtros da aba Contatos também fiquem no endereço, para voltar de uma Conta-alvo sem perder o recorte.

### Demo e honestidade dos dados

89. Como apresentador, quero cerca de 30 Contas-alvo reais e coerentes com os roteiros dos Agentes (OpenAI, Stripe, Anthropic, Nubank, BBVA México, Banorte…), para que a demo tenha cara de real.
90. Como apresentador, quero que a maioria das Contas-alvo da demo tenha Sinais e que as só Fit e as Não fit sejam poucas: 18 Quentes, 8 Fit, 3 Não fit e 1 ainda não avaliada.
91. Como apresentador, quero que toda Conta-alvo Não fit da demo apareça como importada pelo usuário, para que nenhuma pareça recomendação da Althius.
92. Como apresentador, quero que o Sinal da OpenAI bata com o roteiro do Rhetor (três vagas de engenharia de dados de avaliação), para que módulo e Conversas contem a mesma história.
93. Como apresentador, quero algumas Contas-alvo com dados ausentes (sem logo, sem Contatos, sem Sinal, sem Segmento, sem site ou LinkedIn, com "Nunca" no Último contato), para mostrar todos os estados da interface.
94. Como apresentador, quero os logos reais das empresas quando disponíveis e as iniciais nas demais.
95. Como apresentador, quero que os links de site e LinkedIn da demo sejam os endereços públicos reais das empresas, e que algumas não tenham link, sem link inventado.
96. Como apresentador, quero Contatos com cargos reais e nomes fictícios, sem nenhum e-mail, telefone ou perfil exibido, só a disponibilidade de cada canal, para não inventar endereços em domínios reais.
97. Como gestor, quero que o selo "Demonstração" continue visível, para que ninguém confunda os dados da demo com contas reais do Workspace.

### Aparência

98. Como usuário, quero que o módulo pareça parte nativa do app, com os tokens do Manual da Marca, a tipografia Oswald, raio 0 nos campos e os dois temas (escuro e claro), para que o produto seja um só.
99. Como usuário, **não** quero cartões grandes por empresa, gradientes decorativos, excesso de bordas nem blocos chamativos, para que a tela pareça ferramenta de trabalho.

## Implementation Decisions

### Vocabulário e decisões de domínio

- Os termos seguem o `CONTEXT.md`: **Conta-alvo**, **Aderência**, **Contato**, **Persona**, **Sinal**, **Interação**. "Contas" aparece só como rótulo curto no menu, na aba e no título.
- **Aderência** é uma classificação única com três valores: `quente`, `fit` e `nao-fit`. Quente implica Fit. Não existe Momento separado (ADR 0006). A Aderência é opcional: uma Conta-alvo importada pode ainda não ter sido avaliada. A tela não calcula a Aderência nem valida essas regras. Ela mostra o que a fonte entrega, e os dados da demo respeitam as regras.
- Não há nota numérica da Aderência em nenhum dado exposto ao módulo.
- **Etapa** não faz parte desta versão: não há coluna, filtro nem campo no detalhe.

### Fronteira de dados: `FonteDeContas`

- Nasce uma interface nova, **`FonteDeContas`**, separada de `FonteDeAgentes`, no mesmo estilo: operações assíncronas e um `observar` para avisar mudanças. Ela é a única fronteira entre as telas do módulo e os dados. Um back-end real entra implementando a mesma interface (ADR 0003).
- As operações são só de leitura:
  - listar as Contas-alvo;
  - buscar uma Conta-alvo pelo identificador;
  - listar todos os Contatos;
  - listar os Contatos, os Sinais e as Interações de uma Conta-alvo.
- A **Conta-alvo** carrega:
  - campos obrigatórios: identificador e nome;
  - campos opcionais: domínio, URL do site, URL do LinkedIn, logo, segmento, Aderência e origem (recomendada pela Althius, ou importada, com quem importou e quando);
  - campos que a fonte já entrega calculados, para a tabela não precisar carregar tudo: a quantidade de Contatos, até três pré-visualizações de Contato (nome e foto opcional, para os avatares), o último Sinal (ou nenhum) e a data do Último contato (ou nenhuma).
- O **Contato** carrega:
  - identificador, a Conta-alvo a que pertence e nome;
  - campos opcionais: cargo, área em texto livre, Persona (no máximo uma) e foto;
  - a disponibilidade de cada canal (e-mail, telefone, LinkedIn) como sim ou não. Na demo não há os valores dos canais, só a disponibilidade;
  - a data do Último contato com a pessoa (ou nenhuma).
- O **Sinal** carrega frase descritiva e data. Fonte, evidência e "detectado por" são opcionais. "Detectado por" pode ser um Agente ou uma Integração. O Sinal não tem tipo nem categoria.
- A **Interação** carrega tipo (e-mail enviado, e-mail recebido, mensagem enviada, ligação, reunião), data e Contato. Quem do Cliente participou e a origem do registro (por exemplo, HubSpot ou Althius) são opcionais. Uma sequência só criada e um Sinal nunca são Interações.
- Todas as datas trafegam como instantes absolutos. A formatação relativa é da tela.
- A fonte devolve a lista inteira, sem paginação. Busca, filtros e ordenação são feitos na tela sobre essa lista.

### Implementação simulada

- Uma implementação simulada de `FonteDeContas`, com os dados da demo num módulo próprio de dados, como já acontece com os Agentes.
- Opções da fábrica, todas invisíveis na interface:
  - atraso simulado, como na fonte dos Agentes;
  - uma data de "hoje": os dados da demo são descritos como deslocamentos a partir dela (por exemplo, "há 2 dias"). No app, é o dia atual; nos testes, é uma data fixa;
  - falha: toda leitura rejeita, para exercitar o estado de erro. Só os testes usam essa opção;
  - lista de Contas-alvo vazia, para exercitar o estado de lista vazia. Só os testes usam essa opção.

### App, provedores e carregamento

- O App recebe a `FonteDeContas` como uma segunda dependência, ao lado da `FonteDeAgentes`, com o próprio provedor de contexto.
- O carregamento de dados ganha um estado de erro e uma forma de tentar de novo. É a primeira mensagem de erro de carregamento do app: um texto curto no padrão do app e o botão "Tentar de novo", que refaz a leitura.
- O carregamento usa o componente de carregamento existente (o pulso).

### Rotas e casca

- Novas rotas:
  - a aba Contas;
  - a aba Contatos;
  - o detalhe de uma Conta-alvo;
  - a seção Contatos do detalhe, alcançada por uma âncora na mesma página.
- A rota inicial continua sendo a grade de Agentes.
- A sidebar ganha o item "Contas e Contatos" na seção Workspace, acima de Agentes, ativo nas duas abas e no detalhe. O ícone é um Lucide coerente com os demais itens (por exemplo, um prédio).
- As duas abas usam o componente de página existente, com barra de topo e título, e a navegação de abas sublinhadas da página do Agente.
- O detalhe usa a migalha de volta do componente de página ("Contas / Nome").

### Estado da lista no endereço

- Busca, filtros e ordenação de cada aba vivem nos parâmetros de consulta do endereço. Ao voltar do detalhe, a lista se reconstrói a partir deles.
- A posição de rolagem da lista é restaurada ao voltar, tanto pela migalha quanto pelo voltar do navegador.

### Tabela de Contas

- Colunas, nesta ordem: Empresa, Aderência, Contatos, Último sinal, Segmento, Último contato. A coluna Último sinal é a mais larga.
- Linhas compactas (cerca de 44px), divisões horizontais discretas com o token de linha, sem fundo especial para as Quentes e sem cartões.
- O cabeçalho da tabela fica fixo ao rolar a página. Com rolagem horizontal, a coluna Empresa fica fixa à esquerda.
- A linha inteira é clicável e leva ao detalhe. O nome é o alvo evidente: é um link e o elemento de maior peso na linha.
- A célula de Contatos é um link próprio para a seção Contatos do detalhe. Clicar nela não dispara o clique da linha.
- **Célula Empresa:** logo ou iniciais, o nome e o domínio em texto secundário ao lado ou abaixo, sem aumentar a linha.
- **Pop-up da empresa:** abre ao passar o mouse, depois de um pequeno atraso para não piscar ao percorrer a tabela, e também quando o nome recebe o foco do teclado. Continua aberto enquanto o ponteiro está nele. Mostra o link do site e o do LinkedIn que existirem, e abre os dois em outra aba. Sem nenhum dos dois links, o pop-up não aparece.
- **Célula Aderência:**
  - "🔥 Quente", com o emoji literal;
  - "Fit", em texto normal;
  - "Não fit", em texto apagado (token de texto secundário);
  - "—" com o tooltip "Aderência ainda não avaliada", quando não há Aderência.
  - Não há selos coloridos.
- **Célula Contatos:** até três avatares sobrepostos (foto ou iniciais, sem ícone genérico de pessoa) e o texto "N contatos" ou "1 contato". Sem Contatos, mostra "Nenhum contato" em texto apagado.
- **Célula Último sinal:** "frase · data relativa", truncada em uma linha com tooltip do texto completo. Sem Sinal, mostra "Nenhum sinal".
- **Célula Segmento:** texto simples, ou "—".
- **Célula Último contato:** data relativa ou explícita, ou "Nunca".
- **Logos:** o SVG oficial do Simple Icons (CC0) das empresas que o têm, como os logos das Integrações. Nas demais, as iniciais num quadrado discreto com os tokens da marca.

### Ordenação, filtros e busca

- "Ordenar por" é um menu com quatro opções de direção fixa, e os cabeçalhos não são clicáveis:
  - **Prioridade**, o padrão: grupos Quente, Fit, Não fit e não avaliada. Dentro de cada grupo, Sinal mais recente primeiro, sem Sinal no fim e empate pelo nome;
  - **Último sinal**: mais recente primeiro, sem Sinal no fim;
  - **Contatos**: mais Contatos primeiro;
  - **Último contato**: mais recente primeiro, "Nunca" no fim.
- O botão "Filtros" abre um menu com quatro grupos:
  - Aderência: Quente, Fit, Não fit, com seleção múltipla;
  - Segmento: com seleção múltipla, com as opções tiradas dos dados;
  - Sinal: com ou sem;
  - Contatos: com ou sem.
- Grupos diferentes se combinam com "e". Opções do mesmo grupo se combinam com "ou". Os filtros ativos aparecem como chips removíveis abaixo da barra, com "Limpar filtros".
- A busca compara com o nome e o domínio, sem diferenciar maiúsculas e acentos, e se combina com os filtros.
- A contagem mostra "N contas" sem recorte e "N de M contas" com busca ou filtro.

### Datas

- Uma regra única de formatação para todo o módulo:
  - até 30 dias: "Hoje", "Ontem", "há N dias", "há N semanas";
  - depois disso: a data explícita, "12 mar." no mesmo ano e "12 mar. 2025" em outro ano.
- A data completa fica acessível num tooltip e no nome acessível do elemento.
- Na coluna Último contato, a data relativa começa com maiúscula ("Há 5 dias"). No Último sinal, depois do "·", fica em minúscula ("há 2 dias").

### Detalhe da Conta-alvo

- **Cabeçalho:**
  - logo ou iniciais em tamanho maior, e o nome;
  - o domínio, com link para o site quando houver URL;
  - o LinkedIn, quando houver;
  - o segmento e a Aderência, no mesmo tratamento da tabela;
  - uma linha discreta de origem ("Importada por Marina em 12 set." ou "Recomendada pela Althius"), quando a informação existir.
- **Seções, em sequência, numa página só, sem abas:**
  1. **Sinais**: o mais recente em destaque, com frase, data, fonte, evidência e "detectado por" quando existirem, e o histórico abaixo, do mais recente ao mais antigo.
  2. **Contatos**: a mesma tabela da aba Contatos, sem a coluna Empresa, só com os Contatos daquela Conta-alvo. Tem uma âncora para o link da tabela de Contas.
  3. **Interações**: lista do mais recente ao mais antigo, com tipo, Contato, quem do Cliente participou, origem e data.
- Cada seção tem o seu estado vazio: "Nenhum sinal", "Nenhum contato" e "Nenhuma interação registrada".
- Um identificador inexistente mostra "Conta não encontrada" com um link de volta, como a página de Agente não encontrado.
- Não há texto gerado por IA explicando "por que importa".

### Aba Contatos

- Colunas: Nome, Cargo, Empresa (um link para a Conta-alvo), Área, Persona, Dados de contato e Último contato.
- Ausências aparecem como "—" em Cargo, Área e Persona e como "Nunca" em Último contato.
- **Dados de contato:** três ícones Lucide (e-mail, telefone, LinkedIn). O disponível aparece normal e o ausente, apagado. Cada ícone tem nome acessível com o estado. Não há valores nem links.
- Busca por nome, cargo e empresa.
- Filtros:
  - a Aderência da empresa (Quente, Fit, Não fit);
  - "Com dados de contato", ou seja, pelo menos um canal disponível.
  - Não há filtro de Persona.
- Ordem padrão: Aderência da empresa (na mesma ordem de grupos da Prioridade), depois nome da empresa e depois nome da pessoa. Não há controle de ordenação nesta aba.
- A linha não é clicável e não há página de Contato. O único link da linha é a empresa.

### Dados da demo

- As Contas-alvo:
  - cerca de 30 empresas reais, coerentes com os roteiros e a Memória dos Agentes (OpenAI, Stripe, Anthropic, Nubank, BBVA México, Banorte, entre outras);
  - 18 Quentes (todas com Sinal recente), 8 Fit, 3 Não fit e 1 ainda não avaliada;
  - as 3 Não fit e a não avaliada têm origem "importada", pela usuária da demo. As demais têm origem "recomendada pela Althius".
- Os Sinais têm frase e fonte plausíveis ("Vaga publicada no LinkedIn"), sem URL de evidência. O Sinal mais recente da OpenAI é a abertura de três vagas de engenharia de dados de avaliação, como no roteiro do Rhetor.
- Os Contatos têm nomes fictícios e cargos reais. Algumas empresas têm quatro ou mais Contatos, outras menos, e três não têm nenhum. Parte dos Contatos tem Persona e parte não.
- As Interações são coerentes com os roteiros e as Aprovações existentes, quando se referirem às mesmas empresas.
- Dados propositalmente ausentes: 4 sem logo, 3 sem Contatos, 3 sem nenhum Sinal, 5 com "Nunca" no Último contato, 2 sem segmento e 3 sem site nem LinkedIn.
- Os sites e LinkedIn preenchidos são os endereços públicos reais das empresas.

## Testing Decisions

- **Um bom teste** verifica o comportamento visível pelo usuário: o que aparece na tela depois de uma ação. Nunca testa estado interno, nomes de componentes ou detalhes de implementação.
- **Uma única camada de teste**, como no resto do app: o app inteiro renderizado sobre as fontes simuladas e dirigido como um usuário faria (clicar, digitar, usar o teclado). Não há teste de componente isolado nem teste direto da ordenação ou dos filtros.
- **A única costura nova** é a `FonteDeContas` simulada, entregue ao App ao lado da fonte dos Agentes. O utilitário de renderização dos testes passa a montar as duas fontes e aceita as opções só de teste: data de "hoje" fixa (para as datas relativas darem sempre o mesmo texto), falha nas leituras e lista de Contas-alvo vazia.
- **Referência:** os testes de comportamento do app atual (Vitest + Testing Library, jsdom), que já renderizam o app inteiro a partir de uma rota.
- **Cobertura mínima:**
  - o item "Contas e Contatos" aparece na sidebar acima de Agentes e abre a aba Contas;
  - a tabela de Contas mostra as seis colunas, na ordem, e a contagem de contas;
  - a ordem padrão põe as Quentes primeiro, com o Sinal mais recente no topo, depois Fit, depois Não fit;
  - cada opção de "Ordenar por" reordena a lista como decidido;
  - a busca encontra pelo nome e pelo domínio, ignorando acentos, e atualiza a contagem ("N de M contas");
  - cada filtro reduz a lista, aparece como chip, pode ser removido, e "Limpar filtros" desfaz todos;
  - uma busca sem resultado mostra a mensagem e "Limpar busca e filtros" restaura a lista;
  - a fonte vazia mostra o texto de lista vazia, sem pedir configuração;
  - a fonte com falha mostra o erro, e "Tentar de novo" dispara uma nova leitura;
  - os estados de ausência aparecem: "Nenhum contato", "Nenhum sinal", "Nunca", "—" no segmento, e "—" com "Aderência ainda não avaliada";
  - a Aderência aparece como "🔥 Quente", "Fit" ou "Não fit", e nenhuma nota numérica aparece no módulo;
  - "Etapa", "CRM" e "Fora do CRM" não aparecem no módulo;
  - o pop-up da empresa mostra os links que existem, só o site quando não há LinkedIn, e não aparece quando não há link;
  - clicar no nome ou na linha abre o detalhe; clicar nos Contatos abre o detalhe na seção Contatos;
  - o detalhe mostra o cabeçalho, as seções Sinais, Contatos e Interações nessa ordem, só os Contatos daquela empresa, e os estados vazios de cada seção;
  - uma Conta-alvo importada mostra a origem no detalhe;
  - voltar do detalhe mantém a busca, os filtros e a ordenação;
  - um endereço de Conta-alvo inexistente mostra "Conta não encontrada";
  - a aba Contatos mostra as colunas, "—" nas ausências, a disponibilidade dos canais pelo nome acessível, e o nome da empresa leva à Conta-alvo;
  - a busca e os filtros da aba Contatos funcionam;
  - as datas relativas e explícitas saem como decidido, a partir da data fixa de "hoje".

## Out of Scope

- Fluxo para definir ou editar o ICP, e qualquer pedido de configuração dentro do módulo.
- Fluxo para definir Personas, e a lógica de seleção de Contatos por Persona.
- Construtor, cadastro, categorias ou regras de Sinais.
- A regra que classifica a Aderência (Quente, Fit, Não fit) e qualquer nota numérica.
- Etapa, fase do funil e negócios vinculados à Conta-alvo.
- Integração nova com CRM externo e sincronização.
- Enriquecimento real de empresas e Contatos.
- Importação de Contas-alvo, embora o módulo já mostre a origem "importada".
- Seleção de várias linhas e ações em lote.
- Página de detalhe do Contato.
- Ordenação clicando nos cabeçalhos e alternância de direção da ordenação.
- Paginação.
- Mudanças na aba de Agentes, inclusive links da Atividade ou das Conversas para as Contas-alvo.
- Versão mobile: o protótipo continua sendo só para desktop (ADR 0003), com rolagem horizontal da tabela em janelas estreitas.

## Further Notes

- Decisões de domínio: `CONTEXT.md` (Conta-alvo, Aderência, Contato, Persona, Sinal, Interação) e ADR 0006 (Aderência como classificação única, com Quente dentro dela). A ADR 0003 continua valendo: marcas e empresas reais, pessoas fictícias e o selo "Demonstração".
- As capturas de referência da Monaco e da Frontrunner não chegaram a esta conversa. Da Monaco, a intenção é a tabela compacta, com logos, divisões discretas e leitura rápida de status. Da Frontrunner, a hierarquia da página, a barra de busca, filtros e ordenação, e o Sinal numa frase curta. Nada da identidade visual, dos dados ou dos nomes de colunas dessas ferramentas deve ser copiado. Se as capturas forem adicionadas em `.scratch/contas-e-contatos/referencias/`, os tickets de layout devem consultá-las.
- A aba de Agentes ainda fala em "nota de aderência" (a descrição do Scopus e o roteiro com "Aderência ao ICP: 87 de 100"). O glossário agora diz que o Scopus "avalia a Aderência". Alinhar esses textos fica para um ticket à parte, fora deste módulo.
- Critério de qualidade para a revisão final:
  - a tabela é o foco visual;
  - numa olhada se identificam empresa, Aderência, Contatos, Sinal, segmento e Último contato;
  - as Quentes se destacam com moderação;
  - a coluna do Sinal continua legível;
  - Contas e Contatos se conectam por navegação clara;
  - o módulo funciona com dados ausentes sem inventar nada.
