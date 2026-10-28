# 16: Preencher os campos estruturados do ICP (setor, porte e região)

**Status:** ready-for-human

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo.

**Blocked by:** 01 (ICP estruturado único), 05 (Aderência nas empresas achadas por Sinais)

**Decisões:** D5 (um ICP estruturado único, preenchido no onboarding e editável depois, que ranqueia o catálogo, alimenta o `signal-plan` e dá o Nível de Aderência às empresas achadas por Sinais) da ADR-0033; [ADR-0002](../../../docs/adr/0002-permissoes-ler-propor-executar.md) (a pessoa decide) e [ADR-0006](../../../docs/adr/0006-aderencia-como-classificacao-unica.md) (Aderência como classificação única).

## Problema

A auditoria de 27/10 mostrou que o ticket 05 está no ar, mas não tem efeito: a Aderência das Candidatas trazidas por Sinais compara a empresa com `sector`, `company_size` e `geography` do ICP estruturado único (`private.workspace_icp_versions`, migration `20261214102000`), e nada no produto preenche esses três campos. Toda Candidata sai "sem dado".

Além disso, o onboarding não lê o site do Cliente: na Fonte real (`src/fonte/supabase-onboarding.ts`) `lerSite` devolve sempre nenhum resultado, então o item 1 do checklist fica em branco mesmo com o domínio confirmado no Day0.

O fluxo alvo da frente é: a pessoa informa o site, o ICP sai dele, o agente cria o Sinal, o Apify acha as empresas, a Aderência compara com o ICP único, depois vêm a Sequência e o envio. Sem esses três campos, o passo da Aderência não acontece.

## Solução

- **Campos estruturados na tela.** O item 1 do checklist do onboarding (Day0) e a edição do ICP em Configurações passam a ter três campos: **Setor**, **Porte** e **Região**. Ficam nas mesmas colunas de hoje (`sector`, `company_size`, `geography`), sem coluna nova, gravados como listas curtas separadas por vírgula. Porte usa só as faixas que a busca de contas já conhece (`FAIXAS_DE_PORTE`: 1-10, 11-50, 51-200, 201-500, 501-1000, 1001-5000, 5001-10000, 10001+) e os portes legais (MEI, ME, EPP, DEMAIS). Uma RPC nova, aditiva, grava os três campos como uma nova versão do ICP, copiando o resto da versão vigente. Só um Administrador ativo grava direto, como no ticket 02. `get_my_workspace_icp` e `save_my_day0` não mudam de contrato.
- **Leitura do site no servidor.** Uma Edge Function nova (`icp-site-read`, `verify_jwt = true`) lê só a página inicial do domínio confirmado no Day0 do Workspace, sem seguir links para fora dele e com prazo e tamanho limitados, e pede ao motor que já existe (`escolherLlmDosSinais`, o mesmo do `signal-plan`, sem fornecedor pago novo) uma sugestão de: o que vende, mini-ICP, por que compram, Personas, Setor, Porte e Região. A função não grava nada. A Fonte real chama essa função em `lerSite`, e a sugestão pré-preenche os campos pelo `aplicarLeitura`, sem sobrescrever o que a pessoa editou. A pessoa confirma ao salvar. Sem motor ligado, ou se a leitura falhar, nada é inventado e os campos ficam como estão.
- **Workspaces que já existem.** Quando o ICP vigente tem texto livre e os três campos estão vazios, a edição do ICP oferece uma sugestão única, tirada do texto livre pela mesma regra determinística que a busca de contas já usa (`criteriosDoIcp`), sem chamar modelo. A sugestão só vira versão nova quando a pessoa confirma. Nada é gravado sozinho e nenhum campo preenchido é sobrescrito.
- **Aderência usa os campos.** A nota de `private.score_market_discovery_icp` passa a entender as listas: um setor ou uma região batem quando qualquer item da lista bate, e o porte bate pela faixa de funcionários (`employee_count` dentro de alguma faixa escolhida) ou pelo rótulo de porte igual a um item. Uma versão nova do ICP já recalcula as Candidatas pelo gatilho do ticket 05. A tela continua mostrando só o nível, nunca a nota.

## Pode mexer

- Migration nova (RPC de gravação dos três campos e redefinição de `private.score_market_discovery_icp` a partir da última definição na `main`) e pgTAP em `supabase/tests/`.
- Edge Function nova `supabase/functions/icp-site-read/` (com README, testes Deno e entrada em `supabase/config.toml`), reaproveitando `_shared/cascata-de-sinais` e `_shared/cors.ts`.
- `projeto-althius-frontend/src/fonte/` (onboarding, Playbook/ICP) e as telas do checklist do onboarding e da edição do ICP em Configurações, com testes.

## Não mexa

- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais (`canal-*`, `integration-*`, `slack-*`): área do Renan.
- O worker do Hermes (`_hermes-worker`) e a `agent-conversation`.
- Migrations já aplicadas.
- A classificação de Aderência em Contas-alvo já existentes e a condição Quente.
- Nada aceita Candidata, cria Conta-alvo ou cobra crédito neste fluxo.

## Critérios

- [ ] O item 1 do checklist do onboarding e a edição do ICP em Configurações mostram e gravam Setor, Porte e Região, e `get_my_workspace_icp` devolve os valores gravados.
- [ ] Só um Administrador ativo grava os campos. Cada gravação cria uma versão nova do ICP e mantém o texto livre, o Playbook e os campos do Day0 da versão vigente.
- [ ] Porte só aceita as faixas e os portes legais conhecidos, e um valor fora da lista é recusado.
- [ ] Com o domínio confirmado, `lerSite` da Fonte real chama `icp-site-read` e pré-preenche o item 1 sem sobrescrever o que a pessoa editou. Sem motor, ou se a leitura falhar, nada é inventado.
- [ ] `icp-site-read` só lê o domínio confirmado do Workspace da pessoa, não grava nada e não devolve texto cru do modelo, erro de fornecedor nem custo.
- [ ] Um Workspace com ICP só em texto livre recebe uma sugestão única dos três campos, que só é gravada depois da confirmação. Nenhum campo preenchido é sobrescrito.
- [ ] Com os campos preenchidos, uma Candidata de Sinal de mercado ganha Nível de Aderência alto, médio ou baixo, e não mais "sem dado". A tela segue mostrando só o nível.
- [ ] pgTAP: só Administrador grava; isolamento por Workspace; porte inválido recusado; Aderência por lista e por faixa de funcionários; três `supabase db reset && supabase test db` verdes.
- [ ] Deno, Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e publica a `icp-site-read`.

## Comments

### 27/10/2026

Implementados a RPC aditiva dos campos estruturados do ICP, a normalização de listas e a pontuação de Aderência por listas/faixas; adicionados a Edge Function `icp-site-read`, sua configuração/documentação, e a integração inicial das fontes do onboarding com a leitura e gravação. Typecheck, testes Vitest dos seams de onboarding e `deno check` da nova função passaram. A migration e o pgTAP ainda precisam de `db reset`/CI; a função precisa ser publicada após a revisão humana.
