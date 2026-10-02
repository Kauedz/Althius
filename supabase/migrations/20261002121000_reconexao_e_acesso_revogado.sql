-- Recuperar conexões e interromper acesso revogado (canais-11). Até aqui, quando a Unipile avisava que a Conta remetente
-- caiu (credenciais revogadas, erro, conta removida), os passos ficavam programados com o motivo "sender_not_ready" e,
-- assim que a conta voltava e a reconciliação terminava, saíam sozinhos, sem a pessoa saber que a Sequência tinha
-- parado. Agora a queda PAUSA a Sequência com um motivo honesto ("Conta remetente desconectada"), a tela mostra
-- "Reconectar" ao titular e "Pausada: conta remetente desconectada" aos demais, e nada sai. Reconectar não retoma: a
-- conta volta, a reconciliação confere as conversas (a resposta que chegou no meio é gravada e fica para o titular) e a
-- Sequência continua pausada até o titular retomar, quando os passos são reprogramados sem rajada (resume_schedule).
--
-- A pausa vem de dois lugares, os dois chamados pelas Edge Functions (as RPCs do banco que já existiam não mudam):
--   * o Webhook Endpoint, logo depois de gravar a queda (hold_sequences_of_lost_sender);
--   * o Executor, quando um passo vencido é barrado por falta de Conta remetente e a do canal caiu de vez
--     (hold_sequence_for_unready_send), para o caso de o aviso da Unipile ter se perdido.
-- Uma conta só sincronizando (syncing, connecting) não pausa nada: é passageiro, e o passo espera como antes.
--
-- A saída do responsável do Workspace continua como o canais-05 e o CRM-17 decidiram: os envios dele param na hora
-- (owner_not_responsible, com o motivo gravado no Envio), a Sequência fica como estava até a Transferência, e ninguém
-- herda credencial nem propriedade.
--
-- Aditiva: nenhuma função existente é redefinida.

