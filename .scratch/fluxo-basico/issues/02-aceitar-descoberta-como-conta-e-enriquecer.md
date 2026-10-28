# 02: Aceitar Descoberta como Conta e enriquecer o fluxo básico

**Status:** ready-for-human

**GATE:** Fase 1b do fluxo ICP → Descoberta → Conta → Comitê/Receita. Sem migration ou deploy remoto neste ticket; respeitar a definição mais recente de `accept_discovered_account`.

## Problema

Aceitar uma empresa descoberta precisa criar ou localizar uma Conta-alvo e deixar claro o resultado de cada enriquecimento. O Comitê de compra e os dados da Receita são passos independentes: uma falha de enriquecimento não pode desfazer o aceite.

## Solução

- Após o aceite, informar se a Conta foi criada ou já existia.
- Buscar o Comitê somente quando o gate devolver `liberado` e exibir o número de pessoas ou a mensagem real de erro.
- Consultar a Receita somente quando houver CNPJ, usando o target account retornado pelo aceite.
- Manter o aceite mesmo quando Comitê ou Receita falhar.
- Cobrir o contrato SQL, a tela e o smoke de produção sem escrita real.

## Pode mexer

- `projeto-althius-frontend/src/paginas/descobertas.tsx` apenas no fluxo `aceitar`, aviso e modal de URL.
- `projeto-althius-frontend/src/paginas/descobertas.test.tsx`.
- `supabase/tests/aceite_da_descoberta_fluxo_basico.sql`.
- `e2e/tests/10-aceitar-descoberta.spec.ts`.
- `supabase/functions/account-enrichment/` somente se a regra de Actor em teste exigir ajuste.

## Não mexa

- Busca, critérios, cotação e rótulos da frente 1a em `descobertas.tsx`.
- Banco remoto, secrets, migrations aplicadas, commit, push e deploy.
- Letras/nichos internos e valores em US$ na interface.

## Critérios de aceite

- [x] Aceite com Comitê e Receita bem-sucedidos mostra "agora é uma Conta-alvo" (ou "já era" quando a Conta existia), as pessoas do Comitê e Receita ok (Vitest `descobertas.test.tsx`).
- [x] Falha de Receita mostra a mensagem real e mantém a Conta aceita (Vitest `descobertas.test.tsx`).
- [x] Sem CNPJ não chama Receita; gate do Comitê diferente de `liberado` não chama Comitê (Vitest `descobertas.test.tsx`).
- [x] pgTAP cobre criação, campos carregados, estado, decisor, idempotência e isolamento (`aceite_da_descoberta_fluxo_basico.sql`).
- [x] pgTAP cobre deduplicação por domínio e por CNPJ e o estado `sem_contrato` do Comitê (`aceite_da_descoberta_fluxo_basico.sql`); os demais estados seguem cobertos por `descoberta_de_contas_pelo_icp.sql`.
- [ ] Smoke e2e intercepta aceite/enriquecimentos e prova que nenhuma escrita real ocorre.
- [ ] CI frontend, Edge Functions e Banco verdes.

## Comments

- 28/10/2026 — `begin_cnpj_receita` na migration `supabase/migrations/20261008203000_consulta_cnpj_reserva_credito.sql:27-68` exige apenas sessão, associação ativa ao Workspace, Conta pertencente ao Workspace e chama `reserve_credits`; não consulta `private.discovery_actors` nem bloqueia `state = 'testing'`. Portanto `cnpj-receita` funciona para Admin e Membro ativo, desde que haja contrato/saldo/limite.
- 28/10/2026 — A diferença está no Comitê: `begin_committee_discovery` em `supabase/migrations/20261001190000_enriquecimento_e_comite.sql:135-153` recusa Actor `testing` salvo quando `p_allow_testing` é verdadeiro e a pessoa é `admin`; o default da Edge Function é `true` (`supabase/functions/account-enrichment/index.ts:61-74`), logo Admin passa e Membro não passa. Essa regra não deve ser aplicada ao CNPJ sem necessidade.
- 28/10/2026 — O handler encaminha a recusa do RPC em `{ error: mensagem }`, status 403 (ou 402 para saldo/limite), conforme `supabase/functions/account-enrichment/handler.ts:439-452`; coberto pelo teste Deno `cnpj-receita encaminha a recusa do RPC como erro claro em pt-BR`.
- 28/10/2026 — Falta executar a revisão humana e os checks completos; nenhum passo remoto foi executado.
