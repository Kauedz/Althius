# A3: Actors validados passam a disponível

**What to build:** um banco novo, e o CI, nascem com o mesmo estado dos actors de Sinal que a validação real já aprovou. Só esses ficam `available`. Os outros continuam `testing`. Criar Monitoramento real deixa de depender de um `UPDATE` feito à mão no remoto.

**Blocked by:** a validação real de cada actor com `scripts/validar-sinais-reais.ts`. Sem esse registro, este ticket não promove ninguém. O merge na `main` espera o 00.

O registro que existe hoje está nos comentários de `.scratch/sinais-reais/issues/` 03, 04, 05 e 06 (rodadas de 30/09 e 01/10, com contagem e custo). Não há pasta `validacao-sinais/` na árvore. `.scratch/sinais-reais/registro-apos-o-teste.sql` é o SQL que foi aplicado à mão no remoto e marca os nove; não é, sozinho, a prova. Onde o comentário e uma saída do script discordarem, vale a saída do script. Onde só houver o comentário, pare e pergunte ao Nan se aquele comentário é a validação, antes de promover o actor.

**Status:** needs-info (duas respostas do Nan antes de escrever a migration; ver Comments de 2026-10-07)

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
