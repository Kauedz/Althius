# B5: As RPCs de revelar recusam telefone

**What to build:** enquanto o preço da revelação de telefone não for decidido (FILA 2.11, pendência registrada no B3 em 08/10), o banco recusa `telefone` nas duas RPCs que o app chama antes de revelar. Hoje a tela e a Edge Function já recusam, mas uma chamada direta à RPC ainda cota 5 créditos e reserva `phone_revealed`, e essa reserva fica presa até a faxina. Depois deste ticket, `quote_reveal_contact(contato, 'telefone')` e `begin_reveal_contact(ws, contato, 'telefone')` falham com erro próprio, sem ler saldo, sem reservar e sem tocar no Contato. O e-mail continua exatamente como está.

**Blocked by:** None (can start immediately).

**Status:** done

**Quem faz:** agente de código. **Esforço:** P.

## Estado atual (24/10, `main` 515c2eb)

- `quote_reveal_contact(uuid, text)`: a definição em vigor é a de `20261016110000_guarda_de_contrato.sql` (~l.186-235). `telefone` cota `v_cost := 5` (~l.220) e, se o Contato já tem telefone, devolve `(0, saldo, true, true)` (`already_known`).
- `begin_reveal_contact(uuid, uuid, text, text)`: a definição em vigor é a de `20261001190000_enriquecimento_e_comite.sql` (~l.518-573). `telefone` vira `v_action := 'phone_revealed'` (~l.554-555) e chama `reserve_credits`.
- `finish_reveal_contact` já não grava nem debita telefone (`20261009030000_revelar_email_so_cobra_valor_novo.sql`). Não muda aqui.
- App: `cotarRevelacaoContato` e `revelarContato` em `projeto-althius-frontend/src/fonte/supabase-contas.ts` recusam `telefone`; o handler de `account-enrichment` devolve 400 para `telefone` antes de reservar. Não mudam aqui.

## Critérios

- [x] Migration nova em `supabase/migrations/`, timestamp maior que `20261121100000` (a `20261120120000` é do PR #261 e a `20261121100000` fica reservada ao A3), redefine `quote_reveal_contact` e `begin_reveal_contact` com `create or replace`, a partir do corpo em vigor de cada uma (assinatura, retorno, `security definer`, `search_path = ''` e grants iguais).
- [x] `quote_reveal_contact(contato, 'telefone')` lança `phone reveal unavailable` com errcode `0A000`, mesmo quando o Contato já tem telefone. A checagem de sessão, Contato e Participação vem antes, como hoje (sem sessão continua 28000, Contato de fora continua P0002/42501).
- [x] `begin_reveal_contact(ws, contato, 'telefone')` lança o mesmo erro antes de `reserve_credits`: nenhuma linha nova de reserva, saldo reservado igual antes e depois.
- [x] `email` segue igual: cota 2 (ou 0 com `already_known`), reserva `email_revealed`. Canal desconhecido segue 22023.
- [x] pgTAP novo em `supabase/tests/` cobre: cotação de telefone recusada (com e sem telefone já gravado), reserva de telefone recusada sem reserva criada, e-mail ainda cota e reserva.
- [x] As asserções antigas que esperam o telefone aceito passam a esperar a recusa, e só elas: `enriquecimento_e_comite.sql` ~l.229-232 ("cotação de telefone é de 5 créditos") e o bloco ~l.280-305 que reserva e finaliza telefone; `nao_recobrar_o_ja_descoberto.sql` ~l.185-186 ("telefone que já existe também cota 0"); `revelar_email_so_cobra_valor_novo.sql` ~l.149-172 onde o teste reserva telefone pela RPC. Em `revelar_email_so_cobra_valor_novo.sql` §9 ("a reserva do telefone não finaliza uma revelação de e-mail") a proteção continua valendo: crie a reserva `phone_revealed` direto por `public.reserve_credits` como dono, em vez de pela RPC, e mantenha a asserção. Ajustar o `plan(n)` de cada arquivo se o número de asserções mudar. Nenhuma outra asserção muda.
- [x] pgTAP do zero verde em todos os arquivos de `supabase/tests/` (`PGPORT=55432 scripts/pgtap-local.sh <banco>`).
- [x] `CONTEXT.md` não muda (o verbete "Crédito" já diz que telefone não se revela).

## Pode mexer

- Uma migration nova em `supabase/migrations/`
- Um pgTAP novo em `supabase/tests/`
- Nos pgTAP `enriquecimento_e_comite.sql`, `nao_recobrar_o_ja_descoberto.sql` e `revelar_email_so_cobra_valor_novo.sql`, só as asserções de telefone listadas acima
- Este ticket (status, critérios, comentário)

## Não mexa

- Migrations antigas (`20261001190000`, `20261009215603`, `20261015170000`, `20261016110000`, `20261009030000`).
- `finish_reveal_contact`, `reserve_credits`, `grant_credits`, `private.existing_contact_value`.
- Frontend e Edge Functions (já recusam).
- Implementar busca ou preço de telefone. A recusa é o comportamento até o Nan decidir.
- Arquivos do Kauê (`send-chat-step*`, `sequence-runner`, `reply-proposal-*`, `unipile-*`, `detalhe-sequencia*`, `supabase-sequencias*`, `motivos-do-envio.ts`) e os do PR #261.

## Migration

Uma, aditiva (só `create or replace`, sem `drop`, sem mudança de assinatura). pgTAP próprio.

## Passos do Nan

1. Com o CI verde, aplicar a migration no projeto `ycbdilsmydvzezhlymty` como manda `docs/agents/migrations.md`. Quem executa o ticket não aplica no remoto. Sem deploy de função nem de frontend.
2. Quando o preço do telefone for decidido, abrir ticket próprio que troca a recusa pela cotação.

## Comments

- 2026-10-24 (matriz Ralph): ticket criado a partir da pendência do B3 (comentário de 08/10) e da FILA 2.11 (`.scratch/FILA-EXECUCAO-2026-10-17.md:56`). Conferido na `main` 515c2eb que nenhuma migration depois de `20261016110000` redefine as duas RPCs.
- 2026-10-24 (agente de código): implementado. Migration nova `supabase/migrations/20261121110000_revelar_recusa_telefone_na_rpc.sql` redefine `quote_reveal_contact` e `begin_reveal_contact` com `create or replace`, byte-a-byte iguais aos corpos em vigor exceto o ramo `elsif p_channel = 'telefone'`, que agora lança `raise exception 'phone reveal unavailable' using errcode = '0A000'` antes de qualquer leitura de saldo, `already_known` ou `reserve_credits`. pgTAP novo `supabase/tests/revelar_recusa_telefone_na_rpc.sql` (11 asserções) cobre: sessão/Contato/Participação continuam checados antes do canal (28000/P0002/42501), cotação de telefone recusada com e sem telefone já gravado, `begin_reveal_contact` recusado sem criar reserva `phone_revealed` e sem mudar o saldo reservado, e e-mail intocado (cota 2, reserva `email_revealed`). Ajustadas só as asserções de telefone listadas no critério 25 em `enriquecimento_e_comite.sql` (plan 29→28), `nao_recobrar_o_ja_descoberto.sql` (plan 45 mantido) e `revelar_email_so_cobra_valor_novo.sql` (plan 29 mantido; a reserva de telefone da seção 9 agora é criada direto via `public.reserve_credits` como dono). Suíte pgTAP inteira (153 arquivos) rodada do zero com `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_b5`: 100% verde, zero falhas. Revisão com `/code-review` (Standards + Spec) sem achados bloqueantes. `CONTEXT.md` não foi tocado. Migration pendente de apply no remoto pelo Nan.
