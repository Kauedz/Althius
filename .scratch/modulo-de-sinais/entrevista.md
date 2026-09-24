# Módulo de Sinais

Status: Proposta consolidada — aguardando confirmação de entendimento ao final da entrevista; não implementado.

## Experiência consolidada do mockup

1. **Entrada Sinais:** página principal com catálogo de cards, busca, filtros Todos / Externos / Internos / Originados, Criar sinal personalizado em destaque e Sinais encontrados em acesso discreto. Cada card informa quantos Monitoramentos daquele tipo estão ativos. A cobertura ampliada está em [catalogo.md](catalogo.md).
2. **Página do tipo:** clicar em um card abre uma página própria, mantendo a linguagem visual da Althius. Apresenta o tipo, os Monitoramentos existentes e Novo monitoramento, com configuração por campos específicos. A apresentação dos Monitoramentos é provisória e será avaliada visualmente no mockup.
3. **Personalizado:** página própria com descrição livre do objetivo e fonte quando conhecida; a Althius simula a preparação de critérios editáveis. O Cliente revisa os critérios antes de ativar. Apify é a direção futura de coleta, sem exigir configuração técnica do Cliente.
4. **Público:** acompanhar uma lista de Contas-alvo, descobrir empresas por perfil ou ambos. Recomendar sempre o público das configurações do Cliente, representado por dados simulados. Não construir a área de configurações de público agora.
5. **Monitoramentos:** múltiplas configurações por tipo, cada uma com nome, critérios, edição e pausa. Estados propostos: Rascunho, Ativo, Pausado e, para personalizado, Em preparação. Prazos de detecção são ajustáveis ao negócio; não se confundem com a validade de um Sinal disparado.
6. **Resultados:** Sinais encontrados alterna a página principal para uma lista simples com empresa, descrição do sinal e data de disparo, com retorno ao catálogo. O registro é o mesmo usado em Último sinal da lista de Contas-alvo; preservar acesso à evidência de origem sem adicionar complexidade à listagem.
7. **Contas-alvo:** um Sinal válido torna a conta Quente, exibida com foguinho e quantidade de sinais válidos. Fit / Não fit continua como avaliação de Aderência separada. Não há níveis adicionais quando mais sinais disparam, nem promessa de compra.
8. **Validade:** cada Sinal mantém sua validade por 30 dias a partir do disparo. O histórico permanece depois disso. Quando a conta não tiver Sinais válidos, deixa de exibir a condição Quente. Um novo Sinal tem uma janela própria; reencontrar o mesmo acontecimento não cria outro Sinal nem reinicia a janela. Pausar o Monitoramento interrompe novas detecções e preserva os sinais já encontrados.
9. **Deduplicação:** o mesmo acontecimento conta uma vez, mesmo se reencontrado em coletas, fontes ou Monitoramentos diferentes. A identidade é o acontecimento, não cada vez que uma coleta o encontra.
10. **Limites:** dados e preparação simulados; sem coleta real, contatos reais, nova Especialidade de Agente ou implementação da área de configurações de público. Sinais fornece informações aos agentes; a responsabilidade por executar verificações originadas fica para a integração futura.

## Intenção confirmada

Criar um módulo de sinais de possível compra na Althius. A abrangência desejada inclui abertura de vagas, movimentação de profissionais, visitas ao site do Cliente, anúncios de investimento, participação em fóruns econômicos, notícias e sinais personalizados a partir de fontes externas.

Exemplo de personalização: consultar uma API com registros municipais relacionados a terrenos ou imóveis para identificar empresas com possíveis projetos imobiliários. A disponibilidade da fonte e os critérios de interpretação ainda precisam ser definidos.

A referência de produto indicada pelo usuário é Front Runner, representada por quatro imagens de um catálogo. A referência de método é Matt Pocock, por meio da skill grill-with-docs; não é Match.com. Nenhuma alegação de investimento na empresa de referência foi validada.

## Referência fornecida nas imagens

