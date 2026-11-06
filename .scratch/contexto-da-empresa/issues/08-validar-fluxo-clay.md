# 08: Validar o percurso completo e a qualidade das sugestões

**What to build:** Comprovar que o percurso do site aos resultados de Mercado funciona e que a configuração corresponde à referência Clay aprovada.

**Blocked by:** 07: Retirar o Playbook e concluir a transição

**Status:** ready-for-agent

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [ ] Executar ponta a ponta: onboarding → geração vigente → Configurações → filtros → busca → Aderência → uso pelos especialistas.
- [ ] Cobrir etapa pulada, leitura insuficiente, erro, edição manual, regeneração aceita/descartada e concorrência.
- [ ] Comparar visualmente com a tela AI Context observada: domínio, gerar, três campos e salvar; primário/secundários dentro do texto de ICP.
- [ ] Avaliar SaaS, indústria, consultoria, empresa nova, múltiplos perfis e site insuficiente com expectativas revisadas por pessoa e rubrica da spec.
- [ ] Registrar evidências e resultados por caso. Confundir empresa com compradores, inventar evidências ou criar restrição obrigatória sem base são falhas impeditivas.
- [ ] Confirmar correspondência texto/filtros, indicação de critérios pendentes e distinção entre erro e busca vazia.
- [ ] Confirmar preservação de empresas/histórico e funcionamento de Especialidades e Sequências; rodar os checks exigidos pelo projeto.
- [ ] Corrigir falhas locais dentro do escopo; registrar defeitos que exijam mudança nos contratos dos tickets anteriores antes de considerar a entrega pronta.

## Pode mexer

Testes de integração e ponta a ponta, fixtures de avaliação, evidências visuais e correções locais necessárias à conformidade com a spec.

## Não mexa

Novas funcionalidades, flexibilização de critérios de aceite, alteração da spec aprovada ou mudanças independentes de infraestrutura.

## Validação

Executar suíte e avaliação visual/qualitativa; publicar matriz de resultados e evidências, sem considerar apenas mocks suficientes para validar qualidade de geração.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.
