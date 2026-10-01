# 04: Sinais de movimentação de pessoas (LinkedIn)

**What to build:** os tipos de Sinal do catálogo de lançamento: Contato mudou de emprego ou foi promovido (harvestapi/linkedin-profile-scraper, comparando com a leitura anterior), nova liderança (harvestapi/linkedin-profile-search), entradas e saídas (harvestapi/linkedin-company-employees) e anúncio público de movimentação (harvestapi/linkedin-post-search), com cargos brasileiros classificados. Cada tipo ganha o formulário de Monitoramento que já existe na Demonstração e passa a rodar de verdade.

**Blocked by:** 02: Monitoramento real.

**Status:** ready-for-human

## Pode mexer

- A transformação do resultado do actor em Sinal, num módulo por tipo, com teste sem rede.
- O cadastro do tipo no registro de actors.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar um ticket daqui avisa o Nan.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Cada tipo testado com um resultado de exemplo do actor, sem dado pessoal real (`adaptadores/movimentacao.test.ts`).
- [ ] Validar numa execução real (a IA prepara; roda com o `APIFY_TOKEN` do Supabase) e registrar o custo observado. **Preparado:** `scripts/validar-sinais-reais.ts`; falta o Nan rodar.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

Os passos 1 e 2 são os mesmos nos tickets 03 a 06: faça uma vez só.

1. Com a PR mergeada, publicar as funções (na raiz do repositório). As migrations a IA aplica no remoto antes do merge
   (`docs/agents/migrations.md`):
   ```powershell
   cd "$HOME\Althius"
   git checkout main
   git pull
   npx supabase functions deploy signal-runner --project-ref ycbdilsmydvzezhlymty
   npx supabase functions deploy signal-scan --project-ref ycbdilsmydvzezhlymty
   ```
2. No mesmo PowerShell, a chave `service_role` (painel do Supabase › Project Settings › API Keys, a chave legada; nunca no chat) e o id de um Workspace de teste:
   ```powershell
   $env:SUPABASE_SERVICE_ROLE_KEY = "<cole aqui, só no PowerShell>"
   $env:ALTHIUS_WORKSPACE_ID = "<id do Workspace>"
   ```
