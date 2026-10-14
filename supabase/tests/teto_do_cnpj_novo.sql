begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(4);

select is(
  (select s.max_items from private.signal_cascade_steps s
    join private.signal_cascades c on c.id = s.cascade_id
    where c.signal_type = 'cnpj_novo' and s.ordem = 1),
  25, 'cnpj novo pede no máximo 25 empresas por rodada');

select is(
  (select s.est_items from private.signal_cascade_steps s
    join private.signal_cascades c on c.id = s.cascade_id
    where c.signal_type = 'cnpj_novo' and s.ordem = 1),
  25, 'a estimativa da rodada acompanha o teto de 25');

select is(
  (select (s.input_template ->> 'tetoResultados')::integer from private.signal_cascade_steps s
    join private.signal_cascades c on c.id = s.cascade_id
    where c.signal_type = 'cnpj_novo' and s.ordem = 1),
  25, 'o modelo do passo traz o teto de resultados');

select ok(
  (select (s.input_template ->> 'tetoUsd')::numeric = 0.20 from private.signal_cascade_steps s
    join private.signal_cascades c on c.id = s.cascade_id
    where c.signal_type = 'cnpj_novo' and s.ordem = 1),
  'o modelo do passo traz o teto de US$ 0,20');

select * from finish();
rollback;
