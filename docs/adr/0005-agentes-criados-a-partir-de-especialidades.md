# Agentes criados pelo Cliente, a partir de Especialidades fixas

> Substituída pela [ADR-0033](0033-sinais-first.md) em 26/10/2026: as quatro Especialidades fixas saem do produto, e o Cliente deixa de criar Agentes a partir delas.

Substitui o ADR 0001. O Cliente passa a poder criar Agentes, mas só a partir de uma das 4 Especialidades do catálogo da Althius (Scopus, Ethos, Rhetor, Oraculum), e o nome do Agente criado é sempre "Especialidade · complemento" (ex.: "Scopus · Enterprise LATAM"). Assim o Cliente adapta Agentes a segmentos e usos próprios, e o catálogo continua fechado, com nomes estáveis, o que mantém aberta a porta de montar planos por Especialidade. Todo Workspace tem um Agente padrão por Especialidade, que não pode ser excluído.

## Considered Options

- Manter só os 4 Agentes fixos (ADR 0001): descartado, porque um único Agente por Especialidade não acomoda segmentos e usos diferentes no mesmo Workspace.
- Agente livre, descrito em linguagem natural e sem Especialidade: descartado, porque dilui o catálogo que sustenta os planos.
- Agente criado com nome livre: descartado, porque some a marca da Especialidade e o vínculo com o plano.
