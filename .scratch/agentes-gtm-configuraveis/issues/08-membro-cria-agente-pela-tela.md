# 08: Membro cria Agente pela tela

**What to build:** Qualquer Membro com acesso operacional cria um Agente pessoal em "Novo agente", com nome, função e instruções, sem precisar ser Administrador e sem ganhar poderes extras.

**Blocked by:** 07.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, user stories 4, 5, 8, 40, 41.

## Critérios de aceite

- [ ] Um Membro cria um Agente pela interface existente; o Agente aparece na grade, é dele e já recebe Conversa.
- [ ] Existe uma operação única de criação no servidor, que o ticket 13 reutiliza pela Conversa. O sucesso só é mostrado depois que o Agente está gravado.
- [ ] Repetir o envio (duplo clique, recarregar) não cria dois Agentes.
- [ ] Criar Agente não concede acesso a Integrações, poderes de Administrador nem decisão de Aprovações reservadas a outros papéis.
- [ ] Observador e Demonstração continuam sem criar Agente real.
- [ ] Apagar o próprio Agente continua possível; apagar Agente de outro dono não.

## Pode mexer

Operação de criação no servidor, diálogo "Novo agente" (campos e textos, sem redesenho), Fonte de Agentes, guarda de administração de Agentes no frontend.

## Não mexa

Modelos de Agente (ticket 14), ferramentas e worker.

## Passos do Nan

- Aplicar a migration no remoto seguindo `docs/agents/migrations.md`.

## Validação

pgTAP: Membro cria, Observador não cria, repetição não duplica, sem herança de permissão. Testes da raiz do app: criar pela tela, nome livre, persistência entre sessões. Conferência visual do diálogo a 1400×900 com prints em `issues/prints/`.
