# Handoff — fix sinais-first-03-rfix1

## Diagnóstico e decisão

A revisão encontrou dois pontos no `signal-plan`: a RPC opcional do ICP não tinha prazo e seu caminho de rejeição não tinha teste. O seam escolhido e pré-confirmado foi o handler público com um banco falso, verificando a resposta normal, o contexto recebido pela IA e o log neutro.

Decisão conservadora: limitar a leitura do ICP a 2 s, pois é enriquecimento opcional anterior ao motor, e continuar sem ICP tanto quando a RPC rejeita quanto quando excede o prazo. Não alterar RPC, migration, prompt ou validação do Plano.

## Alterações

- `handler.ts`: envolve `lerIcp` em `comPrazo` com teto de 2 s; timeout e erro seguem o caminho já existente de ICP indisponível.
- `handler.test.ts`: cobre rejeição e promessa que não responde; o teste de demora falhou antes da correção e passou depois.
- Nenhuma migration, função SQL, arquivo de frontend ou arquivo proibido foi alterado.

## Verificações

- `deno test -A supabase/functions/signal-plan/handler.test.ts --filter 'leitura de ICP que não responde'`: vermelho antes da correção.
- `deno test -A supabase/functions/signal-plan/handler.test.ts --filter 'ICP'`: 4 passaram.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_lu4_fix`: passou.
- `deno check supabase/functions/*/index.ts && deno test -A supabase/functions`: passou (1.872 testes).
- `npm run lint`: passou com avisos existentes; requer `npm ci` porque a worktree estava sem `node_modules`.
- `npx tsc -b`: passou.
- `npm run build`: passou; avisos de `VITE_GOOGLE_CLIENT_ID` vazio e chunk maior que 500 kB.
- `npx vitest run --maxWorkers=2`: não concluiu em 600 s; o reporter mostrou uma falha (`x`) antes do timeout, sem imprimir o relatório que identifica o teste. Resultado inconclusivo; nenhum arquivo frontend foi alterado.

## Restrições

Sem commit, push, PR, merge, Supabase remoto ou segredos. O worktree fica pronto para a matriz commitar.
