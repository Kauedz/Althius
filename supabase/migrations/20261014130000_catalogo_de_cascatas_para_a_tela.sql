-- Catálogo de cascatas para a tela (ticket 13 de sinais em cascata): um cartão por Sinal do Mapa de Mercado.
-- `signal_cascade_catalog()` continua só do servidor (traz cadência e notas); esta é a leitura da tela: só o que o cartão
-- mostra. Sem teto, passos, handler, multiplicador nem `notes`. O motivo do `sem_fonte` já nasce sem fornecedor
-- (`private.texto_sem_marca` na escrita) e é só ele que a tela lê. Cascata desligada não aparece.

create function public.list_cascade_catalog()
returns table (signal_type text, icp text, name text, state text, scope text, sem_fonte_motivo text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  return query
  select c.signal_type, c.icp, c.name, c.state, c.scope, c.sem_fonte_motivo
  from private.signal_cascades c
  where c.state <> 'disabled'
  order by c.icp, c.signal_type;
end;
$$;

revoke all on function public.list_cascade_catalog() from public, anon;
grant execute on function public.list_cascade_catalog() to authenticated;
