# Validação do Contexto da empresa (ticket 08)

Matriz de resultados e evidências do percurso site → Contexto da empresa → Mercado → Aderência → Especialistas,
conferida em 07/11/2026 na branch `contexto-da-empresa-03-onboarding`, sobre os tickets 01 a 07.

Legenda: **ok** = comprovado por teste que rodou nesta máquina ou por conferência registrada aqui; **ok (CI)** =
coberto por pgTAP, que roda só no CI (sem Docker nesta máquina); **pendente** = depende de um passo humano (seção
"Passos do Nan" no fim). Capturas em `issues/prints/08-*.jpg` (Playwright, 1400×900, Demonstração).

O percurso é coberto em duas partes que se encontram no contexto vigente: a parte de tela (onboarding, Configurações,
Mercado, Aderência e Agente) pela Demonstração no navegador e pelo vitest; a parte de servidor (site → textos → filtros →
busca → Aderência → Especialidades) pelo teste Deno `percurso.test.ts`. A vigência, as permissões e a concorrência são
do banco e ficam no pgTAP. O smoke `e2e/` roda contra a produção e não foi executado.

## 1. Percurso ponta a ponta

| Etapa | Resultado | Evidência |
| --- | --- | --- |
| Onboarding: empresa e site iniciam a geração sem outra confirmação | ok | navegador: `08-onboarding-site.jpg`, `08-onboarding-checklist.jpg` ("Contexto da empresa — concluído"); vitest `onboarding.test.tsx` e `day0-operacional.test.tsx` (blocos "Contexto da empresa"); pgTAP `onboarding_do_contexto.sql` |
| Primeira geração fica vigente sozinha | ok (CI) | pgTAP `geracao_do_contexto_pelo_site.sql` ("a primeira geração fica vigente sem aprovação"); vitest `contexto-da-empresa-geracao.test.tsx` |
| Configurações mostra site, Gerar, três textos e Salvar | ok | vitest `contexto-da-empresa.test.tsx`; `08-configuracoes-contexto.jpg` |
| Texto vira filtros por perfil, ligados ao trecho, com pendentes à vista | ok | Deno `company-context-generation/percurso.test.ts` (novo); `account-discovery/preparacao.test.ts`; vitest `busca-pelo-contexto.test.tsx` |
| Ajustes na busca não alteram o contexto salvo | ok | `percurso.test.ts` (passo 3); vitest `busca-pelo-contexto.test.tsx` |
| Busca registra versão e filtros usados; deduplica recortes | ok | `percurso.test.ts` (passo 4); `account-discovery/busca-por-perfis.test.ts` |
| Aderência não confirma requisito sem verificar e cita o contexto da busca | ok | `08-aderencia-a-verificar.jpg`; `percurso.test.ts` (passo 5); `account-fit-explanation/handler.test.ts`; pgTAP `aderencia_pelo_contexto.sql`; vitest `aderencia-pelo-contexto.test.tsx` |
| As quatro Especialidades recebem o mesmo contexto vigente, com a versão | ok | `percurso.test.ts` (passo 6); `_shared/orquestracao-contexto.test.ts`; pgTAP `agentes_pelo_contexto.sql` |

O teste `percurso.test.ts` encadeia os módulos de verdade (leitura do site, `gerar`, handler `account-discovery` com
`prepare` e `search`, `avaliarAderencia`, `contextoDaEmpresa`), com site, IA e fornecedor controlados. Ele começa em
`gerar` e põe a primeira versão como vigente à mão, porque essa regra é do banco.

## 2. Estados e situações de borda

