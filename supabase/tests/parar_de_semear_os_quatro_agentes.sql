begin;
create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public;
-- Sinais first 13: o Workspace novo nasce sem os quatro Agentes padrão; os que já existem ficam como estão.
select plan(15);

create function pg_temp.semear_agentes_padrao(p_workspace_id uuid)
returns void
language plpgsql
as $$
begin
  with novos as (
    insert into private.agents (workspace_id, specialty, kind)
    select p_workspace_id, c.specialty, 'padrao'
    from private.specialty_catalog c
    on conflict do nothing
    returning id, workspace_id, specialty
  ), configuracao as (
    insert into private.agent_settings (agent_id, workspace_id, channels)
    select n.id, n.workspace_id, array['whatsapp']::text[] from novos n
  )
  insert into private.agent_permissions (agent_id, workspace_id, integration_id, permission)
  select n.id, n.workspace_id, d.integration_id, d.permission
  from novos n
  join private.specialty_default_permissions d on d.specialty = n.specialty;
end;
$$;

insert into public.workspaces (id, kind, name) values
  ('13000000-0000-4000-8000-000000000001', 'empresa', 'Novo sem Agentes'),
  ('13000000-0000-4000-8000-000000000002', 'empresa', 'Antigo com Agentes'),
  ('13000000-0000-4000-8000-000000000003', 'empresa', 'Isolamento B');

select pg_temp.semear_agentes_padrao('13000000-0000-4000-8000-000000000002');

select is((select count(*)::int from private.agents where workspace_id = '13000000-0000-4000-8000-000000000001'), 0,
  'Workspace novo nasce sem Agentes padrão');
select is((select count(*)::int from private.agent_settings where workspace_id = '13000000-0000-4000-8000-000000000001'), 0,
  'Workspace novo nasce sem configurações de Agente');
select is((select count(*)::int from private.agent_permissions where workspace_id = '13000000-0000-4000-8000-000000000001'), 0,
  'Workspace novo nasce sem permissões de Integração');
select is((select count(*)::int from private.agent_step_permissions where workspace_id = '13000000-0000-4000-8000-000000000001'), 0,
  'Workspace novo nasce sem permissões de passo');

select lives_ok($$select private.seed_default_agents('13000000-0000-4000-8000-000000000001')$$,
  'chamar a função desligada não falha');
select has_function('private', 'seed_default_agents', ARRAY['uuid'], 'a função de semeadura continua existindo');
select has_trigger('public', 'workspaces', 'seed_agents_of_new_workspace', 'o gatilho de Workspace continua existindo');

select is((select count(*)::int from private.agents where workspace_id = '13000000-0000-4000-8000-000000000002'), 4,
  'Agentes existentes continuam preservados');
select is((select count(*)::int from private.agent_settings where workspace_id = '13000000-0000-4000-8000-000000000002'), 4,
  'configurações existentes continuam preservadas');
select is((select count(*)::int from private.agent_permissions where workspace_id = '13000000-0000-4000-8000-000000000002'), 14,
  'permissões existentes continuam preservadas');
select lives_ok($$select private.seed_default_agents('13000000-0000-4000-8000-000000000002')$$,
  'repetir a função não altera o Workspace existente');
select is((select count(*)::int from private.agents where workspace_id = '13000000-0000-4000-8000-000000000002'), 4,
  'repetir a função mantém os quatro Agentes');

select is((select count(*)::int from private.agents where workspace_id = '13000000-0000-4000-8000-000000000003'), 0,
  'criar outro Workspace não semeia Agentes');
select is((select count(*)::int from private.agents where workspace_id = '13000000-0000-4000-8000-000000000002'), 4,
  'criar outro Workspace não altera o Workspace antigo');

-- Um Rhetor criado depois (pelo caminho de antes ou por um Agente personalizado futuro) continua recebendo a permissão de
-- Sequência pelo gatilho do ticket 11; a auditoria das funções que procuravam o Agente padrão está em
-- auditoria_sem_agentes_padrao.sql, com cenário real.
select is((select count(*)::int from private.agent_step_permissions where workspace_id = '13000000-0000-4000-8000-000000000002'), 1,
  'o Rhetor do Workspace antigo segue com a permissão de Sequência');

select * from finish();
rollback;
