# A3: Actors validados passam a disponível

**What to build:** um banco novo, e o CI, nascem com o mesmo estado dos actors de Sinal que a validação real já aprovou. Só esses ficam `available`. Os outros continuam `testing`. Criar Monitoramento real deixa de depender de um `UPDATE` feito à mão no remoto.

**Blocked by:** a validação real de cada actor com `scripts/validar-sinais-reais.ts`. Sem esse registro, este ticket não promove ninguém. O merge na `main` espera o 00.

O registro que existe hoje está nos comentários de `.scratch/sinais-reais/issues/` 03, 04, 05 e 06 (rodadas de 30/09 e 01/10, com contagem e custo). Não há pasta `validacao-sinais/` na árvore. `.scratch/sinais-reais/registro-apos-o-teste.sql` é o SQL que foi aplicado à mão no remoto e marca os nove; não é, sozinho, a prova. Onde o comentário e uma saída do script discordarem, vale a saída do script. Onde só houver o comentário, pare e pergunte ao Nan se aquele comentário é a validação, antes de promover o actor.

**Status:** ready-for-agent (promover só os 5 actors com execução real registrada com o id do run e o dado devolvido; os outros 4 seguem `testing`)

- [ ] A migration promove a `available` apenas os actors cujo registro de validação o Nan confirmou. Actor sem esse registro permanece `testing`.
- [ ] A migration não preenche `version` nem `known_price`. O pgTAP `registro_de_actors.sql` exige os dois em branco até alguém conferir, e este ticket não está autorizado a mudar essa asserção.
- [ ] O pgTAP novo prova o estado final: os promovidos estão `available`, os demais `testing`, preço e versão continuam nulos, e outro papel não escreve no registro.
- [ ] A migration não edita `20260930130000_registro_de_actors.sql`.

## Pode mexer

- Uma migration nova em `supabase/migrations/`
- Um pgTAP novo em `supabase/tests/`

## Não mexa

- `supabase/tests/registro_de_actors.sql`. Ele afirma que os 9 actors terminam `testing` (`todos nascem em teste`). Uma migration que promove actors faz essa asserção falhar no banco do zero. Não a edite. Antes de escrever a migration, peça ao Nan autorização para trocar só essa asserção pelo conjunto final (quem ficou `available` e quem ficou `testing`). Sem esse sim, o ticket não faz merge.
- Adaptadores, `signal-scan`, `signal-runner` e o editor. A validação já aconteceu fora daqui; este ticket só grava o estado.
- Actors de descoberta (`private.discovery_actors`). Continuam `testing` até uma validação própria.
- `grant_credits`.
- Conexões, InMail, seam de Canal, Stripe, sinais jurídicos.

## Migration

Uma, timestamp UTC maior que `20261002112000`. Parte do registro como a `main` o deixa (todos `testing`) e só então atualiza o estado dos validados. pgTAP próprio, arquivo novo.

## Passos do Nan

1. Confirmar, fora do chat de chaves, quais actors a rodada de `scripts/validar-sinais-reais.ts` aprovou. Se faltar actor, o comando está no cabeçalho do próprio script (PowerShell, na raiz). A chave `service_role` não entra no chat.
2. Autorizar, ou não, a troca da asserção `todos nascem em teste` em `supabase/tests/registro_de_actors.sql`.
3. Com o CI verde, aplicar a migration no projeto `ycbdilsmydvzezhlymty` como manda `docs/agents/migrations.md`. Quem executa o ticket não aplica no remoto.

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
