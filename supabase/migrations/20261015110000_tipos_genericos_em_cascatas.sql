-- Tipos genéricos do catálogo atendidos pelas cascatas do Mapa de Mercado (auditoria de Sinais de 13/10/2026).
--
-- O catálogo da tela tem tipos genéricos (Abertura de vagas, Novo escritório ou unidade, Registros empresariais,
-- Investimentos anunciados, Crescimento de equipes, Expansão geográfica) que ficavam "Em breve" embora as cascatas do Mapa
-- (vaga_comex, nova_planta_filial, financiamento_bndes_finep, cruzando_faixa_de_headcount...) já fizessem o trabalho. Cada
-- cascata é amarrada a um ICP (A a H) e a tela só conhece o tipo genérico. Esta migração liga os dois lados, em dado:
--
--   private.signal_type_cascades   o tipo do catálogo e as cascatas que o servem, na ordem. Sem ICP: o Workspace escolhe o
--                                  tipo pelo acontecimento (vaga, filial, sede, financiamento, headcount), de qualquer ICP.
--
-- O estado do tipo é o melhor estado das cascatas ligadas (disponível, em teste ou fora; uma cascata sem fonte conta como
-- fora), e o tipo que já tem actor (Abertura de vagas, `vaga_linkedin`) fica com o melhor entre o actor e as cascatas. O
-- Monitoramento do tipo genérico roda cada cascata disponível e devida pelo mesmo motor (uma reserva de crédito por cascata)
-- e grava o Sinal no tipo genérico, então a tela não precisa conhecer as cascatas. Nada aqui reserva crédito, chama
-- fornecedor ou muda o estado de uma cascata: todas continuam "em teste" até a equipe validar uma execução real
-- (`set_signal_cascade_state`, passo do Nan), e só então o tipo genérico passa a aceitar Monitoramento.
--
-- Regra de produto: os Sinais de cada ICP detectam eventos nas empresas para quem o ICP vende, nunca no próprio ICP. Um
-- tipo genérico é um tipo de Conta (o evento é numa empresa compradora do Workspace), então só cascata de escopo `conta`
-- o atende: a de `mercado` (Comex Stat, DOU, Plano Safra) não tem Conta e o banco a recusa, inclusive se uma cascata ligada
-- virar de mercado depois.
--
-- Redefinidas a partir da definição mais recente (20261013130000_cascatas_de_sinais.sql; nenhuma migration posterior as
-- redefiniu): `private.signal_type_is_runnable` e `public.list_signal_catalog`. Nenhum dado é apagado nem renomeado.

-- 1. O mapeamento.
create table private.signal_type_cascades (
  signal_type text not null references private.signal_catalog(signal_type),
  cascade_signal_type text not null references private.signal_cascades(signal_type),
  -- A ordem em que as cascatas rodam num Monitoramento do tipo.
  position smallint not null check (position between 1 and 12),
  created_at timestamptz not null default now(),
  primary key (signal_type, cascade_signal_type),
  unique (signal_type, position)
);

create index signal_type_cascades_cascade_idx on private.signal_type_cascades (cascade_signal_type);

alter table private.signal_type_cascades enable row level security;
revoke all on private.signal_type_cascades from public, anon, authenticated, service_role;

-- Um tipo genérico não é uma cascata nem um Sinal interno, e só cascata de empresa (escopo Conta) o atende. Uma cascata
-- inexistente ou um tipo fora do catálogo ficam para as chaves estrangeiras.
create function private.signal_type_cascade_is_valid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text;
begin
  if exists (select 1 from private.signal_cascades c where c.signal_type = new.signal_type) then
    raise exception 'a cascade cannot be a generic signal type' using errcode = '23514';
  end if;
  if exists (select 1 from private.signal_catalog c where c.signal_type = new.signal_type and c.origin = 'interno') then
    raise exception 'an internal signal cannot be a generic signal type' using errcode = '23514';
  end if;
  select c.scope into v_scope from private.signal_cascades c where c.signal_type = new.cascade_signal_type;
  if found and v_scope <> 'conta' then
    raise exception 'a generic signal type is served only by account cascades' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.signal_type_cascade_is_valid() from public, anon, authenticated, service_role;

create trigger signal_type_cascades_valid before insert or update on private.signal_type_cascades
  for each row execute function private.signal_type_cascade_is_valid();

-- A cascata que atende um tipo genérico não vira de mercado depois.
create function private.signal_cascade_scope_keeps_generic_types()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scope <> 'conta' and exists (select 1 from private.signal_type_cascades a where a.cascade_signal_type = new.signal_type) then
    raise exception 'a cascade that serves a generic signal type must stay an account cascade' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.signal_cascade_scope_keeps_generic_types() from public, anon, authenticated, service_role;

create trigger signal_cascades_scope_keeps_generic_types before update of scope on private.signal_cascades
  for each row execute function private.signal_cascade_scope_keeps_generic_types();

-- 2. Os tipos do catálogo da tela e as cascatas que os servem. Cinco tipos são novos no catálogo do banco (externos, sem
-- actor); `vaga_linkedin` já existe (o card "Abertura de vagas") e ganha as cascatas de vaga.
--   vaga_linkedin             vaga_comex (A), vaga_logistica (F), vaga_engenharia_manutencao (E)
--   novo_escritorio           nova_planta_filial (D), novo_cd_ou_filial (F), troca_de_sede (F)
--   registros_empresariais    cnpj_novo (B), mudanca_de_porte_ou_regime (B), entrada_de_socio (B; só "entrou sócio", sem nome)
--   investimentos_anunciados  financiamento_bndes_finep (E), expansao_de_planta (E)
--   crescimento_de_equipes    cruzando_faixa_de_headcount (G)
--   expansao_geografica       nova_filial_icp_g (G), novo_cd_ou_filial (F), nova_planta_filial (D)
-- Em todas, o evento é numa empresa compradora do Workspace. As cascatas sem fonte (caged_por_empresa, por exemplo) e as de
-- mercado não entram.
insert into private.signal_catalog (signal_type, origin) values
  ('novo_escritorio', 'externo'),
  ('registros_empresariais', 'externo'),
  ('investimentos_anunciados', 'externo'),
  ('crescimento_de_equipes', 'externo'),
  ('expansao_geografica', 'externo');

