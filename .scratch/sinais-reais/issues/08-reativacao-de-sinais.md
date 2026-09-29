# 08: Reativação de Sinais

**What to build:** uma varredura mensal automática revisita as Contas com Fit que esfriaram (sem Sinal válido), dentro do teto aprovado; na Conta, o botão "Buscar Sinais de novo" roda a varredura sob pedido, mostrando o custo antes.

**Blocked by:** 02: Monitoramento real; `creditos-e-planos` 03.

**Status:** ready-for-agent

## Pode mexer

- O agendamento da reativação e a ação na Conta.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar um ticket daqui avisa o Nan.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Só acontecimento novo reaquece; o mesmo acontecimento continua não contando.
- [ ] Sem teto aprovado, a reativação automática não roda.
- [ ] O botão mostra o custo em créditos antes de rodar.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
