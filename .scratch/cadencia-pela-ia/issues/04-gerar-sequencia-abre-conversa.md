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

- [ ] Na Conta-alvo de teste, sob responsabilidade do usuário QA, o botão está visível e o clique navega para `/conversa`.
- [ ] A Conversa aberta contém o pedido inicial para o Rhetor, sem exigir novo clique ou redigitação.
- [ ] A reprodução automatizada salva trace e/ou print do clique, URL antes/depois e versão/commit publicado.
- [ ] A causa é identificada entre: alvo incorreto do Playwright, Conta sem responsabilidade do usuário QA ou versão publicada diferente da `main`.
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
- 2026-10-31, a tentativa de verificar `window.location.pathname` foi descartada porque o teste usa `MemoryRouter`; a presença de `Continuar a Conversa` e do pedido inicial comprova a navegação interna. O teste focal passou 7/7.