| Situação | Resultado | Evidência |
| --- | --- | --- |
| Etapa do site pulada; retomada em Configurações | ok + ok (CI) | pgTAP `onboarding_do_contexto.sql` (pulo, site informado depois); vitest `onboarding.test.tsx`, `aviso-do-contexto-pendente.test.tsx` |
| Leitura insuficiente: falha clara, nada inventado, nem chega ao motor | ok | `avaliacao.test.ts` (caso `site-insuficiente`); pgTAP "site insuficiente é falha, sem texto inventado"; `percurso.test.ts` (sem contexto → Mercado leva às Configurações) |
| Erro na leitura: motivo, tentar de novo, escrever à mão, vigente preservada | ok | `handler.test.ts`; vitest `contexto-da-empresa-geracao.test.tsx`, `day0-operacional.test.tsx`; pgTAP "a falha conserva a versão vigente" |
| Edição manual vira vigente na hora | ok + ok (CI) | pgTAP `contexto_da_empresa.sql` ("a versão nova fica vigente"); vitest `contexto-da-empresa.test.tsx` |
| Regeneração aceita / descartada | ok + ok (CI) | pgTAP ("aceitar grava a sugestão como versão 2", "descartar conserva a versão vigente"); vitest; `08-nova-sugestao.jpg` e, no navegador, descartar manteve a "Versão 1" |
| Concorrência: resposta atrasada não sobrescreve edição; repetição não grava em dobro | ok (CI) + ok | pgTAP ("a resposta atrasada vira sugestão", "uma versão só, mesmo com a resposta repetida", "aceitar de novo não cria outra versão"); vitest "a corrida" |
| Filtros de versão antiga não rodam | ok | `percurso.test.ts` (2º teste); `busca-por-perfis.test.ts`; vitest "quando o contexto mudou" |
| Erro de tradução ≠ busca vazia ≠ fonte fora do ar | ok | `percurso.test.ts` (3º teste); vitest "zero resultados e falha da fonte aparecem diferentes" |
| Só o Administrador altera; leitura isolada por Workspace | ok (CI) | pgTAP `contexto_da_empresa.sql`, `geracao_do_contexto_pelo_site.sql`, `agentes_pelo_contexto.sql` ("o Sul... nunca o contexto do Norte") |

## 3. Conferência visual contra a tela AI Context do Clay

Feita na Demonstração (`npm run dev`, porta 5179) em 07/11/2026, com Playwright a 1400×900, sem erro no console.
É parcial: a tela do Clay não foi reaberta (exige a conta do Clay) e a comparação usa a descrição registrada na spec
(inspeção autenticada de 04/11/2026).

| Item da referência | Resultado | Captura |
| --- | --- | --- |
| Domínio + ação de gerar no topo | ok: "Site da empresa" e "Gerar" | `08-configuracoes-contexto.jpg` |
| Três campos de texto grandes: Empresa, Perfil de cliente ideal, Personas | ok: os únicos campos da tela, além do site | `08-configuracoes-contexto.jpg`, `08-icp-primario-e-secundario.jpg` |
| Salvar explícito | ok: único outro botão da tela | `08-salvar.jpg` |
| Primário e secundários dentro do texto de ICP | ok: "ICP primário" e "ICP secundário" no mesmo campo, sem cards | `08-icp-primario-e-secundario.jpg` |
| Sem Playbook, campos firmográficos ou aprovação por perfil | ok: `/configuracoes/playbook` leva ao Contexto; nenhum texto "Playbook" na tela | — |
| Nova geração como sugestão, vigente preservada; descartar mantém a versão 1 | ok | `08-nova-sugestao.jpg` |
| Mercado: filtros preenchidos por perfil, trecho de origem, "não aplicado pela fonte", ajuste só para esta busca | ok | `08-filtros-do-mercado.jpg`, `08-filtros-pendentes.jpg` |
| Aderência com critério "a verificar na qualificação" | ok | `08-aderencia-a-verificar.jpg` |
| Agente mostra o Contexto vigente (versão 1), sem editar | ok | `08-agente-com-contexto.jpg` |

Observação fora do escopo: em telas estreitas, a linha expandida de uma
Descoberta acompanha a rolagem horizontal da tabela e o texto aparece cortado à esquerda (layout anterior a esta spec).

## 4. Qualidade da geração (rubrica da spec)

Seis casos em `supabase/functions/company-context-generation/__fixtures__/sites.ts`: SaaS (`saas-de-cobranca`),
indústria (`industria-de-embalagens`), consultoria (`consultoria-tributaria`), empresa nova (`empresa-nova`), vários ICPs
(`varios-icps`) e site insuficiente (`site-insuficiente`).

