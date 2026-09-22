# Spec: protótipo da aba de Agentes da Althius

## Problem Statement

A Althius é um Revenue OS: uma plataforma onde empresas B2B operam o go-to-market com agentes especialistas. O fundador precisa **mostrar** (para investidores, prospects e o próprio time) como vai ser a aba de Agentes, com tudo que ela vai fazer. Mas ainda não existe nenhuma tela, nenhuma identidade aplicada em produto e nenhuma forma de demonstrar o comportamento dos agentes: autonomia no estilo Hermes Agent, chamada por @menção no estilo Grok, memória, habilidades, rotinas, canais, integrações e aprovações. Sem um protótipo navegável, a visão do produto fica no discurso e não dá para validar o desenho da experiência.

## Solution

Um protótipo navegável, só front-end, da aba de Agentes, com dados simulados e fiel ao Manual da Marca Althius v2.0. Nele, qualquer pessoa pode:

- ver o painel da aba (aprovações pendentes, rotinas de hoje, atividade recente, horas economizadas) e a galeria com os 4 Agentes: **Scopus** (ICP), **Ethos** (Persona), **Rhetor** (escrita persuasiva) e **Oraculum** (GEO);
- abrir cada Agente e navegar por Conversa, Memória, Habilidades, Rotinas, Canais, Configuração e Atividade;
- disparar conversas roteirizadas, incluindo a Colaboração entre Agentes por @menção, a barra de comando global e uma aprovação no Slack;
- ver as Conexões (Canais e Integrações), as Permissões por Integração e a fila de Aprovações.

O workspace da demo é o da **Databricks**, com Contas-alvo reais, pessoas fictícias e o selo "Demonstração". Interface e conteúdo gerado ficam em pt-BR. O protótipo é só para desktop e tem tema escuro (padrão) e claro.

## User Stories

Os atores são: **usuário** (alguém de receita no Cliente: SDR, AE, marketing, RevOps), **gestor** (líder de receita do Cliente) e **apresentador** (o fundador conduzindo a demo).

### Painel e galeria
1. Como usuário, quero ver ao abrir a aba de Agentes um painel com aprovações pendentes, rotinas de hoje e atividade recente, para saber em segundos o que os agentes fizeram e o que depende de mim.
2. Como gestor, quero ver métricas por Agente (tarefas feitas, horas economizadas), para enxergar o valor que cada Agente entrega.
3. Como usuário, quero ver os 4 Agentes numa galeria abaixo do painel, cada um com nome, especialidade, ícone e estado atual, para escolher com qual quero trabalhar.
4. Como usuário, quero ver quando um Agente está trabalhando (o pulso) e quando ele detectou algo (o ponto rosa), para entender o que está acontecendo sem abrir o Agente.
5. Como apresentador, quero que os números do painel sejam exatos e plausíveis (nunca arredondados para cima), para respeitar o princípio "número honesto" da marca.

### Página do Agente
6. Como usuário, quero abrir um Agente e navegar pelas sub-abas Conversa, Memória, Habilidades, Rotinas, Canais, Configuração e Atividade, para ter tudo sobre aquele Agente num só lugar.
7. Como usuário, quero ver no topo da página do Agente o nome, a especialidade e uma descrição curta do que ele entrega, para lembrar para que ele serve.

