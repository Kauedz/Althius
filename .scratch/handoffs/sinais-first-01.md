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

## Correção rfix1 — fonte única com a seção `icp` do Playbook

A revisão posterior encontrou que `save_playbook_section('icp', ...)` atualizava só `private.playbook_section_versions`, deixando `get_my_workspace_icp` com o valor anterior. A migration do ticket agora instala um trigger `AFTER INSERT` que cria a próxima versão estruturada, preservando os campos Mini-ICP/produto vigentes. A regressão em `supabase/tests/icp_estruturado_unico.sql` confirma que a leitura vê o novo texto e mantém Mini-ICP vindo do Day0; a suíte pgTAP local completa passou com 24/24 nesse arquivo.

Durante a verificação, o Vitest isolado da fonte Supabase passou (1/1). Duas execuções da suíte Vitest completa ficaram sem progresso após a inicialização; uma delas excedeu 180 segundos com mensagens `Not implemented: Window's focus() method` e a outra foi encerrada após mais de quatro minutos sem conclusão. `deno check`, `deno test` (1868 testes), lint, `tsc -b` e build passaram. Build emite os avisos existentes de Google Client ID vazio e bundle grande.

## Próximo passo

Verificar CI nos três jobs e, após a revisão humana, seguir o fluxo autorizado para a migration conforme `docs/agents/migrations.md`. Não aplicar migration nem publicar nada sem a autorização posterior indicada no ticket.

## Skills sugeridas

- `implement`
- `tdd`
- `code-review`
- `handoff`

## Git

Nenhum `git add`, `git commit`, push, merge ou PR foi executado. A regra de sandbox desta sessão determina que a matriz commita as alterações do worktree.
