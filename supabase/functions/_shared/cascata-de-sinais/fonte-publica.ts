// Ler uma fonte pública aberta (API oficial, dados abertos) com paciência: repete em 429/5xx/rede, respeita o limite de
// requisições da fonte (a API do Comex Stat aceita uma por 10 segundos) e nunca devolve o corpo de um erro. Nada de segredo
// passa por aqui: as fontes públicas abertas não têm chave.
export interface OpcoesDaLeitura {
  fetchFn?: typeof fetch
  /** Quantas vezes tenta além da primeira. */
  repeticoes?: number
  /** Espera antes de repetir (e entre duas leituras da mesma fonte), em ms. */
  esperaMs?: number
  dormir?: (ms: number) => Promise<void>
  init?: RequestInit
  /** Prazo de cada tentativa. */
  prazoMs?: number
}

const dormirDeVerdade = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export class ErroDeFontePublica extends Error {
  constructor(readonly status: number | null, mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeFontePublica'
  }
}

/** O JSON de uma URL pública. Lança `ErroDeFontePublica` (só com o status) quando não consegue. */
export async function lerJson(url: string, opcoes: OpcoesDaLeitura = {}): Promise<unknown> {
  const { fetchFn = fetch, repeticoes = 2, esperaMs = 10_000, dormir = dormirDeVerdade, init, prazoMs = 30_000 } = opcoes
  let ultimo = new ErroDeFontePublica(null, 'A fonte pública não respondeu.')
  for (let tentativa = 0; tentativa <= repeticoes; tentativa++) {
    if (tentativa > 0) await dormir(esperaMs)
    const controle = new AbortController()
    const relogio = setTimeout(() => controle.abort(), prazoMs)
    try {
      const resposta = await fetchFn(url, { ...init, signal: controle.signal })
      if (resposta.ok) {
        try {
          return await resposta.json()
        } catch {
          throw new ErroDeFontePublica(resposta.status, 'A fonte pública devolveu um corpo ilegível.')
        }
      }
      await resposta.body?.cancel()
      ultimo = new ErroDeFontePublica(resposta.status, `A fonte pública respondeu HTTP ${resposta.status}.`)
      // Erro de quem pede (exceto o limite de requisições) não melhora repetindo.
      if (resposta.status !== 429 && resposta.status < 500) throw ultimo
    } catch (e) {
      if (e instanceof ErroDeFontePublica) {
        if (e.status !== null && e.status !== 429 && e.status < 500) throw e
        ultimo = e
        continue
      }
      ultimo = new ErroDeFontePublica(null, 'A fonte pública não respondeu.')
    } finally {
      clearTimeout(relogio)
    }
  }
  throw ultimo
}
