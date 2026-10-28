-- Modelos versionados: cada impressão dos campos de origem gera uma versão imutável.
create table public.signal_model_versions (
  id bigint generated always as identity primary key,
  catalog_id text not null references public.signal_catalog(id),
  version integer not null check (version > 0),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{32}$'),
  source_snapshot jsonb not null,
  seed_plan jsonb not null,
  suggested_schedule jsonb not null default '{"horarios":["08:00"],"dias":[1,2,3,4,5]}'::jsonb,
  created_at timestamptz not null default now(),
  current boolean not null default true,
  unique (catalog_id, version)
);
create unique index signal_model_one_current_idx on public.signal_model_versions(catalog_id) where current;
create index signal_model_versions_catalog_idx on public.signal_model_versions(catalog_id, version desc);
alter table public.signal_model_versions enable row level security;
revoke all on public.signal_model_versions from public, anon, authenticated, service_role;

create policy "workspace members read model versions"
  on public.signal_model_versions for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.user_id = (select auth.uid()) and m.active
  ));

create function private.refresh_signal_model_seed(p_catalog_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_card public.signal_catalog%rowtype;
  v_niches jsonb;
  v_snapshot jsonb;
  v_fingerprint_source jsonb;
  v_fingerprint text;
  v_version integer;
  v_seed jsonb;
  v_plan_type text;
  v_criteria jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended('signal-model:' || p_catalog_id, 0));
  select * into v_card from public.signal_catalog c where c.id = p_catalog_id;
  if not found then return; end if;
  select coalesce(jsonb_agg(n.niche_slug order by n.niche_slug), '[]'::jsonb)
    into v_niches from public.signal_catalog_niches n where n.catalog_id = p_catalog_id;
  v_snapshot := jsonb_build_object(
    'id', v_card.id, 'name', v_card.name, 'phrase', v_card.phrase, 'family', v_card.family,
    'source_label', v_card.source_label, 'collector_types', to_jsonb(v_card.collector_types),
    'job_filters', v_card.job_filters, 'niches', v_niches
  );
  v_fingerprint_source := v_snapshot || jsonb_build_object(
    'estimated_cost_label', v_card.estimated_cost_label,
    'estimated_cost_usd', v_card.estimated_cost_usd
  );
  v_fingerprint := md5(v_fingerprint_source::text);
  if exists (select 1 from public.signal_model_versions v where v.catalog_id = p_catalog_id
    and v.current and v.fingerprint = v_fingerprint) then return; end if;
  update public.signal_model_versions set current = false where catalog_id = p_catalog_id and current;
  select coalesce(max(v.version), 0) + 1 into v_version from public.signal_model_versions v where v.catalog_id = p_catalog_id;
  v_plan_type := case
    when v_card.collector_types && array['vaga_linkedin','vaga_indeed','vaga_comex','vaga_logistica','vaga_engenharia_manutencao'] then 'vaga_linkedin'
    when v_card.collector_types && array['nova_lideranca'] then 'nova_lideranca'
    when v_card.collector_types && array['entradas_e_saidas'] then 'entradas_e_saidas'
    when v_card.collector_types && array['mudanca_de_emprego'] then 'mudanca_de_emprego'
    when v_card.collector_types && array['anuncio_de_movimentacao'] then 'anuncio_de_movimentacao'
    when v_card.collector_types && array['anuncio_meta'] then 'anuncio_meta'
    when v_card.collector_types && array['anuncio_google'] then 'anuncio_google'
    when v_card.collector_types && array['anuncio_linkedin'] then 'anuncio_linkedin'
    when v_card.collector_types && array['avaliacoes_google_maps'] then 'avaliacoes_google_maps'
    when v_card.collector_types && array['crescimento_de_equipes','cruzando_faixa_de_headcount'] then 'crescimento_de_equipes'
    when v_card.collector_types && array['sem_resposta','negociacao_parada','proposta_recusada'] then 'publicacao_da_empresa'
    when v_card.family = 'vagas-e-equipes' then 'crescimento_de_equipes'
    when v_card.family = 'movimentacao-profissional' then 'publicacao_da_empresa'
    when v_card.family = 'anuncios' then 'anuncio_google'
    when v_card.family = 'reputacao-e-concorrencia' then 'avaliacoes_google_maps'
    else 'publicacao_da_empresa'
  end;
  v_criteria := case
    when v_plan_type = 'vaga_linkedin' then jsonb_build_object(
      'periodo', 'Últimos 30 dias',
      'funcoes', coalesce((select jsonb_agg(distinct f.funcao) from jsonb_each(v_card.job_filters) j cross join lateral jsonb_array_elements_text(j.value) as f(funcao)), '[]'::jsonb)
    )
    when v_plan_type in ('nova_lideranca','entradas_e_saidas','mudanca_de_emprego','anuncio_de_movimentacao')
      then jsonb_build_object('periodo', 'Últimos 30 dias')
    when v_plan_type in ('anuncio_meta','anuncio_google','anuncio_linkedin','publicacao_da_empresa')
      then jsonb_build_object('periodo', 'Últimos 30 dias')
    when v_plan_type = 'avaliacoes_google_maps' then jsonb_build_object('periodo', 'Últimos 30 dias')
    when v_plan_type = 'crescimento_de_equipes' then '{}'::jsonb
    else '{}'::jsonb
  end;
  v_seed := jsonb_build_object(
    'versao', 1, 'origem', 'modelo',
    'escopo', jsonb_build_object('tipo', 'contas', 'contaIds', '[]'::jsonb),
    'sinais', jsonb_build_array(jsonb_build_object('tipo', v_plan_type, 'criterios', v_criteria)),
    'explicacao', left(v_card.phrase, 500), 'maxEmpresasPorRodada', 25,
    'modeloId', v_card.id || '@' || v_version::text
  );
  insert into public.signal_model_versions (catalog_id, version, fingerprint, source_snapshot, seed_plan)
  values (p_catalog_id, v_version, v_fingerprint, v_snapshot, v_seed);
