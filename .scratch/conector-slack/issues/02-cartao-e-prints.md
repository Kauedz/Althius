# 02: cartao e prints

**What to build:** `conexoes-slack-integracao.test.tsx`: o cartão da Integração Slack ao lado do Canal Slack, sem misturar estados, nos estados de sempre. Prints.

**Blocked by:** 01

**Status:** ready-for-agent (feito na branch local `conectores-em-construcao`; vira closed no merge)

## Comments

**20/10/2026 (agente).**
- `src/paginas/conexoes-slack-integracao.test.tsx`, 12 casos. O teste achou **dois artigos chamados "Slack"**, o do Canal e o da Integração. É o desenho da spec, e cada um fica na sua região ("Canais" e "Integrações"). Os casos procuram o cartão na região Integrações, e um caso a mais confere que o cartão do Canal não mostra o Acesso da Integração.
- **Logo:** o print mostrou a Integração com as iniciais "S" ao lado do Canal com o logo. A Integração passou a usar o mesmo vetor do Canal (`logos.tsx`), com teste em `logos.test.tsx` vermelho antes e verde depois.
- Prints: [não conectado](prints/02-nao-conectado.jpg), [precisa configurar](prints/02-precisa-configurar.jpg), [conectado](prints/02-conectado.jpg) e [ferramentas](prints/02-ferramentas.jpg).
