-- Passos de IA dos Sinais pelo Hermes (OpenAI): a fila de classificações.
--
-- Os passos que classificam texto (notícia de recuperação judicial ou de expansão, diário oficial) precisam de um modelo de
-- linguagem. A decisão é que toda IA da Althius passa pela OpenAI, e o Hermes (na VPS, só na rede interna) já a tem; as Edge
-- Functions não alcançam o Hermes. Então o passo ENFILEIRA o pedido aqui, o worker do Hermes o reserva, responde e grava, e a
-- função lê a resposta até o prazo (provedor `hermes`, `SIGNALS_LLM_PROVIDER`). Só entra texto público (manchete, ementa);
-- nenhum segredo. Só o servidor (service_role) usa; nenhum papel de usuário enxerga a fila. Resolvido o pedido, o texto fica
-- um dia (para auditar o custo) e depois é apagado.

create table private.signal_llm_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  system_prompt text not null check (length(system_prompt) between 1 and 20000),
  user_prompt text not null check (length(user_prompt) between 1 and 60000),
  max_tokens integer not null check (max_tokens between 1 and 4000),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  result_text text check (result_text is null or length(result_text) <= 60000),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  -- Mensagem neutra: o erro real do Hermes fica só no log do worker.
  error text check (error is null or length(error) <= 300),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  finished_at timestamptz
);

create index signal_llm_requests_fila_idx on private.signal_llm_requests (created_at) where status = 'queued';
create index signal_llm_requests_limpeza_idx on private.signal_llm_requests (finished_at) where finished_at is not null;

alter table private.signal_llm_requests enable row level security;
revoke all on private.signal_llm_requests from public, anon, authenticated, service_role;

-- A função que enfileira (a Edge Function). Também limpa o que já passou de um dia e dá por falho o que ficou parado sem
-- worker (a função já desistiu: o prazo dela é de 90 s no máximo).
create function public.enqueue_signal_llm_request(p_workspace_id uuid, p_system text, p_user text, p_max_tokens integer default 800)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_workspace_id is null or not exists (select 1 from public.workspaces w where w.id = p_workspace_id) then
    raise exception 'Workspace inexistente.' using errcode = '22023';
  end if;
  delete from private.signal_llm_requests where finished_at < now() - interval '1 day';
  update private.signal_llm_requests
     set status = 'failed', error = 'A classificação não foi respondida a tempo', finished_at = now()
   where status in ('queued', 'running') and created_at < now() - interval '10 minutes';
  insert into private.signal_llm_requests (workspace_id, system_prompt, user_prompt, max_tokens)
  values (p_workspace_id, p_system, p_user, least(greatest(coalesce(p_max_tokens, 800), 1), 4000))
  returning id into v_id;
  return v_id;
end;
$$;

-- O worker reserva o pedido mais antigo da fila, uma vez só (dois workers nunca pegam o mesmo).
create function public.claim_signal_llm_request()
returns table (id uuid, system_prompt text, user_prompt text, max_tokens integer)
language sql
security definer
set search_path = ''
as $$
  update private.signal_llm_requests r
     set status = 'running', claimed_at = now()
   where r.id = (
     select q.id from private.signal_llm_requests q
      where q.status = 'queued' and q.created_at > now() - interval '10 minutes'
      order by q.created_at
      for update skip locked
      limit 1)
  returning r.id, r.system_prompt, r.user_prompt, r.max_tokens;
$$;

-- O worker grava a resposta (done) ou a falha (failed). Só um pedido em andamento fecha; fechar de novo não muda nada.
create function public.finish_signal_llm_request(
  p_id uuid, p_status text, p_result text default null, p_input_tokens integer default null,
  p_output_tokens integer default null, p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('done', 'failed') then
    raise exception 'Estado inválido.' using errcode = '22023';
  end if;
  update private.signal_llm_requests
     set status = p_status,
         result_text = case when p_status = 'done' then p_result end,
         input_tokens = p_input_tokens,
         output_tokens = p_output_tokens,
         error = case when p_status = 'failed' then left(coalesce(p_error, 'A classificação falhou'), 300) end,
         finished_at = now()
   where id = p_id and status = 'running';
end;
$$;

-- A Edge Function lê a resposta pelo id.
create function public.get_signal_llm_request(p_id uuid)
returns table (status text, result_text text, input_tokens integer, output_tokens integer, error text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.status, r.result_text, r.input_tokens, r.output_tokens, r.error
    from private.signal_llm_requests r where r.id = p_id;
$$;

revoke all on function public.enqueue_signal_llm_request(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.claim_signal_llm_request() from public, anon, authenticated;
revoke all on function public.finish_signal_llm_request(uuid, text, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.get_signal_llm_request(uuid) from public, anon, authenticated;
grant execute on function public.enqueue_signal_llm_request(uuid, text, text, integer) to service_role;
grant execute on function public.claim_signal_llm_request() to service_role;
grant execute on function public.finish_signal_llm_request(uuid, text, text, integer, integer, text) to service_role;
grant execute on function public.get_signal_llm_request(uuid) to service_role;
