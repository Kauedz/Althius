# 20: Jornada mínima por E-mail ligada em produção (Executor + Unipile)

**What to build:** nada de código novo. O que os tickets 03, 04, 05 e 15 já entregaram passa a rodar em produção: a conexão Unipile ativa com os segredos no Vault, `sender-accounts`, `unipile-account-status`, `sequence-runner` e `sequence-step-sends` publicadas, o Executor agendado, e o Webhook Endpoint da v2 apontando para o projeto. No fim, uma Conta remetente de E-mail de teste conecta, um passo confirmado sai pelo Executor com o navegador fechado e a resposta pausa a Sequência.

**GATE:** sem migration nova; nenhuma chave no chat nem em arquivo versionado; destinatário de teste controlado pela equipe.

**Blocked by:** PR #227 em `main` (descadastro, variáveis, lote, Propostas pelo Hermes) e as migrations dele aplicadas.

**Status:** ready-for-human

**Quem faz:** Nan. **Esforço:** M. Item 1.12 da [fila de 2026-10-17](../../FILA-EXECUCAO-2026-10-17.md).

## Pode mexer

- configuração do projeto Supabase de produção (segredos, Vault, agendamento do Executor, deploy das Edge Functions)
- painel da Unipile (Webhook Endpoint, conta ativa)

## Não mexa

- código e migrations (o que faltar vira ticket novo)

## Critérios

- [ ] Conexão Unipile ativa cadastrada e ativada pelo fluxo do canais-15, com os segredos no Vault
- [ ] Edge Functions de envio e status publicadas na versão de `main`
- [ ] Executor agendado e rodando com o navegador fechado (canais-05)
- [ ] Webhook da Unipile entregando eventos de e-mail com HMAC válido (canais-04)
- [ ] Ciclo de teste: conectar a Conta remetente, confirmar um passo, receber o envio, responder e ver a Sequência pausada

## Passos do Nan

- Seguir `docs/agents/migrations.md` para as migrations do #227; publicar as funções; cadastrar e ativar a conexão Unipile; conferir o agendamento do Executor; rodar o ciclo de teste e anotar o resultado nos Comments.

## Comments

- 2026-10-17 (Renan): criado a partir da dúvida 7 da fila. A jornada não tinha arquivo em `.scratch`; o código está fechado nos canais 03, 04, 05 e 15, falta ligar em produção. Destrava o 1.16 (Renan conecta a caixa de e-mail) e o cadencia-pela-ia/03.
