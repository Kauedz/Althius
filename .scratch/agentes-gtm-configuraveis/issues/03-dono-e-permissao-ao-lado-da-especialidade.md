# 03: Dono do Agente e Permissão ao lado da Especialidade

**What to build:** O Agente passa a ter um dono dentro do Workspace e existe uma regra de autorização por Permissão que pode substituir a pergunta "esse Agente é de tal Especialidade?". É a etapa de expansão da troca: nada muda para o usuário e nada antigo quebra.

**Blocked by:** 01 (ADR-0035); spec `contexto-da-empresa` na `main`.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, Implementation Decisions sobre titularidade, isolamento entre usuários e dependências de Especialidade.

## Critérios de aceite

- [ ] Todo Agente pode ter um dono (Conta de usuário com Participação no Workspace). Agentes existentes ficam sem dono e continuam sob o acesso de hoje (acesso legado), sem apagar nem copiar dados.
- [ ] Existe uma regra única no servidor que responde se um Agente pode usar uma capacidade (por exemplo, propor Sequência) a partir da Permissão e da autorização, sem olhar a Especialidade. Ela ainda não é usada pelas regras antigas.
- [ ] O nome do Agente pode ser livre para Agentes novos; os Agentes existentes mantêm o nome atual. A unicidade de nome continua por Workspace ou passa a ser por dono, conforme a ADR-0035.
- [ ] A Especialidade deixa de ser obrigatória para Agentes novos, sem mudar o comportamento dos que já existem.
- [ ] Isolamento: um usuário não lê conteúdo pessoal (Conversas, Memória, instruções) de Agente de outro dono; outro Workspace continua sem acesso a nada.
- [ ] Migration aditiva, com pgTAP próprio; nenhuma função compartilhada é redefinida a partir de definição antiga.

## Pode mexer

Persistência e funções de Agentes (aditivas), pgTAP novo, tipos da Fonte de Agentes apenas para refletir os novos campos.

## Não mexa

Regras de Sequência, ferramentas, worker, telas, composer, kanban.

## Passos do Nan

- Aplicar a migration no remoto seguindo `docs/agents/migrations.md` (o agente entrega os comandos PowerShell).

## Validação

pgTAP: dono e acesso legado, isolamento entre usuários e entre Workspaces, regra de capacidade por Permissão. Suítes existentes de Agentes, Conversas e Rotinas continuam verdes sem alteração.
