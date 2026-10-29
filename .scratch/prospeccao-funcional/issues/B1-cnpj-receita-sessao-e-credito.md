# B1: cnpj-receita confere a sessão e reserva crédito

**What to build:** consultar a Receita Federal de uma Conta só funciona para quem está na sessão e participa daquele Workspace. A consulta na conta Apify da Althius só começa depois de o crédito estar reservado. Sem saldo, não roda. Se achar o CNPJ, liquida a reserva. Se não achar, devolve a reserva e não debita. O custo em dólares que o Apify devolveu fica gravado. Quem não está autenticado não dispara o actor nem a BrasilAPI, e não grava `receita_data`.

**Blocked by:** None (pode começar agora). O merge na `main` espera o 00.

**Status:** closed (migration aplicada no remoto, conferida em 28/10)

- [x] A ação `cnpj-receita` identifica o usuário pela sessão antes de qualquer consulta. A chave anon, sozinha, recebe recusa e o actor não é chamado. O furo está em `supabase/functions/account-enrichment/handler.ts`. `account-discovery` não tem esta ação.
- [x] A consulta paga só começa com crédito reservado para o Workspace e para a pessoa da sessão, no mesmo contrato das outras ações (reservar, liquidar o que achou, liberar o resto). Sem saldo ou fora do teto da pessoa, a consulta não chama o Apify.
- [x] Achar o CNPJ liquida a reserva e grava na Conta, como hoje, pela função que já confere a participação. Não achar libera a reserva e debita zero.
- [x] O valor em dólares devolvido pelo Apify fica gravado no registro de custo que a plataforma já usa para actor. Não cria livro novo.
- [x] A tela mostra o custo em créditos antes do clique. O preço não está na tabela. Pergunte o valor ao Nan e só então grave a ação de crédito. Não invente o número. Referência do que já existe, para a pergunta: varredura 1, pessoa coletada 1, e-mail 2, telefone 5, busca de Contas 5.
- [x] Deno cobre: sem sessão não chama o actor; com sessão e sem saldo não chama o actor; com reserva, falha do actor libera a reserva; sucesso liquida e grava o custo.
- [x] pgTAP cobre a reserva, a liquidação, a liberação e que outro Workspace não lê o `receita_data`.

## Pode mexer

- `supabase/functions/account-enrichment/handler.ts` (só o ramo `cnpj-receita`)
- `supabase/functions/account-enrichment/handler.test.ts`
- `supabase/functions/account-enrichment/index.ts`, se a gravação do custo precisar de um método novo no `db`
- A tela da Receita em `projeto-althius-frontend/src/paginas/comite-e-enriquecimento.tsx` e a chamada em `supabase-contas.ts` (`enriquecerReceita`), para mostrar o custo antes
- Uma migration nova e um pgTAP novo

## Não mexa

- O ramo `comite-compra` e o ramo `revelar-contato`. O B2 e o B3 partem do arquivo que este ticket deixar.
- A entrada dos actors do comitê e do revelar (`provedor-de-contatos.ts`).
- Telefone. Não cobre consulta de telefone e não cobra telefone.
- `grant_credits`, saldo de teste, teto e plano. O teste de saldo usa o contrato; quem põe crédito no Workspace de teste é o Nan, fora deste ticket.
- Conexões, InMail, seam de Canal, Stripe, sinais jurídicos.

## Migration

Uma, timestamp UTC maior que `20261002112000`, só se for preciso criar a ação de crédito da consulta. Espere o valor do Nan antes de escrevê-la. pgTAP próprio. Não edite `20261001190000_enriquecimento_e_comite.sql`.

## Passos do Nan

1. Dizer o preço em créditos de uma consulta de CNPJ. Sem esse número a migration do preço não é escrita.
2. Com o CI verde, aplicar a migration no projeto `ycbdilsmydvzezhlymty` como manda `docs/agents/migrations.md`.
3. Publicar a função, no PowerShell, na raiz do repositório:

```powershell
npx supabase functions deploy account-enrichment --project-ref ycbdilsmydvzezhlymty
```