Os cards incluem registros empresariais, primeira contratação de GTM, mudança de empresa de antigos compradores, visitas à página de preços, contratações de RevOps, rodadas de investimento, participantes de conferências, acompanhamento de repositórios, monitoramento de respostas, negociações paradas, mudança de tecnologia, novo escritório, linguagem de vagas, participação em podcasts, avaliações no G2, possível saída de clientes de concorrentes, crescimento de equipes e menções de parceiros.

Esses exemplos são inspiração, não requisitos aprovados nem comprovação de disponibilidade ou precisão das fontes. Os filtros exibidos abrangem outras categorias do produto de referência além de Signals.

## Contexto existente

- CONTEXT.md define Sinal como evidência de possível necessidade comercial de uma Conta-alvo, distinta de Interação, com origens externa, interna ou originada por ação de Agente.
- O frontend apresenta sinais simulados na listagem e no detalhe de Contas-alvo; não possui catálogo ou configuração de monitoramento.
- ADR 0003 estabelece o protótipo simulado existente.
- ADR 0006 estabelecia Aderência única e Quente implicando Fit. A decisão desta entrevista substitui essa relação: um Sinal disparado torna a conta Quente, independentemente da leitura de Aderência. A apresentação dessa distinção ainda será fechada.

## Validação restante e escopo futuro

- Confirmar o entendimento da experiência consolidada antes de implementar.
- Avaliar visualmente a apresentação dos Monitoramentos no mockup, conforme pedido do usuário.
- Identificação real de empresas/pessoas, integração das fontes e execução de ações para originar sinais ficam para a integração futura. Os exemplos do mockup serão associados a Contas-alvo simuladas.

## Decisões confirmadas na primeira rodada

- A primeira entrega é um mockup com dados simulados, sem coleta real.
- O módulo acompanha Contas-alvo importadas e descobre empresas novas recomendadas pela Althius a partir de sinais.
- A página principal concentra catálogo e acesso discreto aos resultados. Clicar em um card abre uma página própria de configuração do sinal, não um painel lateral. O foco é catálogo/criação; resultados têm apresentação simples.
- O escopo inclui sinais internos de CRM e sinais externos de mercado, incluindo contratações e informações financeiras, além dos personalizados. O catálogo de tipos exatos ainda será refinado.
- Para sinais personalizados, o Cliente descreve o que quer monitorar e pode indicar o site. A Althius intermedeia a preparação da coleta; configurar tecnicamente APIs não é tarefa do Cliente. No mockup essa preparação será simulada.
- Apify foi confirmada como plataforma prevista para coleta futura, usando Actors. A viabilidade por fonte será tratada na integração real; nesta entrega a coleta é simulada.

## Decisões confirmadas na segunda rodada

- A página própria de configuração mantém o fluxo de definir o que acompanhar, revisar critérios e ativar. A forma de combinar conversa e campos ainda será detalhada.
- São permitidos vários Monitoramentos do mesmo tipo, com nomes, critérios e pausa independentes (por exemplo, vagas de RH e vagas de engenharia).
- Respostas comerciais e interpretações do conteúdo de uma resposta não são sinais na filosofia deste módulo. Condições históricas e temporais são sinais: negociação parada há X meses, Conta-alvo sem resposta há X tempo, proposta recusada há X tempo.
- O histórico comercial é preservado e ligado à evidência de origem do Sinal.
- Existem sinais externos, internos e originados. O exemplo de lead oculto representa uma ação conduzida por um Agente para investigar uma possível necessidade comercial, como ausência de resposta no atendimento.
- A proposta inicial era um Agente conectado a WhatsApp, LinkedIn ou e-mail conduzir ações para originar sinais. Na terceira rodada, a definição de um executor foi adiada: Sinais é um módulo próprio e os agentes recebem suas informações. Não haverá contatos reais no mockup.
- A ausência de resposta é o fato observado; sua interpretação como problema e necessidade comercial depende dos critérios que ainda serão definidos.

## Decisões confirmadas na terceira rodada

