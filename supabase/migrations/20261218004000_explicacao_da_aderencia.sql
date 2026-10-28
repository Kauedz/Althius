-- Fase 6b: a explicação da Aderência escrita por IA. A nota continua determinística (account-discovery/pontuacao.ts e
-- private.score_market_discovery_icp); nada aqui lê ou grava fit_level, fit_score ou reasons, só os quatro campos da
-- explicação. A impressão digital (fit_level + reasons) é calculada só no banco: quando a nota muda, a explicação
-- guardada deixa de valer e a leitura não a devolve.
alter table private.discovered_accounts
  add column if not exists fit_explanation text,
  add column if not exists fit_explanation_source text,
  add column if not exists fit_explanation_at timestamptz,
  add column if not exists fit_explanation_fingerprint text;

alter table private.discovered_accounts
  drop constraint if exists discovered_accounts_fit_explanation_check;
alter table private.discovered_accounts
  add constraint discovered_accounts_fit_explanation_check check (
    (fit_explanation is null and fit_explanation_source is null)
    or (fit_explanation_source in ('ia', 'regra') and char_length(fit_explanation) between 1 and 400)
  );

create or replace function private.discovered_account_fit_fingerprint(p_fit_level text, p_reasons jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(coalesce(p_fit_level, '') || '|' || coalesce(p_reasons::text, ''))
$$;
revoke all on function private.discovered_account_fit_fingerprint(text, jsonb) from public, anon, authenticated;

-- Leitura para a função account-fit-explanation, com o JWT de quem pede: só membro ativo do Workspace da Descoberta.
create or replace function public.get_discovered_account_fit_explanation(p_discovered_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d private.discovered_accounts%rowtype;
  i private.workspace_icp_versions%rowtype;
  v_fresca boolean;
  v_usos_hoje integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into d from private.discovered_accounts where id = p_discovered_account_id;
  -- Quem não é membro ativo recebe a mesma resposta de quem pede um id que não existe.
  if not found or not exists (
    select 1 from public.workspace_memberships m
     where m.workspace_id = d.workspace_id and m.user_id = auth.uid() and m.active
  ) then
    raise exception 'discovered account not found' using errcode = 'P0002';
  end if;

  select * into i from private.workspace_icp_versions
   where workspace_id = d.workspace_id order by version desc limit 1;

  v_fresca := d.fit_explanation is not null
    and d.fit_explanation_fingerprint = private.discovered_account_fit_fingerprint(d.fit_level, d.reasons);

  select count(*) into v_usos_hoje from private.discovered_accounts x
   where x.workspace_id = d.workspace_id and x.fit_explanation_source = 'ia'
     and x.fit_explanation_at >= date_trunc('day', now());

  return jsonb_build_object(
    'id', d.id,
    'workspaceId', d.workspace_id,
    'name', d.name,
    'sector', d.sector,
    'size', d.size_label,
    'location', coalesce(d.location, concat_ws(', ', d.city, d.uf, d.country)),
    'description', left(d.description, 600),
    'fitLevel', d.fit_level,
    'fitScore', d.fit_score,
    'reasons', coalesce(d.reasons, '[]'::jsonb),
    'icp', jsonb_build_object('setor', i.sector, 'porte', i.company_size, 'geografia', i.geography,
      'oQueVende', i.o_que_vende),
    'explanation', case when v_fresca then d.fit_explanation end,
    'explanationSource', case when v_fresca then d.fit_explanation_source end,
    'modelAllowed', v_usos_hoje < 50
  );
end;
$$;
revoke all on function public.get_discovered_account_fit_explanation(uuid) from public, anon;
grant execute on function public.get_discovered_account_fit_explanation(uuid) to authenticated;

-- Gravação só pela função (service_role). Grava a explicação com a impressão digital da nota atual da linha.
create or replace function public.save_discovered_account_fit_explanation(
  p_discovered_account_id uuid, p_explanation text, p_source text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source is null or p_source not in ('ia', 'regra')
     or p_explanation is null or char_length(btrim(p_explanation)) not between 1 and 400 then
    raise exception 'invalid fit explanation' using errcode = '22023';
  end if;
  update private.discovered_accounts
     set fit_explanation = btrim(p_explanation),
         fit_explanation_source = p_source,
         fit_explanation_at = now(),
         fit_explanation_fingerprint = private.discovered_account_fit_fingerprint(fit_level, reasons)
   where id = p_discovered_account_id;
end;
$$;
revoke all on function public.save_discovered_account_fit_explanation(uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_discovered_account_fit_explanation(uuid, text, text) to service_role;
