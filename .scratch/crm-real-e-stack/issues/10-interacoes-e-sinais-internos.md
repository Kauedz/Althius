# 10: Registrar Sinais internos a partir de Interações reais

**What to build:** participantes configuram Monitoramentos internos e veem Sinais derivados de Interações reais no módulo de Sinais e na Conta correspondente.

**Blocked by:** 04: Criar e consultar Contas-alvo reais.

**Status:** ready-for-human (código e testes no branch `crm/10-interacoes-e-sinais-internos`; faltam o PR, o CI e os Passos do Nan abaixo)

- [x] Catálogo, Monitoramento, execução e Sinal encontrado são registros separados e persistidos. — `private.signal_catalog` (catálogo), `private.signal_monitors` (Monitoramento), `private.signal_monitor_runs` (cada rodada) e `private.signals` (Sinal, com `run_id`). pgTAP `supabase/tests/sinais_internos_das_interacoes.sql`, seções 1, 3 e 11.
- [x] Monitoramentos internos usam Interações persistidas, com configuração independente e estados rascunho, ativo e pausado. — a avaliação lê só `public.account_interactions`; cada Monitoramento tem nome, prazo e público próprios. O rascunho não roda, ativar avalia na hora e o pausado não roda. pgTAP seções 2, 3, 6 e 7.
- [x] Sinal encontrado guarda Conta, origem, data e identidade de deduplicação para rastrear o acontecimento observado. — `target_account_id`, `origin_interaction_id` (a Interação de origem), `fired_at` (o dia em que o prazo venceu), `event_key` (`sem_resposta|<id da Interação>`) e `source` "Interações da Conta". pgTAP seção 3.
- [x] Sinal aparece na lista/detalhe de Sinais e na projeção da Conta, com fonte e estados vazios/erro. — Vitest `src/paginas/sinais/sinais-internos-reais.test.tsx`: lista de Sinais encontrados, Conta pelos Sinais com evidência e fonte, detalhe da Conta Quente. O detalhe da Conta ganhou o estado de erro (antes mostrava "Nenhum sinal" quando a leitura falhava). Os vazios e o erro da lista vêm do sinais-reais 02 e continuam cobertos em `monitoramento-real.test.tsx`.
- [x] Duplicata não renova prazo; Sinal válido torna a Conta Quente por 30 dias independentemente de Fit/Não fit. — pgTAP seção 5 (o reencontro fica anotado, a data do primeiro disparo fica). Seções 3 e 4: Alfa continua Fit, Beta continua Não fit (Descartada) e as duas ficam Quentes.
- [x] Nenhuma execução interna mostra dados roteirizados ou resultado simulado no Workspace real. — os Sinais só saem de `private.internal_signal_candidates` sobre Interações gravadas. A Conta sem Interação não recebe nada (pgTAP seção 3). A tela não mostra "simulado" nem "na demonstração" nos fluxos internos (Vitest).

## Passos do Nan

1. Revisar e aprovar o PR quando o CI estiver verde.
2. Aplicar a migration `supabase/migrations/20261009050000_sinais_internos_das_interacoes.sql` no projeto `ycbdilsmydvzezhlymty`.
   - Fazer depois do CI, pelo `execute_sql`, no bloco atômico de `docs/agents/migrations.md`.
   - **A migration tem drops**, e o AGENTS.md pede confirmação antes deles. Nenhum dado é apagado:
     - troca as chaves estrangeiras `signal_monitors_signal_type_fkey` e `signals_signal_type_fkey`, que passam a apontar para o catálogo. O catálogo contém todos os tipos do registro de actors;
     - recria `public.list_signal_monitors` com a coluna `last_run` a mais.
3. Conferir o relógio, no SQL Editor. Deve voltar uma linha:

   ```sql
   select jobname, schedule from cron.job where jobname = 'althius-internal-signals';
   ```

4. Publicar o frontend, como de costume.

Não há Edge Function nova, deploy de função nem segredo.

## Comments

