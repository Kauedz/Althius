# 07: Composer com Coordenação

**What to build:** abaixo da grade, o usuário faz um pedido sem escolher um Agente e vê a Coordenação trabalhar (ADR 0004). O composer tem o campo grande (o @ abre o autocompletar de Agentes), uma linha com o chip do Workspace, os ícones das Especialidades e o botão Enviar, e sugestões clicáveis de pedidos coordenados. A Coordenação não tem nome nem página e não é um Agente: ela mostra cada Agente chamado como um passo, com o que ele fez, e no fim uma resposta consolidada. A resposta aparece onde o mock (ticket 02) decidiu.

Casos roteirizados deste ticket:
- **"Monte a abordagem completa para a OpenAI"**: Scopus → Ethos → Rhetor, terminando numa Aprovação no HubSpot proposta pelo Rhetor, porque a Permissão dele no HubSpot é Propor;
- **texto livre sem @**: resposta genérica direta, sem chamar nenhum Agente;
- **texto livre com @Agente**: esse Agente é incluído e responde com a resposta genérica dele. Um Agente criado mencionado pelo nome completo é chamado no lugar do padrão.

Quando precisa de uma Especialidade, a Coordenação chama o Agente padrão. Ela não usa Integrações: quem age são os Agentes, cada um com a sua Permissão, e o trabalho de cada Agente chamado entra na Atividade dele com o gatilho Coordenação. O fio do composer continua lá quando o usuário abre um Agente e volta, até recarregar a página.

**Blocked by:** 02 (Mock do layout da página de Agentes), 03 (Grade de Agentes e nova casca), 06 (Conversar com Agentes criados e mencioná-los)

**Status:** ready-for-agent

- [ ] A fonte de dados dos agentes oferece a Conversa coordenada, que devolve em fluxo os passos por Agente chamado e a resposta consolidada
- [ ] O pedido da OpenAI mostra os passos do Scopus, do Ethos e do Rhetor e a resposta consolidada, e termina numa Aprovação no HubSpot que aparece na fila de Aprovações
- [ ] Texto livre sem @ recebe resposta direta, sem passos de Agente
- [ ] Um @Agente no composer é sempre incluído, inclusive um Agente criado pelo nome completo
- [ ] O trabalho de cada Agente chamado aparece na Atividade dele com o gatilho Coordenação, e o filtro de Atividade oferece esse gatilho
- [ ] As sugestões clicáveis abaixo do composer disparam os pedidos coordenados
- [ ] O fio do composer continua depois de abrir um Agente e voltar
- [ ] A resposta aparece com efeito de digitação, e o "trabalhando" usa o pulso, não um spinner
