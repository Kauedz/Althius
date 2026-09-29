# 01: Fornecedores da cascata

**What to build:** a lista ordenada de fornecedores de dados da Althius (actors do Apify de LinkedIn e da Receita Federal primeiro; fornecedores pagos depois), cada um com o que devolve e o custo, e o contrato único que a cascata chama.

**Blocked by:** None.

**Status:** needs-info (falta o Nan escolher os fornecedores pagos além do Apify)

## Pode mexer

- Um módulo de cascata em `supabase/functions/_shared/`, com cada fornecedor por injeção de dependência.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] A cascata para no primeiro que acha; cada tentativa tem custo registrado.
- [ ] Dado vindo de fornecedor grava a Origem do campo (CONTEXT) e não sobrescreve correção manual.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Escolher e contratar os fornecedores pagos de e-mail e telefone; as chaves vão só nos segredos do Supabase.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
