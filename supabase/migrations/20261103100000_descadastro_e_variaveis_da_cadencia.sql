-- Descadastro e variáveis de personalização da Cadência (cadencia/descadastro-e-variaveis).
--
-- 1. Supressão por Workspace: o e-mail (ou o domínio inteiro) que pediu para sair nunca mais recebe passo de E-mail do
--    Workspace. Grava-se pelo link do rodapé (token aleatório por Envio, sem ids), pela resposta que pede para sair
--    (SAIR, descadastrar, remover…) ou à mão. Registrar cancela os passos pendentes do Contato e pausa a Sequência
--    com o motivo "Descadastro". É idempotente.
-- 2. A liberação do E-mail confere a Supressão antes de tudo: o Contato suprimido não recebe o passo, que é cancelado.
-- 3. Variáveis: {{primeiro_nome}}, {{nome}}, {{sobrenome}}, {{empresa}}, {{cargo}}, {{email}}, {{segmento}},
--    {{dominio}} e as já existentes ({{contato.primeiro_nome}}, {{conta.nome}}, {{remetente.nome}}…). Uma variável sem
--    valor (ou desconhecida) segura o passo de E-mail em "aguardando reconfirmação" com o motivo
--    `missing_variable:<nomes>`: nunca sai "{{empresa}}" cru nem um buraco no texto.
-- 4. Criação em lote: uma Sequência por Conta-alvo a partir da mesma Cadência (ADR-0009), pulando a Conta que já tem
--    Sequência em andamento, a de outro Vendedor responsável e o Contato que já está noutra Sequência ativa.

-- ---------------------------------------------------------------------------------------------------------------
-- 1. Supressão
-- ---------------------------------------------------------------------------------------------------------------

create table public.contact_suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null check (kind in ('email', 'domain')),
  value text not null check (value = lower(btrim(value)) and value <> ''),
  reason text not null check (reason in ('link', 'resposta', 'manual')),
  -- Só referências soltas: a Supressão sobrevive ao Apagar do Contato (quem pediu para sair continua fora).
  contact_id uuid,
  send_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, kind, value)
);

alter table public.contact_suppressions enable row level security;
revoke all on public.contact_suppressions from public, anon, authenticated;
grant select on public.contact_suppressions to authenticated;
grant all on public.contact_suppressions to service_role;

create policy "active members read suppressions"
  on public.contact_suppressions for select to authenticated
  using (exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = contact_suppressions.workspace_id
      and m.user_id = (select auth.uid()) and m.active
  ));

comment on table public.contact_suppressions is
  'Workspace suppression list: e-mail addresses or whole domains that asked to stop receiving sequence e-mails.';

-- O e-mail está suprimido no Workspace, por ele mesmo ou pelo domínio.
create function private.is_suppressed(p_workspace_id uuid, p_email text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.contact_suppressions s
    where s.workspace_id = p_workspace_id
      and ((s.kind = 'email' and s.value = lower(btrim(p_email)))
        or (s.kind = 'domain' and s.value = split_part(lower(btrim(p_email)), '@', 2)))
  );
$$;
revoke all on function private.is_suppressed(uuid, text) from public, anon, authenticated;

