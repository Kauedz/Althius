begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(16);

-- A fila de classificações dos Sinais (provedor `hermes`): a Edge Function enfileira, o worker do Hermes reserva e responde,
-- a função lê. Só o servidor usa; nenhum papel de usuário enxerga a fila.
insert into public.workspaces (id, kind, name) values
  ('f2000000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('f2000000-0000-0000-0000-000000000002', 'empresa', 'Sul');

create temporary table pedidos (n integer, id uuid) on commit drop;
grant all on pedidos to service_role;

set local role service_role;
insert into pedidos select 1, public.enqueue_signal_llm_request('f2000000-0000-0000-0000-000000000001', 'Extraia empresas. JSON.', 'Acme pede recuperação judicial.', 400);
insert into pedidos select 2, public.enqueue_signal_llm_request('f2000000-0000-0000-0000-000000000002', 'Classifique. JSON.', 'Ato do DOU.', 99999);

select is((select status from public.get_signal_llm_request((select id from pedidos where n = 1))), 'queued', 'o pedido nasce na fila');
reset role;
select is((select max_tokens from private.signal_llm_requests where id = (select id from pedidos where n = 2)), 4000, 'o limite de tokens é cortado em 4000');
set local role service_role;
select throws_ok($$ select public.enqueue_signal_llm_request('f2000000-0000-0000-0000-0000000000ff', 's', 'u', 100) $$, '22023', null, 'Workspace inexistente não enfileira');
select throws_ok($$ select public.enqueue_signal_llm_request('f2000000-0000-0000-0000-000000000001', '', 'u', 100) $$, '23514', null, 'pedido sem texto não entra');

-- O worker reserva o mais antigo, uma vez só.
create temporary table reservados (n integer, id uuid, usuario text) on commit drop;
grant all on reservados to service_role;
insert into reservados select 1, id, user_prompt from public.claim_signal_llm_request();
insert into reservados select 2, id, user_prompt from public.claim_signal_llm_request();
insert into reservados select 3, id, user_prompt from public.claim_signal_llm_request();
select is((select usuario from reservados where n = 1), 'Acme pede recuperação judicial.', 'o primeiro a chegar é o primeiro reservado');
select is((select count(*)::integer from reservados where n = 2 and id <> (select id from reservados where n = 1)), 1, 'o segundo pedido é outro');
select is((select count(*)::integer from reservados where n = 3), 0, 'com a fila vazia, ninguém reserva nada');
select is((select status from public.get_signal_llm_request((select id from pedidos where n = 1))), 'running', 'o pedido reservado fica em andamento');

-- Resposta e falha.
select public.finish_signal_llm_request((select id from pedidos where n = 1), 'done', '{"empresas":["Acme"]}', 900, 40, null);
select public.finish_signal_llm_request((select id from pedidos where n = 2), 'failed', null, null, null, 'OpenAI 401 chave sk-x');
select is((select result_text || ':' || input_tokens || ':' || output_tokens from public.get_signal_llm_request((select id from pedidos where n = 1))), '{"empresas":["Acme"]}:900:40', 'a resposta e os tokens voltam');
select is((select status from public.get_signal_llm_request((select id from pedidos where n = 2))), 'failed', 'a falha fecha o pedido');
select ok((select result_text is null from public.get_signal_llm_request((select id from pedidos where n = 2))), 'e não guarda texto de resposta');
-- Fechar de novo não muda nada.
select public.finish_signal_llm_request((select id from pedidos where n = 1), 'failed', null, null, null, 'tarde demais');
select is((select status from public.get_signal_llm_request((select id from pedidos where n = 1))), 'done', 'um pedido já fechado não é reaberto nem sobrescrito');
select throws_ok($$ select public.finish_signal_llm_request(gen_random_uuid(), 'qualquer', null) $$, '22023', null, 'estado inválido é recusado');
reset role;

-- Nenhum papel de usuário usa a fila.
select ok(not has_function_privilege('authenticated', 'public.enqueue_signal_llm_request(uuid, text, text, integer)', 'execute')
  and not has_function_privilege('anon', 'public.claim_signal_llm_request()', 'execute')
  and not has_function_privilege('authenticated', 'public.get_signal_llm_request(uuid)', 'execute'), 'só o servidor chama as funções da fila');
select ok(not has_table_privilege('authenticated', 'private.signal_llm_requests', 'select')
  and not has_table_privilege('service_role', 'private.signal_llm_requests', 'select'), 'a tabela da fila não é lida direto, nem pelo servidor');

-- Pedido parado sem worker é dado por falho no próximo enfileirar, e o resolvido há mais de um dia é apagado.
update private.signal_llm_requests set created_at = now() - interval '20 minutes' where status = 'running';
update private.signal_llm_requests set finished_at = now() - interval '2 days' where status = 'done';
set local role service_role;
select public.enqueue_signal_llm_request('f2000000-0000-0000-0000-000000000001', 's', 'u', 100);
reset role;
select is((select count(*)::integer from private.signal_llm_requests where finished_at < now() - interval '1 day'), 0, 'o pedido resolvido há mais de um dia some');

select * from finish();
rollback;
