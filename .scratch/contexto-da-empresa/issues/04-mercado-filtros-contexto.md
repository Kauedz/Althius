# 04: Buscar empresas com filtros derivados do contexto

**What to build:** Abrir Mercado com filtros derivados do ICP vigente, ajustá-los e executar uma busca real com os parâmetros suportados pela fonte.

**Blocked by:** 01: Contexto da empresa com os três textos, como no Clay

**Status:** ready-for-agent

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [ ] Usar contexto manual salvo como caso inicial: não depender da geração do ticket 02.
- [ ] Interpretar o texto livre sem exigir rótulos fixos; validar critérios estruturados no servidor e vincular cada critério ao texto e versão de origem.
- [ ] Mostrar filtros editáveis antes de executar; ajustes locais não alteram os três textos salvos.
- [ ] Distinguir setor, modelo de negócio, funcionários, porte cadastral e faturamento, bem como sede e atuação; não inventar intervalos de expressões ambíguas.
- [ ] Traduzir para capacidades reais da fonte; informar critérios não suportados e verificação pendente, sem relaxar restrições silenciosamente.
- [ ] Preservar conjunções de cada perfil; quando necessário, executar alternativas separadas e deduplicar, respeitando limites e custos existentes.
- [ ] Registrar filtros executados, fonte e versão; novas operações usam versão atual e execuções já iniciadas preservam a referência original.
- [ ] Distinguir ausência de contexto, falha de tradução, falha da fonte e zero resultados; não concluir inexistência de mercado.

## Pode mexer

Preparação e execução de busca de empresas, adaptadores das fontes existentes, interface de Mercado e rastreabilidade de busca.

## Não mexa

Editor narrativo de Configurações, novos fornecedores não necessários ao contrato, reclassificação automática da base e geração de Sequências.

## Validação

Testar texto salvo → prévia ajustável → parâmetros enviados → resultados, incluindo múltiplos ICPs, exclusões, unidades, critérios indisponíveis e troca de versão.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.
