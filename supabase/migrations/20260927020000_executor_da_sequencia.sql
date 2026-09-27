-- O Executor da Sequência (canais-05, PR 2): a cada minuto o pg_cron olha se há passo automático vencido e, só
-- então, chama a Edge Function sequence-runner pelo pg_net. A chamada leva um token gerado aqui dentro e guardado só no
-- banco: a função confere o token pela RPC sequence_runner_token_matches, então nenhum segredo passa por pessoas nem
-- pela configuração da função. O endereço da função é o único passo manual: private.configure_sequence_runner, no SQL
-- Editor, uma vez por projeto. Sem endereço, nada é chamado.

create table private.sequence_runner_settings (
  singleton boolean primary key default true check (singleton),
  function_url text,
  -- Dois UUID v4 aleatórios (gen_random_uuid usa o gerador forte do Postgres): 64 caracteres hexadecimais.
  token text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  updated_at timestamptz not null default now()
);

insert into private.sequence_runner_settings default values;

alter table private.sequence_runner_settings enable row level security;
revoke all on private.sequence_runner_settings from public, anon, authenticated, service_role;

comment on table private.sequence_runner_settings is
  'Where the database calls the sequence-runner Edge Function and the token that proves the call came from it.';

-- A Edge Function confere o token da chamada. Só service_role pergunta, e a resposta é só sim ou não.
create function public.sequence_runner_token_matches(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.sequence_runner_settings s
    where length(coalesce(p_token, '')) >= 32 and s.token = p_token);
$$;

revoke all on function public.sequence_runner_token_matches(text) from public, anon, authenticated;
grant execute on function public.sequence_runner_token_matches(text) to service_role;

-- Passo manual, uma vez por projeto, no SQL Editor: o endereço do projeto (https://<ref>.supabase.co).
create function private.configure_sequence_runner(p_project_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
begin
  if coalesce(p_project_url, '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]{2,5})?/?$' then
    raise exception 'project url must look like https://<ref>.supabase.co' using errcode = '22023';
  end if;
  v_url := regexp_replace(p_project_url, '/$', '') || '/functions/v1/sequence-runner';
  update private.sequence_runner_settings set function_url = v_url, updated_at = now();
  return v_url;
end;
$$;

revoke all on function private.configure_sequence_runner(text) from public, anon, authenticated, service_role;

-- A chamada HTTP em si, separada para os testes a trocarem dentro da transação (o CI não fala com a função).
create function private.post_to_sequence_runner(p_url text, p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform net.http_post(
    url := p_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-runner-token', p_token),
    timeout_milliseconds := 5000);
end;
$$;

revoke all on function private.post_to_sequence_runner(text, text) from public, anon, authenticated, service_role;

-- O que o pg_cron roda a cada minuto. Passa os envios esquecidos em voo a incertos e chama a função só quando há
-- passo automático vencido de uma versão ativa; devolve se chamou.
create function private.kick_sequence_runner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings private.sequence_runner_settings;
begin
  perform private.expire_stale_sends(null);
  select s.* into v_settings from private.sequence_runner_settings s;
  if v_settings.function_url is null then
    return false;
  end if;
  if not exists (
    select 1 from private.sequence_step_sends e
    join public.sequences q on q.id = e.sequence_id and q.status = 'ativa'
    join private.sequence_authorizations a on a.id = e.authorization_id and a.revoked_at is null
    where e.status = 'scheduled' and e.scheduled_for <= private.clock_now()
      and (e.claimed_until is null or e.claimed_until < now())) then
    return false;
  end if;
  perform private.post_to_sequence_runner(v_settings.function_url, v_settings.token);
  return true;
end;
$$;

revoke all on function private.kick_sequence_runner() from public, anon, authenticated, service_role;

-- O relógio: pg_cron e pg_net existem no Supabase (e no CI, que roda a imagem dele); onde não existem, o Executor
-- simplesmente não é ligado.
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('althius-sequence-runner', '* * * * *', 'select private.kick_sequence_runner()');
  end if;
end
$cron$;
