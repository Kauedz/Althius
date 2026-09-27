# 06: Conversar com Agentes criados e mencioná-los

**What to build:** o usuário conversa com um Agente criado como conversa com um Agente padrão: as sugestões clicáveis disparam os roteiros da Especialidade dele, e texto livre recebe a resposta genérica da Especialidade, falando com o nome do próprio Agente criado. Na Conversa, digitar @ abre o autocompletar com todos os Agentes do Workspace, inclusive os criados pelo nome completo (ex.: "Scopus · Enterprise LATAM"). Mencionar um Agente criado pelo nome completo o traz para a Conversa; "@Scopus" continua chamando o Agente padrão. Esse reconhecimento de menção é o mesmo que o composer vai usar (ticket 07).

**Blocked by:** 03 (Grade de Agentes e nova casca)

**Status:** closed

- [x] Uma sugestão na Conversa de um Agente criado produz o roteiro da Especialidade dele, com os passos de ferramenta
- [x] Texto livre na Conversa de um Agente criado recebe a resposta genérica da Especialidade, em nome desse Agente
- [x] O autocompletar de @ lista os Agentes criados pelo nome completo e filtra enquanto se digita
- [x] "@Scopus · Enterprise LATAM" traz esse Agente criado para a Conversa; "@Scopus" traz o Agente padrão
- [x] O roteiro de Colaboração (Scopus → Ethos → Rhetor → Aprovação no Slack) continua funcionando
- [x] O trabalho do Agente mencionado entra na Atividade dele com o gatilho Menção

## Comments

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.
