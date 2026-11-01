// As telas da Demonstração e as fontes simuladas ficam fora do pacote principal: cada entrada as carrega por `import()`
// só quando vai mostrá-las (a equipe confirmada pelo banco, o visitante, o protótipo local). Quem não pode ver a
// Demonstração nunca baixa o código nem os dados de exemplo dela.

/** A Demonstração da equipe Althius, em /demonstracao. */
export const carregarDemonstracaoDaEquipe = () => import('./demonstracao-da-equipe')

/** A Demonstração só leitura do Workspace visitante. */
export const carregarDemonstracaoDoVisitante = () => import('./demonstracao-do-visitante')

/** A Demonstração sem login: o protótipo do desenvolvimento, ou o app sem Supabase configurado. */
export const carregarDemonstracaoSemLogin = () => import('./demonstracao-sem-login')