insert into private.signal_type_cascades (signal_type, cascade_signal_type, position) values
  ('vaga_linkedin', 'vaga_comex', 1),
  ('vaga_linkedin', 'vaga_logistica', 2),
  ('vaga_linkedin', 'vaga_engenharia_manutencao', 3),
  ('novo_escritorio', 'nova_planta_filial', 1),
  ('novo_escritorio', 'novo_cd_ou_filial', 2),
  ('novo_escritorio', 'troca_de_sede', 3),
  ('registros_empresariais', 'cnpj_novo', 1),
  ('registros_empresariais', 'mudanca_de_porte_ou_regime', 2),
  ('registros_empresariais', 'entrada_de_socio', 3),
  ('investimentos_anunciados', 'financiamento_bndes_finep', 1),
  ('investimentos_anunciados', 'expansao_de_planta', 2),
  ('crescimento_de_equipes', 'cruzando_faixa_de_headcount', 1),
  ('expansao_geografica', 'nova_filial_icp_g', 1),
  ('expansao_geografica', 'novo_cd_ou_filial', 2),
  ('expansao_geografica', 'nova_planta_filial', 3);

-- 3. O estado. O melhor entre os estados que existem: disponível, depois em teste, depois fora; nada a comparar, nulo.
create function private.best_signal_state(p_states text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when 'available' = any (p_states) then 'available'
    when 'testing' = any (p_states) then 'testing'
    when cardinality(array_remove(p_states, null)) > 0 then 'out'
  end;
$$;

revoke all on function private.best_signal_state(text[]) from public, anon, authenticated, service_role;

-- O estado de um tipo genérico pelas cascatas ligadas (sem fonte e desligada contam como fora), ou nulo se não tem nenhuma.
create function private.generic_signal_state(p_signal_type text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select private.best_signal_state(array_agg(case k.state when 'available' then 'available' when 'testing' then 'testing' else 'out' end))
  from private.signal_type_cascades a
  join private.signal_cascades k on k.signal_type = a.cascade_signal_type
  where a.signal_type = p_signal_type;
$$;

revoke all on function private.generic_signal_state(text) from public, anon, authenticated, service_role;

-- "Rodável": o actor do tipo está disponível, ou a cascata do tipo está, ou uma cascata que atende o tipo genérico está.
create or replace function private.signal_type_is_runnable(p_signal_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.signal_actors a where a.signal_type = p_signal_type and a.state = 'available')
    or exists (select 1 from private.signal_cascades c where c.signal_type = p_signal_type and c.state = 'available')
    or exists (
      select 1 from private.signal_type_cascades a
      join private.signal_cascades k on k.signal_type = a.cascade_signal_type and k.state = 'available'
      where a.signal_type = p_signal_type);
$$;

revoke all on function private.signal_type_is_runnable(text) from public, anon, authenticated, service_role;

-- O catálogo como o cliente o vê: o estado do Sinal interno; o do actor, o da cascata e o das cascatas que atendem o tipo
-- (o melhor deles) nos externos.
create or replace function public.list_signal_catalog()
returns table (signal_type text, origin text, state text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  return query
  select c.signal_type, c.origin, coalesce(
    c.state,
    private.best_signal_state(array[
      a.state,
      case k.state when 'available' then 'available' when 'testing' then 'testing' when 'sem_fonte' then 'out' when 'disabled' then 'out' end,
      private.generic_signal_state(c.signal_type)]),
    'out')
  from private.signal_catalog c
  left join private.signal_actors a on a.signal_type = c.signal_type
  left join private.signal_cascades k on k.signal_type = c.signal_type
  order by c.origin, c.signal_type;
end;
$$;

revoke all on function public.list_signal_catalog() from public, anon;
grant execute on function public.list_signal_catalog() to authenticated;

-- 4. O plano de um Monitoramento de tipo genérico, para o signal-runner: as cascatas que atendem o tipo, o estado de cada
-- uma e se ela está devida. Devida é a que não tem, para este Monitoramento, uma execução concluída, parcial ou em andamento
-- dentro da cadência dela (a cascata mensal não roda todo dia); a que falhou ou foi abortada continua devida, e a busca
-- feita numa conversa não conta. Só o servidor chama.
create function public.signal_type_cascade_plan(p_monitor_id uuid)
returns table (cascade_signal_type text, state text, due boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.cascade_signal_type, k.state,
    not exists (
      select 1 from private.signal_cascade_runs r
      where r.monitor_id = m.id and r.cascade_id = k.id and r.origin = 'monitor'
        and r.state in ('running', 'succeeded', 'partial')
        and r.started_at > now() - make_interval(hours => k.cadence_hours))
  from private.signal_monitors m
  join private.signal_type_cascades a on a.signal_type = m.signal_type
  join private.signal_cascades k on k.signal_type = a.cascade_signal_type
  where m.id = p_monitor_id
  order by a.position;
$$;

revoke all on function public.signal_type_cascade_plan(uuid) from public, anon, authenticated;
grant execute on function public.signal_type_cascade_plan(uuid) to service_role;
