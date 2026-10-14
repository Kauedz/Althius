-- Sinal vira candidata (sinal-candidata-e-descoberta, tickets 05 e 07): a nota e as leituras da tela.
--
-- A nota de uma candidata é o Encaixe ICP (`fit_score`, de 0 a 100, que a busca pelo ICP calcula) mais o peso dos Sinais
-- que a trouxeram. O peso cheio de cada Sinal vem do tipo dele (a constante documentada em
-- `supabase/functions/account-discovery/pontuacao.ts`, gravada em `discovery_reasons.weight`) e decai com o tempo: peso
-- cheio até 30 dias depois do disparo, zero aos 90, em linha reta entre os dois. Os Sinais somam no máximo 60 pontos.
-- A nota depende de hoje, então é calculada na leitura. A tela só recebe o nível (ADR-0006): alto (75 ou mais), médio
-- (45 ou mais) e baixo; uma candidata sem Encaixe ICP e sem Sinal vigente fica "sem dado".
--
-- Estes números têm o mesmo valor em `pontuacao.ts` (`DIAS_DE_PESO_CHEIO`, `DIAS_ATE_ZERO`, `TETO_DOS_SINAIS`,
-- `CORTE_ALTO`, `CORTE_MEDIO`): um teste de cada lado confere os dois.

-- 1. A curva do decaimento: 1 até 30 dias, 0 a partir de 90, linear entre os dois.
create or replace function private.discovery_signal_decay(p_fired_at timestamptz, p_now timestamptz)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when extract(epoch from (p_now - p_fired_at)) / 86400.0 <= 30 then 1::numeric
    when extract(epoch from (p_now - p_fired_at)) / 86400.0 >= 90 then 0::numeric
    else ((90 - extract(epoch from (p_now - p_fired_at)) / 86400.0) / 60.0)::numeric
  end;
$$;

-- 2. A nota: Encaixe ICP mais os Sinais com decaimento, com teto de 60 para os Sinais.
create or replace function private.discovery_note(p_fit_score integer, p_discovered_account_id uuid, p_now timestamptz)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_fit_score, 0) + least(60::numeric, coalesce((
    select sum(r.weight * private.discovery_signal_decay(g.fired_at, p_now))
    from private.discovery_reasons r
    join private.signals g on g.id = r.signal_id
    where r.discovered_account_id = p_discovered_account_id
  ), 0));
$$;

