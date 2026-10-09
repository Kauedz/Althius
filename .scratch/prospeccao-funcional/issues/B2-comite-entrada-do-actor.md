# B2: Comitê com a entrada certa do actor

**What to build:** pedir o comitê de compra de uma Conta chama o actor com a entrada que o schema atual desse actor descreve. As pessoas que voltam entram como propostas, com a Persona que o comitê classificou. Aceitar a proposta cria o Contato já com essa Persona. Se o actor falha, a busca fica falha, o crédito reservado volta e a tela diz que falhou. Se o actor termina e não há ninguém, a busca fica concluída com zero e também não debita. O custo em dólares que o Apify devolveu fica gravado nos dois desfechos.

**Blocked by:** B1. Os dois editam `account-enrichment/handler.ts`. O merge na `main` espera o 00.

**Status:** ready-for-human (código fechado; faltam aplicar a migration e publicar a função)

- [x] A entrada de `harvestapi~linkedin-company-employees` é a do schema do build atual na API do Apify (`GET /v2/acts/{actor}` e o build mais recente). Leia o schema nessa hora. Não reuse os nomes que o código manda hoje (`companies` com o slug, leitura de `currentPosition`) e não invente os nomes novos. O comentário da migration `20261001170000` diz que o schema foi lido em 01/10/2026; confira de novo, o build muda.
- [x] A saída é lida pelos campos que esse schema e o README do build documentam. Campo ausente fica vazio. Nada é estimado para completar cargo, nome ou LinkedIn.
- [x] Exceção do actor, timeout ou resposta que não é uma lista terminam a busca como `falhou`, com o erro gravado. Isso deixa de ser `concluida` com zero pessoas. O crédito reservado é liberado.
- [x] Actor que termina com lista vazia fica `concluida` com zero e debita zero. Esse é o único "concluída com 0".
- [x] `finish_committee_discovery` recebe o custo em dólares que a execução devolveu, na conclusão e na falha. A função já tem o parâmetro; o handler hoje não o manda.
- [x] A Persona gravada na proposta (`Decisor`, `Influenciador`, `Campeao`) chega ao Contato quando a proposta é aceita. `Outro` deixa o Contato sem Persona. Um Contato tem no máximo uma.
- [x] O Contato aceito mostra essa Persona na Conta. A definição continua sendo a da Memória do Workspace; o Contato guarda só o nome da Persona.
- [x] Deno cobre entrada montada a partir do schema (o teste fixa o schema lido, não um chute), falha que não vira zero, e custo repassado. pgTAP cobre a Persona no Contato aceito, a falha sem débito e que outro Workspace não lê a proposta.

## Pode mexer

- `supabase/functions/_shared/provedor-de-contatos.ts`, só `buscarPessoas` e o que ela precisa para ler a saída
- O ramo `comite-compra` de `supabase/functions/account-enrichment/handler.ts` e o teste correspondente em `handler.test.ts`
- `supabase/functions/account-enrichment/index.ts`, para repassar custo e erro se o `db` ainda não os aceita
- A migration nova que leva a Persona ao Contato a partir de `accept_proposed_contact` (a definição mais recente está em `20261001190000_enriquecimento_e_comite.sql`; não edite esse arquivo)
- A leitura do Contato que hoje não traz Persona (`supabase-contas.ts` e o tipo em `contas-tipos.ts`, que já tem o campo)
- A lista do comitê em `comite-e-enriquecimento.tsx`, no que mostra a Persona da proposta aceita
- pgTAP novo

## Não mexa

- O ramo `cnpj-receita` como o B1 o deixar.
- `revelarContato` e o ramo `revelar-contato`. Isso é o B3, inclusive a entrada `profileUrls` / `findEmail`.
- Telefone. Não implemente revelação de telefone.
- O classificador de Persona por cargo pode continuar; o que este ticket garante é que o valor classificado não se perde na aceitação.
- `grant_credits`.
- Conexões, InMail, seam de Canal, Stripe, sinais jurídicos.

## Migration

Uma, timestamp UTC maior que `20261002112000`. A tabela `contacts` não tem coluna de Persona; `private.proposed_contacts` tem. A migration adiciona o lugar da Persona no Contato e faz a aceitação copiá-la. Redefina `accept_proposed_contact` a partir do corpo mais recente, inteiro, com a cópia a mais. pgTAP próprio. RLS se a coluna nova estiver em tabela `public` já coberta; não abra leitura de `proposed_contacts` para `authenticated`.

## Passos do Nan

1. Com o CI verde, aplicar a migration no projeto `ycbdilsmydvzezhlymty` como manda `docs/agents/migrations.md`.
2. Publicar a função de novo, no PowerShell, na raiz:

```powershell
npx supabase functions deploy account-enrichment --project-ref ycbdilsmydvzezhlymty
```

Quem executa o ticket não aplica migration nem deploy no remoto. Não peça token do Apify no chat: a leitura do schema é a API pública do actor.

## Comments

