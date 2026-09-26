-- Higiene dos avisos de segurança do Supabase (advisors).
-- As funções de validação do canais-02 passam a ter search_path fixo; o corpo delas só usa funções do pg_catalog.
alter function private.normalize_whatsapp(text) set search_path = '';
alter function private.validate_email(text) set search_path = '';

-- public.rls_auto_enable() é a função do event trigger ensure_rls, criada pelo painel do Supabase e não por migration.
-- Ela roda como event trigger e nenhum papel da API precisa executá-la por RPC.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
