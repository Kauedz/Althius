# 01: ADR-0035 e vocabulário dos Agentes pessoais

**What to build:** Registrar a decisão de trocar as quatro Especialidades por Agentes pessoais com nome livre e Modelos de Agente, para que todo ticket seguinte tenha uma regra escrita para seguir em vez de contradizer as ADRs vigentes.

**Blocked by:** Nenhum (pode começar imediatamente).

**Status:** ready-for-agent

**Referência:** spec `../spec.md` (Agentes pessoais e configuráveis para GTM), publicada em 07/11/2026.

## Critérios de aceite

- [ ] Existe a ADR-0035 dizendo o que mudou desde a ADR-0034 (31/10/2026) e por que Agentes pessoais são diferentes do "agente único" retirado: vários Agentes por usuário, nomes livres, tela inicial preservada.
- [ ] A ADR-0035 substitui por inteiro a ADR-0005; substitui na ADR-0004 a dependência das quatro Especialidades (a Coordenação continua sem nome, sem página e sem agir sobre Integrações); substitui as decisões 1, 2 e 5 da ADR-0034 e registra que as decisões 3, 4 e 7 continuam e que a 6 já foi substituída pela spec `contexto-da-empresa`.
- [ ] A ADR-0035 registra as decisões de 07/11/2026: sem @menção, o composer manda o pedido ao primeiro Agente do usuário; o cartão do kanban oferece o pedido ao Agente que o usuário escolher, com o primeiro Agente pré-selecionado.
- [ ] A ADR-0035 registra que propor Sequência passa a depender da Permissão e da autorização do Agente, não da Especialidade, encerrando a alternância entre as migrations que tiraram e devolveram a exigência do Rhetor.
- [ ] A ADR-0035 registra que a ADR-0032 não muda: Agente de Sinal e Agente de Contas continuam nomes de experiências, fora da grade de Agentes e da biblioteca.
- [ ] As ADRs 0004, 0005 e 0034 ganham uma linha de remissão à ADR-0035, sem reescrever o texto delas.
- [ ] O `CONTEXT.md` reflete as decisões: Especialidade vira histórico (Modelo de Agente de origem); Agente, Agente padrão (o primeiro Agente do usuário, renomeável) e Agente criado (nome livre) redefinidos; Modelo de Agente incluído e distinto de Modelo de Sinal; "modelo de agente" sai do _Avoid_ de Especialidade; o _Avoid_ de "agente de X" mantém as exceções da ADR-0032.
- [ ] O guia `docs/visao-geral-da-plataforma.md` aponta esta spec na camada Agentes.

## Pode mexer

`docs/adr/` (nova ADR-0035 e linhas de remissão), `CONTEXT.md`, a tabela de camadas do guia da plataforma.

## Não mexa

Código, migrations, testes, outras specs.

## Validação

Revisão de texto: cada decisão da seção Implementation Decisions da spec que toca ADR ou vocabulário aparece na ADR-0035 ou no `CONTEXT.md`, sem contradizer as ADRs que continuam valendo.
