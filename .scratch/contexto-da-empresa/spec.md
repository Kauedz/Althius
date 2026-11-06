# Spec: Contexto da empresa — experiência do AI Context do Clay

**Status:** ready-for-agent
**Decisão do produto:** entrevista concluída e síntese solicitada em 05/11/2026.

## Problem Statement

O Playbook distribui a configuração comercial entre várias seções e exige trabalho manual sem garantir que o ICP vire um recorte executável de empresas. O usuário quer informar seu site e encontrar uma descrição útil da empresa, de seus clientes ideais e das pessoas que compram. Mercado precisa usar esse entendimento de forma verificável.

## Solution

Substituir integralmente o Playbook por Contexto da empresa em Configurações. A referência de experiência é a página AI Context do Clay inspecionada nesta conversa: site e ação de geração, seguidos por três grandes campos de texto editáveis — Empresa, Perfil de cliente ideal e Personas — e salvamento explícito das edições.

O onboarding coleta empresa e site e inicia a geração. A primeira geração bem-sucedida fica salva e vigente automaticamente, sem aprovação extra. Quem pular informa o site depois nas configurações. Só o Administrador altera o contexto. Uma nova geração apresenta sugestão para aceitar ou descartar, preservando o conteúdo vigente até o aceite.

Primário e secundários são partes escritas do mesmo campo de ICP. Não há cards de perfis, aprovação individual por ICP, formulário firmográfico ou questionário adicional obrigatório. Mercado transforma o texto vigente em filtros preenchidos e ajustáveis, e identifica critérios que a fonte não consegue aplicar.

## User Stories

1. Como Administrador, quero informar empresa e site no onboarding, para receber contexto sem redigir um playbook.
2. Como Administrador, quero que a primeira geração fique vigente automaticamente, para começar a operar com a configuração pronta.
3. Como participante, quero pular a etapa de site e retomá-la depois, para concluir minha entrada sem bloqueio geral.
4. Como Administrador, quero informar o site em Configurações quando ele faltar, para iniciar a geração posteriormente.
5. Como participante, quero ver o andamento da leitura, para saber se o contexto ainda está sendo gerado.
6. Como Administrador, quero saber quando a leitura falhar, para tentar novamente ou preencher o conteúdo manualmente.
7. Como participante, quero ler o que a empresa faz e vende, para compreender sua proposta comercial.
8. Como participante, quero ler ICP primário e secundários no mesmo texto, para compreender os segmentos atendidos.
9. Como participante, quero consultar personas detalhadas, para identificar os compradores dentro das empresas.
10. Como Administrador, quero editar e salvar os três textos, para corrigir o entendimento da Althius.
11. Como participante sem administração, quero consultar o contexto vigente, para operar com a mesma referência da equipe.
12. Como Administrador, quero gerar novamente a partir do site, para atualizar o contexto.
13. Como Administrador, quero aceitar ou descartar uma nova sugestão, para preservar minhas correções até decidir substituí-las.
14. Como participante, quero que os Agentes usem o contexto vigente, para receber respostas coerentes com o negócio.
15. Como participante, quero abrir Mercado com filtros derivados do ICP, para buscar empresas compatíveis.
16. Como participante, quero ajustar esses filtros antes da busca, para experimentar um recorte específico.
17. Como participante, quero ver quais critérios não foram aplicados pela fonte, para saber o que precisa de verificação posterior.
18. Como participante, quero distinguir dados ausentes de critérios atendidos, para avaliar corretamente a Aderência.
19. Como Administrador, quero que edições orientem as próximas operações, para atualizar a estratégia sem alterar o histórico.
20. Como participante, quero preservar Contas-alvo e execuções anteriores, para manter a continuidade comercial.
21. Como Administrador de um Workspace existente, quero gerar o contexto do zero pelo site, para adotar a nova experiência sem importar o Playbook.
22. Como participante, quero encontrar somente Contexto da empresa na configuração comercial, para evitar configurações duplicadas.
23. Como Administrador, quero sugestões adequadas ao negócio e ao estágio da empresa, para não partir de segmentos genéricos ou incompatíveis.
24. Como participante, quero que uma falha de geração ou tradução seja informada, para não confundir erro com ausência de mercado.

## Implementation Decisions

### Referência de produto

