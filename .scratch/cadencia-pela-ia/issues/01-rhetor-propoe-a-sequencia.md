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
- [ ] Recusar não cria nada e o Rhetor recebe a recusa na Conversa (Deno) — pgTAP confere que recusar não cria Sequência; os testes Deno cobrem a proposta e recusas do servidor, mas não encontrei teste que confira a entrega da decisão humana de recusa ao Rhetor na Conversa.
- [x] O Rhetor usa a seção Cadência do Playbook quando existe; sem ela, propõe 3 passos de E-mail e diz que o Playbook está vazio (Deno) — testes da ferramenta cobrem Playbook preenchido/vazio.
- [ ] lint, `deno test supabase/functions` e pgTAP verdes — `deno lint` dos arquivos do ticket passou; Deno passou (1826 testes, 39 ignorados); pgTAP do ticket passou (61/61), mas a suíte inteira tem falha preexistente em `retomada_seletiva.sql` (15/16, teste 16 sobre privilégio legado).

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
