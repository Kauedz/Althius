# A1: Criar Monitoramento no modo real

**What to build:** no Workspace operacional, um participante cria um Monitoramento de um Sinal disponível e ele passa a existir de verdade. O id é o que o banco devolve. O público são Contas reais daquele Workspace. A Demonstração continua com as listas de exemplo e não aparece no operacional. Com um Monitoramento ativo, "Buscar Sinais de novo" liga na Conta (o saldo curto continua desligando o botão pelo motivo de crédito, que este ticket não mexe).

**Blocked by:** None (pode começar agora). O merge na `main` espera o 00.

**Status:** closed (entregue pelo PR #150; evidência nos Comments)

- [x] Criar um Monitoramento no Workspace operacional grava pelo `save_signal_monitor` com `p_id` nulo. O id que volta é o uuid do banco. O editor deixa de mandar `novo-…`.
- [x] Editar um Monitoramento já gravado manda o uuid dele, e só esse.
- [x] O público escolhido são Contas-alvo reais do Workspace. A gravação manda os uuids em `accountIds`. As listas de exemplo (Enterprise LATAM, Fintechs Brasil, Oportunidades do HubSpot) não aparecem no operacional e não são gravadas.
- [x] A Demonstração segue criando e listando os Monitoramentos de exemplo, isolada do Workspace operacional.
- [x] Um Sinal que o registro ainda tem como em teste não ganha Monitoramento ativo. No operacional o card não aparece e abrir `/sinais/tipos/<tipo>/novo` não abre o editor: passa pela página do tipo e termina no catálogo `/sinais` (reescrito em 28/10, corrigido o destino em 31/10: a spec `catalogo-so-funcionais` trocou "a tela diz o motivo" por esconder o card).
- [x] Com ao menos um Monitoramento ativo no Workspace, "Buscar Sinais de novo" deixa de mostrar "Nenhum Monitoramento ativo para buscar." e o botão liga quando o saldo cobre o custo.
- [x] Vitest cobre o id do banco, o público de Contas reais e a ausência das listas de exemplo no operacional.

## Pode mexer

- `projeto-althius-frontend/src/paginas/sinais/editor.tsx`
- `projeto-althius-frontend/src/paginas/sinais/estado.tsx`
- `projeto-althius-frontend/src/fonte/supabase-sinais.ts`
- `projeto-althius-frontend/src/fonte/supabase-sinais.test.ts`
- Teste novo do editor, no estilo dos testes de Sinais que já existem.

## Não mexa

- `private.signal_actors` e o estado disponível / em teste. Isso é o A3. Num banco novo todos nascem `testing` e o RPC recusa; o teste deste ticket usa fonte falsa ou um actor já disponível no fixture, sem mudar o registro.
- A leitura de Sinais na Conta e os fallbacks `SINAIS_MOCK` / `CONTAS_MOCK`. Isso é o A2.
- `dados-mock.ts` como fonte da Demonstração. As listas de exemplo continuam lá para ela.
- O texto do histórico comercial no bloco de público.
- `grant_credits`, saldo e teto. Sem crédito, o botão de buscar de novo permanece desligado pelo saldo. Não disfarce isso.
- Conexões, InMail, seam de Canal, Stripe, sinais jurídicos.

## Migration

Nenhuma. `save_signal_monitor` já cria quando o id vem nulo e já exige `accountIds` do Workspace. Se a implementação descobrir que o contrato não dá, pare e pergunte. Não redefina a função neste ticket.

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6): entregue pelo PR #150 (`sinais-reais/02-monitoramento-pela-tela`), que trouxe o código da branch `ralph/A1-criar-monitoramento-no-modo-real` revisado e reorganizado. A branch em si não está na `main` (1 commit fora) e ficou superada pelo PR. Critério a critério:
  - `p_id` nulo e uuid do banco: `projeto-althius-frontend/src/fonte/supabase-sinais.ts:197-203` (`save_signal_monitor` com `p_id: m.id ?? null`); o `novo-…` só nasce na Demonstração (`src/paginas/sinais/editor.tsx:103-104`). Teste "grava com o id do banco e as Contas reais, sem as listas de exemplo nem a descoberta por perfil".
  - Editar manda só o uuid: teste "editar um Monitoramento gravado manda só o uuid dele".
  - Público de Contas reais em `accountIds`, sem as listas de exemplo: `editor.tsx:255` e `editor.tsx:485-489` (o público do operacional lê `contas()` da Fonte real), `supabase-sinais.ts:203`. Mesmo teste do primeiro critério.
  - Demonstração isolada: teste "a Demonstração continua oferecendo as listas de exemplo e a descoberta".
  - Sinal em teste não ganha Monitoramento: `editor.tsx:126-128` (`podeMonitorar`). Teste "um Sinal em teste não deixa criar Monitoramento e a página diz o motivo".
  - "Buscar Sinais de novo" liga com Monitoramento ativo e saldo: `src/paginas/buscar-sinais-de-novo.tsx:40-45`. Teste "ativado, aparece na lista com as Contas e liga o \"Buscar Sinais de novo\" da Conta".
  - Vitest: `src/paginas/sinais/monitoramento-real.test.tsx`, describe "Criar Monitoramento no Workspace operacional" (7 testes). Rodado agora: `npx vitest run src/paginas/sinais/monitoramento-real.test.tsx src/fonte/supabase-sinais.test.ts src/fonte/supabase-contas.test.ts src/fonte/supabase-contas-sinais.test.ts` → 4 arquivos, 56 passed, 0 failed. CI da `main` (run 37707955273) verde.
  - Conferência visual já feita no sinais-reais 02: [público](../../sinais-reais/issues/prints/02-publico-com-contas-reais.jpg), [revisão](../../sinais-reais/issues/prints/02-revisao.jpg), [lista do tipo](../../sinais-reais/issues/prints/02-lista-do-tipo.jpg).
  - Fora deste ticket e ainda humano: crédito no Workspace de teste (sinais-reais 02, Passos do Nan 3).
- 2026-10-28 (verificação automatizada): `vitest run` em `monitoramento-real.test.tsx`, `supabase-sinais.test.ts`, `supabase-contas.test.ts` e `supabase-contas-sinais.test.ts` → 4 arquivos, 73 passed, 0 failed; `tsc -b` sem erro. Todas as caixas marcadas. Nota sobre o critério 5: a spec `catalogo-so-funcionais` passou a esconder do cliente o card de Sinal em teste, então o teste prova que ele não abre o editor nem ganha Monitoramento, e a tela não mostra um motivo porque o card não aparece.
- 2026-10-28 (fechamento da spec): critério 5 reescrito para o comportamento da `main` (`editor.tsx:188-193`, teste `monitoramento-real.test.tsx:289`).
