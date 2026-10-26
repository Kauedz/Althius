# Handoff: suite-verde-02 — Testes dos Sinais no Workspace operacional

**Branch:** `ralph/suite-verde-02-testes-dos-sinais`
**Worktree:** `/workspace/ralph-wt/suite-verde-02`
**Status:** done, pronto para PR (ainda não aberto; a matriz abre depois de verificar)

## O que foi feito

Arquivo de teste novo: `projeto-althius-frontend/src/paginas/sinais-no-operacional.test.tsx`.

Prova os 4 casos do ticket (`.scratch/suite-verde/issues/02-testes-dos-sinais-no-workspace-operacional.md`) para a
regra `sinaisDisponiveis` (`src/fonte/supabase-sinais.ts:252-258`) pela raiz/página, não pela função interna:
1. nada `available` → indisponível, sem dado de Demonstração.
2. erro nas duas RPCs (`list_signal_actors`, `list_signal_catalog`) → indisponível.
3. só um Sinal interno `available` (catálogo do banco) → módulo ligado.
4. um actor `available` → módulo ligado e o Sinal aparece na página da Conta-alvo.

Usa a rota `/sinais/contas/:contaId` (mesma guarda `TelaDoModulo modulo="sinais"` da rota `/sinais`, mas simples o
bastante para não precisar montar o catálogo inteiro de Sinais) com `RaizDoAplicativo` + `criarSupabaseFalso`, no
mesmo padrão de `raiz.test.tsx`/`conexoes-reais.test.tsx`.

Nenhum código de produção mudou. Nenhum bug foi encontrado — não houve necessidade de abrir ticket novo nem de
registrar bug nos Comments (GATE do ticket).

## Detalhe que vale saber se alguém mexer neste teste depois

`comSinais` (`src/auth/aplicativo.tsx`) começa em `false` e só o efeito assíncrono confirma o valor real — a tela
sempre mostra "indisponível" por um instante, mesmo quando o resultado final é "disponível". Por isso o helper
`abrirContaComSinais` do teste devolve `leituraDosSinais`, uma promise que só resolve depois que as duas RPCs da
regra (`list_signal_actors` e `list_signal_catalog`) responderam; os testes dos casos 1 e 2 esperam por ela (mais um
tick, via `act` + `setTimeout(0)`) antes de checar o DOM, para não confundir esse flash inicial com o estado
definitivo. Sem isso, um teste que força `sinaisDisponiveis` a sempre devolver `true` ainda "passaria" pegando só o
flash inicial falso — foi assim que a primeira versão deste teste (antes do red-first) passou escondendo esse
problema; ver a seção de comentários do ticket para os detalhes do red-first.

## Testes rodados

- `npx vitest run --maxWorkers=2 'src/paginas/sinais'` → 35 arquivos, 281 passaram, 4 skipped, 0 falhas.
- `npx tsc -b` → limpo.
- `npx oxlint src/paginas/sinais-no-operacional.test.tsx` → sem avisos.
- Não rodei a suíte inteira do projeto (1392 testes): `conversas-reais.test.tsx` já está vermelho no `main` por um
  motivo fora de escopo deste ticket (ticket 01, `spec.md`).

## Pendências

- Nenhuma migration pendente.
- PR ainda não aberto nem enviado (push) — corpo pronto em `.scratch/handoffs/suite-verde-02-pr.md`, a matriz decide
  quando abrir depois de verificar.
- Tickets 01 e 03 da mesma spec (`suite-verde`) seguem pendentes, não tocados nesta sessão.

## Revisão cruzada (Codex, 2026-10-24)

A matriz aplicou os achados reais: caso novo com actors e catálogo só em `testing`/`out` (o módulo fica indisponível, sem dado da Demonstração) e as sentinelas da Demonstração no caso de erro. Vermelho conferido trocando temporariamente `.includes('available')` por `.length > 0` em `supabase-sinais.ts:254` (o caso novo falha) e revertido. `npx vitest run src/paginas/sinais-no-operacional.test.tsx` 5/5. O handoff fica no diff porque o protocolo Ralph exige `.scratch/handoffs/<ticket>.md`.