Rubrica automática:

- Textos (`conferirRubrica`): oferta reconhecida, companhias plausíveis, personas, nada proibido (clientes, números e
  nomes inventados), número mínimo de ICPs.
- Filtros (`conferirFiltros`, novo): o ICP gerado passa pela preparação real do Mercado com o mesmo modelo. Falha grave
  quando um filtro de funcionários, faturamento ou porte é aplicado (nenhum site dá esses números: seria hipótese sem
  base), ou quando um dado da empresa analisada vira filtro dos compradores (sede ou atuação no local da equipe ou da
  fábrica). Também
  aponta perfil que o Mercado não consegue buscar e recortes a menos que o caso pede.
- Sem modelo (CI): `avaliacao.test.ts` confere as páginas que chegam ao motor e as duas rubricas.

As expectativas de cada caso (`esperado` nos fixtures, inclusive `proibidoNosFiltros`) foram escritas pelo agente e
ainda precisam da revisão de uma pessoa (passo 1 do Nan), como a spec pede.

Com o modelo de verdade: **pendente** (passo 2 do Nan). Não há chave do motor nesta máquina, e mocks não bastam para
julgar a qualidade. Preencher a tabela abaixo a partir do relatório gerado pelo script:

| Caso | Oferta | Companhias | Personas | Fatos × inferências | Sem invenção | Texto × filtros | Falha grave? | Revisor/data |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| saas-de-cobranca | | | | | | | | |
| industria-de-embalagens | | | | | | | | |
| consultoria-tributaria | | | | | | | | |
| empresa-nova | | | | | | | | |
| varios-icps | | | | | | | | |
| site-insuficiente | n/a | n/a | n/a | n/a | | n/a | | |

Falhas impeditivas (a funcionalidade não está pronta enquanto alguma aparecer): confundir a empresa com os compradores,
inventar evidência, ou criar restrição obrigatória sem base.

## 5. Preservação e regressões

| Item | Resultado | Evidência |
| --- | --- | --- |
| Contas-alvo, histórico e versões do Playbook preservados | ok (CI) | pgTAP `retirada_do_playbook.sql` ("as versões do Playbook continuam guardadas", "o mini-ICP do onboarding continua guardado") |
| Especialidades e Sequências funcionando | ok | Deno `_hermes-worker/*`, `ferramentas-dos-agentes-sequencia.test.ts`; vitest `gerar-sequencia.test.tsx`, `criacao-em-lote-de-sequencias.test.tsx`, `sequencias.test.tsx` |
| Checks do projeto | ver "Checks" abaixo | — |

## 6. Defeitos

Nenhuma falha local encontrada nesta validação; nenhum defeito exige mudar os contratos dos tickets 01 a 07.

Comportamento conferido e mantido: um número que a IA inventa para um perfil (o texto não o diz) não vira faixa; fica
pendente como "o texto não determina um valor exato", à vista e sem filtrar.

## Checks

Rodados nesta máquina em 07/11/2026 (resultado no comentário do ticket 08): `deno test supabase/functions`, `deno check`,
`npm run lint`, `tsc -b` e `vitest run`. Em 08/11/2026, os oito arquivos pgTAP relacionados à spec passaram
com 247/247 asserções em transações com rollback na pré-produção, incluindo os ajustes dos testes de Agentes e
Propostas de resposta. Essa validação é separada do CI do PR.

## Passos do Nan

1. Revisar as expectativas dos seis casos em `supabase/functions/company-context-generation/__fixtures__/sites.ts`
   (`esperado`: o que cada texto precisa reconhecer, o que é proibido nos textos e nos filtros) e anotar aqui quem
   revisou e quando, ou o que mudar.
