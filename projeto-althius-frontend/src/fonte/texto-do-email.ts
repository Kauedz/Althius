// O texto de uma resposta recebida, para a tela: o Outlook e o Gmail mandam o corpo em HTML, com estilos, a
// assinatura e o histórico citado ("De: … Enviado: …"). A tela mostra só o texto do que o Contato escreveu. O HTML
// é lido pelo DOMParser e nunca inserido na página: só o texto sai daqui.

/** Onde começa o histórico citado nos clientes de e-mail mais comuns. */
const INICIO_DA_CITACAO = [
  '#appendonsend', // Outlook: marcador antes do cabeçalho "De: … Enviado: …"
  '#divRplyFwdMsg', // Outlook: cabeçalho da mensagem respondida
  '.gmail_quote', // Gmail
  '.yahoo_quoted', // Yahoo
  'blockquote[type="cite"]', // Apple Mail, Thunderbird
].join(', ')

const BLOCOS = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'TABLE', 'UL', 'OL'])

/** Remove o nó e tudo o que vem depois dele no documento. */
function cortarAPartirDe(no: Node, raiz: Node) {
  let atual: Node | null = no
  while (atual && atual !== raiz) {
    let irmao = atual.nextSibling
    while (irmao) {
      const proximo = irmao.nextSibling
      irmao.parentNode?.removeChild(irmao)
      irmao = proximo
    }
    const pai: Node | null = atual.parentNode
    if (atual === no) pai?.removeChild(atual)
    atual = pai
  }
}

function textoDe(no: Node): string {
  if (no.nodeType === Node.TEXT_NODE) return (no.textContent ?? '').replace(/\s+/g, ' ')
  if (!(no instanceof Element)) return ''
  if (no.tagName === 'BR') return '\n'
  const dentro = Array.from(no.childNodes, textoDe).join('')
  return BLOCOS.has(no.tagName) ? `\n${dentro}\n` : dentro
}

/** O texto que o Contato escreveu, sem HTML e sem o histórico citado. Texto puro volta como veio, aparado. */
export function textoDaResposta(corpo: string): string {
  if (!/<\/?[a-z][^>]*>/i.test(corpo)) return corpo.trim()
  const documento = new DOMParser().parseFromString(corpo, 'text/html')
  for (const elemento of Array.from(documento.querySelectorAll('head, style, script, title'))) elemento.remove()
  const citacao = documento.body.querySelector(INICIO_DA_CITACAO)
  if (citacao) cortarAPartirDe(citacao, documento.body)
  return textoDe(documento.body)
    .replace(/ /g, ' ')
    .split('\n')
    .map((linha) => linha.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
