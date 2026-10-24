# Handoff: enriquecimento-03 — correção da revisão cruzada

Data: 2026-10-24. Branch `ralph/enriquecimento-03-lote-email-custo-maximo`.
Ticket: `.scratch/enriquecimento-em-cascata/issues/03-revelar-email-e-telefone.md`.
Commits anteriores: `be6baac`, `ae754ed`. Correções desta sessão ficam no worktree, sem commit ou push; a matriz commita.

## Escopo e correções

Gate satisfeito: AC 3 depende apenas do B3 já em main; AC 1 e 2 reutilizam a implementação e os pgTAP existentes. Telefone continua fora do lote.

- Achado 1 corrigido: o diálogo consulta `fonte.cotarRevelacaoContato(id, 'email')` para os selecionados sem e-mail e soma os créditos retornados antes de permitir confirmação. Não há preço fixo. Cotação pendente, indisponível, com erro ou `podeRevelar=false` bloqueia a confirmação e informa o problema. Para repetir a cotação após erro, fechar e reabrir o diálogo.
- Achado 2 corrigido: durante a execução, Cancelar fica desabilitado, X fica oculto e a mudança de abertura por Escape/clique fora é bloqueada. Os resultados permanecem visíveis até o fechamento após concluir. Reabrir consulta novamente, sem iniciar outro lote automaticamente.
- Revisão própria encontrou e corrigiu uma inferência extra de saldo que recusava créditos ilimitados: a decisão de permissão respeita `podeRevelar` da Fonte.

Código: `projeto-althius-frontend/src/paginas/revelar-email-em-lote.tsx`.
Regressões novas: `projeto-althius-frontend/src/paginas/revelar-email-em-lote-correcao.test.tsx` (6 casos). Nenhum teste antigo alterado.

## Evidências desta sessão

Node 22 em todos os comandos frontend: `export PATH=/workspace/tools/node22/bin:$PATH`.

Vermelhos executados antes das correções:

1. Cotação pendente com preços 7 e 4: falhou `toBeDisabled()`; implementação anterior permitia confirmar. Verde com soma de 11 créditos.
2. Revelação pendente e Cancelar: falhou porque o diálogo sumiu. Verde com bloqueio e resultado preservado, Escape/X tratados, fechamento e reabertura depois do término sem novas revelações.
3. Créditos ilimitados e saldo zero: falhou `toBeEnabled()`; removida a inferência extra por saldo.

Validação final:

- `npx vitest run --maxWorkers=2 src/paginas/revelar-email-em-lote*.test.tsx src/paginas/contatos* src/paginas/comite-e-enriquecimento*.test.tsx src/paginas/cotacao-revelacao.test.tsx`: 7 arquivos, 48 testes verdes.
- `npx oxlint`: sem erros; avisos, incluindo `react(set-state-in-effect)` no carregamento da cotação.
- `npx tsc -b`: sem erros.
- `PGPORT=55432 bash scripts/pgtap-local.sh pgtap_enriquecimento_03_correcao`: suíte completa verde, 152 arquivos, 5333 asserções; inclui os pgTAP existentes de AC 1 e 2.
- `git diff --check`: limpo. Revisão `code-review` sobre `git diff origin/main...HEAD` e correções locais em dois agentes: Standards sem achados; Spec apontou créditos ilimitados, corrigido com vermelho primeiro.

## Próxima sessão / matriz

Corpo do PR atualizado fora do repo em `/workspace/ralph-wt/_pr/enriquecimento-03.md`. Commit e publicação cabem à matriz. Chrome não sobe neste sandbox: se precisar de print/conferência visual, a matriz faz.

Nenhuma migration criada ou alterada, Edge Function, segredo ou arquivo proibido tocado. Sem mudança em RLS, security definer, grants ou search_path. Migration pendente de apply: não. Nenhum passo manual do Nan de migration, deploy ou segredo para esta entrega frontend.

## Suggested skills

`code-review` para conferir o diff final; `pr` para preparar publicação pela matriz. `diagnosing-bugs` se surgir falha sem causa clara.