3. Rodar a execução real de cada tipo com uma Conta de verdade (troque nome, domínio e página do LinkedIn; para `mudanca_de_emprego`, acrescente `--contato https://www.linkedin.com/in/<perfil>` de um ou mais Contatos):
   ```powershell
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-sinais-reais.ts mudanca_de_emprego
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-sinais-reais.ts nova_lideranca
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-sinais-reais.ts entradas_e_saidas
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-sinais-reais.ts anuncio_de_movimentacao
   ```
   Cada linha leva `--nome "Empresa" --dominio empresa.com.br --linkedin https://www.linkedin.com/company/empresa`. O script mostra os campos que vieram (sem valores), os Sinais que o adaptador tirou e o comando SQL do custo. Os itens brutos ficam em `validacao-sinais\` (fora do Git). Cole na conversa só os campos e a quantidade de Sinais.
4. Para cada tipo que passou (os campos vieram e os Sinais fazem sentido), rodar no SQL Editor o bloco dele em `.scratch/sinais-reais/registro-apos-o-teste.sql`: grava preço, versão e teto e marca o actor "disponível". O primeiro "disponível" libera o módulo Sinais no Workspace operacional.
5. No app, criar um Monitoramento de teste com a Conta real e conferir o Sinal (e, se houver, o motivo da última rodada embaixo dele).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Feito na PR https://github.com/Kauedz/Althius/pull/108 (os tickets 03 a 06 juntos). Falta a execução real (Passos do Nan).
- Os esquemas de entrada, os READMEs (com o exemplo de saída) e os preços vigentes de cada actor foram lidos na API pública do Apify em 30/09/2026 (`GET /v2/acts/{actor}` e `GET /v2/actor-builds/{build}`); os adaptadores usam esses nomes de campo, leem de forma defensiva o que o README não mostra, e os actors seguem `testing` até a execução real (passo do Nan). Não houve execução real nesta sessão: o token do Apify fica só no Supabase.
- `handler.ts` do `signal-runner`: `entrada` e `sinais` recebem a hora da varredura, e `sinais` também os critérios; a Conta sem o dado que o actor precisa (`SemDadoParaVarrer`) é pulada antes de abrir a varredura, sem reservar crédito, e o motivo aparece no Monitoramento ("Contas sem a página da empresa no LinkedIn ficaram de fora: Beta.") e na busca de Sinais.
- Preço, versão e teto não entram por migration (o pgTAP do ticket 01 fixa o registro "em branco até alguém conferir"): ficam em `.scratch/sinais-reais/registro-apos-o-teste.sql`, que o Nan roda por actor depois da execução real.
- Contatos na varredura (decisão do Nan em 30/09/2026): `claim_due_signal_monitors` e `claim_signal_rescans` redefinidas a partir da última definição, com `contatos` em cada Conta (id e perfil do LinkedIn, só vínculo ativo, Contato não arquivado e perfil `/in/`, até 25), pela função `private.signal_scan_contacts` (migration `20260930221000_sinais_de_movimentacao.sql`, pgTAP `sinais_de_movimentacao.sql`).
- Adaptadores (`adaptadores/cargos.ts` classifica cargos brasileiros e ingleses, com marca de gênero): `mudanca-de-emprego.ts` (perfil dos Contatos; o cargo atual precisa ter começado no período; os dois cargos na Conta é promoção, o atual na Conta é chegada, o anterior na Conta e o atual fora é mudança de empresa), `nova-lideranca.ts` (pessoas com cargo atual na página da Conta e `recentlyChangedJobs`, modo Full, uma página de busca), `entradas-e-saidas.ts` (menos de 1 ano na Conta; **só entradas**: saídas pedem comparar leituras, e o actor não filtra ex-funcionários) e `anuncio-de-movimentacao.ts` (posts recentes de autores da Conta com termos de movimentação; só vira Sinal com cargo de liderança ou dos escolhidos). O LinkedIn dá só mês e ano do início: o cargo vale quando o mês cruza o período, com a data no dia 1º.
- Custos por Conta na faixa Free (API pública): mudança de emprego até US$ 0,10 (25 perfis); nova liderança cerca de US$ 0,20 (página + 25 perfis Full); entradas cerca de US$ 0,10; anúncio de movimentação até US$ 0,08.
- Frontend: card "Anúncio público de movimentação" (Movimentação profissional) no mapa.
- A confirmar na execução real: `queries` aceita a URL inteira do perfil; o perfil curto do company-employees traz a data de início (senão, trocar para Full, cerca de US$ 0,22); `authorsCompanies` aceita a URL da página.
- O card "Anúncio público de movimentação" em Movimentação profissional é provado em `paginas/sinais/sinais-do-lancamento.test.tsx`; o formulário é o de pessoas, que já existia.
- **Execução real (30/09/2026, Nan, Nubank):** `entradas_e_saidas` trouxe 3 perfis curtos com as posições em `currentPositions[]` e o início em `startedOn` (não em `currentPosition[].dateRange.start`, como o README mostrava): 0 Sinais até a correção da PR https://github.com/Kauedz/Althius/pull/111, 3 depois (chegadas de liderança em julho e agosto). Liberado no registro. `anuncio_de_movimentacao` trouxe 23 posts (`content`, `author.*`, `postedAt.timestamp`, `type`) e 0 Sinais: a conferir se nenhum era anúncio de cargo de liderança. `nova_lideranca` rodou (21 perfis) e o resultado ainda não voltou.
- **Execução real (01/10/2026, Nan, o próprio perfil como Contato):** `mudanca_de_emprego` aceitou a URL inteira do perfil em `queries` e trouxe as posições em `experience[]` e `currentPosition[]` (`position`, `companyName`, `companyLinkedinUrl`, `companyUniversalName`, `companyId`, `startDate` e `endDate` como objeto): 1 Sinal de Chegada, com o cargo atual e o mês de início lidos do perfil (julho de 2026). Liberado no registro (versão 0.0.135, teto US$ 0,12).
- O custo dessas execuções ficou em zero ou em branco: nos actors que cobram por evento, o `usageTotalUsd` é só o uso da plataforma. O cálculo passou a somar os eventos cobrados (`chargedEventCounts` × preço do evento).
- Mesmo somando os eventos (signal-scan versão 10), a execução de 01/10/2026 gravou custo 0. O motivo ainda não foi confirmado. Agora o signal-scan grava no log (`type: apify_cost`) os nomes dos campos e os números da cobrança de cada execução, e relê uma vez, 3 s depois, a execução de actor que cobra por evento quando ela vem sem nenhum evento. Se seguir sem eventos, o custo fica em branco, não 0. O signal-runner lê uma vez só.
- **Causa confirmada (01/10/2026, execução P0cwNVHU0vRPqyAnT, log `apify_cost`):** logo depois de a execução terminar, o Apify ainda não fechou a conta (`usageTotalUsd` 0, sem eventos); 3 s depois, `usageTotalUsd` 0,004 e `profile: 1`. O `usageTotalUsd` já inclui os eventos, então a soma da PR https://github.com/Kauedz/Althius/pull/112 contava duas vezes (gravou US$ 0,008). Agora o custo é o maior entre o `usageTotalUsd` e a soma dos eventos, e o signal-runner também relê em 3 s (uma Conta nova só começa até 72 s). Custo real de 1 perfil: US$ 0,004, o preço do registro.

