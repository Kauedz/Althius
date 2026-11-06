// Leitura segura do site de uma empresa (contexto-da-empresa, ticket 02): a página inicial e as páginas pertinentes
// que ela liga — soluções, produtos, sobre, clientes, casos. Só https, só o mesmo domínio (ou o `www.` dele), sem IP,
// porta nem credencial na URL; redirecionamentos limitados ao mesmo domínio; prazo, tamanho e quantidade de páginas
// limitados. O texto devolvido é conteúdo de referência: quem o usa nunca executa o que estiver escrito nele.

export const LIMITES_DA_LEITURA = {
  esperaPorPaginaMs: 8_000,
  bytesPorPagina: 512 * 1024,
  textoPorPagina: 8_000,
  textoTotal: 28_000,
  redirecionamentos: 3,
  paginasExtras: 5,
} as const

const DOMINIO = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

/** O domínio como o cadastro guarda: minúsculo, sem protocolo, caminho nem barra. Nulo quando não é um domínio. */
export function normalizarDominio(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null
  const host = bruto.trim().toLowerCase().replace(/^https?:\/\//, '').split(/[/?#]/)[0].replace(/\.$/, '')
  if (!DOMINIO.test(host)) return null
  // Nomes que só existem dentro de uma rede não são site público.
  if (/(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return null
  return host
}

/** Uma URL só vale no mesmo domínio ou no `www.` dele, sempre em https e sem porta nem credencial. */
export function urlPermitida(destino: URL, dominio: string): boolean {
  const base = dominio.replace(/^www\./, '')
  return destino.protocol === 'https:' && !destino.port && !destino.username && !destino.password &&
    (destino.hostname === base || destino.hostname === `www.${base}`)
}

/** O texto visível da página: título, descrição e corpo, sem scripts, estilos nem tags, dentro do limite. */
export function textoDaPagina(html: string, limite: number = LIMITES_DA_LEITURA.textoPorPagina): string {
  const titulo = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''
  const descricao = html.match(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? ''
  const corpo = html
    .replace(/<head\b[\s\S]*?<\/head>/i, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
  return [titulo, descricao, corpo].join(' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&lt;|&gt;/gi, ' ')
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    // Ninguém fecha a moldura de dentro: as marcas que delimitam o site para o motor saem do texto.
    .replace(/<\/?\s*(site|pagina)\b[^>]*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limite)
}

const PERTINENTES = [
  'solucoes', 'solucao', 'solutions', 'solution', 'produtos', 'produto', 'products', 'product', 'plataforma', 'platform',
  'servicos', 'servico', 'services', 'service', 'sobre', 'about', 'quem-somos', 'empresa', 'company',
  'clientes', 'customers', 'clients', 'cases', 'casos', 'case-studies', 'historias', 'success', 'segmentos',
  'industrias', 'industries', 'mercados', 'para-',
]

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** As páginas pertinentes que a página inicial liga, no mesmo domínio, na ordem em que aparecem e sem repetir. */
export function paginasPertinentes(html: string, base: URL, dominio: string, maximo: number = LIMITES_DA_LEITURA.paginasExtras): URL[] {
  const vistas = new Set<string>([base.pathname.replace(/\/$/, '') || '/'])
  const achadas: URL[] = []
  for (const [, href] of html.matchAll(/<a\b[^>]*href=["']([^"'#]+)["']/gi)) {
    let url: URL
    try {
      url = new URL(href, base)
    } catch {
      continue
    }
    if (!urlPermitida(url, dominio)) continue
    if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|docx?|xlsx?)$/i.test(url.pathname)) continue
    const caminho = url.pathname.replace(/\/$/, '') || '/'
    if (vistas.has(caminho)) continue
    let legivel = caminho
    try {
      legivel = decodeURIComponent(caminho)
    } catch {
      // Caminho com codificação quebrada: compara como veio.
    }
    const partes = semAcento(legivel).split('/').filter(Boolean)
    if (partes.length === 0 || partes.length > 3) continue
    if (!partes.some((parte) => PERTINENTES.some((chave) => parte === chave || parte.startsWith(chave)))) continue
    vistas.add(caminho)
    url.search = ''
    url.hash = ''
    achadas.push(url)
    if (achadas.length >= maximo) break
  }
  return achadas
}

/** Lê uma página seguindo no máximo 3 redirecionamentos dentro do mesmo domínio. Nulo em qualquer falha. */
export async function lerHtml(inicio: URL, dominio: string, fetchFn: typeof fetch): Promise<{ url: URL; html: string } | null> {
  let url = inicio
  for (let salto = 0; salto <= LIMITES_DA_LEITURA.redirecionamentos; salto++) {
    if (!urlPermitida(url, dominio)) return null
    const resposta = await fetchFn(url.toString(), {
      redirect: 'manual',
      signal: AbortSignal.timeout(LIMITES_DA_LEITURA.esperaPorPaginaMs),
      headers: { Accept: 'text/html', 'User-Agent': 'AlthiusBot/1.0 (+leitura do site para o Contexto da empresa)' },
    })
    if (resposta.status >= 300 && resposta.status < 400) {
      await resposta.body?.cancel()
      const local = resposta.headers.get('Location')
      if (!local) return null
      url = new URL(local, url)
      continue
    }
    if (!resposta.ok || !resposta.body) {
      await resposta.body?.cancel()
      return null
    }
    const tipo = resposta.headers.get('Content-Type') ?? ''
    if (tipo && !/text\/html|application\/xhtml/i.test(tipo)) {
      await resposta.body.cancel()
      return null
    }
    const leitor = resposta.body.getReader()
    const partes: Uint8Array[] = []
    let total = 0
    while (total < LIMITES_DA_LEITURA.bytesPorPagina) {
      const { done, value } = await leitor.read()
      if (done) break
      partes.push(value)
      total += value.byteLength
    }
    await leitor.cancel().catch(() => {})
    const bytes = new Uint8Array(Math.min(total, LIMITES_DA_LEITURA.bytesPorPagina))
    let posicao = 0
    for (const parte of partes) {
      const pedaco = parte.subarray(0, bytes.length - posicao)
      bytes.set(pedaco, posicao)
      posicao += pedaco.length
      if (posicao >= bytes.length) break
    }
    return { url, html: new TextDecoder().decode(bytes) }
  }
  return null
}

export interface PaginaLida {
  url: string
  texto: string
}

/**
 * A página inicial e as pertinentes que ela liga, cada uma com o texto visível, dentro do limite total. Uma página que
 * falha é pulada; sem a página inicial, não há leitura (lista vazia).
 */
export async function lerSite(dominio: string, fetchFn: typeof fetch): Promise<PaginaLida[]> {
  const inicial = await lerHtml(new URL(`https://${dominio}/`), dominio, fetchFn).catch(() => null)
  if (!inicial) return []
  const lidas: PaginaLida[] = []
  let restante: number = LIMITES_DA_LEITURA.textoTotal
  const guardar = (url: URL, html: string) => {
    const texto = textoDaPagina(html, Math.min(LIMITES_DA_LEITURA.textoPorPagina, restante))
    if (!texto) return
    lidas.push({ url: url.toString(), texto })
    restante -= texto.length
  }
  guardar(inicial.url, inicial.html)
  for (const url of paginasPertinentes(inicial.html, inicial.url, dominio)) {
    if (restante <= 200) break
    const pagina = await lerHtml(url, dominio, fetchFn).catch(() => null)
    if (pagina) guardar(pagina.url, pagina.html)
  }
  return lidas
}
