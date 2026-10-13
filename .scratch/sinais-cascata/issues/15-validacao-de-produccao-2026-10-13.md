# 15: Validação de produção de 13/10/2026

**What to build:** Corrigir o que a execução real de 13/10/2026 mostrou nas cascatas de Sinais, sem citar fornecedor de coleta para o usuário.

0. **Rodízio de contas de coleta.** `signal-cascade`, `signal-runner` e o cliente compartilhado leem `APIFY_TOKEN_1` a `APIFY_TOKEN_5`. O segredo legado `APIFY_TOKEN`, se existir, entra como mais uma conta (índice 0). Segredo vazio é pulado. Em 402, crédito insuficiente, limite mensal de uso ou 429, a conta fica esgotada nesta execução, entra em espera para as próximas e a chamada segue na conta seguinte. O uso se espalha (a partida do rodízio avança). O log e o rastro guardam só o índice da conta, nunca o valor. A espera fica no banco para a instância seguinte não repetir a conta esgotada.
1. **Consulta de CNPJ em lote.** `entrada_de_socio`, `mudanca_de_porte_ou_regime` e `troca_de_sede` estouram o prazo do actor com cerca de 11 CNPJs numa chamada e passam com 2. Cada chamada leva no máximo 5 CNPJs, com prazo próprio. Se o actor devolve TIMED-OUT, a BrasilAPI assume, como já assume quando a chamada falha.
2. **NCM nova na pauta.** A estatística de comércio exterior respondeu 429 nas 3 tentativas. Espera de pelo menos 10 s, até 3 novas tentativas no 429, e espaço entre consultas seguidas.
3. **Vaga de logística.** A execução bate no limite de cerca de 140 s e fecha `parcial`. A página da empresa no LinkedIn só é consultada para empresa que já casa com uma Conta. A consulta de CNPJ do fim é pulada quando o prazo da função está perto, para os Sinais já confirmados fecharem a execução como concluída.
4. **Meta ESG publicada.** Doze Contas, entre elas a Natura, ficaram sem página: o filtro do site próprio exige o domínio cadastrado e recusa `natura.net` e `naturaeco.com`. Vale domínio da Conta, subdomínio e domínio relacionado à marca (rótulo igual ao nome ou com sufixo conhecido, como eco).
5. **Texto.** Dois Sinais novos ou mais dizem "Sinais novos gravados", não "Sinalis novos gravados".
6. **DOU** (`mudanca_regulatoria`, `licenca_instalacao_dou`). O monitor devolve a data como dd/mm/aaaa e só olha cerca de 3 dias; a cascata pede 7 ou 14. A conferência da consulta e da janela recusa o resultado válido. A data dd/mm/aaaa entra, e um trecho coberto mais curto que o pedido confere quando cabe dentro dele. A busca longa antiga sai das reservas por completo (ignora a consulta e custa cerca de US$ 0,20 por execução).
7. **Nova cooperativa.** O índice da base de CNPJ atrasa cerca de 2 a 3 meses (o mais novo em 2026-07), então a janela de 60 dias nunca casa. A janela passa a cerca de 120 dias, ou ao mês de referência da base quando ele vier no resultado. Se a lista só foi recusada por esse atraso, a outra base não roda: é o mesmo índice.
8. **Validação.** Com `validacao: true`, a execução guarda até 5 CNPJs e razões sociais achados que não são Conta (sem dado de pessoa; MEI já fica de fora antes). Serve para criar a Conta correspondente e provar `cnpj_novo`, `grupo_a_cativo` e cascatas parecidas.

**Blocked by:** nenhum. O ticket 14 já tratou outras fontes da mesma data; os itens 6 e 7 ajustam o que a execução real mostrou depois dele.

**Status:** ready-for-human

## Pode mexer

- Cliente compartilhado de coleta (`_shared/apify-ambiente.ts`, `signal-scan/apify.ts`, `_shared/cascata-de-sinais/fonte-apify.ts`) e quem o monta (`signal-cascade`, `signal-runner`, `signal-scan`, `account-discovery`, `account-enrichment`).
- Motor da cascata só para aceitar a consulta de CNPJ em lotes e para o TIMED-OUT seguir na alternativa pública.
- Passos de CNPJ (`icp-b.ts` fotografia, `icp-f.ts` endereço da matriz, `cnpj-da-conta.ts`), página de empresa (`empresa-linkedin.ts`), meta ESG (`icp-d.ts`) e o cliente da estatística de comércio (`comexstat.ts`, `fonte-publica.ts` se a espera precisar).
- A frase de sucesso no motor.
- Os passos do DOU (`icp-c.ts`, `icp-e-licencas.ts`) e da cooperativa (`icp-h.ts`), o casamento com Contas (`empresas.ts`) e o fechamento da execução no motor e no banco.
- Migração nova com timestamp maior que `20261014150000` e pgTAP novo. Não editar migração já escrita. Ajustar asserção de pgTAP que ainda crava a busca longa do DOU como reserva.
- READMEs das funções, este ticket e `.scratch/RALPH-STATUS.md`.
- Testes Deno desses módulos.

