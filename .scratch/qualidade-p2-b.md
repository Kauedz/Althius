# Qualidade P2 — B: cotação da revelação

Base: main 950261f. Branch: qualidade/cotacao-revelacao.

## Evidência vermelho → verde

Antes de cada correção, Vitest executado:

- Pendente: `expect(confirmar).toBeDisabled()` falhou (botão habilitado).
- Falha/retry: `findByRole('alert')` falhou (fallback escondia a falha).
- Saldo insuficiente: `findByRole('alert')` falhou (nenhuma mensagem).
- Fonte sem linha de cotação: promise resolved `{ creditos: 2, saldo: 0, ... }` instead of rejecting.

Depois: `npm test -- src/paginas/cotacao-revelacao.test.tsx src/paginas/comite-e-enriquecimento-nao-recobrar.test.tsx src/paginas/comite-e-enriquecimento-revelar.test.tsx src/fonte/supabase-contas.test.ts`: **4 arquivos / 42 testes passaram**.

`npm ci --ignore-scripts`: 456 pacotes, lockfile preservado. `npm run lint`: sem erros, avisos preexistentes. `npm run build`: verde; JS principal 1.339,09 kB (gzip 382,17 kB). Suíte completa local interrompida por pressão de memória, inconclusiva; conferir os três jobs da CI antes de publicar. Deno e pgTAP não executados localmente nesta branch.

## Publicação / Passos do Nan

Publicar apenas o frontend pelo processo habitual depois de revisar e aprovar a CI. Não há migrations nem Edge Functions neste bloco. Nenhuma aplicação no remoto, mudança de Auth, cobrança ou canais. Nenhum merge automático.
