# 03: Grade de Agentes e nova casca

**What to build:** ao abrir a aba de Agentes, o usuário vê só a grade com todos os Agentes do Workspace, no layout validado no mock, e uma sidebar nova. A grade tem 3 colunas e mostra os 9 Agentes da demo: os 4 Agentes padrão e os 5 Agentes criados (Scopus · Enterprise LATAM, Ethos · Comitê financeiro, Rhetor · Sequências outbound, Rhetor · Anúncios Meta, Oraculum · Concorrência Snowflake), cada um com os seus próprios dados de demo (Personalização, Permissões, Habilidades, Memória, Rotinas e Atividade coerentes com o uso). Cada cartão mostra o nome, o selo de estado (com o pulso quando trabalha e o ponto rosa quando detectou algo), a descrição (a da Especialidade no Agente padrão, as instruções no Agente criado), quando roda (a Rotina ativa ou "Sob demanda"), o número exato de execuções e os logos reais das Integrações que usa. Clicar num cartão abre a página do Agente, inclusive de um Agente criado.

Saem o painel de métricas (horas economizadas, rotinas de hoje, atividade recente), a barra de comando e o atalho Ctrl/Cmd+K. A casca passa a ter uma sidebar com o seletor do Workspace e o selo "Demonstração", a seção **Especialistas** (os 4 Agentes padrão), a seção **Workspace** (Agentes, Aprovações com o número de pendentes, Conexões) e o usuário no rodapé, com a troca de tema. Cada página tem uma barra de topo com o título; na página de Agentes, com o botão "Novo agente" (a ação dele chega no ticket 04).

**Blocked by:** 01 (Separar Especialidade de Agente), 02 (Mock do layout da página de Agentes)

**Status:** ready-for-agent

- [x] A grade mostra os 9 Agentes, com estado, descrição, quando roda, execuções e logos das Integrações
- [x] Os números são exatos e plausíveis, nunca arredondados para cima
- [x] Clicar num Agente criado abre a página dele, e todas as sub-abas mostram os dados dele
- [x] Não há painel de métricas, barra de comando, atalho Ctrl/Cmd+K nem busca
- [x] A sidebar tem o seletor do Workspace, o selo "Demonstração", Especialistas, Workspace (com o número de Aprovações pendentes) e o usuário no rodapé com a troca de tema
- [x] A contagem de Aprovações pendentes vem do Workspace na fonte de dados, não de um painel
- [x] Os testes antigos do painel e da barra de comando são trocados pelos da grade e da nova sidebar; a troca de tema continua testada
- [x] O layout segue o que foi escolhido no mock e o Manual da Marca
