# 03: Medir o resultado de cada mensagem enviada

**What to build:** cada Envio de passo guarda o desfecho observado, por canal e variante: sem resposta, resposta,
resposta positiva, reunião marcada e, quando houver, oportunidade. É o dado que diz o que funciona num segmento.

**Blocked by:** None. Depende dos Envios que já existem (canais-04) e cresce com WhatsApp e LinkedIn (canais-06/07).

**Status:** ready-for-agent (backend pronto; faltam a tela das taxas e o dado de abordagem)

- [x] O desfecho é registrado por Envio, com quem classificou (pessoa ou Agente) e quando.
- [x] Resposta negativa não conta como sucesso.
- [ ] O Workspace vê as taxas por abordagem, canal e segmento das próprias Sequências.
- [x] Nada disso sai do Workspace (a camada coletiva é o ticket 05).

## Comments

- Migration `20261001100000_resultado_de_cada_envio.sql`, aditiva. `private.send_outcomes` guarda um desfecho por Envio (resposta, resposta_positiva, resposta_negativa, reuniao_marcada, oportunidade) com quem classificou (sistema, pessoa ou Agente) e quando. "Sem resposta" não tem linha: é o Envio enviado sem desfecho.
- A resposta recebida (`private.received_emails`) registra "resposta" sozinha, pelo sistema, sem rebaixar um desfecho já classificado. `public.set_send_outcome` é da pessoa dona da Sequência; `public.classify_send_outcome` é só do servidor, com o id de um Agente do mesmo Workspace.
- `public.send_outcome_rates(workspace)` devolve, por canal e segmento da Conta, quantos Envios saíram, quantos tiveram resposta, positiva (positiva, reunião ou oportunidade), reunião e oportunidade. Só números; todo Participante ativo lê. Negativa só conta como resposta.
- pgTAP `supabase/tests/resultado_de_cada_envio.sql` (19).
- **Aberto:** (1) a tela das taxas, no Workspace; (2) "abordagem": um passo não carrega variante, então não há como agrupar por abordagem; precisa de uma decisão (título do passo? um campo de variante?); (3) reunião marcada e oportunidade ainda são ditas à mão, sem ligar ao Kanban ou ao CRM; (4) WhatsApp e LinkedIn entram junto com o ciclo real deles (canais 06 e 07), porque a tabela de Envios hoje só tem e-mail.

## Passos do Nan

1. Aplicar a migration (a IA a aplica após o CI verde, a pedido do Nan); conferir com `git checkout main`, `git pull` e `npx supabase db push` só se quiser reaplicar do zero.

## Decisões a confirmar

- O que é "abordagem" no dado: o título do passo, um campo novo de variante ou outra coisa.
- Quem pode classificar: hoje só a pessoa dona da Sequência ou um Agente do Workspace; um Administrador não classifica Sequência alheia.
