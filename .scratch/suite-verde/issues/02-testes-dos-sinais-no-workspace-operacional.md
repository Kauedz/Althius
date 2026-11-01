# 02: Testes dos Sinais no Workspace operacional

Spec: [../spec.md](../spec.md) (US 3).

**What to build:** testes Vitest que provam a regra do módulo Sinais no Workspace operacional: nada `available` → aviso de indisponível sem dados da Demonstração; só um Sinal interno `available` → módulo ligado; um actor `available` → módulo ligado e o Sinal aparece na Conta-alvo; erro de RPC → indisponível.

**GATE:** só testes; se um teste revelar bug, registrar nos Comments e abrir ticket, sem corrigir aqui.

**Blocked by:** None (can start immediately).

**Status:** done

**Quem faz:** agente de código. **Esforço:** M.

## Pode mexer

- arquivos de teste novos em `projeto-althius-frontend/src/paginas/` e `src/fonte/` (ex.: `sinais-reais.test.tsx`)

## Não mexa

- código de produção; testes existentes

## Critérios

- [x] Os quatro casos acima cobertos pela raiz/página, não por função interna
- [x] Nenhum dado da Demonstração aparece no operacional nos casos de indisponível
- [x] vitest verde

## Como testar

- `npx vitest run --maxWorkers=2 src/paginas/sinais*`

## Evidência (auditoria, vertical D e H)

- `supabase-sinais.ts:105-108` (regra do módulo); FE com ~2 arquivos de teste de Sinais.

## Comments

- **2026-10-24 (agente de código):** Criado `projeto-althius-frontend/src/paginas/sinais-no-operacional.test.tsx`
  (arquivo novo, fora de `paginas/sinais/` — não toca nada do PR #261). Só testes; nenhum código de produção mudou.
  Os 4 testes abrem o Workspace operacional de verdade (`RaizDoAplicativo` + `criarSupabaseFalso`, mesmo padrão de
  `raiz.test.tsx`) na rota `/sinais/contas/:contaId` (guardada pelo mesmo `TelaDoModulo modulo="sinais"` da rota
  `/sinais`, mas simples o bastante para não exigir o catálogo inteiro):
  1. nada `available` (nenhuma RPC de `list_signal_actors`/`list_signal_catalog` configurada) → "Sinais ainda não
     estão disponíveis neste Workspace.", sem nome da Conta nem string de Demonstração (`OpenAI`/`Databricks`/`Vagas
     no LinkedIn`).
  2. as duas RPCs (`list_signal_actors` e `list_signal_catalog`) lançando erro → mesmo aviso de indisponível.
  3. só o catálogo do banco com um tipo interno `available` (`sem_resposta`), sem nenhum actor → módulo ligado (a
     Conta-alvo renderiza, sem o aviso).
  4. um actor `available` (`vaga_linkedin`) com um Sinal gravado (`list_signals`) para a Conta → módulo ligado e a
     frase do Sinal aparece na página da Conta-alvo.
  Red-first: para os casos 1–2, quebrei `sinaisDisponiveis` (`src/fonte/supabase-sinais.ts`) para sempre devolver
  `true` (ainda chamando as duas RPCs, para não travar o teste) — os dois testes falharam (not found), os outros
  dois continuaram verdes. Para os casos 3–4, quebrei para sempre devolver `false` — esses dois falharam (timeout
  esperando o heading da Conta), os outros dois continuaram verdes. Revertido antes de rodar de novo; `git diff`
  confirma `supabase-sinais.ts` sem alteração. Nota de implementação: `comSinais` em `auth/aplicativo.tsx` começa
  em `false` e só o efeito assíncrono confirma o valor real, então a tela sempre mostra "indisponível" por um
  instante — os testes dos casos 1–2 esperam as duas RPCs da regra responderem (e mais um tick) antes de checar o
  estado, para não confundir esse flash inicial com o resultado definitivo.
  Nenhum bug encontrado na regra em si — os 4 casos do ticket se comportam como o código já implementa. Testes
  rodados: `npx vitest run --maxWorkers=2 'src/paginas/sinais'` → 35 arquivos, 281 passaram, 4 skipped (nenhuma
  falha); `npx tsc -b` limpo; `npx oxlint src/paginas/sinais-no-operacional.test.tsx` sem avisos. Não rodei a suíte
  inteira do projeto (1392 testes): o spec.md já registra 1 falha conhecida e fora de escopo deste ticket
  (`conversas-reais.test.tsx`, ticket 01).
