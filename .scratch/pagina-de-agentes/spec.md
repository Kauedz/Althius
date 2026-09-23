# Spec: protótipo da aba de Agentes da Althius

## Problem Statement

A Althius é um Revenue OS: uma plataforma onde empresas B2B operam o go-to-market com agentes especialistas. O fundador precisa **mostrar** (para investidores, prospects e o próprio time) como vai ser a aba de Agentes, com tudo que ela vai fazer. Mas ainda não existe nenhuma tela, nenhuma identidade aplicada em produto e nenhuma forma de demonstrar o comportamento dos agentes: autonomia no estilo Hermes Agent, chamada por @menção no estilo Grok, coordenação de vários agentes a partir de um só pedido, memória, habilidades, rotinas, canais, integrações e aprovações. Sem um protótipo navegável, a visão do produto fica no discurso e não dá para validar o desenho da experiência.

## Solution

Um protótipo navegável, só front-end, da aba de Agentes, com dados simulados e fiel ao Manual da Marca Althius v2.0. Nele, qualquer pessoa pode:

- ver a grade com todos os Agentes do Workspace, no molde da tela de agentes do Frontrunner: os 4 Agentes padrão (**Scopus**, ICP; **Ethos**, Persona; **Rhetor**, escrita persuasiva; **Oraculum**, GEO) e os Agentes criados pelo Cliente a partir dessas Especialidades;
- criar um Agente a partir de uma Especialidade, e excluir um Agente criado;
- fazer um pedido no composer, abaixo da grade, e ver a Coordenação dividir o trabalho entre os Agentes e entregar uma resposta consolidada;
- abrir cada Agente e navegar por Conversa, Memória, Habilidades, Rotinas, Canais, Configuração e Atividade;
- disparar conversas roteirizadas, incluindo a Colaboração entre Agentes por @menção e uma aprovação no Slack;
- ver as Conexões (Canais e Integrações), as Permissões por Integração e a fila de Aprovações.

O workspace da demo é o da **Databricks**, com Contas-alvo reais, pessoas fictícias e o selo "Demonstração". Interface e conteúdo gerado ficam em pt-BR. O protótipo é só para desktop e tem tema escuro (padrão) e claro.

## User Stories

Os atores são: **usuário** (alguém de receita no Cliente: SDR, AE, marketing, RevOps), **gestor** (líder de receita do Cliente) e **apresentador** (o fundador conduzindo a demo).

### Grade de Agentes
1. Como usuário, quero ver ao abrir a aba de Agentes uma grade com todos os Agentes do Workspace, padrão e criados, para escolher com qual quero trabalhar.
2. Como usuário, quero ver em cada cartão o nome, o estado, uma descrição curta, quando o Agente roda (a Rotina ativa ou "Sob demanda"), quantas execuções ele já fez e os logos das Integrações que usa, para entender cada Agente sem abri-lo.
3. Como usuário, quero ver quando um Agente está trabalhando (o pulso) e quando ele detectou algo (o ponto rosa), para entender o que está acontecendo sem abrir o Agente.
4. Como apresentador, quero que os números da grade sejam exatos e plausíveis (nunca arredondados para cima), para respeitar o princípio "número honesto" da marca.
5. Como usuário, quero que a página de Agentes mostre só a grade e o composer, sem painel de métricas, para ir direto ao trabalho.

### Agentes criados
6. Como usuário, quero criar um Agente pelo botão "Novo agente", escolhendo a Especialidade, escrevendo o complemento do nome e, se quiser, instruções, para ter um Agente dedicado a um segmento ou uso (ex.: "Scopus · Enterprise LATAM").
7. Como usuário, quero que o Agente criado comece com uma cópia da Personalização, das Permissões e das Habilidades do Agente padrão da mesma Especialidade, com Memória vazia e sem Rotinas, para não configurar tudo do zero.
8. Como usuário, quero que o Agente criado apareça na grade e abra a página dele logo depois de criado, para começar a usá-lo.
9. Como usuário, quero excluir um Agente criado, para limpar Agentes que não uso mais.
10. Como usuário, **não** quero conseguir excluir um Agente padrão, renomear um Agente nem criar uma Especialidade, porque o catálogo de Especialidades é fixo da Althius (ADR 0005).

