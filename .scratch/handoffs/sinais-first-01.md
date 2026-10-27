# Handoff — sinais-first-01: ICP estruturado único

## Estado atual

Ticket implementado na branch `ralph/sinais-first-01-icp-estruturado-unico`, a partir de `1541363` (decisões do Renan de 26/10/2026). O status do ticket está `ready-for-human`; falta a confirmação dos três jobs do CI. Foi tratado somente `.scratch/sinais-first/issues/01-icp-estruturado-unico.md`.

## O que mudou

- Migration nova `supabase/migrations/20261214102000_icp_estruturado_unico.sql`: adiciona os campos Mini-ICP ao Day0, cria a tabela privada versionada com RLS, expõe a leitura autenticada do ICP, semeia a partir do Day0/seção `icp` e redefine `save_my_day0`, `get_my_day0` e `create_company_workspace` preservando as assinaturas e permissões efetivas.
- `projeto-althius-frontend/src/fonte/supabase-onboarding.ts` persiste e retoma os campos; teste em `projeto-althius-frontend/src/fonte/supabase-onboarding.test.ts`.
- pgTAP em `supabase/tests/icp_estruturado_unico.sql`.
- Critérios e comentário do ticket atualizados; detalhes completos nos arquivos citados e no diff.

## Verificações

- TDD: o teste novo da fonte falhou no estado-base (`salvarProduto` indisponível), depois passou com a implementação.
- pgTAP específico: 22/22; suíte local completa: todos os arquivos passaram após recriar o banco local `pgtap_lu1_sinais_first_01`.
- Vitest completo: 231 arquivos; 1999 testes passaram e 4 foram ignorados. Uma primeira execução parcial mostrou falhas transitórias, mas a execução completa posterior passou.
- `npm run lint` e `npx tsc -b`: código zero. Lint reportou avisos preexistentes fora dos arquivos alterados.
- Nenhuma Edge Function foi alterada; Deno não se aplica.
- Migration não foi aplicada no remoto. CI não foi executado.

## Revisão

Revisei o diff desde `1541363` contra o ticket e as convenções de migrations. O diff está limitado à fonte do onboarding, migration e pgTAP permitidos. Não encontrei defeito pendente nessa revisão.

## Próximo passo

Verificar CI nos três jobs e, após a revisão humana, seguir o fluxo autorizado para a migration conforme `docs/agents/migrations.md`. Não aplicar migration nem publicar nada sem a autorização posterior indicada no ticket.

## Skills sugeridas

- `implement`
- `tdd`
- `code-review`
- `handoff`

## Git

Nenhum `git add`, `git commit`, push, merge ou PR foi executado. A regra de sandbox desta sessão determina que a matriz commita as alterações do worktree.