Sem `--no-verify-jwt`. A conferência da sessão é do handler: a chave anon também é um JWT, e o gateway sozinho não basta. Quem executa o ticket não aplica migration nem deploy no remoto.

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6): os sete critérios estão em aberto.
  - Sessão: o ramo `cnpj-receita` (`supabase/functions/account-enrichment/handler.ts:365-406`) não chama `userFromJwt` (os outros ramos chamam, `:421-427`, `:504-510`). O actor (`:376-378`) e a BrasilAPI (`:379-381`) rodam sem conferir nada; o erro ao gravar é engolido (`:399`) e sócios, e-mail e telefones voltam a quem chamou (`:402`). O lugar é o que o ticket diz; a auditoria citou `account-discovery`, que não tem essa ação.
  - Crédito: não há `reserve_credits` nesse ramo nem ação de CNPJ na tabela de preços (`20260930160000_saldo_e_lancamentos_de_credito.sql:14-19`, `20261001171000:12`).
  - Já funciona: gravar pela função que confere a Participação (`20261001190000_enriquecimento_e_comite.sql:66-74`); pgTAP "membro ativo consegue salvar enriquecimento da Receita Federal" e "membro de outro workspace é recusado". Falta a leitura por outro Workspace no pgTAP.
  - Custo em dólar: o registro (`record_discovery_cost`, `20261001171000:275`) e o actor (`20261001170000:268`) já existem; o ramo não grava.
  - Tela: o botão "Consultar Receita" não mostra custo (`src/paginas/comite-e-enriquecimento.tsx:97-107`; ver o [detalhe da Conta](../../crm-real-e-stack/issues/prints/17-detalhe-da-conta-com-sequencia.jpg)).
  - Testes rodados: `deno test --allow-all supabase/functions/account-enrichment/` → 9 passed (só os mapeadores `consultarApifyReceita` e `consultarBrasilApi` tocam a Receita); pgTAP `enriquecimento_e_comite.sql` ok no CI 37707955273.
  - Este ticket também cobre a parte da Receita do `creditos-e-planos` 01 (custo gravado) e do enriquecimento 01.
  - Pergunta ao Nan antes da migration: o preço em créditos de uma consulta de CNPJ (referência: varredura 1, pessoa coletada 1, e-mail 2, telefone 5, busca de Contas 5).

- 2026-10-07, decisão do Renan: a consulta de CNPJ custa 1 crédito, cobrado só quando a Receita devolve dado. Se o actor ou a BrasilAPI falha, ou o CNPJ não é achado, a reserva é liberada e nada é cobrado. Se o preço se mostrar errado, ele se corrige depois numa migration nova; isso não trava o ticket. Com isso, a pergunta do critério 5 está respondida: a migration grava a ação de crédito da consulta com 1 crédito (timestamp maior que `20261002121000`, a última da `main`), e a tela mostra "1 crédito" antes do clique.
- 2026-10-08: os sete critérios fechados. Migration `20261008203000_consulta_cnpj_reserva_credito.sql` (timestamp maior que `20261008153000` desta branch e que `20261008160000` do acesso). pgTAP `consulta_cnpj_reserva_credito.sql` com `plan(19)`; não rodou nesta máquina (sem psql, Docker nem Supabase CLI). Deno: `deno test supabase/functions` 714 passed, 0 failed. Frontend: `npx vitest run --maxWorkers=2` 108 arquivos, 1075 testes, exit 0; `npm run lint` 49 avisos já existentes e 0 erros; `npm run build` (`tsc -b && vite build`) exit 0. A frase "1 crédito" fica no botão Consultar/Atualizar Receita (`aria-describedby`). Não há print: esta sessão não tem navegador. O teste da seção cobre a frase visível. A tradução de "insufficient credits" na fonte foi retirada na revisão: o ticket não pedia, e o custo está na tela.
- 2026-10-28 (fechamento da spec): conferido no remoto `ycbdilsmydvzezhlymty` com consulta só de leitura em `supabase_migrations.schema_migrations`: `20261008203000` aplicada. `account-enrichment` publicada na versão 18 (28/10, 17:17 BRT). `closed`.
