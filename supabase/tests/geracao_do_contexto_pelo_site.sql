begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
select plan(31);

-- Ana (Admin Norte), Bruno (Membro Norte), Carla (Admin Sul).
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
                        created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
                        is_sso_user, is_anonymous)
values
  ('5d000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ana@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'bruno@norte.com.br', '', now(), now(), now(), '{}', '{}', false, false),
  ('5d000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'carla@sul.com.br', '', now(), now(), now(), '{}', '{}', false, false);

insert into public.workspaces (id, kind, name) values
  ('5d100000-0000-0000-0000-000000000001', 'empresa', 'Norte'),
  ('5d100000-0000-0000-0000-000000000002', 'empresa', 'Sul');

insert into public.workspace_memberships (workspace_id, user_id, role, active) values
  ('5d100000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000001', 'admin', true),
  ('5d100000-0000-0000-0000-000000000001', '5d000000-0000-0000-0000-000000000002', 'member', true),
  ('5d100000-0000-0000-0000-000000000002', '5d000000-0000-0000-0000-000000000003', 'admin', true);

create temp table _ids (nome text primary key, id uuid);
grant all on _ids to public;

-- 1. A tabela das gerações não é lida pelos papéis do app.
select ok(
  (select relrowsecurity from pg_class where oid = 'private.company_context_generations'::regclass)
    and not has_table_privilege('authenticated', 'private.company_context_generations', 'select')
    and not has_table_privilege('service_role', 'private.company_context_generations', 'select'),
  'RLS ligado e nenhum papel do app lê as gerações diretamente'
);
select ok(
  not has_function_privilege('authenticated', 'public.finish_company_context_generation(uuid, text, text, text, jsonb, text, text, numeric, text)', 'execute'),
  'só o servidor grava o resultado da leitura'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- 2. Sem site, não há o que ler; o Membro não começa leitura.
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000001', true);
select throws_ok(
  $$select public.start_company_context_generation('5d100000-0000-0000-0000-000000000001')$$,
  '22023', 'company site required', 'sem site cadastrado, pede o site'
);
select throws_ok(
  $$select public.start_company_context_generation('5d100000-0000-0000-0000-000000000001', 'http://10.0.0.1/x')$$,
  '22023', 'invalid company site', 'site que não é domínio público é recusado'
);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.start_company_context_generation('5d100000-0000-0000-0000-000000000001', 'norte.com.br')$$,
  '42501', 'only administrators can edit the company context', 'o Membro não começa leitura'
);

-- 3. O Administrador informa o site em Configurações e começa a leitura; repetir reaproveita a mesma.
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000001', true);
insert into _ids select 'g1', (public.start_company_context_generation('5d100000-0000-0000-0000-000000000001', 'Norte.com.br') ->> 'generation_id')::uuid;
select is(
  (select dominio from public.day0_companies where workspace_id = '5d100000-0000-0000-0000-000000000001'),
  'norte.com.br', 'o site informado fica no cadastro da empresa'
);
select is(
  (public.start_company_context_generation('5d100000-0000-0000-0000-000000000001') ->> 'generation_id')::uuid,
  (select id from _ids where nome = 'g1'), 'pedir de novo durante a leitura reaproveita a mesma geração'
);
select is(
  public.get_company_context('5d100000-0000-0000-0000-000000000001') -> 'generation' ->> 'state',
  'gerando', 'a tela vê a leitura em andamento'
);

-- 4. A primeira geração completa fica vigente sozinha; repetir a resposta não grava de novo.
reset role;
set local role service_role;
select is(
  public.finish_company_context_generation((select id from _ids where nome = 'g1'),
    'A Norte vende software.', E'ICP primário: incorporadoras.\nICP secundário: construtoras.', 'Diretor comercial.',
    '["https://norte.com.br/","https://norte.com.br/sobre"]', 'openai:gpt', 'contexto-v1', 0.002, null) ->> 'state',
  'aplicada', 'a primeira geração fica vigente sem aprovação'
);
select is(
  (public.finish_company_context_generation((select id from _ids where nome = 'g1'),
    'Outro texto', 'Outro', 'Outro', '[]', 'openai:gpt', 'contexto-v1', 0.002, null) ->> 'repeated')::boolean,
  true, 'a mesma resposta de novo não muda nada'
);
reset role;
select is(
  (select count(*)::integer from private.company_context_versions where workspace_id = '5d100000-0000-0000-0000-000000000001'),
  1, 'uma versão só, mesmo com a resposta repetida'
);
select is(
  (select origin || ':' || (generation_id = (select id from _ids where nome = 'g1'))::text
   from private.company_context_versions where workspace_id = '5d100000-0000-0000-0000-000000000001'),
  'geracao:true', 'a versão guarda a origem e a geração'
);
select is(
  (select sources from private.company_context_generations where id = (select id from _ids where nome = 'g1')),
  '["https://norte.com.br/","https://norte.com.br/sobre"]'::jsonb, 'a geração guarda as páginas lidas'
);

-- 5. Nova leitura vira sugestão; a vigente continua até o aceite.
set local role authenticated;
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000001', true);
insert into _ids select 'g2', (public.start_company_context_generation('5d100000-0000-0000-0000-000000000001') ->> 'generation_id')::uuid;
reset role;
set local role service_role;
select is(
  public.finish_company_context_generation((select id from _ids where nome = 'g2'),
    'A Norte vende software e consultoria.', 'ICP primário: incorporadoras de SP.', 'Diretor comercial e CFO.',
    '["https://norte.com.br/"]', 'openai:gpt', 'contexto-v1', 0.002, null) ->> 'state',
  'sugestao', 'com contexto vigente, a nova leitura é sugestão'
);
reset role;
set local role authenticated;
select is(
  public.get_company_context('5d100000-0000-0000-0000-000000000001') ->> 'empresa',
  'A Norte vende software.', 'a vigente continua até o aceite'
);
select is(
  public.get_company_context('5d100000-0000-0000-0000-000000000001') -> 'generation' ->> 'icp',
  'ICP primário: incorporadoras de SP.', 'a sugestão chega à tela com os três textos'
);

-- 6. O Membro não decide; o Administrador aceita e a sugestão vira a versão 2.
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000002', true);
select throws_ok(
  format('select public.accept_company_context_suggestion(%L, %L, 1)', '5d100000-0000-0000-0000-000000000001', (select id from _ids where nome = 'g2')),
  '42501', 'only administrators can edit the company context', 'o Membro não aceita sugestão'
);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000003', true);
select throws_ok(
  format('select public.accept_company_context_suggestion(%L, %L, 1)', '5d100000-0000-0000-0000-000000000002', (select id from _ids where nome = 'g2')),
  'P0002', 'company context generation not found', 'outro Workspace não alcança a sugestão'
);
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000001', true);
select is(
  public.accept_company_context_suggestion('5d100000-0000-0000-0000-000000000001', (select id from _ids where nome = 'g2'), 1),
  2, 'aceitar grava a sugestão como versão 2'
);
select is(
  public.accept_company_context_suggestion('5d100000-0000-0000-0000-000000000001', (select id from _ids where nome = 'g2'), 1),
  2, 'aceitar de novo não cria outra versão'
);
select is(
  public.get_company_context('5d100000-0000-0000-0000-000000000001') ->> 'icp',
  'ICP primário: incorporadoras de SP.', 'a sugestão aceita é a vigente'
);
select is(
  public.get_company_context('5d100000-0000-0000-0000-000000000001') -> 'generation',
  'null'::jsonb, 'sem sugestão pendente depois do aceite'
);

-- 7. Descartar conserva a vigente.
insert into _ids select 'g3', (public.start_company_context_generation('5d100000-0000-0000-0000-000000000001') ->> 'generation_id')::uuid;
reset role;
set local role service_role;
select public.finish_company_context_generation((select id from _ids where nome = 'g3'),
  'Texto descartado', 'ICP descartado', 'Personas descartadas', '[]', 'openai:gpt', 'contexto-v1', 0.001, null);
reset role;
set local role authenticated;
select lives_ok(
  format('select public.discard_company_context_generation(%L, %L)', '5d100000-0000-0000-0000-000000000001', (select id from _ids where nome = 'g3')),
  'o Administrador descarta a sugestão'
);
select is(
  public.get_company_context('5d100000-0000-0000-0000-000000000001') ->> 'version',
  '2', 'descartar conserva a versão vigente'
);

-- 8. Falha conserva a vigente e aparece na tela.
insert into _ids select 'g4', (public.start_company_context_generation('5d100000-0000-0000-0000-000000000001') ->> 'generation_id')::uuid;
reset role;
set local role service_role;
select is(
  public.finish_company_context_generation((select id from _ids where nome = 'g4'),
    null, null, null, '["https://norte.com.br/"]', 'openai:gpt', 'contexto-v1', 0, 'site_insuficiente') ->> 'state',
  'falha', 'site insuficiente é falha, sem texto inventado'
);
reset role;
set local role authenticated;
select is(
  public.get_company_context('5d100000-0000-0000-0000-000000000001') -> 'generation' ->> 'failure',
  'site_insuficiente', 'a tela vê o motivo da falha'
);
select is(
  public.get_company_context('5d100000-0000-0000-0000-000000000001') ->> 'version',
  '2', 'a falha conserva a versão vigente'
);

-- 9. No Workspace Sul, uma edição à mão durante a primeira leitura não é sobrescrita pela resposta atrasada.
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000003', true);
insert into _ids select 'g5', (public.start_company_context_generation('5d100000-0000-0000-0000-000000000002', 'sul.com.br') ->> 'generation_id')::uuid;
select is(
  public.save_company_context('5d100000-0000-0000-0000-000000000002', 'Escrito à mão', 'ICP à mão', 'Personas à mão', null),
  1, 'o Administrador salva à mão enquanto a leitura roda'
);
reset role;
set local role service_role;
select is(
  public.finish_company_context_generation((select id from _ids where nome = 'g5'),
    'Gerado', 'ICP gerado', 'Personas geradas', '[]', 'openai:gpt', 'contexto-v1', 0.001, null) ->> 'state',
  'sugestao', 'a resposta atrasada vira sugestão'
);
reset role;
set local role authenticated;
select is(
  public.get_company_context('5d100000-0000-0000-0000-000000000002') ->> 'empresa',
  'Escrito à mão', 'a edição à mão continua vigente'
);

-- 10. Uma leitura esquecida passa do prazo e não trava a próxima.
reset role;
update private.company_context_generations set state = 'gerando', created_at = now() - interval '10 minutes'
where id = (select id from _ids where nome = 'g4');
set local role authenticated;
select set_config('request.jwt.claim.sub', '5d000000-0000-0000-0000-000000000001', true);
select isnt(
  (public.start_company_context_generation('5d100000-0000-0000-0000-000000000001') ->> 'generation_id')::uuid,
  (select id from _ids where nome = 'g4'), 'a leitura vencida vira falha e uma nova começa'
);

select * from finish();
rollback;
