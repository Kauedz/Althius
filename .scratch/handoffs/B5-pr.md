# PR: B5 — as RPCs de revelar recusam telefone

## Título

B5: `quote_reveal_contact` e `begin_reveal_contact` recusam telefone

## Corpo

### Summary

Enquanto o preço da revelação de telefone não for decidido (FILA 2.11, pendência do B3 em 08/10), chamar as RPCs
direto com `telefone` ainda cotava 5 créditos e reservava `phone_revealed` — a tela e a Edge Function já recusavam,
mas a RPC não. Este PR fecha esse buraco no próprio banco.

```diff
 quote_reveal_contact(contato, canal)
   if canal = 'email'    -> cota 2 (ou 0 se already_known)
-  if canal = 'telefone' -> cota 5 (ou 0 se already_known)
+  if canal = 'telefone' -> raise 'phone reveal unavailable' (0A000), mesmo se already_known
   else                  -> raise 22023

 begin_reveal_contact(ws, contato, canal)
   if canal = 'email'    -> reserve_credits('email_revealed')
-  if canal = 'telefone' -> reserve_credits('phone_revealed')
+  if canal = 'telefone' -> raise 'phone reveal unavailable' (0A000), antes de reserve_credits
   else                  -> raise 22023
```

Uma migration nova, aditiva (`create or replace`, mesma assinatura/retorno/`security definer`/`search_path=''`),
a partir do corpo em vigor de cada função:

```text
supabase/migrations/
└── 20261121110000_revelar_recusa_telefone_na_rpc.sql   # redefine as duas RPCs
```

`finish_reveal_contact` não muda (já não grava nem debita telefone desde `20261009030000`). E-mail não muda.

### Evidence

- **Before:** com a migration ainda não aplicada no banco de teste, a suíte pgTAP rodava verde porque os testes
  antigos ainda esperavam telefone aceito.
- **After:** com a migration aplicada, rodei a suíte do zero antes de ajustar os testes e confirmei o vermelho
  exatamente nos 3 arquivos que o ticket previa:

```text
FALHOU enriquecimento_e_comite.sql: plano 29, ok 19, not ok 0
  ERROR:  phone reveal unavailable
FALHOU nao_recobrar_o_ja_descoberto.sql: plano 45, ok 28, not ok 0
  ERROR:  phone reveal unavailable
FALHOU revelar_email_so_cobra_valor_novo.sql: plano 29, ok 21, not ok 0
  ERROR:  phone reveal unavailable
```

Depois de ajustar só as asserções de telefone listadas no ticket (e criar a reserva do §9 de
`revelar_email_so_cobra_valor_novo.sql` direto por `reserve_credits`, como dono, em vez de pela RPC) e adicionar
`supabase/tests/revelar_recusa_telefone_na_rpc.sql` (11 asserções novas: sessão/Contato/Participação continuam
checados antes do canal; telefone recusado com e sem telefone já gravado; `begin_reveal_contact` recusado sem
criar reserva e sem mexer no saldo reservado; e-mail intocado), a suíte pgTAP inteira (153 arquivos) rodou do
zero 100% verde:

```text
PGPORT=55432 bash scripts/pgtap-local.sh pgtap_b5
ok     revelar_recusa_telefone_na_rpc.sql: 11/11
ok     enriquecimento_e_comite.sql: 28/28
ok     nao_recobrar_o_ja_descoberto.sql: 45/45
ok     revelar_email_so_cobra_valor_novo.sql: 29/29
... (todos os 153 arquivos ok, 0 FALHOU)
```

Revisão `/code-review` (Standards + Spec) sem achados bloqueantes.

### Merge Danger

**Door:** two-way. É só uma troca de `raise exception` no lugar de `v_cost :=` / `v_action :=` nas duas RPCs; dar
`create or replace` de volta para o corpo anterior (restaurando a cotação/reserva de telefone) desfaz tudo.

**Blast Radius:** pequeno e isolado. Afeta só quem chama `quote_reveal_contact`/`begin_reveal_contact` com
`'telefone'` diretamente pela RPC (bypass da tela/Edge Function) — essas chamadas passam a falhar com
`phone reveal unavailable` (0A000) em vez de cotar/reservar. Ninguém legítimo hoje depende de telefone ser aceito
por essa RPC: a tela e a Edge Function já recusam telefone antes de chegar aqui. Nenhuma migration antiga, função
protegida (`finish_reveal_contact`, `reserve_credits`, `grant_credits`, `private.existing_contact_value`),
frontend ou Edge Function foi tocada.

### Pendências

- Migration **ainda não aplicada** no projeto remoto (`ycbdilsmydvzezhlymty`). Fica para o Nan aplicar com o CI
  verde, como manda `docs/agents/migrations.md`. Sem deploy de função nem de frontend.
- Quando o preço do telefone for decidido, abrir ticket próprio que troca a recusa pela cotação (não faz parte
  deste PR).
