# A3: Actors validados passam a disponível

**What to build:** um banco novo, e o CI, nascem com o mesmo estado dos actors de Sinal que a validação real já aprovou. Uma migration nova promove a `available` só os 5 actors cuja execução real está registrada com o id do run e o dado devolvido (decisão do Renan de 07/10, lista nos Comments). Os outros 7 do registro continuam `testing`. Criar Monitoramento real deixa de depender de um `UPDATE` feito à mão no remoto.

**Blocked by:** None (can start immediately). A validação dos 5 está nos comentários de `.scratch/sinais-reais/issues/` 04, 05 e 06 com o id do run, e o Renan aceitou esse registro em 07/10. A autorização para trocar a asserção `registro_de_actors.sql:18` foi dada na mesma decisão.

**Status:** ready-for-human (código na `main` pelo PR #262; falta o Nan aplicar `20261121100000` no remoto)

## Estado atual (24/10, `main` 515c2eb)

- O registro `private.signal_actors` tem 12 actors, todos `testing`: os 9 do lançamento (`20260930130000_registro_de_actors.sql`), `solidcode~ads-transparency-scraper` / `anuncio_google` (`20261021100000_coletor_google_ads.sql`) e `harvestapi~linkedin-company` / `crescimento_de_equipes` e `harvestapi~linkedin-company-posts` / `publicacao_da_empresa` (`20261022100000_equipes_e_publicacoes.sql`). Nenhuma migration até `20261119120000` muda o estado de um actor (o único `update private.signal_actors` é o corpo de `set_signal_actor_state`).
- `supabase/tests/registro_de_actors.sql:17` conta 12 actors e `:18` ("todos nascem em teste") conta 12 em `testing`.
- Estado final esperado depois da migration: 5 `available`, 7 `testing` (os 4 do lançamento sem id do run mais os 3 novos de 21/10 e 22/10), 12 no total.
- Rodada de conferência feita pela matriz em 24/10 (pgTAP do zero, Postgres 17 local, `scripts/pgtap-local.sh`): com só o `update` dos 5, a única asserção que cai em 152 arquivos é `registro_de_actors.sql:18` (have 7, want 12). `registro_de_actors.sql:56-58` e `monitoramento_real_de_sinais.sql:39-43` usam `vaga_linkedin`, que segue `testing`, e continuam verdes. Os pgTAP que tocam `anuncio_linkedin` (`briefing_e_plano_do_sinal.sql:45`, `rodar_agora_e_registro_da_rodada.sql:92`) põem o estado eles mesmos.

## Critérios

- [x] Uma migration nova, timestamp maior que `20261120120000` (a do PR #261, em rascunho, já usa essa versão), promove a `available` exatamente estes 5 e nenhum outro: `harvestapi~linkedin-profile-scraper`, `harvestapi~linkedin-profile-search`, `harvestapi~linkedin-post-search`, `silva95gustavo~linkedin-ad-library-scraper`, `compass~google-maps-reviews-scraper`. Os outros 7 seguem `testing`. (`supabase/migrations/20261121100000_actors_validados_disponiveis.sql`)
- [x] A migration não preenche `version` nem `known_price`, e é idempotente (rodar de novo no remoto, onde os 5 já estão `available`, não muda nada). Conferido rodando o `update` duas vezes no banco pgTAP: a segunda vez não afeta nenhuma linha (filtro `state <> 'available'`) e `updated_at` não muda.
- [x] `supabase/tests/registro_de_actors.sql:18` troca "todos nascem em teste" pelo conjunto final (5 `available`, 7 `testing`), com o mesmo `plan(18)`. Nenhuma outra asserção desse arquivo muda.
- [x] Um pgTAP novo em `supabase/tests/` prova o estado final: os 5 `available` por `actor_id`, os 7 `testing`, preço e versão nulos nos 12, e `authenticated` não escreve no registro (`set_signal_actor_state` dá 42501). (`supabase/tests/actors_validados_disponiveis.sql`)
- [x] A migration não edita `20260930130000_registro_de_actors.sql` nem nenhuma outra antiga.
- [x] pgTAP do zero verde em todos os arquivos de `supabase/tests/` (`PGPORT=55432 scripts/pgtap-local.sh <banco>`). 152 arquivos, todos `ok`, nenhuma falha.

## Pode mexer

- Uma migration nova em `supabase/migrations/`
- Um pgTAP novo em `supabase/tests/`
- `supabase/tests/registro_de_actors.sql`, só a linha 18 (autorizado pelo Renan em 07/10)
- Este ticket (status, critérios, comentário)

## Não mexa

- Os outros pgTAP, em especial `briefing_e_plano_do_sinal.sql`, `rodar_agora_e_registro_da_rodada.sql`, `preco_por_rodada_e_limites.sql` e `agenda_do_sinal.sql` (estão no PR #261). Se algum cair, pare e reporte.
- Adaptadores, `signal-scan`, `signal-runner` e o editor.
- Actors de descoberta (`private.discovery_actors`).
- `grant_credits`, Conexões, InMail, seam de Canal, Stripe, sinais jurídicos.

## Passos do Nan

1. Com o CI verde, aplicar a migration no projeto `ycbdilsmydvzezhlymty` como manda `docs/agents/migrations.md`. No remoto ela não muda nada (os 5 já estão `available` lá); serve para o banco do zero e o CI. Quem executa o ticket não aplica no remoto.

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6): nada foi implementado. Nenhuma migration posterior a `20261002112000` promove actor; o registro nasce todo `testing` (`20260930130000_registro_de_actors.sql:11,23-32`). O ticket continua necessário: um banco novo e o CI nascem sem nenhum Sinal disponível, enquanto no remoto os 9 estão `available` (comentário de 07/10 no sinais-reais 01, conferido só por leitura).
  - O ticket subestima o que quebra. Promover `vaga_linkedin` derruba três asserções em dois arquivos, não uma: `registro_de_actors.sql:18` ("todos nascem em teste"), `registro_de_actors.sql:56-58` ("a varredura lê o estado e o teto do registro", que espera `testing` para `curious_coder~linkedin-jobs-scraper`) e `monitoramento_real_de_sinais.sql:39-43` ("Sinal em teste ainda não cria Monitoramento", com `vaga_linkedin`).
  - O registro da validação existe só nos comentários de `.scratch/sinais-reais/issues/` 03 a 06 (por exemplo: vagas do LinkedIn 50 vagas e 21 Sinais; Indeed 92 e 42; nova liderança 13 perfis e 8 Sinais; anúncio de movimentação 23 posts e 0 Sinais). O script grava a saída fora do Git (`scripts/validar-sinais-reais.ts:126-130`). No remoto, `registro-apos-o-teste.sql` também gravou versão e preço, que este ticket proíbe na migration: o CI vai divergir do remoto nesses dois campos.
  - Testes: pgTAP `registro_de_actors.sql` e `monitoramento_real_de_sinais.sql` ok no CI 37707955273 (com tudo `testing`).
  - Perguntas ao Nan: (1) os comentários de sinais-reais 03 a 06 valem como validação dos 9, inclusive o anúncio de movimentação, que nunca teve um Sinal positivo real? (2) autoriza trocar as três asserções acima, e não só a de `registro_de_actors.sql:18`? Com as respostas, o ticket vira `ready-for-agent`. Se quiser rodar de novo, o comando está no cabeçalho de `scripts/validar-sinais-reais.ts`.

- 2026-10-07, decisão do Renan: o A3 só vale para actor cuja execução real esteja registrada nos comentários de `.scratch/sinais-reais/issues/` 03 a 06 com o id do run e o dado devolvido. Só as asserções desses actors mudam, e os outros continuam `testing`. Se a validação tivesse sido por leitura ou simulada, o A3 seguiria bloqueado.
  - Caso conferido: as 9 validações foram execuções reais feitas pelo Nan (nenhuma por leitura ou simulação), mas só 5 comentários trazem o id do run. Por isso o A3 entra, reduzido a esses 5.
  - Passam a `available`:
    - `harvestapi~linkedin-profile-scraper` (`mudanca_de_emprego`): run `P0cwNVHU0vRPqyAnT`, de 01/10, com 1 perfil devolvido (sinais-reais 04). O id está no parágrafo do custo, ligado à execução de 01/10 pela data e pelo "1 perfil"; os campos devolvidos (`experience[]`, `currentPosition[]`) estão no parágrafo anterior.
    - `harvestapi~linkedin-profile-search` (`nova_lideranca`): run `dc5AUzvHGwKwtrTK5`, 13 perfis Full e 8 Sinais (sinais-reais 04).
    - `harvestapi~linkedin-post-search` (`anuncio_de_movimentacao`): runs `ffYNHKd6YfAh05ydk` e `9vN8xgI7ezPOBdNo0`, 23 posts em cada e 0 Sinais, conferidos etapa a etapa (sinais-reais 04).
    - `silva95gustavo~linkedin-ad-library-scraper` (`anuncio_linkedin`): runs `uB8jH3SjFPlEoQLRV`, `tZfJs8R2pv0y8xEgd` e `eaDzDlxxH4olkmYkV`, 20 anúncios em cada (sinais-reais 05). A correção do período (`last-30-days`) está na `main` (`supabase/functions/signal-runner/adaptadores/anuncio-linkedin.ts:42`).
    - `compass~google-maps-reviews-scraper` (`avaliacoes_google_maps`): run `mYG42K90ca9hiXqzC`, 100 avaliações e 1 Sinal (sinais-reais 06).
  - Seguem `testing` (execução real descrita, com o dado devolvido, mas sem o id do run):
    - `curious_coder~linkedin-jobs-scraper` (`vaga_linkedin`): 50 vagas e 21 Sinais em 30/09; o endpoint síncrono da época não devolvia `x-apify-run-id`.
    - `valig~indeed-jobs-scraper` (`vaga_indeed`): 92 vagas e 42 Sinais em 30/09.
    - `harvestapi~linkedin-company-employees` (`entradas_e_saidas`): 3 perfis e 3 Sinais em 30/09.
    - `curious_coder~facebook-ads-library-scraper` (`anuncio_meta`): 30 anúncios e 3 Sinais em 01/10.
  - Asserções: com `vaga_linkedin` em `testing`, a única que muda é `supabase/tests/registro_de_actors.sql:18` ("todos nascem em teste", que conta 9 em `testing`), trocada pelo conjunto final (os 5 acima `available` e os 4 `testing`). Ficam como estão `registro_de_actors.sql:19-20` (preço e versão em branco), `registro_de_actors.sql:56-58` e `monitoramento_real_de_sinais.sql:39-43`, que usam `vaga_linkedin`. Os outros pgTAP que tocam actors (`reativacao_de_sinais.sql:50-52,73,82`, `sinais_de_movimentacao.sql:42`, `varredura_automatica_de_sinais.sql:23,210`) põem o estado eles mesmos. Se o pgTAP do zero no CI derrubar outra asserção por causa dos 5, pare e pergunte.
  - A migration tem timestamp maior que `20261002121000`, parte do registro todo em `testing`, não preenche `version` nem `known_price` e não edita `20260930130000_registro_de_actors.sql`. O pgTAP novo prova os 5 em `available`, os 4 em `testing`, preço e versão nulos e que outro papel não escreve no registro.
  - Consequência: num banco novo e no CI, vagas do LinkedIn e do Indeed, entradas e Meta nascem `testing`, enquanto no remoto os 9 estão `available`. Para promover os 4, basta rodar de novo `scripts/validar-sinais-reais.ts` e registrar o id do run num comentário.
  - Passo do Nan depois do merge: aplicar a migration no projeto `ycbdilsmydvzezhlymty` conforme `docs/agents/migrations.md`. No remoto ela não muda nada (os 5 já estão `available` lá).

- 2026-10-24 (matriz Ralph): ticket refeito contra a `main` 515c2eb. O registro cresceu para 12 actors (Google Ads em 21/10, Equipes e Publicações em 22/10), todos `testing`; `registro_de_actors.sql:18` conta 12. Estado final esperado: 5 `available`, 7 `testing`. Timestamp da migration depois de `20261120120000` (PR #261). Blocked by passa a None: a decisão de 07/10 já é o registro aceito e a autorização para a linha 18.

- 2026-10-24 (implementação, sessão Ralph half): criada `supabase/migrations/20261121100000_actors_validados_disponiveis.sql` — um `update private.signal_actors set state = 'available', updated_at = now() where actor_id in (<os 5>) and state <> 'available'`, sem tocar `version` nem `known_price`. Idempotência conferida empiricamente: rodar o mesmo `update` duas vezes no banco pgTAP afeta 0 linhas na segunda vez e `updated_at` não muda.
  - TDD: editada só a linha 18 de `supabase/tests/registro_de_actors.sql` (trocado "todos nascem em teste" por uma asserção `jsonb_build_object` que exige 5 `available` e 7 `testing`, mantendo `plan(18)` com 18 asserções); rodado antes da migration e confirmado o vermelho (`have: {"testing": 12, "available": 0}`, `want: {"testing": 7, "available": 5}`); depois da migration, verde.
  - Novo pgTAP `supabase/tests/actors_validados_disponiveis.sql` (`plan(5)`): os 5 `actor_id` `available` exatos, os 7 `testing` exatos, contagem total 12, preço/versão nulos nos 12, e `throws_ok` 42501 para `authenticated` chamando `set_signal_actor_state`.
  - `/code-review` (Standards + Spec em paralelo): Spec sem achados (todos os critérios cobertos, sem scope creep, migration antiga intocada). Standards sem violação hard; um smell de judgement call (faltava `reset role` antes do `finish()` no pgTAP novo, diferente do padrão do resto da suíte) — corrigido num segundo commit.
  - Suíte pgTAP do zero (`PGPORT=55432 scripts/pgtap-local.sh pgtap_a3`, Postgres 17 local): 152 arquivos, todos `ok`, nenhuma falha — incluindo os do PR #261 (`briefing_e_plano_do_sinal.sql`, `rodar_agora_e_registro_da_rodada.sql`, `preco_por_rodada_e_limites.sql`, `agenda_do_sinal.sql`) e `monitoramento_real_de_sinais.sql`, intocados.
  - AC 6/6. Pending apply no remoto (`ycbdilsmydvzezhlymty`): quem fecha o ticket não aplica, conforme "Passos do Nan".
- 2026-10-28 (fechamento da spec): status `done` não existe em `docs/agents/triage-labels.md`; trocado por `ready-for-human` até o Nan aplicar a migration no remoto. Depois disso, `closed`.
