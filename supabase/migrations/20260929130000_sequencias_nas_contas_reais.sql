-- Sequências e responsabilidades nas Contas-alvo reais (CRM-17).
-- Até aqui sales_responsibilities.target_account_id e sequences.target_account_id são texto solto: nada garantia que
-- fosse uma Conta-alvo do mesmo Workspace, e a Sequência de um antigo responsável impedia o novo de ter a sua, porque
-- sequences era única por Conta. Esta migration liga as duas tabelas à Conta-alvo por chave estrangeira, faz a
-- Sequência acompanhar o responsável da Conta e libera a Conta para o novo responsável depois de uma Transferência
-- de responsabilidade (ADR-0009).
--
-- Não apaga nem reescreve dado existente, e aplica-se também sobre um banco que ainda guarda Sequências de teste
-- (`teste-real-*`) com identificador de Conta em texto e sem Conta-alvo real (ADR-0013, revisão de 2026-09-25):
--   * o texto continua como está. Ao lado dele nasce account_id, uma coluna uuid gerada: o próprio texto quando é um
--     UUID, senão nulo. Nenhum consumidor do texto muda, e ele nunca diverge do uuid;
--   * a chave estrangeira para target_accounts entra NOT VALID e MATCH FULL: vale para toda linha nova ou que troque
--     de chave (Conta que não existe, de outro Workspace ou sem UUID é recusada), e não olha as linhas antigas. As
--     órfãs só deixam de existir pela limpeza administrativa, revisada por uma pessoa (scripts/admin/
--     limpar-sequencias-orfas.sql), que termina com VALIDATE CONSTRAINT;
--   * a unicidade por Conta deixa de ser "uma linha" e passa a ser "uma Sequência em andamento": as encerradas ficam
--     como histórico.
--
-- A Sequência em andamento é sempre a do Vendedor responsável. Quando a responsabilidade muda, a Sequência do antigo
-- responsável é encerrada no mesmo instante, pelo gatilho da própria responsabilidade: o executor deixa de enxergá-la
-- (claim_due_step_sends só reserva Sequência ativa), os passos pendentes são cancelados e a autorização, revogada. O
-- documento dela não vai junto (ADR-0008 e ADR-0009): o novo responsável cria a dele, com o documento e as Contas
-- remetentes dele, e o Workspace continua vendo só a projeção segura da encerrada.
--
-- Primitivas para o arquivamento e o apagamento de Contas (CRM-18), que ainda não existe: pausar com trava, destravar
-- e encerrar. Só o lado da Sequência está aqui (pausar, cancelar o que não saiu, bloquear execução posterior); a
-- interface e o restante da anonimização são do CRM-18.

-- 1. A relação tipada com a Conta-alvo.
alter table public.sales_responsibilities
  add column account_id uuid generated always as (
    case when target_account_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then target_account_id::uuid end
  ) stored;

alter table public.sequences
  add column account_id uuid generated always as (
    case when target_account_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then target_account_id::uuid end
  ) stored;

alter table public.sales_responsibilities
  add constraint sales_responsibilities_target_account_fk
  foreign key (workspace_id, account_id) references public.target_accounts (workspace_id, id) match full not valid;

alter table public.sequences
  add constraint sequences_target_account_fk
  foreign key (workspace_id, account_id) references public.target_accounts (workspace_id, id) match full not valid;

create index sales_responsibilities_account_idx on public.sales_responsibilities (workspace_id, account_id);
create index sequences_account_idx on public.sequences (workspace_id, account_id);

comment on column public.sequences.account_id is
  'The target account as uuid: target_account_id when it is a UUID, else null (legacy test rows). The foreign key '
  'to target_accounts is NOT VALID until the orphan rows are cleaned up.';

-- 2. A Sequência encerrada e a Sequência pausada pela Conta.
--   encerrada: definitiva (a responsabilidade mudou ou a Conta foi apagada); só o sistema a encerra.
--   suspended_reason: a Conta foi arquivada; a Sequência fica pausada e o titular não a retoma até a Conta voltar.
alter table public.sequences drop constraint sequences_status_check;
alter table public.sequences add constraint sequences_status_check
  check (status in ('ativa', 'pausada', 'reuniao', 'esgotada', 'encerrada'));

alter table public.sequences
  add column ended_reason text check (ended_reason in ('responsibility_transferred', 'account_deleted')),
  add column ended_at timestamptz,
  add column suspended_reason text check (suspended_reason in ('account_archived'));

