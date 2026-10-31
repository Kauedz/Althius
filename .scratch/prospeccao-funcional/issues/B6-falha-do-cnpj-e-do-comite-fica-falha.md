# B6: Falha do CNPJ e do comitê fica falha

**What to build:** a spec pede "Falha fica falha" para a consulta de CNPJ, o comitê e o revelar. O revelar já cumpre (502 "A busca do … falhou"). Faltam dois casos. Na consulta de CNPJ, quando o actor do Apify ou a BrasilAPI falham, a resposta é a mesma de um CNPJ que não existe: 404 "Dados do CNPJ não encontrados". No comitê, uma pessoa achada cuja proposta não foi gravada some sem aviso. Depois deste ticket, a tela distingue "a consulta falhou" de "não encontrado", e o comitê diz quantas pessoas achadas não puderam ser gravadas. A cobrança não muda: falha continua liberando a reserva e debitando zero.

**Blocked by:** None (pode começar agora).

**Status:** closed (commits `67e176c9` e `3776fa8f`; falta publicar a `account-enrichment`, ver Passos do Nan)

## Estado atual (31/10, `origin/main` 02c54ce6)

- `consultarApifyReceita` (`supabase/functions/account-enrichment/handler.ts:280`) devolve `null` tanto para lista vazia quanto para exceção do actor (o `catch` do fim da função). `consultarBrasilApi` (`:204`) devolve `null` para `!res.ok` (404 de CNPJ inexistente e 5xx) e para exceção de rede.
- O ramo `cnpj-receita` (`:494-497`) trata qualquer `null` como não encontrado: libera a reserva e responde 404 "Dados do CNPJ não encontrados".
- O ramo `comite-compra` (`:630-632`) engole a exceção de `saveProposedContact` ("Gravação que falhou não conta nem cobra; continua com as demais"). A resposta não diz que houve perda.
- Achado na revisão de 31/10 (`/code-review` da spec contra a `origin/main`).

## Critérios

- [x] `cnpj-receita`: o Apify e a BrasilAPI separam "não achou" de "falhou". A BrasilAPI só conta como não achou com 404; 5xx, timeout e exceção são falha. O actor só conta como não achou com execução concluída e lista vazia.
- [x] Quando a fonte que respondeu por último falhou e nenhuma achou, a função libera a reserva, debita zero, grava o custo do Apify se houver run, e responde 502 com "A consulta do CNPJ falhou: …". Não achou continua 404 "Dados do CNPJ não encontrados".
- [x] A tela da Receita mostra a mensagem de falha da função, não "não encontrado".
- [x] `comite-compra`: a resposta traz a quantidade de pessoas achadas que não puderam ser gravadas. A tela do comitê avisa quando ela é maior que zero. Quem não foi gravado continua sem contar e sem cobrar.
- [x] Deno cobre: Apify falha e BrasilAPI 404 → 404; Apify falha e BrasilAPI 5xx → 502 com a reserva liberada; Apify vazio e BrasilAPI acha → grava; gravação de proposta que lança → resposta com a contagem de não gravadas e sem cobrança por ela.
- [x] Vitest cobre a mensagem de falha da Receita e o aviso do comitê.

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

- 31/10/2026 (agente de código): implementado com teste primeiro.
  - Função (`67e176c9`): `consultarBrasilApi` ganhou o parâmetro opcional `falha`; resposta fora do 404, rede fora ou corpo ilegível preenchem o motivo. O ramo `cnpj-receita` responde 502 "A consulta do CNPJ falhou: a BrasilAPI respondeu 503." (ou "não respondeu") e libera a reserva; 404 segue "Dados do CNPJ não encontrados". O `comite-compra` conta as propostas que não foram gravadas e devolve `contactsNotSaved`.
  - Deno: 6 testes novos "B6" em `handler.test.ts` (actor falha + BrasilAPI 503 → 502; actor vazio + BrasilAPI fora → 502 com o custo gravado; actor vazio + 404 → 404; actor vazio + BrasilAPI acha → grava; proposta que lança → `contactsNotSaved: 1` sem cobrar; sem falha → 0). "Apify falha e BrasilAPI 404 → 404" já era coberto pelo teste antigo "cnpj-receita com reserva, falha do actor libera a reserva e não debita", que não mudou. `deno test supabase/functions`, como no CI: 2026 passed, 0 failed, 40 ignored; `deno check` limpo.
  - Tela (`3776fa8f`): `enriquecerReceita` lê a causa no corpo do erro da função; `buscarComite` devolve `naoGravadas` só quando existe; `SecaoComiteDeCompra` avisa "N pessoas encontradas não puderam ser gravadas e não foram cobradas. Busque o comitê de novo." Vitest novo: `supabase-contas-falha-da-consulta.test.ts` (4) e `comite-e-enriquecimento-falha.test.tsx` (4).
  - Fora do "Pode mexer": um campo opcional `naoGravadas` em `ResultadoDoComite` (`src/fonte/contas-tipos.ts`), necessário para a contagem passar pela Fonte.
  - Verificação local (Vitest, tsc e oxlint rodados pelo Deno; não há Node nesta máquina): `oxlint` sem erro; `tsc -b` limpo; `vite build` ok; Vitest 248 de 249 arquivos, 2105 testes passaram. A única falha, `conversa/gaveta-de-historico.test.tsx` ("abre como dialog… com o título certo", `toHaveFocus`), falha igual sem esta mudança e passa no CI da `main` (run 40805817709): é do ambiente, não do B6.
  - Pendente, passo humano: publicar a `account-enrichment` depois do push. Até lá a função em produção segue respondendo 404 para a falha.
