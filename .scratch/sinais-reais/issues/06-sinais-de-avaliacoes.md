# 06: Sinais de avaliações no Google Maps

**What to build:** os tipos de Sinal do catálogo de lançamento: Avaliações novas ou negativas (compass/google-maps-reviews-scraper): queda de nota e reclamações repetidas, sem guardar dado pessoal de quem avaliou. Cada tipo ganha o formulário de Monitoramento que já existe na Demonstração e passa a rodar de verdade.

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

- [x] Cada tipo testado com um resultado de exemplo do actor, sem dado pessoal real (`adaptadores/avaliacoes-google-maps.test.ts`, inclusive um teste de que nenhum dado do avaliador chega ao Sinal).
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
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-sinais-reais.ts avaliacoes_google_maps
   ```
   Cada linha leva `--nome "Empresa" --dominio empresa.com.br --linkedin https://www.linkedin.com/company/empresa`. O script mostra os campos que vieram (sem valores), os Sinais que o adaptador tirou e o comando SQL do custo. Os itens brutos ficam em `validacao-sinais\` (fora do Git). Cole na conversa só os campos e a quantidade de Sinais.
4. Para cada tipo que passou (os campos vieram e os Sinais fazem sentido), rodar no SQL Editor o bloco dele em `.scratch/sinais-reais/registro-apos-o-teste.sql`: grava preço, versão e teto e marca o actor "disponível". O primeiro "disponível" libera o módulo Sinais no Workspace operacional.
5. No app, criar um Monitoramento de teste com a Conta real e conferir o Sinal (e, se houver, o motivo da última rodada embaixo dele).

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- Os esquemas de entrada, os READMEs (com o exemplo de saída) e os preços vigentes de cada actor foram lidos na API pública do Apify em 30/09/2026 (`GET /v2/acts/{actor}` e `GET /v2/actor-builds/{build}`); os adaptadores usam esses nomes de campo, leem de forma defensiva o que o README não mostra, e os actors seguem `testing` até a execução real (passo do Nan). Não houve execução real nesta sessão: o token do Apify fica só no Supabase.
- `handler.ts` do `signal-runner`: `entrada` e `sinais` recebem a hora da varredura, e `sinais` também os critérios; a Conta sem o dado que o actor precisa (`SemDadoParaVarrer`) é pulada antes de abrir a varredura, sem reservar crédito, e o motivo aparece no Monitoramento ("Contas sem a página da empresa no LinkedIn ficaram de fora: Beta.") e na busca de Sinais.
- Preço, versão e teto não entram por migration (o pgTAP do ticket 01 fixa o registro "em branco até alguém conferir"): ficam em `.scratch/sinais-reais/registro-apos-o-teste.sql`, que o Nan roda por actor depois da execução real.
- `adaptadores/avaliacoes-google-maps.ts`: busca do Maps pelo nome da Conta sem a forma jurídica, avaliações mais novas desde o início do período, em pt-BR, só do Google, **`personalData: false`**, até 50 por lugar e 100 no total (até US$ 0,06 por Conta). O lugar só é a Conta pelo site (sites de terceiros como Instagram e iFood não contam) ou pelo nome, aceitando a unidade depois de um separador ("Acme - Unidade Centro").
- Sinais: queda de nota (pelo menos 5 avaliações no período e média 1,0 estrela ou mais abaixo da nota geral), reclamações repetidas (3 negativas no mesmo assunto: atendimento, demora, preço, qualidade, entrega, limpeza, sistema, cancelamento e as palavras do Monitoramento) e muitas negativas (5 ou mais e metade das avaliações do período); um por lugar, assunto e mês. A evidência tem números, o lugar e no máximo 2 trechos de 120 caracteres; nunca nome, id, foto ou URL do avaliador nem da avaliação.
- Nenhuma migration neste ticket: o registro muda só depois da execução real.
- Frontend: card "Avaliações no Google Maps" (Reputação e concorrência) com o formulário "avaliacoes" (Nota da avaliação, começando em "Até 2 estrelas", Período e Assuntos das reclamações).
- A confirmar na execução real: que a busca por nome brasileiro acha o lugar certo (senão, acrescentar a cidade); quantos lugares o actor raspa numa lista; o campo do site do lugar.
- Conferência visual: [card](prints/03-catalogo-anuncios.jpg) e [formulário de avaliações](prints/06-formulario-avaliacoes.jpg).
