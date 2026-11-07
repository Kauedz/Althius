# 14: Biblioteca de Modelos de Agente

**What to build:** O usuário escolhe um Modelo de Agente com nome funcional (os quatro especialistas antigos viram modelos) e cria o seu Agente a partir dele, ajustando depois o que quiser.

**Blocked by:** 08.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, user stories 29, 30.

## Critérios de aceite

- [ ] Existe o conceito de Modelo de Agente, separado da instância pessoal e distinto de Modelo de Sinal.
- [ ] Scopus, Ethos, Rhetor e Oraculum ficam disponíveis como Modelos com nomes funcionais e a configuração que tinham (instruções, tom, ferramentas sugeridas).
- [ ] Criar a partir de um Modelo usa a operação única do ticket 08; o Agente começa com a configuração do Modelo, sem Memória, histórico, credenciais nem autorizações.
- [ ] O usuário altera o Agente depois sem mudar o Modelo.
- [ ] A biblioteca aparece nos controles existentes de criação de Agente, sem redesenho.

## Pode mexer

Persistência de Modelos (aditiva), operação de criar a partir de Modelo, diálogo de criação (textos e estados), Fonte de Agentes.

## Não mexa

Compartilhamento com a equipe (ticket 15), Modelos de Sinal, layout.

## Passos do Nan

- Aplicar a migration no remoto seguindo `docs/agents/migrations.md`.

## Validação

pgTAP: criar a partir de Modelo não leva Memória nem autorização. Testes da raiz do app: escolher Modelo, criar, ajustar. Conferência visual da biblioteca a 1400×900 com prints em `issues/prints/`.