- Reproduzir a estrutura e a interação da tela AI Context do Clay observada: domínio, gerar, descrição da empresa, ICP, personas e salvar. Usar os componentes e a identidade visual da Althius.
- A referência é essa tela específica, não o Knowledge Hub em rollout, suas cinco seções ou uma reprodução completa do produto Clay.
- Empresa descreve ofertas, problemas resolvidos e diferenciais. ICP descreve companhias atendidas, primário e secundários, características, necessidades, exclusões e recortes sugeridos pertinentes. Personas descrevem cargos, responsabilidades, objetivos, dores e participação na compra, relacionados aos segmentos quando necessário.
- Produzir textos ricos e úteis. O formato narrativo pode conter títulos e listas dentro dos campos; não converter Configurações em formulário de filtros.

### Geração e vigência

- Ler páginas pertinentes do site, como soluções, produtos, sobre, clientes e casos. Considerar oferta, modelo comercial e evidências para inferir clientes prováveis. A idade da empresa isoladamente não determina se ela pode vender a enterprise.
- Gerar os três textos como um conjunto coerente. Distinguir a empresa analisada, seus compradores e os compradores de seus clientes.
- Permitir sugestões fundamentadas sem exigir entrevista adicional. Não apresentar hipóteses como fatos comprovados, inventar clientes ou números financeiros, nem tratar ausência de informação como restrição.
- Guardar procedência da geração e versão para diagnóstico e rastreabilidade, sem acrescentar uma quarta seção à tela.
- Estados observáveis: sem contexto, gerando, vigente, sugestão de atualização disponível e falha. A primeira geração completa bem-sucedida torna-se vigente automaticamente. Nova geração só substitui a versão vigente após aceite do Administrador.
- Edição manual salva vira vigente imediatamente. Descartar sugestão conserva a versão atual. Falha na nova leitura também conserva o conteúdo atual.
- Uma resposta atrasada de geração não pode sobrescrever edição mais recente. Repetições do mesmo processamento não criam gravações ou cobranças duplicadas.
- Falha ou site insuficiente deve produzir mensagem clara e permitir nova tentativa ou preenchimento manual. Onboarding pode terminar; operações dependentes de ICP suficiente indicam a pendência e levam às configurações.
- Administrador altera; participantes ativos consultam; toda autorização e isolamento por Workspace são garantidos no servidor. A geração inicial é consequência autorizada do cadastro da empresa/site no fluxo de configuração do Workspace.

### Texto para filtros e execução

- Uma interface de contexto vigente fornece os três textos e sua versão aos consumidores. Não manter o mini-ICP e o Playbook como fontes comerciais concorrentes.
- O módulo de preparação de busca recebe o contexto vigente e devolve filtros validados, vínculo ao texto de origem e critérios pendentes. Reutilizar as fronteiras atuais de busca e fontes do frontend.
- A interpretação por IA produz dados estruturados; validação no servidor verifica tipos, intervalos, unidades, localizações e valores aceitos. Não depender de rótulos obrigatórios digitados no texto.
- Traduzir os critérios para os parâmetros realmente disponíveis em cada fonte. Setor, modelo de negócio, funcionários, porte cadastral e faturamento são conceitos distintos; sede e região de atuação também.
- Não inventar faixa numérica a partir de expressão ambígua como “médio porte”. Restrições não determinadas ficam sem aplicação automática e visíveis na preparação da busca quando relevantes.
- Em Mercado, mostrar os filtros preenchidos e permitir ajustes antes de executar. Ajustes locais afetam aquela busca, sem reescrever o contexto salvo.
- Preservar combinações de perfis: setor e porte de um ICP não devem ser misturados aos de outro, gerando empresas que não atendem a nenhum. Quando a fonte não suporta alternativas completas, executar recortes separados e deduplicar resultados, respeitando os limites e custos existentes.
- Critérios sem suporte direto ficam explicitamente pendentes de qualificação posterior. Não afirmar Aderência confirmada com base em requisito não verificado. Não relaxar silenciosamente filtros para produzir resultados.
- Registrar versão do contexto e filtros efetivamente usados. Edição posterior afeta novas operações; buscas em execução e histórico conservam sua referência. Filtros derivados de uma versão antiga precisam ser atualizados antes de uma nova execução automática.
- Resultados vazios significam ausência de resultados naquele recorte e fonte; não comprovam inexistência de empresas no mercado.

### Retirada do Playbook

