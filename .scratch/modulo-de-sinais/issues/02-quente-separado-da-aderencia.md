# 02: Derivar Quente dos sinais, separado da Aderência

**What to build:** permitir priorizar Contas-alvo pelos sinais válidos sem perder sua avaliação de Aderência, com contagem, recência e histórico consistentes em todos os consumidores existentes. Seguir o visual aprovado e o ADR 0007.

**Blocked by:** 01 — Mockup visual do módulo Sinais para aprovação, incluindo aprovação visual explícita do usuário.

**Status:** closed

- [x] Compartilhar o armazenamento lógico de sinais, mantendo a fonte de Contas e Contatos como fronteira pública dos consumidores atuais, com operações assíncronas observáveis e uma referência de tempo controlável.
- [x] Cada Sinal identifica Conta-alvo, identidade estável do acontecimento, tipo ou Monitoramento de origem, descrição, data de disparo e fonte/evidência quando disponíveis. Histórico, Último sinal e contagem derivam dos mesmos registros.
- [x] Quente significa ao menos um Sinal válido. Exibir foguinho com quantidade e singular/plural adequados, separado de Fit / Não fit / não avaliada; preservar a Aderência mesmo para contas importadas Não fit ou não avaliadas que recebam sinais.
- [x] Na migração dos dados demonstrativos, preservar o Fit das contas anteriormente classificadas como Quentes. Contas recomendadas continuam com Fit; histórico antigo não torna uma conta permanentemente Quente.
- [x] Cada Sinal é válido desde o disparo até antes de completar 30 dias; no instante da expiração deixa de contar. Data do acontecimento distinta não substitui o disparo, e datas futuras não contam como sinais já disparados.
- [x] Deduplicar o mesmo acontecimento por Conta-alvo, inclusive quando reencontrado em outra coleta, fonte ou Monitoramento: manter a data original e não aumentar contagem ou renovar validade. A identidade explícita dos dados simulados basta.
- [x] Novos acontecimentos têm janelas próprias. Ao expirar um de dois sinais, a contagem cai para um; ao expirar o último, o foguinho some. Histórico e Último sinal podem continuar exibindo sinais expirados.
- [x] Atualizar filtros, ordenações, rótulos e demais consumidores da antiga classificação Quente, mantendo a intenção de priorização e desempate por recência, sem redesenhar Sequências.
- [x] Verificar pelo aplicativo renderizado, fontes injetadas e data fixa os limites imediatamente antes, no instante e depois dos 30 dias, duplicatas, dois sinais, datas futuras e preservação de Aderência e histórico. Preparar cenários pela interface pública da fonte simulada, sem esperas reais.
- [x] Atualizar a cobertura existente que pressupõe Quente como Aderência sem eliminar regressões de Contas, Contatos, Agentes e Sequências. Executar testes pertinentes, build e lint, e inspecionar visualmente contas com um e dois sinais.

## Comments

**Implementação e Verificação (24/09/2026):**
- Criado `src/fonte/regras-sinais.ts` com as regras canônicas de 30 dias (`hoje < expiraEm`), `estaValido`, `foiDisparado` e conversão de datas.
- Separado `Aderencia` (`'fit' | 'nao-fit'`) de `quente` e `totalSinaisValidos` em `src/fonte/contas-tipos.ts`.
- Preservado o `Fit` de todas as 18 contas recomendadas na demo em `src/fonte/dados-contas-demo.ts` (total 26 Fit, 3 Não fit, 1 não avaliada).
- Adicionados métodos `sinais()`, `sinaisDaConta()`, `adicionarSinal()`, projeção dinâmica de `quente` / `totalSinaisValidos` / `ultimoSinal`, deduplicação e controle temporal `definirHoje()` na fonte simulada em `src/fonte/simulada-contas.ts`.
- Atualizada a tabela de Contas (`src/paginas/contas.tsx`) com a coluna `Quente` entre `Empresa` e `Aderência` e ordenação por prioridade (Quentes primeiro com desempate por recência do sinal, depois por aderência e recência).
- Atualizado o cabeçalho e a seção de sinais em `src/paginas/detalhe-conta.tsx` com `Foguinho` e `BadgeAderencia` lado a lado e badges `Válido` / `Expirado`.
- Suíte dedicada em `src/paginas/quente-sinais.test.tsx` cobrindo todos os cenários temporais (29d 23h, 30d exato, 31d, data futura), deduplicação/reencontro, expiração gradual de múltiplos sinais e renderização da UI.
- Cobertura de regressão atualizada em `contas.test.tsx`, `detalhe-conta.test.tsx` e `dados-contas-demo.test.ts`. `npm test`, `npm run build` e `npm run lint` passando com sucesso.

