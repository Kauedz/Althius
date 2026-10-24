# conexoes-clareza-01: O card da Integração separa "Seu acesso" de "No Workspace"

## Summary

O bloco de Acesso em cada card de Integração (Conexões) misturava, sem rótulo, a leitura
do próprio Acesso da pessoa com a contagem de participantes do Workspace. As duas frases
estavam certas, mas lidas juntas pareciam contraditórias:

```diff
 <SeuAcesso>
-  "Você ainda não conectou"            (Acesso da pessoa, sem rótulo)
-  "1 participante conectou"            (contagem do Workspace, sem rótulo)
+  "Seu acesso: não conectado"          (Acesso da pessoa, rotulado)
+  "No Workspace: 1 participante conectado"  (contagem do Workspace, rotulada, em linha própria)
```

Mudança isolada em `SeuAcesso` (`conexoes.tsx:563-603`): só texto e rótulos, nenhuma
lógica de estado, Fonte ou chamada de rede mudou.

## Evidence

- **Antes:** `npx vitest run --maxWorkers=2 src/paginas/conexoes-acesso-vs-workspace.test.tsx`
  (teste novo rodado contra o `conexoes.tsx` antigo, via `git stash` só desse arquivo)
  → **3 failed (3)**: nenhum dos três estados encontrava o texto rotulado.
- **Depois:** mesmo arquivo de teste, com a mudança aplicada → **3 passed**.
  Suíte completa do ticket: `npx vitest run --maxWorkers=2 src/paginas/conexoes` →
  **194 passed (21 arquivos)** (baseline era 191; +3 testes novos). `npx oxlint` e
  `npx tsc -b` sem erros.
- Print 1400×900 do card do Notion (Chrome headless, modo Demonstração) em
  `.scratch/conexoes-clareza-do-acesso/issues/prints/01-notion.jpg`, mostrando
  "Seu acesso: não conectado" e "No Workspace: 1 participante conectado" lado a lado.

## Merge Danger

**Door:** two-way. É troca de texto estático em um componente de apresentação; reverter
é um `git revert` sem efeito em dados, Fonte ou migrations (não há migration neste PR).

**Blast Radius:** baixo, visual. Afeta a leitura do bloco de Acesso em todos os cards de
Integração com Acesso por participante (HubSpot, Notion, Apollo, Clay, Lusha, Meta Ads,
Bitrix24, Calendly, Google Calendar, Google Sheets, Make, RD Station, Slack, TikTok Ads,
Zapier) — mesma estrutura e hierarquia visual (duas linhas de texto + botões), só o texto
rotulado muda. Nenhum seletor de teste (role, nome do botão) mudou, só as asserções de texto
correspondentes em ~15 arquivos `conexoes-*.test.tsx` existentes.

## Pending

- Migration: não há (ticket é só frontend).
