-- Pedido de Sinal vira Modelo (Trilha C, ticket 5b). A equipe Althius monta o Sinal pedido e o publica como um Modelo
-- privado do Workspace que pediu: um card de signal_catalog com workspace_id (a política já existente só mostra ao
-- próprio Workspace), cuja versão de Modelo recebe o plano montado pela equipe. O pedido fica "disponivel" e guarda o
-- Modelo em model_id, para a tela oferecer "Usar o Modelo". Só a equipe publica; repetir devolve o mesmo Modelo.
-- Editar depois o card pelo catálogo gera uma versão nova a partir do card (refresh_signal_model_seed), sem o plano.

alter table public.signal_requests add column model_id text references public.signal_catalog(id);

create function public.publish_signal_request_as_model(
  p_request_id uuid, p_nome text, p_briefing text, p_plano jsonb,
  p_agenda jsonb default '{"horarios":["08:00"],"dias":[1,2,3,4,5]}'::jsonb
) returns text language plpgsql security definer set search_path = '' as $$
declare
  v_request public.signal_requests%rowtype;
  v_catalog_id text;
  v_version integer;
  v_snapshot jsonb;
begin
  perform private.require_user();
  if not private.is_althius_staff((select auth.uid())) then
    raise exception 'only the Althius team publishes signal models' using errcode = '42501';
  end if;
  select * into v_request from public.signal_requests where id = p_request_id for update;
  if not found then raise exception 'signal request not found' using errcode = 'P0002'; end if;
  if length(btrim(coalesce(p_nome, ''))) not between 1 and 120
     or length(btrim(coalesce(p_briefing, ''))) not between 1 and 400
     or jsonb_typeof(p_plano) <> 'object'
     or jsonb_typeof(p_plano->'sinais') is distinct from 'array'
     or jsonb_array_length(p_plano->'sinais') = 0 then
    raise exception 'invalid signal model' using errcode = '22023';
  end if;
  if v_request.model_id is not null then return v_request.model_id; end if;
  v_catalog_id := 'pedido-' || replace(p_request_id::text, '-', '');
  v_snapshot := jsonb_build_object('id', v_catalog_id, 'name', btrim(p_nome), 'phrase', btrim(p_briefing), 'family', 'historico-comercial', 'source_label', 'Pedido à equipe Althius', 'collector_types', array[]::text[], 'job_filters', null);
  insert into public.signal_catalog (id, name, phrase, family, source_label, estimated_cost_label, collector_types, job_filters, workspace_id, sort_order)
  values (v_catalog_id, btrim(p_nome), btrim(p_briefing), 'historico-comercial', 'Pedido à equipe Althius', 'A definir', '{}', null, v_request.workspace_id, 100000);
  select max(version) into v_version from public.signal_model_versions where catalog_id = v_catalog_id;
  update public.signal_model_versions
    set source_snapshot = v_snapshot, seed_plan = p_plano || jsonb_build_object('origem', 'modelo', 'modeloId', v_catalog_id || '@' || v_version::text), suggested_schedule = p_agenda
    where catalog_id = v_catalog_id and version = v_version;
  update public.signal_requests set status = 'disponivel', model_id = v_catalog_id where id = p_request_id;
  return v_catalog_id;
end;
$$;
revoke all on function public.publish_signal_request_as_model(uuid, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.publish_signal_request_as_model(uuid, text, text, jsonb, jsonb) to authenticated;

-- A lista de pedidos passa a devolver o Modelo publicado (model_id), para a tela oferecer "Usar o Modelo". Mudar as
-- colunas devolvidas exige recriar a função; mesma checagem de membro e mesmas permissões.
drop function public.list_signal_requests(uuid);
create function public.list_signal_requests(p_workspace_id uuid)
returns table(id uuid, evento text, empresas_ou_nicho text, fontes_conhecidas text, urgencia text, contato jsonb,
  status text, created_at timestamptz, model_id text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = (select auth.uid()) and m.active
  ) then
    raise exception 'not a member of this workspace' using errcode = '42501';
  end if;
  return query
  select r.id, r.evento, r.empresas_ou_nicho, r.fontes_conhecidas, r.urgencia, r.contato, r.status, r.created_at, r.model_id
  from public.signal_requests r
  where r.workspace_id = p_workspace_id
  order by r.created_at desc;
end;
$$;
revoke all on function public.list_signal_requests(uuid) from public, anon;
grant execute on function public.list_signal_requests(uuid) to authenticated;
