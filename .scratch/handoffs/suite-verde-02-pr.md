# PR: Testes dos Sinais no Workspace operacional

## Título

test(sinais): cobre a regra do módulo Sinais no Workspace operacional pela raiz/página

## Corpo

### Resumo

`sinaisDisponiveis` (`src/fonte/supabase-sinais.ts`) decide se o módulo Sinais liga no Workspace operacional, mas só
tinha cobertura indireta. Este PR adiciona um arquivo de teste Vitest novo, fora de `paginas/sinais/` (há um PR
aberto mexendo lá), que prova a regra pela raiz do app — sem chamar a função interna.

```text
projeto-althius-frontend/src/paginas/
└── sinais-no-operacional.test.tsx   # novo — 4 testes, rota real /sinais/contas/:contaId
```

Casos cobertos, todos abrindo `RaizDoAplicativo` com o Supabase falso (mesmo padrão de `raiz.test.tsx`):

1. nada `available` (sem `list_signal_actors`/`list_signal_catalog` configuradas) → aviso de indisponível, sem nome
   da Conta nem string da Demonstração.
2. as duas RPCs lançando erro → mesmo aviso.
3. só o catálogo do banco com um tipo interno `available` (`sem_resposta`) → módulo ligado.
4. um actor `available` (`vaga_linkedin`) com um Sinal gravado → módulo ligado **e** a frase do Sinal aparece na
   página da Conta-alvo.

Nenhum código de produção mudou. Nenhum bug foi encontrado na regra.

### Evidência

**Antes:** a regra só era exercitada de forma indireta por outros testes (nenhum cobria as 4 combinações do ticket
pela raiz).

**Depois:**

```text
npx vitest run --maxWorkers=2 'src/paginas/sinais'
 Test Files  35 passed (35)
      Tests  281 passed | 4 skipped (285)
```

Red-first (TDD, revertido antes do commit): quebrei `sinaisDisponiveis` para sempre devolver `true` → os testes 1 e
2 falharam (not found), 3 e 4 continuaram verdes; depois para sempre devolver `false` → os testes 3 e 4 falharam
(timeout esperando o heading da Conta), 1 e 2 continuaram verdes. `git diff` confirma que `supabase-sinais.ts` não
mudou no commit final.

`npx tsc -b` limpo. `npx oxlint src/paginas/sinais-no-operacional.test.tsx` sem avisos.

Não rodei a suíte inteira do projeto (1392 testes): o spec.md (`suite-verde`) já registra 1 falha conhecida e fora
de escopo deste ticket, em `conversas-reais.test.tsx` (ticket 01, ainda não resolvido nesta sessão).

### Risco de merge

**Porta:** de mão dupla — é só um arquivo de teste novo; reverter é apagar o arquivo.

**Raio de impacto:** nenhum em produção. Só adiciona cobertura; não muda comportamento nem schema.

### Migration pendente de apply?

Não. Este ticket não envolve SQL nem migration.
