# 07: Sessão única por usuário e termos de uso

**What to build:** entrar noutro computador encerra a sessão anterior; os termos de uso proíbem compartilhar acesso; os canais conectados continuam presos à pessoa.

**Blocked by:** None.

**Status:** wontfix (decisão do Nan, 2026-10-01: a sessão única não será implementada)

## Pode mexer

- A configuração de sessão do Supabase Auth (preparada pela IA, aplicada pelo Nan) ou um controle próprio de sessão ativa, se o plano do Supabase não oferecer.
- O texto dos termos (Auth-11, reaceite).

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Um segundo login do mesmo usuário encerra o primeiro.
- [ ] Termos atualizados pedem reaceite.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a configuração de sessão no painel do Supabase Auth (a IA prepara o passo a passo).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- 2026-10-01: o Nan decidiu não implementar a sessão única. O ticket fica fechado como `wontfix`.