alter table public.sequences add constraint sequences_ended_consistency
  check ((status = 'encerrada') = (ended_reason is not null) and (ended_reason is null) = (ended_at is null));

-- No máximo uma Sequência em andamento por Conta e Workspace. O texto, e não o uuid, é a chave: cobre também as
-- linhas antigas sem UUID.
alter table public.sequences drop constraint sequences_workspace_id_target_account_id_key;
create unique index sequences_one_open_per_account
  on public.sequences (workspace_id, target_account_id) where status <> 'encerrada';

-- A autorização revogada guarda por que deixou de valer, inclusive quando é o sistema que a revoga.
alter table private.sequence_authorizations drop constraint sequence_authorizations_revoked_reason_check;
alter table private.sequence_authorizations add constraint sequence_authorizations_revoked_reason_check
  check (revoked_reason in (
    'edited', 'reactivated', 'responsibility_transferred', 'account_archived', 'account_deleted'
  ));

-- O que o Workspace lê da Sequência: só estado, nunca conteúdo.
grant select (account_id, ended_reason, ended_at, suspended_reason) on public.sequences to authenticated;

-- A projeção compartilhada aceita o novo estado.
create or replace function private.sanitize_sequence_public_summary()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_summary jsonb := case when jsonb_typeof(new.public_summary) = 'object'
    then new.public_summary else '{}'::jsonb end;
begin
  new.public_summary := jsonb_strip_nulls(jsonb_build_object(
    -- 'encerrada' só entra quando a Sequência está mesmo encerrada: o resumo vem do cliente e o Workspace o vê.
    'status', case when v_summary ->> 'status' in ('ativa', 'pausada', 'reuniao', 'esgotada')
        or (v_summary ->> 'status' = 'encerrada' and new.status = 'encerrada')
      then v_summary ->> 'status' else new.status end,
    'totalParticipantes', case when v_summary ->> 'totalParticipantes' ~ '^[0-9]{1,7}$'
      then least((v_summary ->> 'totalParticipantes')::integer, 1000000) end,
    'totalSteps', case when v_summary ->> 'totalSteps' ~ '^[0-9]{1,7}$'
      then least((v_summary ->> 'totalSteps')::integer, 1000000) end,
    'passoAtual', case when v_summary ->> 'passoAtual' ~ '^[0-9]{1,7}$'
      then least((v_summary ->> 'passoAtual')::integer, 1000000) end
  ));
  return new;
end;
$$;

-- 3. As regras da Sequência no próprio banco, valem para qualquer caminho de escrita:
--   * a encerrada é definitiva: não muda de estado, de titular nem de Conta;
--   * só o sistema encerra (a RPC do titular não preenche ended_reason);
--   * com a Conta arquivada, a Sequência só fica pausada;
--   * a Sequência em andamento é do Vendedor responsável pela Conta. Só se confere na criação ou quando titular,
--     Workspace ou Conta mudam: uma linha antiga que já divergia continua editável, sem que a migration a reescreva.
create function private.guard_sequence_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'encerrada'
     and (new.status is distinct from old.status
       or new.owner_user_id is distinct from old.owner_user_id
       or new.workspace_id is distinct from old.workspace_id
       or new.target_account_id is distinct from old.target_account_id) then
    raise exception 'an ended sequence cannot be changed' using errcode = '55006';
  end if;

  if new.status = 'encerrada' and (tg_op = 'INSERT' or old.status <> 'encerrada') and new.ended_reason is null then
    raise exception 'a sequence is ended only by the system' using errcode = '42501';
  end if;

  if new.suspended_reason is not null and new.status <> 'pausada' then
    raise exception 'the sequence is paused because its target account is archived' using errcode = '55006';
  end if;

  if new.status <> 'encerrada'
     and (tg_op = 'INSERT'
       or new.owner_user_id is distinct from old.owner_user_id
       or new.workspace_id is distinct from old.workspace_id
       or new.target_account_id is distinct from old.target_account_id) then
    -- FOR SHARE espera uma Transferência concorrente terminar: quem chega depois vê o novo responsável.
    perform 1 from public.sales_responsibilities r
    where r.workspace_id = new.workspace_id and r.target_account_id = new.target_account_id
      and r.owner_user_id = new.owner_user_id
    for share;
    if not found then
      raise exception 'the sequence owner must be the responsible seller of the target account' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_sequence_lifecycle() from public, anon, authenticated, service_role;

create trigger sequences_guard_lifecycle
  before insert or update on public.sequences
  for each row execute function private.guard_sequence_lifecycle();