- Remover navegação, telas, importação e edição do Playbook da experiência final; redirecionar entradas antigas para Contexto da empresa quando apropriado.
- Gerar conteúdo do zero, sem copiar ou resumir nenhuma seção do Playbook atual. Workspaces existentes usam o site cadastrado ou recebem a solicitação para informá-lo.
- Preservar dados históricos, Contas-alvo e execuções. A retirada do produto não autoriza apagar dados legados nem reclassificar toda a base automaticamente.
- Migrar os consumidores operacionais: onboarding, Agentes, Mercado, Aderência e geração de Sequências passam a usar o novo contexto. Remover dependências de seções que deixam de existir; operações que precisem de configuração própria continuam obtendo-a no fluxo correspondente, sem recriar um Playbook oculto.
- Manter as quatro Especialidades e os contratos de execução independentes. A decisão atual substitui a origem de ICP e o mini-ICP obrigatório previstos na decisão 6 da ADR-0034. Atualizar a documentação de domínio correspondente durante a implementação, preservando as demais decisões dessa ADR.
- Validar URLs públicas e redirecionamentos, limitar coleta e tratar páginas como conteúdo de referência, sem executar instruções nelas contidas. Reutilizar infraestrutura de leitura e geração quando compatível.

## Testing Decisions

A Q15 aprovou verificar entendimento de negócios diferentes e a tradução em filtros. A fronteira principal é o fluxo observável onboarding/configurações → contexto vigente → preparação e execução da busca. Preferir as fontes e contratos existentes, com site, IA e fornecedor substituídos por respostas controladas nos testes de integração. Não testar detalhes privados ou igualdade exata do texto gerado.

- Usar como precedentes os testes atuais de onboarding, leitura/edição de conteúdo do Workspace, critérios e handler de descoberta de contas, permissões e isolamento, e execução de Sequências pelo Rhetor.
- Cobrir geração inicial com vigência automática, onboarding pulado, retomada, falha, nova tentativa, edição manual, aceite/descarte de nova geração e concorrência com edição.
- Verificar escrita exclusiva de Administrador e leitura restrita ao Workspace correto.
- Verificar que Configurações contém os três textos e controles da referência, sem campos firmográficos, cards de aprovação por perfil ou seções do Playbook.
- Verificar tradução fiel de intervalos, unidades, exclusões, geografia e múltiplos perfis; ajustes de busca não alteram contexto; versões antigas não alimentam novas execuções inadvertidamente.
- Verificar critério não suportado, dado desconhecido, fonte indisponível e busca vazia como resultados distintos.
- Avaliar qualidade com sites de SaaS, indústria, consultoria, empresa nova, negócio com vários ICPs e site insuficiente. Usar uma rubrica: compreensão da oferta; identificação de companhias plausíveis; personas coerentes; distinção de fatos e inferências; ausência de invenção; correspondência entre narrativa e filtros.
- Para cada caso, preparar expectativas revisadas por uma pessoa. Falhas graves incluem confundir a empresa com seus compradores, inventar evidência ou converter hipótese em filtro obrigatório sem base. Esses casos impedem considerar a funcionalidade pronta.
- Fazer avaliação visual contra a tela Clay observada e teste ponta a ponta do percurso completo. Confirmar ausência do Playbook e preservação de Contas-alvo, histórico e funcionamento das Sequências e Especialidades.

## Out of Scope

- Knowledge Hub, seções adicionais, documentos anexados ou questionário obrigatório de qualificação.
- Aprovação por ICP, cadastro estruturado de perfis em Configurações ou reaproveitamento do Playbook.
- Reproduzir a base de dados, prompts privados ou infraestrutura interna do Clay.
- Apagar dados históricos, reclassificar toda a base ou alterar campanhas em andamento automaticamente.
- Reescrever Sinais, CRM, cobrança, cadências ou substituir as quatro Especialidades.

## Further Notes

Referência de interface: https://app.clay.com/workspaces/482340/settings/ai-context, inspecionada autenticada em 04/11/2026. A tela observada tinha três campos de texto; primário, secundário e terciário apareciam dentro do texto de ICP.

Referências públicas complementares: [geração de ICP pelo site](https://university.clay.com/docs/find-your-icp-based-on-your-domain) e [tradução de descrição em filtros revisáveis](https://university.clay.com/docs/search). As decisões de onboarding, vigência automática, permissões e atualização deste documento são requisitos acordados para a Althius, não afirmações sobre código interno do Clay.

Esta spec substitui o rascunho prematuro da conversa. Foi consolidada após a entrevista e a solicitação explícita de to-spec. A próxima etapa é decompor a implementação em tickets; esta entrega publica somente a spec no tracker local.