-- 1. O motivo de uma pausa pela Conta remetente. Some quando a Sequência sai da pausa (retomada ou encerrada).
create table private.sequence_sender_holds (
  sequence_id uuid primary key references public.sequences(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email', 'whatsapp', 'linkedin')),
  sender_account_id uuid references private.sender_accounts(id) on delete set null,
  held_at timestamptz not null default now()
);

create index sequence_sender_holds_workspace_idx on private.sequence_sender_holds (workspace_id);

alter table private.sequence_sender_holds enable row level security;
revoke all on private.sequence_sender_holds from public, anon, authenticated, service_role;

comment on table private.sequence_sender_holds is
  'Sequences paused because the owner sender account for a channel was revoked or removed. Cleared when the owner '
  'resumes (or the sequence ends); reconnecting alone never resumes.';

create function private.sender_channel_label(p_channel text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_channel when 'email' then 'E-mail' when 'whatsapp' then 'WhatsApp' when 'linkedin' then 'LinkedIn' end;
$$;

revoke all on function private.sender_channel_label(text) from public, anon, authenticated;

-- Pausa uma Sequência ativa pela Conta remetente de um canal. A trava da Sequência vem primeiro, na ordem de sempre;
-- o que está em voo grava o resultado, mas nenhum passo novo é liberado com a Sequência pausada. Devolve se pausou.
create function private.hold_sequence_for_sender(p_sequence_id uuid, p_channel text, p_sender_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence public.sequences;
begin
  select s.* into v_sequence from public.sequences s where s.id = p_sequence_id for update;
  if not found or v_sequence.status <> 'ativa' then
    return false;
  end if;
  update public.sequences set
    status = 'pausada',
    public_summary = public_summary || jsonb_build_object('status', 'pausada'),
    updated_at = now()
  where id = v_sequence.id;
  update private.sequence_documents set
    document = document || jsonb_build_object('motivoPause',
      'Conta remetente de ' || private.sender_channel_label(p_channel) || ' desconectada. Reconecte a conta e retome a Sequência'),
    updated_at = now()
  where sequence_id = v_sequence.id;
  insert into private.sequence_sender_holds (sequence_id, workspace_id, owner_user_id, channel, sender_account_id)
  values (v_sequence.id, v_sequence.workspace_id, v_sequence.owner_user_id, p_channel, p_sender_account_id)
  on conflict (sequence_id) do update set
    channel = excluded.channel, sender_account_id = excluded.sender_account_id, held_at = now();
  return true;
end;
$$;

revoke all on function private.hold_sequence_for_sender(uuid, text, uuid) from public, anon, authenticated, service_role;

-- Ainda há, para este titular e canal, uma Conta remetente que pode voltar a enviar sem a pessoa agir (pronta ou só
-- sincronizando)? Então a falta é passageira e nada pausa.
create function private.owner_has_live_sender(p_workspace_id uuid, p_owner_user_id uuid, p_channel text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.sender_accounts a
    where a.workspace_id = p_workspace_id and a.owner_user_id = p_owner_user_id and a.channel = p_channel
      and a.status in ('ready', 'syncing', 'connecting'));
$$;

revoke all on function private.owner_has_live_sender(uuid, uuid, text) from public, anon, authenticated, service_role;

-- 2. O Webhook Endpoint, depois de gravar que a conta caiu (credenciais, erro, parada, removida), pausa as Sequências
-- ativas do titular com passos pendentes nesse canal. Devolve quantas pausou.
create function public.hold_sequences_of_lost_sender(p_unipile_account_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sender private.sender_accounts;
  v_sequence_id uuid;
  v_count integer := 0;
begin
  for v_sender in
    select a.* from private.sender_accounts a
    where a.unipile_account_id = p_unipile_account_id and a.status in ('reconnect_required', 'disconnected')
  loop
    continue when private.owner_has_live_sender(v_sender.workspace_id, v_sender.owner_user_id, v_sender.channel);
    for v_sequence_id in
      select s.id from public.sequences s
      where s.workspace_id = v_sender.workspace_id and s.owner_user_id = v_sender.owner_user_id and s.status = 'ativa'
        and exists (
          select 1 from private.sequence_step_sends e
          where e.sequence_id = s.id and e.channel = v_sender.channel
            and e.status in ('waiting', 'scheduled', 'confirmed'))
      order by s.id
    loop
      if private.hold_sequence_for_sender(v_sequence_id, v_sender.channel, v_sender.id) then
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.hold_sequences_of_lost_sender(text) from public, anon, authenticated;
grant execute on function public.hold_sequences_of_lost_sender(text) to service_role;

-- 3. O Executor, quando a liberação de um passo vencido devolve sender_not_ready: se a Conta remetente do canal caiu
-- de vez (ou não existe mais), a Sequência pausa com o motivo, em vez de o passo esperar em silêncio para sair sozinho
-- quando a conta voltar. Devolve se pausou.
create function public.hold_sequence_for_unready_send(p_send_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_send private.sequence_step_sends;
  v_sequence public.sequences;
  v_sender_id uuid;
begin
  select e.* into v_send from private.sequence_step_sends e where e.id = p_send_id;
  if not found then
    raise exception 'send not found' using errcode = 'P0002';
  end if;
  select s.* into v_sequence from public.sequences s where s.id = v_send.sequence_id;
  if v_sequence.status <> 'ativa' or v_send.status not in ('waiting', 'scheduled', 'confirmed')
    or private.owner_has_live_sender(v_sequence.workspace_id, v_send.owner_user_id, v_send.channel) then
    return false;
  end if;
  select a.id into v_sender_id from private.sender_accounts a
  where a.workspace_id = v_sequence.workspace_id and a.owner_user_id = v_send.owner_user_id and a.channel = v_send.channel
  order by a.last_status_at desc nulls last
  limit 1;
  return private.hold_sequence_for_sender(v_sequence.id, v_send.channel, v_sender_id);
end;
$$;

revoke all on function public.hold_sequence_for_unready_send(uuid) from public, anon, authenticated;
grant execute on function public.hold_sequence_for_unready_send(uuid) to service_role;

-- 4. Quais Sequências do Workspace estão pausadas pela Conta remetente, e de qual canal. Só o estado, sem conteúdo:
-- qualquer participante ativo lê, para a lista não dizer "Contato respondeu" quando quem caiu foi a conta.
create function public.list_sequence_sender_holds(p_workspace_id uuid)
returns table (sequence_id uuid, channel text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.user_id = v_user_id and m.active) then
    raise exception 'active membership required' using errcode = '42501';
  end if;
  return query
    select h.sequence_id, h.channel from private.sequence_sender_holds h
    join public.sequences s on s.id = h.sequence_id and s.status = 'pausada'
    where h.workspace_id = p_workspace_id
    order by h.held_at;
end;
$$;

revoke all on function public.list_sequence_sender_holds(uuid) from public, anon;
grant execute on function public.list_sequence_sender_holds(uuid) to authenticated;

-- 5. Retomar (ou encerrar) tira o motivo: dali em diante, quem decide é o titular, e uma nova queda pausa de novo.
create function private.clear_sender_hold_on_resume()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pausada' and new.status <> 'pausada' then
    delete from private.sequence_sender_holds where sequence_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.clear_sender_hold_on_resume() from public, anon, authenticated, service_role;

create trigger sequences_clear_sender_hold
  after update of status on public.sequences
  for each row execute function private.clear_sender_hold_on_resume();
