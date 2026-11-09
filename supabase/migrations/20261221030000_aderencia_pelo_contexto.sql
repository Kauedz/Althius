-- Aderência pelo Contexto da empresa (spec contexto-da-empresa, ticket 05). A explicação da Aderência de uma Descoberta
-- passa a ler o contexto que a busca usou — a versão e os perfis gravados no registro da busca
-- (`discovery_runs.criteria`, origem `contexto_da_empresa`, ticket 04) — e deixa de ler o ICP antigo do Day0
-- (`day0_companies.o_que_vende`) como apoio.
--
-- As explicações já guardadas foram escritas contra o ICP antigo: a impressão digital ganha uma versão, então elas
-- deixam de valer na próxima leitura e uma nova é escrita só quando alguém pede. Nada é apagado nem reescrito em massa:
-- notas, motivos, Descobertas e buscas continuam como estão.
--
-- Redefinidas a partir da definição mais recente da main: `private.discovered_account_fit_fingerprint`
-- (20261218004000) e `public.get_discovered_account_fit_explanation` (20261219030000).

create or replace function private.discovered_account_fit_fingerprint(p_fit_level text, p_reasons jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5('contexto-v1|' || coalesce(p_fit_level, '') || '|' || coalesce(p_reasons::text, ''))
$$;
revoke all on function private.discovered_account_fit_fingerprint(text, jsonb) from public, anon, authenticated;

create or replace function public.get_discovered_account_fit_explanation(p_discovered_account_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  d private.discovered_accounts%rowtype;
  v_criteria jsonb;
  v_contexto jsonb;
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

  -- O contexto que a busca usou: só o que a busca gravou (versão, perfis, critérios aplicados com o trecho e os
  -- pendentes com o motivo). Busca sem contexto, ou Descoberta sem busca, fica sem contexto: não há outro ICP de apoio.
  select r.criteria into v_criteria
    from private.discovery_runs r
   where r.id = d.run_id and r.workspace_id = d.workspace_id;
  if v_criteria ->> 'origem' = 'contexto_da_empresa'
     and jsonb_typeof(v_criteria -> 'contexto' -> 'versao') = 'number'
     and jsonb_typeof(v_criteria -> 'perfis') = 'array' then
    v_contexto := jsonb_build_object(
      'versao', (v_criteria -> 'contexto' ->> 'versao')::integer,
      'perfis', coalesce((
        select jsonb_agg(jsonb_build_object(
          'nome', coalesce(p ->> 'nome', ''),
          'aplicados', case when jsonb_typeof(p -> 'aplicados') = 'array' then p -> 'aplicados' else '[]'::jsonb end,
          'pendentes', case when jsonb_typeof(p -> 'pendentes') = 'array' then p -> 'pendentes' else '[]'::jsonb end
        ) order by n)
        from jsonb_array_elements(v_criteria -> 'perfis') with ordinality as e(p, n)
        where jsonb_typeof(p) = 'object'
      ), '[]'::jsonb)
    );
  end if;

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
    'contexto', v_contexto,
    'explanation', case when v_fresca then d.fit_explanation end,
    'explanationSource', case when v_fresca then d.fit_explanation_source end,
    'modelAllowed', v_usos_hoje < 50
  );
end;
$$;
revoke all on function public.get_discovered_account_fit_explanation(uuid) from public, anon;
grant execute on function public.get_discovered_account_fit_explanation(uuid) to authenticated;
