-- O limite de tentativas da troca de senha em Meu perfil (CRM-08). A Edge Function account-password confere a senha
-- atual ou o código de entrada no Supabase Auth antes de trocar a senha; o limite de taxa do Auth vale por IP, e todas
-- as chamadas da função saem do mesmo lugar. Por isso a função reserva aqui, com a chave de serviço, uma tentativa por
-- confirmação: cinco sem sucesso em 15 minutos param a Conta de usuário, para quem tem uma sessão aberta não testar
-- senhas nem códigos de 6 dígitos sem fim. Uma confirmação certa esquece as tentativas. A tentativa guarda só a Conta
-- de usuário e a hora (nada de senha, código ou IP), e some com a Conta.

create table private.password_change_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index password_change_attempts_user_idx on private.password_change_attempts (user_id, attempted_at);

alter table private.password_change_attempts enable row level security;
revoke all on private.password_change_attempts from public, anon, authenticated;

-- Reserva uma tentativa para a Conta de usuário: true quando cabe no limite (e a tentativa fica gravada); false quando
-- ela já tem cinco tentativas nos últimos 15 minutos. As tentativas vencidas são apagadas aqui mesmo.
create function public.claim_password_change_attempt(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'p_user_id is required' using errcode = '22023';
  end if;

  -- Dois pedidos ao mesmo tempo para a mesma Conta de usuário não passam juntos pelo limite.
  perform pg_advisory_xact_lock(hashtextextended('password_change_attempt:' || p_user_id::text, 0));

  delete from private.password_change_attempts a
  where a.user_id = p_user_id and a.attempted_at <= now() - interval '15 minutes';

  if (select count(*) from private.password_change_attempts a where a.user_id = p_user_id) >= 5 then
    return false;
  end if;

  insert into private.password_change_attempts (user_id) values (p_user_id);
  return true;
end;
$$;

-- A confirmação deu certo: as tentativas da Conta de usuário são esquecidas.
create function public.clear_password_change_attempts(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.password_change_attempts where user_id = p_user_id;
$$;

revoke all on function public.claim_password_change_attempt(uuid) from public, anon, authenticated;
revoke all on function public.clear_password_change_attempts(uuid) from public, anon, authenticated;
grant execute on function public.claim_password_change_attempt(uuid) to service_role;
grant execute on function public.clear_password_change_attempts(uuid) to service_role;
