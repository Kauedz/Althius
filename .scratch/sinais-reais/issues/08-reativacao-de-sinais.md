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

- [x] Só acontecimento novo reaquece; o mesmo acontecimento continua não contando.
- [x] Sem teto aprovado, a reativação automática não roda.
- [x] O botão mostra o custo em créditos antes de rodar.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. Aplicar a migration `20260930200000_reativacao_de_sinais.sql` (na raiz do repositório, com o `main` atualizado). Ela agenda o relógio diário `althius-signal-reactivation`, sozinha, onde o `pg_cron` existe:
   ```powershell
   cd "$HOME\Althius"
   git checkout main
   git pull
   npx supabase db push
   ```
2. Publicar de novo a função da varredura, que agora também cuida da fila de buscas (o resto do passo a passo do ticket 02 continua valendo, inclusive `select private.configure_signal_runner('https://ycbdilsmydvzezhlymty.supabase.co');`, uma vez):
   ```powershell
   npx supabase functions deploy signal-runner --project-ref ycbdilsmydvzezhlymty
   ```

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Seams testados (TDD): as funções SQL (pgTAP `reativacao_de_sinais.sql`, 73 asserções, com o crédito e o teto **reais**), o handler do `signal-runner` com banco, Apify e adaptador injetados (Deno, `handler-buscas.test.ts`, 10 testes), a Fonte real de Contas com o Supabase falso e a tela da Conta com Fontes ajustadas (Vitest, 14 testes). Os testes existentes não mudaram.
- Banco: fila `private.signal_rescans` (uma busca pendente por Conta). `quote_account_rescan` mostra o custo antes (Monitoramentos ativos com actor disponível × 1 crédito, o saldo, se há busca em andamento e como terminou a última); `request_account_rescan` pede (qualquer participante ativo; recusa já, com o motivo, se não há Monitoramento ativo, saldo ou limite mensal de quem pede, e se a Conta está arquivada ou apagada; pedir de novo devolve a mesma busca). O relógio diário (`private.run_signal_reactivation`, 05:17 UTC) encerra a busca pendente há mais de 2 dias e enfileira a mensal. `claim_signal_rescans`, `begin_rescan_scan`, `end_rescan_scan`, `finish_signal_rescan`, `stop_workspace_rescans` e `kick_rescan_runner` são só do servidor. A migration é só aditiva: não redefine nenhuma função dos tickets anteriores (`end_rescan_scan` e `kick_rescan_runner` são irmãs de `end_account_scan` e `kick_signal_runner`; o relógio `althius-signal-rescans`, a cada 10 min, chama a função quando há busca pendente). `begin_rescan_scan` repete de propósito o desenho de `begin_account_scan`, para não redefinir a função do ticket 02.
- Busca mensal: enfileira a Conta que está no estágio **Fit** do kanban, sem nenhum Sinal válido e não revisitada nos últimos 30 dias (busca do clique também conta), só num Workspace com o automático da varredura ligado, com teto aprovado, sem pausa e com Monitoramento ativo. Cada varredura gasta crédito e teto (`acao:varredura`); sem teto ou saldo a busca para com o motivo e as outras mensais do Workspace param junto. Falha devolve o teto (`end_rescan_scan`; a origem da busca decide, não o texto da chave).
- Busca do clique: só gasta crédito; o interruptor "confirmar/automático" e o teto não entram, porque o clique é a confirmação.
- Só acontecimento novo reaquece: o banco já trata o mesmo acontecimento como reencontro (`record_signal`); o teste da busca prova que um acontecimento reencontrado não vira Sinal novo nem renova o prazo, e que um acontecimento novo deixa a Conta com 1 Sinal válido sem tirar o cartão de Fit.
- Enquanto nenhum adaptador existir (tickets 03 a 06), toda busca para com "Ainda não há adaptador para os Sinais dos Monitoramentos ativos." e nada é cobrado.
- Frontend: botão "Buscar Sinais de novo" na seção Sinais da Conta (`buscar-sinais-de-novo.tsx`), com o custo ao lado ("2 créditos"), desligado com o motivo (sem Monitoramento ativo, sem saldo), "Buscando Sinais…" enquanto a busca está na fila (a tela confere a cada 8 s e recarrega os Sinais e o foguinho quando termina), última busca e o motivo de não ter varrido tudo. Só aparece com o módulo Sinais liberado no Workspace (ticket 03); a Demonstração mostra um custo de exemplo e não grava Sinal.
- Decisões a confirmar: (1) "Fit" é o estágio Fit do kanban, porque a Aderência ainda não é gravada em outro lugar; Conta em Em abordagem ou adiante não é reativada. (2) A busca usa **todos** os Monitoramentos ativos do Workspace, mesmo que a Conta não esteja no público deles. (3) Cada Conta é revisitada no máximo uma vez a cada 30 dias, pela mensal ou pelo clique. (4) Fora da lista "Pode mexer" do ticket, mas exigidos pela fila e pela ação na Conta: a função `signal-runner` (`handler.ts`, `index.ts`, README), `contas-tipos.ts`, `simulada-contas.ts`, `supabase-contas.ts`, `detalhe-conta.tsx` e o apoio de teste `src/test/renderizar.tsx`. (5) A varredura dos tickets 02 e 08 sempre reserva crédito, sem o interruptor `credits_enforced` do ticket 04 (que só vale para Agentes): se o Nan quiser varrer sem cobrar antes de assinar, é um ajuste pequeno.
- Limites conhecidos: (a) o clique numa Conta que já tem busca mensal pendente, ainda sem varredura, assume a busca (vira do clique, com os conferes de saldo e limite de quem pediu). (b) A busca em que todas as varreduras falharam termina como parada, não como revisita, então a mensal tenta de novo. (c) Uma função que cai entre abrir e fechar uma varredura mensal deixa a reserva presa até a faxina de 2 h, que solta o crédito mas não devolve o teto do mês. (d) Uma busca que falha por erro inesperado volta à fila a cada volta até ser encerrada em 2 dias, sem limite de tentativas.
