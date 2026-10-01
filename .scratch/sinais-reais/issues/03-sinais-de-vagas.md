# 03: Sinais de vagas (LinkedIn e Indeed Brasil)

**What to build:** os tipos de Sinal do catálogo de lançamento: Vaga aberta no LinkedIn (curious_coder/linkedin-jobs-scraper, filtro por empresa) e vaga no Indeed Brasil (valig/indeed-jobs-scraper), com as vagas repetidas removidas por empresa e cargo. Cada tipo ganha o formulário de Monitoramento que já existe na Demonstração e passa a rodar de verdade.

**Blocked by:** 02: Monitoramento real.

**Status:** closed

## Pode mexer

- A transformação do resultado do actor em Sinal, num módulo por tipo, com teste sem rede.
- O cadastro do tipo no registro de actors.
- `supabase/functions/signal-runner/adaptadores.ts` (onde o adaptador do tipo entra) e o mapa `projeto-althius-frontend/src/fonte/sinais-reais-mapa.ts`.
- `projeto-althius-frontend/src/fonte/composicao.ts`, só para liberar o módulo Sinais no Workspace operacional.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar um ticket daqui avisa o Nan.
- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [x] Cada tipo testado com um resultado de exemplo do actor, sem dado pessoal real (`adaptadores/vagas.test.ts`, no formato do README de cada actor).
- [x] Validado em execução real (30/09/2026, Nan, Nubank) e custo registrado: `vaga_linkedin` 50 vagas e 21 Sinais; `vaga_indeed` 92 vagas e 42 Sinais. Os dois liberados no registro (`available`).
- [x] Com o primeiro actor marcado `available` no registro, o módulo Sinais sai de `indisponiveis` no Workspace operacional (`composicao.ts`), e o card do tipo mostra "Disponível"; o motivo da última falha (`ultimaFalha`) aparece no Monitoramento.

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
3. Rodar a execução real de cada tipo com uma Conta de verdade (troque nome, domínio e página do LinkedIn):
   ```powershell
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-sinais-reais.ts vaga_linkedin
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-sinais-reais.ts vaga_indeed
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
- Vagas: `adaptadores/vagas.ts` (formulário "vagas", filtro e chave), `vaga-linkedin.ts` (busca pública com o nome da Conta e cada função, `f_TPR` do período; a vaga só vale quando a empresa é a Conta: página do LinkedIn, site ou nome sem a forma jurídica) e `vaga-indeed.ts` (o actor só busca por texto: nome da Conta no país, e o empregador precisa ser a Conta). Até 50 vagas do LinkedIn (cerca de US$ 0,10 por Conta; o Free cobra US$ 2 por 1.000, não US$ 1 como dizia a pesquisa) e 100 do Indeed (cerca de US$ 0,01).
- Vagas repetidas: a chave é a mesma nas duas fontes (`vaga|empresa|cargo|ano`, com o cargo sem marca de gênero e "Sr." por extenso), e `private.record_signal` trata a família `vaga|` como um acontecimento só entre `vaga_linkedin` e `vaga_indeed` (migration `20260930220000_sinais_de_vagas.sql`, pgTAP `sinais_de_vagas.sql`). O ano na chave deixa o mesmo cargo reaberto no ano seguinte contar de novo (era o mês até a execução real, abaixo).
- Frontend: card "Vagas no Indeed" (Vagas e equipes) no mapa; `sinaisDisponiveis` lê o registro e o `aplicativo.tsx` libera o módulo Sinais quando o primeiro actor está "disponível" (no mesmo desenho da checagem das Conversas); "Última rodada: <motivo>" embaixo de cada Monitoramento.
- Decisões a confirmar: (1) `aplicativo.tsx` e `record_signal` não estavam no "Pode mexer", mas o critério de liberar o módulo e o "vagas repetidas removidas" os pedem; (2) o teste antigo `completar-sinais-externos.test.tsx` contava 41 tipos externos e passou a 46 (os 5 cards novos aprovados pelo Nan): é a única linha de teste antigo alterada.
- Conferência visual (Demonstração, 1400×900 e 360px): [card Vagas no Indeed](prints/03-catalogo-vagas-no-indeed.jpg), [família Anúncios e card do Google Maps](prints/03-catalogo-anuncios.jpg), [catálogo a 360px](prints/03-catalogo-360.jpg).
- **Execução real 1 (30/09/2026, Nan): `vaga_linkedin` com o Nubank** (`nubank.com.br`, `linkedin.com/company/nubank`, Brasil, 90 dias, sem filtro de função). O actor devolveu 50 vagas com os campos `id`, `link`, `title`, `companyName`, `companyLinkedinUrl`, `location`, `postedAt`, `descriptionText`, `seniorityLevel`, `employmentType`, `jobFunction` (29 de 50), `salary`, `applicantsCount` e outros; não vieram `postedAtTimestamp` nem `companyWebsite` (o adaptador não depende deles). O adaptador tirou 21 Sinais, todos de vagas do Nubank, com data, local e chave (`vaga|nubank|<cargo>|2026-09`). A busca com `f_TPR=r7776000` e `location=Brazil` foi aceita.
- Na mesma execução: o `signal-scan` recusava a chave `service_role` legada (corrigido na PR https://github.com/Kauedz/Althius/pull/109), e o custo ficou em branco porque o endpoint síncrono não devolve `x-apify-run-id` (corrigido na PR seguinte, que lê o id da última execução do actor).
- **Execução real 2 (30/09/2026, Nan): `vaga_indeed` com o Nubank** (Brasil, sem período no Indeed porque 90 dias passa dos 14 que ele aceita). 92 vagas com `key`, `url`, `title`, `datePublished`, `dateOnIndeed`, `location.city`, `employer.name` (91 de 92), `employer.corporateWebsite`, `description.text` e os `attributes` por código. O adaptador tirou 42 Sinais, todos do Nubank. A comparação com a execução 1 mostrou o LinkedIn datando em setembro vagas que o Indeed data em julho e agosto ("Staff Software Engineer | NuPay": 24/09 contra 28/07): com o mês na chave, a mesma vaga contaria duas vezes. A chave passou a levar o ano.

- 01/10/2026: os 9 Sinais do lançamento estão `available` no registro. Ticket fechado (todos os critérios marcados).
