# 04: Continuar o fio e as recusas dentro dele

Spec: [../spec.md](../spec.md) (seção "Do evento à decisão" item 3; US 22–27). Decisões: Q13, Q19, Q20.

**What to build:** dentro de um thread que já é um fio, o dono continua escrevendo sem mencionar ninguém e o mesmo Agente responde no thread lembrando o que já foi dito, porque é a mesma Conversa. Outra pessoa que escreve no thread recebe "este fio é a Conversa de @dono", com a dica de abrir o próprio fio em outro thread ou no DM. O dono que menciona outro Agente no thread recebe "este fio é do Agente X; para falar com outro, abra outro thread". Uma mensagem enviada enquanto o Agente ainda responde recebe "ainda respondendo". As recusas não criam Execução nem gastam Crédito.

**GATE:** sem migration se a RPC do 03 já cobrir a continuação e o "ocupado" (se faltar algo, uma migration aditiva com pgTAP); sem deploy e sem aplicar no remoto.

**Blocked by:** 03 (Abrir um fio e o Agente responde no thread).

**Status:** ready-for-human (código pronto; falta o Nan aplicar as migrations e publicar as funções)

## Pode mexer

- a função de eventos do Slack e os testes dela
- se necessário, uma migration aditiva com pgTAP para ler o fio por chave ou ajustar a RPC do 03 (redefinida a partir da última definição na `main`)

## Não mexa

- a função de entrega, `agent-conversation`, `_hermes-worker`
- frontend
- testes existentes

## Critérios

- [x] No thread de canal, a resposta do dono sem @ (nem ao bot) continua a Conversa com o Agente do fio
- [x] No thread do DM, o mesmo
- [x] O Agente recebe o histórico da Conversa (lembra o que foi dito antes)
- [x] Outra pessoa no thread recebe a recusa com o nome do dono e a dica de abrir o próprio fio
- [x] O dono mencionando outro Agente no thread recebe a recusa com o nome do Agente do fio
- [x] Mensagem com Execução aberta no fio recebe "ainda respondendo" e não é perdida em silêncio
- [x] Mensagem de canal fora de thread mapeado e sem menção ao bot é ignorada sem resposta
- [ ] lint, `deno test`, `deno check` (e pgTAP do zero, se houver migration) verdes — lint, `deno test` e `deno check` verdes; o pgTAP novo (`supabase/tests/leitura_do_fio_do_canal_slack.sql`) só roda no CI, sem Postgres local

## Passos do Nan

- Republicar a função de eventos (e aplicar a migration, se houver)
- No Slack de teste: continuar um fio sem @, escrever no fio com outra conta, mencionar outro Agente no fio, e mandar duas mensagens seguidas; conferir as respostas

## Comments

- Implementado em `3c0cc09`. Migration aditiva `20261026100000_leitura_do_fio_do_canal_slack` (`slack_channel_thread`: dono e Agente do fio pela chave). Falta: pgTAP verde no CI e os Passos do Nan.
- A recusa a outra pessoa traz o nome do dono na Althius, não um @ do Slack: o fio não guarda o id do dono no Slack.
