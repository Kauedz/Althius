# 01: Fornecedores da cascata

**What to build:** a lista ordenada de fornecedores de dados da Althius (actors do Apify de LinkedIn e da Receita Federal primeiro; fornecedores pagos depois), cada um com o que devolve e o custo, e o contrato único que a cascata chama.

**Blocked by:** None.

**Status:** ready-for-human (o código do agente está pronto: teste e limpeza da cascata, Origem do Contato aceito e o script de validação. Falta o Nan aplicar a migration e rodar o script. Depois, um agente escreve a promoção em `discovery_actors` só dos actors com execução real registrada. O custo de cada tentativa e a Origem do revelar fecham com o B3 da `prospeccao-funcional`.)

## Pode mexer

- Um módulo de cascata em `supabase/functions/_shared/`, com cada fornecedor por injeção de dependência.

## Não mexa

- Nas funções `save_target_account`, `create_contact`, `update_contact`, `link_contact` e `end_contact_link` (frente de Conexões) sem combinar.
- Nas Edge Functions `sender-accounts` e `unipile-account-status`, nos segredos `UNIPILE_*` e no Webhook Endpoint.
- Em testes existentes: um ticket só acrescenta testes.

## Critérios

- [ ] A cascata para no primeiro que acha; cada tentativa tem custo registrado.
- [ ] Dado vindo de fornecedor grava a Origem do campo (CONTEXT) e não sobrescreve correção manual.

## Passos do Nan

**A IA que executar este ticket avisa o Nan, com os comandos prontos para o PowerShell, antes de declarar o ticket pronto. Nunca pula um passo manual, nunca pede chave ou senha no chat e nunca roda no remoto o que é do Nan. Com muitos passos, gera um wizard (`/wizard`).**

1. ~~Escolher e contratar os fornecedores pagos de e-mail e telefone; as chaves vão só nos segredos do Supabase.~~ Fora: fornecedor pago não entra na cascata da Althius (decisão do Nan de 01/10, confirmada pelo Renan em 08/10).
2. Com o CI do PR verde, aplicar `supabase/migrations/20261009040000_origem_do_contato_aceito.sql` no projeto `ycbdilsmydvzezhlymty` pelo `execute_sql` do MCP do Supabase (ou colando o mesmo bloco no SQL Editor do painel), num bloco atômico, como manda `docs/agents/migrations.md`. Depois publicar a função, na raiz do repositório e sem `--no-verify-jwt`:

   ```powershell
   npx supabase functions deploy account-enrichment --project-ref ycbdilsmydvzezhlymty
   ```

   A publicação não muda nada visível: os stubs que saíram não devolviam nada. Pode ir junto com a do B3.
3. Rodar o script nos dois fins que o B1 e o B2 já corrigiram. Depois que o B3 entrar na `main`, rodar o `revelar_contato`: antes disso, a entrada do actor ainda é a antiga. As execuções gastam da conta do Apify da Althius, no máximo US$ 0,35 somando os tetos dos três actors. O token é digitado no `Read-Host` e não fica no histórico:

   ```powershell
   $env:APIFY_TOKEN = Read-Host "Token do Apify da Althius"
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-enriquecimento-real.ts cnpj_receita --cnpj <CNPJ de uma Conta real>
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-enriquecimento-real.ts buscar_pessoas --nome "<Empresa>" --linkedin https://www.linkedin.com/company/<empresa> --limite 5
   # Só depois do B3 na main:
   npx deno run --allow-net --allow-env --allow-read --allow-write scripts/validar-enriquecimento-real.ts revelar_contato --perfil https://www.linkedin.com/in/<pessoa>
   Remove-Item Env:APIFY_TOKEN
   ```

4. Colar na conversa, de cada fim, o id da execução, o custo, os campos e as contagens que o script mostra. Nunca colar o arquivo de `validacao-enriquecimento/` nem o token. Com isso, um agente escreve a migration que promove a `available` só os actors que devolveram dado.

Regras gerais em [`docs/visao-geral-da-plataforma.md`](../../../docs/visao-geral-da-plataforma.md), seção 4.

## Comments

