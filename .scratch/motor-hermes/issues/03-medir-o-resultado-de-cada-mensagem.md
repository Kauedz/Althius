# 03: Medir o resultado de cada mensagem enviada

**What to build:** cada Envio de passo guarda o desfecho observado, por canal e variante: sem resposta, resposta,
resposta positiva, reunião marcada e, quando houver, oportunidade. É o dado que diz o que funciona num segmento.

**Blocked by:** None. Depende dos Envios que já existem (canais-04) e cresce com WhatsApp e LinkedIn (canais-06/07).

**Status:** ready-for-agent

- [ ] O desfecho é registrado por Envio, com quem classificou (pessoa ou Agente) e quando.
- [ ] Resposta negativa não conta como sucesso.
- [ ] O Workspace vê as taxas por abordagem, canal e segmento das próprias Sequências.
- [ ] Nada disso sai do Workspace (a camada coletiva é o ticket 05).
