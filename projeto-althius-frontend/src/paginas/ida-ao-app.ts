/** A ida do navegador à autorização no app de uma Integração: um objeto, para o teste observar sem sair da página. */
export const idaAoApp = { ir: (url: string) => window.location.assign(url) }
