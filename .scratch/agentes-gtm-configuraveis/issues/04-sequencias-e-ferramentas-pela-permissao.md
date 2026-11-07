# 04: Sequências e ferramentas pela Permissão

**What to build:** Um Agente que não é o Rhetor, mas tem Permissão e autorização, consegue propor e sugerir modelo de Sequência; e as ferramentas que cada Agente recebe passam a depender da Permissão e da autorização, não da Especialidade.

**Blocked by:** 03.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`; ADR-0035 (decisão sobre propor Sequência).

## Critérios de aceite

- [ ] As funções de propor e sugerir modelo de Sequência usam a regra de capacidade do ticket 03, partindo da definição mais recente na `main`. O Rhetor existente continua conseguindo tudo o que conseguia.
- [ ] Um Agente sem Permissão continua barrado, com mensagem que diz qual acesso falta.
- [ ] A lista de ferramentas de cada Agente vem da Permissão, da autorização e do acesso às Integrações; a descrição da função do Agente não concede nada.
- [ ] Aprovações, Créditos, Teto e autorizações específicas de Sequências continuam iguais.
- [ ] Gerar Sequência numa Conta-alvo continua funcionando de ponta a ponta.

## Pode mexer

Funções de Sequência (nova migration), seleção de ferramentas por Agente, testes novos.

## Não mexa

Demais regras do banco (ticket 05), personas do worker e telas (ticket 06), formato da ponte de ferramentas (ticket 10).

## Passos do Nan

- Aplicar a migration no remoto seguindo `docs/agents/migrations.md`.

## Validação

pgTAP novo: Agente com Permissão sem ser Rhetor propõe; Agente sem Permissão é barrado. Testes do worker com ferramentas e o teste de cadência ponta a ponta continuam verdes.
