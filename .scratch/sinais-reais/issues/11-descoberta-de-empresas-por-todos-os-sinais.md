# 11: Descoberta de empresas por todos os Sinais de mercado

**What to build:** ampliar o fluxo de descoberta que já funciona para vagas no mercado para que cada fonte capaz de
identificar uma empresa nova — vagas, anúncios, movimentação de pessoas, avaliações e demais Sinais — possa encontrar
empresas fora da lista de Contas-alvo. Cada fonte mantém seu próprio adaptador, critérios, custo, evidência e chave de
deduplicação; todas entregam o mesmo resultado de domínio para a Caixa de Descobertas.

**Blocked by:** 02: Monitoramento real; 03: Sinais de vagas; 04: Sinais de movimentação; 05: Sinais de anúncios; 06: Sinais de avaliações.

**Status:** ready-for-agent

**Spec e precedência:** seguir a seção "Consolidação do escopo — 31/10/2026" da spec de Sinais reais.
Os bloqueadores 02–06 estão registrados como fechados; conferir a main atual antes de implementar.

## Pode mexer

- Público e catálogo dos Monitoramentos, coleta por fonte, runner e fluxo de candidatas na Descoberta.
- Reserva/liquidação da descoberta por Sinal e aceite de candidatas, para implementar cobrança somente no aceite.
- Fontes e telas correspondentes, testes novos, documentação e migrations aditivas conforme o guia de migrations.

## Ordem de execução e evidência de entrega

1. Conferir a main atual e inventariar as nove fontes: descoberta sem lista, identidade disponível, critérios,
   limitações, custo e evidência real. Não confundir implementação local com fonte publicada e validada.
2. Usar vagas como referência e acrescentar regressão do fluxo completo com Workspace sem Contas cadastradas.
3. Ajustar cobrança do modo mercado, inclusive vagas: custo operacional limitado durante busca; débito atômico junto
   ao aceite, sem Conta criada se a cobrança falhar e sem cobrança dupla por retry, clique concorrente ou candidata
   duplicada. Conta já existente não gera nova cobrança de aquisição. Preço ausente bloqueia ativação comercial.
4. Integrar cada fonte elegível em uma fatia completa: busca específica → evidência → candidata → aceite.
   Prioridade: anúncios LinkedIn/Meta, movimentação, avaliações e Indeed. Não implementar Google Ads como se fosse Meta.
5. Entregar matriz por fonte com testes, limitações e estado de publicação. Fonte inviável não conta como entregue:
   documentar a lacuna e mantê-la desabilitada para descoberta; não marcar o rollout completo com fontes pendentes.

## Critérios

- [ ] O Monitoramento de Mercado aceita uma fonte que consiga identificar empresas novas sem `accountIds`; Monitoramentos de Contas continuam com o comportamento atual.
- [ ] O adaptador de cada fonte é independente: entrada, parser, critérios de confirmação, identidade da empresa, evidência e chave de deduplicação não são compartilhados artificialmente entre LinkedIn, Indeed, Meta, Google Ads, Google Maps ou movimentação de pessoas.
- [ ] Uma empresa nova encontrada por qualquer fonte é deduplicada por identidade e acontecimento antes de criar candidata.
- [ ] A candidata aparece na Caixa de Descobertas com origem, fonte, data e evidência suficientes para decisão humana.
- [ ] Empresa já conhecida recebe o Sinal na Conta existente; empresa nova não vira Conta, não cria Sequência e não envia mensagem antes do aceite.
- [ ] O aceite manual transforma a candidata em Conta-alvo e preserva os Sinais e evidências; depois o fluxo segue para enriquecimento de contatos e prospecção.
- [ ] Candidatas duplicadas ou descartadas não geram cobrança; o teto limita o custo operacional da rodada, e a regra de cobrança do cliente ocorre somente no aceite conforme o contrato de Créditos.
- [ ] Cada adaptador tem teste de sucesso, resposta sem identidade, deduplicação, falha da fonte e evidência; o fluxo comum tem teste ponta a ponta de descoberta até aceite.
- [ ] O catálogo informa, por fonte, se o Sinal descobre empresas no mercado ou apenas monitora Contas existentes.
- [ ] O rollout não altera o comportamento já funcional da descoberta por vagas.

- [ ] Vagas preserva descoberta e evidências, mas passa a seguir a nova cobrança no aceite; a antiga cobrança de 4 créditos por rodada de mercado não permanece ativa nesse fluxo.
- [ ] Sem Contas pré-cadastradas, uma busca elegível encontra candidata com identidade e evento verificáveis; resultados de teste simulados e execução real são relatados separadamente.
- [ ] Isolamento entre Workspaces, saldo insuficiente, aceite concorrente, retries e ausência de preço têm cobertura no banco; nenhuma dessas situações cria cobrança duplicada ou Conta sem aceite concluído.
- [ ] O relatório distingue código/testes concluídos de rollout remoto pendente. Deploy e mudanças remotas seguem as instruções do projeto e sua autorização específica.

## Não mexa

- Nos tickets CRM-10 e CRM-11 da outra sessão sem combinar: esta spec é o detalhamento do CRM-11; quem pegar este ticket avisa o Nan.
- Nas funções de Contatos e nas Edge Functions de envio sem combinar.
- Em segredos de provedores; cada fonte deve passar por "Em teste" antes de "Disponível".
- Em testes existentes: acrescente testes, não remova cobertura.

## Comments

- 31/10/2026: consolidado com a spec existente a pedido do usuário. Implementação pode começar pela conferência da main e pela matriz das fontes; preço do aceite é pendência de ativação comercial, não autorização para inventar valor.

- A descoberta de vagas no mercado é o tracer bullet existente e deve servir como comportamento de referência, não como implementação a ser copiada para todas as fontes.
- O contrato comum é o evento de Sinal normalizado: identidade da empresa, tipo, chave do acontecimento, frase, fonte, evidência e data.
- A fonte pode não ser capaz de descobrir empresas novas. Nesse caso, o catálogo deve declarar que o Sinal é somente para Contas-alvo, sem permitir um falso escopo de mercado.
