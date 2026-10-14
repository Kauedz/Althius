-- Equipes e Publicações (PR-8, equipes-e-publicacoes): a foto mensal de headcount das Contas, o coletor do Sinal "Equipe
-- crescendo" (`crescimento_de_equipes`) e o das Publicações da empresa (`publicacao_da_empresa`, tipo novo).
--
-- Foto: a contagem de funcionários que a página da empresa no LinkedIn informa, por Conta e dia (a rodada mensal grava
-- uma por mês). Só o número da empresa: nunca dado de pessoa. RLS ligada e nenhum papel do app lê a tabela; o servidor
-- lê e grava por funções que conferem que a Conta é do Workspace.
--
-- Os dois actors entram "em teste", sem preço nem versão (como os outros do registro): o signal-runner não roda actor em
-- teste, e o tipo genérico `crescimento_de_equipes` segue atendido pela cascata `cruzando_faixa_de_headcount` até a
-- validação com amostra real. `publicacao_da_empresa` entra nos coletores do card para custar 2 créditos por Conta
-- varrida, o preço do card. Aditiva e idempotente; nada é apagado.

create table if not exists private.account_headcount_snapshots (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_account_id uuid not null references public.target_accounts(id) on delete cascade,
  taken_on date not null,
  headcount integer not null check (headcount > 0 and headcount <= 10000000),
  source text not null check (length(btrim(source)) between 1 and 200),
  created_at timestamptz not null default now(),
  primary key (workspace_id, target_account_id, taken_on)
);

comment on table private.account_headcount_snapshots is
  'Foto do headcount de uma Conta numa data: a contagem que a página da empresa informa, sem dado de pessoa.';

create index if not exists account_headcount_snapshots_account_idx
  on private.account_headcount_snapshots (target_account_id, taken_on);

alter table private.account_headcount_snapshots enable row level security;
revoke all on private.account_headcount_snapshots from public, anon, authenticated, service_role;

-- Grava (ou atualiza) a foto do dia de uma Conta do Workspace. Só o servidor.
create or replace function public.record_account_headcount(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_taken_on date,
  p_headcount integer,
  p_source text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.target_accounts a where a.id = p_target_account_id and a.workspace_id = p_workspace_id
  ) then
    raise exception 'account not found in workspace' using errcode = 'P0002';
  end if;
  if p_headcount is null or p_headcount <= 0 or p_headcount > 10000000 then
    raise exception 'invalid headcount' using errcode = '22023';
  end if;
  if p_taken_on is null or p_taken_on > (now() at time zone 'utc')::date + 1 then
    raise exception 'invalid date' using errcode = '22023';
  end if;
  insert into private.account_headcount_snapshots (workspace_id, target_account_id, taken_on, headcount, source)
  values (p_workspace_id, p_target_account_id, p_taken_on, p_headcount, left(coalesce(nullif(btrim(p_source), ''), 'desconhecida'), 200))
  on conflict (workspace_id, target_account_id, taken_on)
  do update set headcount = excluded.headcount, source = excluded.source;
end;
$$;

-- A foto mais antiga da Conta desde `p_since` e antes de `p_before`: a base da comparação de 90 dias. Só o servidor.
create or replace function public.account_headcount_base(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_since date,
  p_before date
) returns table (taken_on date, headcount integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.taken_on, s.headcount
  from private.account_headcount_snapshots s
  where s.workspace_id = p_workspace_id
    and s.target_account_id = p_target_account_id
    and s.taken_on >= p_since
    and s.taken_on < p_before
  order by s.taken_on
  limit 1;
$$;

-- Quantas vagas (Sinais de vaga) a Conta do Workspace teve desde a data: o reforço da regra de equipe. Só o servidor.
create or replace function public.count_account_job_signals(
  p_workspace_id uuid,
  p_target_account_id uuid,
  p_since timestamptz
) returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from private.signals s
  where s.workspace_id = p_workspace_id
    and s.target_account_id = p_target_account_id
    and s.signal_type in ('vaga_linkedin', 'vaga_indeed')
    and s.fired_at >= p_since;
$$;

revoke all on function public.record_account_headcount(uuid, uuid, date, integer, text) from public, anon, authenticated;
revoke all on function public.account_headcount_base(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function public.count_account_job_signals(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.record_account_headcount(uuid, uuid, date, integer, text) to service_role;
grant execute on function public.account_headcount_base(uuid, uuid, date, date) to service_role;
grant execute on function public.count_account_job_signals(uuid, uuid, timestamptz) to service_role;

-- Os actors, em teste.
insert into private.signal_actors (actor_id, signal_type, max_cost_usd, notes) values
  ('harvestapi~linkedin-company', 'crescimento_de_equipes', 0.02,
    'Equipe crescendo: headcount da página da empresa no LinkedIn, comparado com a foto de 90 dias.'),
  ('harvestapi~linkedin-company-posts', 'publicacao_da_empresa', 0.05,
    'Publicações da empresa no LinkedIn, até 10 posts por Conta, classificadas.')
on conflict (actor_id) do nothing;

update public.signal_catalog
set collector_types = array_append(collector_types, 'publicacao_da_empresa')
where id = 'publicacoes-da-empresa'
  and workspace_id is null
  and not ('publicacao_da_empresa' = any (collector_types));
