# A2: Sinal visível na Conta Quente

**What to build:** no Workspace operacional, a Conta com Sinal válido aparece Quente e o Sinal é visível nela: frase, data, fonte e evidência. Onde não há Sinal, a tela diz que não há. Nada da Demonstração entra no operacional. A Demonstração continua com os Sinais de exemplo.

**Blocked by:** None (pode começar agora). O merge na `main` espera o 00. Não depende do A1: um Sinal já gravado tem de aparecer mesmo sem o editor novo.

**Status:** closed (entregue pelo PR #150; evidência nos Comments)

- [ ] A Fonte de Contas do Workspace operacional lê os Sinais gravados. `list_account_signals` alimenta o foguinho (Quente, quantidade válida, último Sinal). `list_signals` com a Conta alimenta a seção Sinais do detalhe.
- [ ] Uma Conta com Sinal válido nos últimos 30 dias mostra esse Sinal no detalhe. A seção deixa de cair em "Nenhum sinal" quando o banco tem Sinal.
- [ ] Conta sem Sinal continua com a seção vazia. O vazio é vazio, não um Sinal de exemplo.
- [ ] No operacional, a página de Sinais, a Conta aberta a partir de um Sinal e a página do tipo não usam `SINAIS_MOCK`, `CONTAS_MOCK` nem a contagem simulada quando a fonte ainda não respondeu ou respondeu vazio. A Demonstração segue com esses exemplos.
- [ ] O único teste antigo que pode mudar é o `it` "não inventa Contatos nem Sinais que o Workspace não guarda" em `supabase-contas.test.ts` (linhas 136–141). O caso sem Sinal gravado continua sem inventar Sinal. Os outros `it` desse arquivo ficam como estão.
- [ ] Vitest novo prova o Sinal gravado na Conta e a ausência de dado simulado no operacional.

## Pode mexer

- `projeto-althius-frontend/src/fonte/supabase-contas.ts` (a leitura de Sinais e o que a Conta mostra de Quente)
- O `it` das linhas 136–141 de `projeto-althius-frontend/src/fonte/supabase-contas.test.ts`
- `projeto-althius-frontend/src/paginas/sinais/pagina-sinais.tsx`
- `projeto-althius-frontend/src/paginas/sinais/conta-com-sinais.tsx`
- `projeto-althius-frontend/src/paginas/sinais/pagina-do-tipo.tsx`
- `projeto-althius-frontend/src/paginas/detalhe-conta.tsx`, só se a seção Sinais precisar ler o que a Fonte passar a devolver
- Teste novo da Fonte ou da seção

## Não mexa

- Qualquer outro teste de `supabase-contas.test.ts`.
- `enviarAoCrm` e `enviarAoCrmPelosAgentes`, acrescentados no PR #147.
- O editor de Monitoramento e `supabase-sinais.ts`. Isso é o A1.
- O registro de actors. Isso é o A3.
- `adicionarSinal` no operacional continua recusado: Sinal não se cadastra à mão por essa Fonte.
- Conexões, InMail, seam de Canal, Stripe, sinais jurídicos.

## Migration

Nenhuma. As funções `list_account_signals` e `list_signals` já existem. Se faltar um campo que a tela precisa, pare e pergunte antes de criar função nova.

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6): entregue pelo PR #150 (`sinais-reais/02-monitoramento-pela-tela`). Critério a critério:
  - A Fonte de Contas lê os Sinais gravados: o foguinho vem de `list_account_signals` (`projeto-althius-frontend/src/fonte/supabase-sinais.ts:79`, usado em `src/fonte/supabase-contas.ts:349` e `:468`); a seção Sinais do detalhe vem de `list_signals` com a Conta (`supabase-sinais.ts:105-106`, ligado em `supabase-contas.ts:891`).
  - Conta Quente mostra o Sinal no detalhe: teste "o detalhe da Conta Quente mostra os Sinais gravados dela".
  - Conta sem Sinal fica vazia: teste "o detalhe da Conta sem Sinal gravado diz que não há nenhum" (`src/paginas/detalhe-conta.tsx:179`).
  - Nada simulado no operacional: `src/paginas/sinais/pagina-sinais.tsx:127`, `:334`, `:393`; `src/paginas/sinais/conta-com-sinais.tsx:54`, `:81`, `:241`; testes "sem Sinal gravado, a página de Sinais mostra zero e a lista vazia, sem os de exemplo", "se os Sinais não puderem ser lidos, a contagem não usa os de exemplo e a lista diz que falhou", "o Sinal gravado aparece na lista com o nome da Conta e abre a Conta com o histórico e a evidência", "a página do tipo conta os Sinais do Monitoramento e mostra o público em Contas", "uma Conta de exemplo não abre no operacional".
  - Teste antigo: só a linha do `sinaisDaConta` no `it` das linhas 136–141 de `supabase-contas.test.ts` mudou (`git diff 34ed683 59e53a6`), com autorização do Nan registrada no sinais-reais 02.
  - Vitest novo: `src/paginas/sinais/monitoramento-real.test.tsx`, describe "Sinais gravados no Workspace operacional" (7 testes). Rodado agora junto com o A1: 56 passed, 0 failed. CI 37707955273 verde.
  - Conferência visual já feita no sinais-reais 02: [detalhe da Conta](../../sinais-reais/issues/prints/02-detalhe-da-conta.jpg), [Sinais encontrados](../../sinais-reais/issues/prints/02-sinais-encontrados.jpg), [Conta pelos Sinais](../../sinais-reais/issues/prints/02-conta-com-sinais.jpg), [lista vazia](../../sinais-reais/issues/prints/02-sinais-encontrados-vazio.jpg).
  - Resto que não é critério deste ticket: com a leitura dos Sinais falhando, `detalhe-conta.tsx` ainda mostra "Nenhum sinal" no lugar do erro (decisão a confirmar registrada no sinais-reais 02).
