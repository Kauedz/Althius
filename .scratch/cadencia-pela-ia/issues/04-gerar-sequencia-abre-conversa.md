# 04: Gerar Sequência abre a Conversa operacional

Spec: [../spec.md](../spec.md) (US 1–3, 5–7).

**What to build:** a partir do detalhe de uma Conta-alvo elegível, o botão **Gerar Sequência** deve abrir `/conversa` e preservar o pedido inicial para o Rhetor na Conversa coordenada.

**Contexto:** na validação automatizada em produção de 31/10/2026, o clique não avançou para `/conversa`. A causa ainda não foi determinada. O teste Vitest do componente passa na `main`; a investigação precisa preservar a evidência da execução real e comparar a versão publicada com a `main`.

**Status:** ready-for-human — o comportamento está coberto no frontend; falta a reprodução em produção com trace/print.

## Pode mexer

- `projeto-althius-frontend/src/paginas/gerar-sequencia.tsx`
- testes do componente `GerarSequencia`
- `e2e/tests/` e `e2e/support/` somente para capturar a reprodução, trace e print
- este ticket e seus anexos em `issues/prints/`

## Não mexa

- migrations, Edge Functions ou banco remoto
- criação de Sequência, aprovação ou ativação de envios
- dados de Workspaces que não sejam o ambiente QA autorizado

## Critérios

- [x] Na Conta-alvo de teste, sob responsabilidade do usuário que clica, o botão está visível e o clique navega para `/conversa` — validação no Chrome de 31/10: `/contas/e501213f-…` → `/conversa`, clique em `button` de nome exato "Gerar Sequência".
- [x] A Conversa aberta contém o pedido inicial para o Rhetor, sem exigir novo clique ou redigitação — a mesma validação mostrou "Continuar a Conversa" com o pedido e o id da Conta.
- [ ] A reprodução automatizada salva trace e/ou print do clique, URL antes/depois e versão/commit publicado — parcial: a validação no Chrome registrou a URL antes e depois, mas não guardou print nem trace no ticket nem informou o bundle. Fecha com uma execução verde do smoke 09.
- [ ] A causa é identificada entre: alvo incorreto do Playwright, Conta sem responsabilidade do usuário QA ou versão publicada diferente da `main` — provável, não confirmada: a versão publicada é a mesma da `main` (bundle lido em 31/10), e o clique pelo nome exato navega. O mais provável é que a tentativa de 31/10 tenha acertado "Criar sequência", mas o trace dela não existe mais para confirmar.
- [x] O teste Vitest do componente confirma a tela de Conversa (`Continuar a Conversa`) e a preservação do pedido inicial; o harness usa `MemoryRouter`, portanto a URL do navegador não é uma asserção válida.
- [x] `lint`, `tsc -b` e build do frontend passam localmente.

## Como testar

- Reproduzir com Playwright em uma Conta QA criada exclusivamente para o teste.
- Registrar `page.url()` antes e depois do clique, screenshot e trace.
- Confirmar, somente por leitura, o usuário responsável pela Conta e o commit/versão publicada.
- Rodar `npx vitest run src/paginas/gerar-sequencia.test.tsx`, lint, `tsc -b` e build.

## Passos do Nan

- Publicar a correção somente depois que a causa estiver identificada e o CI passar.
- Repetir a validação em `https://app.althius.com.br` e anexar o trace/print ao ticket.

## Comments

- 2026-10-31, a tentativa automatizada em produção não avançou para `/conversa`; a recusa foi validada por outro caminho e não prova este critério de interface.
- 2026-10-31, hipóteses abertas: Playwright clicou fora do botão; a Conta não estava sob responsabilidade do usuário QA; ou a produção estava em versão diferente da `main`.
- 2026-10-31, o teste Vitest focal passou 7/7, mas isso não substitui o trace/print de produção.
- 2026-10-31, uma proposta de mudança no smoke 09 foi descartada: ela recolocava `getByRole('dialog')` depois da navegação, uma verificação que nunca falha porque a tela da Conta já saiu, e uma anotação fixa de "clique confirmado" gravada sem verificar nada.
- 2026-10-31, validação sem Playwright (feita pelo GPT, fora desta sessão) na sessão autenticada do Chrome, com o usuário renan.zanato no Workspace "Equipe Althius" e a Conta "QA Recusa Sequência 20261031" (`e501213f-8bd9-48ed-8000-ea0ebea14523`). A tela mostrou "Gerar Sequência" e "Criar sequência" separados. O clique pelo nome exato levou de `/contas/e501213f-…` para `/conversa`, com "Continuar a Conversa" e o pedido. Nenhum modal apareceu. Isso prova os critérios 1 e 2. Diferente do smoke, nada foi interceptado: o clique começou uma Conversa coordenada real nesse Workspace, com rodada de Agente e créditos, e pode ter deixado uma proposta de Sequência pendente. Conferir e, se houver, recusar.
- 2026-10-31, a tentativa de verificar `window.location.pathname` foi descartada porque o teste usa `MemoryRouter`; a presença de `Continuar a Conversa` e do pedido inicial comprova a navegação interna. O teste focal passou 7/7.
- 2026-10-31, apuração sem credenciais (só leitura do bundle público): `https://app.althius.com.br` serve `/assets/index-DSU_wtzI.js`, e o `GerarSequencia` publicado é o mesmo da `main`: `coordenar({texto})` seguido de `navegar('/conversa')`. Para este botão, a hipótese "versão publicada diferente da `main`" cai. Ao lado dele, no mesmo bloco, fica o botão "Criar sequência", que abre um modal na própria Conta e não navega. Um clique por texto ou por regex sem distinguir maiúsculas ("sequência") acerta esse botão e produz exatamente "não avançou". É a hipótese mais provável (alvo incorreto do Playwright); confirmar no trace da tentativa de 31/10.
- 2026-10-31, `e2e/tests/09-pedir-sequencia.spec.ts` passou a registrar o bundle no ar, a URL antes e depois do clique e um print depois do clique. Ele também confere que "Criar sequência" está ao lado e que o clique em "Gerar Sequência" não abre modal. Ainda não rodou: nesta máquina não há Node nem `~/.althius-qa.env`. Para rodar, siga "Como rodar" em `e2e/README.md`, só com `tests/09-pedir-sequencia.spec.ts`. O spec guarda o trace sempre (`test.use({ trace: 'on' })`) e, mesmo se o clique não navegar, a URL antes e depois e prints antes e depois do clique. A versão sai pelo nome do bundle, porque o publish não expõe o commit; ligar o nome a um SHA da `main` exige um build da `main` ou ler `/opt/althius-web/COMMIT` na VPS. A Conta continua de mentira, só no navegador, como manda o `e2e/README.md` (o smoke não grava em produção). Por isso este spec não testa a hipótese "Conta sem responsabilidade do QA": a responsabilidade é simulada. Com ele verde, ficam provados os critérios 1 e 2 e a parte de trace, print e URL do 3. A causa da tentativa de 31/10 só sai do trace dela.
