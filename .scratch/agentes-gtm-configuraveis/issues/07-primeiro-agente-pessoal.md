# 07: Primeiro Agente pessoal, com nome livre

**What to build:** Todo usuário elegível encontra um Agente seu já pronto na grade de Agentes, pode renomeá-lo e atribuir qualquer função de GTM; entrar de novo não cria outro, e os Agentes que já existem continuam acessíveis.

**Blocked by:** 03.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, user stories 1–3, 12, 13, 38–41.

## Critérios de aceite

- [ ] Um usuário com acesso operacional, ao entrar, tem um primeiro Agente de que é dono. Reentradas e recarregar a página não duplicam esse Agente.
- [ ] O usuário renomeia o Agente com qualquer nome e define função e instruções pelos controles existentes. O nome não é identidade técnica nem fica fixado.
- [ ] A grade de Agentes mostra os Agentes do usuário e, enquanto existirem, os Agentes legados do Workspace, sem redesenho.
- [ ] Conversas, Memória e configurações existentes continuam visíveis para quem as via hoje; nada é apagado nem replicado para outro usuário.
- [ ] Observador e Demonstração continuam com as restrições atuais; a Demonstração não cria Agente real.
- [ ] A tela inicial não vira uma experiência de agente único.

## Pode mexer

Criação do primeiro Agente no servidor, renomear Agente, Fonte de Agentes, grade e configuração do Agente (só textos e estados).

## Não mexa

Composer e kanban (ticket 06), criação pela tela (ticket 08), Modelos (ticket 14), layout.

## Passos do Nan

- Aplicar a migration no remoto seguindo `docs/agents/migrations.md`.

## Validação

pgTAP: primeiro Agente idempotente, dono, renomear, isolamento entre usuários, acesso legado. Testes da raiz do app: o primeiro Agente aparece, renomear persiste entre sessões. Conferência visual da grade a 1400×900 e 360px com prints em `issues/prints/`, comparada com a grade de antes.
