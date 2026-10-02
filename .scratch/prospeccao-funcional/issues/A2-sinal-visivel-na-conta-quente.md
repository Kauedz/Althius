# A2: Sinal visível na Conta Quente

**What to build:** no Workspace operacional, a Conta com Sinal válido aparece Quente e o Sinal é visível nela: frase, data, fonte e evidência. Onde não há Sinal, a tela diz que não há. Nada da Demonstração entra no operacional. A Demonstração continua com os Sinais de exemplo.

**Blocked by:** None (pode começar agora). O merge na `main` espera o 00. Não depende do A1: um Sinal já gravado tem de aparecer mesmo sem o editor novo.

**Status:** ready-for-agent

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
