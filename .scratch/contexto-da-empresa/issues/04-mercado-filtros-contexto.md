# 04: Buscar empresas com filtros derivados do contexto

**What to build:** Abrir Mercado com filtros derivados do ICP vigente, ajustá-los e executar uma busca real com os parâmetros suportados pela fonte.

**Blocked by:** 01: Contexto da empresa com os três textos, como no Clay

**Status:** in-review (implementado; falta publicar a Edge Function `account-discovery` e o PR)

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [x] Usar contexto manual salvo como caso inicial: não depender da geração do ticket 02.
- [x] Interpretar o texto livre sem exigir rótulos fixos; validar critérios estruturados no servidor e vincular cada critério ao texto e versão de origem.
- [x] Mostrar filtros editáveis antes de executar; ajustes locais não alteram os três textos salvos.
- [x] Distinguir setor, modelo de negócio, funcionários, porte cadastral e faturamento, bem como sede e atuação; não inventar intervalos de expressões ambíguas.
- [x] Traduzir para capacidades reais da fonte; informar critérios não suportados e verificação pendente, sem relaxar restrições silenciosamente.
- [x] Preservar conjunções de cada perfil; quando necessário, executar alternativas separadas e deduplicar, respeitando limites e custos existentes.
- [x] Registrar filtros executados, fonte e versão; novas operações usam versão atual e execuções já iniciadas preservam a referência original.
- [x] Distinguir ausência de contexto, falha de tradução, falha da fonte e zero resultados; não concluir inexistência de mercado.

## Pode mexer

Preparação e execução de busca de empresas, adaptadores das fontes existentes, interface de Mercado e rastreabilidade de busca.

## Não mexa

Editor narrativo de Configurações, novos fornecedores não necessários ao contrato, reclassificação automática da base e geração de Sequências.

## Validação

Testar texto salvo → prévia ajustável → parâmetros enviados → resultados, incluindo múltiplos ICPs, exclusões, unidades, critérios indisponíveis e troca de versão.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.

## Comments

- 2026-11-06: implementado na branch `contexto-da-empresa-03-onboarding`.
  - Servidor (`supabase/functions/account-discovery`): ação nova `prepare` (`preparacao.ts`) lê o contexto vigente com a sessão (`get_company_context`), pede à IA (mesmo motor da geração do contexto) critérios estruturados por perfil e confere tudo: o trecho tem de existir no texto salvo, o valor tem de sair do trecho, os números e a direção do intervalo ("até", "mais de") têm de estar no trecho, unidades ("mil", "milhões"), porte cadastral, CNAE e locais validados. Traduz para o que a fonte filtra (LinkedIn: setor, palavra-chave, faixas de funcionários, local; Receita: CNAE, porte cadastral, estado). O resto fica pendente com o motivo: sem suporte na fonte (modelo de negócio, faturamento, atuação), ambíguo ("médio porte"), faixa aproximada, local desconhecido. Estados distintos: `pronta`, `sem_contexto`, `falha_traducao`.
  - `search` com `perfis` + `contextoVersao`: recusa versão antiga (409 `contexto_mudou`), um recorte por perfil sem misturar conjunções, limite de empresas e teto de custo divididos entre os recortes, empresas repetidas juntadas, pendentes gravados como motivos "a verificar" (atende nulo, sem pesar na nota). O registro da busca (`discovery_runs.criteria`) guarda fonte, versão do contexto, filtros executados, origem no texto e pendentes de cada perfil. Sem migration.
  - Tela: diálogo por perfil com filtros editáveis, origem no texto e "Não aplicado pela fonte"; ajustes não tocam no contexto salvo. Aviso da última busca separa zero resultados de falha da fonte. A Demonstração continua no caminho antigo até o ticket 07.
  - Fica de fora: exclusões estruturadas ("exceto MEI") viram termo de exclusão; não há seletor de fonte no diálogo.
  - Testes: deno `preparacao.test.ts` (9) e `busca-por-perfis.test.ts` (7), suíte Deno 1977/0; vitest `busca-pelo-contexto.test.tsx` (7) e `supabase-descobertas.test.ts`; `tsc -b`, oxlint e deno lint limpos. Suíte vitest: as únicas falhas (`gaveta-de-historico.test.tsx` e, intermitente, `contexto-da-empresa-geracao.test.tsx`) também falham sem estas mudanças.
  - Passos do Nan: publicar `account-discovery` na [ordem de publicação da spec](../validacao.md#ordem-de-publicação).
    Nenhum segredo novo (usa `SIGNALS_LLM_PROVIDER` já configurado); nenhuma migration.
