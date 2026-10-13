-- Na validação da equipe, a execução guarda até 5 empresas achadas que não são Conta do Workspace.
-- Só CNPJ (14 dígitos) e razão social. Nome com CPF não entra. Quem grava é a chave de serviço.

alter table private.signal_cascade_runs
  add column validation_sample jsonb;

comment on column private.signal_cascade_runs.validation_sample is
  'Na validação da equipe: até 5 empresas achadas que não são Conta, só CNPJ e razão social. Sem CPF.';

create function public.record_cascade_validation_sample(p_run_id uuid, p_sample jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_limpo jsonb := '[]'::jsonb;
  v_cnpj text;
  v_nome text;
begin
  if p_run_id is null or not exists (select 1 from private.signal_cascade_runs r where r.id = p_run_id) then
    raise exception 'cascade run not found' using errcode = 'P0002';
  end if;
  if p_sample is null or jsonb_typeof(p_sample) <> 'array' then
    raise exception 'amostra invalida' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_sample)
  loop
    exit when jsonb_array_length(v_limpo) >= 5;
    if jsonb_typeof(v_item) <> 'object' then
      continue;
    end if;
    v_nome := left(btrim(v_item ->> 'nome'), 200);
    v_cnpj := nullif(v_item ->> 'cnpj', '');
    if v_nome is null or v_nome = '' then
      continue;
    end if;
    if v_nome ~ '\d{3}\.?\d{3}\.?\d{3}-?\d{2}' then
      continue;
    end if;
    if v_cnpj is not null and v_cnpj !~ '^\d{14}$' then
      v_cnpj := null;
    end if;
    v_limpo := v_limpo || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('cnpj', v_cnpj, 'nome', v_nome)));
  end loop;
  update private.signal_cascade_runs
    set validation_sample = v_limpo
    where id = p_run_id;
end;
$$;

revoke all on function public.record_cascade_validation_sample(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_cascade_validation_sample(uuid, jsonb) to service_role;
