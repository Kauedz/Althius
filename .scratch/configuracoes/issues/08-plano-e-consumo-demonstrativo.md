# 08: Plano e consumo demonstrativo do Workspace

**What to build:** Mostrar o plano atual do Workspace e seu uso demonstrativo, com participantes, Execuções de Agentes e indicação de upgrade futuro.

**Blocked by:** 04: Workspace, participantes e papéis de acesso

**Status:** closed

**Spec:** [Configurações pessoais e do Workspace](../spec.md)

**User Stories:** 34–36.

## Acceptance criteria

- [x] Apresentar nome do plano associado ao Workspace, sem confundir plano com identidade global do usuário.
- [x] Mostrar quantidade de participantes ativos consistente com Pessoas e acesso, sem contar convites pendentes como participantes.
- [x] Mostrar Execuções de Agentes em período explicitamente indicado com dados demonstrativos coerentes; decisões de Aprovação não contam como novas Execuções.
- [x] Refletir alterações de participantes na contagem por meio da mesma fonte compartilhada, inclusive após recarregar.
- [x] Apresentar possibilidade de upgrade com “Em breve”, sem destino quebrado, checkout ou cobrança.
- [x] Não inventar preços, franquias ou limites comerciais; manter apresentação preparada para dados comerciais futuros.
- [x] Testar vínculo ao Workspace, contagem de participantes após remoção, consumo no período e comportamento do upgrade; inspecionar claro/escuro.

## Delivery constraints

- Escopo demonstrativo, em português e desktop; seguir o mock aprovado e as decisões da spec.
- A aprovação do ticket 01 é condição obrigatória, inclusive por dependência transitiva. Verificar comportamento observável, sem testes acoplados a detalhes internos.
- Executar os testes relevantes, regressão do aplicativo, lint e build ao implementar; registrar os resultados no ticket.
- Não incluir conectores em Configurações, integração com Notion, autenticação real ou cobrança real.

## Comments

### 2026-09-25: implementação

Pré-requisitos: o ticket 01 está aprovado, e o ticket 04 está implementado.

**Fonte (contrato em `fonte/tipos.ts`):**
- `plano()` devolve `PlanoDoWorkspace { nome, nomeDoWorkspace, uso }`:
  - `uso` é `UsoDoWorkspace { participantes, convitesPendentes, execucoes }`, ou `null` quando a sessão não participa do Workspace. É a mesma regra de Pessoas e acesso: quem não participa vê só as informações gerais;
  - `execucoes` é `ExecucoesNoPeriodo { inicio, fim, total, porEspecialidade }`, com os dias em ISO.
- O plano é do Workspace: `planos` em `dados-demo.ts` é indexado pelo Workspace, e `simulada-participacoes.ts` monta o plano com os mesmos dados de Pessoas e acesso. Participantes e convites saem das Participações e dos convites persistidos com o Workspace, então a contagem acompanha remoções e convites, também depois de recarregar.
- Execuções de Agentes:
  - o período vai do começo do mês até hoje. A fonte recebe `hoje` (padrão: a data real); `renderizarApp` o fixa em 23/09/2026;
  - a base de exemplo cresce com os dias do mês: `execucoesPorDia` (Scopus 4, Ethos 2, Rhetor 3, Oraculum 1), perto da média das `execucoes` de cada Agente desde a criação do Workspace. Assim o número faz sentido em qualquer dia, e não "218 no dia 1º";
  - as Execuções da sessão somam no mesmo ponto em que sobem as do Agente (`registrarExecucao`). Decidir uma Aprovação é `registrarAcao` e não conta;
  - a divisão é por Especialidade, que inclui os Agentes criados; excluir um Agente criado não apaga o consumo.
- Nenhum preço, franquia ou limite no contrato nem nos dados.

**Aplicativo (`paginas/configuracoes/secao-plano.tsx`), como no mockup aprovado:**
- Selo "Compartilhado com o Workspace".
- Cartão "Plano atual":
  - "Demonstração", "Vale para todo o Workspace Databricks" e o espaço reservado "Preços, franquias e limites aparecem aqui quando estiverem definidos.";
  - "Fazer upgrade" com `aria-disabled`, focável e sem ação nem destino, descrito pelo selo "Em breve".
