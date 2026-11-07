# 17: A Especialidade deixa de ser regra

**What to build:** Terminar a troca: nenhuma regra do banco, do worker ou das telas decide mais pelo catálogo de Especialidades. É a etapa de contração depois que todos os pontos foram migrados.

**Blocked by:** 04, 05, 06, 13, 14.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`; ADR-0035.

## Critérios de aceite

- [ ] Uma busca no código e nas definições mais recentes do banco não encontra regra que dependa do catálogo de Especialidades, fora da Demonstração e do histórico do Modelo de origem.
- [ ] As restrições que impunham nome "Especialidade · complemento", um Agente padrão obrigatório por Especialidade e bloqueio de renomear deixam de valer, por migration aditiva.
- [ ] A coluna de Especialidade e os dados antigos continuam no banco, sem apagar linha.
- [ ] Os Agentes legados sem dono têm uma transição definida e registrada nos Comments (quem passa a ser dono ou como seguem compartilhados), sem perda de Conversas nem replicação indevida.
- [ ] Todas as suítes continuam verdes.

## Pode mexer

Migrations de contração (aditivas), restos de uso de Especialidade no worker e nas telas.

## Não mexa

Demonstração, dados legados (nada é apagado).

## Passos do Nan

- Aplicar a migration no remoto seguindo `docs/agents/migrations.md`.
- Aprovar a transição dos Agentes legados antes de aplicá-la.

## Validação

pgTAP novo: Agente sem Especialidade cria, renomeia e age com Permissão; dados antigos preservados. Busca registrada nos Comments.