### Composer e Coordenação
11. Como usuário, quero um composer abaixo da grade onde faço um pedido sem escolher um Agente, para que a Coordenação chame os Agentes certos por mim.
12. Como usuário, quero ver cada Agente que a Coordenação chamou como um passo, com o que ele fez, e no fim uma resposta consolidada, para entender quem trabalhou no quê.
13. Como usuário, quero @mencionar um Agente no composer (ex.: "@Rhetor escreve um e-mail para a Stripe") e ter a certeza de que ele será incluído, sem impedir que a Coordenação chame outros.
14. Como usuário, quero que uma pergunta genérica (ex.: "o que é ICP?") seja respondida direto, sem chamar nenhum Agente, para não criar passos artificiais.
15. Como usuário, quero continuar o fio no composer (ex.: "agora faz um e-mail pro CFO"), para refinar o pedido sem recomeçar.
16. Como usuário, quero sugestões clicáveis de pedidos coordenados abaixo do composer, para disparar os fluxos mais comuns sem digitar.
17. Como gestor, quero que as ações propostas pelos Agentes chamados na Coordenação sigam a Permissão de cada Agente e virem Aprovação quando for o caso, para que a Coordenação nunca aja sozinha sobre uma Integração (ADR 0004).
18. Como usuário, quero que o fio do composer continue lá quando eu abrir um Agente e voltar, até recarregar a página.

### Página do Agente
19. Como usuário, quero abrir um Agente e navegar pelas sub-abas Conversa, Memória, Habilidades, Rotinas, Canais, Configuração e Atividade, para ter tudo sobre aquele Agente num só lugar.
20. Como usuário, quero ver no topo da página do Agente o nome, a Especialidade e uma descrição curta do que ele entrega, para lembrar para que ele serve.

### Conversa
21. Como usuário, quero ver sugestões clicáveis na Conversa de cada Agente, para disparar as tarefas mais comuns sem digitar.
22. Como usuário, quero ver a resposta do Agente aparecer com efeito de digitação, para sentir que ele está produzindo aquilo agora.
23. Como usuário, quero ver na Conversa as chamadas de ferramenta que o Agente fez (ex.: "consultando HubSpot", "buscando no Apollo"), para confiar de onde vem a informação.
24. Como usuário, quero que as respostas dos Agentes venham em parágrafos curtos e listas, para ler sem cansar.
25. Como usuário, quero pedir ao Scopus o ICP da Databricks e a aderência de uma Conta-alvo real (ex.: OpenAI) ao ICP, para priorizar contas.
26. Como usuário, quero pedir ao Ethos as personas do Comitê de compra de uma Conta-alvo, com dores, objeções, gatilhos e onde se informam, para preparar a abordagem.
27. Como usuário, quero pedir ao Rhetor um e-mail frio ou uma sequência para uma persona específica, no tom da marca, para ganhar tempo na escrita.
28. Como usuário, quero pedir ao Oraculum uma auditoria de como a Databricks aparece no ChatGPT, Perplexity, Gemini e Claude para prompts-alvo, com recomendações de conteúdo, para melhorar a presença da marca em IA.
29. Como usuário, quero digitar texto livre na Conversa e receber uma resposta plausível, para que a demo não quebre quando alguém fugir do roteiro.
30. Como usuário, quero copiar uma resposta do Agente, para usá-la fora da Althius.

### Menção e Colaboração
31. Como usuário, quero @mencionar outro Agente dentro de uma Conversa (ex.: "@Ethos complementa isso"), para trazê-lo para o trabalho sem trocar de tela.
32. Como usuário, quero ver um autocompletar de Agentes quando digito @, incluindo os Agentes criados pelo nome completo, para mencionar o Agente certo. "@Scopus" chama o Agente padrão.
33. Como usuário, quero ver o repasse entre Agentes (Scopus → Ethos → Rhetor) com cartões que mostram o que cada um passou para o próximo, para entender a Colaboração.
34. Como apresentador, quero um roteiro de Colaboração que começa no Scopus, passa pelo Ethos, termina no Rhetor e gera uma Aprovação no Slack, para demonstrar a cadeia inteira em poucos minutos.

