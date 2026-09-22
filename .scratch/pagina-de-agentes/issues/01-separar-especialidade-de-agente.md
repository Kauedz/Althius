# 01: Separar Especialidade de Agente

**What to build:** preparar o código para os Agentes criados (ADR 0005), sem mudar nada do que o usuário vê. Hoje o protótipo trata Agente e Especialidade como a mesma coisa: só existem 4 Agentes, e o identificador do Agente é o nome da Especialidade. Depois deste ticket, o catálogo fixo das 4 Especialidades (Scopus, Ethos, Rhetor, Oraculum) é um dado próprio da fonte de dados dos agentes, com a descrição, o que entrega, as ferramentas nativas, as sugestões da Conversa, os roteiros e o mapeamento padrão de Integrações. Cada Agente aponta para a sua Especialidade e é um Agente padrão ou um Agente criado, com um identificador aberto (não mais restrito aos 4 nomes). O ícone de um Agente vem da sua Especialidade. Memória, Habilidades, Rotinas, Atividade, Personalização, Permissões e Aprovações continuam ligadas ao Agente, não à Especialidade.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A fonte de dados dos agentes expõe o catálogo de Especialidades, e esse catálogo é fixo (não há operação para criar uma Especialidade)
- [ ] Cada Agente sabe a sua Especialidade e se é padrão ou criado; os 4 Agentes atuais são os Agentes padrão
- [ ] Os roteiros e a resposta genérica da Conversa são escolhidos pela Especialidade do Agente
- [ ] O ícone e o rótulo da Especialidade de um Agente vêm do catálogo
- [ ] Nada muda na tela: os testes de comportamento atuais passam sem alteração no que verificam
- [ ] Os tipos usam o vocabulário do `CONTEXT.md` (Especialidade, Agente padrão, Agente criado)
