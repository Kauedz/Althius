# Handoff: conexoes-clareza-01 — "Seu acesso" vs "No Workspace" no card

## Estado

**Concluído e commitado.** Branch `ralph/conexoes-clareza-01-seu-acesso`, worktree
`/workspace/ralph-wt/conexoes-clareza-01`. Commits `47c6140`, `66c2add` (sessão anterior)
+ um novo commit desta sessão.

Esta sessão era uma **correção** de um achado [DEVE CORRIGIR] da revisão cruzada (Codex)
contra o trabalho da sessão anterior: o AC "Demonstração mostra o mesmo texto" estava
marcado `[x]` sem estar atendido. O bloco "Seu acesso" / "No Workspace" só existia em
`SeuAcesso` (usado por `CartaoDeIntegracaoReal`, modo `real`). Em Integrações no modo
Demonstração, `conexoes.tsx` renderiza `CartaoDeConexaoDemo` — um componente totalmente
separado, sem o bloco. O print `01-notion.jpg` também era de um card real isolado, não
da Demonstração.

## O que foi feito nesta sessão

- `projeto-althius-frontend/src/paginas/conexoes.tsx`:
  - Extraída a função `textoNoWorkspace(conectados)` (a regra de singular/plural que
    antes só existia dentro de `SeuAcesso`), reaproveitada em `SeuAcesso` e no novo
    bloco da Demonstração.
  - `CartaoDeConexaoDemo` (linha ~812) ganhou um prop opcional
    `acesso?: { seuAcesso: string; noWorkspace: string }`: quando presente, renderiza o
    mesmo bloco rotulado (borda superior, mesmas classes de cor) do cartão real.
  - O prop só é passado no branch de **Integrações** (linha ~288-291):
    conectado → "Seu acesso: Conectado" / "No Workspace: 1 participante conectado";
    não conectado → "Seu acesso: não conectado" / "No Workspace: 0 participantes
    conectados". A Fonte simulada (`simulada-conexoes.ts`) não guarda uma contagem real
    de participantes por Integração, então uso o fallback 1/0 coerente que o próprio
    achado da revisão autorizava ("ou 1/0 coerente").
  - O branch de **Canais** continua chamando `CartaoDeConexaoDemo` sem o prop `acesso`,
    então não mudou nada visualmente ali.
  - `fonte/supabase-conexoes.ts` não foi tocado.
- Teste novo `projeto-althius-frontend/src/paginas/conexoes-acesso-demonstracao.test.tsx`:
  2 casos (conectado e não conectado) via `renderizarApp('/conexoes')` (mesmo padrão dos
  outros testes de Conexões em modo demonstração). Confirmei o vermelho antes da correção
  (`git stash` só de `conexoes.tsx`, os 2 testes falharam), depois apliquei a mudança e
  os 2 passaram.
- Print 1400×900 refeito em
  `.scratch/conexoes-clareza-do-acesso/issues/prints/01-notion.jpg`: agora é da página de
  Conexões **na Demonstração** (antes era de um card real isolado), mostrando o card do
  Notion com "Seu acesso: Conectado" e "No Workspace: 1 participante conectado". Tirado
  com Vite numa porta livre (5180) e Chrome headless (`--remote-debugging-port` + CDP
  `Page.captureScreenshot` via `WebSocket` nativo do Node 22, porque o `--screenshot` da
  CLI do Chrome tende a travar); Vite e Chrome encerrados pelos PIDs ao final (sem
  `pkill -f`/`killall`).
- Ticket atualizado: novo comentário datado 2026-10-24 explicando a correção; os 5 AC
  continuam `[x]`, agora verificados de verdade.
- PR body reescrito em `/workspace/ralph-wt/_pr/conexoes-clareza-01.md` (fora do repo).
  Apaguei `.scratch/handoffs/conexoes-clareza-01-pr.md` (antigo local do corpo do PR,
  que não deve ficar versionado dentro do repo).

## Testes (todos verdes)

- `npx vitest run --maxWorkers=2 src/paginas/conexoes` → 196 passed (22 arquivos;
  194 da sessão anterior + 2 novos desta correção).
- `npx oxlint` → exit 0, sem erros/avisos novos nos arquivos tocados.
- `npx tsc -b` → sem output, sem erros.
- `/code-review` (eixos Standards e Spec, rodados em paralelo): nenhum finding
  bloqueante. Standards: um único ponto de julgamento (leve "data clump" nas duas
  strings do prop `acesso`), aceitável no escopo atual. Spec: achado atendido
  integralmente; única observação é que a Demonstração nunca mostra plural com N>1
  (porque a Fonte simulada não tem contagem real), o que o próprio achado já autorizava
  como alternativa ("ou 1/0 coerente").

## Pendências / próximos passos

- Nenhuma pendência no escopo deste ticket. Sem migration (ticket é só frontend).
- A matriz/CI deve: revisar o diff, abrir o PR com o corpo de
  `/workspace/ralph-wt/_pr/conexoes-clareza-01.md`, e fazer push.
