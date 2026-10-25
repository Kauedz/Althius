# Handoff — entrada-02

Branch: `ralph/entrada-02-google-so-com-botao`.
Worktree: `/workspace/ralph-wt/entrada-02`.

Implementação e testes concluídos no diff de trabalho. Referências de escopo e evidências: `.scratch/entrada-no-workspace-operacional/issues/02-google-so-quando-o-botao-existe.md`, comentário de 2026-10-24; spec no diretório pai. Texto do PR em `entrada-02-pr.md` nesta pasta.

## O que falta

1. Criar o print solicitado quando Chrome puder inicializar corretamente. Nenhum JPEG foi produzido. Houve erro de perfil padrão e NSS (-8126), mesmo com perfil exclusivo em `/tmp`. Não ler/criar `.env*`; manter `VITE_GOOGLE_CLIENT_ID=` na linha de comando. Encerrar Vite pelo PID; nunca usar pkill/killall.
2. Fazer git add/commit na branch atual em ambiente que permita escrever no Git compartilhado. Ambos falharam ao criar `/workspace/Althius/.git/worktrees/entrada-02/index.lock` (Read-only file system). Não houve commit, push, troca de branch ou PR remoto. Rever `git diff origin/main...HEAD` depois do commit; as revisões paralelas Standards/Spec feitas sobre o diff de trabalho tiveram zero achados.
3. Registrar o print e atualizar a pendência no ticket. AC 4/4 verificados por testes; ticket permanece aberto.

Logs desta sessão (temporários, sem segredos): `/tmp/entrada-02-auth.log`, `/tmp/entrada-02-build-red.log`, `/tmp/entrada-02-build-green.log`, `/tmp/entrada-02-pgtap.log` e `/tmp/entrada-02-chrome-retry.log`. O teste novo foi executado em vermelho antes das correções e tem 6 casos verdes. Não há migration ou apply pendente.

## Skills sugeridas

`git-guardrails-claude-code` (somente leitura), `code-review`, `pr`, `handoff`; `diagnosing-bugs` para investigar o ambiente do Chrome. Arquivos em `.claude/skills/<nome>/SKILL.md`. A ferramenta Skill não estava disponível; as instruções foram lidas diretamente.

## Atualização da matriz (2026-10-24)

Itens 1 a 3 resolvidos pela matriz: print 1400×900 em `prints/02-entrar.jpg` (Chrome headless via CDP, `VITE_GOOGLE_CLIENT_ID=` vazio, Supabase local fictício), commit na branch e ticket atualizado. Conferido de novo: `npx vitest run src/auth` 5 arquivos / 57 testes verdes, oxlint e `tsc -b` com saída 0, `VITE_GOOGLE_CLIENT_ID= npx vite build` imprime o aviso.
