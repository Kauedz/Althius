-- B3 (prospeccao-funcional): revelar o e-mail só cobra valor novo.
--
-- finish_reveal_contact, redefinida a partir de 20261001190000_enriquecimento_e_comite.sql, com a mesma assinatura e as
-- mesmas permissões. Antes ela liquidava os 2 créditos ao achar qualquer valor e gravava com coalesce(email, ...): quem já
-- tinha e-mail pagava sem ganhar nada, os adicionais (private.contact_emails) eram ignorados, p_source não era usado e a
-- origem só saía automatico porque o servidor chama sem sessão. Agora:
--   * Debita 2 só quando grava um e-mail que o Contato ainda não tinha, no primeiro lugar livre: o principal
--     (contacts.email) se está vazio, senão a posição 2 ou 3 de private.contact_emails. Com as travas e a conferência de
--     set_contact_channels (20260929170000): a do apagamento, a por valor e a unicidade no Workspace.
--   * E-mail que o Contato já tem, de outro Contato do Workspace, sem lugar livre, texto que não é e-mail ou nada achado:
--     debita zero e libera a reserva, sem erro e sem tocar no que já estava.
--   * Telefone: a revelação está indisponível (spec prospeccao-funcional). Libera a reserva e não grava.
--   * A origem do e-mail principal gravado é automatico, escrita pela própria função: o gatilho de origem
--     (20260929150000) marca manual sempre que há sessão, e um update direto em contacts.email herdava isso.
--   * O provedor (p_source) fica junto do e-mail: na procedência do principal (private.contact_field_sources) ou na linha
--     do adicional (private.contact_emails). O check de origin não muda.
--   * A reserva tem de ser do Workspace do Contato e da ação do canal.
-- Só aditiva: duas colunas anuláveis, um gatilho novo e a função redefinida. Nenhuma linha existente muda.

-- 1. O provedor junto do e-mail. Nulo: o valor não veio de uma coleta (uma pessoa, a importação).
alter table private.contact_field_sources
  add column provider text check (provider is null or length(provider) between 1 and 200);
alter table private.contact_emails
  add column provider text check (provider is null or length(provider) between 1 and 200);

comment on column private.contact_field_sources.provider is
  'O provedor que coletou o valor atual do campo (ex.: apify:harvestapi~linkedin-profile-scraper). Nulo fora de uma coleta.';
comment on column private.contact_emails.provider is
  'O provedor que coletou este e-mail adicional. Nulo quando uma pessoa o gravou; set_contact_channels regrava a lista sem ele.';

-- 2. Na procedência, o provedor vale só para o valor que a coleta gravou: toda escrita da linha o recalcula pelo aviso
-- althius.provedor_da_coleta, como a importação avisa com althius.importacao_lote. Sem o aviso (uma pessoa no app, a
-- importação, o gatilho de origem), o provedor sai: uma correção nunca herda o fornecedor do valor anterior.
create function private.contact_field_source_provider()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.provider := nullif(current_setting('althius.provedor_da_coleta', true), '');
  return new;
end;
$$;

revoke all on function private.contact_field_source_provider() from public, anon, authenticated, service_role;

create trigger contact_field_sources_provider
  before insert or update on private.contact_field_sources
  for each row execute function private.contact_field_source_provider();

-- 3. Finaliza a revelação: grava o e-mail novo no primeiro lugar livre e só então debita.
create or replace function public.finish_reveal_contact(
  p_reservation_id uuid,
  p_contact_id uuid,
  p_channel text,
  p_value text default null,
  p_source text default 'apify'
) returns table (success boolean, debited_credits integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_contact public.contacts%rowtype;
  v_reservation private.credit_reservations%rowtype;
  v_action text := case p_channel when 'email' then 'email_revealed' when 'telefone' then 'phone_revealed' end;
  v_email text;
  v_source text := left(nullif(btrim(coalesce(p_source, '')), ''), 200);
  v_ordinal smallint;
begin
  if v_action is null then
    raise exception 'invalid channel for reveal' using errcode = '22023';
  end if;

  select * into v_contact from public.contacts c where c.id = p_contact_id and c.archived_at is null for update;
  if not found then
    raise exception 'contact not found' using errcode = 'P0002';
  end if;

  select * into v_reservation from private.credit_reservations r where r.id = p_reservation_id;
  if not found
     or v_reservation.workspace_id <> v_contact.workspace_id
     or v_reservation.action <> v_action then
    raise exception 'the reservation does not belong to this reveal' using errcode = '22023';
  end if;

  -- Telefone indisponível: o que vier não é gravado nem cobrado. Texto que não é e-mail conta como nada achado.
  v_email := case when p_channel = 'email' then private.try_validate_email(p_value) end;
  if v_email is null then
    perform public.settle_credits(p_reservation_id, 0);
    return query select false, 0;
    return;
  end if;

  -- As travas de set_contact_channels: o apagamento do Contato espera esta escrita, e quem grava o mesmo e-mail no
  -- Workspace espera a vez. Com a trava, a conferência abaixo enxerga o que a outra sessão gravou.
  perform private.take_subject_lock('contact', v_contact.id, 'shared');
  perform private.lock_contact_channel(v_contact.workspace_id, 'email', v_email);

  -- Já é deste Contato (principal ou adicional) ou de outro do Workspace: nada novo.
  if exists (select 1 from public.contacts c where c.workspace_id = v_contact.workspace_id and c.email = v_email)
     or exists (
       select 1 from private.contact_emails e where e.workspace_id = v_contact.workspace_id and e.email = v_email) then
    perform public.settle_credits(p_reservation_id, 0);
    return query select false, 0;
    return;
  end if;

  if v_contact.email is null then
    v_ordinal := 1;
  else
    select min(v.o) into v_ordinal
    from (values (2::smallint), (3::smallint)) v(o)
    where not exists (select 1 from private.contact_emails e where e.contact_id = v_contact.id and e.ordinal = v.o);
  end if;
  -- Os três lugares ocupados por outros e-mails: nenhum é apagado e nada é cobrado.
  if v_ordinal is null then
    perform public.settle_credits(p_reservation_id, 0);
    return query select false, 0;
    return;
  end if;

  begin
    perform set_config('althius.provedor_da_coleta', coalesce(v_source, ''), true);
    if v_ordinal = 1 then
      update public.contacts c set
        email = v_email,
        email_label = coalesce(c.email_label, 'trabalho'),
        updated_at = now()
      where c.id = v_contact.id;
      -- A origem é desta função, não do gatilho, que marca manual quando há sessão.
      insert into private.contact_field_sources (workspace_id, contact_id, field, origin)
      values (v_contact.workspace_id, v_contact.id, 'email', 'automatico')
      on conflict (contact_id, field) do update set origin = 'automatico', source_id = null, observed_at = now();
    else
      insert into private.contact_emails (workspace_id, contact_id, ordinal, email, label, provider)
      values (v_contact.workspace_id, v_contact.id, v_ordinal, v_email, 'trabalho', v_source);
    end if;
    perform set_config('althius.provedor_da_coleta', '', true);
  exception when unique_violation then
    -- Os gatilhos de unicidade têm a última palavra. Perder para eles não cobra nem deixa a reserva presa; o aviso do
    -- provedor volta junto com o bloco.
    perform public.settle_credits(p_reservation_id, 0);
    return query select false, 0;
    return;
  end;

  return query select true, public.settle_credits(p_reservation_id, 1)::integer;
end;
$$;

revoke all on function public.finish_reveal_contact(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.finish_reveal_contact(uuid, uuid, text, text, text) to service_role;
