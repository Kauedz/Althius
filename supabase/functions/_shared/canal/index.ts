/** Contrato do Canal WhatsApp: a Edge Function conhece esta interface, nunca o fornecedor de entrega. */
export type ConteudoWhatsApp =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'audio'; midiaId: string; mimeType: string | null }
  | { tipo: 'botao'; id: string; titulo: string }
  | { tipo: 'outro'; tipoOriginal: string }

export interface PricingWhatsApp {
  billable: boolean | null
  pricingModel: string | null
  category: string | null
  type: string | null
}

export type EventoWhatsApp =
  | { tipo: 'mensagem'; id: string; de: string; recebidoEm: string; conteudo: ConteudoWhatsApp }
  | { tipo: 'status'; id: string; estado: string; atualizadoEm: string; pricing: PricingWhatsApp | null }

export type EnvioWhatsApp =
  | { tipo: 'texto'; para: string; texto: string }
  | { tipo: 'botoes'; para: string; texto: string; botoes: BotaoWhatsApp[] }
  | { tipo: 'template'; para: string; nome: string; idioma: string; parametros: string[]; categoria: 'autenticacao' | 'utilidade' }

export interface BotaoWhatsApp { id: string; titulo: string }
export interface MidiaWhatsApp { bytes: Uint8Array; mimeType: string | null }

