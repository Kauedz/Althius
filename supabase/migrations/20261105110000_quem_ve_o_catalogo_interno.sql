-- Quem vê o catálogo de Sinais inteiro (catalogo-so-funcionais 01). O cliente vê só os Sinais que rodam de verdade; a
-- equipe da Althius vê também os que ainda estão em teste ou em breve, marcados como internos. A tela pergunta só por
-- quem está logado: a função não recebe usuário e não diz nada sobre outra pessoa.
create function public.viewer_is_althius_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_althius_staff((select auth.uid()));
$$;

revoke all on function public.viewer_is_althius_staff() from public, anon;
grant execute on function public.viewer_is_althius_staff() to authenticated;
