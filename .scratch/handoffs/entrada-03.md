# Handoff — entrada-03

Branch `ralph/entrada-03-day0-uma-vez-so`, implementação original no commit `8350877`. Esta sessão corrige a revisão no diff de trabalho; Git somente leitura, sem novo commit. A matriz deve revisar e commitar as correções. Corpo do PR: `/tmp/entrada-03-pr.md`.

Ticket e evidências: [entrada-03](../entrada-no-workspace-operacional/issues/03-day0-uma-vez-so-no-workspace-operacional.md). Spec no diretório pai. Não duplicar o escopo completo aqui.

## Estado e validação

Todos os 7 ACs verificados localmente e registrados no ticket. pgTAP próprio 32/32; suíte completa 153 arquivos e 5.365 asserções verdes, banco `pgtap_e03_full`. Vitest 57/57; oxlint e tsc -b exit 0 com Node 22. Prints em `../entrada-no-workspace-operacional/issues/prints/03-*.jpg`. Chrome/CDP usou componentes reais com backend falso e Casca mínima em harness `/tmp/e03-visual`, sem login real.

A revisão de `8350877` encontrou bloqueio no Administrador inicial e sugeriu reforçar a validação de domínio. Ambos corrigidos nesta sessão na própria migration ainda não aplicada. O convite inicial é identificado pelos eventos persistidos `workspace_criado`/`convite_criado` e seu `invitation_id`; convites posteriores continuam impedidos.

## Próximos passos da matriz e do Nan

Migration NOVA `supabase/migrations/20261121130000_day0_operacional.sql` pendente de validação/apply remoto. Nan segue `docs/agents/migrations.md` após CI verde e antes da publicação do frontend. O corpo do PR contém PowerShell para preparar o bloco atômico e registrar a versão. A publicação de main é automática no VPS conforme `docs/agents/publicacao.md`; não há deploy feito nesta sessão. Depois conferir com conta de teste real, concluir/pular, recarregar e abrir outro navegador.

Não tocar nos arquivos do Kauê, PR #261, `CONTEXT.md`, raiz nem migrations antigas. Não acessar `.env*`, segredos ou rodar Supabase remoto. Sem push/gh pr/comandos Git destrutivos. O timestamp da migration é fixo; versões anteriores indicadas pelo usuário pertencem a outros PRs.

## Suggested skills

`code-review` para a conferência da matriz; `pr` para reaproveitar o corpo já pronto; `diagnosing-bugs` caso CI falhe. `supabase` e `docs/agents/migrations.md` para a etapa humana de validação/apply. `tdd` para correções adicionais.

Vite e Chrome encerrados pelas sessões de processo individuais ao fim da conferência. Nenhum serviço de teste ficou em execução.

## Correção da revisão — 2026-10-24

TDD pelas RPCs públicas: vermelho do provisionamento real com 4 falhas em 39; verde 39/39 após correção. Domínios: vermelho com 2 falhas em 44 (hífen inicial e segmento de 64 caracteres); verde final 44/44. Também cobertos segmento vazio, hífen final e limite válido de 63 caracteres. Comando final: `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_e03fix supabase/tests/day0_operacional.sql`. Logs em `/tmp/entrada-03-{red,green1,red2,green}.log`. Nenhuma migration antiga alterada, sem apply remoto, commit, push ou deploy.

Vitest de `src/paginas/onboarding`: **52/52** (2 arquivos), Node 22.23.4, via `npm_config_cache=/tmp/entrada-03-npm-cache npx -y -p node@22 -c 'node --version && node node_modules/vitest/vitest.mjs run --maxWorkers=2 src/paginas/onboarding'`. Node 20 falhou ao iniciar workers por incompatibilidade de undici; repetição com Node 22 passou. `git diff --check` passou.