export interface AdaptadorCanal {
  readonly modo: 'simulado' | 'cloud'
  normalizarWebhook(a: { corpo: string; assinatura: string | null; segredo?: string }): Promise<EventoWhatsApp[]>
  enviarTexto(a: { para: string; texto: string }): Promise<void>
  enviarBotoes(a: { para: string; texto: string; botoes: BotaoWhatsApp[] }): Promise<void>
  enviarTemplate(a: { para: string; nome: string; idioma: string; parametros: string[]; categoria: 'autenticacao' | 'utilidade' }): Promise<void>
  baixarMidia(id: string): Promise<MidiaWhatsApp>
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function iguaisEmTempoConstante(a: string, b: string): boolean {
  let diferenca = a.length ^ b.length
  const tamanho = Math.max(a.length, b.length)
  for (let i = 0; i < tamanho; i++) diferenca |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diferenca === 0
}

/** Confere X-Hub-Signature-256 (sha256=<hex>) contra os bytes originais do corpo. */
export async function assinaturaWhatsAppValida(a: { corpo: string; assinatura: string | null; segredo: string }): Promise<boolean> {
  if (!a.segredo || !a.assinatura || !/^sha256=[\da-f]{64}$/i.test(a.assinatura)) return false
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(a.segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const esperado = `sha256=${hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(a.corpo)))}`
  return iguaisEmTempoConstante(a.assinatura.toLowerCase(), esperado)
}

const texto = (value: unknown): string | null => typeof value === 'string' && value.length > 0 ? value : null
const objeto = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
const lista = (value: unknown): unknown[] => Array.isArray(value) ? value : []

function normalizarCorpo(corpo: string): EventoWhatsApp[] {
  let raiz: Record<string, unknown>
  try {
    const parsed = objeto(JSON.parse(corpo))
    if (!parsed) return []
    raiz = parsed
  } catch {
    return []
  }
  const eventos: EventoWhatsApp[] = []
  for (const entryValue of lista(raiz.entry)) {
    const entry = objeto(entryValue)
    for (const changeValue of lista(entry?.changes)) {
      const change = objeto(changeValue)
      const value = objeto(change?.value)
      for (const messageValue of lista(value?.messages)) {
        const message = objeto(messageValue)
        const id = texto(message?.id)
        const de = texto(message?.from)
        const recebidoEm = texto(message?.timestamp)
        const tipo = texto(message?.type) ?? 'unknown'
        if (!id || !de || !recebidoEm) continue
        let conteudo: ConteudoWhatsApp
        if (tipo === 'text') conteudo = { tipo: 'texto', texto: texto(objeto(message?.text)?.body) ?? '' }
        else if (tipo === 'audio') {
          const audio = objeto(message?.audio)
          conteudo = { tipo: 'audio', midiaId: texto(audio?.id) ?? '', mimeType: texto(audio?.mime_type) }
        } else if (tipo === 'interactive') {
          const interactive = objeto(message?.interactive)
          const reply = objeto(interactive?.button_reply)
          conteudo = reply
            ? { tipo: 'botao', id: texto(reply.id) ?? '', titulo: texto(reply.title) ?? '' }
            : { tipo: 'outro', tipoOriginal: tipo }
        } else conteudo = { tipo: 'outro', tipoOriginal: tipo }
        eventos.push({ tipo: 'mensagem', id, de, recebidoEm, conteudo })
      }
      for (const statusValue of lista(value?.statuses)) {
        const status = objeto(statusValue)
        const pricing = objeto(status?.pricing)
        const id = texto(status?.id)
        const estado = texto(status?.status)
        const atualizadoEm = texto(status?.timestamp)
        if (!id || !estado || !atualizadoEm) continue
        eventos.push({
          tipo: 'status', id, estado, atualizadoEm,
          pricing: pricing ? {
            billable: typeof pricing.billable === 'boolean' ? pricing.billable : null,
            pricingModel: texto(pricing.pricing_model),
            category: texto(pricing.category),
            type: texto(pricing.type),
          } : null,
        })
      }
    }
  }
  return eventos
}

class ErroCanal extends Error {
  constructor() {
    super('Não foi possível concluir a operação do Canal.')
    this.name = 'ErroCanal'
  }
}

export interface OpcoesSimulador {
  segredoWebhook?: string
  midias?: Record<string, MidiaWhatsApp>
}

/** Simulador usado por testes e desenvolvimento; mantém um histórico inspecionável dos envios. */
export function createCanalSimulado(opcoes: OpcoesSimulador = {}) {
  const envios: EnvioWhatsApp[] = []
  const midias = opcoes.midias ?? {}
  const adaptador: AdaptadorCanal = {
    modo: 'simulado',
    async normalizarWebhook({ corpo, assinatura, segredo = opcoes.segredoWebhook ?? '' }) {
      if (!await assinaturaWhatsAppValida({ corpo, assinatura, segredo })) throw new ErroCanal()
      return normalizarCorpo(corpo)
    },
    async enviarTexto(a) { envios.push({ tipo: 'texto', ...a }) },
    async enviarBotoes(a) { envios.push({ tipo: 'botoes', ...a, botoes: a.botoes.map((botao) => ({ ...botao })) }) },
    async enviarTemplate(a) { envios.push({ tipo: 'template', ...a, parametros: [...a.parametros] }) },
    async baixarMidia(id) {
      const midia = midias[id]
      if (!midia) throw new ErroCanal()
      return { bytes: midia.bytes.slice(), mimeType: midia.mimeType }
    },
  }
  return Object.assign(adaptador, { envios })
}

export interface OpcoesCloud {
  token: string
  phoneNumberId: string
  apiVersion: string
  segredoWebhook: string
  fetch?: typeof fetch
}

/** Adaptador direto da Cloud API. O token e o segredo ficam no servidor e nunca entram em mensagens de erro. */
export function createCanalCloud(opcoes: OpcoesCloud): AdaptadorCanal {
  const fetcher = opcoes.fetch ?? fetch
  const endpoint = `https://graph.facebook.com/${encodeURIComponent(opcoes.apiVersion)}/${encodeURIComponent(opcoes.phoneNumberId)}`
  async function postar(payload: Record<string, unknown>) {
    try {
      const resposta = await fetcher(`${endpoint}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opcoes.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      })
      if (!resposta.ok) throw new ErroCanal()
      await resposta.body?.cancel()
    } catch {
      throw new ErroCanal()
    }
  }
  return {
    modo: 'cloud',
    async normalizarWebhook({ corpo, assinatura }) {
      if (!await assinaturaWhatsAppValida({ corpo, assinatura, segredo: opcoes.segredoWebhook })) throw new ErroCanal()
      return normalizarCorpo(corpo)
    },
    enviarTexto: ({ para, texto }) => postar({ to: para, type: 'text', text: { body: texto } }),
    enviarBotoes: ({ para, texto, botoes }) => postar({
      to: para,
      type: 'interactive',
      interactive: { type: 'button', body: { text: texto }, action: { buttons: botoes.map(({ id, titulo }) => ({ type: 'reply', reply: { id, title: titulo } })) } },
    }),
    enviarTemplate: ({ para, nome, idioma, parametros }) => postar({
      to: para,
      type: 'template',
      template: { name: nome, language: { code: idioma }, components: parametros.length ? [{ type: 'body', parameters: parametros.map((text) => ({ type: 'text', text })) }] : [] },
    }),
    async baixarMidia(id) {
      try {
        const meta = await fetcher(`${endpoint.replace(/\/[^/]+$/, '')}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${opcoes.token}` } })
        if (!meta.ok) throw new ErroCanal()
        const result = objeto(await meta.json())
        const url = texto(result?.url)
        const mimeType = texto(result?.mime_type)
        if (!url || new URL(url).protocol !== 'https:') throw new ErroCanal()
        const media = await fetcher(url, { headers: { Authorization: `Bearer ${opcoes.token}` } })
        if (!media.ok) throw new ErroCanal()
        return { bytes: new Uint8Array(await media.arrayBuffer()), mimeType: media.headers.get('Content-Type') ?? mimeType }
      } catch {
        throw new ErroCanal()
      }
    },
  }
}

export type ConfiguracaoCanal =
  | { modo: 'desenvolvimento' }
  | { modo: 'cloud'; token: string; phoneNumberId: string; apiVersion: string; segredoWebhook: string; fetch?: typeof fetch }

/** Ponto único de seleção: desenvolvimento usa o simulador; produção precisa pedir Cloud explicitamente. */
export function criarAdaptadorCanal(config: ConfiguracaoCanal): AdaptadorCanal {
  if (config.modo === 'desenvolvimento') return createCanalSimulado()
  return createCanalCloud(config)
}

/** Configuração de runtime; sem modo explicitamente real, não há chamadas externas. */
export function adaptadorCanalDoAmbiente(env: Record<string, string | undefined> = Deno.env.toObject()): AdaptadorCanal {
  if (env.CANAL_WHATSAPP_MODE !== 'cloud') return criarAdaptadorCanal({ modo: 'desenvolvimento' })
  const { WHATSAPP_ACCESS_TOKEN: token, WHATSAPP_PHONE_NUMBER_ID: phoneNumberId, WHATSAPP_API_VERSION: apiVersion, WHATSAPP_APP_SECRET: segredoWebhook } = env
  if (!token || !phoneNumberId || !apiVersion || !segredoWebhook) throw new ErroCanal()
  return criarAdaptadorCanal({ modo: 'cloud', token, phoneNumberId, apiVersion, segredoWebhook })
}
