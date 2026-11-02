-- Sinais first 13 (ADR-0033 D9(c)): os quatro Agentes padrão deixam de ser semeados
-- em Workspaces novos. A função e o gatilho continuam existindo; a retirada do schema
-- fica para o ticket 15. Workspaces existentes mantêm seus Agentes sem alteração.
-- Para reverter, recriar o corpo da migration 20261122130400_habilitar_whatsapp_em_conexoes.sql.

create or replace function private.seed_default_agents(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A semeadura foi desligada; os dados já existentes continuam preservados.
  null;
end;
$$;

revoke all on function private.seed_default_agents(uuid) from public, anon, authenticated, service_role;
