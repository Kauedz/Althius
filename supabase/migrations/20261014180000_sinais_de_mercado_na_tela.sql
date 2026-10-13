-- Leitura da tela para os Sinais de mercado (ticket 16).
--
-- `list_market_signals` continua como está: a leitura técnica, com fonte, evidência, chave e payload. Esta é a da tela.
-- Só quem participa do Workspace lê, só o ICP pedido (A–H), só cascata de escopo mercado, e só o que a pessoa vê:
-- id, tipo, nome, frase e data. E-mail, CPF formatado, telefone ou nome de fornecedor na frase viram uma frase neutra.

create function private.frase_de_mercado_para_a_tela(p_frase text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_frase is null then null
    when p_frase ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
      or p_frase ~ '[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}'
      or p_frase ~ '(\+?[0-9]{1,3}[[:space:].-]?)?\(?[0-9]{2}\)?[[:space:].-]?[0-9]{4,5}[[:space:].-]?[0-9]{4}'
      or not private.texto_sem_marca(p_frase)
      or p_frase ~* '(openai|anthropic|\yclaude\y|\ygpt[-[:space:]]?[0-9]|\ycodex\y)'
    then 'Sinal de mercado registrado.'
    else p_frase
  end;
$$;

revoke all on function private.frase_de_mercado_para_a_tela(text) from public, anon, authenticated, service_role;

create function public.list_market_signals_for_workspace_icp(p_workspace_id uuid, p_icp text)
returns table (id uuid, signal_type text, name text, phrase text, fired_at timestamptz)
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
  select m.id, m.signal_type, c.name, private.frase_de_mercado_para_a_tela(m.phrase), m.fired_at
  from private.market_signals m
  join private.signal_cascades c on c.signal_type = m.signal_type
  where m.workspace_id = p_workspace_id
    and c.scope = 'mercado'
    and c.icp = p_icp
  order by m.fired_at desc, m.id desc
  limit 200;
end;
$$;

revoke all on function public.list_market_signals_for_workspace_icp(uuid, text) from public, anon;
grant execute on function public.list_market_signals_for_workspace_icp(uuid, text) to authenticated;
