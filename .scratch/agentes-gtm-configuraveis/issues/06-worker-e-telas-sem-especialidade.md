# 06: Worker e telas sem Especialidade

**What to build:** O Agente trabalha pela função e instruções que tem, não por uma persona de Especialidade; o composer sem @menção manda o pedido ao primeiro Agente do usuário; o cartão do kanban oferece o pedido ao Agente que o usuário escolher.

**Blocked by:** 03.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`; decisões de 07/11/2026 registradas na ADR-0035.

## Critérios de aceite

- [ ] As instruções que o worker monta para o Hermes partem do nome, da função e das instruções do Agente. Um Agente vindo de uma Especialidade mantém o comportamento atual por meio dessas instruções.
- [ ] O foco do Contexto da empresa por papel deixa de depender da Especialidade; o Agente lê o Contexto da empresa vigente e nunca o Playbook.
- [ ] No composer, um pedido sem @menção vai ao primeiro Agente do usuário. @menção continua mandando ao Agente mencionado. Dividir o pedido entre vários Agentes não é exigido.
- [ ] O cartão do kanban que hoje oferece "pedir ao Ethos" oferece o pedido ao Agente que o usuário escolher, com o primeiro Agente pré-selecionado.
- [ ] Layout, navegação e apresentação das ferramentas ficam iguais; só textos e estados mudam.
- [ ] A Demonstração continua simulada e pode manter os quatro nomes.

## Pode mexer

Montagem de instruções do worker, orquestração do composer, cartão do kanban, Fontes correspondentes.

## Não mexa

Regras do banco (tickets 04 e 05), ponte de ferramentas (ticket 10), layout.

## Validação

Testes do worker: as instruções enviadas ao Hermes contêm função e instruções do Agente e não dependem da Especialidade. Testes da raiz do app: composer sem menção vai ao primeiro Agente; cartão do kanban oferece a escolha. Conferência visual do composer e do cartão a 1400×900 com prints em `issues/prints/`.
