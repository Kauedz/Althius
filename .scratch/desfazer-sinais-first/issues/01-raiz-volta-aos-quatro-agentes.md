# 01: A `/` volta a ser a página dos 4 Agentes

**Status:** ready-for-human

**Hermes:** não

**Blocked by:** nenhum

**Decisões:** ADR-0034, decisões 2 e 3.

## O que construir

- A rota índice de `App.tsx` volta a renderizar a página dos Agentes (`TelaDoModulo modulo="agentes"` com `PaginaAgentes`), como em `git show 0a5b2fac^1:projeto-althius-frontend/src/App.tsx`. `PaginaInicial`/`PaginaChatDoAgente` saem da rota.
- `/agentes` (onde o composer antigo foi parar no #330) redireciona para `/`. `conversa-coordenada.tsx` volta a redirecionar e linkar para `/`, como em `0a5b2fac^1`.
- `casca.tsx`: `naAbaDeAgentes` volta a considerar a `/` (o #341 incluiu `/agentes`; mantenha o resto do #341).
- O composer de `agentes.tsx` deixa de passar `classificarIntencao` e `criarSinalNoComposer`. Em `composer.tsx` saem esses dois ramos (o classificador `conversa/classificar-pedido.ts` e `NavegarParaNovoSinal`); ficam `aceitaAnexos` e `mostrarConexoes` do #341. Referência: `git show a8173ada^1:projeto-althius-frontend/src/conversa/composer.tsx`.
- `FonteDoAgenteProvider`, `fonteDoAgente` e `paginas/chat-do-agente.tsx` saem do frontend, com `fonte/{agente-tipos,simulada-agente,supabase-agente}.ts` e as entradas em `contexto.tsx`, `ambiente.ts`, `composicao*.ts` e `protecao-do-visitante.ts`.
- A grade dos 4 Agentes ainda não volta aqui (é o 02): neste ticket a `/` mostra o composer da Coordenação como antes do #311.

## Pode mexer

- `projeto-althius-frontend/src/App.tsx`, `contexto.tsx`, `ambiente.ts`, `composicao*.ts`, `protecao-do-visitante.ts`, `components/casca.tsx`, `paginas/agentes.tsx`, `paginas/conversa-coordenada.tsx`, `paginas/chat-do-agente.tsx`, `conversa/composer.tsx`, `conversa/classificar-pedido.ts`, `fonte/agente-tipos.ts`, `fonte/simulada-agente.ts`, `fonte/supabase-agente.ts`, e os testes deles (`App.test.tsx`, `raiz.test.tsx`, `composer-classifica-intencao.test.tsx`, `composer-com-anexos.test.tsx` e os que renderizam a `/`).
- `e2e/tests/13-chat-na-raiz.spec.ts` (remover), `e2e/tests/07-composer-sinal.spec.ts` (remover), `e2e/tests/08-agentes-so-leitura.spec.ts` (só redirecionar de `/agentes` para `/`).

## Não mexa

- `supabase/functions/agente/` e `_shared/agente/` (ticket 08). Nenhuma migration.
- `paginas/sinais/*` (ticket 04).
- A grade, a barra lateral "Especialistas" e a @menção (ticket 02).
- Arquivos do Kauê.

## Critérios

- [x] A `/` mostra o composer da Coordenação; nada do chat do agente único aparece em nenhuma rota. (Vitest `App.test.tsx`, `raiz.test.tsx`; `chat-do-agente.tsx` e as Fontes do agente único removidos; smoke 08 agora abre a `/`.)
- [x] Um pedido no composer vai para a Coordenação, nunca para `/sinais/novo`, mesmo que fale de "monitorar" ou "Sinal". (Vitest `App.test.tsx`: "um pedido de monitorar vai para a Coordenação"; smoke 07 removido.)
- [x] Anexos e o atalho de Conexões do composer continuam funcionando. (Vitest `composer-com-anexos.test.tsx`.)
- [x] `/agentes` redireciona para `/`. (Vitest `App.test.tsx`: "/agentes volta para a /".)
- [ ] Smoke 09 (cadência) verde no build do PR.
