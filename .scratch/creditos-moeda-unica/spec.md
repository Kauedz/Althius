# Spec: Créditos como moeda única

**Status:** ready-for-human (código neste PR; migrações e deploy ficam com o Kauê)

**Frente:** créditos e planos. Segundo de três PRs (depois de `acesso-e-planos`, antes de `sinal-candidata-e-descoberta`).
Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md). Decisões: [ADR-0019](../../docs/adr/0019-creditos-e-cobranca-por-usuario.md)
e [ADR-0025](../../docs/adr/0025-workspace-so-por-contrato-e-visitante-na-demonstracao.md).

## Problema

O cliente ainda vê dólar (teto de US$ 20, "US$ 0,80 a cada 200 empresas") e o crédito de um Monitoramento sai do custo da
fonte vezes um multiplicador, então o preço muda com o fornecedor. O contrato é por faixa, com créditos mensais fixos: o
crédito precisa ser a única moeda, com preço fixo por Sinal, renovação mensal e um limite que o cliente entende.

## Solução

1. **Crédito é a única moeda da UI do cliente.** Nenhum "US$" de custo na tela (o catálogo, a página do tipo, a
   vitrine). Os rótulos `signal_catalog.estimated_cost_label` passam a dizer o preço em créditos. Os filtros de valor de
   rodada de investimento ("US$ 10 mi ou mais") ficam: não são custo.
2. **Preço fixo por Sinal** (`signal_catalog.credits_per_account`): faixa 1 (1 crédito) para fontes públicas como CNPJ,
   DOU, financiamento, comércio exterior, energia, safra e avaliações; faixa 2 (2 créditos) para vagas, publicações,
   movimentação de pessoas e anúncios; Sinais de Mercado sem Conta, 3 créditos por execução. O Monitoramento cobra
   `credits_per_account` × Contas varridas, pelo signal-runner e pela cascata. Na cascata, `usd_per_credit` e o
   multiplicador viram só a guarda interna.
3. **Rodada de Agente**: 1 crédito no modelo padrão, 3 se o modelo da plataforma for Anthropic, 0,2 com a chave do
   cliente. Descoberta 5 a cada 50, pessoa 1, e-mail 2, telefone 5 e CNPJ 1 continuam.
4. **Renovação** (`pg_cron`, todo dia confere o aniversário do contrato): zera o restante dos créditos do plano
   (lançamento `ajuste` negativo, só do que veio do plano) e grava `monthly_credits` da faixa como `plano`. Os créditos de
   `pacote` valem 12 meses e são gastos depois dos do plano (cada entrada guarda a validade; lotes de crédito registram de
   onde cada gasto saiu).
5. **Um limite mensal só para o cliente**: o limite em créditos (`workspace_contracts.monthly_credit_limit`, padrão os
   créditos do plano) é o mesmo teto da Automação. Nos Workspaces contratados a Automação (varredura, enriquecimento e
   Agentes) vem em automático dentro do limite, com migração para os existentes.
6. **Guarda interna em dólar invisível**: `workspace_signal_budget` vem de `contract_tiers.internal_usd_guard`. Ela
   nunca aparece na UI. Atingido o limite ou a guarda, o cliente vê só: "Limite do mês atingido. A Automação volta na
   renovação ou fale com a equipe Althius."
7. **Preços escondidos** em `list_credit_action_prices`: Descoberta e consulta de CNPJ aparecem; a cascata deixa de ser uma
   ação separada.

## Decisões

- **O "mês" é o período do contrato**, do aniversário ao seguinte, e não o mês do calendário: sem isso, quem renova no dia
  15 teria o uso da primeira metade do mês somado ao limite da renovação. `private.credit_period_start` devolve o início
  do período (o dia 1 do mês, quando não há contrato); a Automação, o limite e o uso do Plano usam a mesma chave.
- **Lotes de crédito** (`private.credit_lots`): `grant_credits` abre um lote por entrada e `settle_credits` consome os
  lotes (plano, depois ajuste, depois pacote por validade). O extrato (`credit_entries`) não muda; o lote só diz o que
  restou de cada origem, para a renovação zerar só o plano.
- O preço da rodada de Agente com a Anthropic vem de um ajuste no banco (`private.platform_model_setting`), mudado por
  `public.set_platform_model('anthropic' | 'padrao')`, junto com o segredo `AGENT_PROVIDER` (passo do Kauê). O padrão é
  `padrao`.
- Sinais internos do histórico comercial (sem resposta, negociação parada, proposta recusada) não chamam fonte externa:
  `credits_per_account` 0, rótulo "Sem custo em créditos". Se algum passar pelo runner, cobra o mínimo de 1.
- Cascata de Conta: reserva `credits_per_account` × Contas da execução (o motor passa o número); fecha cobrando tudo
  quando conclui ou conclui em parte com Sinais, e nada quando falha ou aborta. Cascata de Mercado: 3 por execução.
  O teto diário de créditos da cascata continua valendo, com o padrão subido de 50 para 6000 (era calibrado pelo custo
  em dólar); o que limita de fato é a guarda em dólar e o limite do período.
- `workspace_signal_monthly_cap` (devolvia dólar) sai de `authenticated`.

## Fora de escopo

- Conectores e integrações. Aplicar migração, deploy e segredos. Apagar dado.
- Candidatas e Descoberta (PR 3).

## Testes

pgTAP (preço por Sinal, renovação com plano zerado e pacote preservado, limite único, mensagem de limite, tabela de
preços, rodada de Agente), Deno (cobrança da cascata e do runner), Vitest (nenhum "US$" de custo na UI do cliente, por um
teste que varre os textos).