- Tipos prontos usam campos específicos, como cargos, localização e período. Sinais personalizados começam por descrição livre, transformada pela Althius em critérios editáveis antes da ativação; essa transformação é simulada no mockup.
- Cada Monitoramento permite selecionar uma lista de Contas-alvo, descobrir empresas por perfil ou ambos.
- Sempre que houver seleção de público, recomendar o público definido nas configurações do Cliente. Esse público será simulado; construir a área de configurações de público está fora desta entrega.
- Sinais é um módulo próprio que fornece informações aos agentes. Não criar agora um agente específico para conectar sinais nem exigir a escolha de um executor. A execução de sinais originados será detalhada posteriormente.
- Critérios e prazos são ajustáveis conforme o negócio e cada Monitoramento, sem limiar universal. Exemplos de prazo são sugestões editáveis, não regras fixas. O ciclo comercial do Cliente orienta a escolha.
- O catálogo terá busca e filtros Todos, Externos, Internos e Originados, botão destacado Criar sinal personalizado e indicação da quantidade de Monitoramentos ativos por tipo.

## Decisões confirmadas na quarta rodada

- Ampliar o catálogo externo para cobrir amplamente os tipos do mercado, incluindo os exemplos fornecidos nas imagens. Ver catalogo.md para a coletânea de referência; não tratar a lista como comprovação de integração real nem como inventário universal fechado.
- Sinais originados abrangem testes e verificações conduzidos para encontrar necessidades: teste de atendimento é um exemplo; uma verificação de erros no site via API é outro.
- A página do tipo pode mostrar Monitoramentos existentes, Novo monitoramento e os estados propostos. Essa apresentação será avaliada visualmente no mockup e pode ser simplificada se prejudicar a experiência.
- Sinais encontrados será uma lista simples com Conta-alvo, sinal disparado e data de disparo, acessível pela página principal. O mesmo registro deve alimentar Último sinal na lista de Contas-alvo, evitando resultados divergentes.
- Qualquer Sinal disparado torna a Conta-alvo Quente. Dois ou mais sinais mantêm Quente e alteram apenas a quantidade exibida; não criam níveis de temperatura nem garantem compra. A condição Quente não representa a avaliação de encaixe no ICP.
- No código atual, o foguinho está ligado ao valor Quente de Aderência; a contagem aparece no detalhe da conta, não no foguinho da tabela. O modelo precisará ser ajustado à regra definida.

## Decisões confirmadas na quinta rodada

- Mostrar foguinho com quantidade de Sinais válidos: um sinal ou dois sinais, mantendo Quente sem novos níveis e preservando Fit / Não fit separadamente.
- A janela escolhida é de 30 dias após o disparo. O usuário considerou sete dias, mas definiu trinta para permitir priorização e estratégias de aquecimento antes da abordagem.
- Reencontrar a mesma vaga ou acontecimento conta como um único Sinal.
- A consolidação explicita as consequências dessas regras: cada Sinal tem sua janela; uma duplicata não renova a data; a contagem considera sinais válidos e o histórico é preservado.

## Registro da entrevista

2026-09-24: usuário corrigiu as referências para Front Runner e Matt Pocock e forneceu imagens do catálogo. As perguntas da primeira rodada ainda não foram respondidas; recomendações do assistente não são decisões aceitas.

2026-09-24, rodada seguinte: usuário respondeu às cinco perguntas; decisões registradas acima. Recomendações ainda não respondidas continuam em aberto.

2026-09-24, segunda rodada: usuário respondeu Q6–Q10, substituiu painel lateral por página própria, aprovou múltiplos Monitoramentos, delimitou sinais internos temporais, confirmou Apify e definiu a condução de sinais originados por Agente.

2026-09-24, terceira rodada: usuário aprovou Q11, Q12 e Q15; definiu público recomendado simulado, adiou a responsabilidade de execução por agentes e confirmou critérios temporais ajustáveis ao negócio em Q14.

2026-09-24, quarta rodada: usuário aprovou a estrutura de Q16–Q18 com ampliação do catálogo e revisão visual futura; rejeitou Q19 e determinou que todo sinal disparado torna a conta Quente.

2026-09-24, quinta rodada: usuário aprovou Q20, definiu 30 dias em Q21 e confirmou deduplicação em Q22. Experiência consolidada para confirmação final do entendimento.
