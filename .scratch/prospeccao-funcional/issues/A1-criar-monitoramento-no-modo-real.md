# A1: Criar Monitoramento no modo real

**What to build:** no Workspace operacional, um participante cria um Monitoramento de um Sinal disponível e ele passa a existir de verdade. O id é o que o banco devolve. O público são Contas reais daquele Workspace. A Demonstração continua com as listas de exemplo e não aparece no operacional. Com um Monitoramento ativo, "Buscar Sinais de novo" liga na Conta (o saldo curto continua desligando o botão pelo motivo de crédito, que este ticket não mexe).

**Blocked by:** None (pode começar agora). O merge na `main` espera o 00.

**Status:** done

- [x] Criar um Monitoramento no Workspace operacional grava pelo `save_signal_monitor` com `p_id` nulo. O id que volta é o uuid do banco. O editor deixa de mandar `novo-…`.
- [x] Editar um Monitoramento já gravado manda o uuid dele, e só esse.
- [x] O público escolhido são Contas-alvo reais do Workspace. A gravação manda os uuids em `accountIds`. As listas de exemplo (Enterprise LATAM, Fintechs Brasil, Oportunidades do HubSpot) não aparecem no operacional e não são gravadas.
- [x] A Demonstração segue criando e listando os Monitoramentos de exemplo, isolada do Workspace operacional.
- [x] Um Sinal que o registro ainda tem como em teste não ganha Monitoramento ativo. A tela diz o motivo, como já faz quando o tipo não pode ser monitorado.
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
