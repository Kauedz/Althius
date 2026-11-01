# Spec: Desfazer o Sinais first (os 4 Agentes voltam, o ICP volta a ser o do Playbook)

**Status:** open (decidido pelo dono do produto em 31/10/2026; [ADR-0034](../../docs/adr/0034-desfazer-sinais-first.md) aceita)

**Frente:** Agentes, Sinais e ICP. Guia geral: [`docs/visao-geral-da-plataforma.md`](../../docs/visao-geral-da-plataforma.md). Decisão central: [ADR-0034](../../docs/adr/0034-desfazer-sinais-first.md), que substitui a [ADR-0033](../../docs/adr/0033-sinais-first.md). Voltam a valer por inteiro: [ADR-0004](../../docs/adr/0004-coordenacao-sem-quinto-agente.md), [ADR-0005](../../docs/adr/0005-agentes-criados-a-partir-de-especialidades.md) e o trecho "Continua" da [ADR-0032](../../docs/adr/0032-agente-de-sinal-e-agente-de-contas.md). Spec que está sendo desfeita: [`.scratch/sinais-first/`](../sinais-first/spec.md).

## Problema

O Sinais first (PRs #296, #298, #303, #304, #305, #308, #309, #310, #311 e #312, de 27/10/2026) escondeu Scopus, Ethos, Rhetor e Oraculum, fez o composer criar Sinais, transformou o catálogo em Modelos e criou um ICP estruturado único. Depois dele vieram cerca de 30 PRs: alguns construídos em cima dele (o agente único na `/`, as Fases 4 e 7, a Trilha C 5b e 6a/6b), outros independentes e funcionando (a cadência #344–#348, Gerar Sequência #317, busca pelo ICP #316, extrato por Sinal, telefone a 5 créditos, Sinal de mercado #322). O dono do produto não quer seguir com o Sinais first, mas não pode perder o que é independente.

Um `git revert` dos merges não serve: as migrations já estão aplicadas no remoto e os arquivos foram editados depois por outros PRs.

## Solução

Desfazer para a frente, em quatro blocos, cada um em tickets pequenos:

| Bloco | O que volta | Tickets |
| --- | --- | --- |
| A. A `/` e o composer | A `/` volta a ser a página dos 4 Agentes com o composer da Coordenação. O agente único sai da tela. O composer não classifica nem cria Sinal. | 01 |
| B. Os 4 Agentes | Barra lateral "Especialistas", grade, @menção, "Novo agente", páginas graváveis. Sequência volta a ser do Rhetor. | 02, 03 |
| C. Catálogo | Sem Modelos, Plano-semente, "Para o seu nicho" pelo ICP, "Usar o Modelo" e renomear pela interface. | 04 |
| D. ICP | Toda função lê o ICP do Playbook + mini-ICP do onboarding. O ICP estruturado único e o agente único saem do servidor. | 05, 06, 07, 08 |

## Regras

1. **Nada de `git revert`.** Cada ticket parte da `main` atual. O estado "de antes" de cada arquivo serve de referência (`git show <merge>^1:<arquivo>`), mas a volta é feita à mão, preservando o que os PRs posteriores acrescentaram ao mesmo arquivo.
2. **A cadência não pode quebrar.** Todo ticket roda, além dos seus testes, `_hermes-worker/cadencia-ponta-a-ponta.test.ts`, o pgTAP de Sequências e o smoke `e2e/tests/09-pedir-sequencia.spec.ts`, todos verdes.
3. **Migration só para a frente**, nunca editando uma já aplicada (`docs/agents/migrations.md`). Função existente é redefinida a partir da última definição na `main`.
4. **Nenhum dado apagado sem pedido.** Sem `drop table`, `truncate`, `delete` de linha, `drop column`, nem escrita em `auth.users` (AGENTS.md). Gatilhos e funções podem sair (`drop trigger`, `drop function`) porque não guardam dado, mas a migration diz cada um que remove. As tabelas `private.workspace_icp_versions`, `private.agente_*`, `private.signal_model_versions` e as colunas `signal_monitors.created_via` e `signal_requests.model_id` ficam no banco sem uso.
5. **O que veio depois e é independente fica**: o #317 (Sequência em Conta sem Sinal, sem exigir `quente`), o #322 (Sinal de mercado), o #316 (busca pelo ICP, agora pelo ICP do Playbook), o #326 (extrato por Sinal), o #342 (telefone a 5 créditos), o #341 (anexos no composer e Conexões no composer), a explicação da Aderência (#329/#333, agora com o ICP do Playbook) e a leitura de negócios ganhos do CRM (#337).
6. Os arquivos do Kauê (lista na [spec do Sinais first](../sinais-first/spec.md#arquivos-do-kauê)) só são tocados com "**Kauê:** precisa de aprovação do Kauê" no cabeçalho do ticket.
7. Mudança que exige o worker do Hermes reiniciado ou Edge Function publicada de novo nasce `needs-hermes` e traz "Passos do Nan".
8. Os testes que hoje afirmam o Sinais first (4 Agentes escondidos, composer cria Sinal, "Para o seu nicho", ICP estruturado) são atualizados ou removidos no mesmo ticket que muda o comportamento, nunca antes.

## Decisões a confirmar (com padrão recomendado)

- **Aderência das empresas achadas por Sinal.** Recomendado: `fit_level = 'sem_dado'` para `origin = 'sinal'`, como antes do #304. Alternativa: calcular contra o ICP do Playbook (precisa de um parser do texto do Playbook; fica fora deste escopo). Ticket 07.
- **Ler o site para sugerir o mini-ICP no onboarding** (`icp-site-read`, #308). Recomendado: manter como sugestão dos três campos do mini-ICP, sem Setor, Porte e Região. Ticket 06.
- **Apagar `workspace_icp_versions` e `agente_*`.** Recomendado: não apagar agora. Se o dono do produto quiser, abre-se um ticket à parte, com pedido explícito.

## Ordem dos tickets

| # | Ticket | Blocked by | Status | Hermes | Kauê |
| --- | --- | --- | --- | --- | --- |
| 01 | [A `/` volta a ser a página dos 4 Agentes](issues/01-raiz-volta-aos-quatro-agentes.md) | nenhum | ready-for-agent | não | não |
| 02 | [Os 4 Agentes voltam à interface](issues/02-quatro-agentes-voltam-a-interface.md) | 01 | ready-for-agent | não | não |
| 03 | [Sequência volta a ser do Rhetor](issues/03-sequencia-volta-ao-rhetor.md) | 02 | needs-hermes | sim | sim |
| 04 | [Catálogo sem Modelos e sem "Para o seu nicho"](issues/04-catalogo-sem-modelos.md) | 01 | ready-for-agent | não | não |
| 05 | [Servidor lê o ICP do Playbook](issues/05-servidor-le-o-icp-do-playbook.md) | nenhum | needs-hermes | sim | não |
| 06 | [Telas sem o ICP estruturado](issues/06-telas-sem-o-icp-estruturado.md) | 04 | ready-for-agent | não | não |
| 07 | [Banco sem o ICP estruturado](issues/07-banco-sem-o-icp-estruturado.md) | 05, 06, 08 | ready-for-agent | não | não |
| 08 | [Retirar o agente único do servidor](issues/08-retirar-o-agente-unico.md) | 01 | needs-hermes | sim | não |

01 e 05 podem correr em paralelo. 02, 04 e 08 dependem de 01 (mexem em `App.tsx`, `agentes.tsx` e `composer.tsx`). 07 é o último porque remove as funções que 05, 06 e 08 deixam de chamar.

## Testes

Cada ticket traz o seu. Antes de abrir o PR, em `projeto-althius-frontend`: `npm ci && npm run lint && npm test -- --run && npm run build`; `deno check` e `deno test` das funções tocadas; `supabase db reset && supabase test db`. CI verde nos três jobs e o smoke da cadência (09) verde no build do PR.
