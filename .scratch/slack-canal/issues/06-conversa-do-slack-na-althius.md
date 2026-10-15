# 06: A Conversa do Slack aparece na Althius

Spec: [../spec.md](../spec.md) (seções "Fio e Conversa" e "Frontend"; US 28–30). Decisão: Q15.

**What to build:** a Conversa que nasceu no Slack aparece na lista de Conversas de quem mencionou, e só dele, com uma marca de origem Slack. Ao abrir, ela mostra os passos como qualquer Conversa, mas o composer fica desabilitado com "Esta Conversa continua no Slack". A Demonstração continua simulada e intocada.

**GATE:** uma migration só, aditiva, com pgTAP, que redefine as RPCs de listagem de Conversas a partir da definição mais recente da `main` para devolver a origem; sem aplicar no remoto; só ícones de `lucide-react` e componentes existentes; sem emojis; pt-BR. Conferência visual em navegador é trabalho do agente (`docs/agents/triage-labels.md`).

**Blocked by:** 03 (Abrir um fio e o Agente responde no thread).

**Status:** ready-for-agent

## Pode mexer

- migration nova redefinindo as RPCs de listagem de Conversas para devolver a origem, e o pgTAP dela
- `projeto-althius-frontend/src/fonte/supabase-conversas.ts`, `conversas-tipos.ts`
- a tela de Conversa (`paginas/secoes/conversa.tsx`) e a lista de Conversas, com testes Vitest novos

## Não mexa

- funções do Slack, `agent-conversation`, `_hermes-worker`
- a Demonstração (`simulada-*`, `dados-demo`)
- testes existentes

## Critérios

- [ ] As RPCs de listagem devolvem a origem; Conversas antigas vêm como Althius
- [ ] A Conversa do Slack aparece só para o dono (pgTAP com outro participante do mesmo Workspace)
- [ ] A lista e a Conversa mostram a marca de origem Slack
- [ ] O composer fica desabilitado com "Esta Conversa continua no Slack"
- [ ] Conversas de origem Althius não mudam
- [ ] Prints em `.scratch/slack-canal/issues/prints/06-*.jpg` linkados nos Comments
- [ ] lint, `tsc -b`, vitest e pgTAP do zero verdes

## Passos do Nan

- Aplicar a migration conforme `docs/agents/migrations.md`
- Depois do deploy do frontend: abrir na Althius uma Conversa criada pelo Slack de teste e conferir a marca e o composer desabilitado
