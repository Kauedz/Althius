# 09: Execuções, gatilho das ações e exclusão com Aprovações

**What to build:** três ajustes que ficaram pendentes na revisão da branch (tickets 01–08), só no protótipo: `src/fonte/` (interface, `simulada.ts`, dados da demo), a tela de exclusão e os testes. Nada de backend.

1. **Execuções que sobem.** O card mostra "N execuções", mas o número nunca muda depois que o Agente trabalha. Uma Execução (CONTEXT.md) é cada vez que o Agente é acionado e entrega um resultado. Cada item de Atividade passa a ter um tipo, `execucao` ou `acao`. Agir sozinho pela Permissão Executar e decidir uma Aprovação são `acao`. `Agente.execucoes` continua guardado e só sobe na função que registra um item `execucao`. Os números da demo não mudam.
2. **O gatilho é o que acionou o trabalho.** A Aprovação passa a guardar o `gatilho` da Execução que a propôs e mantém a `origem` (onde pode ser decidida). A decisão entra na Atividade como `acao`, com esse gatilho herdado. Hoje uma Aprovação criada pela Coordenação e decidida na Conversa ou na fila fica com gatilho Conversa (`simulada.ts`, `decidirAprovacao`). O lugar da decisão pode ir na descrição (ex.: "Aprovada na fila", "Aprovada no Slack").
3. **A exclusão avisa que tudo sai.** Excluir um Agente criado continua apagando tudo dele, inclusive as Aprovações pendentes e as decididas. O diálogo de confirmação passa a dizer que tudo será excluído, Aprovações inclusive. Se houver Aprovações pendentes, diz quantas serão canceladas (ex.: "2 Aprovações pendentes serão canceladas").

A página de Atividade não muda: o tipo serve só para a contagem.

**Blocked by:** nenhum

**Status:** ready-for-agent

- [x] Uma resposta numa Conversa direta aumenta em 1 as execuções do Agente
- [x] Uma Menção aumenta em 1 as execuções do Agente mencionado
- [x] Um pedido coordenado aumenta em 1 as execuções de cada Agente chamado; o "Executou: …" de um Agente com Executar entra como ação e não conta
- [x] Decidir uma Aprovação registra uma ação na Atividade e não muda as execuções
- [x] Uma Aprovação criada pela Coordenação, decidida na página da Conversa ou na fila de Aprovações, entra na Atividade com o gatilho Coordenação
- [x] Uma Aprovação criada numa Conversa direta ou num Canal mantém o gatilho de origem (Conversa ou Canal) ao ser decidida
- [x] O diálogo de exclusão diz que Memória, Habilidades, Rotinas, Atividade e Aprovações serão excluídas
- [x] Com Aprovações pendentes, o diálogo diz quantas serão canceladas; sem nenhuma, a frase não aparece
- [x] Depois da exclusão, as Aprovações do Agente somem da fila e a contagem de pendentes cai de acordo

## Comments

**Origem (23/09/2026):** achados da revisão de `0941f6c...HEAD`, decididos numa sessão de perguntas. O CONTEXT.md já tem a entrada **Execução** e os ajustes em **Atividade** e **Aprovação**. Sem ADR.

**Implementação (23/09/2026):** `ItemDeAtividade` ganhou `tipo` (`execucao` ou `acao`); na fonte simulada, `registrarExecucao` é o único lugar onde `Agente.execucoes` sobe, e `registrarAcao` registra o "Executou: …" da Permissão Executar e a decisão de uma Aprovação. A `Aprovacao` guarda o `gatilho` da Execução que a propôs (Conversa direta: `conversa`; Coordenação: `coordenacao`; na demo, a do Slack é `canal`). Para o lugar da decisão ir na descrição, `decidirAprovacao` passou a receber um `LugarDaDecisao` (`fila`, `conversa` ou o Canal) no lugar da `Origem`, que não separava a fila da página da Conversa: a Atividade mostra "Aprovada na fila: …", "Aprovada na Conversa: …" ou "Aprovada no Slack: …". O diálogo de exclusão lista Memória, Habilidades, Rotinas, Atividade e Aprovações e diz quantas Aprovações pendentes serão canceladas.

Fica de fora: no roteiro de Colaboração da Conversa direta (Scopus → Ethos → Rhetor), só o Agente da Conversa ganha uma Execução; os Agentes que recebem o repasse não. Isso já era assim antes deste ticket.
