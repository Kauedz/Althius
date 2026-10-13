## Summary

Ferramentas de geração e build passam a devDependencies; lockfile atualiza patches compatíveis, sem `npm audit fix --force`.

```text
shadcn + @tailwindcss/vite → desenvolvimento/build
React/Vite compilado → mesmo JS e CSS servidos
```

## Evidence

- **Before:** teste vermelho: `dependencies.shadcn` era `^4.21.0`; depois, `dependencies.@tailwindcss/vite` era `^4.3.3`.
- **After:** teste de classificação verde; `npm ci` reproduzível (447 pacotes); lint sem erros e build verde. Suíte completa no CI deste PR.
- Audit anexado em `.scratch/qualidade-p2-e-audit-{runtime,completo}.json`: runtime **0 vulnerabilidades**; completo 7 high exclusivamente dev.
- Bundle comparado com origin/main: JS **1338,39 kB / gzip 382,00 kB**, CSS **100,39 kB / gzip 21,64 kB**, exatamente iguais, inclusive hashes `index-V8puhdRu.js` e `index-Dxp4hKW8.css`.

| Pacote originalmente apontado | Quem usa | Destino e resultado |
| --- | --- | --- |
| @modelcontextprotocol/sdk | shadcn CLI | dev; patch compatível 1.32.1, sem alerta |
| @ts-morph/common | shadcn → ts-morph | dev; high transitivo de braces |
| braces | micromatch | dev; high por profundidade de expansão (GHSA-vfj7-8cjw-p6xm) |
| fast-glob | registry / @ts-morph/common | dev; high transitivo de braces |
| micromatch | fast-glob | dev; high transitivo de braces |
| shadcn | CLI; apenas tailwind.css importado no build | dev; 4.21.4, high transitivo |
| source-map-js | Tailwind build / postcss / jsdom | dev; 1.2.2 sem alerta |
| ts-morph | shadcn CLI | dev; high transitivo |

O sétimo high atual é `@shadcn/registry`, também ferramenta transitiva do shadcn. Não há importação JavaScript desses pacotes no código servido. Mantemos shadcn porque `src/index.css` importa seu CSS no build. Cada um dos sete alertas restantes pertence à mesma cadeia de geração local; a correção sugerida pelo audit exige downgrade incompatível do shadcn para 1.x. Não executamos esse downgrade nem `--force`. O CLI deve processar somente arquivos confiáveis do projeto; atualizar quando houver correção compatível da cadeia. Os JSONs preservam os advisories e caminhos de dependência para revisão.

## Publicação — Passos do Nan

1. Revisar este PR separado; **sem merge automático**.
2. Instalar com `npm ci` (incluindo devDependencies no ambiente de build), gerar e publicar o frontend.
3. Nenhuma migration, Edge Function, mudança de Auth ou limpeza de dados.

## Merge Danger

**Door:** two-way

**Blast Radius:** build

Lockfile e manifesto precisam viajar juntos. Os sete high de ferramentas estão justificados acima; nenhum high de runtime.
