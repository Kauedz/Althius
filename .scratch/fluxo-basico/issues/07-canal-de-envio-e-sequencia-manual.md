Status: ready-for-human
GATE: ready-for-agent
Blocked by: nenhum

# Canal de envio e sequência manual

## Problema

O retorno da autenticação hospedada das Contas remetentes cai em `/conexoes`, mas essa tela não mostra as Contas remetentes nem orienta como deixar uma Sequência pronta para enviar.

## Solução

Reutilizar o bloco de Contas remetentes em Conexões, manter a leitura no mount e cobrir o caminho manual de uma Conta, a ativação sem remetente e o envio falso pela Unipile.

## Pode mexer

- `projeto-althius-frontend/src/paginas/conexoes.tsx`
- `projeto-althius-frontend/src/paginas/configuracoes/bloco-contas-remetentes.tsx`
- `projeto-althius-frontend/src/fonte/*contas-remetentes*`
- `projeto-althius-frontend/src/paginas/detalhe-sequencia.tsx`
- `projeto-althius-frontend/src/paginas/detalhe-conta.tsx`
- `projeto-althius-frontend/src/paginas/nova-sequencia.tsx`
- `supabase/functions/sender-accounts/` e testes necessários
- `e2e/tests/11-canal-de-envio.spec.ts`, `e2e/package.json`

## Não mexa

- `agent-conversation`, `_hermes-worker`, `canal-*`, `slack-*`, `integration-*`, `unipile-account-status`
- lógica de `sequence-step-sends`/`sequence-runner`

## Critérios de aceite

- [x] Conexões mostra Canais de envio com os estados reais de LinkedIn, E-mail e WhatsApp.
- [x] O retorno da autenticação hospedada cai numa página que mostra o novo estado e o mount relê a lista.
- [x] A ativação sem remetente pronto explica o que conectar e leva para `/conexoes`; a recusa do backend é mostrada literalmente.
- [x] Nova sequência a partir de qualquer Conta fica pré-preenchida.
- [x] O caminho de envio é coberto por teste Deno com Unipile falso para LinkedIn e E-mail.
- [x] O smoke `11-canal-de-envio.spec.ts` existe e não escreve dados reais.
- [ ] CI verde.
- [ ] Três `db reset` confirmados pela CI.

## Comments

2026-10-28 — O bloco compartilhado de Contas remetentes passou a aparecer no topo de Conexões com o título “Canais de envio”; a leitura inicial já ocorre pelo hook de carregamento no mount. A cobertura existente confirma a pré-seleção de Conta em Nova sequência e os testes Deno existentes cobrem os envios falsos. O script `smoke:prod` já existia; foi criado o smoke 11. Não há migration nova nem aplicação/deploy a fazer. Kauê ainda precisa conectar LinkedIn e E-mail na Equipe Althius e contratar/confirmar o plano pago da Unipile. CI e os três `db reset` seguem pendentes.

2026-10-28 — Verificação: `npx tsc -b --noEmit` passou; os testes Vitest direcionados passaram (56); lint passou com warnings preexistentes; build passou; `deno check supabase/functions/sender-accounts/index.ts` passou; os testes Deno de envio passaram (63); `cd e2e && npx tsc --noEmit -p .` passou. A suíte Vitest completa foi iniciada, mas ficou sem progresso neste ambiente e foi interrompida; não foi possível declarar a CI verde. O smoke Playwright não foi executado conforme solicitado.

2026-10-28 14h35 — Revisão: a recusa da ativação por Conta remetente não pronta agora diz onde conectar ("Conecte o LinkedIn em Conexões, Canais de envio, antes de ativar.") e o aviso traz o link "Abrir Canais de envio" para `/conexoes`. O "Reconectar" da Sequência pausada pela Conta remetente também leva a `/conexoes`. Teste novo em `contas-remetentes.test.tsx` (Conexões mostra os Canais com o estado real e conecta pela autenticação hospedada). O smoke 11 passou a contar só escritas de verdade (RPCs de leitura são POST) e intercepta `sender-accounts` por predicado, OPTIONS incluído. Rodado contra o backend de produção com o build local: 1/1 verde, sem escrita e sem abrir a Unipile.
