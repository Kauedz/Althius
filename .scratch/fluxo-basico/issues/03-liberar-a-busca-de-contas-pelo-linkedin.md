# 03: Liberar a busca de contas pelo LinkedIn depois da execução de validação

**Status:** ready-for-human

**GATE:** Decisão 7 do Kauê (28/10/2026): liberar o Actor de busca para todos depois de 1 busca real controlada na Equipe Althius (até US$ 0,45 na Apify) com resultado que faça sentido. Mudança de dado em produção é migration, aditiva, com pgTAP próprio.

**Blocked by:** nenhum (o 01 faz a tela mandar filtros; sem ele a busca segue recusada por falta de filtros, com ou sem este ticket).

## Problema

Os dois Actors de `buscar_contas` em `private.discovery_actors` estão `testing` desde 01/10. Com isso, toda busca de quem não é Administrador é recusada (`actor_em_teste`), e o Administrador só busca pedindo o modo de teste. O Actor do LinkedIn nunca tinha rodado de verdade.

## Solução

- Execução real controlada (28/10/2026 12h15 BRT), com o plano do `account-discovery` (`montarPlano`) para o ICP da Equipe Althius: setores "Logística" e "Corretora de seguros", porte 1-10 e 11-50, região Brasil, 10 empresas. Run Apify `PJ1zde6MEUtUKUl1X`, build 0.0.21, `SUCCEEDED`, 10 empresas, 8 do setor pedido (Transportation/Logistics, Insurance), 2 com "Logística" só no nome (TI e treinamento). Custo de uso US$ 0,041, abaixo do teto de US$ 0,45 do Actor.
- Migration `20261217210000_liberar_busca_de_contas_linkedin.sql` passa só `harvestapi~linkedin-company-search` a `available`, versão `0.0.21`. O Actor da Receita segue em teste.

## Pode mexer

- Migration nova e pgTAP em `supabase/tests/`.

## Não mexa

- Outros Actors, tetos de cobrança e preços.

## Critérios de aceite

- [x] A execução de validação rodou uma vez, abaixo de US$ 0,45, e trouxe empresas do setor pedido. Evidência: run `PJ1zde6MEUtUKUl1X` (10 empresas, US$ 0,041).
- [x] Depois das migrations, o Actor do LinkedIn está `available` na versão `0.0.21`, e o da Receita segue `testing`. Evidência: `supabase/tests/liberar_busca_de_contas_linkedin.sql` (4 asserções).
- [x] O teto de cobrança do Actor não muda. Evidência: mesmo pgTAP.
- [ ] CI verde (`banco`) e migration aplicada em produção com a linha no histórico.

## Comments

- 28/10/2026: achado da validação para a próxima fase: a Aderência deu "Alto" para duas empresas que só têm "Logística" no nome (setores TI e treinamento). A nota olha o texto do nome; a explicação por IA (fase 6) e o ajuste da regra ficam registrados para lá.
