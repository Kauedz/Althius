# 01: Instalar e retirar o Canal Slack

Spec: [../spec.md](../spec.md) (seções "Instalação", "Frontend"; US 1–10). Decisões: [../decisoes.md](../decisoes.md) Q2, Q4, Q12, Q17.

**What to build:** o Administrador conecta o Slack como Canal na tela Conexões pelo fluxo oficial do Slack (app @Althius) e vê o Canal ativo. O workspace Slack da primeira instalação fica fixo no Workspace. Reinstalar com outro Slack é recusado com mensagem clara, e um Slack já ligado a outro Workspace Althius também. O Administrador retira o Canal (o token é revogado no Slack e a instalação fica retirada, sem apagar nada) e pode reinstalar no mesmo Slack. O Membro vê o estado em Conexões, sem Conectar nem Retirar. Os outros Canais continuam "Em breve" e a Demonstração não muda.

**GATE:** uma migration só, aditiva, com pgTAP próprio (`docs/agents/migrations.md`); sem aplicar no remoto e sem deploy (são Passos do Nan); nunca pedir segredo no chat; não tocar na Integração Slack pelo MCP; só ícones de `lucide-react` e componentes que o app já tem; sem emojis; pt-BR.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human (código no `main` pelo PR #220; falta o Nan confirmar se a migration `20261027100000_canal_slack.sql` já está aplicada em produção, publicar as funções e fazer os Passos abaixo)

## Pode mexer

- migration nova (registro da instalação do Canal Slack por Workspace, nome do segredo do token no Vault, RLS explícito sem acesso direto, RPCs de iniciar tentativa, fixar `team_id` ou recusar, retirar e ler o estado) e o pgTAP dela
- Edge Functions novas para iniciar a instalação e para o retorno do Slack (sem JWT, `state` de uso único como autenticação), no padrão `createHandler(deps)`, e os testes Deno delas
- `_shared/` só para um cliente novo da API do Slack (troca de código, revogar token), com testes
- a Fonte real de Conexões (`projeto-althius-frontend/src/fonte/supabase-conexoes.ts`, `conexoes-tipos.ts`), a tela `paginas/conexoes.tsx` e testes Vitest novos

## Não mexa

- `integration-connect`, `integration-callback`, `integration-tools`, `_shared/integracoes` e o catálogo do conector Slack MCP (pode copiar o padrão, não alterar)
- a Demonstração (`simulada-*`, `dados-demo`)
- `agent-conversation`, `_hermes-worker`, as RPCs de Conversa e de Execução
- testes existentes

## Critérios

- [x] Só um Administrador ativo inicia a instalação; o retorno troca o código pelo token do bot, grava o token no Vault e fixa o `team_id`
- [x] Os escopos pedidos são só os da spec (menções ao app, histórico do DM e dos canais em que o bot está, postar, ler usuários com e-mail)
- [x] Reinstalar com outro `team_id` é recusado; um `team_id` já ligado a outro Workspace é recusado; as duas recusas aparecem na tela com mensagem clara
- [x] Retirar revoga o token no Slack, marca a instalação como retirada e não apaga Conversas, Execuções nem Atividade
- [x] Reinstalar no mesmo Slack depois de retirar volta a ativo
- [x] Membro vê ativo ou retirado sem Conectar nem Retirar
- [x] pgTAP: unicidade nos dois sentidos, retirar e reinstalar, RLS e isolamento entre Workspaces
- [x] lint, `tsc -b`, vitest, `deno test`, `deno check` e pgTAP do zero verdes (vitest: uma falha que já existia em `conversas-reais.test.tsx`, ver Comments)

## Passos do Nan

- Criar o app @Althius em api.slack.com: URL de retorno da instalação, escopos do bot da spec (a URL de eventos fica para o ticket 02)
- Gravar os segredos novos da função (id e segredo do cliente do app do Canal, distintos do app MCP)
- Publicar as funções novas sem verificação de JWT
- Aplicar a migration conforme `docs/agents/migrations.md`
- Instalar num Slack de teste, conferir ativo em Conexões, retirar e reinstalar

## Comments

**2026-10-15, agente:** implementado; no `main` pelo PR #220 como `33384eb` (o `8cc8952` era o commit local de antes do rebase).

- Migration `20261027100000_canal_slack.sql` (aditiva; era `20261023100000`, renomeada no `f77caa6` para vir depois da última migration de produção) com o pgTAP `supabase/tests/canal_slack.sql` (34 asserções).
- Edge Functions `slack-channel-connect` (com JWT: iniciar e retirar) e `slack-channel-callback` (sem JWT, `state` de uso único). Cliente da API do Slack em `_shared/slack-api.ts`.
- Fonte real de Conexões e tela com o cartão do Canal Slack, mais o teste `conexoes-canal-slack.test.tsx`.
- `supabase/config.toml` ganhou as duas funções (fora do "Pode mexer", necessário para publicar o retorno sem JWT).

Verificação: pgTAP do zero com os 117 arquivos verdes; `deno test` com 1467 passando; `deno check`, lint e `tsc -b` limpos; vitest com 1350 passando e 1 falha. A falha é em `conversas-reais.test.tsx` › "depois de recarregar, a Conversa coordenada volta como estava". Ela falha também na `main` sem esta mudança (3 de 3 execuções), então não vem deste ticket.

Decisões a confirmar com o Nan:
- O escopo de leitura cobre só canais públicos (`channels:history`). Continuar um fio sem @ em canal privado precisaria de `groups:history`. **Decidido (2026-10-15, Renan): fora da v1**, registrado no Out of Scope da spec.
- Na instalação recusada, o token recebido não é guardado nem revogado (revogar poderia derrubar o Canal do outro Workspace).
- Se a leitura do estado do Slack falhar (por exemplo, migration ainda não aplicada), o cartão mostra "Em breve".

Falta: os Passos do Nan acima (criar o app, gravar os segredos, publicar as funções, aplicar a migration, instalar num Slack de teste).
