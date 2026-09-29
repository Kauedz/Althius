// O Actor do Apify que devolve a foto pública de um perfil LinkedIn. Roda pelo endpoint síncrono
// `POST /v2/acts/{actor}/run-sync-get-dataset-items`, com o token no cabeçalho Authorization (fora da URL e dos logs).
// A entrada vem de um modelo JSON configurável e a saída é lida com tolerância: todo campo do perfil é opcional, e
// só a URL da imagem interessa. O Actor padrão e o formato de entrada NÃO foram conferidos contra a documentação do
// Apify (ver README): por isso os dois são configuráveis por segredo.
import { type Actor, ActorRequestError, ActorTimeoutError, type FotoDoPerfil } from './handler.ts'

/** O Actor padrão e o modelo de entrada padrão; ambos sobrescritos por APIFY_PHOTO_ACTOR_ID e APIFY_PHOTO_INPUT. */
export const ACTOR_PADRAO = 'harvestapi~linkedin-profile-scraper'
export const ENTRADA_PADRAO = '{"publicIdentifiers":["{{identifier}}"]}'

/** Os campos onde os Actors costumam pôr a imagem do perfil, do mais provável ao menos. */
const CAMPOS_DA_FOTO = ['photo', 'profilePicture', 'profilePictureUrl', 'pictureUrl', 'avatar', 'imageUrl']

/** `usuario/actor` e `usuario~actor` valem; o endpoint pede o til. */
export function caminhoDoActor(actorId: string): string {
  return actorId.trim().replace('/', '~')
}

/** O identificador do perfil na URL `https://www.linkedin.com/in/<perfil>`; a URL inteira quando não bate. */
export function identificadorDoPerfil(linkedinUrl: string): string {
  return linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/i)?.[1] ?? linkedinUrl
}

/**
 * O corpo da execução: o modelo JSON com `{{url}}` e `{{identifier}}` trocados nos textos. A troca é feita nos valores
 * já interpretados, então uma URL nunca quebra o JSON. Lança quando o modelo não é JSON.
 */
export function montarEntrada(modelo: string, linkedinUrl: string): unknown {
  const valores = { url: linkedinUrl, identifier: identificadorDoPerfil(linkedinUrl) }
  const trocar = (no: unknown): unknown => {
    if (typeof no === 'string') {
      return no.replace(/\{\{(url|identifier)\}\}/g, (_, chave: 'url' | 'identifier') => valores[chave])
    }
    if (Array.isArray(no)) return no.map(trocar)
    if (no && typeof no === 'object') return Object.fromEntries(Object.entries(no).map(([k, v]) => [k, trocar(v)]))
    return no
  }
  return trocar(JSON.parse(modelo))
}

/** Um campo de imagem pode vir como texto ou como objeto com `url`. */
function textoDaImagem(valor: unknown): string | null {
  if (typeof valor === 'string') return valor
  if (valor && typeof valor === 'object') {
    const url = (valor as Record<string, unknown>).url
    return typeof url === 'string' ? url : null
  }
  return null
}

/** A URL da imagem no primeiro item do dataset, ou null: item ausente, sem imagem ou com erro do Actor. */
export function fotoDoItem(itens: unknown): string | null {
  const item = Array.isArray(itens) ? itens[0] : null
  if (!item || typeof item !== 'object') return null
  for (const campo of CAMPOS_DA_FOTO) {
    const url = textoDaImagem((item as Record<string, unknown>)[campo])
    if (url) return url
  }
  return null
}

export interface OpcoesDoApify {
  token: string
  actorId?: string
  /** Modelo JSON da entrada do Actor, com {{url}} e {{identifier}}. */
  entrada?: string
  /** Teto de cobrança de uma execução, em dólares; o Apify aborta a execução ao atingi-lo. */
  maxTotalChargeUsd?: number
  fetchFn?: typeof fetch
  /** Prazo da execução no Apify, em segundos. */
  runTimeoutSeconds?: number
  /** Prazo da chamada HTTP; um pouco maior que o da execução, para o Apify responder o próprio timeout. */
  timeoutMs?: number
}

export function apifyPhotoActor(
  {
    token,
    actorId = ACTOR_PADRAO,
    entrada = ENTRADA_PADRAO,
    maxTotalChargeUsd = 0.05,
    fetchFn = fetch,
    runTimeoutSeconds = 60,
    timeoutMs = 75_000,
  }: OpcoesDoApify,
): Actor {
  return {
    actorId,
    async fetchPhoto(linkedinUrl): Promise<FotoDoPerfil> {
      const consulta = new URLSearchParams({
        timeout: String(runTimeoutSeconds),
        limit: '1',
        maxItems: '1',
        maxTotalChargeUsd: String(maxTotalChargeUsd),
      })
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const resposta = await fetchFn(
          `https://api.apify.com/v2/acts/${
            encodeURIComponent(caminhoDoActor(actorId))
          }/run-sync-get-dataset-items?${consulta}`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(montarEntrada(entrada, linkedinUrl)),
            signal: controller.signal,
          },
        )
        // 408: a execução síncrona passou do prazo. O corpo de uma recusa pode citar o perfil: só a mensagem curta segue.
        if (resposta.status === 408) throw new ActorTimeoutError()
        const corpo = await resposta.json().catch(() => null)
        if (!resposta.ok) {
          const mensagem = (corpo as { error?: { message?: unknown } } | null)?.error?.message
          throw new ActorRequestError(resposta.status, typeof mensagem === 'string' ? mensagem.slice(0, 200) : '')
        }
        return { photoUrl: fotoDoItem(corpo), runId: resposta.headers.get('x-apify-run-id') }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw new ActorTimeoutError()
        throw error
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