### Conversa
8. Como usuário, quero ver sugestões clicáveis na Conversa de cada Agente, para disparar as tarefas mais comuns sem digitar.
9. Como usuário, quero ver a resposta do Agente aparecer com efeito de digitação, para sentir que ele está produzindo aquilo agora.
10. Como usuário, quero ver na Conversa as chamadas de ferramenta que o Agente fez (ex.: "consultando HubSpot", "buscando no Apollo"), para confiar de onde vem a informação.
11. Como usuário, quero que as respostas dos Agentes venham em parágrafos curtos e listas, para ler sem cansar.
12. Como usuário, quero pedir ao Scopus o ICP da Databricks e a aderência de uma Conta-alvo real (ex.: OpenAI) ao ICP, para priorizar contas.
13. Como usuário, quero pedir ao Ethos as personas do Comitê de compra de uma Conta-alvo, com dores, objeções, gatilhos e onde se informam, para preparar a abordagem.
14. Como usuário, quero pedir ao Rhetor um e-mail frio ou uma sequência para uma persona específica, no tom da marca, para ganhar tempo na escrita.
15. Como usuário, quero pedir ao Oraculum uma auditoria de como a Databricks aparece no ChatGPT, Perplexity, Gemini e Claude para prompts-alvo, com recomendações de conteúdo, para melhorar a presença da marca em IA.
16. Como usuário, quero digitar texto livre na Conversa e receber uma resposta plausível, para que a demo não quebre quando alguém fugir do roteiro.
17. Como usuário, quero copiar uma resposta do Agente, para usá-la fora da Althius.

### Menção e Colaboração
18. Como usuário, quero @mencionar outro Agente dentro de uma Conversa (ex.: "@Ethos complementa isso"), para trazê-lo para o trabalho sem trocar de tela.
19. Como usuário, quero ver um autocompletar de Agentes quando digito @, para mencionar o Agente certo.
20. Como usuário, quero abrir uma barra de comando global (Cmd+K / Ctrl+K) de qualquer tela da aba e @mencionar um Agente com um pedido, para acionar um Agente sem navegar até ele.
21. Como usuário, quero ver o repasse entre Agentes (Scopus → Ethos → Rhetor) com cartões que mostram o que cada um passou para o próximo, para entender a Colaboração.
22. Como apresentador, quero um roteiro de Colaboração que começa no Scopus, passa pelo Ethos, termina no Rhetor e gera uma Aprovação no Slack, para demonstrar a cadeia inteira em poucos minutos.

### Memória
23. Como usuário, quero ver a Memória de um Agente como uma lista de fatos aprendidos, para saber o que ele já sabe sobre a minha empresa e sobre mim.
24. Como usuário, quero ver a origem de cada fato (ex.: "aprendido na Conversa de 12/09"), para confiar e auditar.
25. Como usuário, quero editar ou apagar um fato da Memória, para corrigir o que o Agente aprendeu errado.

### Habilidades
26. Como usuário, quero ver as Habilidades que o Agente criou ou refinou com o uso, com descrição, número de usos e data da última melhoria, para entender como ele está evoluindo.
27. Como usuário, quero ativar ou desativar uma Habilidade, para controlar como o Agente trabalha.

### Rotinas
28. Como usuário, quero ver as Rotinas agendadas de um Agente (ex.: "toda segunda às 9h, o Oraculum audita a marca nos LLMs e posta no Slack"), para saber o que ele faz sozinho.
29. Como usuário, quero criar, editar, pausar e excluir uma Rotina (frequência, horário, tarefa, Canal de destino), para automatizar trabalho recorrente.

### Atividade
30. Como usuário, quero ver a linha do tempo de tudo que o Agente fez, com gatilho (Conversa, Menção, Rotina, Canal), resultado e link, para acompanhar o que aconteceu enquanto eu não estava olhando.
31. Como gestor, quero filtrar a Atividade por gatilho, para entender de onde vem o trabalho dos Agentes.

### Configuração (Personalização)
32. Como usuário, quero adicionar instruções ao Agente, somadas ao comportamento base, para adaptá-lo à minha empresa.
33. Como usuário, quero definir o tom de voz do Agente (principalmente Rhetor e Oraculum), para que o conteúdo soe como a minha marca.
34. Como usuário, quero adicionar documentos, URLs e páginas do Notion à base de conhecimento do Agente, para que ele trabalhe com o contexto certo.
35. Como usuário, quero escolher em quais Canais o Agente atende, para decidir onde ele pode ser chamado.
36. Como usuário, **não** quero conseguir renomear nem criar Agentes, porque os Agentes são produtos fixos da Althius.

