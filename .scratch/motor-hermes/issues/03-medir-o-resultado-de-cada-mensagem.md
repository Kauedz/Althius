# 03: Medir o resultado de cada mensagem enviada

**What to build:** cada Envio de passo guarda o desfecho observado, por canal e variante: sem resposta, resposta,
resposta positiva, reunião marcada e, quando houver, oportunidade. É o dado que diz o que funciona num segmento.

**Blocked by:** None. Depende dos Envios que já existem (canais-04) e cresce com WhatsApp e LinkedIn (canais-06/07).

**Status:** closed

- [x] O desfecho é registrado por Envio, com quem classificou (pessoa ou Agente) e quando.
- [x] Resposta negativa não conta como sucesso.
- [x] O Workspace vê as taxas por abordagem, canal e segmento das próprias Sequências. — Tabela "Resultado dos envios" em Sequências, com as vistas Segmento e Abordagem (`resultado-dos-envios.tsx`); `send_outcome_rates` e `send_outcome_rates_by_approach`.
- [x] Nada disso sai do Workspace (a camada coletiva é o ticket 05).

## Comments

- Migration `20261001100000_resultado_de_cada_envio.sql`, aditiva. `private.send_outcomes` guarda um desfecho por Envio (resposta, resposta_positiva, resposta_negativa, reuniao_marcada, oportunidade) com quem classificou (sistema, pessoa ou Agente) e quando. "Sem resposta" não tem linha: é o Envio enviado sem desfecho.
- A resposta recebida (`private.received_emails`) registra "resposta" sozinha, pelo sistema, sem rebaixar um desfecho já classificado. `public.set_send_outcome` é da pessoa dona da Sequência; `public.classify_send_outcome` é só do servidor, com o id de um Agente do mesmo Workspace.
- `public.send_outcome_rates(workspace)` devolve, por canal e segmento da Conta, quantos Envios saíram, quantos tiveram resposta, positiva (positiva, reunião ou oportunidade), reunião e oportunidade. Só números; todo Participante ativo lê. Negativa só conta como resposta.
- pgTAP `supabase/tests/resultado_de_cada_envio.sql` (19).
- **Tela (2026-10-01):** em Sequências, abaixo da lista, a tabela "Resultado dos envios" mostra por canal e segmento os enviados, % de resposta, % de positiva, reuniões e oportunidades, lendo `send_outcome_rates`. A Demonstração traz um exemplo; sem Envios, nada aparece.
- **Classificar na tela (2026-10-01):** no detalhe da Sequência, o passo de E-mail enviado mostra "Resultado:" com o desfecho registrado (ou "Sem resposta"); o titular escolhe Resposta recebida, positiva, negativa, reunião marcada ou oportunidade (`set_send_outcome`). Migration `20261001110000_desfechos_da_sequencia.sql` acrescenta `public.list_send_outcomes(sequência)`, só do titular; pgTAP `desfechos_da_sequencia.sql` (4).
- **Abordagem (decisão do Nan, 2026-10-01): o título do passo.** Migration `20261001120000_taxas_por_abordagem.sql` (`public.send_outcome_rates_by_approach`): o título vem do documento da Sequência pelo id do passo; sem título vira "Sem título"; é o título de agora (renomear junta o histórico sob o nome novo). pgTAP `taxas_por_abordagem.sql` (4).
- **Aberto (fora do ticket):** (1) reunião marcada e oportunidade ainda são ditas à mão, sem ligar ao Kanban ou ao CRM; (2) WhatsApp e LinkedIn entram junto com o ciclo real deles (canais 06 e 07), porque a tabela de Envios hoje só tem e-mail.

## Passos do Nan

1. Aplicar a migration (a IA a aplica após o CI verde, a pedido do Nan); conferir com `git checkout main`, `git pull` e `npx supabase db push` só se quiser reaplicar do zero.

## Decisões a confirmar

- ~~O que é "abordagem" no dado~~: decidido, o título do passo.
- Quem pode classificar: hoje só a pessoa dona da Sequência ou um Agente do Workspace; um Administrador não classifica Sequência alheia.
