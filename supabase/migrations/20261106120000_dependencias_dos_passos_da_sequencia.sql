-- Ticket 01 (Sequências coordenadas): validar liberação explícita e predecessor no documento.
-- Aditivo: documentos legados sem liberacao/predecessorId continuam válidos (serial pela ordem).
-- O Executor ainda agenda em série até o ticket 02; aqui só contrato + assinatura de passo.

create or replace function private.validate_sequence_document(
  p_workspace_id uuid,
  p_target_account_id text,
  p_document jsonb
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_step jsonb;
  v_canal text;
  v_steps jsonb;
  v_delay int;
  v_is_demo boolean;
  v_id text;
  v_liberacao text;
  v_predecessor text;
  v_ids text[] := array[]::text[];
  v_edge_from text;
  v_edge_to text;
  v_cursor text;
  v_path text[];
  v_next text;
begin
  if p_document is null then
    return;
  end if;

  v_steps := p_document -> 'steps';
  if v_steps is not null and jsonb_typeof(v_steps) = 'array' then
    for v_step in select * from jsonb_array_elements(v_steps) loop
      v_canal := v_step ->> 'canal';
      if v_canal is null or v_canal not in ('email', 'linkedin', 'whatsapp') then
        raise exception 'canal fora do escopo: apenas email, linkedin e whatsapp sao permitidos'
          using errcode = '22023';
      end if;

      if v_step ? 'delayDiasUteis' then
        v_delay := (v_step ->> 'delayDiasUteis')::int;
        if v_delay < 0 then
          raise exception 'delay em dias uteis deve ser maior ou igual a zero' using errcode = '22023';
        end if;
      end if;

      v_id := nullif(btrim(coalesce(v_step ->> 'id', '')), '');
      if v_id is not null then
        if v_id = any (v_ids) then
          raise exception 'dois passos com o mesmo id' using errcode = '22023';
        end if;
        v_ids := array_append(v_ids, v_id);
      end if;
    end loop;

    for v_step in select * from jsonb_array_elements(v_steps) loop
      v_id := nullif(btrim(coalesce(v_step ->> 'id', '')), '');
      v_liberacao := nullif(btrim(coalesce(v_step ->> 'liberacao', '')), '');
      v_predecessor := nullif(btrim(coalesce(v_step ->> 'predecessorId', '')), '');

      if v_liberacao is not null and v_liberacao not in ('ativacao', 'predecessor', 'manual') then
        raise exception 'liberacao invalida: use ativacao, predecessor ou manual' using errcode = '22023';
      end if;

      if v_liberacao = 'predecessor' or (v_liberacao is null and v_predecessor is not null) then
        if v_predecessor is null then
          raise exception 'passo com liberacao predecessor exige predecessorId' using errcode = '22023';
        end if;
        if v_id is not null and v_predecessor = v_id then
          raise exception 'passo nao pode depender de si mesmo' using errcode = '22023';
        end if;
        if v_id is null or not (v_predecessor = any (v_ids)) then
          raise exception 'predecessor inexistente na sequencia' using errcode = '22023';
        end if;
      elsif v_predecessor is not null then
        raise exception 'predecessorId so e permitido com liberacao predecessor' using errcode = '22023';
      end if;
    end loop;

    -- Ciclos só no grafo explícito (predecessorId). Legado sem arestas não entra.
    for v_step in select * from jsonb_array_elements(v_steps) loop
      v_edge_from := nullif(btrim(coalesce(v_step ->> 'id', '')), '');
      v_liberacao := nullif(btrim(coalesce(v_step ->> 'liberacao', '')), '');
      v_edge_to := nullif(btrim(coalesce(v_step ->> 'predecessorId', '')), '');
      if v_edge_from is null or v_edge_to is null then
        continue;
      end if;
      if v_liberacao is distinct from 'predecessor' and v_liberacao is not null then
        continue;
      end if;

      v_path := array[v_edge_from];
      v_cursor := v_edge_to;
      while v_cursor is not null loop
        if v_cursor = any (v_path) then
          raise exception 'dependencia circular entre passos' using errcode = '22023';
        end if;
        v_path := array_append(v_path, v_cursor);
        select nullif(btrim(coalesce(s ->> 'predecessorId', '')), '')
          into v_next
        from jsonb_array_elements(v_steps) as t(s)
        where nullif(btrim(coalesce(s ->> 'id', '')), '') = v_cursor
          and (
            nullif(btrim(coalesce(s ->> 'liberacao', '')), '') is null
            or nullif(btrim(coalesce(s ->> 'liberacao', '')), '') = 'predecessor'
          )
        limit 1;
        v_cursor := v_next;
        v_next := null;
      end loop;
    end loop;
  end if;

  -- Bloqueia dados de demonstracao autorizando execucao real
  v_is_demo := coalesce((p_document ->> 'is_demo')::boolean, false);
  if v_is_demo and (p_document ? 'autorizar_execucao_real' and (p_document ->> 'autorizar_execucao_real')::boolean) then
    raise exception 'dados ficticios e metricas de demonstracao nao podem autorizar execucao real'
      using errcode = '22023';
  end if;
end;
$$;

-- A condição de liberação e o predecessor mudam o "quando" do passo pendente.
-- Cópia da definição vigente (20261002120000_anexos_dos_passos.sql) com liberacao e predecessorId.
-- Não altera o Executor: ausência desses campos continua serial até o ticket 02.
create or replace function private.step_signature(p_document jsonb, p_step jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_step -> 'id',
    'canal', p_step -> 'canal',
    'contatoId', p_step -> 'contatoId',
    'delayDiasUteis', private.step_delay(p_step),
    'liberacao', p_step -> 'liberacao',
    'predecessorId', p_step -> 'predecessorId',
    'titulo', p_step -> 'titulo',
    'assunto', p_step -> 'assunto',
    'corpo', p_step -> 'corpo',
    'modoEmail', p_step -> 'modoEmail',
    'janela', private.step_window(p_document, p_step),
    'subtipoLinkedIn', case when p_step ->> 'canal' = 'linkedin' then p_step -> 'subtipoLinkedIn' end,
    'telefone', case when p_step ->> 'canal' = 'whatsapp' then p_step -> 'destino' end,
    'anexos', case when cardinality(private.step_attachment_ids(p_step)) > 0
      then to_jsonb(private.step_attachment_ids(p_step)) end);
$$;

revoke all on function private.step_signature(jsonb, jsonb) from public, anon, authenticated;