end;
$$;
revoke all on function private.refresh_signal_model_seed(text) from public, anon, authenticated, service_role;

create function private.refresh_signal_model_seed_from_card()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_signal_model_seed(new.id);
  return new;
end;
$$;
revoke all on function private.refresh_signal_model_seed_from_card() from public, anon, authenticated, service_role;
create trigger signal_catalog_refresh_model_seed
  after insert or update of name, phrase, family, source_label, collector_types, job_filters,
    estimated_cost_label, estimated_cost_usd on public.signal_catalog
  for each row execute function private.refresh_signal_model_seed_from_card();

create function private.refresh_signal_model_seed_from_niche()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_signal_model_seed(old.catalog_id);
    return old;
  end if;
  perform private.refresh_signal_model_seed(new.catalog_id);
  if tg_op = 'UPDATE' and old.catalog_id is distinct from new.catalog_id then
    perform private.refresh_signal_model_seed(old.catalog_id);
  end if;
  return new;
end;
$$;
revoke all on function private.refresh_signal_model_seed_from_niche() from public, anon, authenticated, service_role;
create trigger signal_catalog_niche_refresh_model_seed
  after insert or update or delete on public.signal_catalog_niches
  for each row execute function private.refresh_signal_model_seed_from_niche();

do $$
declare v_id text;
begin
  for v_id in select c.id from public.signal_catalog c order by c.id loop
    perform private.refresh_signal_model_seed(v_id);
  end loop;
end;
$$;

create view public.current_signal_models as
select v.catalog_id, v.version, v.fingerprint, v.source_snapshot, v.seed_plan, v.suggested_schedule, v.created_at
from public.signal_model_versions v where v.current;
revoke all on public.current_signal_models from public, anon, authenticated, service_role;

create function public.list_signal_models(p_workspace_id uuid)
returns table (catalog_id text, version integer, fingerprint text, source_snapshot jsonb,
  seed_plan jsonb, suggested_schedule jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
    select v.catalog_id, v.version, v.fingerprint, v.source_snapshot - 'estimated_cost_label' - 'estimated_cost_usd', v.seed_plan, v.suggested_schedule, v.created_at
    from public.current_signal_models v
    join public.signal_catalog c on c.id = v.catalog_id
    where c.workspace_id is null or c.workspace_id = p_workspace_id
    order by c.sort_order, c.id;
end;
$$;
revoke all on function public.list_signal_models(uuid) from public, anon;
grant execute on function public.list_signal_models(uuid) to authenticated;

-- Cotação inicial do Modelo sem criar Monitoramento: usa a mesma tabela de preço por tipo e a mesma Agenda do produto.
create function public.quote_signal_model_seed(p_workspace_id uuid, p_signal_type text, p_account_count integer,
  p_schedule jsonb default '{"horarios":["08:00"],"dias":[1,2,3,4,5]}'::jsonb)
returns table (por_rodada integer, por_dia integer, por_mes_aprox integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_per_account integer;
  v_accounts integer := greatest(0, least(coalesce(p_account_count, 0), 500));
  v_per_day integer;
  v_per_week integer;
begin
  perform private.require_active_membership(p_workspace_id);
  perform private.validate_signal_schedule(p_schedule, v_accounts);
  v_per_account := private.scan_credits(p_signal_type);
  v_per_day := jsonb_array_length(p_schedule -> 'horarios');
  v_per_week := v_per_day * jsonb_array_length(p_schedule -> 'dias');
  return query select
    v_per_account * v_accounts,
    v_per_account * v_accounts * v_per_day,
    ceil((v_per_week * 52 * v_per_account * v_accounts)::numeric / 12)::integer;
end;
$$;
revoke all on function public.quote_signal_model_seed(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.quote_signal_model_seed(uuid, text, integer, jsonb) to authenticated;
