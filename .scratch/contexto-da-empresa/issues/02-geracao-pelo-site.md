# 02: Gerar contexto pelo site e revisar novas gerações

**What to build:** Informar o site em Configurações, gerar os três textos e controlar a substituição do contexto em leituras posteriores.

**Blocked by:** 01: Contexto da empresa com os três textos, como no Clay

**Status:** in-review (implementado; falta o PR passar no CI, aplicar a migration no remoto, publicar a Edge Function e avaliar com o modelo de verdade no ticket 08)

**Referência:** spec Contexto da empresa — experiência do AI Context do Clay, aprovada em 05/11/2026. Divisão aprovada para publicação em 06/11/2026.

## Critérios de aceite

- [x] Ler páginas pertinentes de oferta, sobre, soluções, clientes e casos; gerar Empresa, ICP e Personas coerentes e detalhados.
- [x] Primeira geração completa bem-sucedida fica vigente automaticamente; nova geração apresenta aceitar ou descartar ao Administrador.
- [x] Nova geração, descarte ou falha preservam a versão vigente até aceite; edição manual posterior ao início da leitura não é sobrescrita por resposta atrasada.
- [x] Mostrar andamento, falha, nova tentativa e alternativa de preenchimento manual. Site insuficiente não produz alegações inventadas.
- [x] Guardar fontes e versão de geração sem criar uma quarta seção; tratar inferências como sugestões, distinguindo empresa, compradores e clientes dos compradores.
- [x] Validar URLs e redirecionamentos para destinos públicos, limitar coleta e ignorar instruções contidas nas páginas.
- [x] Retentativas não duplicam persistência ou cobranças; reutilizar as regras de custo e infraestrutura compatíveis.
- [x] Incluir casos de SaaS, indústria, consultoria, negócio novo, múltiplos ICPs e site insuficiente na avaliação de geração.

## Pode mexer

Leitura de site, geração, estados e ações de sugestão em Configurações, armazenamento de procedência e testes relacionados.

## Não mexa

Formulários de filtros, aprovação por perfil, importação de conteúdo antigo e alteração das regras comerciais de cobrança.

## Validação

Testar com site e IA controlados: primeira geração, atualização, aceite, descarte, falha e concorrência; avaliar textos pela rubrica da spec.

Cada entrega mantém os checks aplicáveis verdes. Respeitar as regras de migrations e publicação do projeto. Documentar na entrega comandos PowerShell e ações humanas realmente necessários quando houver deploy ou atualização de banco; não inventar nomes de funções ou comandos antes da implementação.

## Execução

Implementar apenas após os bloqueadores. Consultar a spec completa e as regras do projeto. A coexistência técnica necessária durante a migração é temporária; a experiência final tem somente os três textos do Contexto. Não reutilizar dados do Playbook para preencher o novo conteúdo.

## Comments

- 2026-11-06: implementado na mesma branch do ticket 01.
  - Banco: `20261221010000_geracao_do_contexto_pelo_site.sql` cria `private.company_context_generations` (site, estado, versão-base, três textos sugeridos, páginas lidas, motor, versão do prompt, custo, motivo da falha) e as funções `start_company_context_generation` (só Administrador; grava o site informado; reaproveita a leitura em andamento), `finish_company_context_generation` (só `service_role`; a primeira resposta conta, repetição não grava), `accept_company_context_suggestion` e `discard_company_context_generation`. A primeira geração de um Workspace sem versão fica vigente; com versão, inclusive uma salva à mão durante a leitura, vira sugestão. Leitura sem resposta em 5 minutos vira falha. `get_company_context` foi redefinido a partir da definição do ticket 01 só para trazer a geração pendente.
  - Edge Function nova `company-context-generation` + `_shared/leitura-do-site.ts`: lê a home e até 5 páginas pertinentes (soluções, produtos, sobre, clientes, casos), só https no mesmo domínio, sem IP, porta ou credencial, redirecionamento só dentro do domínio, limites de tempo e tamanho; o texto das páginas vai marcado como dado e o prompt manda ignorar instruções nelas. Não cobra crédito (como a leitura do onboarding); o custo do motor fica registrado.
  - Tela: site editável pelo Administrador, Gerar, andamento (relê a cada 3 s), sugestão com Aceitar/Descartar, falha com o motivo, Tentar de novo e Dispensar; o rascunho não salvo não é perdido quando outra versão passa a valer.
  - Avaliação: seis casos fictícios (SaaS, indústria, consultoria, empresa nova, vários ICPs, site insuficiente) em `company-context-generation/__fixtures__/sites.ts` com rubrica automática; `scripts/avaliar-contexto-da-empresa.ts` roda com o modelo de verdade. Sem `OPENAI_API_KEY` nesta máquina, a avaliação com o modelo e a revisão humana ficam para o ticket 08.
  - Testes: pgTAP `geracao_do_contexto_pelo_site.sql` no remoto 31/31 (e o do ticket 01 continua 24/24 com as duas migrations); `deno test supabase/functions/company-context-generation` 18 passaram; vitest `contexto-da-empresa-geracao.test.tsx` (9) e `supabase-contexto-da-empresa.test.ts` (11).
  - Passos do Nan: publicar a função (`npx supabase functions deploy company-context-generation --project-ref ycbdilsmydvzezhlymty`). Nenhum segredo novo.
