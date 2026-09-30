# signal-runner

O Executor de Sinais. O relógio do banco (`pg_cron` a cada 10 minutos, `private.kick_signal_runner`) chama esta função quando há Monitoramento ativo vencido; ela o reivindica, e Conta por Conta:

1. reserva 1 crédito (`account_scan`, chave estável por hora);
2. confere o teto da varredura automática (`acao:varredura`, "Automação e tetos");
3. roda o actor do Sinal (teto de custo do registro; contas do Apify em rodízio);
4. grava os Sinais que o **adaptador** do tipo tira do resultado (o mesmo acontecimento conta uma vez; vale 30 dias);
5. liquida o crédito. Conta que falhou, adaptador que quebrou ou recusa do teto liberam a reserva: nada é cobrado.

Quem chama: só o relógio, com o cabeçalho `x-runner-token` (gerado e guardado no banco, conferido por `signal_runner_token_matches`). Deploy com `--no-verify-jwt`. Passo manual, uma vez: `select private.configure_signal_runner('https://<ref>.supabase.co');`.

**Adaptadores** (`adaptadores.ts`): um por tipo de Sinal, entregue com os tickets 03 a 06 e só depois de uma execução real do actor, com o formato do resultado visto de verdade. Sem adaptador, o Monitoramento espera e o motivo aparece nele.
