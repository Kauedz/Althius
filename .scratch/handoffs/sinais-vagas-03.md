# Handoff — sinais-vagas-03

## Escopo e estado

Foi implementado somente o ticket `.scratch/sinais-vagas/issues/03-recorte-obrigatorio-para-ativar-e-rodar.md`, na branch `ralph/sinais-vagas-03-recorte-obrigatorio-para-ativar-e-rodar`, empilhada sobre `ralph/sinais-vagas-02-varios-recortes-por-sinal`. O gate do ticket 02 foi conferido no código antes de iniciar. Nenhuma alteração remota, deploy ou alteração de segredo foi feita.

## O que mudou

- A migration nova `supabase/migrations/20261216103000_recorte_obrigatorio_para_vagas.sql` exige recorte de nicho para ativar vagas no mercado endereçável, e filtra as claims agendadas/manuais. Solicitações manuais inválidas terminam como falha com a mensagem de produto, sem entrega ao runner; continua permitida a edição como rascunho. Nenhum Monitoramento existente é alterado pela migration.
- O runner não chama o actor nem aprova vagas sem recorte: `supabase/functions/_shared/cascata-de-sinais/passos/vagas-mercado.ts`.
- Editor e fluxo de ativação desabilitam ativação sem recorte, mantêm rascunho disponível e traduzem o erro do servidor, em `projeto-althius-frontend/src/paginas/sinais/` e `src/fonte/supabase-sinais.ts`.
- Testes novos/ajustados: `supabase/tests/recorte_obrigatorio_para_vagas.sql`, fixtures em `supabase/tests/vagas_no_mercado_enderecavel.sql`, `supabase/functions/_shared/cascata-de-sinais/vagas-mercado.test.ts` e `projeto-althius-frontend/src/paginas/sinais/mercado-enderecavel.test.tsx`.

## Decisões e revisão

A claim manual invalida pedidos pendentes ou expirados sem recorte e fecha também a rodada vinculada, registrando falha com a frase de produto; a claim agendada simplesmente não seleciona monitores inválidos. Esse desenho foi escolhido para impedir que pedido manual legado seja cobrado ou alcance o actor. Fixtures anteriores de pgTAP passaram a incluir recorte válido, sem alterar suas assertions, pois agora testam outros aspectos de monitores ativos.

A revisão Standards e Spec foi feita contra a base `ralph/sinais-vagas-02-varios-recortes-por-sinal`. Os apontamentos sobre fechamento da rodada vinculada foram resolvidos e cobertos pelo pgTAP. Nenhum achado pendente foi reportado.

## Verificações

- Testes dirigidos Vitest, Deno e pgTAP passaram.
- Suíte Deno completa: 1904 testes passaram.
- pgTAP completo passou três vezes, incluindo 20/20 do teste novo.
- `npm run lint`, `npx tsc -b` e `npm run build` passaram.
- Suíte Vitest completa: 231 arquivos, 2016 testes passaram e 4 foram ignorados (2020 total), em 593,16 s.

## Pendências

- Ticket atualizado para `ready-for-human`, 7/7 critérios marcados e comentário datado `2026-10-25`.
- O PR não foi criado; título e corpo estão em `/workspace/ralph-wt/_pr/sinais-vagas-03.md`.
- Não adicionar ou commitar: a regra de git desta sessão exige deixar as alterações no worktree para a matriz.

## Suggested skills

- `code-review` para nova revisão do diff, se houver alterações posteriores.
- `pr` para preparar o PR quando a publicação for autorizada.
- `supabase:supabase` ao aplicar ou operar a migration em uma sessão autorizada.
