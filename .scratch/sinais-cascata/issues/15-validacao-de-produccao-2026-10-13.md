# 15: Validação de produção de 13/10/2026

**What to build:** Corrigir o que a execução real de 13/10/2026 mostrou nas cascatas de Sinais, sem citar fornecedor de coleta para o usuário.

0. **Rodízio de contas de coleta.** `signal-cascade`, `signal-runner` e o cliente compartilhado leem `APIFY_TOKEN_1` a `APIFY_TOKEN_5`. O segredo legado `APIFY_TOKEN`, se existir, entra como mais uma conta (índice 0). Segredo vazio é pulado. Em 402, crédito insuficiente, limite mensal de uso ou 429, a conta fica esgotada nesta execução, entra em espera para as próximas e a chamada segue na conta seguinte. O uso se espalha (a partida do rodízio avança). O log e o rastro guardam só o índice da conta, nunca o valor. A espera fica no banco para a instância seguinte não repetir a conta esgotada.
1. **Consulta de CNPJ em lote.** `entrada_de_socio`, `mudanca_de_porte_ou_regime` e `troca_de_sede` estouram o prazo do actor com cerca de 11 CNPJs numa chamada e passam com 2. Cada chamada leva no máximo 5 CNPJs, com prazo próprio. Se o actor devolve TIMED-OUT, a BrasilAPI assume, como já assume quando a chamada falha.
2. **NCM nova na pauta.** A estatística de comércio exterior respondeu 429 nas 3 tentativas. Espera de pelo menos 10 s, até 3 novas tentativas no 429, e espaço entre consultas seguidas.
3. **Vaga de logística.** A execução bate no limite de cerca de 140 s e fecha `parcial`. A página da empresa no LinkedIn só é consultada para empresa que já casa com uma Conta. A consulta de CNPJ do fim é pulada quando o prazo da função está perto, para os Sinais já confirmados fecharem a execução como concluída.
4. **Meta ESG publicada.** Doze Contas, entre elas a Natura, ficaram sem página: o filtro do site próprio exige o domínio cadastrado e recusa `natura.net` e `naturaeco.com`. Vale domínio da Conta, subdomínio e domínio relacionado à marca (rótulo igual ao nome ou com sufixo conhecido, como eco).
5. **Texto.** Dois Sinais novos ou mais dizem "Sinais novos gravados", não "Sinalis novos gravados".

**Blocked by:** nenhum. O ticket 14 já tratou outras fontes da mesma data; esta correção não mexe nelas.

**Status:** ready-for-human

## Pode mexer

- Cliente compartilhado de coleta (`_shared/apify-ambiente.ts`, `signal-scan/apify.ts`, `_shared/cascata-de-sinais/fonte-apify.ts`) e quem o monta (`signal-cascade`, `signal-runner`, `signal-scan`, `account-discovery`, `account-enrichment`).
- Motor da cascata só para aceitar a consulta de CNPJ em lotes e para o TIMED-OUT seguir na alternativa pública.
- Passos de CNPJ (`icp-b.ts` fotografia, `icp-f.ts` endereço da matriz, `cnpj-da-conta.ts`), página de empresa (`empresa-linkedin.ts`), meta ESG (`icp-d.ts`) e o cliente da estatística de comércio (`comexstat.ts`, `fonte-publica.ts` se a espera precisar).
- A frase de sucesso no motor.
- Migração nova com timestamp maior que `20261014140000` e pgTAP novo. Não editar migração já escrita.
- READMEs das funções, este ticket e `.scratch/RALPH-STATUS.md`.
- Testes Deno desses módulos.

## Não mexa

- Migrações já escritas, inclusive a `20261014140000`.
- Segredos, Auth, deploy e qualquer escrita no projeto remoto.
- Frontend, Hermes e as cascatas que o ticket 14 corrigiu (DOU, Grupo A, cooperativa, CNPJ novo).
- `contact-photo-lookup`: continua lendo só o segredo legado. Não apagar `APIFY_TOKEN` por causa deste ticket.

## Critérios

- [x] Vermelho antes do verde nos Deno das funções: rodízio no 429, lotes de no máximo 5 CNPJs, espera do 429, página só de Conta, domínio relacionado, frase "Sinais".
- [x] pgTAP novo: só a chave de serviço mexe na espera e no cursor; anon e authenticated não; a espera guarda índice e motivo, nunca um segredo; o cursor avança. Arquivo `supabase/tests/rodizio_das_contas_de_coleta.sql` (16 asserts). Não rodei aqui: este ambiente não tem Postgres. O job Banco do CI executa.
- [x] Nenhum texto que o usuário lê cita fornecedor. Log sem valor de segredo.
- [x] Migração só no repositório. Nada aplicado no remoto. Sem deploy.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan.**

1. Com o CI verde, aplicar `supabase/migrations/20261014150000_rodizio_das_contas_de_coleta.sql` no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql`, em bloco atômico, como em `docs/agents/migrations.md`. Se a `20261014140000` do ticket 14 ainda não estiver aplicada, ela vem antes.
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

4. Não marcar cascata como disponível. Uma rodada de teste (vaga de logística, entrada de sócio, meta ESG, NCM) confirma o rastro: índice de conta, sem valor de segredo, e a execução da vaga concluída em vez de parcial.

## Comments

- A espera de crédito dura 30 minutos; a de limite de taxa, 2 minutos. As duas valem para a instância seguinte porque ficam no banco. Se a migração ainda não foi aplicada, a função segue com a espera só na memória da instância e registra a falha da gravação sem o segredo.
- A foto de Contato não entra no rodízio neste ticket.
- Vermelho (13/10/2026, antes do código): 14 falhas, entre elas "2 Sinalis novos gravados.", lote `[11]`, 429 sem troca de conta, página da Gama ainda consultada, domínio da Natura recusado. Verde: `deno check supabase/functions/*/index.ts` limpo; `deno test supabase/functions` 1316 passed / 0 failed / 32 ignored.
- PR: https://github.com/Kauedz/Althius/pull/194. Sem merge. Falta o Nan aplicar a migração, cadastrar os segredos e publicar as funções.