### Memória
35. Como usuário, quero ver a Memória de um Agente como uma lista de fatos aprendidos, para saber o que ele já sabe sobre a minha empresa e sobre mim.
36. Como usuário, quero ver a origem de cada fato (ex.: "aprendido na Conversa de 12/09"), para confiar e auditar.
37. Como usuário, quero editar ou apagar um fato da Memória, para corrigir o que o Agente aprendeu errado.

### Habilidades
38. Como usuário, quero ver as Habilidades que o Agente criou ou refinou com o uso, com descrição, número de usos e data da última melhoria, para entender como ele está evoluindo.
39. Como usuário, quero ativar ou desativar uma Habilidade, para controlar como o Agente trabalha.

### Rotinas
40. Como usuário, quero ver as Rotinas agendadas de um Agente (ex.: "toda segunda às 9h, o Oraculum audita a marca nos LLMs e posta no Slack"), para saber o que ele faz sozinho.
41. Como usuário, quero criar, editar, pausar e excluir uma Rotina (frequência, horário, tarefa, Canal de destino), para automatizar trabalho recorrente.

### Atividade
42. Como usuário, quero ver a linha do tempo de tudo que o Agente fez, com gatilho (Conversa, Menção, Coordenação, Rotina, Canal), resultado e link, para acompanhar o que aconteceu enquanto eu não estava olhando.
43. Como gestor, quero filtrar a Atividade por gatilho, para entender de onde vem o trabalho dos Agentes.

### Configuração (Personalização)
44. Como usuário, quero adicionar instruções ao Agente, somadas ao comportamento base da Especialidade, para adaptá-lo à minha empresa.
45. Como usuário, quero definir o tom de voz do Agente (principalmente Rhetor e Oraculum), para que o conteúdo soe como a minha marca.
46. Como usuário, quero adicionar documentos, URLs e páginas do Notion à base de conhecimento do Agente, para que ele trabalhe com o contexto certo.
47. Como usuário, quero escolher em quais Canais o Agente atende, para decidir onde ele pode ser chamado.

### Conexões, Canais e Integrações
48. Como usuário, quero uma tela de Conexões dentro da aba de Agentes, dividida em Canais e Integrações, para conectar cada ferramenta uma vez para todo o Workspace.
49. Como usuário, quero conectar Slack, WhatsApp, Microsoft Teams e E-mail por um fluxo simulado de "Conectar", para ver como seria ativar um Canal.
50. Como usuário, quero ver a prévia de uma conversa real num Canal (ex.: uma thread do Slack com o Agente respondendo a uma @menção), para entender como é falar com o Agente fora da Althius.
51. Como usuário, quero conectar HubSpot, Clay, Apollo, Lusha, Notion, Meta Ads e Google Ads por um fluxo simulado, para ver de onde os Agentes leem e para onde escrevem.
52. Como gestor, quero ver o catálogo de Integrações organizado por categoria, com espaço para novas integrações no futuro, para saber o que existe e o que vem.

### Ferramentas e Permissões
53. Como gestor, quero ver na sub-aba de Configuração de cada Agente quais Integrações ele pode usar, com o mapeamento padrão da Especialidade já preenchido, para controlar o alcance de cada Agente.
54. Como gestor, quero definir a Permissão de cada Agente em cada Integração (Ler, Propor, Executar), para equilibrar autonomia e segurança.
55. Como gestor, quero que o padrão seja Ler em tudo e Propor em qualquer ação que escreve ou gasta dinheiro, para ligar os Agentes sem medo.

### Aprovações
56. Como usuário, quero uma fila de Aprovações na aba de Agentes com tudo que os Agentes propuseram, para decidir num só lugar.
57. Como usuário, quero ver em cada Aprovação o Agente, a ação, a Integração afetada, o impacto (ex.: verba) e a justificativa, para decidir com contexto.
58. Como usuário, quero aprovar ou rejeitar uma proposta, e ver o resultado na Atividade, para fechar o ciclo.
59. Como usuário, quero ver que a mesma Aprovação pode ser dada dentro do Canal de onde o pedido saiu (botões na thread do Slack), para não precisar abrir a Althius.