- Bloco "Uso do Workspace", com a definição de Execução:
  - os indicadores "Participantes ativos" (convites fora da contagem) e "Execuções de Agentes" (com "Período: 1 a 25 de setembro de 2026");
  - a tabela "Execuções por Especialidade no período".
- `formatarPeriodoIsoPorExtenso` e `diaIso` em `fonte/formatar-data.ts`.
- Glossário: nova entrada "Plano do Workspace".

**Diferenças do mockup, de propósito:**
- Números diferentes: os do mockup (Scopus 512 etc.) passavam das `execucoes` totais dos Agentes do aplicativo.
- Tabela em vez de lista, para cada linha ser lida com o número.
- O período fica no indicador de Execuções, e não no bloco inteiro, porque os participantes são de hoje.
- O upgrade é focável (`aria-disabled`) em vez de `disabled`, para quem navega por teclado encontrar o "Em breve".

**Comportamento conhecido:** como as `execucoes` dos Agentes e a Atividade, as Execuções da sessão ficam na memória. Depois de recarregar, a contagem volta à base de exemplo, embora uma proposta de revisão persistida continue na fila.

### 2026-09-25: verificação

- Testes novos em `src/paginas/configuracoes/plano.test.tsx` (7 testes), pelo aplicativo renderizado:
  - vínculo ao Workspace: Administrador e Thiago (Membro, também da Evolut Trading) veem o mesmo plano do Workspace Databricks;
  - um convite registrado em Pessoas e acesso não entra na contagem;
  - a remoção em Pessoas e acesso muda a contagem, também depois de remontar com o mesmo armazenamento;
  - período explícito e Execuções por Especialidade;
  - o pedido ao Scopus pela Memória soma 1. Aprovar a campanha e a revisão na fila não soma;
  - quem não participa vê só o plano;
  - upgrade "Em breve" sem destino, diálogo ou preço.
- Mais 2 testes de `formatarPeriodoIsoPorExtenso`. Em `configuracoes.test.tsx`, a seção ainda não implementada conferida passou a ser Ajuda e informações.
- Mutações conferidas:
  - contar a decisão como Execução derruba o teste da decisão;
  - contar convites como participantes derruba o teste do convite e o da remoção;
  - fixar a contagem derruba o teste da remoção;
  - mostrar o uso a quem não participa derruba o teste de não participante.
- Validação numa cópia de trabalho só com as mudanças deste ticket sobre `61ea206`, porque o onboarding de outra sessão está em andamento no mesmo checkout:
  - `tsc -b --force`: sem erros;
  - `vitest run`: 424 testes em 28 arquivos, todos passando;
  - `oxlint`: termina sem erros; os avisos são de código que já existia;
  - `vite build`: concluído.
  - No checkout compartilhado, junto com o onboarding em andamento, passaram 431 testes.
- Inspeção visual no Chromium headless, desktop de 1440 px, temas claro e escuro:
  - o plano, os indicadores e a tabela;
  - o contorno de foco global no "Fazer upgrade".
  - Num navegador, "Remover do Workspace" e depois recarregar o Plano mostrou 4 participantes. Essa conferência foi feita antes dos ajustes da revisão, e o caminho da remoção não mudou.
  - A visão de quem não participa não é alcançável no navegador (não há troca de sessão) e fica coberta pelos testes.
- Revisão (`/code-review`, Standards e Spec). Aplicado:
  - os testes passaram a registrar o convite, pedir a revisão e decidir pela interface, em vez de chamar a fonte;
  - o plano passou a ser montado em `simulada-participacoes.ts`, onde está o estado do Workspace, sem o acessor de convites criado só para contá-los;
  - quem não participa não recebe o uso;
  - a base de Execuções cresce com os dias do mês, em vez de um número fixo com o período pela data real;
  - nomes: `especialidadeId` e `formatarPeriodoIsoPorExtenso`;
  - saiu o plano sem uso da Evolut Trading;
  - o glossário ficou só com a definição, sem o estado da demonstração.
- Ficaram como estão:
  - nenhum campo opcional de preço ou limite no contrato. Sem dados comerciais, seria generalidade especulativa; o espaço reservado fica na apresentação;
  - o cabeçalho de seção repetido e `abrir`/`Usuario` repetidos nos testes, como nas outras seções e arquivos;
  - o `split('-')` em `formatar-data.ts`;
  - `id` fixo no "Em breve", como nas outras seções;
  - as Execuções da sessão continuam na memória, como os demais contadores dos Agentes.

