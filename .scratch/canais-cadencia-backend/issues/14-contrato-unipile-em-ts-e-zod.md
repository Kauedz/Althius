# 14: Contrato da Unipile em TypeScript e Zod

**What to build:** um módulo novo, `supabase/functions/_shared/unipile/`, que descreve em tipos e em schemas Zod tudo o que a Althius troca com a Unipile nas duas versões: a configuração de uma conexão, os pedidos, as respostas, os eventos de webhook e os erros. Nada muda no comportamento: os adaptadores de hoje passam a validar o que recebem por esses schemas, e uma resposta que não bate vira erro tipado em vez de campo lido solto.

**Blocked by:** [ADR-0024](../../../docs/adr/0024-contratos-v1-e-v2-da-unipile-e-troca-de-conta-sem-perder-historico.md) aceita (PR #157 mergeado).

**Status:** ready-for-agent

- [ ] Zod entra como dependência com versão fixada, só neste módulo. Nenhum outro arquivo do repositório importa Zod por causa deste ticket.
- [ ] Schema da configuração de uma conexão: `base_url`, `api_version` (`v1` ou `v2`), nome dos segredos da chave e do webhook. A chave em si nunca faz parte do schema nem aparece em mensagem de erro ou em log.
- [ ] Schemas de pedido e de resposta, por versão, para o que a Althius já usa: criar link de conexão, listar contas, desconectar, enviar e-mail, abrir chat, responder no chat, convidar no LinkedIn, resolver perfil, listar mensagens de um chat. A v2 vem do que o código já faz. A v1 vem do mapa do protótipo (`.scratch/handoffs/unipile-port-map.md`, §1.3).
- [ ] Schema da união canônica de eventos de webhook (mensagem, e-mail, relação, estado da conta, conexão, ignorar com motivo), com os motivos de descarte do mapa (§1.5). A tradução v2 e v1 para essa união é do canais-17; aqui entra só o formato e o parse da v2 que já existe.
- [ ] Todo campo "não confirmado" (`users_ids`, `is_sender`, `sender_id` e os da v1) é `optional()` e leva um comentário com o motivo e o que conferir no primeiro envio real, em vez de `firstString` espalhado.
- [ ] Erros tipados: recusa definitiva (4xx, exceto 408 e 429), resultado incerto (5xx, 408, 429, rede, resposta ilegível) e configuração ausente. A regra "incerto nunca reenvia sozinho" fica no tipo, e o motivo classificado de `classifyProviderError` passa a vir daqui.
- [ ] Deno: cada schema tem um teste com uma resposta de exemplo válida e uma inválida, por versão. Os testes dos adaptadores atuais (`send-step`, `send-chat-step`, `send-chat-step-adapters`, `unipile-account-status`) continuam passando sem mudar de asserção.
- [ ] `deno check` de todas as funções limpo, e a suíte `deno test supabase/functions` sem regressão.

## Pode mexer

- `supabase/functions/_shared/unipile/` (novo) e o arquivo de dependências do Deno, só para fixar a versão do Zod.
- `supabase/functions/_shared/send-step-adapters.ts`, `send-chat-step-adapters.ts` e `unipile-account-status/handler.ts`: só para validar a leitura pelos schemas. A decisão de negócio fica onde está.

## Não mexa

- Migrations, banco, RPCs e `private.chat_message_fields`.
- Onde a chave e a base moram: isso é do canais-15 e do canais-16. Aqui as bases e as variáveis `UNIPILE_*` continuam como estão.
- O frontend e qualquer arquivo fora de `supabase/functions/`.
- Regra de envio, de bloqueio e de privacidade dos canais fechados (03 a 07).

## Migration

Nenhuma.

## Passos do Nan

Nenhum.

## Comments
