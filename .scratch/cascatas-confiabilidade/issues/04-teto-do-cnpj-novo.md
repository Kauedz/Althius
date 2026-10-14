# 04: Teto do CNPJ novo

**What to build:** A rodada de CNPJ novo para em 25 empresas e em US$ 0,20, os dois no código, mesmo que o banco ainda peça 100. O pedido ou o modelo do passo podem subir com `tetoResultados` e `tetoUsd` (resultados de 1 a 500, sem passar de `maxItems`). O que passar do teto de resultados é cortado. A chamada leva `maxTotalChargeUsd` igual ao menor entre esse teto e o que resta da cascata. O teto da cascata (US$ 0,50) e o número de Contas não mudam, para o pgTAP antigo (`cnpj_novo:0.5000:200`) continuar válido. A migração nova só ajusta `max_items`, `est_items` e o modelo do passo. Não marca a cascata como disponível.

**GATE:** nenhum bloqueio. Não editar `src/**/sinais/**`, a RPC de Sinais de mercado, `proposta_recusada` nem `catalogo.ts`. Sem deploy. Sem aplicar a migração no projeto `ycbdilsmydvzezhlymty`. Sem segredo. Não editar `20261013160000_cascatas_icp_b.sql` nem `supabase/tests/cascatas_icp_b.sql`.

**Blocked by:** nenhum.

**Status:** ready-for-human

## Pode mexer

- O passo de CNPJ novo em `passos/icp-b.ts` e o teste B1.
- O motor, para honrar `tetoUsd` do lote.
- A migração nova `supabase/migrations/20261015130000_teto_do_cnpj_novo.sql` e o pgTAP novo `supabase/tests/teto_do_cnpj_novo.sql`.
- Este ticket.

## Não mexa

- `cap_usd` e `max_accounts` da cascata.
- O passo B4 que ainda pede `maxResults: 100` (não é CNPJ novo).
- Migrações já escritas. Catálogo e telas de Sinais. Segredos, Auth, deploy e o projeto remoto.

## Critérios

- [x] Sem pedido, a entrada pede `maxResults` 25 e a consulta `maxTotalChargeUsd` `0.2`. Trinta empresas viram 25 na contagem e a amostra de validação fica em 5.
- [x] Pedido `tetoResultados` 40 e `tetoUsd` 0,35 pede 40 e `0.35`.
- [x] Pior caso 0,00005 + 0,004×25 cabe nos US$ 0,50.
- [x] pgTAP novo (`plan(4)`): `max_items` 25, `est_items` 25, `tetoResultados` 25, `tetoUsd` numérico 0,20.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Com o CI verde, aplicar no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, em bloco atômico, como em `docs/agents/migrations.md`. A `20261015120000` vem antes, se ainda não estiver aplicada.

   - `supabase/migrations/20261015130000_teto_do_cnpj_novo.sql`
2. Publicar as funções que carregam o núcleo da cascata, sem `--no-verify-jwt`:

```powershell
npx supabase functions deploy signal-cascade signal-runner --project-ref ycbdilsmydvzezhlymty
```

3. Não marcar cascata como disponível. Não cadastrar segredo. Uma rodada de validação de CNPJ novo pede no máximo 25 empresas e para em US$ 0,20.

## Comments

- pgTAP não rodou aqui: sem Postgres local. O job Banco do CI executa `supabase/tests/teto_do_cnpj_novo.sql`. Não aplicar no remoto a partir daqui.