2. Avaliar com o modelo de verdade e revisar (PowerShell, na raiz do repositório; a chave fica só na sessão do terminal):

   ```powershell
   $env:OPENAI_API_KEY = Read-Host -Prompt 'Chave da OpenAI' -MaskInput
   $env:OPENAI_MODEL = '<o mesmo modelo configurado nas Edge Functions>'
   deno run --allow-env --allow-net --allow-write=.scratch scripts/avaliar-contexto-da-empresa.ts --saida=.scratch/contexto-da-empresa/avaliacao.md
   Remove-Item Env:OPENAI_API_KEY
   ```

   Leia `.scratch/contexto-da-empresa/avaliacao.md`, preencha a tabela da seção 4 e registre a decisão. O script sai com
   código 1 quando algum caso tem falha grave. `Read-Host -MaskInput` pede o PowerShell 7.
3. Conferir a tela AI Context do Clay com a conta do Clay, lado a lado com `issues/prints/08-configuracoes-contexto.jpg`,
   se quiser confirmar a comparação da seção 3 além da descrição da spec.
4. Seguir a [ordem de publicação](#ordem-de-publicação). Este ticket não traz migration nem função nova.

## Ordem de publicação

Esta sequência consolida os passos dos tickets 01 a 08 para o projeto `ycbdilsmydvzezhlymty`. A versão de transição
de `account-discovery` atende tanto ao frontend publicado, que chama `criteria`, quanto ao frontend novo, que chama
`prepare` e busca por perfis.

1. Confirmar a aprovação do PR e o CI verde no commit que será publicado. Conferir o histórico remoto e validar as
   migrações e os pgTAP com rollback, conforme [o procedimento do repositório](../../docs/agents/migrations.md).
2. Aplicar em ordem as migrações `20261221000000` a `20261221040000`. Conferir as versões e os hashes no histórico
   remoto. A primeira cria `get_company_context`, usada por `account-discovery` e `signal-plan`.
3. Na raiz do checkout revisado, publicar as funções abaixo. Reiniciar o worker do Hermes com o código novo após
   publicar `agent-conversation`, conforme o [README do worker](../../supabase/functions/_hermes-worker/README.md).
   O `reply-proposal-runner` novo aceita a resposta antiga do banco enquanto a última migração ainda está pendente.

   ```powershell
   npx supabase functions deploy company-context-generation --project-ref ycbdilsmydvzezhlymty
   npx supabase functions deploy account-fit-explanation --project-ref ycbdilsmydvzezhlymty
   npx supabase functions deploy agent-conversation --project-ref ycbdilsmydvzezhlymty
   npx supabase functions deploy signal-plan --project-ref ycbdilsmydvzezhlymty
   npx supabase functions deploy reply-proposal-runner --project-ref ycbdilsmydvzezhlymty
   ```

4. Publicar somente `account-discovery` do commit de transição `47b66d7f`, em outro checkout. Conferir que a
   versão implantada responde a `criteria` pelo frontend atual e a `prepare` com uma sessão autorizada.

   ```powershell
   git worktree add --detach ../althius-transicao-contexto 47b66d7f
   Push-Location ../althius-transicao-contexto
   try {
     npx supabase functions deploy account-discovery --project-ref ycbdilsmydvzezhlymty
     if ($LASTEXITCODE -ne 0) { throw 'Falha ao publicar account-discovery de transição' }
   } finally {
     Pop-Location
   }
   ```

5. Após confirmar que o `reply-proposal-runner` novo está ativo, aplicar `20261221050000_retirada_do_playbook.sql`,
   ainda antes do merge. Conferir o hash no histórico e os avisos de segurança do Supabase. O runner antigo espera
   a chave `playbook`, que a migração substitui por `contexto`.
6. Fazer o merge e aguardar o auto-publish. Conferir na aplicação publicada que o Mercado usa `prepare` e que o
   onboarding usa `company-context-generation`. Só então publicar `account-discovery` do checkout revisado e,
   se desejado, remover `icp-site-read`. Durante a transição, manter `icp-site-read` disponível para o onboarding
   antigo.

   ```powershell
   npx supabase functions deploy account-discovery --project-ref ycbdilsmydvzezhlymty
   # Opcional, depois de confirmar o onboarding publicado:
   npx supabase functions delete icp-site-read --project-ref ycbdilsmydvzezhlymty
   ```
