# 01: Ligar as Conversas em produção com o Hermes

Spec: [../spec.md](../spec.md) (US 2, 6).

**What to build:** a capability das Conversas responde `available: true` em produção e o Workspace operacional mostra o composer na página de Agentes e em `/conversa`, com o worker do Hermes atendendo o pedido.

**Blocked by:** None (can start immediately).

**Status:** ready-for-human

**Quem faz:** deploy-Nan. **Esforço:** P.

## Critérios

- [ ] O segredo `AGENT_PROVIDER=hermes` está nas Edge Functions do projeto de produção
- [ ] `agent-conversation` publicada a partir da `main` atual
- [ ] `capability` com uma sessão real responde `{"available": true}`
- [ ] Recarregar o Workspace operacional: some o "INDISPONÍVEL: Conversas…" e aparece o composer
- [ ] Com o worker rodando, um pedido ao Scopus volta com resposta

## Passos do Nan

1. Conferir o segredo: `npx supabase secrets list --project-ref <ref>` e procurar `AGENT_PROVIDER` (não imprimir valores de outros segredos).
2. Se faltar: `npx supabase secrets set AGENT_PROVIDER=hermes --project-ref <ref>`.
3. Deploy: `npx supabase functions deploy agent-conversation --project-ref <ref>`.
4. No navegador logado no app, console: `await supabase.functions.invoke('agent-conversation', { body: { action: 'capability' } })` → `available: true`. Se vier erro de invoke (CORS, 401, 404), anotar aqui nos Comments.
5. Subir o worker (README de `supabase/functions/_hermes-worker/`), mandar "Quais Contas têm Sinal recente?" ao Scopus e conferir a resposta.

## Como testar

- O passo 4 acima e um print da página de Agentes com o composer.

## Evidência (auditoria, vertical B)

- `agent-conversation/handler.ts:174`: `capability` responde só `available: deps.executar !== null`.
- `agent-conversation/index.ts:49,187`: com `AGENT_PROVIDER=hermes`, `executar` existe sempre → `available: true`. Logo "INDISPONÍVEL" em produção indica segredo ausente, função antiga ou invoke com erro.
- `auth/aplicativo.tsx:326`: o app pergunta a capability uma vez ao abrir o Workspace.
- Achado de tela de 2026-10-17: Conversa com Agentes INDISPONÍVEL enquanto o card diz DISPONÍVEL.