### Conexões, Canais e Integrações
37. Como usuário, quero uma tela de Conexões dentro da aba de Agentes, dividida em Canais e Integrações, para conectar cada ferramenta uma vez para todo o Workspace.
38. Como usuário, quero conectar Slack, WhatsApp, Microsoft Teams e E-mail por um fluxo simulado de "Conectar", para ver como seria ativar um Canal.
39. Como usuário, quero ver a prévia de uma conversa real num Canal (ex.: uma thread do Slack com o Agente respondendo a uma @menção), para entender como é falar com o Agente fora da Althius.
40. Como usuário, quero conectar HubSpot, Clay, Apollo, Lusha, Notion, Meta Ads e Google Ads por um fluxo simulado, para ver de onde os Agentes leem e para onde escrevem.
41. Como gestor, quero ver o catálogo de Integrações organizado por categoria, com espaço para novas integrações no futuro, para saber o que existe e o que vem.

### Ferramentas e Permissões
42. Como gestor, quero ver na sub-aba de Configuração de cada Agente quais Integrações ele pode usar, com o mapeamento padrão já preenchido, para controlar o alcance de cada Agente.
43. Como gestor, quero definir a Permissão de cada Agente em cada Integração (Ler, Propor, Executar), para equilibrar autonomia e segurança.
44. Como gestor, quero que o padrão seja Ler em tudo e Propor em qualquer ação que escreve ou gasta dinheiro, para ligar os Agentes sem medo.

### Aprovações
45. Como usuário, quero uma fila de Aprovações na aba de Agentes com tudo que os Agentes propuseram, para decidir num só lugar.
46. Como usuário, quero ver em cada Aprovação o Agente, a ação, a Integração afetada, o impacto (ex.: verba) e a justificativa, para decidir com contexto.
47. Como usuário, quero aprovar ou rejeitar uma proposta, e ver o resultado na Atividade, para fechar o ciclo.
48. Como usuário, quero ver que a mesma Aprovação pode ser dada dentro do Canal de onde o pedido saiu (botões na thread do Slack), para não precisar abrir a Althius.

### Demo, marca e aparência
49. Como apresentador, quero um selo discreto "Demonstração" sempre visível, para que ninguém confunda a demo com um uso real da Databricks.
50. Como apresentador, quero que as Contas-alvo sejam empresas reais e as pessoas dos Comitês de compra tenham cargos reais e nomes fictícios, para ter realismo sem expor pessoas.
51. Como usuário, quero alternar entre tema escuro (padrão) e claro no menu do usuário, para usar o que me for mais confortável.
52. Como apresentador, quero que tudo siga o Manual da Marca (cores, Oswald, raio 0 em botões e campos, 16px em cartões, foco rosa visível, pulso no lugar de spinner, rosa e laranja em no máximo 10% da tela), para que a demo seja reconhecivelmente Althius.
53. Como usuário, quero toda a interface em pt-BR, com ICP e GEO mantidos como siglas, para usar o produto na minha língua.
54. Como usuário, quero navegar pelo teclado com foco sempre visível, para usar o app sem mouse.

## Implementation Decisions

- **Onde fica:** um app novo, isolado, na pasta `projeto-althius-frontend` na raiz do repositório.
- **Stack:** React + TypeScript + Tailwind + shadcn/ui, com Vite (só front-end, sem servidor). Roda localmente. Só desktop.
- **Uma única fronteira de dados: a fonte de dados dos agentes.** Toda tela lê e escreve só por essa interface. A única implementação agora é a **simulada**, que carrega os dados da demo em JSON e toca os roteiros da Conversa. Uma implementação real vai substituí-la no futuro sem mudar as telas (ADR 0003). A interface cobre:
  - Workspace (Cliente da demo, métricas do painel);
  - Agentes (lista e detalhe);
  - Memória (listar, editar, apagar);
  - Habilidades (listar, ativar/desativar);
  - Rotinas (listar, criar, editar, pausar, excluir);
  - Atividade (listar, com filtro por gatilho);
  - Configuração (ler e salvar a Personalização);
  - Conexões (listar e conectar Canais e Integrações);
  - Permissões (ler e definir por Agente × Integração);
  - Aprovações (listar, aprovar, rejeitar);
  - Conversa (enviar mensagem ou sugestão e receber uma resposta em fluxo, com passos de ferramenta, Menções e repasses de Colaboração).
