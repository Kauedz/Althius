# 08: Chave de IA do cliente no Workspace

**What to build:** no setup, a Althius liga ao Workspace a chave de API do provedor de IA que o cliente preferir (ex.: Claude); a chave fica cifrada no Vault do Supabase, nunca no navegador; as Execuções desse Workspace usam esse modelo e gastam 20% do crédito.

**Blocked by:** 04: Debitar as Execuções de Agentes.

**Status:** ready-for-agent

## Pode mexer

- Migration aditiva com a referência ao segredo no Vault por Workspace e a função de serviço que a lê.
- A orquestração e o worker, para escolher o modelo por Workspace.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] A chave nunca volta ao navegador nem aparece em log.
- [ ] Sem chave válida, a Execução falha com motivo claro.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Cadastrar a chave do cliente no Vault pelo painel do Supabase, durante o setup (nunca pelo chat).
2. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
