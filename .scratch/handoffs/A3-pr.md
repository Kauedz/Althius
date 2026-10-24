# PR: A3 — Actors validados passam a disponível

**Título:** feat(sinais): promove a available os 5 actors com execução real registrada

## Summary

```diff
 supabase/migrations/
+└── 20261121100000_actors_validados_disponiveis.sql   # update: 5 actor_id → available
 supabase/tests/
 ├── registro_de_actors.sql                            # linha 18: "todos testing" → 5 available / 7 testing
+└── actors_validados_disponiveis.sql                  # novo: prova o estado final dos 12
```

Migration nova promove a `available` exatamente os 5 actors cuja execução real tem id do run
registrado (decisão do Renan de 07/10, `.scratch/sinais-reais/issues/` 04, 05 e 06):
`harvestapi~linkedin-profile-scraper`, `harvestapi~linkedin-profile-search`,
`harvestapi~linkedin-post-search`, `silva95gustavo~linkedin-ad-library-scraper`,
`compass~google-maps-reviews-scraper`. Os outros 7 do registro (sem id do run) continuam
`testing`. Não preenche `version` nem `known_price`. Um banco novo e o CI nascem com o mesmo
estado do remoto, sem depender de um `UPDATE` manual.

```sql
update private.signal_actors
set state = 'available', updated_at = now()
where actor_id in (<os 5>)
and state <> 'available';
```

## Evidence

- **Before (red):** editada só a linha 18 de `registro_de_actors.sql` para exigir 5
  `available`/7 `testing`, sem a migration:
  ```
  not ok 2 - os 5 validados com id do run nascem disponíveis, os outros 7 seguem em teste
  #   have: {"testing": 12, "available": 0}
  #   want: {"testing": 7, "available": 5}
  ```
- **After (green):** com a migration aplicada:
  ```
  ok     registro_de_actors.sql: 18/18
  ok     actors_validados_disponiveis.sql: 5/5
  ```
- **Suíte inteira do zero** (`PGPORT=55432 scripts/pgtap-local.sh pgtap_a3`, Postgres 17 local,
  152 arquivos): todos `ok`, nenhuma falha — incluindo os do PR #261
  (`briefing_e_plano_do_sinal.sql`, `rodar_agora_e_registro_da_rodada.sql`,
  `preco_por_rodada_e_limites.sql`, `agenda_do_sinal.sql`) e `monitoramento_real_de_sinais.sql`,
  intocados.
- **Idempotência:** o mesmo `update` rodado duas vezes no banco pgTAP afeta 0 linhas na segunda
  vez (filtro `state <> 'available'`) e `updated_at` não muda.
- `/code-review` (Standards + Spec, em paralelo): Spec sem achados. Standards sem violação
  hard; um smell de judgement call (faltava `reset role` antes do `finish()` no pgTAP novo) —
  corrigido.

## Merge Danger

**Door:** two-way. É um `UPDATE` de dados reversível por uma migration nova (`set state =
'testing'` nos mesmos 5, se algum dia precisar reverter); não apaga nem recria nada.

**Blast Radius:** catálogo de Sinais exibido ao cliente (`public.list_signal_actors`) e a
checagem de disponibilidade em `save_signal_monitor`. Os 5 actors passam a poder criar
Monitoramento real num banco novo/CI (hoje só no remoto). Nenhum outro Sinal, adaptador ou
Edge Function muda de comportamento.

## Migration pendente de apply?

**Sim, mas não por este PR.** No remoto (`ycbdilsmydvzezhlymty`) os 5 já estão `available`
(aplicado manualmente antes deste ticket existir) — a migration ali não muda nada, serve só
para igualar bancos novos e o CI ao remoto. Conforme "Passos do Nan" no ticket, quem aplica no
remoto, com CI verde, é o Nan — não esta sessão.
