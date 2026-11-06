# 05: Avaliar Aderência usando o novo contexto

**What to build:** Explicar o encaixe das empresas encontradas contra o contexto usado na busca, diferenciando incompatibilidade e falta de evidência.

**Blocked by:** 04: Buscar empresas com filtros derivados do contexto

**Status:** ready-for-agent

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [ ] Avaliação e explicação usam contexto e critérios rastreáveis, sem consultar ICP antigo como fallback.
- [ ] Critério atendido, não atendido e pendente são distinguíveis na explicação; dado ausente não conta como critério atendido.
- [ ] Requisito obrigatório sem verificação mantém Aderência não confirmada, compatível com o estado sem dado existente.
- [ ] Cada afirmação de encaixe apresenta evidência disponível; sinais de compra não garantem Fit.
- [ ] Critérios pendentes da busca permanecem visíveis até qualificação; identificar o que exige coleta posterior sem prometer dado inexistente.
- [ ] Novas avaliações usam a versão vigente e registram sua referência; resultados e histórico prévios não são reescritos em massa.

## Pode mexer

Avaliação e explicação de Aderência, apresentação nas empresas encontradas e contrato de critérios pendentes.

## Não mexa

Reclassificação em lote não solicitada, definição de Quente, motor de Sinais e regras de CRM.

## Validação

Testar empresas com encaixe, incompatibilidade, evidência parcial e dados ausentes; validar consistência entre filtros aplicados e explicação.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.
