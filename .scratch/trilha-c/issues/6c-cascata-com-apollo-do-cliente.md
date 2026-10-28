# 6c: Cascata com Apollo do Cliente

**Status:** done (PR aberto; deploy de `account-enrichment` após o merge)

**GATE:** Depois do merge, publicar `account-enrichment` e qualquer Edge Function que importe `provedor-de-contatos.ts`. Se houver migration, fazer backup e aplicar antes do merge.

## Problema

O enriquecimento em cascata já usa a base Apify, mas ainda não consulta o Apollo conectado pelo Workspace. A decisão 3 determina Apify como base e Apollo/CRM conectado como fontes extras, sem cobrar Créditos Althius quando o dado vier da conexão do Cliente.

## Solução

Adicionar um provedor Apollo real por meio da camada existente de acesso a Integrações, incluir Apollo e um seam tipado de CRM na cascata, preservar Apify como primeira fonte e distinguir fonte Althius de conexão do Cliente no fluxo de reserva, liquidação e liberação.

## Pode mexer

- `supabase/functions/_shared/provedor-de-contatos.ts` e teste
- `supabase/functions/account-enrichment/` e testes
- uso somente de leitura de `_shared/integration-access.ts` e `_shared/integracoes/*`; helper pequeno somente se inevitável, com teste
- migration aditiva e pgTAP no intervalo `20261218000000..20261218005959`, somente se estritamente necessária

## Não mexa

- `agent-conversation/`, `_shared/ferramentas-dos-agentes.ts`, `_hermes-worker`
- `integration-connect`, `integration-callback`, `conexoes.tsx`, frontend e preços em `credit_action_prices`
- banco remoto, segredos, deploy, migrations existentes ou ações destrutivas

## Critérios de aceite

- [x] Verificação inicial confirma o aceite da Descoberta: `descobertas.tsx` chama Comitê e Receita após `accept_discovered_account`; `supabase-descobertas.ts` mantém o RPC do aceite.
- [x] `ApolloProvedorDeContatos` usa o Acesso do Workspace via `integration-access` (`chamarFerramenta`, `decisaoDaPessoa`, regra do Administrador vale), busca por domínio (ou nome) e cargos com `apollo_people_search` e marca a origem `apollo`.
- [x] Revelação Apollo (`apollo_people_enrichment`) devolve só e-mail válido com origem `apollo`; telefone continua recusado e nem chama o Apollo.
- [x] A cascata é Apify, depois Apollo (só quando a pessoa tem Acesso ao Apollo no Workspace) e o seam de CRM; falha do Apollo segue para a próxima fonte; sem conexão ou com a leitura falhando, segue só o Apify como antes.
- [x] Resultado Apify cobra pela regra existente; resultado Apollo/CRM grava e libera a reserva (`private.is_customer_contact_source`, migration 20261218003000); nenhum resultado libera.
- [x] Origem LGPD: `source_provider`/`source_actor` = `apollo` no comitê e `provider` = `apollo` no e-mail revelado, pelos caminhos de gravação existentes.
- [x] Testes Deno: Apify acha (Apollo não é chamado), Apify vazio e Apollo acha (origem apollo, custo do Apify gravado), Apollo ausente, leitura das conexões falhando, Apify falha + Apollo não acha (falha volta). pgTAP `contatos_da_conexao_sem_cobranca.sql`: e-mail do Apollo debita 0, do Apify cobra; comitê com 1 Apify + 2 Apollo liquida 1.
- [ ] CI e smoke/deploy (gate).

## Comments

- 28/10/2026 — Verificação inicial: o aceite chama `accept_discovered_account`; em seguida `paginas/descobertas.tsx` chama `fonteDeContas.buscarComite` quando `committee = liberado` e `enriquecerReceita` quando há CNPJ. Os payloads são `comite-compra` e `cnpj-receita` na fonte de Contas.
- 28/10/2026 — Decisão de cobrança a confirmar com Kauê: achado pela Apify liquida Créditos Althius; achado pela conexão Apollo/CRM libera a reserva e o Cliente paga o próprio provedor.
- 28/10/2026 — Para a Trilha B (agente): ações `cnpj-receita` (`workspaceId`, `targetAccountId`, `cnpj`, `requestKey`), `comite-compra` (`workspaceId`, `targetAccountId`, `companyName`, `companyDomain`, `companyLinkedinUrl`, `cargos`, `limite`, `requestKey`) e `revelar-contato` (`workspaceId`, `contactId`, `canal: "email"`, `requestKey`; telefone é recusado). O agente pode chamar as três ações quando expostas pelo wrapper de ferramentas.
- 28/10/2026 — CRM: não foi encontrado nesta leitura um executor existente de busca de pessoa por organização no caminho de Integrações; permanece seam tipado para o próximo ticket.
- 28/10/2026 — Revisão da Trilha C: os nomes de ferramenta do Codex (`search_people`, `enrich_person`) não existem no MCP do Apollo; trocados pelos do MCP do Apollo (`apollo_people_search`, `apollo_people_enrichment`) e o resultado MCP (texto JSON ou estruturado) passou a ser lido. O handler monta a cascata por chamada com a pessoa e o Workspace; o index só inclui o Apollo quando `integration_access_for_use` acha o Acesso. Sem a migration o Apollo cobraria como Apify: a cobrança é decidida no banco. Regra de cobrança a confirmar com o Kauê; validação real depende de um Workspace com Apollo conectado.