- 2026-10-07 (reconciliação contra a `main` 59e53a6): os oito critérios estão em aberto. O ticket cobre o critério 1 do enriquecimento 02 nos casos de falha e de lista vazia (lá marcado como duplicado) e a parte do comitê do `creditos-e-planos` 01.
  - Entrada: manda `companies:[slug ou nome]` e `jobTitles`, sem `profileScraperMode` (`supabase/functions/_shared/provedor-de-contatos.ts:108-117`). O adaptador de Sinal já validado manda a URL inteira da página, o modo Short e `takePages` (`signal-runner/adaptadores/entradas-e-saidas.ts:33-42`).
  - Saída: lê `currentPosition` como texto (`:140`), mas a saída real é `currentPositions[]`, fixada no teste verde "Entradas: o perfil curto com currentPositions e startedOn vira Sinal" (`signal-runner/adaptadores/movimentacao-execucao-real.test.ts`). Sem cargo, usa o headline (`:155`): é estimar.
  - Falha: o `catch` devolve `[]` (`:166-168`), a cascata segue (`:297-300`) e o handler manda sempre `success: true` (`account-enrichment/handler.ts:474-478`). A lista vazia já fica concluída com zero e sem débito no banco (`20261001190000_enriquecimento_e_comite.sql:211-222`), mas é indistinguível da falha.
  - Custo: `finish_committee_discovery` tem o parâmetro (`:182,208,219`) e `account-enrichment/index.ts:72-80` já o aceita; o handler não manda.
  - Persona: `contacts` não tem coluna; só `proposed_contacts.persona` (`:25`). O aceite não a copia (`:395-408`). O tipo do front tem o campo (`src/fonte/contas-tipos.ts:143`), mas `supabase-contas.ts` só mapeia a Persona da proposta (`:732`).
  - Testes rodados: `deno test --allow-all supabase/functions/account-enrichment/` → 9 passed; `deno test --allow-all supabase/functions/signal-runner/adaptadores/movimentacao-execucao-real.test.ts` → 2 passed; pgTAP `enriquecimento_e_comite.sql` ok no CI 37707955273.
  - Acréscimos a este ticket, vindos da reconciliação: (1) além de passar o custo a `finish_committee_discovery`, chamar `record_discovery_cost` (`20261001171000:275`), como faz o `account-discovery` (`handler.ts:232-246`): só assim o custo chega a `private.action_costs` e ao relatório do `creditos-e-planos` 01; (2) pergunta ao Nan: repetir a busca do comitê pode cobrar de novo quem já foi proposto? Hoje cobra (`account-enrichment/handler.ts` ignora o `created=false` de `record_proposed_contact`). Não respondi: o comportamento continua.
- 2026-10-08: os oito critérios fechados. Schema lido no build `0.0.163` (`DvpBSFm17AcocApXs`, 2026-10-07): `profileScraperMode` `"Short ($4 per 1k)"`, `companies` com a URL inteira, `jobTitles`, `maxItems`. Cargo sai de `currentPositions[].title`, `currentPosition[].title`/`.position` ou `experience[].position`. Headline não vira cargo. LinkedIn só de `linkedinUrl`.
  - Migration `20261008223000_persona_do_contato_no_comite.sql`. `accept_proposed_contact` copia `Decisor`, `Influenciador` ou `Campeao` só quando o Contato ainda não tem Persona; `Outro` fica vazio; o check impede o par. `target_contacts` ganha `persona` no fim. `git log --all -S accept_proposed_contact` só achou o commit original, nenhuma outra `ralph/frente-*`.
  - O cliente do Apify (`signal-scan/apify.ts`) convertia corpo que não é lista em `[]`, e o prazo descartava o id da execução. O comitê não enxergava a falha. Entrou o argumento opcional `corpoTemDeSerLista` e o `runId` no erro. Quem não passa o argumento continua com `items: []`. O arquivo estava livre no quadro. Sem id de execução, a falha não inventa custo: o `record_discovery_cost` exige um id.
  - pgTAP `persona_do_contato_no_comite.sql` com `plan(16)` (13 `is` + 3 `throws_ok`). Não rodou nesta máquina (sem psql, Docker nem Supabase CLI).
  - Deno: `deno test --allow-all supabase/functions` 719 passed, 0 failed. `deno check` dos `index.ts` das funções, exit 0. Frontend: `npm run lint` 49 avisos já existentes e 0 erros; `.\node_modules\.bin\tsc -b` exit 0. Vitest: `npx vitest run --maxWorkers=2` 108 arquivos, 1075 passed, 0 failed (1065s). A primeira passagem, com a máquina carregada, fechou 13 falhas (12 timeouts e uma corrida no cartão de revisão das Personas, fora deste ticket). Sozinha, a repetição passou.
  - Prints: [propostas do comitê](prints/01-comite-propostas.jpg) (Decisor e Influenciador) e [Persona na tabela da Conta](prints/02-persona-na-tabela-da-conta.jpg). A Demonstração já desenha a coluna; a leitura operacional passa a trazer `persona` de `target_contacts`.
  - Revisão: o `plan` foi alinhado às asserções. A medição no argumento de `buscarPessoas` fica, porque o retorno continua sendo a lista de pessoas. O custo ao lado do ramo de CNPJ não foi extraído: esse ramo está no "Não mexa".

- 2026-10-09: Teste real de 09/10 (TOTVS): LinkedIn foi salvo como domínio e o custo/run ficaram nulos. PR #160 envia p_linkedin_url, protege a RPC e o handler contra domínio LinkedIn, espera a cobrança Apify e grava apify_run_id/actual_cost_usd. Aplicação das migrations e deploy ficam com o Renan. [PR #160](https://github.com/Kauedz/Althius/pull/160).
