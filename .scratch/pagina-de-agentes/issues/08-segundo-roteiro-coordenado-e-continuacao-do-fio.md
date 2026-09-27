# 08: Segundo roteiro coordenado e continuação do fio

**What to build:** o composer ganha o segundo caso roteirizado e passa a aceitar pedidos em sequência no mesmo fio. **"Como estamos no Perplexity e o que publicar?"** chama o Oraculum, que audita como a Databricks aparece no Perplexity, e o Rhetor, que propõe o conteúdo a publicar, com a resposta consolidada no fim. Depois de uma resposta coordenada, o usuário pode continuar o fio (ex.: depois da abordagem da OpenAI, "agora faz um e-mail pro CFO"), e a Coordenação continua o trabalho a partir do que já foi feito, em vez de recomeçar. Não há histórico de Conversas coordenadas anteriores: o fio vale até recarregar a página.

**Blocked by:** 07 (Composer com Coordenação)

**Status:** closed

- [x] O pedido do Perplexity mostra os passos do Oraculum e do Rhetor e a resposta consolidada
- [x] Esse pedido também está entre as sugestões clicáveis abaixo do composer
- [x] Um pedido seguinte no mesmo fio aparece abaixo da resposta anterior e produz uma resposta que usa o contexto dela (ex.: o e-mail para o CFO da OpenAI chama só o Rhetor)
- [x] O trabalho dos Agentes chamados entra na Atividade de cada um com o gatilho Coordenação

## Comments

**Implementação (23/09/2026):**
- A fonte recebe, junto do pedido, os pedidos anteriores do mesmo fio (`conversarCoordenado(pedido, fio)`). Um roteiro coordenado pode ter continuações, reconhecidas por um termo no pedido seguinte; a do roteiro da OpenAI é "CFO", que chama só o Rhetor e parte da aderência e do Comitê de compra já levantados.
- Na continuação, um Agente criado mencionado antes no fio continua sendo chamado no lugar do padrão da Especialidade dele.
- O composer de continuar o fio fica fixo no rodapé da página da Conversa, só com o chip do Workspace. Um pedido na página de Agentes continua começando um fio novo.
- Um pedido seguinte sem roteiro nem continuação recebe a resposta direta (ou a genérica de quem for mencionado), como no primeiro pedido.

**Triagem (27/09/2026):** todos os critérios já estavam marcados e o código está na `main`; o status tinha ficado para trás. Fechado.