- **Estado:** as mudanças feitas na demo (aprovar, editar memória, trocar permissão) valem até recarregar a página. Não há persistência entre sessões.
- **Conversa simulada:** cada Agente tem 2 roteiros acionados por sugestões clicáveis, e existe 1 roteiro de Colaboração (Scopus → Ethos → Rhetor → Aprovação no Slack). Uma mensagem de texto livre recebe uma resposta genérica plausível do Agente atual. Cada resposta é uma sequência de passos (chamada de ferramenta, texto, repasse, proposta de Aprovação), exibidos com efeito de digitação. Isso vale **só para o protótipo**: o produto real precisa responder de forma robusta a qualquer entrada.
- **Agentes são fixos** (ADR 0001): não existe "Criar agente" nem renomear. A Personalização cobre instruções, tom de voz, base de conhecimento, ferramentas e permissões, e canais. Cobrança e planos estão fora deste escopo, então a galeria mostra os 4 disponíveis, sem bloqueio.
- **Permissões** (ADR 0002): Ler, Propor ou Executar, por Agente × Integração. O padrão é Ler, e Propor para ações que escrevem ou gastam.
- **Mapeamento padrão de Integrações:**
  - Scopus → HubSpot, Clay, Apollo, Lusha
  - Ethos → HubSpot, Apollo, Lusha, Notion
  - Rhetor → HubSpot, Notion, Meta Ads, Google Ads
  - Oraculum → Notion, Google Ads e busca nos LLMs (ChatGPT, Perplexity, Gemini, Claude) como ferramenta nativa
- **Canais:** Slack, WhatsApp, Microsoft Teams, E-mail. Cada um tem um fluxo simulado de conectar e uma prévia de conversa; a do Slack inclui botões de Aprovação.
- **Dados da demo:**
  - Workspace da Databricks e Contas-alvo reais (ex.: OpenAI, Meta, Stripe, Anthropic), só com informação pública;
  - pessoas dos Comitês de compra com cargos reais e nomes fictícios;
  - conteúdo gerado em pt-BR;
  - selo "Demonstração" sempre visível.
- **Identidade visual:** Manual da Marca v2.0.
  - **Tokens do tema escuro:** fundo `#131313`, superfície `#212121`, linha `#353535`, texto `#F4F4F4`, texto secundário `#8E8E8E`, destaque `#F7054F`, destaque 2 `#FD6D1F`, gradiente de 100° (rosa de 0% a 45%, laranja em 100%).
  - **Tokens do tema claro**, derivados das páginas claras do manual: fundo `#F4F4F4`, cartão `#FFFFFF`, linha `#C1C1C1`, texto `#131313`, texto secundário `#8E8E8E`.
  - **Cores funcionais:** sucesso `#2E7D5B`, atenção `#C79A1F`, erro `#C0392B`.
  - **Espaçamento** na escala de 4 (4, 8, 16, 24, 40, 64, 96, 128). Raio 0 em botões e campos, 16px em cartões. Anel de foco rosa de 2px com 3px de afastamento.
  - **Tipografia:** Oswald para tudo. Títulos em 200/300, rótulos em 400 maiúsculo com entreletra de 0,18em, texto corrido em 300 com entrelinha 1,6. Indie Flower só em anotações, nunca em rótulo, botão ou dado.
  - **Proibido escrever valor cru:** toda cor e todo espaçamento vêm de um token. Os componentes do shadcn são ajustados para esses tokens.
