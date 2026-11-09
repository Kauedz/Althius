-- Configuração automática no onboarding (spec contexto-da-empresa, ticket 03). O site do Day0 é o do Contexto da
-- empresa: confirmado, a tela pede a geração do ticket 02 (start_company_context_generation). O Administrador original
-- também pode deixar o site para depois e informá-lo em Configurações; isso não bloqueia a entrada.
-- O mini-ICP deixa de ser perguntado na tela. A ação `produto` e as colunas dele ficam, sem uso, até o ticket 07.

alter table public.day0_companies add column site_skipped boolean not null default false;

-- Redefinida a partir de 20261214102000_icp_estruturado_unico.sql: com o site pulado e ainda vazio, o Day0 não para
-- no passo do site, e o estado diz que ele ficou para depois. Informado o site (no Day0 ou em Configurações), o pulo
-- deixa de valer.
create or replace function public.get_my_day0(p_workspace_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_role text := private.require_active_membership(p_workspace_id);
  v_invited boolean;
  v_account public.day0_accounts;
  v_company public.day0_companies;
  v_done boolean;
  v_site_skipped boolean;
  v_step text;
begin
  v_invited := v_role <> 'admin' or private.day0_is_invited(p_workspace_id);
  select * into v_account from public.day0_accounts where user_id = auth.uid();
  select * into v_company from public.day0_companies where workspace_id = p_workspace_id;
  v_done := exists (select 1 from public.day0_completions where workspace_id = p_workspace_id and user_id = auth.uid());
  v_site_skipped := coalesce(v_company.site_skipped, false) and coalesce(v_company.dominio, '') = '';
  v_step := case
    when v_done then 'checklist'
    when v_account.papel is null and not coalesce(v_account.personal_done, false) then 'papel'
    when not v_invited and coalesce(v_company.empresa, '') = '' then 'empresa'
    when not v_invited and coalesce(v_company.dominio, '') = '' and not v_site_skipped then 'dominio'
    when not coalesce(v_account.personal_done, false) then 'hdyhau'
    else 'convite' end;
  return jsonb_build_object('ramo', case when v_invited then 'convidado' else 'criador' end,
    'etapa', v_step, 'papel', v_account.papel, 'comoConheceu', v_account.como_conheceu,
    'empresa', coalesce(v_company.empresa, ''), 'dominio', coalesce(v_company.dominio, ''),
    'logoDoSite', v_company.logo, 'concluido', v_done, 'sitePulado', v_site_skipped,
    'miniIcp', coalesce(v_company.mini_icp, ''), 'oQueVende', coalesce(v_company.o_que_vende, ''),
    'porQueCompram', coalesce(v_company.por_que_compram, ''));
end;
$$;
revoke all on function public.get_my_day0(uuid) from public, anon, authenticated;
grant execute on function public.get_my_day0(uuid) to authenticated;

-- Redefinida a partir de 20261219030000_sem_icp_estruturado.sql, com a ação `pular_site`: só o Administrador
-- original, sem valor. Com site já cadastrado, não muda nada.
create or replace function public.save_my_day0(p_workspace_id uuid, p_action text, p_value text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_role text;
  v_invited boolean;
  v_product jsonb;
  v_o_que_vende text;
  v_mini_icp text;
  v_por_que_compram text;
begin
  v_role := private.lock_caller_membership(p_workspace_id);
  v_invited := v_role <> 'admin' or private.day0_is_invited(p_workspace_id);
  insert into public.day0_accounts (user_id) values (auth.uid()) on conflict do nothing;
  perform 1 from public.day0_accounts where user_id = auth.uid() for update;
  if p_action = 'concluir' then
    update public.day0_accounts set personal_done = true where user_id = auth.uid();
    insert into public.day0_completions (workspace_id, user_id) values (p_workspace_id, auth.uid()) on conflict do nothing;
  elsif p_action in ('papel', 'hdyhau') then
    if p_value is null then raise exception 'invalid Day0 value' using errcode = '22023'; end if;
    if not (select personal_done from public.day0_accounts where user_id = auth.uid()) then
      if p_action = 'papel' then
        update public.day0_accounts set papel = p_value where user_id = auth.uid();
      else
        update public.day0_accounts set como_conheceu = p_value, personal_done = true where user_id = auth.uid();
      end if;
    end if;
  elsif p_action = 'pular_site' then
    if v_invited then raise exception 'company Day0 requires original administrator' using errcode = '42501'; end if;
    if p_value is not null then raise exception 'invalid Day0 value' using errcode = '22023'; end if;
    insert into public.day0_companies (workspace_id) values (p_workspace_id) on conflict do nothing;
    update public.day0_companies set site_skipped = true where workspace_id = p_workspace_id and dominio = '';
  elsif p_action in ('empresa', 'dominio', 'produto') then
    if v_invited then raise exception 'company Day0 requires original administrator' using errcode = '42501'; end if;
    if p_action = 'produto' then
      begin
        v_product := p_value::jsonb;
      exception when others then
        raise exception 'invalid Day0 product' using errcode = '22023';
      end;
      if jsonb_typeof(v_product) <> 'object'
        or exists (select 1 from jsonb_object_keys(v_product) k where k not in ('miniIcp', 'oQueVende', 'porQueCompram'))
        or jsonb_typeof(v_product -> 'miniIcp') is distinct from 'string'
        or jsonb_typeof(v_product -> 'oQueVende') is distinct from 'string'
        or jsonb_typeof(v_product -> 'porQueCompram') is distinct from 'string' then
        raise exception 'invalid Day0 product' using errcode = '22023';
      end if;
      v_mini_icp := v_product ->> 'miniIcp';
      v_o_que_vende := v_product ->> 'oQueVende';
      v_por_que_compram := v_product ->> 'porQueCompram';
      if length(v_mini_icp) > 2000 or length(v_o_que_vende) > 2000 or length(v_por_que_compram) > 2000 then
        raise exception 'Day0 product field too long' using errcode = '22023';
      end if;
      insert into public.day0_companies (workspace_id) values (p_workspace_id) on conflict do nothing;
      update public.day0_companies set mini_icp = v_mini_icp, o_que_vende = v_o_que_vende,
        por_que_compram = v_por_que_compram where workspace_id = p_workspace_id;
    else
      if p_value is null or btrim(p_value) = '' then raise exception 'invalid Day0 value' using errcode = '22023'; end if;
      insert into public.day0_companies (workspace_id) values (p_workspace_id) on conflict do nothing;
      if p_action = 'empresa' then
        update public.day0_companies set empresa = btrim(p_value) where workspace_id = p_workspace_id;
      else
        if length(p_value) > 253 or p_value !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$'
          or exists (select 1 from unnest(string_to_array(p_value, '.')) as labels(label)
            where length(label) > 63 or label !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$') then
          raise exception 'invalid Day0 domain' using errcode = '22023';
        end if;
        update public.day0_companies set dominio = p_value, logo = null where workspace_id = p_workspace_id;
      end if;
    end if;
  else
    raise exception 'invalid Day0 action' using errcode = '22023';
  end if;
  return public.get_my_day0(p_workspace_id);
end;
$$;
revoke all on function public.save_my_day0(uuid, text, text) from public, anon, authenticated;
grant execute on function public.save_my_day0(uuid, text, text) to authenticated;
