# PR-16 — Feedback que ensina

## GATE
1. Motivo estruturado do descarte (`discovered_accounts.discard_reason_code`, com check): Setor fora do ICP, Porte
   errado, Região fora, Já é cliente ou concorrente, Sinal fraco ou irrelevante, Outro. RPC nova
   `discard_discovered_account_with_code` (a regra e a autorização ficam em `discard_discovered_account`).
2. `private.discovery_learned_weights (workspace_id, dimension, value, delta, evidence_count, updated_at)` com RLS por
   Workspace. Aceite soma +2,5 nas dimensões da candidata (gatilho); descarte com motivo ligado à dimensão soma -2,5.
3. Conta com 3 ou mais decisões, máximo ±15, meia-vida de 60 dias. Encaixe ajustado nunca abaixo da metade do
   Encaixe original (o aprendizado não zera critério que o ICP pede) nem acima de 100. Mesma regra em
   `account-discovery/pontuacao.ts` (`ajusteEfetivo`, `encaixeAjustado`), com teste Deno e pgTAP nos mesmos pontos.
4. `private.discovery_note` e `list_discovered_accounts` usam o Encaixe ajustado; o nível segue o único número visível.
5. RPCs `list_discovery_learning` e `reset_discovery_learning` (só Administrador). Sem custo em créditos.
6. Tela "O que a Descoberta aprendeu" dentro da página de Descoberta; frase no detalhe da candidata.

## Fora do escopo / pendente
Proposta automática de revisão do ICP pelo Scopus quando o ajuste ficar estável (8 decisões): fica para um PR
seguinte, porque depende de criar Aprovação em nome do Agente fora de uma Conversa. Conectores, Hermes e segredos.
