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

- [x] O ICP do Day0 e a edição do ICP em Configurações mostram e gravam Setor, Porte e Região, e `get_my_workspace_icp` devolve os valores gravados. No Day0 operacional o bloco "ICP do Workspace" fica no último passo, só para a pessoa criadora (Vitest `day0-operacional.test.tsx`, `supabase-onboarding.test.ts`); em Configurações > Playbook > ICP, o bloco "Campos do ICP" (Vitest `playbook.test.tsx`, `supabase-playbook.test.ts`); leitura de volta por `get_my_workspace_icp` no pgTAP `campos_estruturados_do_icp.sql`.
- [x] Só um Administrador ativo grava os campos. Cada gravação cria uma versão nova do ICP e mantém o texto livre, o Playbook e os campos do Day0 da versão vigente (pgTAP: Membro e pessoa de fora recebem 42501; campos preservados; mesmos valores não criam versão). O Membro vê os campos só para leitura (Vitest).
- [x] Porte só aceita as faixas e os portes legais conhecidos, e um valor fora da lista é recusado (pgTAP 22023; a tela recusa antes de chamar o banco, Vitest).
- [x] Com o domínio confirmado, a Fonte real chama `icp-site-read` ao confirmar o domínio e pré-preenche os campos sem sobrescrever o que já foi salvo; sem motor ou com falha, a leitura fica como "falhou" e nada é inventado (Vitest `supabase-onboarding.test.ts`).
- [x] `icp-site-read` só lê o domínio confirmado do Workspace da pessoa criadora, não grava nada e não devolve texto cru do modelo, erro de fornecedor nem custo (Deno `icp-site-read/handler.test.ts`: 401, 403 para outro domínio e para convidado, redirecionamento para fora recusado, saída inválida vira `null`). A chamada real em produção é conferida pelo smoke e2e depois do deploy, sem gravar nada.
- [x] Um Workspace com ICP só em texto livre recebe uma sugestão única dos três campos, que só preenche os campos ao clicar em "Usar sugestão" e só é gravada em "Salvar campos". Nenhum campo preenchido é sobrescrito (Vitest `campos-do-icp.test.ts` e `playbook.test.tsx`).
- [x] Com os campos preenchidos, uma Candidata de Sinal de mercado ganha Nível de Aderência alto, médio ou baixo, e não mais "sem dado"; a tela segue mostrando só o nível (pgTAP: a1 alto, a2 baixo, Workspace vizinho intocado; `aderencia_candidatas_sinais_mercado.sql` segue verde).
- [x] O ICP chega aos critérios do Plano do Sinal, não só à explicação (achado do smoke 06 do PR #307): com o Briefing sem lugar, a geografia do ICP vira `localizacao` (Deno `signal-plan/icp-nos-criterios.test.ts` e `handler.test.ts`), e o smoke 06 passa a exigir `localizacao = ["Brasil"]` com o ICP do QA.
- [ ] pgTAP: só Administrador grava; isolamento por Workspace; porte inválido recusado; Aderência por lista e por faixa de funcionários; `supabase test db` verde no job "Banco" do CI deste PR. Marcar com o link do run quando verde.
- [ ] Deno, Vitest, lint e build verdes localmente (Deno 1.885 testes, Vitest 2.045, com 1 teste de `gaveta-de-historico` instável sob carga que passa sozinho, lint e build ok); CI verde nos três jobs deste PR. Marcar com o link do run quando verde.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration e publica a `icp-site-read`.

## Comments

### 27/10/2026

- Migration `20261217150000_campos_estruturados_do_icp.sql`: `private.normalize_icp_field` (lista sem repetidos, até 20 itens de até 80 caracteres), `public.save_my_workspace_icp_fields` (só Administrador; porte nas faixas e portes legais; versão nova só quando muda; copia o resto da versão vigente) e `private.score_market_discovery_icp` redefinida para listas e faixas de funcionários, com recálculo das Candidatas existentes. pgTAP `campos_estruturados_do_icp.sql` (20 asserções).
- Edge Function nova `icp-site-read` (`verify_jwt = true`, README próprio e entrada no índice de funções).
- Frontend: bloco "ICP do Workspace" no Day0 operacional; "Campos do ICP" em Configurações > Playbook > ICP; `lerSite` real com os estados lendo, pronta e falhou, iniciado ao confirmar o domínio.
- `signal-plan`: a geografia do ICP vira o critério `localizacao` quando o Briefing não fala de lugar (achado do smoke 06). O smoke 06 e o `globalSetup` do e2e passam a usar a RPC nova e a conferir os critérios.

Decisões conservadoras (para o Kauê confirmar):
1. Sem coluna nova: os três campos são listas separadas por vírgula nas colunas que já existem.
2. Porte só nas faixas da busca de contas e nos portes legais; "médio" ou "51 a 200 funcionários" são recusados.
3. Só o Administrador grava os campos direto; o Membro só lê, sem fluxo de proposta.
4. A leitura do site é só da pessoa criadora do Workspace, só do domínio confirmado e só da página inicial.
5. `icp-site-read` usa o motor dos Sinais; com `SIGNALS_LLM_PROVIDER` em `regra` ou vazio, devolve `leitura: null` e a pessoa preenche.
6. `icp-site-read` não tem limite diário próprio (só a pessoa criadora e só o domínio confirmado podem pedir). Se o custo do motor pesar, um limite como o do `signal-plan` entra num ticket seguinte.
7. A sugestão para quem já tem ICP é determinística, a partir do texto livre, sem modelo, e só preenche os campos ao clicar.
8. Na Aderência, setor, porte e região pesam igual e batem por qualquer item da lista.
9. No Plano do Sinal só a geografia vira critério, e só no nível de país (as opções de `localizacao`); setor e porte ficam no prompt e na Aderência. UF e região como critério de Plano pedem mudar `private.validate_signal_plan`, o formulário e o runner, num ticket próprio.
