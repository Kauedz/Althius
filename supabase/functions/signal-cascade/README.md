# signal-cascade

A busca de Sinais por **cascata**, pedida pela conversa do Hermes. Um Sinal é uma cascata de 1..N passos (um actor do Apify, uma fonte pública aberta ou uma regra interna); a saída normalizada de um passo é a entrada do próximo, e a cascata inteira é **um** Sinal: uma reserva de crédito, uma execução com N passos registrada (`private.signal_cascade_runs` e `_run_steps`) e um `record_signal` por acontecimento no fim. O motor é o `_shared/cascata-de-sinais`, o **mesmo** do Monitoramento (`signal-runner`): a conversa e as rotinas não têm caminhos separados.

Quem chama: só o servidor, com a chave de serviço no `Authorization` (o worker do Hermes, que roda fora do Supabase e não tem as contas do Apify). `verify_jwt = true` no `supabase/config.toml`; a função confere o papel de serviço (`signal-scan/autorizacao.ts`).

## Pedido

`POST` com `{ workspaceId, userId, sinal, contas?, criterios?, tetoCreditos?, chave? }`:

- `sinal`: o tipo do catálogo (`vaga_comex`...). Em teste, "sem fonte" ou fora do ar, nada é reservado nem rodado.
- `contas`: ids de Contas-alvo do Workspace; sem elas, todas as ativas (até o máximo da cascata). A cascata só grava Sinal em Conta do Workspace do pedido.
- `criterios`: `termos` e `periodo`, quando o tipo os aceita.
- `tetoCreditos` (1 a 50): quanto quem pede aceita gastar. O teto em dólar da execução é o menor entre o da cascata e este; **nenhum passo começa** se o custo acumulado mais a estimativa dele passar do teto, e o `maxTotalChargeUsd` de cada run cabe no que resta.
- `chave`: repetir a mesma chave não reserva, não cobra nem grava de novo. Sem ela, a função cria uma.
- `validacao: true` (só a equipe; o Hermes nunca envia): deixa rodar um Sinal ainda em teste e compara na hora com a fotografia já guardada (segunda passagem). Dado igual à base não vira Sinal. A execução guarda até 5 CNPJs e razões sociais achados que não são Conta, sem dado de pessoa, para criar a Conta e repetir a busca.

`{ action: 'catalogo' }` devolve `{ sinais: [{ sinal, icp, nome, estado, escopo, motivo }] }`, com `estado` em `disponivel`, `em_validacao`, `sem_fonte` ou `fora_do_ar`.

`{ action: 'aquecer' }` guarda a estatística de comércio exterior deste mês (as consultas da NCM e do volume por porto) sem abrir execução e sem cobrar crédito. A resposta é só `{ desfecho, mensagem }`. `desfecho` `adiado` quer dizer que a fonte limitou as consultas: nada foi cobrado e a próxima tentativa relê a cópia. Quem chama continua sendo o servidor (`verify_jwt = true`). O relógio diário pede o mesmo aquecimento ao `signal-runner`, que já aceita o token do relógio.

## Resposta

`{ desfecho, mensagem, creditos, novos, repetidos, empresasSemConta, sinais: [{ conta, contaId, frase, quando, fonte, evidencia }] }`. `desfecho` pode ser `concluida`, `parcial`, `abortada`, `falhou` ou `adiado`. `adiado` não cobra crédito: a fonte pública pediu para tentar de novo mais tarde. Nada técnico: sem custo em dólar, actor, run id nem erro real (esses ficam em `signal_cascade_run_steps`, que nenhum RPC da tela lê). A mensagem é sempre em palavras do produto ("Sem saldo na fonte de dados; avisamos a equipe.", "Nossa busca não respondeu a tempo.").

## Contas do Apify

`APIFY_TOKEN_1` a `APIFY_TOKEN_5` e, se houver, o legado `APIFY_TOKEN` (índice 0) (`_shared/apify-ambiente.ts`). Segredo vazio é pulado. Trocar ou somar uma conta é mudar segredo. A conta que recusa por **falta de crédito, limite de uso** (402; 403 desses casos) **ou 429** é pulada, entra em espera (30 min para crédito, 2 min para limite; a migração `20261014150000` guarda a espera para a instância seguinte) e o passo se repete na conta seguinte. 5xx e 403 de permissão não giram. O rodízio começa na conta seguinte a cada chamada. Todas sem crédito ou limite: falha amigável, reserva liberada. O índice da conta usada fica no rastro do passo; o valor nunca. A foto de Contato não entra neste rodízio.

## Custo

Preço ao usuário = custo real do run (`usageTotalUsd`, lido de `GET /v2/actor-runs/{id}`) × `price_multiplier` (3) ÷ `private.signal_cascade_settings.usd_per_credit` (US$ 0,30 por crédito), arredondado para baixo, no mínimo 1 crédito quando a execução gerou Sinal novo, nunca acima do reservado. Falha ou aborto sem custo liberam a reserva; falha parcial cobra só o consumido. Teto do Workspace por dia: `daily_credit_cap` (50). O Monitoramento automático roda uma vez por dia por Monitoramento e confere o teto da varredura automática.

## Segredos e passos manuais

## O modelo dos passos de IA

Os passos que classificam texto (notícia de recuperação judicial ou de expansão de planta, diário oficial) usam o modelo escolhido por `SIGNALS_LLM_PROVIDER` (`hermes`, `openai` ou `regra`; o padrão é `regra`). Ver `supabase/functions/README.md` e `_shared/cascata-de-sinais/llm-seletor.ts`. Com `hermes`, a função enfileira o pedido e espera o worker até o prazo da classificação; sem resposta a tempo, o passo cai na regra de palavra-chave.

Ver "Passos do Nan" no PR da frente: `functions deploy signal-cascade`, os segredos acima e a execução real de cada actor antes de `set_signal_cascade_state(..., 'available')`.