- **Decisão do Nan (2026-10-01):** a base do enriquecimento (e dos Sinais) é o **Apify**, com os actors que a Althius instala: dados da Receita Federal, LinkedIn e scraping da internet. Apollo, Lusha e similares muitas vezes não trazem dados de empresa brasileira.
- Os fornecedores pagos (Apollo, Lusha, Snov.io, Hunter.io...) **não entram na cascata da Althius**: o cliente os conecta nos Agentes dele, pelas Conexões, e os Agentes buscam lá com a conta do cliente. A cascata própria começa só com os actors do Apify.
- Para construir: escolher os actors (Receita Federal por CNPJ, perfil do LinkedIn) e validar cada um numa execução real, como os Sinais 03 e 04 fizeram; precisa de uma sessão com o Network access do Apify liberado.

- 2026-10-07 (reconciliação contra a `main` 59e53a6):
  - Critério 1, parcial. Parar no primeiro que acha: `CascataProvedorDeContatos` em `supabase/functions/_shared/provedor-de-contatos.ts:290-321`, sem teste (o teste do handler injeta o `ApolloProvedorStub` direto, `account-enrichment/handler.test.ts:189-192`). A cascata padrão traz stubs de Apollo, Lusha e Clay (`account-enrichment/handler.ts:337-343`, `provedor-de-contatos.ts:224-279`), contra a decisão de 01/10 de que fornecedor pago não entra. O custo de cada tentativa não é gravado em nenhum ramo (`handler.ts:240-248`; o `runId` some em `provedor-de-contatos.ts:120-125,183-188`): isso é duplicado de B1, B2 e B3, que gravam o custo da Receita, do comitê e do revelar.
  - Critério 2, parcial. O gatilho `track_contact_field_sources` (`20260929150000:247-273`) marca `manual` quando há `auth.uid()` (`:254`). No revelar, a origem sai `automatico` só porque a chamada vem do cliente admin (`account-enrichment/index.ts:129-136`): o B3 cobre isso. No comitê, `accept_proposed_contact` cria o Contato com a sessão (`20261001190000_enriquecimento_e_comite.sql:401-408`), e nome, cargo e LinkedIn vindos do Apify ficam `manual`. Na Receita, `legal_identifier` (`:79`) também fica `manual`. Não há pgTAP de origem.
  - Validação real: os 3 actors de enriquecimento seguem `testing` (`20261001170000_descoberta_de_contas_pelo_icp.sql:268-279`) e não há registro de execução em `.scratch/`. Enquanto isso, `begin_committee_discovery` recusa quem não é Administrador (`20261001190000:151-153`). Nenhum ticket promove `discovery_actors` (o A3 só trata os actors de Sinal).
  - Testes rodados: `deno test --allow-all supabase/functions/account-enrichment/` → 9 passed; `deno test --allow-all supabase/functions/account-discovery/` → 32 passed; pgTAP `enriquecimento_e_comite.sql` e `custos_por_acao.sql` ok no CI 37707955273.
  - Falta (agente): teste da cascata; tirar os stubs pagos da cascata padrão; a Origem `automatico` nos campos do Contato aceito do comitê e no `legal_identifier` da Receita, com pgTAP; um script de execução real dos actors de enriquecimento (o `scripts/validar-sinais-reais.ts` só roda os 9 Sinais); a migration que promove em `discovery_actors` os validados, com pgTAP. Perguntas ao Nan antes: tirar os stubs de Apollo, Lusha e Clay? O Contato aceito do comitê fica com origem `automatico`?
  - Depois (humano): rodar o script novo com o token do Apify no PowerShell (a chave não entra no chat) e aplicar a migration conforme `docs/agents/migrations.md`. Ordem: depois de B2 e B3, para validar a entrada já corrigida.

