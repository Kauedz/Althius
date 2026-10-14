# Spec: Fila de entrada nas Sequências

**Status:** ready-for-human (código neste PR; a migração fica com o Kauê; sem deploy e sem merge)

**Frente:** Execução. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md).
O ritmo que esta fila completa está em [`.scratch/canais-cadencia-backend/issues/18-ritmo-de-envio.md`](../canais-cadencia-backend/issues/18-ritmo-de-envio.md).

## Problema

O teto de WhatsApp contava pessoa (`whatsapp_new_contact`), não empresa. Várias pessoas da mesma Conta no mesmo dia
gastavam várias vagas. Não havia fila para o dia seguinte, nem aquecimento de remetente novo, nem um número na tela.

## Solução

A entrada na Sequência passa a ser contada pela Conta (`target_account_id`) e pelo remetente. O kind novo é
`whatsapp_new_company`, com o equivalente `email_new_company` e `linkedin_new_company`. Várias pessoas da mesma Conta,
no mesmo dia e pelo mesmo remetente, ocupam uma vaga. Quem já entrou por aquele remetente não ocupa outra.

O padrão da plataforma é 20 a 25 por dia, sorteado uma vez por remetente e por dia. O teto do Workspace é a soma dos
remetentes conectados e prontos, então cresce com os assentos. O que passa do teto fica agendado para o próximo dia
útil, na ordem de chegada, com a Conta Quente na frente. Nada é cancelado nem apagado.

Remetente novo, pela data de `sender_accounts.created_at` (a mesma linha sobrevive à reconexão), começa em 5 por dia e
sobe até o padrão em 14 dias. A tabela `private.send_warmup_ramp` é o lugar de editar a rampa.

A tela mostra "X de Y hoje" e "N na fila para amanhã" em Configurações, nas Contas remetentes, e no topo da Sequência
do responsável. O administrador muda o teto do Workspace pelo `set_send_cap` que já existe: o número que ele grava
substitui a faixa sorteada.

## Decisões

- A fila só corre com o ritmo ligado (`private.send_rate_enabled`). Desligado, o horário dos passos não muda, como no
  ticket do ritmo. Ligar continua sendo passo do Kauê, se ainda estiver desligado.
- E-mail e LinkedIn usam a mesma faixa 20–25 e a mesma rampa do WhatsApp. O teto de mensagem e de convite que já
  existia continua valendo por cima. O administrador fixa outro número com `set_send_cap`.
- "X" é a quantidade de Contas admitidas hoje (já enviadas ou reservadas para hoje), não só as já enviadas.
- "N na fila para amanhã" é o próximo dia útil (na sexta, a segunda). O texto da tela permanece "para amanhã".
- Conta Quente é o estágio `quente` do kanban. Na hora em que ela entra, passa na frente de quem não está Quente.
  Uma vaga que abre depois não puxa de volta quem já foi para o dia seguinte.
- A rampa usa a idade em dias de `sender_accounts.created_at` (a linha sobrevive à reconexão). Dia 0 é 5; o dia 13 chega a 25. Um dia de negócio anterior à criação não tem degrau: vale a faixa do dia.
- `set_send_cap` com nulo continua sendo "sem limite", também durante o aquecimento.
- O sorteio do dia fica gravado. A rampa é aplicada na leitura, então uma migração futura pode editar os dias.

## Fora de escopo

- Código de conector (Unipile, `sender-accounts`, `unipile-account-status`, `_shared/unipile`, HubSpot, Pipedrive, Notion).
- Segredos, deploy, aplicar a migração no remoto e merge.
- Tela nova de administração do teto: o RPC `set_send_cap` basta, como no ritmo.
- Pedido de sinal de bloqueio do WhatsApp (fica com o Renan).

## Testes

- pgTAP: contagem por Conta, rampa, fila com Conta Quente, soma dos remetentes prontos, a cota que a tela lê.
- Vitest: o texto "X de Y hoje" e "N na fila para amanhã" na Conta remetente e no bloco do topo da Sequência.