- **2026-10-09, implementação** (worktree `C:\Users\usuario\Althius-wt-crm-10`, branch `crm/10-interacoes-e-sinais-internos`, a partir da `main` 7929a2b).
  - **Decisões do Renan** (08 e 09/10):
    - Rodam de verdade só "Ausência de resposta" (`sem_resposta`) e "Negociação parada" (`negociacao_parada`). "Proposta recusada" fica "Em breve", porque nenhuma Interação registra uma recusa.
    - A avaliação interna não gasta crédito.
    - O público é a lista de Contas-alvo escolhidas, como nos externos.
    - O Sinal dispara no dia em que o prazo venceu (a Interação de origem mais o prazo), como o externo grava a data do acontecimento. Ativar um Monitoramento não deixa Quente um silêncio antigo: ele entra no histórico já vencido.
  - **Banco** (`20261009050000_sinais_internos_das_interacoes.sql`):
    - O catálogo `private.signal_catalog` tem a origem de cada Sinal real. Um gatilho põe ali todo actor novo do registro como externo e recusa actor para um Sinal interno.
    - `public.list_signal_catalog()` mostra o catálogo com o estado de cada tipo.
    - Ausência de resposta: o primeiro e-mail ou mensagem enviado depois da última conversa (resposta, ligação ou reunião) completou o prazo. A chave é esse primeiro envio, então os follow-ups não contam de novo, e um silêncio novo depois de uma resposta conta.
    - Negociação parada: a última Interação da Conta foi uma conversa e nada mais aconteceu no prazo. A chave é essa conversa. Quem continuou escrevendo cai em Ausência de resposta, então um silêncio nunca vira os dois tipos.
    - O Monitoramento interno aceita só o critério `prazo`, de 1 a 365 dias. Um campo que a avaliação não usa é recusado, em vez de fingir que filtra.
    - Ele é avaliado ao ser salvo ou ligado como ativo e, depois, pelo `pg_cron` (`althius-internal-signals`, a cada 15 min), quando vence `every_hours` (24 h).
    - A falha fica na rodada e no Monitoramento ("Não foi possível avaliar as Interações. A próxima rodada tenta de novo."), e a nova tentativa vem em 1 h.
    - A varredura externa (`signal-runner`) e a "Buscar Sinais de novo" continuam só com os Sinais que têm actor.
  - **Frontend:**
    - A Fonte lê o catálogo do banco além do registro de actors. Com um Sinal interno disponível, o módulo Sinais abre no operacional mesmo sem actor disponível.
    - O editor do interno pede só o prazo, explica o que o tipo observa nas Interações e diz que não gasta crédito.
    - A página do tipo mostra a última rodada ("Última rodada: hoje · 2 Contas avaliadas · 1 Sinal novo").
    - O "Buscar Sinais de novo" avisa que os Sinais internos não entram na busca.
    - O detalhe da Conta mostra o erro de leitura dos Sinais.
  - **Testes:**
    - pgTAP `sinais_internos_das_interacoes.sql`: 55/55. Suíte pgTAP inteira do zero: 63 arquivos verdes.
    - Vitest: `src/fonte/supabase-sinais.test.ts` (6 testes novos, os antigos intactos) e `src/paginas/sinais/sinais-internos-reais.test.tsx` (7). Os arquivos de Sinais, Contas e detalhe da Conta: 190/190.
    - Suíte inteira do Vitest (`--maxWorkers=2`, 20 min): 1125/1126. A única falha foi `src/raiz.test.tsx` › "o detalhe mostra só o que existe, com estados vazios…": o dublê de `abrirContasDoNorte` não tinha `list_signals`, e o teste só passava porque o detalhe engolia o erro de leitura. Com a autorização do Renan, o dublê ganhou `list_signals: () => []`; a asserção não mudou. Depois disso, `raiz.test.tsx`: 134/134.
    - `tsc -b` limpo. O `oxlint` não acusou aviso novo: 50 avisos, o mesmo número da `main`.
    - `deno test supabase/functions`: 747/747. Nenhuma função mudou.
  - **Revisão em duas frentes** (padrões e spec). Corrigido:
    - Negociação parada contava de novo a cada follow-up sem resposta.
    - A data do disparo era a hora da avaliação (decisão acima).
    - O texto do "Buscar Sinais de novo" enganava com Monitoramento interno ativo.
    - Um Monitoramento que quebrasse fora da avaliação derrubava o lote do relógio.
    - "Execução" virou "rodada": no CONTEXT, Execução é a de Agente.
    - Nomes e o argumento-bandeira do editor.
  - **Conferência visual** (Chrome, 1400×900), com o app sobre o dublê do Supabase, porque não havia credencial para o remoto:
    - [catálogo filtrado em Internos](prints/10-catalogo.jpg);
    - [editor da Ausência de resposta](prints/10-editor.jpg);
    - [página do tipo com a última rodada](prints/10-tipo.jpg);
    - [Sinais encontrados](prints/10-encontrados.jpg);
    - [Conta pelos Sinais](prints/10-conta-sinais.jpg);
    - [detalhe da Conta Quente](prints/10-detalhe.jpg);
    - [erro de leitura no detalhe](prints/10-detalhe-erro.jpg).
  - **Decisões a confirmar:**
    1. A migration não é só aditiva: troca duas chaves estrangeiras e recria `list_signal_monitors` (ver Passos do Nan). Sete migrations da `main` já fazem `drop function` ou `drop constraint`.
    2. O ticket diz "execução", mas no CONTEXT Execução é a de Agente. O código e a tela usam "rodada", como a tela de Sinais já fazia.
    3. Uma Interação registrada depois, com data anterior ao fim do prazo, não desfaz um Sinal já disparado. O Sinal é um fato observado e não é retirado.
    4. Só os Monitoramentos internos gravam rodadas. O CRM-11 pode gravar as da varredura externa na mesma tabela.
    5. `list_signals` não devolve `origin_interaction_id`. A evidência traz o tipo e o dia da Interação de origem, e a tela ainda não liga o Sinal à Interação.
