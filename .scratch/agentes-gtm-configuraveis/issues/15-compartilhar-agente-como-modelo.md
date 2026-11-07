# 15: Compartilhar Agente como Modelo com a equipe

**What to build:** Um usuário disponibiliza a configuração de um Agente seu como Modelo para a equipe do Workspace; um colega cria a partir dele um Agente independente, sem receber Conversas, Memória ou acessos de quem compartilhou.

**Blocked by:** 14.

**Status:** ready-for-agent

**Referência:** spec `../spec.md`, user stories 31–34.

## Critérios de aceite

- [ ] O dono escolhe explicitamente o que é compartilhado (configuração reutilizável); referências privadas que dariam acesso indevido ficam de fora.
- [ ] Só participantes do mesmo Workspace com acesso operacional veem e usam o Modelo compartilhado.
- [ ] A cópia do destinatário não leva Conversas, Memória, credenciais, autorizações nem Rotinas ativas.
- [ ] Mudanças posteriores no Agente de origem não alteram cópias já criadas.
- [ ] Repetir o compartilhamento ou a cópia não duplica.

## Pode mexer

Persistência e operações de compartilhar Modelo (aditivas), controles existentes do Agente e da biblioteca (textos e estados), Fonte de Agentes.

## Não mexa

Marketplace ou publicação fora do Workspace, layout.

## Passos do Nan

- Aplicar a migration no remoto seguindo `docs/agents/migrations.md`.

## Validação

pgTAP: compartilhamento restrito ao Workspace, cópia sem vazamento, independência após mudança na origem. Testes da raiz do app: compartilhar e criar a partir do compartilhado.
