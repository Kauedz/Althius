# Spec: Descadastro, variáveis e IA pelo Hermes na primeira Cadência de e-mail

**Status:** ready-for-human (código na branch `cadencia/descadastro-e-variaveis`; migrações, deploy e merge ficam com humano)

## Problema

A primeira Cadência de e-mail sai na semana de 2026-10-19 sem descadastro (sem link, sem List-Unsubscribe, sem
supressão), com variáveis sem valor saindo vazias, sem criação em lote de Sequências por Conta-alvo e com as Propostas
de resposta presas a chave de API.

## Solução

- Supressão por Workspace (`public.contact_suppressions`, e-mail ou domínio, RLS de leitura por Participação ativa).
- Token aleatório por Envio (`private.unsubscribe_tokens`), rodapé no corpo, `List-Unsubscribe` + `List-Unsubscribe-Post`
  (aceitos pela Unipile em `custom_headers`), Edge Function `descadastro` e página pública `/descadastro?t=` no app.
- A liberação do E-mail barra Contato suprimido (`contact_suppressed`, Envio cancelado) e variável sem valor
  (`missing_variable`, Envio aguardando reconfirmação com `missing_variable:<nomes>`).
- A resposta que pede para sair registra a Supressão (constraint trigger adiado em `private.received_emails`).
- `public.create_sequences_in_batch`: uma Sequência por Conta-alvo com a mesma Cadência (ADR-0009).
- `reply-proposal-runner` com provedor `hermes` pela fila de IA do worker (ADR-0018).

Tickets em `issues/`.
