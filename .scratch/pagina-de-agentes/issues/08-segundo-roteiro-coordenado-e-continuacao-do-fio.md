# 08: Segundo roteiro coordenado e continuação do fio

**What to build:** o composer ganha o segundo caso roteirizado e passa a aceitar pedidos em sequência no mesmo fio. **"Como estamos no Perplexity e o que publicar?"** chama o Oraculum, que audita como a Databricks aparece no Perplexity, e o Rhetor, que propõe o conteúdo a publicar, com a resposta consolidada no fim. Depois de uma resposta coordenada, o usuário pode continuar o fio (ex.: depois da abordagem da OpenAI, "agora faz um e-mail pro CFO"), e a Coordenação continua o trabalho a partir do que já foi feito, em vez de recomeçar. Não há histórico de Conversas coordenadas anteriores: o fio vale até recarregar a página.

**Blocked by:** 07 (Composer com Coordenação)

**Status:** ready-for-agent

- [ ] O pedido do Perplexity mostra os passos do Oraculum e do Rhetor e a resposta consolidada
- [ ] Esse pedido também está entre as sugestões clicáveis abaixo do composer
- [ ] Um pedido seguinte no mesmo fio aparece abaixo da resposta anterior e produz uma resposta que usa o contexto dela (ex.: o e-mail para o CFO da OpenAI chama só o Rhetor)
- [ ] O trabalho dos Agentes chamados entra na Atividade de cada um com o gatilho Coordenação
