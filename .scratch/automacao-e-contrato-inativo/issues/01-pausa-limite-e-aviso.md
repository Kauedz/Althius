# 01: Pausa por contrato inativo, limite único e aviso na renovação

**What to build:** o Workspace sem contrato ativo não roda Monitoramento, cascata, Rotina nem Sequência (`contrato_inativo`); a Equipe ilimitada roda em automático sem teto; a renovação despausa e avisa; a tela tem um limite mensal só.

**GATE:** só migração nova (versão maior que `20261019100000`), aditiva e idempotente, RLS por Workspace mantida; sem aplicar no remoto, sem deploy, sem segredo, sem SQL destrutivo de dado; nenhum conector ou integração; nenhum "US$" de custo na UI do cliente; sem emojis; UI em pt-BR; sem a palavra "CRM"; sem as letras A–H dos nichos.

**Blocked by:** nenhum.

**Status:** closed

## Pode mexer

- `supabase/migrations/` (arquivo novo) e `supabase/tests/` (arquivo novo; o mínimo num teste antigo se a Equipe passar a ter as três linhas)
- `supabase/functions/signal-runner/handler.ts` e o motor de cascata, só para reconhecer o desfecho `contrato_inativo`
- `projeto-althius-frontend/src/paginas/configuracoes/secao-automacao.tsx`, a fonte de automação e o banner nas três telas
- testes Vitest e Deno novos

## Não mexa

- `_shared/unipile`, `sender-accounts`, `unipile-account-status`, `_shared/integracoes`, `integration-*`, HubSpot, Pipedrive, Notion
- segredos, Auth do Supabase, dado remoto
- rotas, menu lateral e layout geral, além do banner

## Critérios

- [x] Contrato inativo (status diferente de ativo, ou sem linha) bloqueia Monitoramento, cascata, Rotina e Sequência com o motivo `contrato_inativo`, sem apagar nada
- [x] Equipe ilimitada roda e a tela mostra "Ilimitado"
- [x] A renovação limpa `paused_at` e avisa os Administradores
- [x] A tela tem um limite mensal editável até a faixa e, por tipo de ação, só Confirmar/Automático, com "X de Y créditos usados no mês"
- [x] pgTAP, Deno e Vitest cobrem o bloqueio, a Equipe, a renovação, o banner e a tela

## Passos do Nan

Aplicar a migração do PR (não aplicar daqui) e publicar as Edge Functions listadas no corpo do PR. Não há variável de ambiente nova.