- **Ícones:** Lucide provisoriamente, em grafite/osso, com cor só quando o estado exige. Serão trocados pelo set desenhado à mão da marca quando chegarem os vetores.
- **Identidade dos Agentes:** nenhum avatar de personagem. Cada Agente é um ícone mais o nome em Oswald: Scopus → alvo/ICP, Ethos → decisor, Rhetor → pena, Oraculum → olho. O pulso (anéis) indica "trabalhando", e o ponto rosa indica "detectou algo".
- **Logo:** o arquivo-mestre é o do site. Até chegar o HTML do site, um placeholder (Λ + ponto + ALTHIUS) respeita as proporções do manual.
- **Idioma:** interface só em pt-BR, com os termos do glossário (Comitê de compra, Habilidade, Conversa, Conexão, Canal, Integração, Permissão, Aprovação). ICP e GEO ficam como siglas.
- **Navegação:** a aba de Agentes é o único módulo. A casca do app pode mostrar a marca, o seletor de tema e o selo "Demonstração", mas nenhum outro módulo.

## Testing Decisions

- **Um bom teste** verifica o comportamento visível pelo usuário: o que aparece na tela depois de uma ação. Nunca testa estado interno, nomes de componentes ou detalhes de implementação.
- **Uma única camada de teste:** o app inteiro renderizado sobre a fonte de dados simulada, dirigido como um usuário faria (clicar, digitar, usar o teclado). Não há teste de componente isolado.
- **Ferramentas:** Vitest + Testing Library (ambiente jsdom), rodando no terminal.
- **Cobertura mínima:**
  - painel e galeria mostram os 4 Agentes e as métricas;
  - cada sub-aba do Agente abre e mostra seus dados;
  - uma sugestão na Conversa produz a resposta roteirizada com os passos de ferramenta;
  - texto livre recebe resposta genérica;
  - @menção no chat e Cmd+K acionam o Agente certo;
  - o roteiro de Colaboração termina numa Aprovação;
  - aprovar ou rejeitar atualiza a fila e a Atividade;
  - editar ou apagar Memória, ativar Habilidade, criar ou pausar Rotina;
  - trocar uma Permissão persiste na sessão;
  - conectar um Canal ou uma Integração muda o estado;
  - a troca de tema funciona;
  - não existe opção de criar ou renomear Agente.
- **Referências existentes:** nenhuma, porque o repositório não tem código ainda. Estes serão os primeiros testes.

## Out of Scope

- Agentes reais, qualquer chamada de LLM ou de API externa, e back-end.
- Autenticação, múltiplos usuários e múltiplos Workspaces.
- Persistência entre sessões.
- Criação e renomeação de Agentes.
- Planos, cobrança e bloqueio de Agentes por plano.
- Outros módulos do Revenue OS, incluindo a Temperatura de conta (Fogo/Brasa/Gelo), que pertence a outra parte do app.
- Mobile e telas responsivas abaixo de desktop.
- Outros idiomas além do pt-BR.
- Deploy (roda só localmente).
- O set de ícones desenhados à mão e o logo vetorial oficial.

## Further Notes

- **Glossário:** usar os termos do `CONTEXT.md` na raiz.
- **Decisões relacionadas:** ADR 0001 (Agentes fixos, sem criação pelo Cliente), ADR 0002 (Permissões Ler/Propor/Executar), ADR 0003 (protótipo simulado com marcas reais).
- **Pendência:** o HTML do site da Althius, a ser enviado pelo fundador, para extrair o logo e a referência visual.
- **Princípios de marca que guiam decisões ambíguas:** "na dúvida, escolha a opção mais silenciosa"; "a marca grita o dado, não o adjetivo"; cor é sinal (no máximo 10% da tela).
