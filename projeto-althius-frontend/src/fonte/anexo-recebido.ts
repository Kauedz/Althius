// Como a tela mostra um anexo recebido. O arquivo vem do bucket privado por URL assinada e vira um Blob com um tipo
// escolhido aqui, de uma lista fechada: imagens comuns aparecem na página, PDF abre no leitor do navegador e o resto
// só baixa. HTML e SVG nunca viram um Blob exibível, porque um blob: roda com a origem do app.

export type FormaDoAnexo = 'imagem' | 'pdf' | 'baixar'

const IMAGENS: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}
const TIPOS_DE_IMAGEM = new Set(Object.values(IMAGENS))

function extensao(nome: string) {
  const ponto = nome.lastIndexOf('.')
  return ponto < 0 ? '' : nome.slice(ponto + 1).toLowerCase()
}

/** O tipo exibível do anexo, pelo tipo informado ou, quando ele é genérico ou falta, pela extensão do nome. */
export function tipoExibivel(anexo: { nome: string; mime?: string }): string | null {
  const informado = anexo.mime?.split(';')[0].trim().toLowerCase() ?? ''
  if (TIPOS_DE_IMAGEM.has(informado) || informado === 'application/pdf') return informado
  const generico = !informado || informado === 'application/octet-stream' || informado === 'binary/octet-stream'
  if (!generico) return null
  const ext = extensao(anexo.nome)
  if (IMAGENS[ext]) return IMAGENS[ext]
  return ext === 'pdf' ? 'application/pdf' : null
}

export function formaDoAnexo(anexo: { nome: string; mime?: string }): FormaDoAnexo {
  const tipo = tipoExibivel(anexo)
  if (!tipo) return 'baixar'
  return tipo === 'application/pdf' ? 'pdf' : 'imagem'
}

/** Busca o arquivo pela URL assinada e o devolve com o tipo decidido aqui, nunca com o que o servidor declarou. */
export async function carregarAnexo(url: string, anexo: { nome: string; mime?: string }): Promise<Blob> {
  const resposta = await fetch(url)
  if (!resposta.ok) throw new Error('Não foi possível carregar o anexo.')
  const bytes = await resposta.arrayBuffer()
  return new Blob([bytes], { type: tipoExibivel(anexo) ?? 'application/octet-stream' })
}
