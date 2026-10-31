# 01: O Rhetor propõe uma Sequência de e-mail por Aprovação

Spec: [../spec.md](../spec.md) (US 1–3, 5, 7–10).

**What to build:** no Workspace operacional, o Rhetor tem a ferramenta `propor_sequencia`. Ao pedir "monte uma Sequência para a Alfa", ele lê a seção Cadência do Playbook e os Contatos da Conta-alvo e propõe Contatos e passos de E-mail com variáveis. A proposta vira uma Aprovação do Vendedor responsável; aprovar cria a Sequência sem Versão autorizada (nada é enviado até "Ativar envios").

**GATE:** no máximo uma migration aditiva com pgTAP, sem aplicar no remoto; sem deploy; sem merge; sem segredo.

**Blocked by:** PR #227 em `main` (variáveis, Supressão e criação de Sequência do lote).

**Status:** ready-for-human — código incorporado à `main` pelo PR #240 (merge commit `474e2c8`, conforme histórico do repositório). Não há registro no repositório que confirme se a migration `20261105100000_sequencia_proposta_pelo_rhetor.sql` foi aplicada no remoto ou se as Edge Functions foram publicadas; confirmar com o Nan antes da validação operacional.

**Quem faz:** agente de código; Nan aplica e publica. **Esforço:** M.

## Pode mexer

- `supabase/functions/_shared/ferramentas-dos-agentes.ts` (ferramenta nova) e testes Deno novos
- `supabase/functions/_shared/executor-de-aprovacoes*.ts` (executar a Aprovação de Sequência) e testes Deno novos
- `supabase/functions/_hermes-worker/` só se a lista de ferramentas do worker precisar da nova, com teste
- migration nova, se a criação a partir da Aprovação pedir RPC própria, com pgTAP

## Não mexa

- `sequence-runner`, `sequence-step-sends`, Unipile
- frontend (é o ticket 02)
- as migrations do PR #227

## Critérios

- [x] `propor_sequencia` só para a Especialidade Rhetor e sempre por Aprovação (Deno) — `ferramentas-dos-agentes-sequencia.test.ts` e `worker-sequencia.test.ts`.
- [x] Recusa: participante que não é o Vendedor responsável, Conta com Sequência em andamento, Contato de outra Conta, Contato suprimido, variável desconhecida (Deno) — ferramenta e `sequencia_proposta_pelo_rhetor.sql` (61/61).
- [x] Aprovar cria a Sequência com os Contatos e passos propostos, sem Versão autorizada; nada entra na fila do Executor (Deno/pgTAP) — pgTAP (61/61) confere sequência criada, versão não autorizada e fila vazia.
- [x] Recusar não cria nada e o Rhetor recebe a recusa na Conversa (Deno/pgTAP) — pgTAP `historico_com_a_decisao_da_aprovacao.sql` (6/6, no CI e no remoto com rollback) e Deno `worker-sequencia.test.ts` (a recusa chega ao Hermes no `conversation_history`).
- [x] O Rhetor usa a seção Cadência do Playbook quando existe; sem ela, propõe 3 passos de E-mail e diz que o Playbook está vazio (Deno) — testes da ferramenta cobrem Playbook preenchido/vazio.
- [x] lint, `deno test supabase/functions` e pgTAP verdes — CI da `main` em `855ce06a` (31/10): pgTAP completo `Files=192, Tests=6105, Result: PASS`, com `retomada_seletiva.sql` e `sequencia_proposta_pelo_rhetor.sql` ok (a falha de 24/10 saiu com `2a0e840a`). Deno local de `_shared`, `_hermes-worker` e `agent-conversation`: 1101/0; `deno lint` dos arquivos do ticket ok.
- [x] Validação operacional real (fora desta sessão, pelo GPT, 31/10): o Vendedor recusou a proposta e pediu ajuste na mesma Conversa; o Rhetor respondeu reconhecendo a recusa e nenhuma Sequência foi criada.
- [x] A leitura do histórico da Execução nova contém `Aprovação "Sequência de E-mail para QA Recusa Sequência 20261031": recusada por quem decide. Nada foi feito.`

## Como testar

- `deno test --allow-all supabase/functions/_shared supabase/functions/_hermes-worker`
- `supabase test db`

## Evidência (auditoria, vertical C)

- `ferramentas-dos-agentes.ts`: ferramentas de hoje são `ler_contas_e_sinais`, `buscar_contas_pelo_icp`, `consultar_integracao`, `propor_envio_ao_crm`, `usar_conector`, `propor_mudanca_no_playbook`, `buscar_sinais`; nenhuma cria Sequência.
- `nascimento-sequencia-na-conversa.tsx` só aparece pelo desfecho `nascimento-sequencia`, que existe em `fonte/roteiros.ts` e `fonte/simulada.ts` (Demonstração).
- Auditoria C: "Via Rhetor (IA) … trava se Conversas INDISPONÍVEL (B)"; "#227/#230/#228 fora de main".

## Passos do Nan

- Depois do merge: aplicar a migration (se houver), publicar `agent-conversation` e atualizar o worker; numa Conta de teste, pedir ao Rhetor a Sequência e aprovar.

