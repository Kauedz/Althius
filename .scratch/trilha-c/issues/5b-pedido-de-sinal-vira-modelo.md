# 5b: Pedido de Sinal vira Modelo

**Status:** ready-for-human

**GATE:** Migration: backup + apply antes do merge. Publicar `signal-request-notify` somente se ela for alterada.

## Problema

Um pedido complexo podia ser disponibilizado, mas não havia vínculo com um Modelo reutilizável nem uma saída clara para o Sinal que a equipe ainda precisava montar.

## Solução

Pedidos publicados pela equipe criam um Modelo privado para o Workspace solicitante, atualizam o pedido para Disponível e permitem abrir o Briefing com o `modeloId`. Quando a montagem do Plano não é suportada, o Briefing oferece pedir ajuda à equipe com o texto já preenchido.

## Pode mexer

- Migration aditiva e pgTAP do fluxo de publicar pedido como Modelo.
- `pedido-de-sinal.tsx`, a área de erro de `briefing.tsx`, tipos e fontes de Sinais e testes.
- `signal-request-notify` somente se a chamada existente estiver quebrada.

## Não mexa

- `agent-conversation/`, `ferramentas-dos-agentes`, layout de Meus Sinais, cascatas do catálogo e banco remoto.

## Critérios de aceite

- [x] Não membro não publica; equipe Althius publica o pedido, cria a versão do Modelo, marca Disponível e grava `model_id`; pgTAP acrescentado em `supabase/tests/pedidos_de_sinal.sql`.
- [x] O Modelo publicado fica visível somente ao Workspace solicitante e aparece no RPC de Modelos; `signal_catalog.workspace_id` e pgTAP cobrem os dois Workspaces.
- [x] Pedido Disponível mostra “Usar o Modelo” e abre o Briefing existente com `modeloId`; `pedido-de-sinal.tsx` reutiliza a rota existente.
- [x] Falha de montagem não relacionada ao limite diário mostra “Pedir à equipe Althius” com o Briefing preenchido; o limite mantém sua mensagem; `briefing.tsx` trata somente `sem_tipos`.
- [x] Pedido novo chama `signal-request-notify` pela fonte existente.
- [ ] CI passa.

## Comments

- 28/10/2026 — A visibilidade escolhida é a mais conservadora e já prevista por `signal_catalog.workspace_id`: o Modelo publicado é privado ao Workspace que pediu; não foi criada coluna paralela.
- 28/10/2026 — Para a Trilha B (agente): chamar `request_signal(p_workspace_id, p_evento, p_empresas_ou_nicho, p_fontes_conhecidas, p_urgencia, p_contato)`; para equipe Althius, chamar `publish_signal_request_as_model(p_request_id, p_nome, p_briefing, p_plano, p_agenda)`.
- 28/10/2026 — Verificação local: `git diff --check` passou. `tsc -b --noEmit` e ESLint não produziram saída e expiraram após 30s/20s; Vitest focado não produziu contagem antes de ser interrompido junto com o typecheck. CI permanece pendente.
- 28/10/2026 — Revisão: `list_signal_requests` não devolvia `model_id`, então "Usar o Modelo" nunca aparecia; a função foi recriada com a coluna (mesma checagem de membro e permissões) e há asserção pgTAP. O plano publicado precisa ter ao menos um Sinal. Migration renumerada para 20261218001000 e ensaiada em produção numa transação desfeita. tsc ok; vitest src/paginas/sinais 37 arquivos/312 testes + o novo `pedido-vira-modelo.test.tsx` passaram.
- Para a Trilha B (agente): `public.publish_signal_request_as_model(p_request_id, p_nome, p_briefing, p_plano, p_agenda)` (só equipe) e `public.list_signal_requests(p_workspace_id)` com `model_id`.
