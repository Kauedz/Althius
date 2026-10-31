# B6: Falha do CNPJ e do comitê fica falha

**What to build:** a spec pede "Falha fica falha" para a consulta de CNPJ, o comitê e o revelar. O revelar já cumpre (502 "A busca do … falhou"). Faltam dois casos. Na consulta de CNPJ, quando o actor do Apify ou a BrasilAPI falham, a resposta é a mesma de um CNPJ que não existe: 404 "Dados do CNPJ não encontrados". No comitê, uma pessoa achada cuja proposta não foi gravada some sem aviso. Depois deste ticket, a tela distingue "a consulta falhou" de "não encontrado", e o comitê diz quantas pessoas achadas não puderam ser gravadas. A cobrança não muda: falha continua liberando a reserva e debitando zero.

**Blocked by:** None (pode começar agora).

**Status:** ready-for-agent

## Estado atual (31/10, `origin/main` 02c54ce6)

- `consultarApifyReceita` (`supabase/functions/account-enrichment/handler.ts:280`) devolve `null` tanto para lista vazia quanto para exceção do actor (o `catch` do fim da função). `consultarBrasilApi` (`:204`) devolve `null` para `!res.ok` (404 de CNPJ inexistente e 5xx) e para exceção de rede.
- O ramo `cnpj-receita` (`:494-497`) trata qualquer `null` como não encontrado: libera a reserva e responde 404 "Dados do CNPJ não encontrados".
- O ramo `comite-compra` (`:630-632`) engole a exceção de `saveProposedContact` ("Gravação que falhou não conta nem cobra; continua com as demais"). A resposta não diz que houve perda.
- Achado na revisão de 31/10 (`/code-review` da spec contra a `origin/main`).

## Critérios

- [ ] `cnpj-receita`: o Apify e a BrasilAPI separam "não achou" de "falhou". A BrasilAPI só conta como não achou com 404; 5xx, timeout e exceção são falha. O actor só conta como não achou com execução concluída e lista vazia.
- [ ] Quando a fonte que respondeu por último falhou e nenhuma achou, a função libera a reserva, debita zero, grava o custo do Apify se houver run, e responde 502 com "A consulta do CNPJ falhou: …". Não achou continua 404 "Dados do CNPJ não encontrados".
- [ ] A tela da Receita mostra a mensagem de falha da função, não "não encontrado".
- [ ] `comite-compra`: a resposta traz a quantidade de pessoas achadas que não puderam ser gravadas. A tela do comitê avisa quando ela é maior que zero. Quem não foi gravado continua sem contar e sem cobrar.
- [ ] Deno cobre: Apify falha e BrasilAPI 404 → 404; Apify falha e BrasilAPI 5xx → 502 com a reserva liberada; Apify vazio e BrasilAPI acha → grava; gravação de proposta que lança → resposta com a contagem de não gravadas e sem cobrança por ela.
- [ ] Vitest cobre a mensagem de falha da Receita e o aviso do comitê.

## Pode mexer

- `supabase/functions/account-enrichment/handler.ts` (ramos `cnpj-receita` e `comite-compra`, `consultarApifyReceita`, `consultarBrasilApi`)
- `supabase/functions/account-enrichment/handler.test.ts`
- `projeto-althius-frontend/src/paginas/comite-e-enriquecimento.tsx` e os testes dela
- `projeto-althius-frontend/src/fonte/supabase-contas.ts` (`enriquecerReceita`, `buscarComite`), se a mensagem ou a contagem precisar passar pela Fonte

## Não mexa

- O ramo `revelar-contato` e `provedor-de-contatos.ts`.
- Preços, reserva e liquidação de crédito. Nenhuma migration.
- Testes antigos. Os casos novos vão em testes novos.

## Migration

Nenhuma.

## Passos do Nan

1. Depois do merge, publicar a `account-enrichment` (`supabase functions deploy account-enrichment --project-ref ycbdilsmydvzezhlymty`).

## Comments
