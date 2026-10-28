# 6b. Aderência explicada por IA, sem mudar a nota

**Status:** done (PR aberto; backup + apply 20261218004000 antes do merge; deploy `account-fit-explanation` depois)

**GATE:** migration aditiva (backup + apply antes do merge); função nova `account-fit-explanation` (deploy depois do merge).

## Problema

A Aderência de uma Descoberta é determinística (`account-discovery/pontuacao.ts` e o espelho `private.score_market_discovery_icp`) e vem com motivos curtos por critério. A pessoa vê "média" e não entende por quê. O plano "Como o Althius deve ser" pede: manter a nota determinística e somar uma explicação escrita por IA que não altera a nota.

## Solução

- Função nova `account-fit-explanation` (POST `{discoveredAccountId}`, JWT da pessoa). Lê a Descoberta por `get_discovered_account_fit_explanation` (só membro ativo; quem não é membro recebe o mesmo 404 de um id que não existe), pede ao motor dos Sinais (`escolherLlmDosSinais`, SIGNALS_LLM_PROVIDER) 2 ou 3 frases em pt-BR com base só nos motivos e dados, e devolve `{explicacao, origem: 'ia'|'regra', nivel, pontuacao}`.
- A nota não muda: nível e número devolvidos são sempre os do banco; a função não grava `fit_level`, `fit_score` nem `reasons`; a saída do modelo que dá à empresa outro nível ("Aderência alta" numa Descoberta média), cita dinheiro, nota em número, letra de nicho ou emoji é descartada.
- Dados da empresa, motivos e ICP vão como DADO entre marcas; marcas dentro dos dados são removidas.
- Sem motor, acima do limite, demora (20 s) ou saída inválida: explicação pela regra, montada com os motivos da nota.
- Guarda em `private.discovered_accounts.fit_explanation*` por `save_discovered_account_fit_explanation` (service_role). A impressão digital é calculada no banco (`fit_level` + `reasons`): quando a nota muda, a explicação antiga deixa de ser devolvida. A regra só é guardada quando não há motor, para uma falha passageira não prender a Descoberta na explicação simples.
- Limite: 50 explicações por IA por Workspace por dia; acima disso, regra. Não cobra Créditos (custo interno pequeno).
- Front: `fonte/aderencia-explicada.ts` (`explicarAderencia`) e `components/por-que-essa-aderencia.tsx` ("Por que essa Aderência?", aviso "Escrita por IA; a nota não muda."). Ainda não ligado na Caixa de Descobertas: os arquivos de Descobertas estavam em hotfix (#327); a ligação vem num PR seguinte.

## Pode mexer

`supabase/functions/account-fit-explanation/`, `supabase/config.toml` (entrada da função), migration + pgTAP na faixa da Trilha C, arquivos novos do front listados acima.

## Não mexa

`account-discovery`, `pontuacao.ts`, arquivos de Descobertas do front, agent-conversation, ferramentas-dos-agentes.ts.

## Critérios de aceite

- [x] Nota determinística intacta: teste Deno "com motor: a IA escreve e a nota devolvida é a do banco"; pgTAP "gravar a explicação não muda a nota"; a função não tem caminho de escrita da nota.
- [x] Explicação por IA com o motor dos Sinais, saída conferida (tamanho, sem dinheiro/nota/letra de nicho/emoji, sem contradizer o nível).
- [x] Regra sem motor, com limite do dia, demora ou saída inválida (testes Deno).
- [x] Prompt injection na descrição fica como dado (teste Deno).
- [x] Só membro lê; outro Workspace recebe 404; só service_role grava (pgTAP).
- [x] Cache por impressão digital da nota; nota mudou, explicação antiga não volta (pgTAP).
- [x] Componente e fonte no front com testes Vitest (6).
- [x] CI 3/3, backup + apply, deploy e conferência em produção (gate): #329 mesclado 10bf925; backup 20261028-1616 completo; 20261218004000 aplicada; account-fit-explanation v1 com a fonte de 10bf925; smoke 19/19 verde em 28/10 16h38.
- [ ] Ligado na Caixa de Descobertas: botão no detalhe da candidata, fonte Supabase e Demonstração (este PR).

## Comments

- 28/10/2026 — Codex fez o primeiro rascunho; a revisão da Trilha C reescreveu: a impressão digital era calculada de jeitos diferentes na função (JSON) e no banco (md5), então o cache nunca batia; o filtro de letra de nicho (`/[A-H]\b/`) recusava qualquer "B2B"; `workspaceId` do motor recebia o id da Descoberta; a regra era guardada mesmo quando o motor só falhou uma vez; o componente não usava os botões do design system. Para a Trilha B (agente): a ferramenta pode chamar a função `account-fit-explanation` com `{discoveredAccountId}` e o JWT da pessoa; a leitura também existe como RPC `get_discovered_account_fit_explanation(uuid)`.
