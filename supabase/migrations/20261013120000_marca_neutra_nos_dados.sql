-- Sinais em cascata, fatia 1: a marca. O usuário e o Hermes só conhecem "fonte pública", "Receita Federal" e "nossa
-- busca"; o nome do fornecedor de coleta e o termo "actor" ficam em coluna técnica que nenhum RPC da tela devolve.
-- As Edge Functions passam a gravar os rótulos neutros; esta migração acerta o que já estava gravado (Decisão 8:
-- neutralizar, em vez de só esconder na leitura) e fecha o único RPC lido pela tela que ainda devolvia a origem técnica.
-- Só aditiva em estrutura (um default novo e uma função redefinida sem mudar a assinatura); os dados mudam uma vez, e
-- repetir a função não muda nada.

-- 1. O contato proposto nasce com o rótulo público.
alter table private.proposed_contacts alter column source_provider set default 'linkedin_publico';

-- 2. O que a tela lê não devolve a origem técnica: mesma assinatura, o rótulo é fixo. (A coluna real fica no banco, para
-- auditoria; o `source_actor` já nunca saiu.)
create or replace function public.list_proposed_contacts(
  p_target_account_id uuid,
  p_state text default 'nova'
) returns table (
  id uuid,
  target_account_id uuid,
  state text,
  name text,
  role text,
  headline text,
  linkedin_url text,
  location text,
  photo_url text,
  persona text,
  contact_id uuid,
  source_provider text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_account public.target_accounts%rowtype;
begin
  if v_user is null then
    raise exception 'authentication required' using errcode = '28000';
  end if;

  select * into v_account from public.target_accounts a where a.id = p_target_account_id and a.deleted_at is null;
  if not found then
    raise exception 'target account not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = v_account.workspace_id and m.user_id = v_user and m.active
  ) then
    raise exception 'active workspace membership required' using errcode = '42501';
  end if;

  return query
  select
    p.id, p.target_account_id, p.state, p.name, p.role, p.headline,
    p.linkedin_url, p.location, p.photo_url, p.persona, p.contact_id,
    'linkedin_publico'::text, p.created_at
  from private.proposed_contacts p
  where p.target_account_id = p_target_account_id
    and (p_state is null or p.state = p_state)
  order by
    case p.persona
      when 'Decisor' then 1
      when 'Influenciador' then 2
      when 'Campeao' then 3
      else 4
    end,
    p.created_at desc;
end;
$$;

revoke all on function public.list_proposed_contacts(uuid, text) from public, anon;
grant execute on function public.list_proposed_contacts(uuid, text) to authenticated;

-- 3. O motivo gravado com a marca vira a mensagem do produto equivalente (saldo, prazo ou indisponível).
create function private.mensagem_neutra_da_falha(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(p_texto) ~ 'sem cr[eé]dito' then 'Sem saldo na fonte de dados; avisamos a equipe.'
    when lower(p_texto) ~ 'tempo' then 'Nossa busca não respondeu a tempo.'
    else 'A fonte pública está indisponível agora.'
  end;
$$;

revoke all on function private.mensagem_neutra_da_falha(text) from public, anon, authenticated, service_role;

-- Acerta o que já estava gravado com a marca. Devolve quantas linhas mudou; repetir não muda nada.
create function private.neutralizar_marca_nos_dados()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receita integer;
  v_contatos integer;
  v_provedor_campo integer;
  v_provedor_email integer;
  v_monitores integer;
  v_rodadas integer;
  v_buscas integer;
  v_pedidos integer;
begin
  update public.target_accounts set receita_data = jsonb_set(receita_data, '{fonte}', '"receita"')
  where receita_data ->> 'fonte' = 'apify';
  get diagnostics v_receita = row_count;

  update private.proposed_contacts set source_provider = 'linkedin_publico' where source_provider ~* '^apify';
  get diagnostics v_contatos = row_count;

  update private.contact_field_sources set provider = 'linkedin_publico' where provider ~* '^apify';
  get diagnostics v_provedor_campo = row_count;
  update private.contact_emails set provider = 'linkedin_publico' where provider ~* '^apify';
  get diagnostics v_provedor_email = row_count;

  update private.signal_monitors set last_error = private.mensagem_neutra_da_falha(last_error)
  where last_error ~* '(apify|actor)';
  get diagnostics v_monitores = row_count;
  update private.signal_monitor_runs set error = private.mensagem_neutra_da_falha(error) where error ~* '(apify|actor)';
  get diagnostics v_rodadas = row_count;
  update private.signal_rescans set last_error = private.mensagem_neutra_da_falha(last_error)
  where last_error ~* '(apify|actor)';
  get diagnostics v_buscas = row_count;
  update private.discovery_runs set last_error = private.mensagem_neutra_da_falha(last_error)
  where last_error ~* '(apify|actor)';
  get diagnostics v_pedidos = row_count;

  return jsonb_build_object(
    'receita', v_receita, 'contatos_propostos', v_contatos, 'procedencia_do_campo', v_provedor_campo,
    'emails_adicionais', v_provedor_email, 'monitoramentos', v_monitores, 'rodadas', v_rodadas, 'buscas', v_buscas,
    'descobertas', v_pedidos,
    'total', v_receita + v_contatos + v_provedor_campo + v_provedor_email + v_monitores + v_rodadas + v_buscas + v_pedidos);
end;
$$;

revoke all on function private.neutralizar_marca_nos_dados() from public, anon, authenticated, service_role;

select private.neutralizar_marca_nos_dados();
