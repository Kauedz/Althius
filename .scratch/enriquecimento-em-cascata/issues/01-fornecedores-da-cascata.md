# 01: Fornecedores da cascata

**What to build:** a lista ordenada de fornecedores de dados da Althius (actors do Apify de LinkedIn e da Receita Federal primeiro; fornecedores pagos depois), cada um com o que devolve e o custo, e o contrato único que a cascata chama.

**Blocked by:** None.

**Status:** ready-for-agent (reduzido: teste e limpeza da cascata, Origem do Contato aceito, script de validação e promoção em `discovery_actors`; o custo de cada tentativa é duplicado de B1, B2 e B3 da `prospeccao-funcional`)

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

1. Escolher e contratar os fornecedores pagos de e-mail e telefone; as chaves vão só nos segredos do Supabase.

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
