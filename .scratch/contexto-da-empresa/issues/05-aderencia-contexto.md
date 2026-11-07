# 05: Avaliar Aderência usando o novo contexto

**What to build:** Explicar o encaixe das empresas encontradas contra o contexto usado na busca, diferenciando incompatibilidade e falta de evidência.

**Blocked by:** 04: Buscar empresas com filtros derivados do contexto

**Status:** in-review (implementado; falta aplicar a migration, publicar as Edge Functions e o PR)

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [x] Avaliação e explicação usam contexto e critérios rastreáveis, sem consultar ICP antigo como fallback.
- [x] Critério atendido, não atendido e pendente são distinguíveis na explicação; dado ausente não conta como critério atendido.
- [x] Requisito obrigatório sem verificação mantém Aderência não confirmada, compatível com o estado sem dado existente.
- [x] Cada afirmação de encaixe apresenta evidência disponível; sinais de compra não garantem Fit.
- [x] Critérios pendentes da busca permanecem visíveis até qualificação; identificar o que exige coleta posterior sem prometer dado inexistente.
- [x] Novas avaliações usam a versão vigente e registram sua referência; resultados e histórico prévios não são reescritos em massa.

## Pode mexer

Avaliação e explicação de Aderência, apresentação nas empresas encontradas e contrato de critérios pendentes.

## Não mexa

Reclassificação em lote não solicitada, definição de Quente, motor de Sinais e regras de CRM.

## Validação

Testar empresas com encaixe, incompatibilidade, evidência parcial e dados ausentes; validar consistência entre filtros aplicados e explicação.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.

## Comments

- 2026-11-07: implementado na branch `contexto-da-empresa-03-onboarding`.
  - Explicação (`supabase/functions/account-fit-explanation`): `avaliarAderencia` separa os motivos da busca em atende, não atende, sem dado e a verificar. Situação `atende` só com tudo verificado; algum critério que não bate é `nao_atende`; sem dado ou pendente, sem nada contra, é `nao_confirmada`; nada avaliado é `sem_dado`. O motivo "perfil" e os Sinais não contam; o "a verificar" é o mesmo texto que a busca gravou e a Caixa mostra. A resposta passa a trazer `situacao`, `criterios` e `contexto` (versão, perfis e trechos aplicados). O prompt leva os critérios e o contexto da busca, diz que Sinal de compra não confirma encaixe, e a conferência recusa texto que dê o encaixe por confirmado (ou "Aderência alta") quando a situação não é `atende`.
  - Migration `20261221030000_aderencia_pelo_contexto.sql`: `get_discovered_account_fit_explanation` lê o contexto do registro da busca (`discovery_runs.criteria`, origem `contexto_da_empresa`) e não lê mais `day0_companies.o_que_vende`. A impressão digital da explicação ganha a versão `contexto-v1`: explicações antigas deixam de valer na próxima leitura, sem apagar nem reescrever nada. pgTAP novo `aderencia_pelo_contexto.sql` (10). Duas asserções de `sem_icp_estruturado.sql` afirmavam o ICP do Day0 na explicação; foram trocadas pelo comportamento novo, com o mesmo `plan` (decisão a confirmar com o Nan: a regra é não alterar teste antigo, mas este afirmava justamente o que o ticket retira).
  - Busca (`account-discovery`): o pendente vira "A verificar na qualificação: Faturamento acima de R$ 10 mi (a fonte não traz esse dado)", com o que falta por motivo; o setor que bate mostra o setor declarado como evidência.
  - Tela: a fonte calcula `aderencia` pelos motivos; o selo vira "Encaixe não confirmado" (tom do sem dado) quando há critério sem dado ou pendente e nada contra, e não passa de médio quando um critério verificado não bate (Sinais não levam a alto); o detalhe mostra "A verificar na qualificação" sempre; "Por que essa Aderência?" mostra os grupos e a versão/trechos do contexto. A ordem da lista e o nível com Sinais não mudam.
  - Fica de fora: a empresa achada só por Sinal (sem critério avaliado) continua com o selo do nível da nota, como antes; a Demonstração segue no texto antigo.
  - Testes: deno `account-fit-explanation/handler.test.ts` (24), `busca-por-perfis.test.ts`, suíte Deno 1986/0; vitest `aderencia-pelo-contexto.test.tsx` (2), `aderencia-explicada.test.ts` (5), suíte 2162 com a falha conhecida de `gaveta-de-historico.test.tsx`; `tsc -b`, oxlint e `deno check` limpos. O pgTAP roda no CI (sem Docker na máquina).
  - Passos do Nan: aplicar a migration `20261221030000_aderencia_pelo_contexto.sql` (pelo fluxo de `docs/agents/migrations.md`) e publicar as duas funções:
    `npx supabase functions deploy account-fit-explanation --project-ref ycbdilsmydvzezhlymty`
    `npx supabase functions deploy account-discovery --project-ref ycbdilsmydvzezhlymty`
    Nenhum segredo novo.
