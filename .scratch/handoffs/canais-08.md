# Handoff: ticket canais 08

O ticket `.scratch/canais-althius/issues/08-escolher-o-workspace-e-abrir-conversa-nova.md` foi implementado na branch `ralph/canais-08-escolher-o-workspace-e-abrir-conversa`, a partir do código de 07. Consulte o ticket, a spec, as decisões e o ADR em seus caminhos originais para os requisitos completos.

## Entrega

- A troca de Workspace grava a seleção pendente e marca a próxima abertura como Conversa nova. O comando `nova conversa` também marca a próxima abertura; a intenção só é limpa quando a Execução abre.
- As respostas imediatas levam `Em *<Workspace>*:`. Respostas pendentes usam um RPC novo para recuperar o nome do Workspace da Conversa original, mantendo compatível o RPC anterior.
- A regra de quatro horas já era aplicada em `start_channel_run`; pgTAP novo cobre essa virada, a lembrança/lista elegível, ausência de Créditos e prefixos.
- Uma migration nova, `supabase/migrations/20261122130800_prefixo_workspace_na_conversa_whatsapp.sql`. Não foi aplicada no Supabase remoto.
- Os critérios do ticket foram marcados completos. A revisão Standards não encontrou violações; a revisão Spec não encontrou lacunas restantes.

## Testes

- Deno focado do webhook: passou (6/6); `deno test supabase/functions`: passou (1.811 aprovados, 39 ignorados).
- pgTAP focado: passou (6/6); suíte completa: passou.
- `deno check supabase/functions/*/index.ts`, `npm run lint` e `npx tsc -b`: passaram.
- Vitest completa: 221 arquivos passaram; 1.952 testes passaram e 4 foram ignorados.

## Decisões de processo

- Os seams usados foram o handler do webhook simulado e as RPCs públicas do Postgres. Foram tratados como pré-confirmados pelo Renan conforme instrução headless.
- O código original do 07 (`conversar_pelo_whatsapp.sql`) e seu teste permaneceram sem alteração.
- A regra de git do sandbox proíbe `git add` e `git commit`; alterações ficam no worktree para a matriz commitar.

## Suggested skills

- `code-review` antes de uma futura revisão de branch/PR.
- `supabase:supabase` se uma próxima sessão precisar avaliar/aplicar migration.
- `tdd` para qualquer mudança adicional de comportamento.