-- 4. As primitivas do lado da Sequência. Todas travam a Sequência antes das linhas de Envio, na mesma ordem da
-- liberação e do resultado do envio, e são idempotentes.
--
-- Interrompe uma Sequência: revoga a autorização, cancela o que ainda não saiu e a pausa (com a trava do arquivamento)
-- ou a encerra. Um envio em voo não se cancela: o resultado dele é gravado, mas nenhum passo novo é programado, porque
-- não sobra autorização ativa nem Sequência ativa. O que já saiu, o histórico e os documentos ficam como estão.
-- p_ended_reason encerra; p_suspended_reason pausa com trava. Devolve se algo mudou.
create function private.halt_sequence(p_sequence_id uuid, p_ended_reason text, p_suspended_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence public.sequences;
  v_reason text := coalesce(p_ended_reason, p_suspended_reason);
  v_changed integer := 0;
  v_rows integer;
begin
  if (p_ended_reason is null) = (p_suspended_reason is null) then
    raise exception 'inform either an end reason or a suspension reason' using errcode = '22023';
  end if;
  select s.* into v_sequence from public.sequences s where s.id = p_sequence_id for update;
  if not found or v_sequence.status = 'encerrada' then
    return false;
  end if;

  update private.sequence_authorizations set
    revoked_at = now(),
    revoked_reason = case v_reason
      when 'responsibility_transferred' then 'responsibility_transferred'
      when 'account_deleted' then 'account_deleted'
      else 'account_archived' end
  where sequence_id = p_sequence_id and revoked_at is null;
  get diagnostics v_rows = row_count;
  v_changed := v_changed + v_rows;

  update private.sequence_step_sends set
    status = 'cancelled', scheduled_for = null, claimed_until = null, updated_at = now()
  where sequence_id = p_sequence_id and private.send_is_cancellable(status);
  get diagnostics v_rows = row_count;
  v_changed := v_changed + v_rows;

  if p_ended_reason is not null then
    update public.sequences set
      status = 'encerrada', ended_reason = p_ended_reason, ended_at = now(), suspended_reason = null,
      public_summary = public_summary || jsonb_build_object('status', 'encerrada'), updated_at = now()
    where id = p_sequence_id;
    return true;
  end if;

  if v_sequence.status is distinct from 'pausada' or v_sequence.suspended_reason is distinct from p_suspended_reason then
    update public.sequences set
      status = 'pausada', suspended_reason = p_suspended_reason,
      public_summary = public_summary || jsonb_build_object('status', 'pausada'), updated_at = now()
    where id = p_sequence_id;
    v_changed := v_changed + 1;
  end if;
  return v_changed > 0;
end;
$$;

revoke all on function private.halt_sequence(uuid, text, text) from public, anon, authenticated, service_role;

-- Encerra as Sequências em andamento de uma Conta, menos a do titular indicado. Devolve quantas encerrou.
create function private.end_open_sequences(
  p_workspace_id uuid, p_target_account_id text, p_reason text, p_except_owner uuid default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select s.id from public.sequences s
    where s.workspace_id = p_workspace_id and s.target_account_id = p_target_account_id
      and s.status <> 'encerrada' and s.owner_user_id is distinct from p_except_owner
    order by s.id
  loop
    if private.halt_sequence(v_id, p_reason, null) then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.end_open_sequences(uuid, text, text, uuid) from public, anon, authenticated, service_role;

-- Arquivar a Conta pausa a Sequência em andamento, cancela os passos pendentes e revoga a autorização. A trava impede o
-- titular de retomá-la enquanto a Conta estiver arquivada. Devolve quantas Sequências mudaram.
create function private.pause_sequences_of_archived_account(p_workspace_id uuid, p_target_account_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select s.id from public.sequences s
    where s.workspace_id = p_workspace_id and s.target_account_id = p_target_account_id::text
      and s.status <> 'encerrada'
    order by s.id
  loop
    if private.halt_sequence(v_id, null, 'account_archived') then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

-- Restaurar a Conta só tira a trava: a Sequência continua pausada, sem passos programados e sem autorização. Retomar é
-- ação explícita do Vendedor responsável, e os envios só voltam com uma nova ativação. Devolve quantas destravou.
create function private.unblock_sequences_of_restored_account(p_workspace_id uuid, p_target_account_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.sequences set suspended_reason = null, updated_at = now()
  where workspace_id = p_workspace_id and target_account_id = p_target_account_id::text
    and status <> 'encerrada' and suspended_reason = 'account_archived';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- O apagamento permanente da Conta encerra a Sequência: passos pendentes cancelados, autorização revogada, nada mais
-- sai. O histórico e o conteúdo privado ficam para o CRM-18 anonimizar. Devolve quantas Sequências encerrou.
create function private.end_sequences_of_deleted_account(p_workspace_id uuid, p_target_account_id uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select private.end_open_sequences(p_workspace_id, p_target_account_id::text, 'account_deleted', null);
$$;

revoke all on function private.pause_sequences_of_archived_account(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.unblock_sequences_of_restored_account(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function private.end_sequences_of_deleted_account(uuid, uuid) from public, anon, authenticated, service_role;

-- 5. Depois de uma Transferência de responsabilidade, a Sequência do antigo responsável termina. O gatilho vale para
-- qualquer troca de responsável, não só a RPC. A Distribuição da importação não chega aqui com Sequência: ela a recusa.
create function private.end_sequences_on_responsibility_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.end_open_sequences(
    new.workspace_id, new.target_account_id, 'responsibility_transferred', new.owner_user_id);
  return null;
end;
$$;

revoke all on function private.end_sequences_on_responsibility_change() from public, anon, authenticated, service_role;

create trigger sales_responsibilities_end_sequences
  after update of owner_user_id on public.sales_responsibilities
  for each row when (old.owner_user_id is distinct from new.owner_user_id)
  execute function private.end_sequences_on_responsibility_change();

-- 6. Criar a Sequência de uma Conta-alvo real. A responsabilidade nasce com a Conta (cadastro manual, roleta ou
-- importação), então aqui ela só é conferida: a Sequência é de quem a detém. O identificador precisa ser o UUID de uma
-- Conta do Workspace. A assinatura continua com texto para não quebrar quem já chama; a unicidade por Conta, agora
-- "em andamento", faz a disputa concorrente escolher um único vencedor.
create or replace function public.create_sequence(
  p_workspace_id uuid,
  p_target_account_id text,
  p_private_document jsonb,
  p_public_summary jsonb default '{}'::jsonb
) returns public.sequences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account_id uuid;
  v_owner uuid;
  v_sequence public.sequences;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;
  perform private.lock_caller_membership(p_workspace_id);

  if coalesce(p_target_account_id, '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;
  v_account_id := p_target_account_id::uuid;
  if not exists (
    select 1 from public.target_accounts a where a.id = v_account_id and a.workspace_id = p_workspace_id
  ) then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  -- Valida canais e integridade do documento privado
  perform private.validate_sequence_document(p_workspace_id, v_account_id::text, p_private_document);

  select r.owner_user_id into v_owner from public.sales_responsibilities r
  where r.workspace_id = p_workspace_id and r.target_account_id = v_account_id::text
  for share;
  if not found or v_owner <> v_user_id then
    raise exception 'target account already has another responsible seller' using errcode = '42501';
  end if;

  -- Uma Sequência que sobrou de outro titular (a responsabilidade mudou por fora do gatilho) não segura a Conta.
  perform private.end_open_sequences(p_workspace_id, v_account_id::text, 'responsibility_transferred', v_user_id);

  begin
    insert into public.sequences (workspace_id, target_account_id, owner_user_id, public_summary)
    values (p_workspace_id, v_account_id::text, v_user_id, coalesce(p_public_summary, '{}'::jsonb))
    returning * into v_sequence;
  exception when unique_violation then
    raise exception 'target account already has a sequence in progress' using errcode = '23505';
  end;

  insert into private.sequence_documents (sequence_id, owner_user_id, document)
  values (v_sequence.id, v_user_id, coalesce(p_private_document, '{}'::jsonb));

  return v_sequence;
end;
$$;

-- As funções redefinidas acima mantêm as permissões que já tinham; repetidas aqui para quem lê o arquivo sozinho.
revoke all on function public.create_sequence(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.create_sequence(uuid, text, jsonb, jsonb) to authenticated;
revoke all on function private.sanitize_sequence_public_summary() from public, anon, authenticated, service_role;

comment on column public.sequences.public_summary is
  'Safe shared status projection; must not contain message body, subject, attachment, or free-text message summary.';
comment on column public.sequences.ended_reason is
  'Why the system ended the sequence for good: the responsibility was transferred or the target account was deleted.';
comment on column public.sequences.suspended_reason is
  'Set while the target account is archived: the sequence stays paused and its owner cannot resume it.';
