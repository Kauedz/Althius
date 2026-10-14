# Equipes e Publicações (PR-8)

Dois cards da família de Vagas e equipes / Presença pública ganham coletor próprio no `signal-runner`:
"Crescimento ou redução de equipes" (`crescimento-de-equipes`, tipo técnico `crescimento_de_equipes`) e "Publicações da
empresa" (`publicacoes-da-empresa`, tipo técnico novo `publicacao_da_empresa`).

## Actors (API pública do Apify, 14/10/2026, sem execução)

| Tipo | Actor | Build | Preço | Limite por Conta | Teto do registro |
| --- | --- | --- | --- | --- | --- |
| `crescimento_de_equipes` | `harvestapi~linkedin-company` (o actor de página de empresa do LinkedIn que as cascatas já usam) | 0.0.44 | US$ 0,004 por empresa, mais US$ 0,00005 por execução | 1 empresa (`maxItems` 1): cerca de US$ 0,004 | US$ 0,02 |
| `publicacao_da_empresa` | `harvestapi~linkedin-company-posts` (cerca de 14 mil usuários) | 0.0.53 | US$ 0,002 por post, mais US$ 0,00005 por execução; reações e comentários desligados | 10 posts (`maxPosts`/`maxItems` 10): cerca de US$ 0,02 | US$ 0,05 |

Os dois entram "em teste", sem preço nem versão; o `signal-runner` não roda actor em teste. Enquanto isso, o tipo
genérico `crescimento_de_equipes` continua atendido pela cascata `cruzando_faixa_de_headcount`, como hoje.

## Foto mensal de headcount

Tabela `private.account_headcount_snapshots (workspace_id, target_account_id, taken_on, headcount, source)`, uma foto por
Conta e dia (a rodada mensal grava uma por mês), RLS ligada e sem acesso dos papéis do app; só o servidor lê e grava,
por funções que conferem que a Conta é do Workspace. Só a contagem que a página da empresa informa: nenhum dado de pessoa.

## Regra "Equipe crescendo" (`crescimento_de_equipes`)

A base é a foto mais antiga dos últimos 90 dias (antes de hoje). Dispara quando:

1. o headcount cresceu **10% ou mais e 5 pessoas ou mais** no período; ou
2. cresceu menos que isso (mas cresceu) e há **3 ou mais vagas abertas** no mesmo período (Sinais `vaga_linkedin` e
   `vaga_indeed` da Conta nos últimos 90 dias): as vagas reforçam.

As vagas abertas entram também na frase da regra 1, como conferência. Frase: "Equipe passou de 40 para 47 pessoas em 90
dias, com 4 vagas abertas". Sem foto anterior, a primeira rodada só grava a base. Chave: um Sinal por Conta e mês.

## Publicações (`publicacao_da_empresa`)

Posts da página da empresa no LinkedIn no período (sem repostagens, sem reações nem comentários), classificados em
expansão, nova unidade, contratação, investimento, certificação ou irrelevante pelo modelo dos Sinais que a plataforma já
usa (`SIGNALS_LLM_PROVIDER`, o mesmo das cascatas; `AGENT_PROVIDER` não muda). Sem modelo ligado, ou se ele falhar, vale a
regra de palavra-chave. Só o post não irrelevante vira Sinal, um por post. O custo do modelo vai para `action_costs` junto
com a execução (linha `<run>:modelo`).

## Preço

2 créditos por Conta varrida (Faixa 2), os dois cards já custam 2; `publicacao_da_empresa` entra em `collector_types` do
card para `credits_per_account` devolver 2. Custo real em `private.action_costs` (`record_signal_scan_cost`).

## Fora

Conectores, segredos, deploy, aplicar migração, merge, mudanças de tela (os cards continuam como estão até a validação),
`AGENT_PROVIDER`.