### Demo, marca e aparência
60. Como apresentador, quero um selo discreto "Demonstração" sempre visível, para que ninguém confunda a demo com um uso real da Databricks.
61. Como apresentador, quero que as Contas-alvo sejam empresas reais e as pessoas dos Comitês de compra tenham cargos reais e nomes fictícios, para ter realismo sem expor pessoas.
62. Como usuário, quero alternar entre tema escuro (padrão) e claro no menu do usuário, para usar o que me for mais confortável.
63. Como apresentador, quero que tudo siga o Manual da Marca (cores, Oswald, raio 0 em botões e campos, 16px em cartões, foco rosa visível, pulso no lugar de spinner, rosa e laranja em no máximo 10% da tela), para que a demo seja reconhecivelmente Althius.
64. Como usuário, quero toda a interface em pt-BR, com ICP e GEO mantidos como siglas, para usar o produto na minha língua.
65. Como usuário, quero navegar pelo teclado com foco sempre visível, para usar o app sem mouse.

## Implementation Decisions

- **Onde fica:** um app novo, isolado, na pasta `projeto-althius-frontend` na raiz do repositório.
- **Stack:** React + TypeScript + Tailwind + shadcn/ui, com Vite (só front-end, sem servidor). Roda localmente. Só desktop.
- **Uma única fronteira de dados: a fonte de dados dos agentes.** Toda tela lê e escreve só por essa interface. A única implementação agora é a **simulada**, que carrega os dados da demo em JSON e toca os roteiros da Conversa e da Coordenação. Uma implementação real vai substituí-la no futuro sem mudar as telas (ADR 0003). A interface cobre:
  - Workspace (Cliente da demo, contagem de Aprovações pendentes);
  - Especialidades (o catálogo fixo);
  - Agentes (listar, detalhar, criar a partir de uma Especialidade, excluir um Agente criado);
  - Memória (listar, editar, apagar);
  - Habilidades (listar, ativar/desativar);
  - Rotinas (listar, criar, editar, pausar, excluir);
  - Atividade (listar, com filtro por gatilho);
  - Configuração (ler e salvar a Personalização);
  - Conexões (listar e conectar Canais e Integrações);
  - Permissões (ler e definir por Agente × Integração);
  - Aprovações (listar, aprovar, rejeitar);
  - Conversa com um Agente (enviar mensagem ou sugestão e receber uma resposta em fluxo, com passos de ferramenta, Menções e repasses de Colaboração);
  - Conversa coordenada (enviar um pedido no composer e receber em fluxo os passos da Coordenação, um por Agente chamado, e a resposta consolidada).
- **Estado:** as mudanças feitas na demo (aprovar, editar memória, trocar permissão, criar ou excluir Agente, o fio do composer) valem até recarregar a página. Não há persistência entre sessões.
- **Especialidades e Agentes** (ADR 0005): o catálogo tem 4 Especialidades fixas (Scopus, Ethos, Rhetor, Oraculum). Todo Workspace tem um Agente padrão por Especialidade, com o nome dela, que não pode ser excluído. O Cliente cria Agentes a partir de uma Especialidade, com nome "Especialidade · complemento"; o complemento é definido na criação e não é editado depois. O Agente criado começa com uma cópia da Personalização, das Permissões e das Habilidades do Agente padrão, com Memória vazia e sem Rotinas. A Personalização cobre instruções, tom de voz, base de conhecimento, ferramentas e permissões, e canais; não inclui renomear. Cobrança e planos estão fora deste escopo.
- **Criação de Agente:** o botão "Novo agente" na barra de topo abre um formulário simulado com a Especialidade (os 4 cartões), o complemento do nome e instruções opcionais. Ao criar, o Agente entra na grade e a página dele abre.
- **Coordenação** (ADR 0004): o composer abre uma Conversa coordenada, em que a LLM da plataforma, sem nome e sem ser um Agente, divide o pedido entre os Agentes necessários e junta as respostas. Um Agente @mencionado é sempre incluído. Quando precisa de uma Especialidade, a Coordenação chama o Agente padrão, a menos que o pedido mencione um Agente criado. Uma pergunta genérica é respondida direto, sem passos. A Coordenação não usa Integrações: quem age são os Agentes, cada um com a sua Permissão, e o trabalho de cada Agente chamado entra na Atividade dele com o gatilho Coordenação. A Coordenação existe só no composer; nos Canais continua sendo preciso @mencionar um Agente.
- **Conversa simulada:** cada Agente padrão tem 2 roteiros acionados por sugestões clicáveis, e existe 1 roteiro de Colaboração (Scopus → Ethos → Rhetor → Aprovação no Slack). Uma mensagem de texto livre recebe uma resposta genérica plausível do Agente atual; um Agente criado usa os roteiros e a resposta genérica da sua Especialidade. Cada resposta é uma sequência de passos (chamada de ferramenta, texto, repasse, proposta de Aprovação), exibidos com efeito de digitação. Isso vale **só para o protótipo**: o produto real precisa responder de forma robusta a qualquer entrada.
- **Coordenação simulada:** 4 casos roteirizados:
  - "Monte a abordagem completa para a OpenAI": Scopus → Ethos → Rhetor, terminando numa Aprovação no HubSpot;
  - "Como estamos no Perplexity e o que publicar?": Oraculum e Rhetor;
  - texto livre sem @: a resposta genérica, direta, sem chamar Agentes;
  - texto livre com @Agente: esse Agente responde com a resposta genérica dele.
