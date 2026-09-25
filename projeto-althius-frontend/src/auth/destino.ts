/** A tela de acesso onde começa quem ainda não tem sessão. */
export const ROTA_DE_ENTRADA = '/entrar'

/** A tela de acesso onde o visitante cria a Conta de usuário. */
export const ROTA_DE_CADASTRO = '/cadastro'

/** O endereço de /entrar que lembra o `destino` que a pessoa tentou abrir, para voltar a ele depois do login. */
export function enderecoDeEntrada(destino: string): string {
  return destino === '/' ? ROTA_DE_ENTRADA : `${ROTA_DE_ENTRADA}?${new URLSearchParams({ destino })}`
}

/**
 * O endereço a abrir depois do login: o `destino` lembrado em /entrar ou /cadastro, se continuar nesta origem, ou o início. Fora
 * das telas de acesso, o endereço atual já é o destino.
 */
export function destinoDepoisDoAcesso(): string | null {
  if (window.location.pathname !== ROTA_DE_ENTRADA && window.location.pathname !== ROTA_DE_CADASTRO) return null
  const destino = new URLSearchParams(window.location.search).get('destino')
  if (!destino?.startsWith('/')) return '/'
  // `//outro.site` e `/\outro.site` também começam com barra; só vale o que continua na mesma origem.
  const url = new URL(destino, window.location.origin)
  return url.origin === window.location.origin ? url.pathname + url.search + url.hash : '/'
}
