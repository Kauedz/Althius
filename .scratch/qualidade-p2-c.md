# Qualidade P2 — C: erros visíveis

Base: main 950261f. Branch: qualidade/erros-visiveis.

## Vermelho → verde

Vitest antes do código: deep link recebeu `/sinais/tipos/abertura-de-vagas` em vez de `/sinais/tipos/abertura-de-vagas/vagas-engenharia-de-dados`; editor, lista e Kanban não encontraram `role=alert` na falha. Depois: `npm test -- src/paginas/sinais/carregamento-e-erros.test.tsx src/paginas/sinais/monitoramento-real.test.tsx src/fonte/supabase-contas.test.ts`: **47/47 passaram**.

O contexto de Monitoramentos distingue carregando, falha e vazio, preserva a última leitura válida e ignora respostas antigas. Lista e editor usam a mesma leitura e o mesmo retry. O editor só redireciona após leitura bem-sucedida sem o registro. A Fonte de Contas propaga falha de estágios para a tela. O dublê compartilhado fornece estágios vazios saudáveis por padrão; erros explícitos continuam simuláveis.

## Outros fallbacks encontrados nas Fontes (inventário, sem alteração neste bloco)

Busca em `src/fonte/supabase-*.ts`, incluindo equivalentes `if (error)` e `new Map()`, além de catch com array/objeto:

| Fonte / função | Fallback / efeito |
| --- | --- |
| contas / responsavelAusente | catch retorna `{}`; oculta falha ao consultar participação do responsável. |
| contas / canaisDoWorkspace | erro retorna Map vazio; exibe só principal e bloqueia edição da lista incompleta. |
| contas / fotosDoWorkspace | erro retorna Map vazio; exibe iniciais. Degradação cosmética documentada. |
| contas / comiteDaConta | erro retorna `[]`; comitê pode parecer sem propostas. |
| sequencias / pausasPelaContaRemetente | erro/catch retorna Map vazio; perde motivo da pausa. |
| sequencias / anexosDisponiveis | catch retorna false; capacidade aparece indisponível. |
| sequencias / envios e respostas | `[]` para não titular ou erro 42501; fronteira de privacidade explícita, não falha genérica. |
| sinais / estadosDosSinaisReais | cada erro vira `[]`; catálogo pode aparentar em breve. |
| sinais / sinaisDisponiveis | catch retorna false; capacidade aparece indisponível. |
| sinais / lerSinaisDasContas | erro retorna null; preserva estado desconhecido, sem afirmar ausência de Sinais. |
| conversas / agentes ao reconhecer menções | catch retorna `[]`; pode deixar de reconhecer Agente. |
| conversas / conversasDisponiveis | catch retorna false; módulo aparece indisponível. |
| playbook / nomes | catch retorna Map vazio; perde nomes dos autores, preserva documento. |
| perfil / salvar | catch retorna null ao ler perfil anterior; fora de escopo por restrição do usuário. |
| aprovacoes / executar após decisão | catch retorna null; o reload precisa mostrar a situação persistida. |
| conexoes / mensagemDaFuncao | catch preserva mensagem genérica de erro; não vira vazio. |
| conexoes / integracoesFuturas | `[]` constante; ausência de implementação, sem catch. |

`return []` em normalização de anexos e IDs inválidos não mascara erro de leitura. Onboarding, perfil, canais e ritmo de envio não foram modificados.

## Publicação

Somente frontend. Nenhuma migration ou função. Aguardar os três jobs da CI; publicar pelo processo habitual após revisão. Sem merge automático.
