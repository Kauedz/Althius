# 04: Debitar as Execuções de Agentes

**What to build:** cada chamada de Agente reserva e debita créditos pelo contrato do ticket 02; sem saldo, a Execução falha com o motivo "saldo insuficiente", sem resposta inventada.

**Blocked by:** 02: Saldo e lançamentos; `agentes-em-conversa` 02.

**Status:** ready-for-agent

## Pode mexer

- `_shared/orquestracao.ts` e o `claim`/`finish` das Execuções, só para reservar e debitar.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Um Agente por rodada = um débito; chave de IA do cliente = 20%.
- [ ] Sem saldo: falha com motivo claro.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Publicar a ponte e reiniciar o worker do Hermes.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