-- 3. O nível da nota. `p_stored_level` é o Encaixe ICP gravado: uma busca que avaliou a empresa e achou tudo fora do ICP
-- ('baixo') não volta a ser "sem dado" por ter nota zero.
create or replace function private.discovery_level(p_note numeric, p_stored_level text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_note >= 75 then 'alto'
    when p_note >= 45 then 'medio'
    when p_note > 0 or coalesce(p_stored_level, 'sem_dado') <> 'sem_dado' then 'baixo'
    else 'sem_dado'
  end;
$$;

revoke all on function private.discovery_signal_decay(timestamptz, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.discovery_note(integer, uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function private.discovery_level(numeric, text) from public, anon, authenticated, service_role;

-- 4. O texto de um Sinal que vai à tela: sem e-mail, CPF, telefone nem nome de fornecedor. Vira o texto neutro.
create or replace function private.texto_do_sinal_para_a_tela(p_texto text, p_neutro text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_texto is null then null
    when p_texto ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      or p_texto ~ '[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}'
      or p_texto ~ '(\+?[0-9]{1,3}[[:space:].-]?)?\(?[0-9]{2}\)?[[:space:].-]?[0-9]{4,5}[[:space:].-]?[0-9]{4}'
      or p_texto ~* '(apify|\yactors?\y|harvestapi|johnatan029|unipile|lusha|openai|anthropic|\yclaude\y|\ygpt[-[:space:]]?[0-9]|\ycodex\y)'
    then p_neutro
    else p_texto
  end;
$$;

revoke all on function private.texto_do_sinal_para_a_tela(text, text) from public, anon, authenticated, service_role;

-- 5. A Caixa para quem participa. Mesmas colunas de antes, com o nível vindo da nota, e mais: a origem, a reabertura por
-- Sinal novo (com o motivo do descarte anterior) e os Sinais da candidata, do mais recente ao mais antigo. Nunca o número
-- da nota. Ordem: a nota e, no empate, o Sinal mais recente. A assinatura de retorno muda, então a função antiga sai e esta
-- entra no lugar (mesmo nome, mesmos argumentos).
drop function if exists public.list_discovered_accounts(uuid, text, integer);

create or replace function public.list_discovered_accounts(p_workspace_id uuid, p_state text default 'nova', p_limit integer default 200)
returns table (
  id uuid,
  run_id uuid,
  state text,
  name text,
  website text,
  domain text,
  cnpj text,
  linkedin_url text,
  location text,
  uf text,
  sector text,
  size_label text,
  employee_count integer,
  description text,
  tags text[],
  source_actor text,
  fit_level text,
  reasons jsonb,
  signals jsonb,
  target_account_id uuid,
  decided_by uuid,
  decided_at timestamptz,
  discard_reason text,
  created_at timestamptz,
  origin text,
  reopened_by_signal_at timestamptz,
  reopened_discard_reason text,
  signal_reasons jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  perform private.require_active_membership(p_workspace_id);
  if p_state is not null and p_state not in ('nova', 'aceita', 'descartada') then
    raise exception 'invalid state' using errcode = '22023';
  end if;
  return query
    select d.id, d.run_id, d.state, d.name, d.website, d.domain, d.cnpj, d.linkedin_url, d.location, d.uf, d.sector,
      d.size_label, d.employee_count, d.description, d.tags, d.source_actor,
      private.discovery_level(d.fit_score + least(60::numeric, s.peso), d.fit_level),
      d.reasons, d.signals, d.target_account_id, d.decided_by, d.decided_at, d.discard_reason, d.created_at,
      d.origin, d.reopened_by_signal_at, d.reopened_discard_reason,
      coalesce((
        select jsonb_agg(jsonb_build_object(
            'id', g.id,
            'tipo', g.signal_type,
            'frase', private.texto_do_sinal_para_a_tela(g.phrase, 'Sinal registrado.'),
            'fonte', private.texto_do_sinal_para_a_tela(g.source, null),
            'data', g.fired_at,
            'valido', private.signal_is_valid(g.fired_at),
            'mercado', g.market_signal_id is not null
          ) order by g.fired_at desc, g.id desc)
        from (
          select g2.* from private.discovery_reasons r2
          join private.signals g2 on g2.id = r2.signal_id
          where r2.discovered_account_id = d.id
          order by g2.fired_at desc, g2.id desc
          limit 50
        ) g
      ), '[]'::jsonb)
    from private.discovered_accounts d
    cross join lateral (
      select coalesce(sum(r.weight * private.discovery_signal_decay(g.fired_at, v_now)), 0) as peso,
        max(g.fired_at) as ultimo
      from private.discovery_reasons r
      join private.signals g on g.id = r.signal_id
      where r.discovered_account_id = d.id
    ) s
    where d.workspace_id = p_workspace_id and (p_state is null or d.state = p_state)
    order by d.fit_score + least(60::numeric, s.peso) desc, s.ultimo desc nulls last, d.created_at desc, d.id
    limit least(greatest(coalesce(p_limit, 200), 1), 500);
end;
$$;

revoke all on function public.list_discovered_accounts(uuid, text, integer) from public, anon;
grant execute on function public.list_discovered_accounts(uuid, text, integer) to authenticated;

-- 6. Os Sinais das candidatas que esperam decisão, para "Sinais encontrados" (com "Ver candidata"). Só as novas: a aceita
-- tem os Sinais na Conta e a descartada fica escondida. Todo participante ativo lê, só do próprio Workspace.
create or replace function public.list_candidate_signals(p_workspace_id uuid, p_limit integer default 200)
returns table (
  id uuid,
  discovered_account_id uuid,
  company_name text,
  signal_type text,
  phrase text,
  fired_at timestamptz,
  source text,
  valid boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  return query
  select g.id, g.discovered_account_id, d.name, g.signal_type,
    private.texto_do_sinal_para_a_tela(g.phrase, 'Sinal registrado.'), g.fired_at,
    private.texto_do_sinal_para_a_tela(g.source, null), private.signal_is_valid(g.fired_at)
  from private.signals g
  join private.discovered_accounts d on d.workspace_id = g.workspace_id and d.id = g.discovered_account_id
  where g.workspace_id = p_workspace_id and g.discovered_account_id is not null and d.state = 'nova'
  order by g.fired_at desc, g.id desc
  limit least(greatest(coalesce(p_limit, 200), 1), 1000);
end;
$$;

revoke all on function public.list_candidate_signals(uuid, integer) from public, anon;
grant execute on function public.list_candidate_signals(uuid, integer) to authenticated;

-- 7. Os Sinais de mercado de um nicho que têm empresa: a Conta (por CNPJ) ou a candidata, para "Ver Conta" e
-- "Ver candidata" em Mercado. A leitura da tela de Mercado (`list_market_signals_for_workspace_icp`) não muda.
create or replace function public.list_market_signal_companies(p_workspace_id uuid, p_icp text)
returns table (market_signal_id uuid, target_account_id uuid, discovered_account_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_active_membership(p_workspace_id);
  if p_icp is null or p_icp !~ '^[A-H]$' then
    raise exception 'invalid icp' using errcode = '22023';
  end if;
  return query
  select m.id, g.target_account_id, g.discovered_account_id
  from private.market_signals m
  join private.signal_cascades c on c.signal_type = m.signal_type and c.scope = 'mercado' and c.icp = p_icp
  join private.signals g on g.workspace_id = m.workspace_id and g.market_signal_id = m.id
  left join private.discovered_accounts d on d.workspace_id = g.workspace_id and d.id = g.discovered_account_id
  where m.workspace_id = p_workspace_id
    and (g.target_account_id is not null or d.state in ('nova', 'aceita'))
  order by m.fired_at desc, m.id desc
  limit 200;
end;
$$;

revoke all on function public.list_market_signal_companies(uuid, text) from public, anon;
grant execute on function public.list_market_signal_companies(uuid, text) to authenticated;
