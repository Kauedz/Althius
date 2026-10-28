begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(2);

select is(
  (select pg_get_constraintdef(oid) from pg_constraint
   where conrelid = 'private.agente_passos'::regclass and conname = 'agente_passos_motivo_confirmacao_check'),
  'CHECK ((motivo_confirmacao = ANY (ARRAY[''teto''::text, ''prospect''::text, ''alteracao''::text])))',
  'o passo aceita os motivos teto, prospect e alteracao (salvar o ICP)');
select is(
  (select count(*)::int from pg_constraint
   where conrelid = 'private.agente_passos'::regclass and pg_get_constraintdef(oid) like '%motivo_confirmacao IS NOT NULL%'),
  1, 'um passo que aguarda confirmação continua exigindo motivo');

select * from finish();
rollback;
