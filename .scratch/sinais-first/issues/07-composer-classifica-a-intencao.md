# 07: Composer classifica a intenção do pedido

**Status:** ready-for-agent

**Hermes:** não

**GATE:** Segue a [ADR-0033](../../../docs/adr/0033-sinais-first.md) (Aceita) e a [spec](../spec.md). Migration só aditiva, com pgTAP próprio; migration já aplicada nunca é editada, função existente redefinida a partir da última definição na `main`. Sem aplicar no remoto, sem deploy, sem segredo. O Cliente vê só créditos; nada de letra de nicho A–H.

**Blocked by:** 06 (Modelos: card lança um Plano-semente)

**Decisões:** D2 (o composer de `/` sugere Modelo primeiro, ou monta Plano novo, ou responde direto) da ADR-0033.

## O que construir

- O composer de `/` (`src/conversa/composer.tsx`, hoje usado só para a Coordenação entre os 4 Especialistas) ganha um passo novo antes de qualquer resposta: classificar o pedido entre três caminhos — **combina com um Modelo** do catálogo (ticket 06), **precisa de um Plano novo** (seguiria para o `signal-plan`, que é o ticket 08) ou **pedido geral**, sem relação com Sinal.
- Para "combina com um Modelo": o composer busca nos Modelos pelo mesmo mecanismo de busca/filtro que já existe na tela do catálogo (`pagina-sinais.tsx`) e, achando um bom candidato, mostra a sugestão como um cartão clicável dentro da própria resposta do composer, com a opção de abrir aquele Modelo ou continuar descrevendo o próprio Sinal.
- Para "pedido geral": o composer responde direto, em texto, sem tentar criar nada — o mesmo comportamento que uma pergunta genérica já tem hoje na Coordenação (ADR-0004), só que sem mais rotear para nenhum Especialista. Esse caminho (`resposta_direta` em `coordenarPedido`, `_shared/orquestracao.ts`) já grava com `agent_id = null` e não depende de nenhuma linha em `private.agents` existir, nem hoje nem depois do ticket 13 (parar de semear) — não precisa de engine novo.
- Este ticket entrega a classificação e as duas respostas mais simples (sugestão de Modelo, resposta direta); o terceiro caminho ("precisa de Plano novo") só mostra, por enquanto, que o pedido foi entendido como um Sinal novo, sem ainda chamar `signal-plan` nem salvar nada — essa parte é o ticket 08, para manter este ticket do tamanho de uma sessão.
- O limiar de confiança da classificação é uma decisão pendente (regra 15 da spec): fica isolado numa constante do servidor, nunca tratado como definitivo.

## Pode mexer

- `projeto-althius-frontend/src/conversa/composer.tsx` e `src/paginas/agentes.tsx` (ou o que a substituir, conforme o ticket 10 decidir sobre a tela `/`), com testes.
- Uma função de leitura/classificação nova, só de consulta (sem gravar Sinal nenhum), que cruza o texto do pedido com os Modelos existentes.
- Migration nova só se a classificação precisar registrar alguma preferência/estado do lado do servidor (ex. para medir o limiar); pgTAP correspondente.

## Não mexa

- `signal-plan`, `save_signal_plan` e qualquer gravação de `private.signal_monitors`: ficam para o ticket 08.
- A Coordenação entre os 4 Especialistas (`_shared/orquestracao.ts`, `agent-conversation`): este ticket não remove nem usa esse caminho; a retirada é a trilha 10–15.
- Arquivos do Kauê listados na spec.
- `projeto-althius-frontend/src/paginas/conexoes.tsx`, conectores e canais: área do Renan.
- Migrations já aplicadas.
- O motor dos Agentes e o worker do Hermes.

## Critérios

- [ ] Um pedido parecido com um Modelo existente mostra a sugestão daquele Modelo, clicável, sem criar nada sozinho.
- [ ] Um pedido genérico ("o que é Aderência?") recebe resposta direta, sem sugestão de Modelo nem indício de que um Sinal será criado.
- [ ] Um pedido que não combina com nenhum Modelo é reconhecido como candidato a Plano novo, mas não cria nem salva nada neste ticket (mensagem clara de "em construção" ou equivalente, sem quebrar a experiência).
- [ ] Nenhuma letra de nicho A–H nem termo técnico de cascata aparece na resposta do composer.
- [ ] pgTAP (se houver tabela nova): isolamento por Workspace; três `supabase db reset && supabase test db` verdes.
- [ ] Vitest, lint e build verdes; CI verde nos três jobs.

## Passos do Nan

Nenhum passo manual no PR do ticket além da revisão. Depois do "Sim, aplica e publica" do Kauê, o Grok Bot aplica a migration (se houver) e publica o frontend.

## Comments
