-- O aviso a quem tenta se cadastrar com um e-mail que já tem conta (autenticacao-google-email 03). O Supabase Auth
-- responde a esse cadastro como a um cadastro novo, para a tela não revelar quem tem conta, mas não manda nada. A Edge
-- Function existing-account-email reserva cada aviso aqui, com a chave de serviço, antes de mandar pelo provedor: a
-- função confere que o e-mail tem Conta de usuário confirmada e limita os avisos, porque quem pede não tem sessão e o
-- remetente da Althius não pode virar canal de spam contra a caixa de alguém. Cada reserva conta, saia ou não o e-mail.
-- Limites: um aviso a cada 10 minutos e três por dia para a mesma Conta de usuário, e 200 por hora no total, para quem
-- tiver uma lista de e-mails com conta não usar o remetente da Althius contra todos eles. O aviso guarda a Conta de
-- usuário, não o e-mail, e some com ela.

create table private.existing_account_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);

create index existing_account_notices_user_idx on private.existing_account_notices (user_id, requested_at);
create index existing_account_notices_requested_at_idx on private.existing_account_notices (requested_at);

alter table private.existing_account_notices enable row level security;
revoke all on private.existing_account_notices from public, anon, authenticated;

-- Reserva o aviso para o e-mail, sem diferenciar maiúsculas nem espaços nas pontas. Devolve o e-mail guardado na Conta
-- de usuário confirmada, para onde o aviso vai, quando ele cabe nos limites (a reserva fica gravada); null quando não há
-- o que avisar.
create function public.claim_existing_account_notice(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_email text;
begin
  select u.id, u.email into v_user_id, v_email
  from auth.users u
  where lower(u.email) = lower(btrim(p_email)) and u.email_confirmed_at is not null;
  if v_user_id is null then
    return null;
  end if;

  -- Dois pedidos ao mesmo tempo para a mesma conta não passam juntos pelo limite.
  perform pg_advisory_xact_lock(hashtextextended('existing_account_notice:' || v_user_id::text, 0));

  if exists (
    select 1 from private.existing_account_notices n
    where n.user_id = v_user_id and n.requested_at > now() - interval '10 minutes'
  ) or (
    select count(*) from private.existing_account_notices n
    where n.user_id = v_user_id and n.requested_at > now() - interval '1 day'
  ) >= 3 or (
    select count(*) from private.existing_account_notices n
    where n.requested_at > now() - interval '1 hour'
  ) >= 200 then
    return null;
  end if;

  insert into private.existing_account_notices (user_id) values (v_user_id);
  return v_email;
end;
$$;

revoke all on function public.claim_existing_account_notice(text) from public, anon, authenticated;
grant execute on function public.claim_existing_account_notice(text) to service_role;