## Não mexa

- Migrações já escritas, inclusive a `20261014140000`.
- Segredos, Auth, deploy e qualquer escrita no projeto remoto.
- Frontend e Hermes.
- Grupo A e CNPJ novo, fora a amostra de validação no registro da execução (o casamento com Contas é compartilhado).
- `contact-photo-lookup`: continua lendo só o segredo legado. Não apagar `APIFY_TOKEN` por causa deste ticket.

## Critérios

- [x] Vermelho antes do verde nos Deno das funções: rodízio no 429, lotes de no máximo 5 CNPJs, espera do 429, página só de Conta, domínio relacionado, frase "Sinais".
- [x] pgTAP novo: só a chave de serviço mexe na espera e no cursor; anon e authenticated não; a espera guarda índice e motivo, nunca um segredo; o cursor avança. Arquivo `supabase/tests/rodizio_das_contas_de_coleta.sql` (16 asserts). Não rodei aqui: este ambiente não tem Postgres. O job Banco do CI executa.
- [x] Nenhum texto que o usuário lê cita fornecedor. Log sem valor de segredo.
- [x] Migração só no repositório. Nada aplicado no remoto. Sem deploy.
- [x] DOU: dd/mm/aaaa entra; trecho de cerca de 3 dias dentro da janela de 7 ou 14 confere; a busca longa não é chamada.
- [x] Cooperativa aberta no mês de referência da base (cerca de 2026-07) vira candidata; recusa só por atraso não chama a outra base.
- [x] `validacao: true` grava até 5 CNPJs e razões sociais sem Conta na execução; sem isso, não grava. Sem CPF.
- [x] pgTAP da amostra: `supabase/tests/amostra_de_validacao.sql` (8 asserts). Não rodei aqui: este ambiente não tem Postgres. O job Banco do CI executa. As asserções de `cascatas_fontes_corrigidas.sql` e `cascatas_icp_c.sql` deixam de cravar a busca longa como reserva.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Com o CI verde, aplicar as migrações no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, em bloco atômico, como em `docs/agents/migrations.md`, nesta ordem. Se a `20261014140000` do ticket 14 ainda não estiver aplicada, ela vem antes de todas.

   - `supabase/migrations/20261014150000_rodizio_das_contas_de_coleta.sql`
   - `supabase/migrations/20261014160000_dou_sem_busca_longa.sql`
   - `supabase/migrations/20261014170000_amostra_de_validacao.sql`
2. Cadastrar os segredos numerados digitando-os no próprio terminal, sem colar no chat. O legado `APIFY_TOKEN` continua (a foto de Contato ainda o lê). Os que não existirem são pulados.

```powershell
npx supabase secrets set APIFY_TOKEN_1 --project-ref ycbdilsmydvzezhlymty
npx supabase secrets set APIFY_TOKEN_2 --project-ref ycbdilsmydvzezhlymty
npx supabase secrets set APIFY_TOKEN_3 --project-ref ycbdilsmydvzezhlymty
npx supabase secrets set APIFY_TOKEN_4 --project-ref ycbdilsmydvzezhlymty
npx supabase secrets set APIFY_TOKEN_5 --project-ref ycbdilsmydvzezhlymty
```

3. Publicar as funções que leem o rodízio, sem `--no-verify-jwt`:

```powershell
npx supabase functions deploy signal-cascade signal-runner signal-scan account-discovery account-enrichment --project-ref ycbdilsmydvzezhlymty
```

4. Não marcar cascata como disponível. Uma rodada de teste (vaga de logística, entrada de sócio, meta ESG, NCM, mudança regulatória, licença no DOU, nova cooperativa) confirma o rastro: índice de conta, sem valor de segredo, a vaga concluída em vez de parcial, e o DOU sem a busca longa. Com `validacao: true`, a coluna `validation_sample` da execução traz até 5 CNPJs sem Conta.

## Comments

- A espera de crédito dura 30 minutos; a de limite de taxa, 2 minutos. As duas valem para a instância seguinte porque ficam no banco. Se a migração ainda não foi aplicada, a função segue com a espera só na memória da instância e registra a falha da gravação sem o segredo.
- A foto de Contato não entra no rodízio neste ticket.
- Vermelho (13/10/2026, antes do código): 14 falhas, entre elas "2 Sinalis novos gravados.", lote `[11]`, 429 sem troca de conta, página da Gama ainda consultada, domínio da Natura recusado. Verde: `deno check supabase/functions/*/index.ts` limpo; `deno test supabase/functions` 1316 passed / 0 failed / 32 ignored.
- PR: https://github.com/Kauedz/Althius/pull/194. Sem merge. Falta o Nan aplicar as migrações, cadastrar os segredos e publicar as funções.
- Itens 6 a 8 (13/10/2026). Vermelho antes do código: 8 falhas (a busca longa ainda era chamada; cooperativa de 2026-07 caía na outra base; a amostra de validação não existia). Verde: `deno check supabase/functions/*/index.ts` limpo; `deno test supabase/functions` 1324 passed / 0 failed / 32 ignored. pgTAP novo não rodou aqui (sem Postgres).
