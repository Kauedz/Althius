# signal-runner

A varredura automática de Sinais. O relógio do banco (`pg_cron` a cada 10 minutos, `private.kick_signal_runner`) chama esta função quando há Monitoramento ativo vencido (ou busca pendente, ver abaixo); ela o reivindica (`claim_due_signal_monitors`) e, Conta por Conta:

1. **abre** a varredura (`begin_account_scan`): reserva 1 crédito e confere o teto da varredura automática (`acao:varredura`, "Automação e tetos"), de uma vez no banco. A chave da cobrança é o Monitoramento, a Conta e a hora marcada da rodada, então repetir a rodada nunca cobra duas vezes;
2. roda o actor do Sinal (teto de custo do registro; contas do Apify em rodízio);
3. grava os Sinais que o **adaptador** do tipo tira do resultado (o mesmo acontecimento conta uma vez; vale 30 dias);
4. **fecha** a varredura (`end_account_scan`): concluída, debita o crédito; falha, adaptador quebrado ou Sinal que o banco recusa soltam a reserva e devolvem o teto — nada é cobrado.

Se o automático está em "confirmar", sem teto ou no teto, ou não há crédito, a rodada para sem varrer nada e o motivo fica em `last_error` do Monitoramento (a tela o mostra a partir do ticket 03). O tempo da função é de 150 s: uma Conta nova só começa até 75 s, e o Apify espera no máximo 70 s por Conta; o que faltar continua de onde parou na rodada seguinte, que o próprio Monitoramento pede para já.

Quem chama: só o relógio, com o cabeçalho `x-runner-token` (gerado e guardado no banco, conferido por `signal_runner_token_matches`). `verify_jwt = false` está no `supabase/config.toml`. Passo manual, uma vez por projeto: `select private.configure_signal_runner('https://<ref>.supabase.co');`.

**Adaptadores** (`adaptadores.ts`): um por tipo de Sinal, entregue com os tickets 03 a 06 e só depois de uma execução real do actor, com a entrada e o formato do resultado vistos de verdade. Sem adaptador, o Monitoramento espera e o motivo aparece nele.

## Reativação de Sinais (ticket 08)

A mesma função cuida da fila de buscas (`private.signal_rescans`), **antes** dos Monitoramentos do relógio, porque quem clicou está esperando:

- **A busca do clique** ("Buscar Sinais de novo" na Conta, `request_account_rescan`): varre a Conta com todos os Monitoramentos ativos do Workspace, mesmo que ela não esteja no público deles. Só gasta crédito (1 por Monitoramento): o clique é a confirmação, então o interruptor e o teto do automático não entram.
- **A busca mensal**: todo dia às 05:17 UTC o relógio (`althius-signal-reactivation`) enfileira as Contas com Fit que esfriaram (estágio Fit e nenhum Sinal válido) e ainda não foram revisitadas nos últimos 30 dias, e só num Workspace com o automático da varredura ligado, com teto aprovado, sem pausa e com Monitoramento ativo. Cada varredura gasta crédito **e** teto (`begin_rescan_scan`; `end_rescan_scan` devolve o teto se a varredura falha). Sem teto ou sem saldo, a busca para com o motivo e as outras buscas mensais do Workspace param junto.
- Cada varredura reserva pela busca e pelo Monitoramento, então repetir a volta nunca cobra duas vezes; a que falha não é cobrada. Se o tempo da função acaba no meio, a busca volta à fila e a função chama o relógio de novo (`kick_rescan_runner`).
- Só acontecimento novo reaquece: o banco (`record_signal`) trata o mesmo acontecimento como reencontro, sem Sinal novo nem prazo renovado.
- Enquanto nenhum adaptador existir (tickets 03 a 06), toda busca para com "Ainda não há adaptador para os Sinais dos Monitoramentos ativos." e nada é cobrado.
