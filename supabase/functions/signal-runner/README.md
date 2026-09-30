# signal-runner

A varredura automática de Sinais. O relógio do banco (`pg_cron` a cada 10 minutos, `private.kick_signal_runner`) chama esta função quando há Monitoramento ativo vencido; ela o reivindica (`claim_due_signal_monitors`) e, Conta por Conta:

1. **abre** a varredura (`begin_account_scan`): reserva 1 crédito e confere o teto da varredura automática (`acao:varredura`, "Automação e tetos"), de uma vez no banco. A chave da cobrança é o Monitoramento, a Conta e a hora marcada da rodada, então repetir a rodada nunca cobra duas vezes;
2. roda o actor do Sinal (teto de custo do registro; contas do Apify em rodízio);
3. grava os Sinais que o **adaptador** do tipo tira do resultado (o mesmo acontecimento conta uma vez; vale 30 dias);
4. **fecha** a varredura (`end_account_scan`): concluída, debita o crédito; falha, adaptador quebrado ou Sinal que o banco recusa soltam a reserva e devolvem o teto — nada é cobrado.

Se o automático está em "confirmar", sem teto ou no teto, ou não há crédito, a rodada para sem varrer nada e o motivo fica em `last_error` do Monitoramento (a tela o mostra a partir do ticket 03). O tempo da função é de 150 s: uma Conta nova só começa até 75 s, e o Apify espera no máximo 70 s por Conta; o que faltar continua de onde parou na rodada seguinte, que o próprio Monitoramento pede para já.

Quem chama: só o relógio, com o cabeçalho `x-runner-token` (gerado e guardado no banco, conferido por `signal_runner_token_matches`). `verify_jwt = false` está no `supabase/config.toml`. Passo manual, uma vez por projeto: `select private.configure_signal_runner('https://<ref>.supabase.co');`.

**Adaptadores** (`adaptadores.ts`): um por tipo de Sinal, entregue com os tickets 03 a 06 e só depois de uma execução real do actor, com a entrada e o formato do resultado vistos de verdade. Sem adaptador, o Monitoramento espera e o motivo aparece nele.