## Comments

- 2026-10-17, decisão do Renan (dúvida 4 da fila): confirmado. Aprovar a proposta do Rhetor cria a Sequência sem Versão autorizada; o envio só começa no "Ativar envios". Segue blocked até o #227 entrar em `main`.
- 2026-10-21, revisão do PR #240: a exigência de Permissão Propor/Executar em alguma Integração saiu (decisão 1 recusada). `agent_read_sequence_contacts` passou a receber o Agente, recusa quem não é Rhetor e não lista Contatos de Conta arquivada. A Execução r3 do pgTAP foi para uma terceira Conversa (`agent_runs_one_open_per_conversation`).
- 2026-10-24, reconferência na base atual: PR #240 está incorporado; quatro critérios funcionais foram verificados e marcados. Deixei pendente a parte do critério de recusa que diz que a decisão humana chega ao Rhetor na Conversa: não encontrei teste que a confira. `deno test supabase/functions` passou (1826/0, 39 ignorados), pgTAP específico passou (61/61), e `deno lint` dos arquivos envolvidos passou. A suíte pgTAP completa falha em `retomada_seletiva.sql` (15/16); não alterei esse outro escopo. Não encontrei no repositório evidência de aplicação remota da migration nem de publicação das funções. A validação operacional segue pendente do Nan.
- 2026-10-31, conferência pelo código: o critério de recusa não tem como ficar verde só com teste, porque a entrega ao Rhetor não está implementada. Recusar chama só `decide_approval` (`src/fonte/supabase-aprovacoes.ts`), que grava `recusada` e o evento em `private.approval_events`; nenhum gatilho ou função escreve na Conversa. O histórico que o Agente recebe (`'history'` em `20261122130600_coordenacao_whatsapp_no_motor.sql`, lido por `historicoDaConversa`) traz só o pedido e o texto de cada Execução concluída, sem as Aprovações nem suas decisões. Quando o Vendedor recusa e pede ajuste (US 6), o Rhetor não sabe que a proposta foi recusada. Falta decidir como a decisão entra no histórico e implementar com teste.
- 2026-10-31, implementação do que faltava (PR #344): a migration `20261218030000_historico_com_a_decisao_da_aprovacao.sql` faz `claim_agent_run` terminar a resposta de cada Execução do histórico com o desfecho das Aprovações criadas nela. Testes: o pgTAP `historico_com_a_decisao_da_aprovacao.sql` (6 asserções: pendente, recusada pela Vendedora sem criar Sequência, recusada pelo sistema com o motivo, aprovada) e um teste Deno em `worker-sequencia.test.ts` (a recusa chega ao Hermes no `conversation_history`). O teste Deno passou aqui. O pgTAP só roda no CI do PR, porque nesta máquina não há Docker e o conector do Supabase não estava autenticado. Marcar o critério quando o CI passar. Passos do Nan: aplicar a migration depois do merge.
- 2026-10-31, CI do PR #344 verde em `2ad15294`: Banco (`Files=193, Tests=6111, Result: PASS`, com o pgTAP novo ok), Edge Functions e Frontend. Conferência no remoto com rollback, feita fora desta sessão: o pgTAP novo deu 6/6, `sequencia_proposta_pelo_rhetor.sql` 61/61 e `leitura_do_fio_do_canal_slack.sql` 9/9. `conversas_dos_agentes.sql` deu erro 21000 só no remoto, porque lê `private.agent_conversations` e `private.agent_runs` sem filtro (linhas 109–110) e supõe um banco vazio; no CI ele passa. O erro não tem relação com este PR. Critério de recusa marcado.
- 2026-10-31, validação operacional (feita pelo GPT, fora desta sessão) no Workspace "Equipe Althius": a recusa chegou ao Rhetor e nenhuma Sequência foi criada. A Conta e o Contato de QA foram arquivados, não apagados, porque as FKs de responsabilidade de vendas impedem a exclusão. Falta confirmar se "Equipe Althius" é o Workspace QA (`ALTHIUS_QA_WORKSPACE_ID`), o único que o prompt autorizava.
- 2026-10-31, na validação de interface, `Gerar Sequência` não avançou. O GPT tentou corrigir invertendo `navegar('/conversa')` e `conversas.coordenar(...)` em `gerar-sequencia.tsx`, e a mudança foi desfeita sem commit. As duas chamadas rodam no mesmo clique. O pedido fica no `ConversasProvider`, acima das rotas, então não se perde quando a tela da Conta sai. A tela inicial (`agentes.tsx`) usa a mesma ordem e funciona, e `gerar-sequencia.test.tsx` já cobre esse clique e passa na `main`. Para achar a causa real, falta o trace ou o print do Playwright dessa tentativa. Pode ser o seletor, a Conta não estar sob a responsabilidade do QA ou a versão publicada.
- 2026-10-31, o problema de `Gerar Sequência` não avançar em produção saiu deste ticket e foi para o [04](04-gerar-sequencia-abre-conversa.md), porque é da tela, não da proposta pelo Rhetor. Os critérios deste ticket estão todos marcados.
