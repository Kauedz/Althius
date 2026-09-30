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

1. Aplicar a migration e publicar as funções (na raiz do repositório, com o `main` atualizado):
   ```powershell
   cd "$HOME\Althius"
   git checkout main
   git pull
   npx supabase db push
   npx supabase functions deploy signal-scan --project-ref ycbdilsmydvzezhlymty
   npx supabase functions deploy signal-runner --project-ref ycbdilsmydvzezhlymty
   ```
   (`signal-runner` já sai sem JWT pelo `supabase/config.toml`.)
2. Uma vez, no SQL Editor do Supabase, apontar o relógio para a função:
   ```sql
   select private.configure_signal_runner('https://ycbdilsmydvzezhlymty.supabase.co');
   ```
   Sem isso nada é chamado. Nenhum Monitoramento roda até um actor ser marcado como `available` (ticket 03).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Seams testados (TDD): as funções SQL públicas e de serviço (pgTAP `monitoramento_real_de_sinais.sql` e `varredura_automatica_de_sinais.sql`, com os créditos e o teto **reais**, não simulados), o handler da varredura com banco, Apify e adaptador injetados (Deno), e as Fontes do frontend com o Supabase falso. A revisão em duas frentes (padrões e spec) achou 13 pontos reais, todos corrigidos aqui: cron que nunca seria agendado no Supabase (`postgres` não é superusuário), Sinais que sobrariam no marcador da Conta apagada, Conta apagada sendo varrida, `verify_jwt` do runner, reserva presa se o teto lançasse erro, teto que não voltava quando a Conta falhava, cobrança por hora que podia sair de graça ou em dobro, criador que saiu travando o Monitoramento, data de disparo no futuro, tempo da função, rotação da varredura e o vencimento rebaixando Fit ou o cartão posto à mão.
- Banco: `save_signal_monitor` / `set_signal_monitor_state` / `delete_signal_monitor` / `list_signal_monitors` (só Sinal com actor `available` no registro; público = Contas do Workspace); `private.record_signal` (chave do acontecimento única por Conta e tipo; reencontro só registra `seen_again_at`; vale 30 dias a partir do disparo; Sinal novo e válido move o cartão para Quente; recusa Conta arquivada ou apagada e data no futuro); `list_account_signals` (foguinho) e `list_signals`; `private.expire_signals` (toda hora) devolve a Descoberta só o cartão que o Sinal pôs em Quente e que ficou sem Sinal válido antes da abordagem (Fit e o Quente posto à mão ficam); apagar a Conta definitivamente apaga os Sinais dela (`erase_account_extensions` redefinida a partir da definição mais recente).
- Varredura automática: `pg_cron` a cada 10 min chama `signal-runner` pelo `pg_net` (token gerado no banco, mesmo desenho da Sequência em segundo plano). `begin_account_scan` / `end_account_scan` reservam o crédito, conferem o teto `acao:varredura` e o devolvem se a varredura falha, tudo atômico no banco; `release_stale_credit_reservations` (toda hora) solta a reserva que ficou presa. Rodada que não deu conta de todas as Contas pede para continuar já e segue de onde parou (`scan_offset`).
- **Adaptadores: nenhum entra neste ticket.** Cada família (tickets 03 a 06) entrega o seu depois de uma execução real do actor, com a entrada e o formato do resultado vistos de verdade (os esquemas dos actors não foram conferidos: a documentação do Apify estava bloqueada). Por isso todos os actors seguem `testing` no registro e ninguém consegue criar Monitoramento real ainda. Os quatro critérios acima estão provados nos seams (banco real e handler); a prova de ponta a ponta com o Apify de verdade é a do ticket 03.
- Decisões a confirmar: (1) a função nova `signal-runner` e a mudança em `supabase-contas.ts` (o foguinho das Contas reais) não estão na lista "Pode mexer" do ticket, mas o padrão "pg_cron + pg_net, como o sequence-runner" e o critério "o foguinho mostra os Sinais válidos" as exigem; (2) `tipos()` já devolve a disponibilidade de cada card (Disponível, Em teste, Em breve), dado que o ticket 07 usa; (3) o módulo Sinais do Workspace operacional segue indisponível na tela até o primeiro actor passar no teste — o ticket 03 o libera.
- Frontend já visível: as Contas reais mostram Quente, a contagem de Sinais válidos e o último Sinal (`list_account_signals`). A Fonte real (`supabase-sinais.ts`) e o mapa tipo da tela → Sinal real (`sinais-reais-mapa.ts`) estão prontos.