- **Permissões** (ADR 0002): Ler, Propor ou Executar, por Agente × Integração. O padrão é Ler, e Propor para ações que escrevem ou gastam.
- **Mapeamento padrão de Integrações por Especialidade** (os Agentes criados herdam o do Agente padrão):
  - Scopus → HubSpot, Clay, Apollo, Lusha
  - Ethos → HubSpot, Apollo, Lusha, Notion
  - Rhetor → HubSpot, Notion, Meta Ads, Google Ads
  - Oraculum → Notion, Google Ads e busca nos LLMs (ChatGPT, Perplexity, Gemini, Claude) como ferramenta nativa
- **Canais:** Slack, WhatsApp, Microsoft Teams, E-mail. Cada um tem um fluxo simulado de conectar e uma prévia de conversa; a do Slack inclui botões de Aprovação.
- **Dados da demo:**
  - Workspace da Databricks e Contas-alvo reais (ex.: OpenAI, Meta, Stripe, Anthropic), só com informação pública;
  - 9 Agentes: os 4 padrão e 5 criados (Scopus · Enterprise LATAM, Ethos · Comitê financeiro, Rhetor · Sequências outbound, Rhetor · Anúncios Meta, Oraculum · Concorrência Snowflake);
  - pessoas dos Comitês de compra com cargos reais e nomes fictícios;
  - conteúdo gerado em pt-BR;
  - selo "Demonstração" sempre visível.
- **Layout da página de Agentes**, no molde da tela de agentes do Frontrunner, com a identidade do Manual da Marca:
  - barra de topo com o título "Agentes" e o botão "Novo agente";
  - grade de 3 colunas com os cartões dos Agentes: ícone da Especialidade num quadro, nome e selo de estado (com o pulso ou o ponto rosa); descrição (a da Especialidade no Agente padrão, as instruções no Agente criado), em até 2 linhas; e um rodapé numa linha só, com quando roda (ícone de calendário na Rotina, de clique em "Sob demanda"), o número de execuções (ícone de repetição) e os logos das Integrações;
  - abaixo da grade, o composer e as sugestões clicáveis de pedidos coordenados;
  - **a resposta do composer abre na página da Conversa** (decidido no mock do ticket 02, versão B). Enquanto a Conversa coordenada existe, a página de Agentes mostra um aviso "Conversa coordenada em andamento" com o pedido e o botão "Abrir conversa";
  - não há painel de métricas, barra de comando, atalho Ctrl/Cmd+K nem busca.
