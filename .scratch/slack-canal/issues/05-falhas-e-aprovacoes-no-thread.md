# 05: Falhas e Aprovações chegam ao thread

Spec: [../spec.md](../spec.md) (seção "Entrega da resposta no thread"; US 38–41). 

**What to build:** quando a Execução de um fio falha (sem Créditos, sem contrato ativo, erro do Agente, expirada por prazo), o thread recebe uma falha clara com o motivo humano, nunca uma resposta inventada. Quando o Agente propõe uma ação com a Permissão Propor, a Aprovação vai para a fila da Althius com o gatilho Canal e o thread avisa que ela aguarda lá, sem botões no Slack. Se o Canal foi retirado entre o pedido e a entrega, nada é postado e a Execução só é marcada como entregue.

**GATE:** sem migration se o gatilho do 03 já cobrir estados de falha e expiração (se faltar, uma migration aditiva com pgTAP); sem deploy e sem aplicar no remoto; Aprovação decidida no Slack fica fora.

**Blocked by:** 03 (Abrir um fio e o Agente responde no thread).

**Status:** ready-for-human (código pronto; falta o Nan aplicar as migrations e publicar as funções)

## Pode mexer

- a função de entrega e os testes dela
- se necessário, uma migration aditiva com pgTAP para a Aprovação guardar o gatilho Canal ou para o gatilho cobrir a expiração

## Não mexa

- a função de eventos, `agent-conversation`, `_hermes-worker`, `_shared/executor-de-aprovacoes.ts`
- frontend
- testes existentes

## Critérios

- [ ] Execução sem Créditos, sem contrato e com erro do Agente: cada uma posta uma falha com o motivo humano certo
- [ ] Execução expirada por prazo também é postada como falha
- [ ] Aprovação pedida pela Execução fica na fila com o gatilho Canal e o thread diz que ela aguarda na Althius
- [ ] Canal retirado antes da entrega: nada postado, Execução marcada
- [ ] Cada Execução é postada uma vez só
- [ ] lint, `deno test`, `deno check` (e pgTAP do zero, se houver migration) verdes

## Passos do Nan

- Republicar a função de entrega (e aplicar a migration, se houver)
- No Slack de teste: pedir ao Agente uma ação com Permissão Propor e conferir a Aprovação na fila e o aviso no thread
