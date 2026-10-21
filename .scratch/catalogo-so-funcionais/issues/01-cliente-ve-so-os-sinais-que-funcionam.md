# 01: O cliente vê só os Sinais que funcionam

**Status:** ready-for-human

**GATE:** depois de `9fce6de` na `main`. Uma migração aditiva (`20261105110000_quem_ve_o_catalogo_interno.sql`), não
aplicada por este ticket. Sem deploy nem segredo. Ordem de publicação: aplicar a migração, depois publicar o frontend.

## O que construir

- `ehFuncional`, `disponibilidadeDoCard`, `cardsParaOCliente` e o hook `useCatalogoFuncional` em
  `paginas/sinais/catalogo-funcional.ts`.
- Na Fonte de Sinais, `estadosDosColetores()` e `souDaEquipeAlthius()`, aditivos. A simulada dá tudo por disponível.
- `public.viewer_is_althius_staff()` com pgTAP próprio.
- Página de Sinais, página do Sinal e rota do editor usando a visão do catálogo; selos "Em teste"/"Em breve" e "Interno".

## Pode mexer

- `projeto-althius-frontend/src/paginas/sinais/`: `pagina-sinais.tsx`, `pagina-do-tipo.tsx`, `editor.tsx` (só a rota),
  `vitrine-pecas.tsx`, os arquivos novos `catalogo-funcional*.ts(x)` e `catalogo-so-funcionais.test.tsx`.
- `src/fonte/sinais-tipos.ts`, `supabase-sinais.ts`, `simulada-sinais.ts` (métodos novos, aditivos).
- `src/test/estados-dos-coletores.ts` (novo).
- Testes do operacional cuja expectativa muda com a regra nova.
- `supabase/migrations/20261105110000_quem_ve_o_catalogo_interno.sql`, `supabase/tests/quem_ve_o_catalogo_interno.sql`.

## Não mexa

- `catalogo-visivel.ts` e a cópia dele no banco.
- `supabase/functions/integration-*`, `slack-channel-*`, `sender-accounts`, `unipile-account-status`, `_shared/unipile*`,
  `_shared/integracoes/`, `signal-runner`, `signal-scan`, `signal-cascade`, o registro de actors e cascatas.
- `src/paginas/conexoes*.tsx`, `src/fonte/supabase-conexoes.ts`.
- Rotas, menu lateral, layout da página de Sinais e ordem das prateleiras.

## Critérios

- [x] Cliente vê só os funcionais em todas as prateleiras, na busca, no filtro de família e no Sinal da semana.
- [x] "Lançamentos" não aparece para o cliente.
- [x] URL direta de card não funcional volta para `/sinais`.
- [x] Equipe vê os 26, com "Interno" nos não funcionais.
- [x] Monitoramento existente mantém o card, com o selo de disponibilidade, sem deixar criar outro.
- [x] Erro de leitura mostra o erro, não o catálogo inteiro.
- [x] A Demonstração continua com os 26.
- [x] `CATALOGO_VISIVEL` com os mesmos 26 cards; o teste de paridade verde.
- [x] Só créditos na tela; `sem-dolar-na-ui.test.ts` verde.
- [x] lint, `tsc -b`, vitest e build verdes.
- [ ] pgTAP `quem_ve_o_catalogo_interno.sql` verde no CI.
- [x] Prints 1400×900 do cliente e da equipe em `prints/`.

## Passos do Nan

1. Com o CI verde, aplicar a migração `20261105110000_quem_ve_o_catalogo_interno.sql` no remoto, pelo bloco atômico de
   `docs/agents/migrations.md`, e conferir o `md5`.
2. Só então publicar o frontend (o merge na `main` publica pelo `publicar-frontend.yml`). Se o frontend sair antes, a
   função falha, vale `false`: o cliente não é afetado e só a equipe deixa de ver os internos até a migração entrar.
3. Para conferir logado: abrir `/sinais` com um usuário comum (15 cards, sem Lançamentos) e com um usuário de
   `private.althius_staff` (26 cards, com "Interno").

## Comments

Implementado em `cursor/catalogo-so-funcionais`. Regra em `catalogo-funcional.ts`; a Fonte ganhou `estadosDosColetores()`
e `souDaEquipeAlthius()`. O Sinal da semana só destaca card que roda, também para a equipe. Testes novos:
`catalogo-funcional.test.ts` (7) e `catalogo-so-funcionais.test.tsx` (13). Dois testes do operacional ajustados: o banco
falso de `sinais-internos-reais` ganhou `proposta_recusada` `available` (como em produção), e o card "em teste" de
`monitoramento-real` agora volta ao catálogo em vez de abrir o editor. Prints em `prints/`, num Workspace operacional
montado sobre o Supabase falso dos testes com os estados de 20/10 (a faixa "Contrato inativo" é desse banco falso).
