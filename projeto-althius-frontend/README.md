# Althius · protótipo da aba de Agentes

Protótipo navegável, só front-end, com dados simulados. A especificação está em [SPEC.md](SPEC.md) (issue #1). O vocabulário do domínio está no `CONTEXT.md` da raiz, e as decisões, em `docs/adr/`.

## Rodar

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # testes de comportamento (Vitest + Testing Library)
npm run build    # typecheck + build de produção
```

## Como está organizado

- `src/fonte/`: a **fonte de dados dos agentes**, a única fronteira entre as telas e os agentes. `tipos.ts` define a interface; `simulada.ts` é a implementação da demo, com os dados em `dados-demo.ts` e os roteiros da Conversa em `roteiros.ts`. Um back-end real entra implementando a mesma interface (ADR 0003).
- `src/paginas/`: painel e galeria, página do agente (7 seções), Conexões e Aprovações.
- `src/conversa/`: estado das Conversas e o autocompletar de @menção.
- `src/index.css`: tokens do Manual da Marca v2.0 (tema escuro padrão e tema claro).

Os ícones são Lucide provisórios e o logo é uma reconstrução provisória: os dois serão trocados pelos arquivos oficiais.