- 2026-10-08 (branch `enriquecimento/01-fornecedores-da-cascata`, a partir da `main` 7929a2b):
  - Decisões do Renan: (a) os stubs de Apollo, Lusha e Clay saem da cascata padrão. As classes continuam exportadas porque `account-enrichment/handler.test.ts` importa o `ApolloProvedorStub`. (b) No Contato novo aceito do comitê, nome, cargo e LinkedIn ficam `automatico`; o e-mail e o telefone digitados no aceite ficam `manual`. (c) O `legal_identifier` gravado pela Receita fica `manual`: o CNPJ vem da própria Conta ou a pessoa o digita no modal (`comite-e-enriquecimento.tsx:46`); a Receita só confirma.
  - Cascata: `fornecedoresDaCascata` (`_shared/provedor-de-contatos.ts`) é a lista ordenada, só com o Apify, e fica vazia sem o Apify; o `handler.ts` a usa. A cascata não engole mais a falha: quem falha não para a cascata, mas, se nenhum fornecedor acha, a primeira falha volta, em vez de lista vazia ou null. É a regra do B2 e do B3: falha não é "não encontrado". Isso não muda nada em produção hoje: o comitê (B2) e o revelar (B3) chamam o actor direto, e o `revelarContato` do Apify na `main` não lança.
  - Origem: `20261009040000_origem_do_contato_aceito.sql` redefine `accept_proposed_contact` a partir de `20261008223000` (B2) e acrescenta só o update de origem no Contato novo. O timestamp fica depois do `20261009030000` do B3 e do `20261009010000` dos créditos. Nenhuma função da lista "Não mexa" mudou.
  - Script: `scripts/validar-enriquecimento-real.ts` roda um fim (`cnpj_receita`, `buscar_pessoas`, `revelar_contato`) com o mesmo adaptador da Edge Function, direto no Apify. Ele mostra a entrada (com uma marca no lugar do perfil e do CNPJ do teste), o id da execução, o custo, os campos (sem valores) e as contagens. Os itens brutos vão para `validacao-enriquecimento/`, que entrou no `.gitignore`. Conferido com a API do Apify simulada: nenhum valor dos itens sai na tela.
  - Arquivos fora do "Pode mexer": `account-enrichment/handler.ts` e `index.ts` (os stubs e dois comentários), a migration, o pgTAP, o script e o `.gitignore`. Todos vêm da lista "Falta (agente)" de 07/10 e das decisões do Renan de 08/10.
  - Critério 1: parar no primeiro que acha está provado (`_shared/provedor-de-contatos.test.ts`, 10 testes: acha no segundo, nenhum acha, falha no meio, falha sem ninguém achar, a lista padrão). O custo de cada execução já é gravado na `main` pela Receita (B1) e pelo comitê (B2). O do revelar vem com o B3, ainda fora da `main`. Por isso a caixa fica aberta.
  - Critério 2: comitê e Receita provados no pgTAP `origem_do_contato_aceito.sql` (`plan(12)`): origem `automatico` nos três campos do actor e `manual` nos digitados; o Contato que já existe não é sobrescrito e mantém a origem `manual`; outro Workspace não aceita a proposta; o CNPJ digitado fica `manual`; o mesmo CNPJ não troca a origem. Só as três asserções `automatico` falham sem a migration; as outras nove fixam o que já valia. A Origem do revelar está no pgTAP do B3. A caixa fica aberta até o B3 entrar.
  - Testes: `deno test supabase/functions` 757 passed, 0 failed. `deno check supabase/functions/*/index.ts` e `deno check scripts/validar-enriquecimento-real.ts` exit 0. pgTAP do zero no Postgres 16 local (`scripts/pgtap-local.sh`): os 63 arquivos ok. O Vitest não rodou: nenhum arquivo do frontend mudou.
  - Depois do B3: o B3 cria `contact_field_sources.provider`, preenchido pelo aviso `althius.provedor_da_coleta`. O aceite do comitê pode dar esse aviso com o actor da proposta, para o provedor também ficar gravado. Fica para o enriquecimento 02 ou um ticket pequeno. No merge do B3, o comentário do revelar em `handler.ts` ("a cascata engolia a exceção") fica desatualizado: a cascata agora devolve a falha.
  - Merge de teste com `ralph/B3-revelar-email` (520d180): sem conflito; Deno de `account-enrichment` e da cascata, 34 passed; pgTAP `origem_do_contato_aceito.sql` 12/12, `revelar_email_so_cobra_valor_novo.sql` 29/29 e `persona_do_contato_no_comite.sql` 16/16.
  - Falta (humano): os passos 2 a 4 acima. Falta (agente, depois do passo 4): a migration que promove em `discovery_actors` só os actors com execução real registrada (id da execução e dado devolvido, como no A3), com pgTAP.
