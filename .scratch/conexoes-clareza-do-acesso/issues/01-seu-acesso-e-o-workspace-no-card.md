# 01: O card da Integração separa "Seu acesso" de "No Workspace"

Spec: [../spec.md](../spec.md) (US 1–3).

**What to build:** em Conexões, o bloco de Acesso de cada Integração mostra "Seu acesso: não conectado | Conectado como … | Precisa reconectar" e, separado, "No Workspace: N participante(s) conectado(s)". Some a leitura "Você ainda não conectou · 1 participante conectou".

**GATE:** só frontend; sem deploy; pt-BR; sem emojis.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

**Quem faz:** agente de código. **Esforço:** P.

## Pode mexer

- `projeto-althius-frontend/src/paginas/conexoes.tsx` (bloco de Acesso, ~linhas 545–600)
- testes Vitest novos em `src/paginas/`
- nos testes existentes (`conexoes-acessos.test.tsx`, `conexoes-notion.test.tsx` e outros `conexoes-*.test.tsx`), só as asserções do texto antigo do Acesso

## Não mexa

- `fonte/supabase-conexoes.ts`, functions de Conexões, PR #48

## Critérios

- [ ] "Seu acesso" e "No Workspace" aparecem rotulados, nos três estados de Acesso
- [ ] Singular e plural corretos (0, 1, n)
- [ ] Demonstração mostra o mesmo texto
- [ ] Print 1400×900 do card do Notion em `issues/prints/01-notion.jpg`
- [ ] lint, `tsc -b` e vitest verdes

## Como testar

- `npx vitest run --maxWorkers=2 src/paginas/conexoes`

## Evidência (auditoria, vertical F)

- `conexoes.tsx:557-568`: "Você ainda não conectou" (seu Acesso) e "1 participante conectou" (contagem do Workspace) lado a lado.
- Achado de tela de 2026-10-17 no card do Notion. A auditoria confirma que é por design, não estado cruzado.
