# 08: Validar o percurso completo e a qualidade das sugestões

**What to build:** Comprovar que o percurso do site aos resultados de Mercado funciona e que a configuração corresponde à referência Clay aprovada.

**Blocked by:** 07: Retirar o Playbook e concluir a transição

**Status:** in-review (validação automatizada e visual feita; falta a avaliação com o modelo de verdade e a revisão humana — Passos do Nan em `validacao.md`)

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [x] Executar ponta a ponta: onboarding → geração vigente → Configurações → filtros → busca → Aderência → uso pelos especialistas.
- [x] Cobrir etapa pulada, leitura insuficiente, erro, edição manual, regeneração aceita/descartada e concorrência.
- [x] Comparar visualmente com a tela AI Context observada: domínio, gerar, três campos e salvar; primário/secundários dentro do texto de ICP.
- [ ] Avaliar SaaS, indústria, consultoria, empresa nova, múltiplos perfis e site insuficiente com expectativas revisadas por pessoa e rubrica da spec.
- [ ] Registrar evidências e resultados por caso. Confundir empresa com compradores, inventar evidências ou criar restrição obrigatória sem base são falhas impeditivas.
- [x] Confirmar correspondência texto/filtros, indicação de critérios pendentes e distinção entre erro e busca vazia.
- [x] Confirmar preservação de empresas/histórico e funcionamento de Especialidades e Sequências; rodar os checks exigidos pelo projeto.
- [x] Corrigir falhas locais dentro do escopo; registrar defeitos que exijam mudança nos contratos dos tickets anteriores antes de considerar a entrega pronta.

## Pode mexer

Testes de integração e ponta a ponta, fixtures de avaliação, evidências visuais e correções locais necessárias à conformidade com a spec.

## Não mexa

Novas funcionalidades, flexibilização de critérios de aceite, alteração da spec aprovada ou mudanças independentes de infraestrutura.

## Validação

Executar suíte e avaliação visual/qualitativa; publicar matriz de resultados e evidências, sem considerar apenas mocks suficientes para validar qualidade de geração.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.

## Comments

- 2026-11-07: validação feita na branch `contexto-da-empresa-03-onboarding`. Matriz de resultados e evidências em
  `.scratch/contexto-da-empresa/validacao.md`.
  - Novo teste Deno `supabase/functions/company-context-generation/percurso.test.ts` (3): site → três textos → filtros
    por perfil ligados ao trecho (inventado descartado, hipótese pendente) → ajuste que não toca o contexto → busca com
    versão registrada → Aderência "não confirmada" com o contexto da busca → as quatro Especialidades com os mesmos textos;
    filtros de versão antiga recusados; sem contexto, falha de tradução, busca vazia e fonte fora do ar distintos.
  - Avaliação: `conferirFiltros` (rubrica texto × filtros: número sem base, dado da empresa analisada como filtro dos
    compradores, recorte sem setor) nos fixtures e no `avaliacao.test.ts`; `scripts/avaliar-contexto-da-empresa.ts` passa o
    ICP gerado pela preparação real do Mercado e grava um relatório com `--saida`.
  - Conferência visual na Demonstração (Playwright, 1400×900, sem erro no console):
    `issues/prints/08-onboarding-site.jpg`, `08-onboarding-checklist.jpg`, `08-configuracoes-contexto.jpg`,
    `08-icp-primario-e-secundario.jpg`, `08-salvar.jpg`, `08-nova-sugestao.jpg`, `08-filtros-do-mercado.jpg`,
    `08-filtros-pendentes.jpg`, `08-aderencia-a-verificar.jpg`, `08-agente-com-contexto.jpg`.
  - Checks: `deno test supabase/functions` 1971/0 (depois das correções da revisão, a pasta `company-context-generation`
    22/0); `deno check` limpo; oxlint sem erro (só avisos antigos); `tsc -b` limpo; vitest 244 arquivos, 2106/0 (uma
    primeira rodada teve 1 falha que não se repetiu, com outra suíte rodando em paralelo na máquina). pgTAP no CI.
  - Nenhum defeito encontrado nos tickets 01–07. Sem migration nem função nova.
  - Falta (Passos do Nan em `validacao.md`): revisar as expectativas dos seis casos, rodar a avaliação com o modelo de
    verdade e preencher a tabela da seção 4; opcionalmente conferir a tela do Clay com a conta do Clay.