-- O token do link de descadastro de cada Envio: aleatório (64 hex), sem expor ids.
create table private.unsubscribe_tokens (
  token text primary key check (token ~ '^[0-9a-f]{64}$'),
  send_id uuid not null unique references private.sequence_step_sends(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
alter table private.unsubscribe_tokens enable row level security;
revoke all on private.unsubscribe_tokens from public, anon, authenticated;
grant all on private.unsubscribe_tokens to service_role;

create function private.new_unsubscribe_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;
revoke all on function private.new_unsubscribe_token() from public, anon, authenticated;

-- Grava a Supressão do e-mail (true quando é nova), cancela os passos de E-mail pendentes para ele ou para o Contato e
-- pausa a Sequência com o motivo "Descadastro". Repetir não duplica nada e só reaplica o cancelamento.
create function private.register_suppression(
  p_workspace_id uuid,
  p_email text,
  p_contact_id uuid,
  p_send_id uuid,
  p_reason text,
  p_created_by uuid default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_new uuid;
  v_sequence_id uuid;
begin
  if v_email = '' or position('@' in v_email) = 0 then
    return false;
  end if;

  insert into public.contact_suppressions (workspace_id, kind, value, reason, contact_id, send_id, created_by)
  values (p_workspace_id, 'email', v_email, p_reason, p_contact_id, p_send_id, p_created_by)
  on conflict (workspace_id, kind, value) do nothing
  returning id into v_new;

  for v_sequence_id in
    select distinct e.sequence_id from private.sequence_step_sends e
    where e.workspace_id = p_workspace_id
      and (lower(e.destination) = v_email or (p_contact_id is not null and e.contact_id = p_contact_id))
  loop
    -- A trava da Sequência serializa com uma liberação concorrente.
    perform 1 from public.sequences s where s.id = v_sequence_id for update;

    update private.sequence_step_sends set
      status = 'cancelled', scheduled_for = null, claimed_until = null,
      last_error = 'contact_suppressed', last_error_at = now(), updated_at = now()
    where sequence_id = v_sequence_id and channel = 'email'
      and (lower(destination) = v_email or (p_contact_id is not null and contact_id = p_contact_id))
      and status in ('waiting', 'scheduled', 'confirmed', 'awaiting_reconfirmation', 'failed');

    update public.sequences set
      status = 'pausada',
      public_summary = public_summary || jsonb_build_object('status', 'pausada'),
      updated_at = now()
    where id = v_sequence_id and status = 'ativa';

    update private.sequence_documents set
      document = document || jsonb_build_object('motivoPause', 'Descadastro'),
      updated_at = now()
    where sequence_id = v_sequence_id
      and exists (select 1 from public.sequences s where s.id = v_sequence_id and s.status = 'pausada');
  end loop;

  return v_new is not null;
end;
$$;
revoke all on function private.register_suppression(uuid, text, uuid, uuid, text, uuid) from public, anon, authenticated;

-- O link público do rodapé (Edge Function descadastro, com a chave de serviço).
create function public.unsubscribe_by_token(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
  v_new boolean;
begin
  select e.* into v_send from private.unsubscribe_tokens t
  join private.sequence_step_sends e on e.id = t.send_id
  where t.token = p_token;
  if not found then
    return 'invalid';
  end if;

  v_new := private.register_suppression(v_send.workspace_id, v_send.destination, v_send.contact_id, v_send.id, 'link');
  update private.unsubscribe_tokens set used_at = coalesce(used_at, now()) where token = p_token;
  return case when v_new then 'registered' else 'already_registered' end;
end;
$$;
revoke all on function public.unsubscribe_by_token(text) from public, anon, authenticated;
grant execute on function public.unsubscribe_by_token(text) to service_role;

-- O Administrador ou o Vendedor suprime um e-mail ou um domínio à mão.
create function public.add_contact_suppression(p_workspace_id uuid, p_kind text, p_value text)
returns public.contact_suppressions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_value text := lower(btrim(coalesce(p_value, '')));
  v_row public.contact_suppressions;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user and m.active) then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  if p_kind not in ('email', 'domain') or v_value = ''
    or (p_kind = 'email' and position('@' in v_value) = 0)
    or (p_kind = 'domain' and position('@' in v_value) > 0) then
    raise exception 'invalid suppression' using errcode = '22023';
  end if;

  if p_kind = 'email' then
    perform private.register_suppression(p_workspace_id, v_value, null, null, 'manual', v_user);
  else
    insert into public.contact_suppressions (workspace_id, kind, value, reason, created_by)
    values (p_workspace_id, 'domain', v_value, 'manual', v_user)
    on conflict (workspace_id, kind, value) do nothing;
  end if;
  select s.* into v_row from public.contact_suppressions s
  where s.workspace_id = p_workspace_id and s.kind = p_kind and s.value = v_value;
  return v_row;
end;
$$;
revoke all on function public.add_contact_suppression(uuid, text, text) from public, anon;
grant execute on function public.add_contact_suppression(uuid, text, text) to authenticated;

-- A resposta que pede para sair. Só o texto novo conta: a citação do e-mail original (que traz o rodapé com
-- "descadastre-se") é cortada antes. "SAIR" vale em maiúsculas em qualquer lugar; "sair", "remover", "parar" e
-- "me remova" valem quando são a resposta inteira; "descadastrar", "unsubscribe", "me tire/remova da lista (dos
-- e-mails, do envio…)" e "remova meu e-mail" valem sempre. "Me tire uma dúvida" e "tirei esse e-mail do spam" não
-- contam: o verbo só vale com o lugar de onde sair ou com o próprio endereço.
create function private.reply_asks_unsubscribe(p_text text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := coalesce(p_text, '');
  v_lower text;
begin
  v := regexp_replace(v, '<[^>]*>', ' ', 'g');
  v := regexp_replace(v,
    '((^|\n)\s*>|(^|\n)\s*Em [^\n]{0,250}escreveu:|(^|\n)\s*On [^\n]{0,250}wrote:|-{3,}\s*(Original|Mensagem original)|(^|\n)\s*(De|From):\s|Não quer mais receber estes e-mails).*$',
    '');
  v_lower := lower(v);
  return v ~ '(^|[^[:alpha:]])SAIR([^[:alpha:]]|$)'
    or v_lower ~ 'descadastr|unsubscribe'
    or v_lower ~ '\m(me|nos) (tire|tirem|tirar|retire|retirem|retirar|remova|removam|remover|exclua|excluam|excluir) (da|das|do|dos|de) (sua |suas |seu |seus |vossa |esta |essa |este |esse )?(lista|listas|mailing|e-?mails?|envios?|comunica[[:alpha:]]*|base|cadastro|contatos?|newsletter)\M'
    or v_lower ~ '\m(remova|removam|remover|exclua|excluam|excluir|retire|retirem|retirar) (o |os )?(meu|meus|nosso|nossos) (e-?mails?|contatos?|endere)'
    or btrim(v_lower) ~ '^[[:punct:][:space:]]*(sair|remover|remova|parar|pare|stop)[[:punct:][:space:]]*$'
    or btrim(v_lower) ~ '^[[:punct:][:space:]]*(por favor,? )?(me|nos) (tire|retire|remova|exclua)[[:punct:][:space:]]*$';
end;
$$;
revoke all on function private.reply_asks_unsubscribe(text) from public, anon, authenticated;

-- Roda logo depois de a resposta ser gravada (gatilho comum, não adiado: um evento pendente impediria ALTER TABLE em
-- received_emails na mesma transação). A ingestão pausa com "Contato respondeu" DEPOIS de gravar a resposta; por isso a
-- Sequência fica marcada nesta transação (althius.descadastro_pela_resposta) e o gatilho de sequence_documents mantém o
-- motivo "Descadastro".
create function private.unsubscribe_from_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.reply_asks_unsubscribe(coalesce(new.body, new.snippet)) then
    perform private.register_suppression(new.workspace_id, new.from_email, new.contact_id, new.send_id, 'resposta');
    if new.sequence_id is not null then
      perform set_config('althius.descadastro_pela_resposta',
        coalesce(nullif(current_setting('althius.descadastro_pela_resposta', true), ''), '') || ',' || new.sequence_id::text,
        true);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function private.unsubscribe_from_reply() from public, anon, authenticated;

create trigger received_email_unsubscribe
  after insert on private.received_emails
  for each row execute function private.unsubscribe_from_reply();

-- A pausa "Contato respondeu" da ingestão não apaga o "Descadastro" que a mesma resposta acabou de registrar.
create function private.keep_unsubscribe_pause_reason()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.document ->> 'motivoPause' = 'Contato respondeu'
    and old.document ->> 'motivoPause' = 'Descadastro'
    and new.sequence_id::text = any (
      string_to_array(coalesce(current_setting('althius.descadastro_pela_resposta', true), ''), ',')) then
    new.document := new.document || jsonb_build_object('motivoPause', 'Descadastro');
  end if;
  return new;
end;
$$;
revoke all on function private.keep_unsubscribe_pause_reason() from public, anon, authenticated;

create trigger sequence_documents_keep_unsubscribe_reason
  before update on private.sequence_documents
  for each row execute function private.keep_unsubscribe_pause_reason();

-- A resposta que pediu para sair (ou que vem de quem já se descadastrou) não gera Proposta de resposta: não há o que
-- responder a quem pediu para não receber mais e-mail. Definição de 20261001180000 (a mais recente), com essa condição;
-- as Propostas abertas da conversa continuam ficando desatualizadas.
create or replace function private.reply_proposal_on_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence public.sequences;
  v_ref text;
begin
  begin
    select s.* into v_sequence from public.sequences s where s.id = new.sequence_id;
    if not found then
      return null;
    end if;
    v_ref := coalesce(nullif(btrim(new.provider_thread_id), ''), 'de:' || lower(coalesce(new.from_email, '')));
    perform private.mark_reply_proposals_outdated(new.sequence_id, 'email', v_ref, new.interaction_id);

    -- Sem Vendedor responsável ativo, Sequência encerrada ou remetente desconhecido, não há a quem propor nem para quem.
    if v_sequence.status = 'encerrada'
      or nullif(btrim(new.from_email), '') is null
      or v_sequence.target_account_id !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
      or not exists (
        select 1 from public.sales_responsibilities r
        where r.workspace_id = new.workspace_id and r.target_account_id = v_sequence.target_account_id
          and r.owner_user_id = new.owner_user_id)
      or not exists (
        select 1 from public.workspace_memberships m
        where m.workspace_id = new.workspace_id and m.user_id = new.owner_user_id and m.active) then
      return null;
    end if;

    -- Descadastro: nem Proposta nem resposta.
    if private.reply_asks_unsubscribe(coalesce(new.body, new.snippet))
      or private.is_suppressed(new.workspace_id, new.from_email) then
      return null;
    end if;

    perform private.enqueue_reply_proposal(
      new.workspace_id, new.sequence_id, v_sequence.target_account_id::uuid, new.contact_id, new.owner_user_id,
      new.sender_account_id, 'email', new.interaction_id, v_ref, new.from_email, new.from_name,
      new.provider_message_id, new.subject);
  exception when others then
    raise warning 'reply proposal was not queued: %', sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function private.reply_proposal_on_email() from public, anon, authenticated, service_role;

-- A resposta aprovada também não sai para o Contato suprimido (a Aprovação pode ser anterior ao descadastro). A
-- liberação de 20261001180000 vira o núcleo; esta confere a Supressão antes, com a mesma ordem de trava (Sequência,
-- depois Proposta).
alter function public.release_approved_reply(uuid, uuid, text[]) set schema private;
alter function private.release_approved_reply(uuid, uuid, text[]) rename to release_approved_reply_core;
revoke all on function private.release_approved_reply_core(uuid, uuid, text[]) from public, anon, authenticated, service_role;

create function public.release_approved_reply(
  p_proposal_id uuid, p_user_id uuid, p_channels text[] default array['email']
) returns table (
  outcome text, proposal_id uuid, channel text, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text, tracking_header_name text, tracking_header_value text,
  revision integer
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_proposal private.reply_proposals;
begin
  select p.* into v_proposal from private.reply_proposals p where p.id = p_proposal_id;
  if found then
    perform 1 from public.sequences s where s.id = v_proposal.sequence_id for update;
    select p.* into v_proposal from private.reply_proposals p where p.id = p_proposal_id for update;
    if v_proposal.status = 'aprovada' and v_proposal.channel = 'email'
      and private.is_suppressed(v_proposal.workspace_id, v_proposal.recipient) then
      return query select 'contact_suppressed', v_proposal.id, v_proposal.channel, null::text, null::text, null::text,
        null::text, null::text, null::text, null::text, null::text, v_proposal.revision;
      return;
    end if;
  end if;
  return query select * from private.release_approved_reply_core(p_proposal_id, p_user_id, p_channels);
end;
$$;
revoke all on function public.release_approved_reply(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.release_approved_reply(uuid, uuid, text[]) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 3. Variáveis
-- ---------------------------------------------------------------------------------------------------------------

-- O valor de uma variável do passo, ou null quando o Contato/a Conta-alvo não tem o dado (ou a variável não existe).
-- {{conta.sinal}} e {{persona}} não são variáveis do envio (a Persona é classificação interna do Comitê e o Sinal é texto
-- da Althius, nenhum dos dois vai para o Contato): o editor não as oferece e um passo antigo que as use fica seguro com
-- missing_variable, em vez de sair com um buraco no texto.
create function private.step_variable_value(
  p_name text,
  p_account public.target_accounts,
  p_contact public.contacts,
  p_owner_name text
) returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_contact.name, ''));
begin
  return nullif(btrim(case lower(btrim(p_name))
    when 'primeiro_nome' then split_part(v_name, ' ', 1)
    when 'contato.primeiro_nome' then split_part(v_name, ' ', 1)
    when 'nome' then v_name
    when 'contato.nome' then v_name
    when 'sobrenome' then case when position(' ' in v_name) > 0 then substr(v_name, position(' ' in v_name) + 1) end
    when 'contato.sobrenome' then case when position(' ' in v_name) > 0 then substr(v_name, position(' ' in v_name) + 1) end
    when 'cargo' then p_contact.role
    when 'contato.cargo' then p_contact.role
    when 'email' then p_contact.email
    when 'contato.email' then p_contact.email
    when 'empresa' then p_account.name
    when 'conta.nome' then p_account.name
    when 'segmento' then p_account.segment
    when 'conta.segmento' then p_account.segment
    when 'dominio' then p_account.domain
    when 'conta.dominio' then p_account.domain
    when 'remetente.nome' then p_owner_name
    when 'remetente' then p_owner_name
  end), '');
end;
$$;
revoke all on function private.step_variable_value(text, public.target_accounts, public.contacts, text)
  from public, anon, authenticated;

-- As variáveis do texto que ficariam sem valor, sem repetição, na ordem em que aparecem.
create function private.missing_step_variables(
  p_text text,
  p_account public.target_accounts,
  p_contact public.contacts,
  p_owner_name text
) returns text[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(nome order by primeira), '{}')
  from (
    select lower(m[1]) as nome, min(n) as primeira
    from regexp_matches(coalesce(p_text, ''), '\{\{\s*([A-Za-z_.]+)\s*\}\}', 'g') with ordinality as t(m, n)
    group by lower(m[1])
  ) v
  where private.step_variable_value(nome, p_account, p_contact, p_owner_name) is null;
$$;
revoke all on function private.missing_step_variables(text, public.target_accounts, public.contacts, text)
  from public, anon, authenticated;

-- Mesma assinatura de antes (o WhatsApp e o LinkedIn também usam), agora com os apelidos. O E-mail nunca chega aqui
-- com variável sem valor (a liberação barra antes); os outros canais seguem saindo com o vazio, como antes.
create or replace function private.render_step_template(
  p_text text,
  p_account public.target_accounts,
  p_contact public.contacts,
  p_owner_name text
) returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := coalesce(p_text, '');
  v_name text;
  v_value text;
begin
  for v_name in select distinct m[1] from regexp_matches(v, '\{\{\s*([A-Za-z_.]+)\s*\}\}', 'g') as t(m) loop
    v_value := coalesce(private.step_variable_value(v_name, p_account, p_contact, p_owner_name), '');
    v := regexp_replace(v, '\{\{\s*' || replace(v_name, '.', '\.') || '\s*\}\}', replace(v_value, '\', '\\'), 'g');
  end loop;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------------
-- 2 e 3. A liberação do E-mail confere Supressão e variáveis e devolve o token do descadastro
-- ---------------------------------------------------------------------------------------------------------------

alter function private.release_step_send(uuid, uuid, boolean) rename to release_step_send_core;

create function private.release_step_send(p_send_id uuid, p_user_id uuid, p_due_only boolean)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text, unsubscribe_token text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_step jsonb;
  v_account public.target_accounts;
  v_contact public.contacts;
  v_owner_name text;
  v_missing text[];
  v_released record;
  v_token text;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;

  if found and v_send.status in ('waiting', 'scheduled', 'confirmed', 'awaiting_reconfirmation') then
    -- Mesma ordem de trava da liberação: a Sequência, depois o Envio.
    select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id for update;
    select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id for update;

    -- O Contato que se descadastrou nunca recebe o passo: o Envio é cancelado.
    if private.is_suppressed(v_send.workspace_id, v_send.destination) then
      update private.sequence_step_sends set
        status = 'cancelled', scheduled_for = null, claimed_until = null,
        last_error = 'contact_suppressed', last_error_at = now(), updated_at = now()
      where id = v_send.id;
      return query select 'contact_suppressed', v_send.id, null::text, null::text, null::text,
        null::text, null::text, null::text, null::text, null::text, null::text;
      return;
    end if;

    -- Uma variável sem valor segura o passo com o motivo, antes de qualquer coisa sair.
    if v_send.status in ('scheduled', 'confirmed') and v_sequence.status = 'ativa' then
      v_step := case when v_send.authorization_id is not null
        then private.authorized_step(v_send.authorization_id, v_send.step_id)
        else private.sequence_step(v_sequence.id, v_send.step_id) end;
      if v_step is not null then
        select a.* into v_account from public.target_accounts a where a.id::text = v_sequence.target_account_id;
        select c.* into v_contact from public.contacts c where c.id = v_send.contact_id;
        select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
            nullif(btrim(u.raw_user_meta_data ->> 'name'), ''), u.email)
          into v_owner_name from auth.users u where u.id = v_send.owner_user_id;
        v_missing := private.missing_step_variables(
          coalesce(v_step ->> 'assunto', v_step ->> 'titulo', '') || E'\n' || coalesce(v_step ->> 'corpo', ''),
          v_account, v_contact, v_owner_name);
        if cardinality(v_missing) > 0 then
          update private.sequence_step_sends set
            status = 'awaiting_reconfirmation', claimed_until = null,
            last_error = 'missing_variable:' || array_to_string(v_missing, ','), last_error_at = now(), updated_at = now()
          where id = v_send.id;
          return query select 'missing_variable', v_send.id, null::text, null::text, null::text,
            null::text, null::text, null::text, null::text, null::text, null::text;
          return;
        end if;
      end if;
    end if;
  end if;

  for v_released in select * from private.release_step_send_core(p_send_id, p_user_id, p_due_only) loop
    v_token := null;
    if v_released.outcome = 'released' then
      insert into private.unsubscribe_tokens (token, send_id)
      values (private.new_unsubscribe_token(), v_released.send_id)
      on conflict (send_id) do update set token = private.unsubscribe_tokens.token
      returning token into v_token;
    end if;
    return query select v_released.outcome, v_released.send_id, v_released.unipile_account_id,
      v_released.destination, v_released.contact_name, v_released.subject, v_released.body,
      v_released.reply_to_message_id, v_released.tracking_header_name, v_released.tracking_header_value, v_token;
  end loop;
end;
$$;
revoke all on function private.release_step_send(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.release_step_send_core(uuid, uuid, boolean) from public, anon, authenticated;

drop function public.release_sequence_step_send(uuid, uuid);
create function public.release_sequence_step_send(p_send_id uuid, p_user_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text, unsubscribe_token text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.sequence_step_sends e where e.id = p_send_id and e.channel <> 'email') then
    return query select 'wrong_channel', p_send_id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  return query select * from private.release_step_send(p_send_id, p_user_id, false);
end;
$$;

drop function public.release_due_step_send(uuid);
create function public.release_due_step_send(p_send_id uuid)
returns table (
  outcome text, send_id uuid, unipile_account_id text, destination text, contact_name text,
  subject text, body text, reply_to_message_id text,
  tracking_header_name text, tracking_header_value text, unsubscribe_token text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from private.sequence_step_sends e where e.id = p_send_id and e.channel <> 'email') then
    return query select 'wrong_channel', p_send_id, null::text, null::text, null::text,
      null::text, null::text, null::text, null::text, null::text, null::text;
    return;
  end if;
  return query
    select r.* from private.sequence_step_sends e,
      lateral private.release_step_send(e.id, e.owner_user_id, true) r
    where e.id = p_send_id;
end;
$$;

revoke all on function public.release_sequence_step_send(uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_sequence_step_send(uuid, uuid) to service_role;
revoke all on function public.release_due_step_send(uuid) from public, anon, authenticated;
grant execute on function public.release_due_step_send(uuid) to service_role;

-- ---------------------------------------------------------------------------------------------------------------
-- 4. Criação em lote: uma Sequência por Conta-alvo com a mesma Cadência
-- ---------------------------------------------------------------------------------------------------------------

-- p_template é o documento da Cadência (steps, janelaPadrao, regraDePause) sem Contato. Para cada Conta-alvo, o
-- Contato do lote é o primeiro Vínculo ativo com e-mail que não está suprimido nem em outra Sequência ativa ou
-- pausada; todos os passos vão para ele. Cada Conta devolve o desfecho: created (com a Sequência) ou o motivo de ter
-- ficado de fora. Uma Conta pulada não desfaz as outras.
create function public.create_sequences_in_batch(
  p_workspace_id uuid,
  p_target_account_ids uuid[],
  p_template jsonb
) returns table (target_account_id uuid, outcome text, sequence_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_account_id uuid;
  v_contact_id uuid;
  v_steps jsonb;
  v_document jsonb;
  v_sequence public.sequences;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if coalesce(cardinality(p_target_account_ids), 0) = 0 or cardinality(p_target_account_ids) > 200 then
    raise exception 'between 1 and 200 target accounts per batch' using errcode = '22023';
  end if;
  if jsonb_typeof(p_template -> 'steps') <> 'array' or jsonb_array_length(p_template -> 'steps') = 0 then
    raise exception 'template without steps' using errcode = '22023';
  end if;
  perform private.validate_sequence_document(p_workspace_id, null, p_template);

  foreach v_account_id in array (select array_agg(distinct x) from unnest(p_target_account_ids) x) loop
    if not exists (select 1 from public.target_accounts a where a.id = v_account_id and a.workspace_id = p_workspace_id) then
      return query select v_account_id, 'not_found', null::uuid;
      continue;
    end if;
    if not exists (
      select 1 from public.sales_responsibilities r
      where r.workspace_id = p_workspace_id and r.target_account_id = v_account_id::text and r.owner_user_id = v_user) then
      return query select v_account_id, 'not_responsible', null::uuid;
      continue;
    end if;
    if exists (
      select 1 from public.sequences s
      where s.workspace_id = p_workspace_id and s.target_account_id = v_account_id::text and s.status <> 'encerrada') then
      return query select v_account_id, 'sequence_in_progress', null::uuid;
      continue;
    end if;

    select c.id into v_contact_id
    from public.contact_account_links l
    join public.contacts c on c.id = l.contact_id and c.workspace_id = l.workspace_id
    where l.workspace_id = p_workspace_id and l.target_account_id = v_account_id and l.ended_at is null
      and nullif(btrim(c.email), '') is not null
      and not private.is_suppressed(p_workspace_id, c.email)
      and not exists (
        select 1 from public.sequences s
        join private.sequence_documents d on d.sequence_id = s.id
        where s.workspace_id = p_workspace_id and s.status in ('ativa', 'pausada')
          and jsonb_typeof(d.document -> 'participantesIds') = 'array'
          and d.document -> 'participantesIds' ? c.id::text)
    order by l.started_at, c.id
    limit 1;
    if v_contact_id is null then
      return query select v_account_id, 'no_eligible_contact', null::uuid;
      continue;
    end if;

    select coalesce(jsonb_agg(s || jsonb_build_object('contatoId', v_contact_id::text) order by n), '[]'::jsonb)
      into v_steps
    from jsonb_array_elements(p_template -> 'steps') with ordinality as t(s, n);
    v_document := (p_template - 'participantesIds' - 'steps')
      || jsonb_build_object('participantesIds', jsonb_build_array(v_contact_id::text), 'steps', v_steps,
        'passoAtual', 0);

    begin
      select s.* into v_sequence from public.create_sequence(
        p_workspace_id, v_account_id::text, v_document,
        jsonb_build_object('totalParticipantes', 1, 'totalSteps', jsonb_array_length(v_steps), 'passoAtual', 0)) s;
      return query select v_account_id, 'created', v_sequence.id;
    exception when unique_violation then
      return query select v_account_id, 'sequence_in_progress', null::uuid;
    end;
  end loop;
end;
$$;
revoke all on function public.create_sequences_in_batch(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.create_sequences_in_batch(uuid, uuid[], jsonb) to authenticated;