- **Composer** (validado no mock): uma superfície única e arredondada (raio de 24px, exceção aprovada ao raio 0 dos campos), com borda sutil. O campo começa com uma linha e cresce com a mensagem até cerca de 280px, e só então rola; o rótulo fica só para leitores de tela e o texto de ajuda vai no placeholder. Na faixa de baixo, dentro do composer, ficam o chip do Workspace e os ícones das Especialidades em pílulas discretas; no canto inferior direito, o botão Enviar em pílula, apagado enquanto o campo está vazio. O @ abre o autocompletar de Agentes. O composer de continuar o fio, na página da Conversa, é o mesmo, só com o chip do Workspace.
- **Página da Conversa coordenada** (validada no mock): barra de topo com "Agentes / Conversa" e "Voltar para a grade"; uma coluna de leitura de cerca de 720px, sem caixas, com o composer fixo no rodapé. Em sequência:
  - o pedido do usuário, alinhado à direita;
  - "Coordenação · N agentes chamados" e os Agentes chamados como etapas compactas de uma mesma execução, ligadas por uma linha vertical sutil. A etapa ativa mostra o nome, a Especialidade, o pulso e "Trabalhando", e as consultas vão aparecendo; ao concluir, mostra o que o Agente fez e recolhe as consultas numa linha "N consultas", que abre de novo com um clique;
  - a resposta consolidada, que surge aos poucos logo abaixo das etapas, como a resposta principal;
  - quando há uma, a Aprovação como o próximo item da conversa, sem cartão nem linha de alerta: uma linha discreta com o Agente, o logo e o nome da Integração e "Aprovação pendente", a ação, o impacto e os botões Aprovar e Rejeitar.
- **Casca do app:** sidebar com o seletor do Workspace e o selo "Demonstração", a seção **Especialistas** (os 4 Agentes padrão, com o pulso ou o ponto rosa quando for o caso), a seção **Workspace** (Agentes, Aprovações com o número de pendentes, Conexões) e o usuário no rodapé, com a troca de tema. Cada página tem uma barra de topo com o título. A aba de Agentes é o único módulo: os outros módulos do Revenue OS não aparecem na sidebar por enquanto.
- **Identidade visual:** Manual da Marca v2.0.
  - **Tokens do tema escuro:** fundo `#131313`, superfície `#212121`, linha `#353535`, texto `#F4F4F4`, texto secundário `#8E8E8E`, destaque `#F7054F`, destaque 2 `#FD6D1F`, gradiente de 100° (rosa de 0% a 45%, laranja em 100%).
  - **Tokens do tema claro**, derivados das páginas claras do manual: fundo `#F4F4F4`, cartão `#FFFFFF`, linha `#C1C1C1`, texto `#131313`, texto secundário `#8E8E8E`.
  - **Cores funcionais:** sucesso `#2E7D5B`, atenção `#C79A1F`, erro `#C0392B`.
  - **Espaçamento** na escala de 4 (4, 8, 16, 24, 40, 64, 96, 128). Raio 0 em botões e campos, 16px em cartões. Anel de foco rosa de 2px com 3px de afastamento.
  - **Tipografia:** Oswald para tudo. Títulos em 200/300, rótulos em 400 maiúsculo com entreletra de 0,18em, texto corrido em 300 com entrelinha 1,6. Indie Flower só em anotações, nunca em rótulo, botão ou dado.
  - **Proibido escrever valor cru:** toda cor e todo espaçamento vêm de um token. Os componentes do shadcn são ajustados para esses tokens.
- **Ícones:** Lucide provisoriamente, em grafite/osso, com cor só quando o estado exige, um ícone por papel em toda a interface (navegação, ações, gatilhos, contadores). Serão trocados pelo set desenhado à mão da marca quando chegarem os vetores. A exceção são os **logos das Integrações** nos cartões dos Agentes e nas Aprovações: logos oficiais, com 16px, nas cores da própria marca (ADR 0003 permite marcas reais na demo). Só aparece o logo de uma Integração que o Agente de fato usa.
- **Identidade dos Agentes:** nenhum avatar de personagem. Cada Especialidade tem um ícone, e seus Agentes usam esse ícone mais o nome em Oswald: Scopus → alvo/ICP, Ethos → decisor, Rhetor → pena, Oraculum → olho. O pulso (anéis) indica "trabalhando", e o ponto rosa indica "detectou algo".
- **Logo:** o arquivo-mestre é o do site. Até chegar o HTML do site, um placeholder (Λ + ponto + ALTHIUS) respeita as proporções do manual.
- **Idioma:** interface só em pt-BR, com os termos do glossário (Especialidade, Agente padrão, Agente criado, Coordenação, Comitê de compra, Habilidade, Conversa, Conexão, Canal, Integração, Permissão, Aprovação). ICP e GEO ficam como siglas.

