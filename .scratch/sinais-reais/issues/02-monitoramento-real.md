# 02: Monitoramento real grava Sinais

**What to build:** um Monitoramento configurado roda o actor sobre as Contas do público dele, transforma o resultado em Sinais (com data, fonte e evidência), não repete o mesmo acontecimento e deixa a Conta Quente por 30 dias (ADR-0007).

**Blocked by:** 01: Registro de actors; `creditos-e-planos` 02 e 03 (saldo e teto).

**Status:** ready-for-agent

## Pode mexer

- Migration aditiva com Sinais reais, Monitoramentos reais e o agendamento (pg_cron + pg_net, padrão do `sequence-runner`).
- A Edge Function `signal-scan`.
- A Fonte de Sinais real no frontend, trocando a `criarFonteDeSinaisIndisponivel`.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar um ticket daqui avisa o Nan.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] Mesmo acontecimento não conta duas vezes nem renova o prazo.
- [ ] Automático só roda dentro do teto aprovado.
- [ ] Cada Conta varrida debita 1 crédito.
- [ ] O foguinho mostra os Sinais válidos da Conta.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar `signal-scan` e rodar `select private.configure_...` do agendamento, se o ticket criar um.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.
