-- contexto-da-empresa 06: os Agentes e as Sequências do Rhetor usam o Contexto da empresa (Empresa, Perfil de cliente
-- ideal e Personas), e não mais as seções do Playbook. Aditiva: a leitura antiga (agent_run_playbook) fica no banco,
-- sem uso pelo motor, até o ticket 07; nada é apagado nem copiado do Playbook.

-- A versão do Contexto da empresa que a Execução usou. A primeira leitura fixa a vigente (0 quando não havia nenhuma);
-- as seguintes, na mesma Execução, devolvem a mesma, mesmo que um Administrador salve outra no meio. Execuções que não
-- leram o contexto ficam nulas.
alter table private.agent_runs add column if not exists company_context_version integer;

-- O contexto da Execução em andamento, para o motor (service_role). Sem contexto salvo, devolve os três textos vazios
-- e versão nula, e a Execução continua sem contexto até o fim.
create function public.agent_run_company_context(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run private.agent_runs;
  v_contexto jsonb;
begin
  select * into v_run from private.agent_runs r where r.id = p_run_id and r.status = 'running' for update;
  if v_run.id is null then
    raise exception 'run is not running' using errcode = '55000';
  end if;
  if v_run.company_context_version is null then
    v_contexto := private.current_company_context(v_run.workspace_id);
    update private.agent_runs set company_context_version = coalesce((v_contexto ->> 'version')::integer, 0)
    where id = p_run_id;
  else
    select jsonb_build_object('version', v.version, 'empresa', v.empresa, 'icp', v.icp, 'personas', v.personas)
      into v_contexto
    from private.company_context_versions v
    where v.workspace_id = v_run.workspace_id and v.version = v_run.company_context_version;
  end if;
  return jsonb_build_object('version', v_contexto -> 'version', 'empresa', coalesce(v_contexto ->> 'empresa', ''),
    'icp', coalesce(v_contexto ->> 'icp', ''), 'personas', coalesce(v_contexto ->> 'personas', ''));
end;
$$;

revoke all on function public.agent_run_company_context(uuid) from public, anon, authenticated;
grant execute on function public.agent_run_company_context(uuid) to service_role;

-- As sugestões de pedido dos Agentes (de 20261023100000) passam a olhar o Perfil de cliente ideal e as Personas do
-- Contexto da empresa, não as seções do Playbook. Sem o texto, os Agentes ajudam a escrever: quem salva é um
-- Administrador, em Configurações.
create or replace function private.compute_agent_prompt_suggestions(p_workspace_id uuid, p_specialty text, p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_quente text;
  v_frase text;
  v_novas integer;
  v_aprovacoes integer;
  v_pausadas integer;
  v_contexto jsonb := private.current_company_context(p_workspace_id);
  v_icp boolean := btrim(coalesce(v_contexto ->> 'icp', '')) <> '';
  v_personas boolean := btrim(coalesce(v_contexto ->> 'personas', '')) <> '';
  v_lista jsonb := '[]'::jsonb;
begin
  -- A Conta mais quente: a com mais Sinais válidos, e o Sinal mais recente dela.
  select t.name, s.phrase into v_quente, v_frase
  from private.signals s
  join public.target_accounts t on t.workspace_id = s.workspace_id and t.id = s.target_account_id
  where s.workspace_id = p_workspace_id and private.signal_is_valid(s.fired_at)
  order by (select count(*) from private.signals x
            where x.workspace_id = s.workspace_id and x.target_account_id = s.target_account_id
              and private.signal_is_valid(x.fired_at)) desc,
    s.fired_at desc, t.name
  limit 1;

  select count(*)::int into v_novas from private.discovered_accounts d
  where d.workspace_id = p_workspace_id and d.state = 'nova';
  select count(*)::int into v_aprovacoes from private.approvals a
  where a.workspace_id = p_workspace_id and a.state = 'pendente' and a.expires_at > now();
  select count(*)::int into v_pausadas from public.sequences q
  where q.workspace_id = p_workspace_id and q.owner_user_id = p_user_id and q.status = 'pausada';

  if p_specialty = 'scopus' then
    if v_quente is not null then
      v_lista := v_lista || jsonb_build_object('id', 'scopus-aderencia-quente', 'texto', format('Pontue a aderência da %s ao nosso ICP', v_quente));
    end if;
    if v_novas > 0 then
      v_lista := v_lista || jsonb_build_object('id', 'scopus-descoberta', 'texto',
        format('Avalie %s contra o nosso ICP', case when v_novas = 1 then 'a Candidata nova da Descoberta' else format('as %s Candidatas novas da Descoberta', v_novas) end));
    end if;
    v_lista := v_lista || case when v_icp
      then jsonb_build_object('id', 'scopus-revisar-icp', 'texto', 'Revise o nosso ICP com as Contas que mostraram Sinais')
      else jsonb_build_object('id', 'scopus-primeiro-icp', 'texto', 'Me ajude a escrever o Perfil de cliente ideal a partir dos nossos clientes') end;
    v_lista := v_lista || jsonb_build_object('id', 'scopus-contas', 'texto', 'Quais Contas-alvo mais se parecem com o nosso ICP?');
  elsif p_specialty = 'ethos' then
    if v_quente is not null then
      v_lista := v_lista || jsonb_build_object('id', 'ethos-comite-quente', 'texto', format('Monte as Personas do Comitê de compra da %s', v_quente));
    end if;
    v_lista := v_lista || case when v_personas
      then jsonb_build_object('id', 'ethos-objecoes', 'texto', 'Quais objeções as nossas Personas levantam hoje?')
      else jsonb_build_object('id', 'ethos-primeiras-personas', 'texto', 'Me ajude a descrever as Personas do nosso Comitê de compra') end;
    if v_icp then
      v_lista := v_lista || jsonb_build_object('id', 'ethos-icp', 'texto', 'Quem decide a compra nas empresas do nosso ICP?');
    end if;
    v_lista := v_lista || jsonb_build_object('id', 'ethos-gatilhos', 'texto', 'Quais gatilhos fazem um diretor comercial agir?');
  elsif p_specialty = 'rhetor' then
    if v_quente is not null then
      v_lista := v_lista || jsonb_build_object('id', 'rhetor-abordagem-quente', 'texto',
        format('Escreva uma abordagem para a %s sobre: %s', v_quente, left(v_frase, 60)));
    end if;
    if v_pausadas > 0 then
      v_lista := v_lista || jsonb_build_object('id', 'rhetor-pausadas', 'texto',
        format('Revise %s e proponha a retomada', case when v_pausadas = 1 then 'a Sequência pausada' else format('as %s Sequências pausadas', v_pausadas) end));
    end if;
    if v_aprovacoes > 0 then
      v_lista := v_lista || jsonb_build_object('id', 'rhetor-aprovacoes', 'texto',
        format('Resuma %s antes de eu decidir', case when v_aprovacoes = 1 then 'a Aprovação pendente' else format('as %s Aprovações pendentes', v_aprovacoes) end));
    end if;
    v_lista := v_lista || jsonb_build_object('id', 'rhetor-cadencia', 'texto', 'Proponha uma Sequência de e-mail para as Contas quentes');
  else
    if v_quente is not null then
      v_lista := v_lista || jsonb_build_object('id', 'oraculum-quente', 'texto', format('Como os LLMs descrevem a %s hoje?', v_quente));
    end if;
    v_lista := v_lista || jsonb_build_object('id', 'oraculum-presenca', 'texto', 'Como os LLMs descrevem a nossa empresa hoje?');
    v_lista := v_lista || jsonb_build_object('id', 'oraculum-concorrentes', 'texto', 'Compare a nossa presença nos LLMs com a dos concorrentes');
    if v_icp then
      v_lista := v_lista || jsonb_build_object('id', 'oraculum-icp', 'texto', 'Que perguntas o nosso ICP faz aos LLMs antes de comprar?');
    end if;
  end if;

  -- Sem dado nenhum, as genéricas já completam 3; com dados, no máximo 4.
  if jsonb_array_length(v_lista) < 3 then
    v_lista := v_lista || jsonb_build_object('id', p_specialty || '-geral', 'texto', 'O que você pode fazer por mim hoje?');
  end if;
  if jsonb_array_length(v_lista) < 3 then
    v_lista := v_lista || jsonb_build_object('id', p_specialty || '-semana', 'texto', 'Quais Contas-alvo merecem atenção esta semana?');
  end if;
  return (select coalesce(jsonb_agg(e order by n), '[]'::jsonb) from jsonb_array_elements(v_lista) with ordinality as x(e, n) where n <= 4);
end;
$$;

revoke all on function private.compute_agent_prompt_suggestions(uuid, text, uuid) from public, anon, authenticated, service_role;
