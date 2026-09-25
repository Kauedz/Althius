export const ROTA_DE_ENTRADA = '/entrar'

/**
 * O endereço a abrir depois do login: o `destino` guardado pela tela de acesso, se for um caminho deste app, ou o
 * início. Fora das telas de acesso, o endereço atual já é o destino.
 */
export function destinoDepoisDoAcesso(): string | null {
  if (window.location.pathname !== ROTA_DE_ENTRADA) return null
  const destino = new URLSearchParams(window.location.search).get('destino')
  if (!destino?.startsWith('/')) return '/'
  // `//outro.site` e `/\outro.site` também começam com barra; só vale o que continua na mesma origem.
  const url = new URL(destino, window.location.origin)
  return url.origin === window.location.origin ? url.pathname + url.search + url.hash : '/'
}