## Testing Decisions

- **Um bom teste** verifica o comportamento visível pelo usuário: o que aparece na tela depois de uma ação. Nunca testa estado interno, nomes de componentes ou detalhes de implementação.
- **Uma única camada de teste:** o app inteiro renderizado sobre a fonte de dados simulada, dirigido como um usuário faria (clicar, digitar, usar o teclado). Não há teste de componente isolado.
- **Ferramentas:** Vitest + Testing Library (ambiente jsdom), rodando no terminal.
- **Cobertura mínima:**
  - a grade mostra os 9 Agentes, com estado, quando roda e execuções;
  - criar um Agente a partir de uma Especialidade o coloca na grade e abre a página dele, com a Personalização copiada do padrão e a Memória vazia;
  - excluir um Agente criado o tira da grade; o Agente padrão não oferece exclusão;
  - não existe opção de renomear Agente nem de criar Especialidade;
  - um pedido coordenado mostra os passos de cada Agente chamado e a resposta consolidada, e o roteiro da OpenAI termina numa Aprovação;
  - uma @menção no composer inclui o Agente mencionado; texto livre sem @ recebe resposta direta, sem passos;
  - o fio do composer continua depois de abrir um Agente e voltar;
  - o trabalho de um Agente chamado na Coordenação aparece na Atividade dele com o gatilho Coordenação;
  - cada sub-aba do Agente abre e mostra seus dados;
  - uma sugestão na Conversa produz a resposta roteirizada com os passos de ferramenta;
  - texto livre na Conversa recebe resposta genérica;
  - @menção na Conversa aciona o Agente certo, inclusive um Agente criado pelo nome completo;
  - o roteiro de Colaboração termina numa Aprovação;
  - aprovar ou rejeitar atualiza a fila e a Atividade;
  - editar ou apagar Memória, ativar Habilidade, criar ou pausar Rotina;
  - trocar uma Permissão persiste na sessão;
  - conectar um Canal ou uma Integração muda o estado;
  - a troca de tema funciona.

## Out of Scope

- Agentes reais, qualquer chamada de LLM ou de API externa, e back-end.
- Autenticação, múltiplos usuários e múltiplos Workspaces.
- Persistência entre sessões.
- Renomear Agentes, editar o complemento do nome depois de criado e criar Especialidades.
- Criar Agente pelo composer (ex.: "crie um agente de ICP para enterprise").
- Coordenação nos Canais, e a Coordenação escolher um Agente criado pelo contexto do pedido.
- Histórico de Conversas coordenadas anteriores.
- Planos, cobrança e bloqueio de Especialidades por plano.
- Outros módulos do Revenue OS, incluindo a Temperatura de conta (Fogo/Brasa/Gelo), que pertence a outra parte do app. Eles também não aparecem na sidebar por enquanto.
- Mobile e telas responsivas abaixo de desktop.
- Outros idiomas além do pt-BR.
- Deploy (roda só localmente).
- O set de ícones desenhados à mão e o logo vetorial oficial.

## Further Notes

- **Glossário:** usar os termos do `CONTEXT.md` na raiz.
- **Decisões relacionadas:** ADR 0002 (Permissões Ler/Propor/Executar), ADR 0003 (protótipo simulado com marcas reais), ADR 0004 (Coordenação sem um 5º Agente), ADR 0005 (Agentes criados a partir de Especialidades, que substitui o ADR 0001).
- **Referência de layout:** a tela de agentes do Frontrunner (grade de cartões com estado, gatilho, execuções e logos, e um composer de IA), aplicada com a identidade do Manual da Marca. O layout da página de Agentes, o composer e a Conversa coordenada foram validados num mock (ticket 02), guardado no branch `prototipo/pagina-de-agentes`.
- **Pendência:** o HTML do site da Althius, a ser enviado pelo fundador, para extrair o logo e a referência visual.
- **Princípios de marca que guiam decisões ambíguas:** "na dúvida, escolha a opção mais silenciosa"; "a marca grita o dado, não o adjetivo"; cor é sinal (no máximo 10% da tela).
