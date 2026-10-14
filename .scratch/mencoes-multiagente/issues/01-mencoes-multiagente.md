# 01: Menção faz o Agente mencionado falar, mesmo no modo de uma chamada

**What to build:** roteamento do worker do Hermes para o modo por Agente quando há Menção ou é a página de um Agente; fallback de uma chamada com uma fala por Agente; Agente que menciona Agente; cobrança por fala; indicador de quem está respondendo.

**GATE:** sem migração; sem aplicar no remoto, sem deploy, sem mudar o ambiente da VPS (`HERMES_UMA_CHAMADA` fica como está); sem segredo; nenhum conector ou integração; sem mudar rotas, menu ou layout; só ícones de `lucide-react` e os componentes que o app já tem; sem emojis; pt-BR; sem a palavra "CRM"; sem as letras A–H dos nichos.

**Blocked by:** nenhum.

**Status:** ready-for-agent

## Pode mexer

- `supabase/functions/_hermes-worker/worker.ts` e testes novos
- `supabase/functions/_shared/orquestracao.ts`, `supabase/functions/_shared/mencoes.ts` (novo) e testes novos
- `projeto-althius-frontend/src/paginas/secoes/conversa.tsx`, função pura nova em `src/conversa/` e testes Vitest

## Não mexa

- `_shared/unipile`, `sender-accounts`, `unipile-account-status`, `_shared/integracoes`, `integration-*`, HubSpot, Pipedrive, Notion
- segredos, `main.ts` do worker (a variável continua lida igual), banco

## Critérios

- [x] Menção na página do Agente com o worker em modo de uma chamada gera fala do mencionado
- [x] Agente que menciona Agente faz o mencionado falar na rodada seguinte
- [x] Limite de rodadas (3) e de participantes (4)
- [x] Cada fala cobra a rodada
- [x] A tela diz quem está respondendo
