# 03: Abrir um fio e o Agente responde no thread

Spec: [../spec.md](../spec.md) (seções "Fio e Conversa", "Execução com gatilho Canal", "Entrega da resposta no thread"; US 11–13, 19–21, 36, 37, 42). Decisões: Q8, Q19, Q20, Q21.

**What to build:** o caminho feliz de ponta a ponta. Uma mensagem com exatamente um @Agente que atende no Slack, solta num canal (mencionando o bot) ou solta no DM com o bot, abre um fio: a Althius cria uma Conversa direta com aquele Agente cujo dono é quem mencionou, com origem Slack, grava o fio (`team_id` + canal + `thread_ts`, usando o `ts` da própria mensagem) e inicia uma Execução com gatilho Canal. O motor (ponte `agent-conversation` ou worker do Hermes) roda o pedido como qualquer outro. Quando a Execução termina bem, um gatilho no banco chama a função de entrega, que posta a resposta uma vez só no thread da mensagem. A rodada gasta Créditos e segue as Permissões exatamente como uma Conversa na Althius.

**Decisões confirmadas pelo Nan (14/10/2026):** no DM, cada mensagem solta com @Agente abre um fio próprio respondido no thread dela, e uma nova mensagem solta com outro @Agente abre outro fio; o "Agente chama Agente" do PR-11 fica desligado nas Execuções do Canal: as Menções que o Agente escrever não puxam outro Agente para a rodada.

**GATE:** uma migration só, aditiva, com pgTAP; funções compartilhadas do banco redefinidas só a partir da definição mais recente da `main`; sem deploy e sem aplicar no remoto; nunca resposta inventada.

**Blocked by:** 02 (O bot ouve o Slack e responde sem chamar Agente).

**Status:** ready-for-human (código no `main` pelo PR #220; falta o Nan confirmar ou aplicar as migrations 20261027100000, 20261028100000 e 20261029100000 e publicar as funções)

## Pode mexer

- migration nova: `trigger_kind` aceita `canal` (ampliando o `check`); coluna aditiva de origem na Conversa (Althius ou Slack, padrão Althius); registro do fio único por chave, apontando para Conversa, dono e Agente; marca de entregue na Execução; RPC só para o service role que inicia a Execução em nome da Conta identificada (padrão de `begin_crm_handoff_by_agents`: confere Participação, contrato ADR-0025 e lista de canais; usa o `event_id` como `client_request_id`; recusa "ocupado" quando o fio já tem Execução aberta); gatilho que chama por `pg_net` a função de entrega quando uma Execução `canal` chega a estado final; e o pgTAP dela
- a função de eventos do 02 (abrir fio)
- Edge Function nova de entrega (sem JWT, autenticada por segredo interno) e testes Deno
- `_hermes-worker/worker.ts` e `agent-conversation` (runner/handler) só para não puxar Agente mencionado quando `trigger_kind = 'canal'`, com testes novos

## Não mexa

- o contrato com o banco (`claim_agent_run`, `append_agent_run_event`, `finish_agent_run`) além do necessário para a marca de entregue
- `main.ts` do worker, variáveis do VPS
- frontend (a origem aparece na Althius no ticket 06)
- testes existentes

## Critérios

- [ ] Mensagem solta no canal com @Althius e um @Agente válido abre o fio no `ts` dela e recebe a resposta no thread
- [ ] O mesmo no DM com o bot, sem @Althius
- [ ] A Conversa é `kind = 'agente'`, dono é quem mencionou, origem Slack
- [ ] A Execução tem `trigger_kind = 'canal'`, aparece na Atividade e cobra Créditos pela mesma regra da Conversa
- [ ] O mesmo `event_id` não cria duas Execuções
- [ ] A RPC só roda com service role; sem Participação, sem contrato ou com Agente fora da lista ela recusa
- [ ] O gatilho dispara só para `trigger_kind = 'canal'` e em estado final; a entrega posta uma vez só e marca entregue
- [ ] Menção escrita pelo Agente numa Execução `canal` não faz outro Agente falar
- [ ] lint, `tsc -b`, vitest, `deno test`, `deno check` e pgTAP do zero verdes

## Passos do Nan

- Gravar o segredo interno da entrega (no Vault e nos segredos da função)
- Publicar a função de entrega sem verificação de JWT e republicar a de eventos
- Republicar a `agent-conversation` e atualizar o worker do Hermes na VPS, se o ticket mexeu neles
- Aplicar a migration conforme `docs/agents/migrations.md`
- No Slack de teste: mencionar @Althius com @Scopus num canal e @Ethos no DM; conferir a resposta no thread e a Execução na Atividade
