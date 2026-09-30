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

- [x] Mesmo acontecimento não conta duas vezes nem renova o prazo.
- [x] Automático só roda dentro do teto aprovado.
- [x] Cada Conta varrida debita 1 crédito.
- [x] O foguinho mostra os Sinais válidos da Conta.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration: `git checkout main`, `git pull`, `npx supabase db push` (na raiz do repositório).
2. Publicar `signal-scan` e `signal-runner` (`--no-verify-jwt`) e rodar `select private.configure_signal_runner('https://<ref>.supabase.co');` uma vez.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Seams testados (TDD): as funções SQL públicas e de serviço (pgTAP `monitoramento_real_de_sinais.sql` e `executor_de_sinais.sql`), o handler do Executor com banco, Apify e adaptador injetados (Deno), e as Fontes do frontend com o Supabase falso.
- Banco: `save_signal_monitor` / `set_signal_monitor_state` / `delete_signal_monitor` / `list_signal_monitors` (só Sinal com actor `available` no registro; público = Contas do Workspace); `private.record_signal` (chave do acontecimento única por Conta e tipo; reencontro só registra `seen_again_at`; vale 30 dias a partir do disparo; Sinal novo e válido move o cartão para Quente); `list_account_signals` (foguinho) e `list_signals`; `private.expire_signals` (diário, pg_cron) devolve a Descoberta a Conta cujos Sinais venceram antes da abordagem.
- Executor: `pg_cron` a cada 10 min chama `signal-runner` pelo `pg_net` (token gerado no banco, mesmo desenho do Executor da Sequência). Por Conta: reserva 1 crédito → confere o teto `acao:varredura` → roda o actor → o adaptador do tipo grava os Sinais → liquida. Falha, adaptador quebrado ou recusa do teto liberam a reserva (nada é cobrado). Rodada que não deu conta de todas as Contas continua de onde parou (`scan_offset`).
- **Adaptadores: nenhum entra neste ticket.** Cada família (tickets 03 a 06) entrega o seu depois de uma execução real do actor, com a entrada e o formato do resultado vistos de verdade (os esquemas dos actors não foram conferidos: a documentação do Apify estava bloqueada). Por isso todos os actors seguem `testing` no registro e ninguém consegue criar Monitoramento real ainda. O módulo Sinais do Workspace operacional segue indisponível na tela até o primeiro actor passar no teste (ticket 03); a Fonte real (`supabase-sinais.ts`) já está pronta e o mapa tipo da tela → Sinal real está em `sinais-reais-mapa.ts`.
- Frontend já visível: as Contas reais mostram Quente, a contagem de Sinais válidos e o último Sinal (`list_account_signals`).
