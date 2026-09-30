-- Sinais de movimentação de pessoas (sinais-reais, ticket 04): quatro actors do LinkedIn ganham adaptador no
-- signal-runner. Aqui:
--
-- 1. "Contato mudou de emprego ou foi promovido" lê o perfil dos Contatos da Conta, então a varredura passa a receber,
--    em cada Conta, o LinkedIn dos Contatos com vínculo ativo e não arquivados (`contatos`: id e perfil, nada mais;
--    até 25 por Conta, o limite do adaptador). `claim_due_signal_monitors` e `claim_signal_rescans` são redefinidas a
--    partir da definição mais recente (20260930180000 e 20260930200000), mudando só o objeto da Conta. Decisão do Nan
--    em 30/09/2026.
-- 2. O registro dos actors não muda aqui: preço, versão, teto e "disponível" entram depois da execução real (passo do
--    Nan, `.scratch/sinais-reais/registro-apos-o-teste.sql`).

-- O LinkedIn dos Contatos da Conta para a varredura: só vínculo ativo, Contato não arquivado e perfil /in/.
create function private.signal_scan_contacts(p_workspace_id uuid, p_target_account_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'linkedinUrl', x.linkedin) order by x.name, x.id), '[]'::jsonb)
  from (
    select c.id, c.name, c.linkedin
    from public.contact_account_links l
    join public.contacts c on c.workspace_id = l.workspace_id and c.id = l.contact_id
    where l.workspace_id = p_workspace_id and l.target_account_id = p_target_account_id and l.ended_at is null
      and c.archived_at is null and c.linkedin ~* 'linkedin\.com/in/[^/?#]+'
    order by c.name, c.id
    limit 25
  ) x;
$$;

revoke all on function private.signal_scan_contacts(uuid, uuid) from public, anon, authenticated, service_role;

create or replace function public.claim_due_signal_monitors(p_limit integer default 5)
returns table (
  monitor_id uuid, workspace_id uuid, signal_type text, criteria jsonb, created_by uuid, slot timestamptz, accounts jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  with due as (
    select m.id from private.signal_monitors m
    join private.signal_actors a on a.signal_type = m.signal_type and a.state = 'available'
    where m.state = 'ativo' and m.next_run_at <= now() and (m.claimed_until is null or m.claimed_until < now())
    order by m.next_run_at, m.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of m skip locked
  ), claimed as (
    update private.signal_monitors m set claimed_until = now() + interval '15 minutes'
    from due where m.id = due.id
    returning m.*
  )
  select c.id, c.workspace_id, c.signal_type, c.criteria,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.created_by and p.active),
    c.next_run_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'domain', x.domain, 'linkedinUrl', x.linkedin_url,
          'contatos', private.signal_scan_contacts(c.workspace_id, x.id))
        order by (((x.pos - 1 - c.scan_offset) % x.total) + x.total) % x.total)
      from (
        select t.id, t.name, t.domain, t.linkedin_url,
          row_number() over (order by t.name, t.id) as pos, count(*) over () as total
        from public.target_accounts t
        where t.workspace_id = c.workspace_id and t.archived_at is null and t.deleted_at is null
          and t.id::text in (select jsonb_array_elements_text(c.audience -> 'accountIds'))
      ) x
    ), '[]'::jsonb)
  from claimed c;
end;
$$;

create or replace function public.claim_signal_rescans(p_limit integer default 5)
returns table (
  rescan_id uuid, workspace_id uuid, origin text, requested_by uuid, requested_at timestamptz, account jsonb, monitors jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.signal_rescans r set state = 'stopped', finished_at = now(), claimed_until = null,
    last_error = 'A Conta foi arquivada ou apagada.'
  where r.state = 'pending' and exists (
    select 1 from public.target_accounts a
    where a.workspace_id = r.workspace_id and a.id = r.target_account_id
      and (a.archived_at is not null or a.deleted_at is not null));
  update private.signal_rescans r set state = 'stopped', finished_at = now(), claimed_until = null,
    last_error = 'Nenhum Monitoramento ativo para buscar.'
  where r.state = 'pending' and not exists (select 1 from private.rescan_monitors(r.workspace_id));

  return query
  with due as (
    select r.id from private.signal_rescans r
    where r.state = 'pending' and (r.claimed_until is null or r.claimed_until < now())
    order by (r.origin = 'manual') desc, r.requested_at, r.id
    limit least(greatest(coalesce(p_limit, 5), 1), 20)
    for update of r skip locked
  ), claimed as (
    update private.signal_rescans r set claimed_until = now() + interval '15 minutes'
    from due where r.id = due.id
    returning r.*
  )
  select c.id, c.workspace_id, c.origin,
    (select p.user_id from public.workspace_memberships p
     where p.workspace_id = c.workspace_id and p.user_id = c.requested_by and p.active),
    c.requested_at,
    (select jsonb_build_object('id', a.id, 'name', a.name, 'domain', a.domain, 'linkedinUrl', a.linkedin_url,
        'contatos', private.signal_scan_contacts(c.workspace_id, a.id))
     from public.target_accounts a where a.workspace_id = c.workspace_id and a.id = c.target_account_id),
    coalesce((
      select jsonb_agg(jsonb_build_object('monitorId', m.monitor_id, 'signalType', m.signal_type, 'criteria', m.criteria))
      from private.rescan_monitors(c.workspace_id) m
    ), '[]'::jsonb)
  from claimed c
  order by (c.origin = 'manual') desc, c.requested_at, c.id;
end;
$$;

revoke all on function public.claim_due_signal_monitors(integer) from public, anon, authenticated;
revoke all on function public.claim_signal_rescans(integer) from public, anon, authenticated;
grant execute on function public.claim_due_signal_monitors(integer) to service_role;
grant execute on function public.claim_signal_rescans(integer) to service_role;
