# Handoff — entrada-03

Branch `ralph/entrada-03-day0-uma-vez-so`, base `515c2eb`. Implementação no diff de trabalho; Git somente leitura: não houve commit. A matriz deve revisar, commitar e abrir o PR. Corpo do PR: `/tmp/entrada-03-pr.md`.

Ticket e evidências: [entrada-03](../entrada-no-workspace-operacional/issues/03-day0-uma-vez-so-no-workspace-operacional.md). Spec no diretório pai. Não duplicar o escopo completo aqui.

## Estado e validação

Todos os 7 ACs verificados localmente e registrados no ticket. pgTAP próprio 32/32; suíte completa 153 arquivos e 5.365 asserções verdes, banco `pgtap_e03_full`. Vitest 57/57; oxlint e tsc -b exit 0 com Node 22. Prints em `../entrada-no-workspace-operacional/issues/prints/03-*.jpg`. Chrome/CDP usou componentes reais com backend falso e Casca mínima em harness `/tmp/e03-visual`, sem login real.

Revisão code-review em dois agentes: Standards 1 achado corrigido (atalho para Day0 concluído), Spec 0; nenhum pendente. `git diff origin/main...HEAD` vazio porque não há commits; revisão cobriu diff de trabalho e arquivos novos.

## Próximos passos da matriz e do Nan

Migration NOVA `supabase/migrations/20261121130000_day0_operacional.sql` pendente de validação/apply remoto. Nan segue `docs/agents/migrations.md` após CI verde e antes da publicação do frontend. O corpo do PR contém PowerShell para preparar o bloco atômico e registrar a versão. A publicação de main é automática no VPS conforme `docs/agents/publicacao.md`; não há deploy feito nesta sessão. Depois conferir com conta de teste real, concluir/pular, recarregar e abrir outro navegador.

Não tocar nos arquivos do Kauê, PR #261, `CONTEXT.md`, raiz nem migrations antigas. Não acessar `.env*`, segredos ou rodar Supabase remoto. Sem push/gh pr/comandos Git destrutivos. O timestamp da migration é fixo; versões anteriores indicadas pelo usuário pertencem a outros PRs.

## Suggested skills

`code-review` para a conferência da matriz; `pr` para reaproveitar o corpo já pronto; `diagnosing-bugs` caso CI falhe. `supabase` e `docs/agents/migrations.md` para a etapa humana de validação/apply. `tdd` para correções adicionais.

Vite e Chrome encerrados pelas sessões de processo individuais ao fim da conferência. Nenhum serviço de teste ficou em execução.
