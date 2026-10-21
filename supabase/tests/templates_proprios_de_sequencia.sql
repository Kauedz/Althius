begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(34);

-- Templates próprios (ticket 08). Bia cria. Ana é Administradora no mesmo Workspace e não lê.
-- Carlos está em outro Workspace. O catálogo da Althius permanece.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('b8000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'bia@own.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b8000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ana@own.test', '', now(), now(), now(), '{}', '{}', false, false),
  ('b8000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carlos@own.test', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('b8100000-0000-0000-0000-000000000001', 'empresa', 'Norte Proprios'),
  ('b8100000-0000-0000-0000-000000000002', 'empresa', 'Sul Proprios');
insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('b8100000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001', 'member', true),
  ('b8100000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000002', 'admin', true),
  ('b8100000-0000-0000-0000-000000000002', 'b8000000-0000-0000-0000-000000000003', 'member', true);

insert into private.agent_conversations (id, workspace_id, owner_id, kind) values
  ('b8200000-0000-0000-0000-000000000001', 'b8100000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001', 'coordenada');
insert into private.agent_runs (id, workspace_id, conversation_id, requested_by, client_request_id, request_text, status, started_at)
values
  ('b8300000-0000-0000-0000-000000000001', 'b8100000-0000-0000-0000-000000000001', 'b8200000-0000-0000-0000-000000000001',
   'b8000000-0000-0000-0000-000000000001', gen_random_uuid(), 'Sugira o meu template', 'running', now());

create function pg_temp.entrar(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true),
         set_config('request.jwt.claim.role', 'authenticated', true)
$$;
create function pg_temp.rhetor() returns uuid language sql as $$
  select id from private.agents
  where workspace_id = 'b8100000-0000-0000-0000-000000000001' and specialty = 'rhetor' and kind = 'padrao'
$$;

select pg_temp.entrar('b8000000-0000-0000-0000-000000000001');
create temporary table ids (k text primary key, id uuid) on commit drop;
grant all on ids to anon, authenticated, service_role;
insert into ids select 'alfa', id from public.save_target_account(
  'b8100000-0000-0000-0000-000000000001', 'Alfa', 'https://alfa.own.test');
insert into ids select 'beta', id from public.save_target_account(
  'b8100000-0000-0000-0000-000000000001', 'Beta', 'https://beta.own.test');
insert into ids select 'maria', id from public.create_contact(
  (select id from ids where k = 'alfa'), 'Maria Souza', 'Diretora', 'maria.souza@alfa.com');

insert into private.signals (workspace_id, target_account_id, signal_type, event_key, phrase, fired_at)
values (
  'b8100000-0000-0000-0000-000000000001',
  (select id from ids where k = 'alfa'),
  'vaga_linkedin',
  'vagas-alfa-own',
  'Abriu 12 vagas de vendas',
  now()
);

-- 1. Privilégios. A tabela privada não é a API. Não há biblioteca compartilhada. O catálogo da Althius segue lá.
select ok(
  has_function_privilege('authenticated', 'public.list_own_sequence_templates(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.preview_own_sequence_template(uuid, text, text, jsonb, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.save_own_sequence_template(uuid, text, text, jsonb, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.update_own_sequence_template(uuid, uuid, text, text, jsonb, jsonb)', 'execute')
    and has_function_privilege('authenticated', 'public.suggest_own_sequence_template(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.list_own_sequence_templates(uuid)', 'execute')
    and has_function_privilege('service_role', 'public.agent_suggest_own_sequence_template(uuid, uuid, uuid)', 'execute')
    and not has_function_privilege('authenticated', 'public.agent_suggest_own_sequence_template(uuid, uuid, uuid)', 'execute')
    and not has_table_privilege('authenticated', 'private.own_sequence_templates', 'select')
    and not has_table_privilege('anon', 'private.own_sequence_templates', 'select'),
  'só a RPC do criador lê; a tabela e o Rhetor não estão abertos ao Cliente'
);
select is(to_regclass('public.shared_sequence_templates')::text, null, 'não cria biblioteca compartilhada');
select is(to_regclass('public.workspace_sequence_templates')::text, null, 'não cria catálogo do Workspace');
select is(
  (select array_agg(id order by id) from public.althius_sequence_templates),
  array['abertura-por-sinal', 'retomada-curta'],
  'os templates da Althius não foram revertidos'
);

-- 2. A prévia tira ID, destino e dado real. O texto cru não salva.
set local role authenticated;
select pg_temp.entrar('b8000000-0000-0000-0000-000000000001');
create temporary table previa on commit drop as
select * from public.preview_own_sequence_template(
  'b8100000-0000-0000-0000-000000000001',
  'Abertura da Maria Souza',
  'Estrutura sem o e-mail maria.souza@alfa.com.',
  jsonb_build_array(jsonb_build_object(
    'id', '22222222-2222-4222-8222-222222222222',
    'ordem', 1, 'canal', 'email', 'contatoId', (select id from ids where k = 'maria'),
    'destino', 2, 'titulo', 'Abertura',
    'assunto', 'Oi Maria Souza, da Alfa',
    'corpo', 'Escreva para maria.souza@alfa.com ou 11 98888-7777. Cargo: Diretora.',
    'historico', jsonb_build_array('ontem'),
    'autorizacao', jsonb_build_object('em', '2026-10-21'),
    'liberacao', 'ativacao'
  )),
  jsonb_build_array(jsonb_build_object(
    'nome', 'Maria Souza', 'email', 'maria.souza@alfa.com', 'empresa', 'Alfa', 'cargo', 'Diretora'
  ))
);
select is((select nome from previa), 'Abertura da {{nome}}', 'a prévia parametriza o nome');
select ok(
  (select passos -> 0 ->> 'corpo' from previa) = 'Escreva para {{email}} ou . Cargo: {{cargo}}.'
    and (select passos -> 0 ? 'contatoId' from previa) = false
    and (select passos -> 0 ? 'destino' from previa) = false
    and (select passos -> 0 ? 'historico' from previa) = false
    and (select passos -> 0 ? 'autorizacao' from previa) = false
    and (select passos -> 0 ->> 'id' from previa) = 'passo-1'
    and (select passos -> 0 ->> 'liberacao' from previa) = 'ativacao',
  'a prévia não leva ID, destino, histórico nem autorização'
);
select throws_ok(
  $$select public.save_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001',
    'Meu',
    'Com maria@alfa.com',
    jsonb_build_array(jsonb_build_object(
      'id', 'p1', 'ordem', 1, 'canal', 'email', 'titulo', 'Oi',
      'corpo', 'maria@alfa.com', 'contatoId', '11111111-1111-4111-8111-111111111111'
    )),
    '[]'::jsonb)$$,
  '22023', null, 'salvar sem a prévia segura é recusado'
);

select lives_ok(
  $$select public.save_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001',
    (select nome from previa),
    (select resumo from previa),
    (select passos from previa),
    '[{"nome":"Maria Souza","email":"maria.souza@alfa.com","empresa":"Alfa","cargo":"Diretora"}]'::jsonb)$$,
  'a prévia parametrizada pode ser salva'
);
insert into ids select 'tpl', id from public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000001');
select ok(
  (select passos::text from public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000001'))
    not like '%maria.souza@alfa.com%'
    and (select passos::text from public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000001'))
      not like '%98888%'
    and (select passos::text from public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000001'))
      not like '%contatoId%',
  'o template salvo não guarda e-mail, telefone nem Contato'
);

-- 3. Outro participante e outro Workspace não leem nem editam.
select pg_temp.entrar('b8000000-0000-0000-0000-000000000002');
select is(
  (select count(*)::int from public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000001')),
  0,
  'Administradora do mesmo Workspace não lista o template da Bia'
);
select throws_ok(
  $$select public.update_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001',
    (select id from ids where k = 'tpl'),
    'Hackeado',
    'Não era dela.',
    (select passos from previa),
    '[]'::jsonb)$$,
  '42501', null, 'outro participante não edita o template'
);
select lives_ok(
  $$select public.save_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001',
    'Segredo da Ana',
    'Só a Ana lê.',
    jsonb_build_array(jsonb_build_object(
      'id', 'ana-1', 'ordem', 1, 'canal', 'email', 'delayDiasUteis', 0, 'titulo', 'Segredo'
    )),
    '[]'::jsonb)$$,
  'a Ana salva o próprio template, sem virar biblioteca'
);
select pg_temp.entrar('b8000000-0000-0000-0000-000000000003');
select throws_ok(
  $$select public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000001')$$,
  '42501', null, 'outro Workspace não lista pela API'
);
select is(
  (select count(*)::int from public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000002')),
  0,
  'o Workspace do Carlos não recebe o template da Bia'
);
select throws_ok(
  $$select public.update_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001',
    (select id from ids where k = 'tpl'),
    'De fora',
    'Outro Workspace.',
    (select passos from previa),
    '[]'::jsonb)$$,
  '42501', null, 'outro Workspace não edita o template da Bia'
);

-- 4. Cópia independente: mudar a Sequência não muda o template, e o contrário também não.
select pg_temp.entrar('b8000000-0000-0000-0000-000000000001');
select is(
  (select count(*)::int from public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000001')),
  1,
  'a Bia não lê o template da Ana'
);
insert into ids select 'seq', id from public.create_sequence(
  'b8100000-0000-0000-0000-000000000001',
  (select id from ids where k = 'alfa')::text,
  jsonb_build_object(
    'participantesIds', jsonb_build_array((select id from ids where k = 'maria')),
    'steps', jsonb_build_array(jsonb_build_object(
      'id', 'copia-1', 'ordem', 1, 'canal', 'email',
      'contatoId', (select id from ids where k = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Cópia adaptada', 'assunto', 'Oi', 'corpo', 'Oi'
    ))
  ),
  '{"totalSteps": 1}'::jsonb
);
select is(
  (select passos -> 0 ->> 'titulo' from public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000001')),
  'Abertura',
  'criar a Sequência a partir da cópia não altera o template'
);
select public.update_owned_sequence(
  (select id from ids where k = 'seq'),
  jsonb_build_object(
    'participantesIds', jsonb_build_array((select id from ids where k = 'maria')),
    'steps', jsonb_build_array(jsonb_build_object(
      'id', 'copia-1', 'ordem', 1, 'canal', 'email',
      'contatoId', (select id from ids where k = 'maria'),
      'delayDiasUteis', 0, 'titulo', 'Passo acrescentado na cópia', 'assunto', 'Oi', 'corpo', 'Oi'
    ))
  ),
  '{"totalSteps": 1}'::jsonb,
  'ativa'
);
select is(
  (select passos -> 0 ->> 'titulo' from public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000001')),
  'Abertura',
  'acrescentar passo na Sequência não altera o template'
);
select public.update_own_sequence_template(
  'b8100000-0000-0000-0000-000000000001',
  (select id from ids where k = 'tpl'),
  'Nome novo da Bia',
  (select resumo from previa),
  (select passos from previa),
  '[]'::jsonb
);
-- private não é lido como authenticated: a conferência sai do papel antes.
reset role;
select is(
  (select document -> 'steps' -> 0 ->> 'titulo' from private.sequence_documents
   where sequence_id = (select id from ids where k = 'seq')),
  'Passo acrescentado na cópia',
  'editar o template não propaga para a Sequência'
);
set local role authenticated;

-- 5. A sugestão só devolve o template de quem pode ler. Não autoriza Contato nem envia.
select is(
  (select template_id from public.suggest_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa'))),
  (select id from ids where k = 'tpl'),
  'a sugestão devolve o template da própria Bia'
);
select ok(
  (select justification from public.suggest_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa')))
    like '%Abriu 12 vagas de vendas%'
    and (select justification from public.suggest_own_sequence_template(
      'b8100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa')))
      not like '%Segredo da Ana%'
    and (select justification from public.suggest_own_sequence_template(
      'b8100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa')))
      !~* 'comprovad|aumenta|convers[aã]o|[0-9]+ *%',
  'a justificativa cita o Sinal real e não o template de outra pessoa'
);
select is(
  (select outcome from public.suggest_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001', (select id from ids where k = 'beta'))),
  'sem_contexto',
  'sem Sinal a sugestão do template próprio não escolhe'
);
select pg_temp.entrar('b8000000-0000-0000-0000-000000000002');
select throws_ok(
  $$select public.suggest_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa'))$$,
  '42501', null, 'quem não é o responsável não recebe o template da Bia'
);
reset role;
select is(
  (select count(*)::int from private.sequence_authorizations a
    join public.sequences s on s.id = a.sequence_id
    where s.workspace_id = 'b8100000-0000-0000-0000-000000000001')
  + (select count(*)::int from private.sequence_step_sends
    where workspace_id = 'b8100000-0000-0000-0000-000000000001'),
  0,
  'salvar e sugerir não autorizam Contato nem gravam envio'
);

-- 6. O Rhetor usa o pedido de quem pode ler. O Ethos não. O Cliente não chama a RPC do servidor.
-- Os ids dos Agentes saem de private antes da troca de papel: o service_role não lê o schema private.
insert into ids select 'rhetor', pg_temp.rhetor();
insert into ids select 'ethos', id from private.agents
  where workspace_id = 'b8100000-0000-0000-0000-000000000001' and specialty = 'ethos' and kind = 'padrao';
set local role service_role;
select is(
  (select template_id from public.agent_suggest_own_sequence_template(
    'b8300000-0000-0000-0000-000000000001', (select id from ids where k = 'rhetor'), (select id from ids where k = 'alfa'))),
  (select id from ids where k = 'tpl'),
  'o Rhetor sugere o template de quem pediu, não o da Ana'
);
select throws_ok(
  $$select public.agent_suggest_own_sequence_template(
    'b8300000-0000-0000-0000-000000000001',
    (select id from ids where k = 'ethos'),
    (select id from ids where k = 'alfa'))$$,
  '42501', 'sequence: only the cadence specialist proposes sequences', 'só o Rhetor sugere template próprio'
);
reset role;
select is(
  (select count(*)::int from private.sequence_step_sends
   where workspace_id = 'b8100000-0000-0000-0000-000000000001'),
  0,
  'a sugestão do Rhetor não grava envio'
);

-- 7. Anônimo não lê nem usa.
select ok(
  not has_function_privilege('anon', 'public.preview_own_sequence_template(uuid, text, text, jsonb, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.save_own_sequence_template(uuid, text, text, jsonb, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.update_own_sequence_template(uuid, uuid, text, text, jsonb, jsonb)', 'execute')
    and not has_function_privilege('anon', 'public.suggest_own_sequence_template(uuid, uuid)', 'execute')
    and not has_function_privilege('anon', 'public.agent_suggest_own_sequence_template(uuid, uuid, uuid)', 'execute'),
  'anon não executa nenhuma RPC de template próprio'
);
set local role anon;
select set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$select public.list_own_sequence_templates('b8100000-0000-0000-0000-000000000001')$$,
  '42501', null, 'anon não lista o template da Bia'
);
select throws_ok(
  $$select public.suggest_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001', (select id from ids where k = 'alfa'))$$,
  '42501', null, 'anon não usa o template da Bia'
);
reset role;

-- 8. Limites aplicados na função, não só na tela.
set local role authenticated;
select pg_temp.entrar('b8000000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.save_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001', 'Muitos passos', 'Nove passos.',
    (select jsonb_agg(jsonb_build_object(
      'id', 'passo-' || n, 'ordem', n, 'canal', 'email', 'delayDiasUteis', 0, 'titulo', 'Passo ' || n) order by n)
     from generate_series(1, 9) n),
    '[]'::jsonb)$$,
  '22023', 'own template: at most 8 steps', 'mais de 8 passos é recusado no servidor'
);
select throws_ok(
  $$select public.save_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001', 'Corpo longo', 'Corpo acima do limite.',
    jsonb_build_array(jsonb_build_object(
      'id', 'passo-1', 'ordem', 1, 'canal', 'email', 'delayDiasUteis', 0, 'titulo', 'Longo',
      'corpo', repeat('a', 5001))),
    '[]'::jsonb)$$,
  '22023', 'own template: step text too long', 'corpo acima de 5000 caracteres é recusado no servidor'
);
select throws_ok(
  $$select public.save_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001', repeat('n', 81), 'Nome acima do limite.',
    (select passos from previa), '[]'::jsonb)$$,
  '22023', null, 'nome acima de 80 caracteres é recusado no servidor'
);
reset role;
insert into private.own_sequence_templates (workspace_id, owner_user_id, nome, resumo, passos)
select 'b8100000-0000-0000-0000-000000000001', 'b8000000-0000-0000-0000-000000000001',
       'Lote ' || n, 'Preenche a cota.', '[{"id":"passo-1","ordem":1,"canal":"email","delayDiasUteis":0,"titulo":"Oi"}]'::jsonb
from generate_series(1, 49) n;
set local role authenticated;
select throws_ok(
  $$select public.save_own_sequence_template(
    'b8100000-0000-0000-0000-000000000001', (select nome from previa), (select resumo from previa),
    (select passos from previa), '[]'::jsonb)$$,
  '22023', 'own template: limit reached', 'o 51º template da mesma pessoa no Workspace é recusado'
);
reset role;

select * from finish();
rollback;
