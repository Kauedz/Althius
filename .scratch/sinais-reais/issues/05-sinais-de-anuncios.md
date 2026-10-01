# 05: Sinais de anúncios ativos (Meta e LinkedIn)

**What to build:** os tipos de Sinal do catálogo de lançamento: Conta anunciando na Meta (curious_coder/facebook-ads-library-scraper) e no LinkedIn (silva95gustavo/linkedin-ad-library-scraper), ligando a Conta à página ou ao anunciante antes de buscar. Cada tipo ganha o formulário de Monitoramento que já existe na Demonstração e passa a rodar de verdade.

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

- [x] Cada tipo testado com um resultado de exemplo do actor, sem dado pessoal real (`adaptadores/anuncios.test.ts`).
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
3. Rodar a execução real de cada tipo com uma Conta de verdade (troque nome, domínio e página do LinkedIn):
   ```powershell
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-sinais-reais.ts anuncio_meta
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-sinais-reais.ts anuncio_linkedin
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
- "Ligar a Conta ao anunciante antes de buscar" sem tabela nova: as bibliotecas buscam por nome, e o anúncio só conta quando o anunciante é a Conta (a mesma página do LinkedIn, o link de destino no domínio da Conta ou o nome sem a forma jurídica; na dúvida, não é). Um Sinal por campanha nova (anunciante e mês de início), não por anúncio, para o foguinho não inflar (`adaptadores/anuncios.ts`).
- `anuncio-meta.ts`: busca da biblioteca por palavra-chave com o nome da Conta, só ativos, no país, desde o início do período; até 30 anúncios (cerca de US$ 0,02 por Conta). `anuncio-linkedin.ts`: busca pelo anunciante (`accountOwner`) com o nome, país e período, com detalhes (a data de início vem da página do anúncio); até 20 (cerca de US$ 0,08). A URL da empresa acharia só a Conta, mas não filtra data nem país.
- Nenhuma migration neste ticket: o registro muda só depois da execução real (`registro-apos-o-teste.sql`).
- Frontend: família nova "Anúncios" com os cards "Anunciando no LinkedIn" e "Anunciando na Meta" e o formulário "anuncios" (Localização, Período e Palavras no anúncio).
- A confirmar na execução real: os nomes de campo da saída da Meta (o README só mostra uma tabela); os parâmetros `custom-date-range`/`startdate` do LinkedIn; se `availability.start` vem também sem detalhes (daria para ligar `skipDetails` e cortar o custo pela metade).
- **Execução real da Meta (01/10/2026, Nan, Nubank, `--max-itens` padrão):** `anuncio_meta` trouxe 30 anúncios com `ad_archive_id`, `page_id`, `page_name`, `start_date`, `is_active` e `snapshot` (`body.text`, `link_url`, `cards[]`, `title`), os campos que o adaptador lê: 3 Sinais (um por mês de início de campanha: julho, agosto e setembro de 2026). Liberado no registro (versão 2.7.26, teto US$ 0,05). **Custo:** nas duas execuções de 30 anúncios o Apify cobrou só o início (US$ 0,00005) e contou 0 anúncios cobrados (`accountedChargedEventCounts` com `apify-default-dataset-item: 0`), mesmo com o evento `ad` a US$ 0,00075 na tabela. Não sei dizer por quê. O custo gravado no banco confere com o que o Apify reporta, e o teto do registro segue o preço de tabela. Com `--max-itens` menor que o `count` da entrada, o actor devolve um item `error`: vale só para o script de validação, em produção os dois são 30.
- **Anunciando no LinkedIn (01/10/2026, Nan, Nubank):** a busca por anunciante rodou e voltou com 0 anúncios (custo: 2 inícios de execução, US$ 0,0001). Não sei se a Nubank não anunciou lá nos últimos 30 dias ou se a busca por nome não achou; falta repetir com uma empresa que se sabe que anuncia no LinkedIn. Segue `testing`.
- **Anunciando no LinkedIn, segunda tentativa (01/10/2026, Nan, Microsoft, `J5yfmdcQOxKTPj74Y`):** de novo 0 anúncios (custo: 2 inícios de execução, US$ 0,0001; nenhum evento de anúncio cobrado). As duas buscas usaram `countries=BR` com período de 90 dias (`dateOption=custom-date-range`). O exemplo do README do actor usa `countries=US` e `dateOption=last-30-days`. O actor ganhou o build 1.2.3 em 30/09/2026 23:09 UTC (o registro previa 1.2.2). Não sei se a Biblioteca de anúncios do LinkedIn tem anúncios para o Brasil ou se o formato de data personalizado não funciona. Próximo teste: `--pais "Estados Unidos" --periodo "Últimos 30 dias"` (opções novas do script), e depois só o período de 30 dias no Brasil. Segue `testing`.
- Conferência visual: [cards de Anúncios](prints/03-catalogo-anuncios.jpg) e [formulário de anúncios](prints/05-formulario-anuncios.jpg).
